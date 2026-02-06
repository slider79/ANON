// DAG store for rumors and votes backed by SQLite
// This is a single-node prototype of the distributed DAG described in ANON_README.

const { randomUUID } = require('crypto');
const db = require('../db/sqlite');

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function addNode(node) {
  const id = node.id || randomUUID();
  const stored = {
    id,
    parentId: node.parentId || null,
    type: node.type, // 'RUMOR' | 'VOTE'
    text: node.text || null,
    vote: node.vote ?? null, // -1 | +1
    authorId: node.authorId || null,
    voterId: node.voterId || null,
    evidence: node.evidence || null,
    timestamp: node.timestamp || nowSeconds(),
  };

  db.prepare(
    `INSERT OR REPLACE INTO dag_nodes
      (id, parent_id, type, text, vote, author_id, voter_id, evidence, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    stored.id,
    stored.parentId,
    stored.type,
    stored.text,
    stored.vote,
    stored.authorId,
    stored.voterId,
    stored.evidence,
    stored.timestamp
  );

  return stored;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    text: row.text,
    vote: row.vote,
    authorId: row.author_id,
    voterId: row.voter_id,
    evidence: row.evidence,
    timestamp: row.timestamp,
  };
}

function getNode(id) {
  const row = db
    .prepare('SELECT * FROM dag_nodes WHERE id = ?')
    .get(id);
  return mapRow(row);
}

function getAllNodes() {
  const rows = db.prepare('SELECT * FROM dag_nodes').all();
  return rows.map(mapRow);
}

function getRumors() {
  const rows = db
    .prepare("SELECT * FROM dag_nodes WHERE type = 'RUMOR'")
    .all();
  return rows.map(mapRow);
}

function getVotesForRumor(rumorId) {
  const rows = db
    .prepare("SELECT * FROM dag_nodes WHERE type = 'VOTE' AND parent_id = ?")
    .all(rumorId);
  return rows.map(mapRow);
}

module.exports = {
  addNode,
  getNode,
  getAllNodes,
  getRumors,
  getVotesForRumor,
  nowSeconds,
};


