const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const db = require('./index');
const config = require('../config');
const utils = require('../utils');

// ── Git helpers ────────────────────────────────────────────────────────────

function getGistDir(gistId) {
  return path.join(config.GISTS_DIR, gistId);
}

function gitExec(repoPath, args, opts = {}) {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts
  });
}

function gitSafe(repoPath, args, opts = {}) {
  try {
    return gitExec(repoPath, args, opts);
  } catch (_) {
    return '';
  }
}

function gitCommit(dir, message, date) {
  const env = { ...process.env, GIT_COMMITTER_DATE: date };
  gitExec(dir, ['commit', '-m', message || 'update', `--date=${date}`], { env });
}

function gitHasHead(dir) {
  try { gitExec(dir, ['rev-parse', '--verify', 'HEAD']); return true; } catch (_) { return false; }
}

function gitInitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  gitExec(dir, ['init']);
  gitExec(dir, ['config', 'user.name', 'litegist']);
  gitExec(dir, ['config', 'user.email', 'litegist@localhost']);
}

function sanitizeGistFilename(filename) {
  const parts = String(filename || '').trim().split(/[/\\]/);
  const safe = parts.map(p => p.replace(/\.\./g, '_').replace(/\0/g, '')).join('/');
  return safe.replace(/^\/+/, '') || '';
}

function allRows(sql, ...args) {
  return db.prepare(sql).all(...args);
}

function runSql(sql, ...args) {
  return db.prepare(sql).run(...args);
}

function compactDatabase() {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
  } catch (_) {}
}

function ensureAdminSettings() {
  const row = db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
  if (row && row.password_hash) return row;
  const now = utils.nowIso();
  const hash = utils.sha256(config.ADMIN_PASSWORD);
  db.prepare('INSERT OR REPLACE INTO admin_settings(id, username, password_hash, api_key, history_retention_days, last_preview_dataset_id, updated_at) VALUES(1,?,?,?,30,?,?)').run(config.ADMIN_USERNAME, hash, config.API_KEY || '', 'all', now);
  return db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
}

function getAdminSettings() {
  return db.prepare('SELECT * FROM admin_settings WHERE id = 1').get();
}

function updateAdminSettings(username, password, apiKey) {
  const now = utils.nowIso();
  if (password) {
    const hash = utils.sha256(password);
    db.prepare('UPDATE admin_settings SET username = ?, password_hash = ?, api_key = ?, updated_at = ? WHERE id = 1')
      .run(username, hash, apiKey, now);
  } else {
    db.prepare('UPDATE admin_settings SET username = ?, api_key = ?, updated_at = ? WHERE id = 1')
      .run(username, apiKey, now);
  }
}

