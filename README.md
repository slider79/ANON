## ANON – Anonymous Network Of Nodes (Implementation Overview)

This repo contains a working prototype implementation of the **ANON** system described in `ANON_README.md`.

It includes:

- **Backend API** (Node.js + Express)
- **Reputation and trust engine** (EigenTrust-style)
- **Rate-limited mana system**
- **P2P gossip + simplified DHT** (WebSocket-based)
- **Browser client UI** (served by the backend)
- **Observability endpoints and runbook**

---

## 1. What’s Implemented

### 1.1 Backend API

Main HTTP routes (all under `/api`):

- **Identity & Onboarding**
  - `POST /auth/register` – simulate blind-token email oracle (issues one-time token per email hash).
  - `POST /auth/onboard` – consumes token + client “public key” and creates an anonymous user (`id = SHA256(pubKey)`).

- **Rumors & Votes (DAG)**
  - `POST /rumors` – create a rumor node (max 500 chars, costs 50 Mana).
  - `POST /rumors/:id/votes` – create a vote/dispute node on a rumor (vote = +1 / -1, costs 5 Mana).

- **Feed & Consensus**
  - `GET /feed` – global rumor feed with:
    - EigenTrust-weighted trust scores
    - Exponential time decay
    - State classification: `VERIFIED`, `DISPUTED`, `NEUTRAL`.
  - `POST /consensus/tick` – triggers a reputation recompute + feed refresh (also runs periodically in background).

- **Mana**
  - `GET /users/:id/mana` – returns current mana for a user, with regeneration (1 mana/min, capped at 100).

- **P2P / DHT / DAG (debug)**
  - `GET /network/status` – node ID, known peers, active WS connections.
  - `POST /network/connect` – connect to a peer by WebSocket URL (e.g. `ws://host:5000/p2p`).
  - `GET /dht/get/:key` – fetch a key from the local + remote DHT.
  - `POST /dht/put` – store a key into the DHT across the k-closest peers.
  - `GET /dag/:id` – fetch a DAG node (locally or via DHT key `dag:<id>`).

- **Health**
  - `GET /health` – simple JSON health check.

### 1.2 Data Model

- **Users (`models/userStore.js`)**
  - Anonymous users keyed by SHA256(publicKey).
  - Fields: `id`, `publicKey`, `reputation`, `mana`, `lastManaUpdate`.
  - Email “oracle”:
    - Keeps only SHA256(email) hashes to enforce *one token per email*.
    - Tokens are random UUIDs, consumed once on onboarding.

- **DAG (`models/dagStore.js`)**
  - In-memory Directed Acyclic Graph:
    - `RUMOR` nodes: `id`, `authorId`, `text`, `parentId`, `timestamp`.
    - `VOTE` nodes: `parentId` (rumor), `voterId`, `vote` (+1/-1), `evidence?`.
  - No deletes; new nodes only, matching the *immutable history* design.

### 1.3 Reputation & Trust (EigenTrust)

Implemented in `services/trustService.js`:

- Builds a **trust matrix `C`** from vote agreement:
  - For each pair of voters (i, j), counts how often they agree on the same rumor.
  - Row-normalizes to get `C_ij` = local trust from i → j.
- Computes global reputation via iterative eigenvector:
  - `t_(k+1) = C^T * t_k`, with normalization each step.
  - Result `t` gives per-user reputation.
- Rumor scores:
  - Weighted average of votes:
    - numerator = Σ (vote_i × reputation_i)
    - denominator = Σ (reputation_i)
  - Exponential time decay:
    - `score = base × e^(-λ·Δt_hours)` with `λ = 0.03`.
  - Thresholds:
    - `score > 0.7` → `VERIFIED`
    - `score < 0.3` → `DISPUTED`
    - else `NEUTRAL`.
- Background consensus:
  - Runs every 5 minutes via `setInterval`.
  - Optional logs when `TRUST_DEBUG=1`.

### 1.4 Mana / Rate Limiting

Implemented in `models/userStore.js` and `services/manaService.js`:

- Each user has:
  - Initial mana: 100
  - Max mana: 100
  - Regen: 1 per minute.
- Costs:
  - Post rumor: 50 mana.
  - Vote: 5 mana.
- Used to block spam / bot-like behavior, aligning with “token bucket” design in the spec.

### 1.5 P2P Networking & DHT

Implemented in `services/p2pService.js`, `services/dhtService.js`, `models/peerStore.js`, `services/nodeIdentityService.js`:

- **Node Identity**
  - Each backend instance has its own Ed25519 keypair, persisted under `.anon/` (or `NODE_STATE_DIR`).
  - Node ID = SHA256(nodePublicKey).

- **WebSocket Transport**
  - WS server mounted at `/p2p` on the same port as HTTP.
  - Messages are JSON and **signed** (Ed25519) by the node.
  - Message types:
    - `HELLO` + `PEERS` for peer discovery.
    - `GOSSIP` for DAG node spreading.
    - `DHT_STORE`, `DHT_FIND_VALUE`, `DHT_VALUE` for DHT operations.

- **Gossip**
  - New DAG nodes (rumors/votes) call `p2pService.gossipDagNode(node)`:
    - Stores under DHT key `dag:<id>`.
    - Broadcasts `GOSSIP` with TTL `GOSSIP_TTL` and fanout `GOSSIP_FANOUT`.
    - Uses `seenMessages` map to avoid re-broadcast loops.

- **Simplified DHT**
  - Local store (`Map`) keyed by arbitrary strings:
    - e.g. `dag:<nodeId>`, `test:foo`.
  - Distance metric:
    - XOR distance on first 16 bytes of `SHA256(key)` vs peer IDs.
  - `dhtPut(key, value)`:
    - Stores locally and sends `DHT_STORE` to the *k closest peers* to the key’s hash.
  - `dhtGet(key)`:
    - Checks local store; if absent, queries the closest peers with `DHT_FIND_VALUE`.
    - On response, caches value locally.

