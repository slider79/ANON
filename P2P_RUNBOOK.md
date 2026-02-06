# ANON Backend P2P Runbook (Local Multi-Node)

This repo now supports running **multiple backend nodes** that connect via **WebSocket P2P**, propagate DAG nodes via **gossip**, and store/fetch values via a **DHT-style key/value layer**.

## Run 2 nodes locally (PowerShell)

### Terminal A (Node A)

```powershell
cd R:\shujalele
$env:PORT=5006
$env:ADVERTISE_URL='ws://localhost:5006/p2p'
$env:NODE_STATE_DIR='.anon-5006'
npm start
```

### Terminal B (Node B)

```powershell
cd R:\shujalele
$env:PORT=5007
$env:ADVERTISE_URL='ws://localhost:5007/p2p'
$env:NODE_STATE_DIR='.anon-5007'
npm start
```

### Connect B → A

```powershell
$body = @{ url = 'ws://localhost:5006/p2p' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5007/api/network/connect -ContentType 'application/json' -Body $body
```

### Check status

```powershell
Invoke-RestMethod http://localhost:5006/api/network/status
Invoke-RestMethod http://localhost:5007/api/network/status
```

## Gossip test: post on A, read on B

1. On **Node A** create user + rumor:

```powershell
$t = Invoke-RestMethod -Method Post -Uri http://localhost:5006/api/auth/register -ContentType 'application/json' -Body (@{ email = 'a@university.edu' } | ConvertTo-Json)
$u = Invoke-RestMethod -Method Post -Uri http://localhost:5006/api/auth/onboard -ContentType 'application/json' -Body (@{ publicKey = 'pkA'; token = $t.token } | ConvertTo-Json)
$r = Invoke-RestMethod -Method Post -Uri http://localhost:5006/api/rumors -ContentType 'application/json' -Body (@{ authorId = $u.id; text = 'hello from nodeA' } | ConvertTo-Json)
$r
```

2. On **Node B** view feed / fetch DAG node:

```powershell
Invoke-RestMethod http://localhost:5007/api/feed
Invoke-RestMethod http://localhost:5007/api/dag/$($r.id)
Invoke-RestMethod http://localhost:5007/api/dht/get/dag:$($r.id)
```

## Environment variables

- `PORT`: HTTP port for the node.
- `ADVERTISE_URL`: what this node tells peers to connect to (e.g. `ws://host:PORT/p2p`).
- `BOOTSTRAP_PEERS`: comma-separated list of peer WS URLs to auto-connect at startup.
- `NODE_STATE_DIR`: directory used to persist this node’s Ed25519 keypair (must be unique per local node instance).
- `GOSSIP_FANOUT`: number of peers to forward gossip to (default 5).
- `GOSSIP_TTL`: gossip hop limit (default 6).
