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

// ---- Identity & Onboarding ----

// Simulated email verification + blind token issuance
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

// Complete onboarding with public key and token
router.post('/auth/onboard', (req, res) => {
  const { publicKey, token } = req.body;
  if (!publicKey || !token) {
    return res.status(400).json({ error: 'publicKey and token are required' });
  }

  try {
    const node = identityService.onboardNode(publicKey, token);
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

    // P2P: gossip + DHT store
    p2pService.gossipDagNode(node);

    return res.json(node);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/rumors/:id/votes', (req, res) => {
  const rumorId = req.params.id;
  const { voterId, vote, evidence } = req.body;

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

    // P2P: gossip + DHT store
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

// Manual consensus tick (in addition to internal interval)
router.post('/consensus/tick', (_req, res) => {
  try {
    const result = trustService.runConsensusTick();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Mana status
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

// Fetch a DAG node locally or via the DHT (dag:<id>)
router.get('/dag/:id', async (req, res) => {
  const { id } = req.params;
  const local = dagStore.getNode(id);
  if (local) return res.json(local);

  const value = await p2pService.dhtGet(`dag:${id}`);
  if (!value) return res.status(404).json({ error: 'Not found' });

  // cache locally in DAG store
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


