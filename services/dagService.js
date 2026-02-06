const dagStore = require('../models/dagStore');

function createRumor({ authorId, text, parentId }) {
  if (!authorId) throw new Error('authorId is required');
  if (!text || typeof text !== 'string' || text.length > 500) {
    throw new Error('Rumor text is required and must be <= 500 chars');
  }

  const node = dagStore.addNode({
    type: 'RUMOR',
    authorId,
    text,
    parentId: parentId || null,
  });

  return node;
}

function createVote({ parentId, voterId, vote, evidence }) {
  if (!parentId) throw new Error('parentId (rumor id) is required');
  if (!voterId) throw new Error('voterId is required');
  if (vote !== 1 && vote !== -1) {
    throw new Error('vote must be +1 or -1');
  }

  const rumor = dagStore.getNode(parentId);
  if (!rumor || rumor.type !== 'RUMOR') {
    throw new Error('Rumor not found');
  }

  const node = dagStore.addNode({
    type: 'VOTE',
    parentId,
    voterId,
    vote,
    evidence: evidence || null,
  });

  return node;
}

module.exports = {
  createRumor,
  createVote,
};


