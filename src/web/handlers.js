const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const config = require('../config');
const utils = require('../utils');
const repo = require('../db/repo');
const auth = require('./auth');
const { formatLabel } = require('./subconverter');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(text);
}

function sendHtmlGzip(req, res, html) {
  const accepts = req.headers['accept-encoding'] || '';
  if (accepts.includes('gzip')) {
    zlib.gzip(Buffer.from(html, 'utf8'), (err, buf) => {
      if (err) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
      res.end(buf);
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}

function getSubscriptionUserinfo(content) {
  const infoMatch = content.match(/^#\s*(upload=\d+;\s*download=\d+;\s*total=\d+;\s*expire=\d+)/m);
  return infoMatch ? infoMatch[1].replace(/\s/g, '') : '';
}

function serveStaticFile(req, res, filePath, contentType) {
  if (!fs.existsSync(filePath)) return notFound(res);
  const ext = path.extname(filePath).toLowerCase();
  const mime = contentType || {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8'
  }[ext] || 'text/plain';

  const accepts = req.headers['accept-encoding'] || '';
  const shouldCompress = accepts.includes('gzip') && 
    (mime.startsWith('text/') || mime.includes('javascript') || mime.includes('json') || mime.includes('svg'));

  if (shouldCompress) {
    res.writeHead(200, { 
      'Content-Type': mime,
      'Content-Encoding': 'gzip',
      'Vary': 'Accept-Encoding'
    });
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  }
}

function notFound(res) {
  sendJson(res, 404, { ok: false, error: 'Not Found' });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    req.setEncoding('utf8');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

async function handleAdminLogin(req, res) {
  const body = await readJsonBody(req);
  const settings = repo.ensureAdminSettings();
  const passHash = utils.sha256(body.password);

  if (body.username === settings.username && passHash === settings.password_hash) {
    const sessionToken = Buffer.from(`${settings.username}:${settings.password_hash}`).toString('base64');
    res.setHeader('Set-Cookie', `tf_admin_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=864000`);
    sendJson(res, 200, { ok: true });
  } else {
    sendJson(res, 401, { ok: false, error: 'Invalid credentials' });
  }
}

function handleAdminLogout(req, res) {
  res.setHeader('Set-Cookie', 'tf_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.writeHead(302, { Location: '/admin/login' });
  res.end();
}

async function handleAdminGenerateTextShare(req, res) {
  const body = await readJsonBody(req);
  const content = String(body.content || '');
  if (!content) return sendJson(res, 400, { ok: false, error: 'Content is required' });

  const slug = String(body.slug || '').trim() || utils.mkId(8);
  const password = String(body.password || '');
  const expiresAt = String(body.expiresAt || '');
  const type = String(body.type || 'txt').toLowerCase();
  const accessToken = utils.mkId(32);

  try {
    utils.mkdirRecursive(config.SHARES_TEXT_DIR);
    const filePath = path.join(config.SHARES_TEXT_DIR, slug + '.txt');
    fs.writeFileSync(filePath, content, 'utf8');

    repo.createShare(slug, 'all', -1, type, password, expiresAt, accessToken);

    sendJson(res, 200, {
      ok: true,
      shareUrl: `/text/${slug}`,
      rawUrl: `/${slug}/raw`,
      tokenRawUrl: `/token:${accessToken}/${slug}/raw`,
      token: accessToken
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return sendJson(res, 400, { ok: false, error: 'Slug already in use' });
    }
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

function handleAdminGetShares(req, res) {
  const shares = repo.getSharesForDataset('all').map(s => ({
    slug: s.slug,
    datasetId: s.dataset_id,
    snapshotId: s.snapshot_id,
    nodeSid: s.node_sid,
    hasPassword: !!s.password_hash,
    token: s.access_token,
    expiresAt: s.expires_at,
    createdAt: s.created_at
  }));
  sendJson(res, 200, { ok: true, shares });
}

function handleAdminGetShare(req, res, slug) {
  const share = repo.getShare(slug);
  if (!share) return sendJson(res, 404, { ok: false, error: 'Not found' });

  let content = '';
  try {
    const filePath = path.join(config.SHARES_TEXT_DIR, share.slug + '.txt');
    if (fs.existsSync(filePath)) content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {}

  sendJson(res, 200, {
    ok: true,
    share: {
      slug: share.slug,
      type: share.node_sid || 'txt',
      hasPassword: !!share.password_hash,
      expiresAt: share.expires_at,
      createdAt: share.created_at,
      token: share.access_token,
      content
    }
  });
}

async function handleAdminDeleteShares(req, res) {
  const body = await readJsonBody(req);
  const slugs = Array.isArray(body.slugs) ? body.slugs : [];

  for (const slug of slugs) {
    try {
      const filePath = path.join(config.SHARES_TEXT_DIR, slug + '.txt');
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) { }
  }

  const deletedCount = repo.deleteShares(slugs, 'all');
  sendJson(res, 200, { ok: true, deletedCount });
}

async function handleAdminUpdateShare(req, res, slug) {
  const body = await readJsonBody(req);
  const newSlug = String(body.slug || slug).trim();

  const oldShare = repo.getShare(slug);
  if (!oldShare) return sendJson(res, 404, { ok: false, error: 'Not found' });
  if (newSlug !== slug && repo.getShare(newSlug)) {
    return sendJson(res, 409, { ok: false, error: 'Slug already in use' });
  }

  try {
    if (newSlug !== slug) {
      const oldPath = path.join(config.SHARES_TEXT_DIR, slug + '.txt');
      const newPath = path.join(config.SHARES_TEXT_DIR, newSlug + '.txt');
      if (fs.existsSync(oldPath)) {
        utils.mkdirRecursive(config.SHARES_TEXT_DIR);
        fs.renameSync(oldPath, newPath);
      }
    }
    if (body.content !== undefined) {
      const targetPath = path.join(config.SHARES_TEXT_DIR, newSlug + '.txt');
      utils.mkdirRecursive(config.SHARES_TEXT_DIR);
      fs.writeFileSync(targetPath, String(body.content), 'utf8');
    }
    repo.updateShare(slug, 'all', body);
    sendJson(res, 200, { ok: true, slug: newSlug });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

function handlePublicGetTextShare(req, res, slug) {
  const share = repo.getShare(slug);
  if (!share || share.snapshot_id != -1) return notFound(res);

  if (share.expires_at) {
    const expDate = new Date(share.expires_at);
    if (!isNaN(expDate.getTime()) && new Date() > expDate) {
      return sendJson(res, 410, { ok: false, error: 'Expired' });
    }
  }

  let needsAuth = false;
  if (share.password_hash) {
    const cookies = auth.parseCookies(req);
    const expectedAuth = utils.sha256(slug + '|' + share.password_hash);
    const authCookie = cookies['tf_share_' + utils.sha256(slug).slice(0, 24)];
    if (authCookie !== expectedAuth) needsAuth = true;
  }

  let content = '';
  if (!needsAuth) {
    try {
      content = fs.readFileSync(path.join(config.SHARES_TEXT_DIR, slug + '.txt'), 'utf8');
    } catch (e) {
      return notFound(res);
    }
  }

  const templatePath = path.join(config.ADMIN_DIR, 'text_share.html');
  if (fs.existsSync(templatePath)) {
    let html = fs.readFileSync(templatePath, 'utf8');

    // 大文本优化：超过 50KB 时不内联内容，改为前端异步加载
    const isLargeContent = content.length > 50000;
    const inlineContent = isLargeContent ? '' : utils.htmlEscape(content);

    html = html.replace(/__CONTENT__/g, inlineContent);
    html = html.replace(/__SLUG__/g, utils.htmlEscape(slug));
    html = html.replace(/__LARGE__/g, isLargeContent ? 'true' : 'false');
    const type = share.node_sid || 'txt';
    html = html.replace(/__TITLE_TYPE__/g, type.toUpperCase());
    html = html.replace(/__BADGE_TYPE__/g, type.toUpperCase());
    html = html.replace(/__PAGE_TITLE__/g, `LiteGist | ${slug}`);
    html = html.replace(/__TYPE__/g, type);
    html = html.replace(/__TOKEN__/g, share.access_token || '');
    html = html.replace(/__NEEDS_AUTH__/g, needsAuth ? 'true' : 'false');
    html = html.replace(/__HAS_PASS__/g, share.password_hash ? 'true' : 'false');

    sendHtmlGzip(req, res, html);
  } else {
    if (needsAuth) return sendJson(res, 401, { ok: false, error: 'Password required' });
    sendText(res, 200, content);
  }
}

async function handlePublicAuthShare(req, res, slug) {
  const share = repo.getShare(slug);
  if (!share) return notFound(res);
  const body = await readJsonBody(req);
  const passHash = utils.sha256(body.password);

  if (passHash === share.password_hash) {
    const authValue = utils.sha256(slug + '|' + share.password_hash);
    const cookieName = 'tf_share_' + utils.sha256(slug).slice(0, 24);
    res.setHeader('Set-Cookie', `${cookieName}=${authValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=864000`);
    sendJson(res, 200, { ok: true });
  } else {
    sendJson(res, 401, { ok: false, error: 'Invalid password' });
  }
}

function handlePublicGetRawText(req, res, slug, tokenFromUrl, isB64 = false) {
  const share = repo.getShare(slug);
  if (!share) return notFound(res);

  let authorized = false;
  if (!share.password_hash) {
    authorized = true;
  } else {
    if (tokenFromUrl && (tokenFromUrl === share.access_token || utils.sha256(tokenFromUrl) === share.password_hash)) {
      authorized = true;
    } else {
      const cookies = auth.parseCookies(req);
      const expectedAuth = utils.sha256(slug + '|' + share.password_hash);
      const authCookie = cookies['tf_share_' + utils.sha256(slug).slice(0, 24)];
      if (authCookie === expectedAuth) authorized = true;
    }
  }

  if (!authorized) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  try {
    const filePath = path.join(config.SHARES_TEXT_DIR, slug + '.txt');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const headers = {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      };

      const subscriptionUserinfo = getSubscriptionUserinfo(content);
      if (subscriptionUserinfo) headers['subscription-userinfo'] = subscriptionUserinfo;
      if (isB64) {
        if (share.node_sid === 'sub') {
          headers['content-disposition'] = `attachment; filename="${slug}"`;
          const subconverter = require('./subconverter');
          const result = subconverter.convert(content, 'b64');
          if (result.error) return sendText(res, 400, result.error, 'text/plain; charset=utf-8');
          res.writeHead(200, headers);
          return res.end(result.output);
        }

        headers['content-disposition'] = `attachment; filename="${slug}"`;
        // 自动转换逻辑：支持 Surge, Loon, QX 格式转为标准 URI，实现全平台订阅兼容
        const lines = content.split('\n');
        const converted = lines.map(line => {
          const l = line.trim();
          if (!l || l.startsWith('#') || l.startsWith('//')) return line;

          // 1. 匹配 Surge/Loon Trojan 格式: Name = trojan, host, port, password=xxx, sni=xxx
          const surgeMatch = l.match(/^([^=]+)=\s*trojan\s*,\s*([^,]+)\s*,\s*(\d+)\s*,\s*password\s*=\s*([^,]+)(.*)/i);
          if (surgeMatch) {
            const [_, name, host, port, pass, rest] = surgeMatch;
            const sniM = rest.match(/sni\s*=\s*([^, ]+)/i);
            const sni = sniM ? sniM[1] : host.trim();
            return `trojan://${pass.trim()}@${host.trim()}:${port.trim()}?sni=${sni}#${encodeURIComponent(name.trim())}`;
          }

          // 2. 匹配 Quantumult X (QX) Trojan 格式: trojan=host:port, password=xxx, over-tls=true, tls-host=xxx, tag=Name
          const qxMatch = l.match(/^trojan\s*=\s*([^:]+):(\d+)\s*,\s*password\s*=\s*([^,]+)(.*)tag\s*=\s*([^,]+)/i);
          if (qxMatch) {
            const [_, host, port, pass, rest, tag] = qxMatch;
            const sniM = rest.match(/tls-host\s*=\s*([^, ]+)/i);
            const sni = sniM ? sniM[1] : host.trim();
            return `trojan://${pass.trim()}@${host.trim()}:${port.trim()}?sni=${sni}#${encodeURIComponent(tag.trim())}`;
          }

          return line;
        }).join('\n');
        const b64 = Buffer.from(converted.trim()).toString('base64');
        res.writeHead(200, headers);
        res.end(b64);
      } else {
        res.writeHead(200, headers);
        res.end(content);
      }
    } else {
      sendJson(res, 200, { ok: true, slug: share.slug, datasetId: share.dataset_id });
    }
  } catch (e) {
    notFound(res);
  }
}

function handlePublicGetSubConvert(req, res, slug, tokenFromUrl, format) {
  const share = repo.getShare(slug);
  if (!share) return notFound(res);

  let authorized = false;
  if (!share.password_hash) {
    authorized = true;
  } else {
    if (tokenFromUrl && (tokenFromUrl === share.access_token || utils.sha256(tokenFromUrl) === share.password_hash)) {
      authorized = true;
    } else {
      const cookies = auth.parseCookies(req);
      const expectedAuth = utils.sha256(slug + '|' + share.password_hash);
      const authCookie = cookies['tf_share_' + utils.sha256(slug).slice(0, 24)];
      if (authCookie === expectedAuth) authorized = true;
    }
  }

  if (!authorized) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  if (share.node_sid !== 'sub') {
    return sendText(res, 400,
      'Subscription conversion is not enabled for this share. Please set the type to "Subscription" when creating.',
      'text/plain; charset=utf-8'
    );
  }

  try {
    const filePath = path.join(config.SHARES_TEXT_DIR, slug + '.txt');
    if (!fs.existsSync(filePath)) return notFound(res);
    const content = fs.readFileSync(filePath, 'utf8');

    const subconverter = require('./subconverter');
    const result = subconverter.convert(content, format);

    if (result.error) {
      return sendText(res, 400, result.error, 'text/plain; charset=utf-8');
    }

    const headers = {
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename="${formatLabel(format)}-${slug}.txt"`,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    };
    const subscriptionUserinfo = getSubscriptionUserinfo(content);
    if (subscriptionUserinfo) headers['subscription-userinfo'] = subscriptionUserinfo;

    res.writeHead(200, headers);
    res.end(result.output);
  } catch (e) {
    notFound(res);
  }
}

function handleGetWebdavSettings(req, res) {
  const webdav = require('../webdav');
  const settings = webdav.getSettings();
  const status = webdav.getAutoBackupStatus();
  sendJson(res, 200, {
    ok: true,
    settings: {
      url: settings.url,
      username: settings.username,
      password: settings.password ? '••••••' : '',
      encryptKey: settings.encryptKey ? '••••••' : '',
      autoBackupIntervalHours: settings.autoBackupIntervalHours || 0
    },
    autoBackup: status
  });
}

async function handleSaveWebdavSettings(req, res) {
  const webdav = require('../webdav');
  const body = await readJsonBody(req);
  const current = webdav.getSettings();
  const settings = {
    url: body.url !== undefined ? body.url : current.url,
    username: body.username !== undefined ? body.username : current.username,
    password: (body.password && body.password !== '••••••') ? body.password : current.password,
    encryptKey: (body.encryptKey && body.encryptKey !== '••••••') ? body.encryptKey : current.encryptKey,
    autoBackupIntervalHours: body.autoBackupIntervalHours !== undefined ? Number(body.autoBackupIntervalHours) : (current.autoBackupIntervalHours || 0)
  };
  webdav.saveSettings(settings);
  webdav.startScheduler();
  sendJson(res, 200, { ok: true });
}

async function handleWebdavBackup(req, res) {
  const webdav = require('../webdav');
  try {
    await webdav.doBackup();
    sendJson(res, 200, { ok: true, message: 'Backup uploaded successfully' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleWebdavRestore(req, res) {
  const webdav = require('../webdav');
  try {
    await webdav.doRestore();
    sendJson(res, 200, { ok: true, message: 'Restore completed successfully' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleLocalExport(req, res) {
  const webdav = require('../webdav');
  const body = await readJsonBody(req);
  const encryptKey = body.encryptKey;
  if (!encryptKey) return sendJson(res, 400, { ok: false, error: 'Encryption password is required' });
  try {
    const payloadStr = webdav.createBackupPayload();
    const encrypted = webdav.encrypt(payloadStr, encryptKey);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="litegist_backup.enc"'
    });
    res.end(encrypted);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleLocalExport(req, res) {
  const webdav = require('../webdav');
  const body = await readJsonBody(req);
  const encryptKey = body.encryptKey;
  if (!encryptKey) return sendJson(res, 400, { ok: false, error: 'Encryption password is required' });
  try {
    const payload = webdav.getBackupPayload();
    const payloadStr = JSON.stringify(payload);
    const encrypted = webdav.encrypt(payloadStr, encryptKey);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="litegist_backup.enc"'
    });
    res.end(encrypted);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleLocalImport(req, res) {
  const webdav = require('../webdav');
  const body = await readJsonBody(req);
  const encryptKey = body.encryptKey;
  const encryptedData = body.data;
  if (!encryptKey || !encryptedData) return sendJson(res, 400, { ok: false, error: 'Encryption password and data are required' });
  try {
    const decrypted = webdav.decrypt(encryptedData, encryptKey);
    webdav.restoreBackupPayload(decrypted);
    sendJson(res, 200, { ok: true, message: 'Import completed successfully' });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: err.message });
  }
}

async function handleGetAdminSettings(req, res) {
  const settings = repo.getAdminSettings();
  sendJson(res, 200, {
    ok: true,
    settings: {
      username: settings.username,
      password: settings.password_hash ? '••••••' : '',
      apiKey: settings.api_key
    }
  });
}

async function handleUpdateAdminSettings(req, res) {
  const body = await readJsonBody(req);
  const { username, password, apiKey } = body;
  if (!username) return sendJson(res, 400, { ok: false, error: 'Username is required' });
  
  const actualPassword = (password && password !== '••••••') ? password : null;
  repo.updateAdminSettings(username, actualPassword, apiKey || '');
  sendJson(res, 200, { ok: true });
}

module.exports = {
  serveStaticFile,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminGenerateTextShare,
  handleAdminGetShares,
  handleAdminGetShare,
  handleAdminDeleteShares,
  handleAdminUpdateShare,
  handlePublicGetTextShare,
  handlePublicAuthShare,
  handlePublicGetRawText,
  handlePublicGetSubConvert,
  handleGetWebdavSettings,
  handleSaveWebdavSettings,
  handleGetAdminSettings,
  handleUpdateAdminSettings,
  handleWebdavBackup,
  handleWebdavRestore,
  handleLocalExport,
  handleLocalImport,
  notFound
};

