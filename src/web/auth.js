const config = require('../config');
const repo = require('../db/repo');

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });

  return list;
}

function extractApiToken(req) {
  const header = req.headers['x-api-key'] || req.headers['authorization'];
  if (!header) return '';
  if (header.startsWith('Bearer ')) return header.substring(7).trim();
  if (header.startsWith('token ')) return header.substring(6).trim();
  return String(header).trim();
}

function isAdminAuthed(req) {
  const settings = repo.ensureAdminSettings();

  // 1. Check Session Cookie (for browser UI)
  const cookies = parseCookies(req);
  const sessionToken = cookies.tf_admin_session;
  if (sessionToken) {
    const expected = Buffer.from(`${settings.username}:${settings.password_hash}`).toString('base64');
    if (sessionToken === expected) return true;
  }

  // 2. Check API Key (for programmatic API)
  const token = extractApiToken(req);
  if (token && token === settings.api_key) return true;

  return false;
}

module.exports = {
  parseCookies,
  extractApiToken,
  isAdminAuthed
};
