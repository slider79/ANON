const WebSocket = require('ws');
const crypto = require('crypto');

const peerStore = require('../models/peerStore');
const nodeIdentityService = require('./nodeIdentityService');
const dhtService = require('./dhtService');
const dagStore = require('../models/dagStore');
const userStore = require('../models/userStore'); // Added userStore

const DEFAULT_GOSSIP_FANOUT = 5;
const DEFAULT_GOSSIP_TTL = 6;

// ws connections: peerId -> ws
const conns = new Map();
const seenMessages = new Map(); 

// Track URLs we are currently trying to connect to
const pendingConnections = new Set();

let wss = null;

function getConfig() {
  const gossipFanout = Number(process.env.GOSSIP_FANOUT || DEFAULT_GOSSIP_FANOUT);
  const gossipTtl = Number(process.env.GOSSIP_TTL || DEFAULT_GOSSIP_TTL);
  const bootstrap = (process.env.BOOTSTRAP_PEERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const advertiseUrl = process.env.ADVERTISE_URL || null; 

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

function sendToPeer(peerId, msg) {
  const ws = conns.get(peerId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(msg));
  return true;
}

function broadcast(msg, { fanout } = {}) {
  const { gossipFanout } = getConfig();
  const peers = peerStore.getPeers().filter((p) => conns.has(p.peerId));
  
  for (let i = peers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [peers[i], peers[j]] = [peers[j], peers[i]];
  }
  const targetPeers = peers.slice(0, fanout ?? gossipFanout);
  
  for (const p of targetPeers) {
    sendToPeer(p.peerId, msg);
  }
}

// --- SYNC LOGIC (Updated to Sync Users too) ---

function handleSyncReq(ws, msg) {
  // 1. Get Rumors (Posts)
  const allNodes = dagStore.getAllNodes();
  const nodes = allNodes.slice(-500); 
  
  // 2. Get Users (Identities) - NEW
  const allUsers = userStore.getAllUsers();

  console.log(`[Sync] Sending ${nodes.length} rumors and ${allUsers.length} users to peer.`);
  
  const reply = makeMessage(
    'SYNC_RES', 
    { nodes, users: allUsers }, 
    { msgId: cryptoMsgId('sync-res') }
  );
  ws.send(JSON.stringify(reply));
}

function handleSyncRes(ws, msg) {
  // Import Rumors
  const nodes = msg.payload?.nodes || [];
  let newNodesCount = 0;
  for (const node of nodes) {
    if (!dagStore.getNode(node.id)) {
      dagStore.addNode(node);
      dhtService.putLocal(`dag:${node.id}`, node);
      newNodesCount++;
    }
  }

  // Import Users - NEW
  const users = msg.payload?.users || [];
  let newUsersCount = 0;
  for (const user of users) {
    // We use importUser (ensure it's in userStore.js)
    // We check existence first to avoid unnecessary writes, 
    // but importUser handles upsert mostly.
    const existing = userStore.loadUser(user.id);
    if (!existing) {
      userStore.importUser(user);
      // Ensure network lookup finds it
      dhtService.putLocal(`user:${user.id}`, user);
      newUsersCount++;
    }
  }

  if (newNodesCount > 0 || newUsersCount > 0) {
    console.log(`[Sync] Synced: ${newNodesCount} rumors, ${newUsersCount} users.`);
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

  if (!msg.payload?.reply) {
    const { advertiseUrl } = getConfig();
    const helloReply = makeMessage(
      'HELLO',
      { advertiseUrl, capabilities: { gossip: true, dht: true }, reply: true },
      { msgId: cryptoMsgId('hello-reply') }
    );
    ws.send(JSON.stringify(helloReply));
  }

  // Trigger Sync immediately
  const syncReq = makeMessage('SYNC_REQ', {}, { msgId: cryptoMsgId('sync-req') });
  ws.send(JSON.stringify(syncReq));

  const peers = peerStore.getPeers()
    .filter((p) => p.peerId !== peerId && p.url)
    .slice(0, 50)
    .map((p) => ({ peerId: p.peerId, url: p.url }));

  if (peers.length > 0) {
    ws.send(JSON.stringify(
      makeMessage('PEERS', { peers }, { msgId: cryptoMsgId('peers') })
    ));
  }
}

function handlePeers(_ws, msg) {
  const receivedPeers = msg.payload?.peers || [];
  const { nodeId: myId } = nodeIdentityService.getNodeIdentity();

  for (const p of receivedPeers) {
    if (!p.peerId || !p.url) continue;
    if (p.peerId === myId) continue;

    peerStore.upsertPeer({ peerId: p.peerId, url: p.url });

    if (!conns.has(p.peerId)) {
      connectToPeer(p.url);
    }
  }
}

function cryptoMsgId(seed) {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${seed || ''}`;
}

// --- USER GOSSIP LOGIC ---
function handleUserUpdate(_ws, msg) {
  const msgId = msg.msgId;
  if (!markSeen(msgId)) return;

  const user = msg.payload?.user;
  if (user && user.id) {
    // Import the user
    userStore.importUser(user);
    dhtService.putLocal(`user:${user.id}`, user);
    console.log(`[Identity] Received User Update for ${user.id.slice(0,8)}`);
  }

  // Forward the gossip
  const { ttl } = msg.payload || {};
  const nextTtl = typeof ttl === 'number' ? ttl - 1 : 0;
  if (nextTtl > 0) {
    const fwd = makeMessage('USER_UPDATE', { ...msg.payload, ttl: nextTtl }, { msgId });
    broadcast(fwd);
  }
}

function handleGossip(_ws, msg) {
  const msgId = msg.msgId;
  if (!markSeen(msgId)) return;

  const { ttl } = msg.payload || {};
  const nextTtl = typeof ttl === 'number' ? ttl - 1 : 0;
  const { node } = msg.payload || {};

  if (node && node.id && node.type) {
    if (!dagStore.getNode(node.id)) {
      dagStore.addNode(node);
      dhtService.putLocal(`dag:${node.id}`, node);
      console.log(`[Gossip] Received node ${node.id.slice(0,8)}`);
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
  } catch { return; }

  if (!verifyMessage(msg)) return;
  if (msg.from) conns.set(msg.from, ws);

  switch (msg.type) {
    case 'HELLO': handleHello(ws, msg); break;
    case 'PEERS': handlePeers(ws, msg); break;
    case 'GOSSIP': handleGossip(ws, msg); break;
    case 'USER_UPDATE': handleUserUpdate(ws, msg); break; // NEW
    case 'DHT_STORE': handleDhtStore(ws, msg); break;
    case 'DHT_FIND_VALUE': handleDhtFindValue(ws, msg); break;
    case 'SYNC_REQ': handleSyncReq(ws, msg); break; 
    case 'SYNC_RES': handleSyncRes(ws, msg); break; 
    default: break;
  }
}

function attachWebSocketServer(httpServer) {
  if (wss) return;
  wss = new WebSocket.Server({ server: httpServer, path: '/p2p' });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => onMessage(ws, data));
    ws.on('error', () => {}); 
  });

  setInterval(() => {
    pruneSeen();
    peerStore.prunePeers();
  }, 60 * 1000);
}

function connectToPeer(url) {
  if (pendingConnections.has(url)) return Promise.resolve(false);
  
  for (const [id, peer] of peerStore.getPeers().entries()) {
     if (peer.url === url && conns.has(peer.peerId)) return Promise.resolve(true);
  }

  pendingConnections.add(url);

  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      pendingConnections.delete(url);
      const { advertiseUrl } = getConfig();
      const hello = makeMessage(
        'HELLO',
        { advertiseUrl, capabilities: { gossip: true, dht: true } },
        { msgId: cryptoMsgId('hello') }
      );
      ws.send(JSON.stringify(hello));
      
      const syncReq = makeMessage('SYNC_REQ', {}, { msgId: cryptoMsgId('sync-req-init') });
      ws.send(JSON.stringify(syncReq));

      resolve(true);
    });

    ws.on('message', (data) => onMessage(ws, data));
    
    ws.on('error', (err) => {
      pendingConnections.delete(url);
      resolve(false);
    });
  });
}

async function bootstrap() {
  const { bootstrap: urls, advertiseUrl } = getConfig();
  
  for (const url of urls) {
    await connectToPeer(url);
  }

  const myPort = advertiseUrl ? new URL(advertiseUrl).port : null;
  console.log('[P2P] Scanning localhost ports 5000-5200...');
  for (let port = 5000; port <= 5200; port++) {
    if (String(port) === String(myPort)) continue; 
    connectToPeer(`ws://localhost:${port}/p2p`);
  }
}

// NEW: Function to gossip a user identity to the network
function gossipUser(user) {
  if (!user) return;
  
  // Store locally in DHT first
  dhtService.putLocal(`user:${user.id}`, user);

  const { gossipTtl } = getConfig();
  const msg = makeMessage(
    'USER_UPDATE',
    { ttl: gossipTtl, user },
    { msgId: cryptoMsgId(`user:${user.id}`) }
  );
  markSeen(msg.msgId);
  broadcast(msg);
}

function gossipDagNode(node) {
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
  
  const peers = peerStore.getPeers().filter(p => conns.has(p.peerId));
  if (!peers.length) return null;

  const msgId = cryptoMsgId('dhtq');
  const query = makeMessage('DHT_FIND_VALUE', { key }, { msgId });

  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) resolve(null); }, timeoutMs);
    const handler = (ws, raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'DHT_VALUE' && m.replyTo === msgId) {
          done = true;
          clearTimeout(timer);
          if (m.payload?.value) dhtService.putLocal(key, m.payload.value);
          resolve(m.payload?.value ?? null);
        }
      } catch {}
    };
    peers.slice(0,3).forEach(p => {
        const ws = conns.get(p.peerId);
        if(ws) {
            ws.once('message', (d) => handler(ws, d));
            ws.send(JSON.stringify(query));
        }
    });
  });
}

function dhtPut(key, value) {
  dhtService.putLocal(key, value);
  const msg = makeMessage('DHT_STORE', { key, value }, { msgId: cryptoMsgId('dhts') });
  broadcast(msg, { fanout: 3 });
}

function getStatus() {
  const { nodeId } = nodeIdentityService.getNodeIdentity();
  return {
    nodeId,
    peers: peerStore.getPeers().map(p => ({...p, connected: conns.has(p.peerId)})),
    connections: Array.from(conns.keys()),
  };
}

module.exports = {
  attachWebSocketServer,
  bootstrap,
  connectToPeer,
  gossipDagNode,
  gossipUser, // Exported
  dhtGet,
  dhtPut,
  getStatus,
};