// Simplified Kademlia-style DHT for a single-process prototype.
// Keys are strings, values are small JSON-serializable objects.
//
// Message types handled by p2pService:
// - DHT_STORE { key, value }
// - DHT_FIND_VALUE { key }
// - DHT_VALUE { key, value|null }

const crypto = require('crypto');

const localStore = new Map(); // key -> { value, storedAt }

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function distanceHex(aHex, bHex) {
  // XOR distance on first 16 bytes (good enough for routing ranking)
  const a = Buffer.from(aHex.slice(0, 32), 'hex');
  const b = Buffer.from(bHex.slice(0, 32), 'hex');
  const out = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) out[i] = a[i] ^ b[i];
  return out;
}

function compareDistance(aKeyHex, bKeyHex, targetHex) {
  const da = distanceHex(aKeyHex, targetHex);
  const db = distanceHex(bKeyHex, targetHex);
  return Buffer.compare(da, db);
}

function putLocal(key, value) {
  localStore.set(key, { value, storedAt: Date.now() });
}

function getLocal(key) {
  return localStore.get(key)?.value ?? null;
}

function getLocalKeys() {
  return Array.from(localStore.keys());
}

function hashKey(key) {
  return sha256Hex(key);
}

module.exports = {
  putLocal,
  getLocal,
  getLocalKeys,
  hashKey,
  compareDistance,
};


