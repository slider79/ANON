// Node identity used for P2P transport (distinct from user identities in ANON_README).
// Each backend instance acts as a "network node" and needs a stable keypair + nodeId.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_DIR = process.env.NODE_STATE_DIR
  ? path.resolve(process.env.NODE_STATE_DIR)
  : path.join(process.cwd(), '.anon');
const KEY_FILE = path.join(STATE_DIR, 'nodekey.json');

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadOrCreateKeypair() {
  ensureStateDir();
  if (fs.existsSync(KEY_FILE)) {
    const raw = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    return raw;
  }

  // Ed25519 keys (PEM)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const nodeId = crypto.createHash('sha256').update(pubPem).digest('hex');

  const saved = { nodeId, publicKeyPem: pubPem, privateKeyPem: privPem };
  fs.writeFileSync(KEY_FILE, JSON.stringify(saved, null, 2), 'utf8');
  return saved;
}

function getNodeIdentity() {
  const kp = loadOrCreateKeypair();
  return {
    nodeId: kp.nodeId,
    publicKeyPem: kp.publicKeyPem,
  };
}

function signPayload(payload) {
  const kp = loadOrCreateKeypair();
  const privateKey = crypto.createPrivateKey(kp.privateKeyPem);
  const data = Buffer.from(JSON.stringify(payload));
  const sig = crypto.sign(null, data, privateKey);
  return sig.toString('base64');
}

function verifyPayload(payload, signatureB64, publicKeyPem) {
  try {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const data = Buffer.from(JSON.stringify(payload));
    const sig = Buffer.from(signatureB64, 'base64');
    return crypto.verify(null, data, publicKey, sig);
  } catch {
    return false;
  }
}

module.exports = {
  getNodeIdentity,
  signPayload,
  verifyPayload,
};


