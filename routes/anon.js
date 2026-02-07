const express = require('express');
const router = express.Router();

const identityService = require('../services/identityService');
const dagService = require('../services/dagService');
const trustService = require('../services/trustService');
const manaService = require('../services/manaService');
const p2pService = require('../services/p2pService');
const dagStore = require('../models/dagStore');
const userStore = require('../models/userStore');
const dhtService = require('../services/dhtService');

// --- Rate Limiter Storage ---
// Map Key: "voterId:rumorId:type" -> Array of timestamps
const voteLimits = new Map();

// Clean up old rate limit entries every minute to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of voteLimits.entries()) {
    const valid = timestamps.filter(t => now - t < 60000);
    if (valid.length === 0) voteLimits.delete(key);
    else voteLimits.set(key, valid);
  }
}, 60000);

function checkVoteRateLimit(userId, rumorId, type) {
  const key = `${userId}:${rumorId}:${type}`;
  const now = Date.now();
  const window = 60000; // 1 minute
  const limit = 3;

  let timestamps = voteLimits.get(key) || [];
  // Filter out votes older than 1 minute
  timestamps = timestamps.filter(t => now - t < window);
  
  if (timestamps.length >= limit) {
    voteLimits.set(key, timestamps); // Update cleanup
    return false; // Blocked
  }
  
  timestamps.push(now);
  voteLimits.set(key, timestamps);
  return true; // Allowed
}

// ---- Identity & Onboarding ----

router.post('/auth/register', (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = identityService.registerEmail(email);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/auth/onboard', (req, res) => {
  const { publicKey, token } = req.body;
  if (!publicKey || !token) {
    return res.status(400).json({ error: 'publicKey and token are required' });
  }

  try {
    const node = identityService.onboardNode(publicKey, token);
    
    // FIX: Broadcast this new Identity to the network
    // This ensures Node 1 knows about this user immediately
    p2pService.gossipUser(node);
    
    return res.json(node);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ---- Rumors & Votes (DAG) ----

router.post('/rumors', (req, res) => {
  const { authorId, text, parentId } = req.body;

  try {
    const manaOk = manaService.consumeMana(authorId, 50);
    if (!manaOk) {
      return res.status(400).json({ error: 'Insufficient Mana' });
    }

    const node = dagService.createRumor({
      authorId,
      text,
      parentId: parentId || null,
    });

    p2pService.gossipDagNode(node);

    return res.json(node);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/rumors/:id/votes', (req, res) => {
  const rumorId = req.params.id;
  const { voterId, vote, evidence } = req.body;

  // 1. Check Rate Limit (Review Bomb Protection)
  const type = vote > 0 ? 'verify' : 'dispute';
  if (!checkVoteRateLimit(voterId, rumorId, type)) {
    return res.status(429).json({ error: `Rate limit: You can only ${type} this post 3 times per minute.` });
  }

  try {
    const manaOk = manaService.consumeMana(voterId, 5);
    if (!manaOk) {
      return res.status(400).json({ error: 'Insufficient Mana' });
    }

    const voteNode = dagService.createVote({
      parentId: rumorId,
      voterId,
      vote,
      evidence: evidence || null,
    });

    p2pService.gossipDagNode(voteNode);

    return res.json(voteNode);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ---- Feed & Consensus ----

router.get('/feed', (_req, res) => {
  const feed = trustService.getFeed();
  res.json(feed);
});

router.post('/consensus/tick', (_req, res) => {
  try {
    const result = trustService.runConsensusTick();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  try {
    userStore.deleteUser(id);
    console.log(`[Identity] User ${id} deleted from database.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FIX: Make this Async to handle P2P Lookup for "Restore Account"
router.get('/users/:id', async (req, res) => {
  const { id } = req.params;
  
  // 1. Try Local Database
  let user = userStore.loadUser(id);
  
  // 2. If not found locally, try Network (DHT)
  if (!user) {
    console.log(`[Identity] User ${id} not found locally. Searching network...`);
    const netUser = await p2pService.dhtGet(`user:${id}`);
    
    if (netUser && netUser.id === id) {
      console.log(`[Identity] Found user ${id} in network. Importing.`);
      userStore.importUser(netUser);
      user = netUser;
    }
  }

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    publicKey: user.publicKey,
    reputation: user.reputation,
    mana: user.mana,
  });
});

router.get('/users/:id/mana', (req, res) => {
  const { id } = req.params;
  const mana = manaService.getMana(id);
  if (!mana) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(mana);
});

// ---- P2P / DHT debug endpoints ----

router.get('/network/status', (_req, res) => {
  res.json(p2pService.getStatus());
});

router.post('/network/connect', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  const ok = await p2pService.connectToPeer(url);
  res.json({ ok });
});

router.get('/dht/get/:key', async (req, res) => {
  const key = req.params.key;
  const value = await p2pService.dhtGet(key);
  if (value === null) return res.status(404).json({ error: 'Not found' });
  res.json({ key, value });
});

router.post('/dht/put', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  p2pService.dhtPut(key, value);
  res.json({ ok: true });
});

router.get('/dag/:id', async (req, res) => {
  const { id } = req.params;
  const local = dagStore.getNode(id);
  if (local) return res.json(local);

  const value = await p2pService.dhtGet(`dag:${id}`);
  if (!value) return res.status(404).json({ error: 'Not found' });

  if (!dagStore.getNode(value.id)) dagStore.addNode(value);
  res.json(value);
});

// ---- Observability / metrics ----

router.get('/debug/reputations', (_req, res) => {
  const users = userStore.getAllUsers().map((u) => ({
    id: u.id,
    reputation: u.reputation,
    mana: u.mana,
  }));
  res.json({ users });
});

router.get('/debug/trust', (_req, res) => {
  const trust = trustService.getDebugTrust();
  res.json(trust);
});

router.get('/debug/rumors', (_req, res) => {
  const feed = trustService.getFeed();
  res.json({ count: feed.length, items: feed });
});

router.get('/debug/dht', (_req, res) => {
  const keys = dhtService.getLocalKeys();
  res.json({ keys });
});

module.exports = router;