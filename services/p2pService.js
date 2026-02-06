const WebSocket = require('ws');
const crypto = require('crypto');

const peerStore = require('../models/peerStore');
const nodeIdentityService = require('./nodeIdentityService');
const dhtService = require('./dhtService');
const dagStore = require('../models/dagStore');

const DEFAULT_GOSSIP_FANOUT = 5;
const DEFAULT_GOSSIP_TTL = 6;

// ws connections: peerId -> ws
const conns = new Map();
const seenMessages = new Map(); // msgId -> seenAt

let wss = null;

function getConfig() {
  const gossipFanout = Number(process.env.GOSSIP_FANOUT || DEFAULT_GOSSIP_FANOUT);
  const gossipTtl = Number(process.env.GOSSIP_TTL || DEFAULT_GOSSIP_TTL);
  const bootstrap = (process.env.BOOTSTRAP_PEERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const advertiseUrl = process.env.ADVERTISE_URL || null; // e.g. ws://localhost:5000/p2p

  return { gossipFanout, gossipTtl, bootstrap, advertiseUrl };
}

function makeMessage(type, payload, extra = {}) {
  const { nodeId, publicKeyPem } = nodeIdentityService.getNodeIdentity();
  const base = {
    v: 1,
    type,
    from: nodeId,
    fromPub: publicKeyPem,
    ts: Date.now(),
    ...extra,
    payload,
  };
  const sig = nodeIdentityService.signPayload(base);
  return { ...base, sig };
}

function verifyMessage(msg) {
  if (!msg || typeof msg !== 'object') return false;
  const { sig, ...unsigned } = msg;
  if (!sig || !msg.fromPub) return false;
  // Signature covers the whole message *except* sig itself (including fromPub).
  return nodeIdentityService.verifyPayload(unsigned, sig, msg.fromPub);
}

function markSeen(msgId) {
  if (!msgId) return false;
  if (seenMessages.has(msgId)) return false;
  seenMessages.set(msgId, Date.now());
  return true;
}

function pruneSeen(maxAgeMs = 10 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, seenAt] of seenMessages.entries()) {
    if (seenAt < cutoff) seenMessages.delete(id);
  }
}

function samplePeers(limit) {
  const peers = peerStore.getPeers().filter((p) => conns.has(p.peerId));
  // random sample
  for (let i = peers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [peers[i], peers[j]] = [peers[j], peers[i]];
  }
  return peers.slice(0, limit);
}

function closestPeersForKey(key, limit) {
  const target = dhtService.hashKey(key);
  const peers = peerStore.getPeers().filter((p) => conns.has(p.peerId));
  peers.sort((a, b) => dhtService.compareDistance(a.peerId, b.peerId, target));
  return peers.slice(0, limit);
}