This is a **Kademlia-inspired** store/get, not a full multi-hop routing DHT, but enough to share data across peers.

---

## 2. Frontend Client (UI)

The backend serves a small single-page app from `public/`:

- `public/index.html`
  - Modern dark UI with three main panels:
    - **Identity & Mana** – onboarding and node status.
    - **New Rumor** – composer with character counter, mana info.
    - **Global Rumor Feed** – list of rumors with scores and vote buttons.
  - Header shows:
    - Online/offline status.
    - Node ID short form.
    - Peer count.

- `public/ui.js`
  - Onboarding flow:
    - User enters email, calls `POST /api/auth/register`.
    - UI generates a random “publicKey” and calls `POST /api/auth/onboard`.
    - Stores user object in `localStorage` for persistence.
  - Feed:
    - Fetches `GET /api/feed` regularly.
    - Displays:
      - Rumor text, author hash (short), timestamp.
      - Reputation-weighted score with color bar.
      - State badge: VERIFIED / DISPUTED / NEUTRAL.
  - Actions:
    - Post rumor (50 mana).
    - Vote up/down on rumors (5 mana per vote).
    - Refresh button for manual sync.
  - Network status:
    - Uses `/api/network/status` to show node ID + number of peers.
  - Mana:
    - Fetches `/api/users/:id/mana` and surfaces the balance.
  - Auto-refresh:
    - Every ~15 seconds, refreshes network status, mana, and feed.

This covers the key **Use Cases** 1–3 from the spec in a browser-friendly form.

---

## 3. Observability & Debugging

Additional endpoints (all under `/api`):

- **Reputations**
  - `GET /debug/reputations`
    - Returns list of users with `id`, `reputation`, and `mana`.

- **Trust Matrix**
  - `GET /debug/trust`
    - Returns:
      - `users`: list of user IDs + reputations.
      - `matrix`: for each user, the row of `C_ij` plus raw agree/total counts.

- **Rumors**
  - `GET /debug/rumors`
    - Returns `{ count, items }` where `items` are the same as `/feed`.

- **DHT State**
  - `GET /debug/dht`
    - Returns the keys stored locally in the DHT.

- **P2P Logs**
  - When `P2P_DEBUG=1`, logs incoming P2P message types to the console.
  - When `TRUST_DEBUG=1`, logs each consensus tick with counts of users/rumors.

For multi-node P2P testing, see `P2P_RUNBOOK.md`.

---

## 4. How to Run

1. **Install dependencies**

```bash
cd R:\shujalele
npm install
```

2. **Start a single node**

```bash
npm start
```

Then open `http://localhost:5000` in your browser to use the UI.

3. **Run multiple nodes (local P2P)**

See `P2P_RUNBOOK.md` for detailed PowerShell-based instructions:

- Start nodes on different ports with their own `NODE_STATE_DIR` and `ADVERTISE_URL`.
- Use `POST /api/network/connect` to connect nodes.
- Post a rumor on one node; observe it appearing on others via gossip / DHT.

---

## 5. What’s Missing vs `ANON_README.md`

This implementation is a **hackathon-grade prototype** faithful to the design but with some deliberate simplifications:

- **Blind Signatures & Cryptography**
  - Email oracle is simulated:
    - Uses random tokens + SHA256(email), but *no actual blind-signature scheme*.
  - Client “public keys” are random strings in the UI:
    - Backend uses them only to derive a stable anonymous ID.
  - No zero-knowledge proofs or advanced anonymity primitives.

- **Full P2P & DHT Realism**
  - P2P network is:
    - Single-process Node instances communicating over WebSockets.
    - Kademlia-inspired DHT store/get, but **no full iterative routing** (`FIND_NODE`, multi-hop).
  - No NAT traversal (STUN/TURN), onion routing, or network-level privacy.

- **Consensus Layer**
  - Uses EigenTrust-based reputation and time-decayed scores.
  - Does **not** implement a full BFT consensus engine (e.g., Tendermint-style 2/3-majority state machine replication).
  - No cross-shard/cross-campus federation.

- **Security Hardening**
  - Basic validation and signatures on P2P messages.
  - Missing:
    - Formal Sybil-resistance proofs in the implementation.
    - Rate-limited connection attempts / DoS throttling.
    - Message padding / traffic-analysis resistance.

- **Offline-First & Mobile PWA**
  - UI is single-page and uses `localStorage` for identity.
  - Not yet:
    - A registered service worker.
    - Full offline queueing of actions.
    - Installable PWA metadata.

- **Graph Visualization**
  - The spec calls for a DAG visualization.
  - Current UI shows a ranked list feed with scores, but **no graph drawing** yet.

- **Advanced Features from “Future Enhancements”**
  - No ML/NLP, no ZK-SNARK integration, no tokenomics/incentive layer, no human appeal process.

---

## 6. Summary

This repo gives you:

- A running **backend** that embodies the core math and mechanics of ANON:
  - Anonymous-ish enrollment via tokens.
  - DAG-based rumor/vote storage.
  - Reputation-weighted, decayed trust scores (EigenTrust).
  - Mana-based rate limiting.
  - WebSocket P2P + simple DHT + gossip.
- A **frontend** that demonstrates:
  - Joining the network.
  - Posting rumors.
  - Voting, and seeing scores update over time.
  - Inspecting basic network status.

It stops short of a production-grade, fully decentralized system, but it’s a solid, inspectable foundation that matches the hackathon specification closely and can be iterated toward the full ANON vision.


