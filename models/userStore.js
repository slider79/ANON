// User/identity store and mana tracking backed by SQLite

const { randomUUID, createHash } = require('crypto');
const db = require('../db/sqlite');

const INITIAL_REPUTATION = 0.1;
const INITIAL_MANA = 100;
const MAX_MANA = 100;
const MANA_REGEN_PER_MIN = 1;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function issueTokenForEmail(email) {
  const emailHash = sha256(email.toLowerCase());

  const exists = db
    .prepare('SELECT 1 FROM used_emails WHERE email_hash = ?')
    .get(emailHash);
  if (exists) {
    throw new Error('This email has already been registered');
  }

  const token = randomUUID();
  const now = Date.now();

  const insertToken = db.prepare(
    'INSERT INTO pending_tokens (token, created_at) VALUES (?, ?)'
  );
  const insertEmail = db.prepare(
    'INSERT INTO used_emails (email_hash) VALUES (?)'
  );

  const tx = db.transaction(() => {
    insertEmail.run(emailHash);
    insertToken.run(token, now);
  });
  tx();

  return { token };
}

function onboardNode(publicKey, token) {
  const row = db
    .prepare('SELECT token FROM pending_tokens WHERE token = ?')
    .get(token);
  if (!row) {
    throw new Error('Invalid or already used token');
  }

  const id = sha256(publicKey);
  const now = Date.now();

  const deleteToken = db.prepare(
    'DELETE FROM pending_tokens WHERE token = ?'
  );
  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, public_key, reputation, mana, last_mana_update)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    deleteToken.run(token);
    insertUser.run(id, publicKey, INITIAL_REPUTATION, INITIAL_MANA, now);
  });
  tx();

  return db
    .prepare(
      'SELECT id, public_key AS publicKey, reputation, mana, last_mana_update AS lastManaUpdate FROM users WHERE id = ?'
    )
    .get(id);
}

function loadUser(userId) {
  return db
    .prepare(
      'SELECT id, public_key AS publicKey, reputation, mana, last_mana_update AS lastManaUpdate FROM users WHERE id = ?'
    )
    .get(userId);
}

function saveUser(user) {
  db.prepare(
    `UPDATE users SET
       reputation = ?,
       mana = ?,
       last_mana_update = ?
     WHERE id = ?`
  ).run(user.reputation, user.mana, user.lastManaUpdate, user.id);
}

function regenMana(user) {
  const now = Date.now();
  const elapsedMinutes = (now - user.lastManaUpdate) / 60000;
  if (elapsedMinutes <= 0) return;
  const regen = Math.floor(elapsedMinutes * MANA_REGEN_PER_MIN);
  if (regen > 0) {
    user.mana = Math.min(MAX_MANA, user.mana + regen);
    user.lastManaUpdate = now;
  }
}

function consumeMana(userId, amount) {
  const user = loadUser(userId);
  if (!user) return false;
  regenMana(user);
  if (user.mana < amount) return false;
  user.mana -= amount;
  saveUser(user);
  return true;
}

function getMana(userId) {
  const user = loadUser(userId);
  if (!user) return null;
  regenMana(user);
  saveUser(user);
  return { id: user.id, mana: user.mana, lastManaUpdate: user.lastManaUpdate };
}

function getAllUsers() {
  return db
    .prepare(
      'SELECT id, public_key AS publicKey, reputation, mana, last_mana_update AS lastManaUpdate FROM users'
    )
    .all();
}

function setReputations(repMap) {
  const stmt = db.prepare(
    'UPDATE users SET reputation = ? WHERE id = ?'
  );
  const tx = db.transaction(() => {
    for (const [id, rep] of Object.entries(repMap)) {
      stmt.run(rep, id);
    }
  });
  tx();
}

module.exports = {
  issueTokenForEmail,
  onboardNode,
  consumeMana,
  getMana,
  getAllUsers,
  setReputations,
  INITIAL_REPUTATION,
};


