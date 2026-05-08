const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const config = require('../config');
const utils = require('../utils');
const repo = require('../db/repo');
const subconverter = require('./subconverter');
const { formatLabel } = subconverter;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
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

function notFound(res) {
  sendJson(res, 404, { ok: false, error: 'Not Found' });
}

async function readJsonBody(req) {
  return new Promise((resolve) => {
    req.setEncoding('utf8');
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function buildBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${config.PORT}`;
  return `${proto}://${host}`;
}

function gistNeedsAuth(gist) {
  return !gist.is_public;
}

function buildTokenPrefix(gist, overrideToken = '') {
  if (!gistNeedsAuth(gist)) return '';
  const token = overrideToken || gist.access_token || '';
  return token ? `/token:${encodeURIComponent(token)}` : '';
}

function buildGistHtmlPath(gist, selectedFilename = '', overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  const base = `${prefix}/gist/${encodeURIComponent(gist.id)}`;
  if (!selectedFilename) return base;
  return `${base}/file/${encodeURIComponent(selectedFilename)}`;
}

function buildGistVersionPagePath(gist, filename, version, overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  return `${prefix}/gist/${encodeURIComponent(gist.id)}/file/${encodeURIComponent(filename)}/version/${encodeURIComponent(version)}`;
}

function buildGistRawPath(gist, filename, version = '', overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  const encodedId = encodeURIComponent(gist.id);
  const encodedFile = encodeURIComponent(filename);
  if (version) return `${prefix}/gists/${encodedId}/raw/${encodeURIComponent(version)}/${encodedFile}`;
  return `${prefix}/gists/${encodedId}/raw/${encodedFile}`;
}

function buildGistConvertPath(gist, filename, format, overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  return `${prefix}/gists/${encodeURIComponent(gist.id)}/raw/${encodeURIComponent(filename)}/${encodeURIComponent(format)}`;
}

function buildGistVersionConvertPath(gist, filename, version, format, overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  return `${prefix}/gists/${encodeURIComponent(gist.id)}/raw/${encodeURIComponent(version)}/${encodeURIComponent(filename)}/${encodeURIComponent(format)}`;
}

function buildGistDiffPath(gist, sha, filename, overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  return `${prefix}/gists/${encodeURIComponent(gist.id)}/diff/${encodeURIComponent(sha)}?file=${encodeURIComponent(filename)}`;
}

function buildGistApiConvertPath(gist, filename, format, version = '', overrideToken = '') {
  const prefix = buildTokenPrefix(gist, overrideToken);
  if (version) {
    return `${prefix}/gists/${encodeURIComponent(gist.id)}/raw/${encodeURIComponent(version)}/${encodeURIComponent(filename)}/${encodeURIComponent(format)}`;
  }
  return `${prefix}/gists/${encodeURIComponent(gist.id)}/raw/${encodeURIComponent(filename)}/${encodeURIComponent(format)}`;
}

function decodeDisplayName(filename) {
  try {
    return decodeURIComponent(filename);
  } catch (e) {
    return filename;
  }
}

function makeContentDisposition(dispositionType, filename) {
  const raw = String(filename || 'download.txt');
  const fallback = raw
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_') || 'download.txt';
  const encoded = encodeURIComponent(raw);
  return `${dispositionType}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function isGistAuthorized(req, gist, tokenFromUrl = '') {
  if (!gistNeedsAuth(gist)) return true;
  return tokenFromUrl === gist.access_token;
}

function guessContentType(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return {
    '.json': 'application/json; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.conf': 'text/plain; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8'
  }[ext] || 'text/plain; charset=utf-8';
}

function detectViewType(filename, content) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if ([
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml',
    '.xml', '.html', '.css', '.py', '.sh', '.bash', '.zsh', '.toml', '.ini',
    '.conf', '.log', '.sql'
  ].includes(ext)) return 'code';
  return 'txt';
}

function isSubscriptionContent(content) {
  try {
    return subconverter.parseNodes(content).length > 0;
  } catch (_) {
    return false;
  }
}

function subscriptionFormats() {
  return [
    { label: 'Clash', fmt: 'clash' },
    { label: 'Mihomo', fmt: 'mihomo' },
    { label: 'Stash', fmt: 'stash' },
    { label: 'Surfboard', fmt: 'surfboard' },
    { label: 'Surge', fmt: 'surge' },
    { label: 'Surge (macOS)', fmt: 'surgemac' },
    { label: 'Loon', fmt: 'loon' },
    { label: 'Shadowrocket', fmt: 'shadowrocket' },
    { label: 'Quantumult X', fmt: 'qx' },
    { label: 'Egern', fmt: 'egern' },
    { label: 'Sing-box', fmt: 'singbox' },
    { label: 'V2Ray', fmt: 'v2ray' },
    { label: 'URI', fmt: 'uri' },
    { label: 'JSON', fmt: 'json' },
    { label: 'Base64', fmt: 'b64' },
    { label: 'Base32', fmt: 'b32' }
  ];
}

function getSubscriptionUserinfo(content) {
  const infoMatch = String(content || '').match(/^#\s*(upload=\d+;\s*download=\d+;\s*total=\d+;\s*expire=\d+)/m);
  return infoMatch ? infoMatch[1].replace(/\s/g, '') : '';
}

function serializeGistFiles(req, gist, files, includeContent = false) {
  const mapped = {};
  for (const file of files) {
    mapped[file.filename] = {
      filename: file.filename,
      type: guessContentType(file.filename).split(';')[0],
      language: null,
      raw_url: buildBaseUrl(req) + buildGistRawPath(gist, file.filename, ''),
      size: file.size || Buffer.byteLength(file.content || '', 'utf8'),
      truncated: false
    };
    if (includeContent) mapped[file.filename].content = file.content || '';
  }
  return mapped;
}

function serializeGist(req, gist, files, includeContent = false) {
  return {
    id: gist.id,
    description: gist.description || '',
    public: !!gist.is_public,
    html_url: buildBaseUrl(req) + buildGistHtmlPath(gist),
    files: serializeGistFiles(req, gist, files, includeContent),
    created_at: gist.created_at,
    updated_at: gist.updated_at
  };
}

function pickSelectedFile(files, requestedFilename = '') {
  if (!files.length) return null;
  if (!requestedFilename) return files[0];
  return files.find(file => file.filename === requestedFilename) || null;
}

function makePublicPageData(req, gist, files, selectedFile, tokenFromUrl = '', selectedVersion = '') {
  const activeToken = tokenFromUrl && tokenFromUrl === gist.access_token ? tokenFromUrl : '';
  const selectedVersions = selectedFile ? repo.listGistFileVersions(gist.id, selectedFile.filename) : [];
  const selectedContent = selectedFile ? String(selectedFile.content || '') : '';
  const viewType = selectedFile ? detectViewType(selectedFile.filename, selectedContent) : 'txt';
  const subscription = selectedFile ? isSubscriptionContent(selectedContent) : false;
  const activeVersion = selectedVersion || (selectedFile ? selectedFile.current_version : '');
  return {
    gistId: gist.id,
    description: gist.description || 'Gist',
    token: activeToken,
    files: files.map(file => ({
      filename: file.filename,
      displayName: decodeDisplayName(file.filename),
      size: file.size,
      updatedAt: file.updated_at,
      pageUrl: buildGistHtmlPath(gist, file.filename, activeToken),
      rawUrl: buildGistRawPath(gist, file.filename, '', activeToken),
      version: file.current_version
    })),
    selected: selectedFile ? {
      filename: selectedFile.filename,
      displayName: decodeDisplayName(selectedFile.filename),
      size: selectedFile.size,
      updatedAt: selectedFile.updated_at,
      currentVersion: activeVersion,
      latestVersion: selectedFile.current_version,
      rawUrl: selectedVersion
        ? buildGistRawPath(gist, selectedFile.filename, selectedVersion, activeToken)
        : buildGistRawPath(gist, selectedFile.filename, '', activeToken),
      pageUrl: selectedVersion
        ? buildGistVersionPagePath(gist, selectedFile.filename, selectedVersion, activeToken)
        : buildGistHtmlPath(gist, selectedFile.filename, activeToken),
      viewType,
      isSubscription: subscription,
      convertUrls: subscription ? subscriptionFormats().map(item => ({
        label: item.label,
        fmt: item.fmt,
        url: selectedVersion
          ? buildGistVersionConvertPath(gist, selectedFile.filename, selectedVersion, item.fmt, activeToken)
          : buildGistConvertPath(gist, selectedFile.filename, item.fmt, activeToken)
      })) : [],
      history: selectedVersions.map(version => ({
        version: version.version,
        size: version.size,
        createdAt: version.created_at,
        rawUrl: buildGistRawPath(gist, selectedFile.filename, version.version, activeToken),
        previewUrl: buildGistVersionPagePath(gist, selectedFile.filename, version.version, activeToken),
        diffUrl: buildGistDiffPath(gist, version.version, selectedFile.filename, activeToken),
        convertUrls: subscription ? subscriptionFormats().map(item => ({
          label: item.label,
          fmt: item.fmt,
          url: buildGistVersionConvertPath(gist, selectedFile.filename, version.version, item.fmt, activeToken)
        })) : []
      }))
    } : null
  };
}

function handleGetGists(req, res) {
  const urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const perPage = Math.max(1, Math.min(parseInt(urlObj.searchParams.get('per_page') || '100', 10) || 100, 100));
  const page = Math.max(1, parseInt(urlObj.searchParams.get('page') || '1', 10) || 1);
  const all = repo.listGists();
  const start = (page - 1) * perPage;
  const rows = all.slice(start, start + perPage).map(gist => {
    const files = repo.listGistCurrentFiles(gist.id);
    return serializeGist(req, gist, files, false);
  });
  sendJson(res, 200, rows);
}

async function handleCreateGist(req, res) {
  const body = await readJsonBody(req);
  try {
    const gist = repo.createGist({
      description: body.description,
      public: body.public,
      files: body.files,
      accessToken: body.access_token
    });
    const files = repo.listGistCurrentFiles(gist.id);
    sendJson(res, 201, serializeGist(req, gist, files, true));
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : 'Failed to create gist'
    });
  }
}

function handleGetGist(req, res, gistId) {
  const record = repo.getGistWithFiles(gistId);
  if (!record) return notFound(res);
  sendJson(res, 200, serializeGist(req, record.gist, record.files, true));
}

async function handlePatchGist(req, res, gistId) {
  try {
    const gist = repo.patchGist(gistId, await readJsonBody(req));
    if (!gist) return notFound(res);
    const files = repo.listGistCurrentFiles(gist.id);
    sendJson(res, 200, serializeGist(req, gist, files, true));
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : 'Failed to update gist'
    });
  }
}

function handleDeleteGist(req, res, gistId) {
  const deleted = repo.deleteGist(gistId);
  if (!deleted) return notFound(res);
  sendJson(res, 200, { ok: true, deleted: true, id: gistId });
}

function handleGetGistRaw(req, res, gistId, tokenFromUrl, versionOrFilename, maybeFilename) {
  const gist = repo.getGist(gistId);
  if (!gist) return notFound(res);
  if (!isGistAuthorized(req, gist, tokenFromUrl)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const filename = maybeFilename || versionOrFilename;
  const version = maybeFilename ? versionOrFilename : '';
  const record = version
    ? repo.getGistFileVersion(gistId, filename, version)
    : repo.getGistCurrentFile(gistId, filename);

  if (!record) return notFound(res);

  res.writeHead(200, {
    'Content-Type': guessContentType(filename),
    'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Access-Control-Allow-Origin': '*',
    'Content-Disposition': makeContentDisposition('inline', filename)
  });
  res.end(record.content || '');
}

function handleGetGistSubConvert(req, res, gistId, tokenFromUrl, filename, format, version = '') {
  const gist = repo.getGist(gistId);
  if (!gist) return notFound(res);
  if (!isGistAuthorized(req, gist, tokenFromUrl)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const record = version
    ? repo.getGistFileVersion(gistId, filename, version)
    : repo.getGistCurrentFile(gistId, filename);
  if (!record) return notFound(res);

  let result;
  try {
    result = subconverter.convert(String(record.content || ''), format);
  } catch (error) {
    return sendText(
      res,
      500,
      error && error.message ? error.message : 'Subscription conversion failed.',
      'text/plain; charset=utf-8'
    );
  }
  if (result.error) {
    return sendText(res, 400, result.error, 'text/plain; charset=utf-8');
  }

  const headers = {
    'Content-Type': result.contentType,
    'Content-Disposition': makeContentDisposition('attachment', `${formatLabel(format)}-${filename}`),
    'Cache-Control': version ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Access-Control-Allow-Origin': '*'
  };
  const subscriptionUserinfo = getSubscriptionUserinfo(record.content || '');
  if (subscriptionUserinfo) headers['subscription-userinfo'] = subscriptionUserinfo;
  res.writeHead(200, headers);
  res.end(result.output);
}

function handlePublicGetGistPage(req, res, gistId, tokenFromUrl, requestedFilename = '', requestedVersion = '') {
  const record = repo.getGistWithFiles(gistId);
  if (!record) return notFound(res);

  const authorized = isGistAuthorized(req, record.gist, tokenFromUrl);
  if (!authorized) return sendJson(res, 401, { ok: false, error: 'Unauthorized' });

  const selectedFile = pickSelectedFile(record.files, requestedFilename);
  if (requestedFilename && !selectedFile) return notFound(res);

  let fileForDisplay = selectedFile;
  if (selectedFile && requestedVersion) {
    const versionRecord = repo.getGistFileVersion(gistId, selectedFile.filename, requestedVersion);
    if (!versionRecord) return notFound(res);
    fileForDisplay = {
      ...selectedFile,
      content: versionRecord.content,
      size: versionRecord.size,
      updated_at: versionRecord.created_at,
      current_version: versionRecord.version
    };
  }

  const pageData = makePublicPageData(req, record.gist, record.files, fileForDisplay, tokenFromUrl, requestedVersion);
  const templatePath = path.join(config.ADMIN_DIR, 'gist_share.html');
  if (!fs.existsSync(templatePath)) return sendText(res, 500, 'Missing gist_share.html');

  let content = '';
  if (fileForDisplay) content = fileForDisplay.content || '';

  const isLargeContent = content.length > 50000;
  const inlineContent = isLargeContent ? '' : utils.htmlEscape(content);
  const pageTitle = pageData.selected ? `${pageData.selected.displayName} · ${record.gist.description || record.gist.id}` : (record.gist.description || record.gist.id);

  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace(/__PAGE_TITLE__/g, utils.htmlEscape(pageTitle));
  html = html.replace(/__GIST_TITLE__/g, utils.htmlEscape(record.gist.description || 'Gist'));
  html = html.replace(/__GIST_ID__/g, utils.htmlEscape(record.gist.id));
  html = html.replace(/__SELECTED_FILE__/g, utils.htmlEscape(pageData.selected ? pageData.selected.displayName : 'No files'));
  html = html.replace(/__SELECTED_FILENAME__/g, utils.htmlEscape(pageData.selected ? pageData.selected.filename : ''));
  html = html.replace(/__CONTENT__/g, inlineContent);
  html = html.replace(/__LARGE__/g, isLargeContent ? 'true' : 'false');
  html = html.replace(/__PAGE_DATA__/g, encodeURIComponent(JSON.stringify(pageData)));
  html = html.replace(/__RAW_URL__/g, encodeURIComponent(pageData.selected ? pageData.selected.rawUrl : ''));
  html = html.replace(/__TOKEN__/g, encodeURIComponent(pageData.token || ''));

  sendHtmlGzip(req, res, html);
}

function handleGetGistDiff(req, res, gistId, tokenFromUrl, sha) {
  const gist = repo.getGist(gistId);
  if (!gist) return notFound(res);
  if (!isGistAuthorized(req, gist, tokenFromUrl)) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }
  const urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const filename = urlObj.searchParams.get('file') || '';
  const result = repo.getGistFileDiff(gistId, sha, filename);
  if (!result) return notFound(res);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.end(JSON.stringify(result));
}

module.exports = {
  handleGetGists,
  handleCreateGist,
  handleGetGist,
  handlePatchGist,
  handleDeleteGist,
  handleGetGistRaw,
  handleGetGistSubConvert,
  handleGetGistDiff,
  handlePublicGetGistPage
};
