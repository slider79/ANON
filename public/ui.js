const API_BASE = '/api';

const state = {
  user: null,
  mana: null,
  feed: [],
  peers: 0,
};

function $(id) {
  return document.getElementById(id);
}

function showToast(title, message) {
  const root = $('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<strong>${title}</strong>${message}`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => root.removeChild(el), 200);
  }, 2600);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

function saveUserToStorage(user) {
  localStorage.setItem('anonUser', JSON.stringify(user));
}

function loadUserFromStorage() {
  const raw = localStorage.getItem('anonUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderIdentitySection() {
  const container = $('identity-section');
  if (!container) return;
  container.innerHTML = '';

  if (!state.user) {
    const wrapper = document.createElement('div');
    wrapper.className = 'stack';
    wrapper.innerHTML = `
      <div>
        <label>Email (.edu)</label>
        <input id="email-input" type="email" placeholder="you@university.edu" />
      </div>
      <div class="row">
        <button id="join-btn" class="grow">Join ANON</button>
      </div>
      <div class="hint">
        A blind-like token is issued for your email, then we discard the email and only keep an anonymous key.
      </div>
    `;
    container.appendChild(wrapper);
    $('join-btn').onclick = handleJoin;
  } else {
    const shortId = `${state.user.id.slice(0, 8)}…${state.user.id.slice(-4)}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'stack';
    wrapper.innerHTML = `
      <div class="row wrap">
        <div class="grow">
          <div class="hint">Node ID</div>
          <div style="font-size:13px;font-family:mono;">${shortId}</div>
        </div>
        <div>
          <div class="hint">Reputation (local)</div>
          <div class="badge">${(state.user.reputation ?? 0.1).toFixed(3)}</div>
        </div>
      </div>
      <div class="hint">
        This browser stores your anonymous identity locally. Clear storage to reset.
      </div>
    `;
    container.appendChild(wrapper);
  }
}

async function handleJoin() {
  const emailInput = $('email-input');
  if (!emailInput) return;
  const email = emailInput.value.trim();
  if (!email) {
    showToast('Missing email', 'Enter your institutional email to join.');
    return;
  }
  try {
    const { token } = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    // For this prototype, use a random string as the "public key"
    const publicKey = `pk-${crypto.randomUUID()}`;
    const user = await api('/auth/onboard', {
      method: 'POST',
      body: JSON.stringify({ publicKey, token }),
    });
    state.user = user;
    saveUserToStorage(user);
    renderIdentitySection();
    await refreshMana();
    await refreshFeed();
    showToast('Joined', 'You are now an anonymous node in the network.');
  } catch (e) {
    showToast('Join failed', e.message);
  }
}

async function refreshMana() {
  if (!state.user) return;
  try {
    const mana = await api(`/users/${state.user.id}/mana`);
    state.mana = mana;
    const badge = $('mana-badge');
    if (badge) {
      badge.textContent = `Mana: ${mana.mana}`;
    }
  } catch {
    // ignore
  }
}

function scoreToBadge(score) {
  if (score > 0.7) return { text: 'VERIFIED', cls: 'good' };
  if (score < 0.3) return { text: 'DISPUTED', cls: 'bad' };
  return { text: 'NEUTRAL', cls: '' };
}

function renderFeed() {
  const root = $('feed');
  if (!root) return;
  root.innerHTML = '';
  if (!state.feed.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No rumors yet. Be the first to post!';
    root.appendChild(empty);
    return;
  }

  for (const item of state.feed) {
    const { text, score, state: status, id, authorId, timestamp } = item;
    const { text: label, cls } = scoreToBadge(score);
    const el = document.createElement('article');
    el.className = 'rumor';
    const shortAuthor = `${authorId.slice(0, 6)}…${authorId.slice(-4)}`;
    const dt = new Date(timestamp * 1000);
    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `
      <div class="rumor-header">
        <span class="rumor-text">${text}</span>
        <span class="badge ${cls}">${label}</span>
      </div>
      <div class="rumor-meta">
        <span>by <code>${shortAuthor}</code> • ${timeStr}</span>
        <div class="row">
          <div class="score-bar">
            <div class="score-bar-fill" style="width:${Math.max(
              0,
              Math.min(1, (score + 1) / 2)
            ) * 100}%;"></div>
          </div>
          <span style="font-size:11px;">${score.toFixed(2)}</span>
          <button class="secondary" data-action="vote" data-id="${id}" data-v="1">⬆</button>
          <button class="secondary" data-action="vote" data-id="${id}" data-v="-1">⬇</button>
        </div>
      </div>
    `;
    root.appendChild(el);
  }
}

async function refreshFeed() {
  try {
    const feed = await api('/feed');
    state.feed = Array.isArray(feed) ? feed : feed.items || [];
    renderFeed();
  } catch (e) {
    showToast('Feed error', e.message);
  }
}

async function refreshNetworkStatus() {
  try {
    const status = await api('/network/status');
    const peers = status.peers?.length || 0;
    state.peers = peers;
    const badge = $('peer-badge');
    if (badge) badge.textContent = `Peers: ${peers}`;
    const headerStatus = $('header-status');
    if (headerStatus) {
      headerStatus.innerHTML = '';
      const node = document.createElement('span');
      node.className = 'badge';
      node.textContent = `Node: ${status.nodeId.slice(0, 8)}…`;
      headerStatus.appendChild(node);
    }
    const onlineIndicator = $('online-indicator');
    const onlineLabel = $('online-label');
    if (onlineIndicator && onlineLabel) {
      onlineIndicator.style.color = '#22c55e';
      onlineLabel.textContent = 'Online';
    }
  } catch {
    const onlineIndicator = $('online-indicator');
    const onlineLabel = $('online-label');
    if (onlineIndicator && onlineLabel) {
      onlineIndicator.style.color = '#f97373';
      onlineLabel.textContent = 'Offline';
    }
  }
}

async function handlePostRumor() {
  if (!state.user) {
    showToast('No identity', 'Join ANON first to post rumors.');
    return;
  }
  const textArea = $('rumor-text');
  if (!textArea) return;
  const text = textArea.value.trim();
  if (!text) {
    showToast('Empty rumor', 'Write something before posting.');
    return;
  }
  try {
    $('post-rumor-btn').disabled = true;
    const node = await api('/rumors', {
      method: 'POST',
      body: JSON.stringify({
        authorId: state.user.id,
        text,
      }),
    });
    textArea.value = '';
    updateRumorHint();
    showToast('Posted', 'Rumor broadcast to the network.');
    await refreshMana();
    await refreshFeed();
  } catch (e) {
    showToast('Post failed', e.message);
  } finally {
    $('post-rumor-btn').disabled = false;
  }
}

async function handleVote(rumorId, vote) {
  if (!state.user) {
    showToast('No identity', 'Join ANON first to vote.');
    return;
  }
  try {
    const body = { voterId: state.user.id, vote };
    await api(`/rumors/${encodeURIComponent(rumorId)}/votes`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    showToast(vote === 1 ? 'Verified' : 'Disputed', 'Your vote has been recorded.');
    await refreshMana();
    await refreshFeed();
  } catch (e) {
    showToast('Vote failed', e.message);
  }
}

function updateRumorHint() {
  const textArea = $('rumor-text');
  const hint = $('rumor-hint');
  if (!textArea || !hint) return;
  hint.textContent = `${textArea.value.length} / 500`;
}

function attachHandlers() {
  const postBtn = $('post-rumor-btn');
  if (postBtn) postBtn.onclick = handlePostRumor;
  const refreshBtn = $('refresh-btn');
  if (refreshBtn) refreshBtn.onclick = () => {
    refreshFeed();
    refreshNetworkStatus();
    refreshMana();
  };
  const textArea = $('rumor-text');
  if (textArea) textArea.addEventListener('input', updateRumorHint);

  const feedRoot = $('feed');
  if (feedRoot) {
    feedRoot.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (action === 'vote') {
        const id = target.dataset.id;
        const v = Number(target.dataset.v);
        if (id && (v === 1 || v === -1)) {
          handleVote(id, v);
        }
      }
    });
  }
}

async function init() {
  state.user = loadUserFromStorage();
  renderIdentitySection();
  attachHandlers();
  updateRumorHint();

  await refreshNetworkStatus();
  if (state.user) {
    await refreshMana();
  }
  await refreshFeed();

  // Periodic lightweight refreshes
  setInterval(() => {
    refreshNetworkStatus();
    refreshMana();
    refreshFeed();
  }, 15000);
}

window.addEventListener('load', init);


