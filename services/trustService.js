// Trust / reputation / feed computation based on ANON_README.md

const dagStore = require('../models/dagStore');
const userStore = require('../models/userStore');

const DECAY_LAMBDA = 0.03; // adjustable decay constant
const CONSENSUS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Build trust matrix C based on vote agreement between users
function buildTrustMatrix() {
  const users = userStore.getAllUsers();
  const userIds = users.map((u) => u.id);
  const indexById = Object.fromEntries(userIds.map((id, idx) => [id, idx]));
  const n = userIds.length;

  const agree = Array.from({ length: n }, () => Array(n).fill(0));
  const total = Array.from({ length: n }, () => Array(n).fill(0));

  const rumors = dagStore.getRumors();

  for (const rumor of rumors) {
    const votes = dagStore.getVotesForRumor(rumor.id);
    for (let i = 0; i < votes.length; i++) {
      for (let j = i + 1; j < votes.length; j++) {
        const vi = votes[i];
        const vj = votes[j];
        const ui = indexById[vi.voterId];
        const uj = indexById[vj.voterId];
        if (ui === undefined || uj === undefined) continue;

        total[ui][uj] += 1;
        total[uj][ui] += 1;
        if (vi.vote === vj.vote) {
          agree[ui][uj] += 1;
          agree[uj][ui] += 1;
        }
      }
    }
  }

  // Normalize per row to get C_ij
  const C = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      if (total[i][j] > 0) {
        C[i][j] = agree[i][j] / total[i][j];
        rowSum += C[i][j];
      }
    }
    if (rowSum > 0) {
      for (let j = 0; j < n; j++) {
        C[i][j] = C[i][j] / rowSum;
      }
    } else {
      // No data for this user: uniform small trust
      for (let j = 0; j < n; j++) {
        C[i][j] = 1 / n;
      }
    }
  }

  return { C, userIds, agree, total };
}

function eigenTrust(C, userIds, iterations = 10) {
  const n = userIds.length;
  if (n === 0) return {};

  // initialize t_0 uniformly
  let t = Array(n).fill(1 / n);

  for (let k = 0; k < iterations; k++) {
    const next = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        next[j] += C[i][j] * t[i];
      }
    }
    // normalize
    let sum = next.reduce((acc, v) => acc + v, 0);
    if (sum === 0) sum = 1;
    t = next.map((v) => v / sum);
  }

  const repMap = {};
  for (let i = 0; i < n; i++) {
    repMap[userIds[i]] = t[i];
  }
  return repMap;
}

function applyReputation() {
  const { C, userIds } = buildTrustMatrix();
  const repMap = eigenTrust(C, userIds);
  userStore.setReputations(repMap);
  return repMap;
}

function getDebugTrust() {
  const { C, userIds, agree, total } = buildTrustMatrix();
  const repMap = eigenTrust(C, userIds);

  const matrix = C.map((row, i) => ({
    from: userIds[i],
    to: userIds.map((id, j) => ({
      userId: id,
      c: row[j],
      agree: agree[i][j],
      total: total[i][j],
    })),
  }));

  return {
    users: userStore.getAllUsers().map((u) => ({
      id: u.id,
      reputation: repMap[u.id] ?? u.reputation,
    })),
    matrix,
  };
}

// Compute rumor trust score with exponential decay
function computeRumorScore(rumor, repMap) {
  const votes = dagStore.getVotesForRumor(rumor.id);
  if (!votes.length) {
    return 0.5; // neutral
  }

  let num = 0;
  let den = 0;
  for (const v of votes) {
    const rep = repMap[v.voterId] ?? 0.1;
    num += v.vote * rep;
    den += rep;
  }
  if (den === 0) return 0.5;

  const base = num / den;
  const now = dagStore.nowSeconds();
  const deltaT = now - rumor.timestamp; // seconds
  const hours = deltaT / 3600;
  const decay = Math.exp(-DECAY_LAMBDA * hours);

  const score = base * decay;
  return score;
}

function getFeed() {
  const users = userStore.getAllUsers();
  const repMap = Object.fromEntries(users.map((u) => [u.id, u.reputation]));

  const rumors = dagStore.getRumors();
  const items = rumors.map((r) => {
    const score = computeRumorScore(r, repMap);
    let state = 'NEUTRAL';
    if (score > 0.7) state = 'VERIFIED';
    else if (score < 0.3) state = 'DISPUTED';

    return {
      id: r.id,
      text: r.text,
      authorId: r.authorId,
      parentId: r.parentId,
      timestamp: r.timestamp,
      score,
      state,
    };
  });

  items.sort((a, b) => b.score - a.score);
  return items;
}

function runConsensusTick() {
  const repMap = applyReputation();
  const feed = getFeed();
  if (process.env.TRUST_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[trust] consensus tick', {
      users: Object.keys(repMap).length,
      rumors: feed.length,
    });
  }
  return { reputations: repMap, feedLength: feed.length };
}

// Background periodic consensus
setInterval(() => {
  try {
    runConsensusTick();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Consensus tick failed:', e.message);
  }
}, CONSENSUS_INTERVAL_MS);

module.exports = {
  getFeed,
  runConsensusTick,
  getDebugTrust,
};


