const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

// Ensure data directory exists
fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });

const db = new DatabaseSync(config.DB_PATH);

// Initialize schema (inline for simplicity or read from file)
const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shares (
  slug TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL,
  node_sid TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  history_retention_days INTEGER NOT NULL DEFAULT 30,
  last_preview_dataset_id TEXT NOT NULL DEFAULT 'all',
  allow_share_download INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_shares_created ON shares(created_at DESC);

CREATE TABLE IF NOT EXISTS gists (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gists_updated ON gists(updated_at DESC);
`;

db.exec(schema);

// Performance optimizations
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

module.exports = db;
