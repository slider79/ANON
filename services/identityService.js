const userStore = require('../models/userStore');

function registerEmail(email) {
  // Simulates the Auth Oracle issuing a blind-signed token
  return userStore.issueTokenForEmail(email);
}

function onboardNode(publicKey, token) {
  return userStore.onboardNode(publicKey, token);
}

module.exports = {
  registerEmail,
  onboardNode,
};


