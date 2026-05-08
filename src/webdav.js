const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const repo = require('./db/repo');

const SETTINGS_FILE = path.join(__dirname, '../data/webdav.json');

function getSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return { url: '', username: '', password: '', encryptKey: '', autoBackupIntervalHours: 0 };
  }
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (!s.autoBackupIntervalHours) s.autoBackupIntervalHours = 0;
    return s;
  } catch (e) {
    return { url: '', username: '', password: '', encryptKey: '', autoBackupIntervalHours: 0 };
  }
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// AES-256-GCM Encryption
function encrypt(text, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted
  });
}

function decrypt(encryptedJson, password) {
  const { salt, iv, authTag, data } = JSON.parse(encryptedJson);
  const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Generate the Backup JSON
function createBackupPayload() {
  const shares = repo.getSharesForDataset('all');
  const sharesPayload = shares.map(share => {
    const filePath = path.join(config.SHARES_TEXT_DIR, share.slug + '.txt');
    let content = '';
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }
    return { ...share, _content: content };
  });

  const gists = repo.listGists();
  const gistCurrentFiles = repo.listAllGistCurrentFiles();

  return JSON.stringify({
    version: 3,
    timestamp: Date.now(),
    shares: sharesPayload,
    gists,
    gistCurrentFiles
  });
}

// Restore from Backup JSON
function restoreBackupPayload(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data || !data.shares || !Array.isArray(data.shares)) {
    throw new Error('Invalid backup format');
  }

  data.shares.forEach(share => {
    const content = share._content;
    delete share._content;
    repo.restoreShare(share);
    const filePath = path.join(config.SHARES_TEXT_DIR, share.slug + '.txt');
    if (content !== undefined) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  });

  if (Array.isArray(data.gists)) {
    data.gists.forEach(gist => repo.restoreGist(gist));
  }
  if (Array.isArray(data.gistCurrentFiles)) {
    // v3 format: current state only, one commit per gist
    const byGist = {};
    data.gistCurrentFiles.forEach(f => {
      if (!byGist[f.gist_id]) byGist[f.gist_id] = [];
      byGist[f.gist_id].push(f);
    });
    for (const [gistId, files] of Object.entries(byGist)) {
      repo.restoreGistCurrentFiles(gistId, files);
    }
  } else if (Array.isArray(data.gistFileVersions)) {
    // v2 format: replay all versions in chronological order
    const sorted = [...data.gistFileVersions].sort((a, b) =>
      (a.created_at || '').localeCompare(b.created_at || '')
    );
    sorted.forEach(ver => repo.restoreGistFileVersion(ver));
  }
}

let _timer = null;
let _lastBackupAt = null;
let _lastBackupError = null;

function stopScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function startScheduler() {
  stopScheduler();
  const hours = Number(getSettings().autoBackupIntervalHours) || 0;
  if (!hours) return;
  const ms = hours * 60 * 60 * 1000;
  _timer = setInterval(async () => {
    try {
      await doBackup();
      _lastBackupAt = new Date().toISOString();
      _lastBackupError = null;
      console.log('[webdav] Auto backup completed');
    } catch (e) {
      _lastBackupError = e.message;
      console.error('[webdav] Auto backup failed:', e.message);
    }
  }, ms);
  console.log(`[webdav] Auto backup scheduled every ${hours}h`);
}

function getAutoBackupStatus() {
  return {
    intervalHours: Number(getSettings().autoBackupIntervalHours) || 0,
    active: !!_timer,
    lastBackupAt: _lastBackupAt,
    lastBackupError: _lastBackupError
  };
}

async function doBackup() {
  const settings = getSettings();
  if (!settings.url || !settings.username || !settings.password || !settings.encryptKey) {
    throw new Error('WebDAV settings incomplete');
  }
  
  const payloadStr = createBackupPayload();
  const encrypted = encrypt(payloadStr, settings.encryptKey);
  
  let targetUrl = settings.url;
  if (!targetUrl.endsWith('/')) targetUrl += '/';
  targetUrl += 'litegist_backup.enc';
  
  const auth = Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
  
  const res = await fetch(targetUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Basic ${auth}` },
    body: encrypted
  });
  
  if (!res.ok) throw new Error(`WebDAV PUT failed: ${res.status} ${res.statusText}`);
}

async function doRestore() {
  const settings = getSettings();
  if (!settings.url || !settings.username || !settings.password || !settings.encryptKey) {
    throw new Error('WebDAV settings incomplete');
  }
  
  let targetUrl = settings.url;
  if (!targetUrl.endsWith('/')) targetUrl += '/';
  targetUrl += 'litegist_backup.enc';
  
  const auth = Buffer.from(`${settings.username}:${settings.password}`).toString('base64');
  
  const res = await fetch(targetUrl, {
    method: 'GET',
    headers: { 'Authorization': `Basic ${auth}` }
  });
  
  if (!res.ok) throw new Error(`WebDAV GET failed: ${res.status} ${res.statusText}`);
  
  const encryptedText = await res.text();
  const decrypted = decrypt(encryptedText, settings.encryptKey);
  restoreBackupPayload(decrypted);
}

module.exports = {
  getSettings,
  saveSettings,
  doBackup,
  doRestore,
  encrypt,
  decrypt,
  createBackupPayload,
  restoreBackupPayload,
  startScheduler,
  stopScheduler,
  getAutoBackupStatus
};
