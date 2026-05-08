const path = require('node:path');

const crypto = require('node:crypto');

module.exports = {
  PORT: process.env.PORT || 3382,
  SERVICE_NAME: 'LiteGist',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin888',
  API_KEY: process.env.API_KEY || crypto.randomBytes(16).toString('hex'),
  DB_PATH: path.join(__dirname, '../data/pastebin.sqlite'),
  SHARES_TEXT_DIR: path.join(__dirname, '../data/shares-text'),
  GISTS_DIR: path.join(__dirname, '../data/gists'),
  ADMIN_DIR: path.join(__dirname, '../admin'),
  DEFAULT_DATASET_ID: 'all'
};
