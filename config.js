const path = require('path');

module.exports = {
  PORT:    3000,
  SECRET:  'bus-track-2026',
  DB_PATH: path.join(__dirname, 'bus.db'),
  ROLES:   ['admin', 'user'],
};