function sendToPeer(peerId, msg) {
  const ws = conns.get(peerId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

function broadcast(msg, { fanout } = {}) {
  const { gossipFanout } = getConfig();
  const peers = samplePeers(fanout ?? gossipFanout);
  for (const p of peers) {
    sendToPeer(p.peerId, msg);
  }
}

function handleHello(ws, msg) {
  const peerId = msg.from;
  conns.set(peerId, ws);
  peerStore.upsertPeer({
    peerId,
    url: msg.payload?.advertiseUrl || null,
    capabilities: msg.payload?.capabilities || {},
  });

  // Ensure both directions get a peerId-mapped connection:
  // if this HELLO isn't marked as a reply, respond with a HELLO reply once.
  if (!msg.payload?.reply) {
    const { advertiseUrl } = getConfig();
    const helloReply = makeMessage(
      'HELLO',
      { advertiseUrl, capabilities: { gossip: true, dht: true }, reply: true },
      { msgId: cryptoMsgId('hello-reply') }
    );
    ws.send(JSON.stringify(helloReply));
  }

  // reply with our peers list for multi-level discovery
  const peers = peerStore.getPeers()
    .filter((p) => p.peerId !== peerId)
    .slice(0, 50)
    .map((p) => ({ peerId: p.peerId, url: p.url }));

  ws.send(
    JSON.stringify(
      makeMessage('PEERS', { peers }, { msgId: cryptoMsgId('peers') })
    )
  );
}

function handlePeers(_ws, msg) {
  const peers = msg.payload?.peers || [];
  for (const p of peers) {
    if (p?.peerId && p?.url) {
      peerStore.upsertPeer({ peerId: p.peerId, url: p.url });
    }
  }
}

function cryptoMsgId(seed) {
  // cheap unique-ish id for dedupe
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${seed || ''}`;
}

function handleGossip(_ws, msg) {
  const msgId = msg.msgId;
  if (!markSeen(msgId)) return;

  const { ttl } = msg.payload || {};
  const nextTtl = typeof ttl === 'number' ? ttl - 1 : 0;
  const { node } = msg.payload || {};

  if (node && node.id && node.type) {
    // store if we don't have it
    if (!dagStore.getNode(node.id)) {
      dagStore.addNode(node);
      // also store in DHT under dag:<id>
      dhtService.putLocal(`dag:${node.id}`, node);
    }
  }

  if (nextTtl > 0) {
    const fwd = makeMessage('GOSSIP', { ...msg.payload, ttl: nextTtl }, { msgId });
    broadcast(fwd);
  }
}

function handleDhtStore(_ws, msg) {
  const { key, value } = msg.payload || {};
  if (!key) return;
  dhtService.putLocal(key, value);
}

function handleDhtFindValue(ws, msg) {
  const { key } = msg.payload || {};
  if (!key) return;
  const value = dhtService.getLocal(key);
  ws.send(
    JSON.stringify(
      makeMessage('DHT_VALUE', { key, value }, { replyTo: msg.msgId, msgId: cryptoMsgId('dhtv') })
    )
  );
}

function onMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (!verifyMessage(msg)) return;

  if (process.env.P2P_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[p2p] message', msg.type, 'from', msg.from);
  }

  peerStore.upsertPeer({
    peerId: msg.from,
    url: msg.payload?.advertiseUrl || null,
    capabilities: msg.payload?.capabilities || {},
  });

  switch (msg.type) {
    case 'HELLO':
      handleHello(ws, msg);
      break;
    case 'PEERS':
      handlePeers(ws, msg);
      break;
    case 'GOSSIP':
      handleGossip(ws, msg);
      break;
    case 'DHT_STORE':
      handleDhtStore(ws, msg);
      break;
    case 'DHT_FIND_VALUE':
      handleDhtFindValue(ws, msg);
      break;
    default:
      break;
  }
}

function attachWebSocketServer(httpServer) {
  if (wss) return;
  wss = new WebSocket.Server({ server: httpServer, path: '/p2p' });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => onMessage(ws, data));
  });

  // housekeeping
  setInterval(() => {
    pruneSeen();
    peerStore.prunePeers();
  }, 60 * 1000);
}

function connectToPeer(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => {
      const { advertiseUrl } = getConfig();
      const hello = makeMessage(
        'HELLO',
        {
          advertiseUrl,
          capabilities: { gossip: true, dht: true },
        },
        { msgId: cryptoMsgId('hello') }
      );
      ws.send(JSON.stringify(hello));
      resolve(true);
    });
    ws.on('message', (data) => onMessage(ws, data));
    ws.on('error', () => resolve(false));
  });
}

async function bootstrap() {
  const { bootstrap: urls } = getConfig();
  for (const url of urls) {
    // Fire and forget; success tracked by peerStore updates from HELLO
    // eslint-disable-next-line no-await-in-loop
    await connectToPeer(url);
  }
}

function gossipDagNode(node) {
  // Always store locally in DHT
  if (node?.id) dhtService.putLocal(`dag:${node.id}`, node);

  const { gossipTtl } = getConfig();
  const msg = makeMessage(
    'GOSSIP',
    { ttl: gossipTtl, node },
    { msgId: cryptoMsgId(`dag:${node?.id || ''}`) }
  );
  markSeen(msg.msgId);
  broadcast(msg);
}

async function dhtGet(key, { timeoutMs = 1000 } = {}) {
  const local = dhtService.getLocal(key);
  if (local !== null) return local;

  // Query a few peers for the value
  const peers = closestPeersForKey(key, 5);
  if (!peers.length) return null;

  const msgId = cryptoMsgId('dhtq');
  const query = makeMessage('DHT_FIND_VALUE', { key }, { msgId });

  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) resolve(null);
    }, timeoutMs);

    const handler = (ws, raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!verifyMessage(m)) return;
      if (m.type === 'DHT_VALUE' && m.replyTo === msgId) {
        done = true;
        clearTimeout(timer);
        // store locally
        if (m.payload?.key) dhtService.putLocal(m.payload.key, m.payload.value);
        resolve(m.payload?.value ?? null);
      }
    };

    for (const p of peers) {
      const ws = conns.get(p.peerId);
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      ws.once('message', (data) => handler(ws, data));
      ws.send(JSON.stringify(query));
    }
  });
}

function dhtPut(key, value) {
  dhtService.putLocal(key, value);
  const msg = makeMessage('DHT_STORE', { key, value }, { msgId: cryptoMsgId('dhts') });
  // Store on the k closest peers to the key hash (Kademlia-like)
  const closest = closestPeersForKey(key, 8);
  if (!closest.length) return;
  for (const p of closest) {
    sendToPeer(p.peerId, msg);
  }
}

function getStatus() {
  const { nodeId } = nodeIdentityService.getNodeIdentity();
  return {
    nodeId,
    peers: peerStore.getPeers(),
    connections: Array.from(conns.keys()),
  };
}

module.exports = {
  attachWebSocketServer,
  bootstrap,
  connectToPeer,
  gossipDagNode,
  dhtGet,
  dhtPut,
  getStatus,
};