function createShare(slug, datasetId, snapshotId, nodeSid, password, expiresAt, accessToken) {
  const passHash = password ? utils.sha256(String(password).trim()) : '';
  const now = utils.nowIso();
  const exp = expiresAt ? String(expiresAt).trim() : '';
  const token = accessToken || '';
  db.prepare('INSERT INTO shares (slug, dataset_id, snapshot_id, node_sid, password_hash, expires_at, access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(slug, datasetId, snapshotId, nodeSid, passHash, exp, token, now);
  return db.prepare('SELECT * FROM shares WHERE slug = ?').get(slug);
}

function restoreShare(share) {
  db.prepare('INSERT OR REPLACE INTO shares (slug, dataset_id, snapshot_id, node_sid, password_hash, expires_at, access_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    share.slug, share.dataset_id, share.snapshot_id, share.node_sid, share.password_hash, share.expires_at, share.access_token, share.created_at
  );
}

function getShare(slug) {
  return db.prepare('SELECT * FROM shares WHERE slug = ?').get(slug);
}

function getSharesForDataset(datasetId) {
  if (datasetId === 'all') {
    return db.prepare('SELECT * FROM shares ORDER BY created_at DESC').all();
  }
  return db.prepare('SELECT * FROM shares WHERE dataset_id = ? ORDER BY created_at DESC').all(datasetId);
}

function updateShare(slug, datasetId, payload) {
  const updates = [];
  const params = [];
  const newSlug = String(payload.slug || slug).trim();
  
  if (payload.slug !== undefined) {
    updates.push('slug = ?');
    params.push(newSlug);
  }

  if (payload.password !== undefined) {
    if (payload.password !== '__KEEP_EXISTING_PASSWORD__') {
      updates.push('password_hash = ?');
      params.push(payload.password ? utils.sha256(String(payload.password).trim()) : '');
    }
  }

  if (payload.type !== undefined) {
    updates.push('node_sid = ?');
    params.push(String(payload.type || 'txt').trim().toLowerCase() || 'txt');
  }

  if (payload.expiresAt !== undefined) {
    updates.push('expires_at = ?');
    const exp = String(payload.expiresAt).trim();
    params.push(exp === '' ? '' : exp);
  }

  if (updates.length > 0) {
    params.push(slug);
    const sql = `UPDATE shares SET ${updates.join(', ')} WHERE slug = ?`;
    db.prepare(sql).run(...params);
  }

  return getShare(newSlug);
}

function deleteShares(slugs, datasetId) {
  db.exec('BEGIN');
  try {
    let deletedCount = 0;
    const stmt = db.prepare('DELETE FROM shares WHERE slug = ?');
    for (const slug of slugs) {
      const res = stmt.run(String(slug));
      deletedCount += res.changes;
    }
    db.exec('COMMIT');
    if (deletedCount > 0) compactDatabase();
    return deletedCount;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function makeHexId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function createUniqueGistId() {
  let id = '';
  do {
    id = makeHexId(16);
  } while (db.prepare('SELECT 1 FROM gists WHERE id = ?').get(id));
  return id;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes';
}

function normalizeFilesMap(files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
  return files;
}

function createGist(payload) {
  const now = utils.nowIso();
  const gistId = createUniqueGistId();
  const description = String(payload.description || '');
  const isPublic = normalizeBoolean(payload.public, false) ? 1 : 0;
  const accessToken = String(payload.accessToken || utils.mkId(32));
  const files = normalizeFilesMap(payload.files);

  db.prepare(`
    INSERT INTO gists (id, description, is_public, password_hash, access_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(gistId, description, isPublic, '', accessToken, now, now);

  const dir = getGistDir(gistId);
  try {
    gitInitRepo(dir);
    const toAdd = [];
    for (const [rawName, fileSpec] of Object.entries(files)) {
      if (!fileSpec || fileSpec.content === undefined || fileSpec.content === null) continue;
      const filename = sanitizeGistFilename(rawName);
      if (!filename) continue;
      const filePath = path.join(dir, filename);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, String(fileSpec.content), 'utf8');
      toAdd.push(filename);
    }
    if (toAdd.length > 0) {
      gitExec(dir, ['add', ...toAdd]);
      gitCommit(dir, description || 'init', now);
    }
  } catch (err) {
    db.prepare('DELETE FROM gists WHERE id = ?').run(gistId);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    throw err;
  }

  return getGist(gistId);
}

function getGist(gistId) {
  return db.prepare('SELECT * FROM gists WHERE id = ?').get(gistId);
}

function listGists() {
  return db.prepare('SELECT * FROM gists ORDER BY updated_at DESC').all();
}

function gitFileRecord(dir, gistId, filename) {
  const content = gitSafe(dir, ['show', `HEAD:${filename}`]);
  const lastSha = gitSafe(dir, ['log', '-1', '--format=%H', '--', filename]).trim();
  const lastTime = gitSafe(dir, ['log', '-1', '--format=%aI', '--', filename]).trim();
  const addTimes = gitSafe(dir, ['log', '--follow', '--diff-filter=A', '--format=%aI', '--', filename])
    .trim().split('\n').filter(Boolean);
  const firstTime = addTimes[addTimes.length - 1] || lastTime;
  return {
    gist_id: gistId,
    filename,
    current_version: lastSha,
    size: Buffer.byteLength(content, 'utf8'),
    created_at: firstTime,
    updated_at: lastTime,
    content
  };
}

function listGistCurrentFiles(gistId) {
  const dir = getGistDir(gistId);
  if (!fs.existsSync(path.join(dir, '.git')) || !gitHasHead(dir)) return [];
  const ls = gitSafe(dir, ['ls-files']).trim();
  if (!ls) return [];
  return ls.split('\n').filter(Boolean)
    .map(f => gitFileRecord(dir, gistId, f))
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }));
}

function getGistCurrentFile(gistId, filename) {
  const dir = getGistDir(gistId);
  if (!fs.existsSync(path.join(dir, '.git')) || !gitHasHead(dir)) return null;
  try { gitExec(dir, ['cat-file', '-e', `HEAD:${filename}`]); } catch (_) { return null; }
  return gitFileRecord(dir, gistId, filename);
}

function getGistFileVersion(gistId, filename, version) {
  const dir = getGistDir(gistId);
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  try { gitExec(dir, ['cat-file', '-e', `${version}:${filename}`]); } catch (_) { return null; }
  const content = gitSafe(dir, ['show', `${version}:${filename}`]);
  const commitTime = gitSafe(dir, ['log', '-1', '--format=%aI', version]).trim();
  return { gist_id: gistId, filename, version, content, size: Buffer.byteLength(content, 'utf8'), created_at: commitTime };
}

function listGistFileVersions(gistId, filename) {
  const dir = getGistDir(gistId);
  if (!fs.existsSync(path.join(dir, '.git')) || !gitHasHead(dir)) return [];
  const out = gitSafe(dir, ['log', '--follow', '--format=%H|%aI', '--', filename]).trim();
  if (!out) return [];
  return out.split('\n').filter(Boolean).map(line => {
    const bar = line.indexOf('|');
    const version = line.slice(0, bar).trim();
    const createdAt = line.slice(bar + 1).trim();
    const sizeStr = gitSafe(dir, ['cat-file', '-s', `${version}:${filename}`]).trim();
    return { version, size: parseInt(sizeStr, 10) || 0, created_at: createdAt };
  });
}

function getGistFileDiff(gistId, sha, filename) {
  const dir = getGistDir(gistId);
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  try { gitExec(dir, ['cat-file', '-e', sha]); } catch (_) { return null; }
  const args = ['show', '--format=', sha];
  if (filename) args.push('--', filename);
  const diff = gitSafe(dir, args).replace(/^\n+/, '');
  return { sha, filename: filename || '', diff };
}

function patchGist(gistId, payload) {
  const gist = getGist(gistId);
  if (!gist) return null;
  const files = normalizeFilesMap(payload.files);
  const now = utils.nowIso();
  const hasDescription = payload.description !== undefined;
  const hasPublic = payload.public !== undefined;
  const hasFiles = Object.keys(files).length > 0;

  if (hasDescription || hasPublic) {
    db.prepare('UPDATE gists SET description = ?, is_public = ?, updated_at = ? WHERE id = ?').run(
      hasDescription ? String(payload.description || '') : gist.description,
      hasPublic ? (normalizeBoolean(payload.public, !!gist.is_public) ? 1 : 0) : gist.is_public,
      now,
      gistId
    );
  }

  if (hasFiles) {
    const dir = getGistDir(gistId);
    if (!fs.existsSync(path.join(dir, '.git'))) gitInitRepo(dir);

    for (const [rawName, fileSpec] of Object.entries(files)) {
      const filename = sanitizeGistFilename(rawName);
      if (!filename) continue;
      if (fileSpec === null || (fileSpec && fileSpec.content === '')) {
        gitSafe(dir, ['rm', '-f', '--ignore-unmatch', filename]);
        continue;
      }
      if (fileSpec && fileSpec.content !== undefined && fileSpec.content !== null) {
        const filePath = path.join(dir, filename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, String(fileSpec.content), 'utf8');
        gitSafe(dir, ['add', filename]);
      }
    }

    const staged = gitHasHead(dir)
      ? gitSafe(dir, ['diff', '--cached', '--name-only']).trim()
      : gitSafe(dir, ['status', '--porcelain']).trim();
    if (staged) {
      gitCommit(dir, String(payload.description !== undefined ? payload.description : gist.description) || 'update', now);
      db.prepare('UPDATE gists SET updated_at = ? WHERE id = ?').run(now, gistId);
    }
  }

  if (!hasDescription && !hasPublic && !hasFiles) {
    db.prepare('UPDATE gists SET updated_at = ? WHERE id = ?').run(now, gistId);
  }

  return getGist(gistId);
}

function getGistWithFiles(gistId) {
  const gist = getGist(gistId);
  if (!gist) return null;
  const files = listGistCurrentFiles(gistId);
  return { gist, files };
}

function deleteGist(gistId) {
  const changes = db.prepare('DELETE FROM gists WHERE id = ?').run(gistId).changes;
  if (changes > 0) {
    const dir = getGistDir(gistId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    compactDatabase();
  }
  return changes;
}

function restoreGist(gist) {
  db.prepare('INSERT OR REPLACE INTO gists (id, description, is_public, password_hash, access_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    gist.id, gist.description, gist.is_public, gist.password_hash || '', gist.access_token, gist.created_at, gist.updated_at
  );
}

function restoreGistFileVersion(ver) {
  const dir = getGistDir(ver.gist_id);
  if (!fs.existsSync(path.join(dir, '.git'))) gitInitRepo(dir);
  const filename = sanitizeGistFilename(ver.filename);
  if (!filename) return;
  const filePath = path.join(dir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(ver.content || ''), 'utf8');
  gitSafe(dir, ['add', filename]);
  try { gitCommit(dir, 'restore', ver.created_at || utils.nowIso()); } catch (_) {}
}

function restoreGistCurrentFiles(gistId, files) {
  const dir = getGistDir(gistId);
  if (!fs.existsSync(path.join(dir, '.git'))) gitInitRepo(dir);
  const toAdd = [];
  for (const file of files) {
    const filename = sanitizeGistFilename(file.filename);
    if (!filename) continue;
    const filePath = path.join(dir, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, String(file.content || ''), 'utf8');
    toAdd.push(filename);
  }
  if (toAdd.length > 0) {
    gitExec(dir, ['add', ...toAdd]);
    try { gitCommit(dir, 'restore', files[0]?.updated_at || utils.nowIso()); } catch (_) {}
  }
}

function listAllGistCurrentFiles() {
  const gists = listGists();
  const result = [];
  for (const gist of gists) {
    const files = listGistCurrentFiles(gist.id);
    for (const f of files) {
      result.push({ gist_id: f.gist_id, filename: f.filename, content: f.content, size: f.size, created_at: f.created_at, updated_at: f.updated_at, version: f.current_version });
    }
  }
  return result;
}

module.exports = {
  allRows,
  runSql,
  ensureAdminSettings,
  getAdminSettings,
  updateAdminSettings,
  createShare,
  restoreShare,
  getShare,
  getSharesForDataset,
  updateShare,
  deleteShares,
  createGist,
  getGist,
  listGists,
  listGistCurrentFiles,
  getGistCurrentFile,
  getGistFileVersion,
  listGistFileVersions,
  getGistFileDiff,
  patchGist,
  getGistWithFiles,
  deleteGist,
  restoreGist,
  restoreGistFileVersion,
  restoreGistCurrentFiles,
  listAllGistCurrentFiles
};
