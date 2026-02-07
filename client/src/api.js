import axios from 'axios';

// The proxy in vite.config.js handles the domain, so we just need /api
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Identity Services ---
// Matches router.post('/auth/register')
export const registerEmail = (email) => api.post('/auth/register', { email });

// Matches router.post('/auth/onboard')
export const onboard = (publicKey, token) => api.post('/auth/onboard', { publicKey, token });

// Matches router.get('/users/:id')
export const getUser = (id) => api.get(`/users/${id}`).then(res => res.data);

// Matches router.get('/users/:id/mana')
export const getMana = (id) => api.get(`/users/${id}/mana`).then(res => res.data);

// --- Feed & DAG Services ---
// Matches router.get('/feed')
export const getFeed = () => api.get('/feed').then(res => res.data);

// Matches router.post('/rumors')
export const postRumor = (authorId, text) => api.post('/rumors', { authorId, text });

// Matches router.post('/rumors/:id/votes')
export const voteRumor = (rumorId, voterId, vote) => 
  api.post(`/rumors/${rumorId}/votes`, { voterId, vote });

// --- Network Services ---
// Matches router.get('/network/status')
export const getNetworkStatus = () => api.get('/network/status').then(res => res.data);

// ... existing code ...

// Matches router.post('/network/connect')
export const connectPeer = (url) => api.post('/network/connect', { url });

// ... existing exports ...

// Matches router.delete('/users/:id')
export const deleteIdentity = (id) => api.delete(`/users/${id}`);