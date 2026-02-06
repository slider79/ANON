# Testing with Multiple Clients

This guide shows how to test ANON with multiple users/clients to see database persistence and multi-user interactions.

## Method 1: Multiple Browser Tabs/Windows (Easiest)

### Step 1: Start the Server

```powershell
cd R:\shujalele
npm start
```

The server runs on `http://localhost:5000` by default.

### Step 2: Open Multiple Browser Tabs

1. **Tab 1 (User A)**: Open `http://localhost:5000` in your browser
2. **Tab 2 (User B)**: Open `http://localhost:5000` in a **new tab** (or incognito/private window)
3. **Tab 3 (User C)**: Open `http://localhost:5000` in another tab

Each tab is a **separate client** with its own `localStorage` (so each can have a different user identity).

### Step 3: Register Different Users

**In Tab 1 (User A):**

1. Enter email: `alice@university.edu`
2. Click "Join ANON"
3. Note the Node ID shown (e.g., `34aa5f95...`)

**In Tab 2 (User B):**

1. Enter email: `bob@university.edu`
2. Click "Join ANON"
3. Note the Node ID (different from User A)

**In Tab 3 (User C):**

1. Enter email: `charlie@university.edu`
2. Click "Join ANON"
3. Note the Node ID (different from User A and B)

### Step 4: Test Multi-User Interactions

**User A posts a rumor:**

- In Tab 1, type: `"Exam for CS101 postponed to Monday"`
- Click "Post Rumor"
- Mana should drop from 100 → 50

**User B sees the rumor and votes:**

- In Tab 2, refresh the feed (or wait ~15 seconds for auto-refresh)
- You should see User A's rumor appear
- Click the ⬆️ **Verify** button (or ⬇️ Dispute)
- Mana drops from 100 → 95

**User C also votes:**

- In Tab 3, refresh the feed
- See the same rumor
- Click ⬆️ **Verify**
- Mana drops from 100 → 95

**Check the feed in all tabs:**

- All three tabs should show the same rumor
- The **trust score** should update (higher if both B and C verified)
- The **state** might change to "VERIFIED" if score > 0.7

### Step 5: Check Database Persistence

**Restart the server:**

```powershell
# Stop server (Ctrl+C), then restart
npm start
```

**Refresh all tabs:**

- All users should still be logged in (stored in `localStorage`)
- All rumors and votes should still be visible (stored in `anon.db`)
- Mana should have regenerated based on time elapsed

## Method 2: Check Database Directly

You can inspect the SQLite database directly:

```powershell
# Install sqlite3 CLI (if not already installed)
# Or use a GUI tool like DB Browser for SQLite

# Check users
sqlite3 anon.db "SELECT id, public_key, reputation, mana FROM users;"

# Check rumors
sqlite3 anon.db "SELECT id, text, author_id, timestamp FROM dag_nodes WHERE type='RUMOR';"

# Check votes
sqlite3 anon.db "SELECT id, parent_id, voter_id, vote FROM dag_nodes WHERE type='VOTE';"
```

## Method 3: Use Debug Endpoints

Check what's in the database via HTTP:

```powershell
# See all users and their reputations
Invoke-RestMethod http://localhost:5000/api/debug/reputations | ConvertTo-Json

# See all rumors
Invoke-RestMethod http://localhost:5000/api/debug/rumors | ConvertTo-Json

# See trust matrix (who trusts whom)
Invoke-RestMethod http://localhost:5000/api/debug/trust | ConvertTo-Json
```

## Method 4: Multiple Servers + Multiple Clients (Full P2P Test)

For testing **P2P gossip** between nodes:

1. **Start Node A** (Terminal 1):

```powershell
$env:PORT=5006
$env:ADVERTISE_URL='ws://localhost:5006/p2p'
$env:NODE_STATE_DIR='.anon-5006'
npm start
```

2. **Start Node B** (Terminal 2):

```powershell
$env:PORT=5007
$env:ADVERTISE_URL='ws://localhost:5007/p2p'
$env:NODE_STATE_DIR='.anon-5007'
npm start
```

3. **Connect them**:

```powershell
$body = @{ url = 'ws://localhost:5006/p2p' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:5007/api/network/connect -ContentType 'application/json' -Body $body
```

4. **Open clients**:

   - Tab 1: `http://localhost:5006` (connects to Node A)
   - Tab 2: `http://localhost:5007` (connects to Node B)

5. **Register users**:

   - Tab 1: `alice@university.edu`
   - Tab 2: `bob@university.edu`

6. **Post on Node A, see on Node B**:
   - Tab 1: Post a rumor
   - Tab 2: Refresh feed → rumor should appear via gossip!

## Tips

- **Clear localStorage** to reset a client: Open DevTools (F12) → Application → Local Storage → Clear
- **Check mana regeneration**: Wait 1 minute, refresh → mana should increase by 1
- **See reputation changes**: After multiple votes, check `/api/debug/reputations` → reputations should differ based on voting patterns
- **Database file**: `anon.db` is created in the project root. Delete it to reset everything.

## Expected Behavior

✅ Each browser tab = separate client (different `localStorage`)  
✅ Each email = separate user (different `id` = SHA256(publicKey))  
✅ All data persists in `anon.db` across server restarts  
✅ Rumors/votes propagate via P2P gossip if multiple nodes are running  
✅ Trust scores update based on weighted votes (reputation × vote)  
✅ Mana regenerates over time (1 per minute)
