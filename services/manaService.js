const userStore = require('../models/userStore');

function consumeMana(userId, amount) {
  return userStore.consumeMana(userId, amount);
}

function getMana(userId) {
  return userStore.getMana(userId);
}

module.exports = {
  consumeMana,
  getMana,
};


