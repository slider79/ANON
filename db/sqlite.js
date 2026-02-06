const path = require('path');
const Database = require('better-sqlite3');

const dbPath =
  process.env.DB_PATH || path.join(process.cwd(), 'anon.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Simple migrations
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  reputation REAL NOT NULL,
  mana INTEGER NOT NULL,
  last_mana_update INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS used_emails (
  email_hash TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS pending_tokens (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dag_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  type TEXT NOT NULL,
  text TEXT,
  vote INTEGER,
  author_id TEXT,
  voter_id TEXT,
  evidence TEXT,
  timestamp INTEGER NOT NULL
);
`);

module.exports = db;


