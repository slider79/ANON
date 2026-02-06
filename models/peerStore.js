// Peer store and routing table helpers (simplified Kademlia-like)

const peers = new Map(); // peerId -> { peerId, url, lastSeen, capabilities }

function upsertPeer({ peerId, url, capabilities }) {
  if (!peerId) return;
  const prev = peers.get(peerId);
  peers.set(peerId, {
    peerId,
    url: url || prev?.url || null,
    capabilities: capabilities || prev?.capabilities || {},
    lastSeen: Date.now(),
  });
}

function getPeers() {
  return Array.from(peers.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}

function getPeer(peerId) {
  return peers.get(peerId) || null;
}

function prunePeers(maxAgeMs = 30 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [peerId, p] of peers.entries()) {
    if (p.lastSeen < cutoff) peers.delete(peerId);
  }
}

module.exports = {
  upsertPeer,
  getPeers,
  getPeer,
  prunePeers,
};


