const h = require('./handlers');
const gh = require('./gist-handlers');
const auth = require('./auth');
const config = require('../config');
const path = require('node:path');

async function route(req, res) {
  const urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  let pathname = urlObj.pathname;

  // Strip GitHub proxy prefix so Sub-Store can use litegist as a GitHub Gist API proxy.
  // Sub-Store constructs baseURL as `${githubProxy}/https://api.github.com`, so requests
  // arrive with pathname like /https://api.github.com/gists — strip it to /gists.
  // Handle both /https://api.github.com and //https://api.github.com (trailing slash in proxy URL).
  const ghPrefix = pathname.replace(/^\/+/, '/').match(/^(\/https:\/\/api\.github\.com)(\/.*)?$/);
  if (ghPrefix) {
    pathname = ghPrefix[2] || '/';
  }

  // Root and Admin UI
  if (pathname === '/' || pathname === '' || pathname === '/admin' || pathname === '/admin/') {
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(307, { Location: '/admin/login' });
      return res.end();
    }
    return h.serveStaticFile(req, res, path.join(config.ADMIN_DIR, 'index.html'));
  }

  // Gist API-compatible raw routes
  const tokenGistFileVersionConvertMatch = pathname.match(/^\/token:([^\/]+)\/gist\/([^\/]+)\/file\/([^\/]+)\/version\/([^\/]+)\/raw\/([A-Za-z0-9.-]+)$/);
  if (tokenGistFileVersionConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(tokenGistFileVersionConvertMatch[2]),
      decodeURIComponent(tokenGistFileVersionConvertMatch[1]),
      decodeURIComponent(tokenGistFileVersionConvertMatch[3]),
      decodeURIComponent(tokenGistFileVersionConvertMatch[5]),
      decodeURIComponent(tokenGistFileVersionConvertMatch[4])
    );
  }
  const gistFileVersionConvertMatch = pathname.match(/^\/gist\/([^\/]+)\/file\/([^\/]+)\/version\/([^\/]+)\/raw\/([A-Za-z0-9.-]+)$/);
  if (gistFileVersionConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(gistFileVersionConvertMatch[1]),
      '',
      decodeURIComponent(gistFileVersionConvertMatch[2]),
      decodeURIComponent(gistFileVersionConvertMatch[4]),
      decodeURIComponent(gistFileVersionConvertMatch[3])
    );
  }
  const tokenGistFileConvertMatch = pathname.match(/^\/token:([^\/]+)\/gist\/([^\/]+)\/file\/([^\/]+)\/raw\/([A-Za-z0-9.-]+)$/);
  if (tokenGistFileConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(tokenGistFileConvertMatch[2]),
      decodeURIComponent(tokenGistFileConvertMatch[1]),
      decodeURIComponent(tokenGistFileConvertMatch[3]),
      decodeURIComponent(tokenGistFileConvertMatch[4]),
      ''
    );
  }
  const gistFileConvertMatch = pathname.match(/^\/gist\/([^\/]+)\/file\/([^\/]+)\/raw\/([A-Za-z0-9.-]+)$/);
  if (gistFileConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(gistFileConvertMatch[1]),
      '',
      decodeURIComponent(gistFileConvertMatch[2]),
      decodeURIComponent(gistFileConvertMatch[3]),
      ''
    );
  }
  // Raw routes (must come before convert routes — version hash segment would otherwise be
  // mistaken for a filename by the 2-segment convert regex)
  const tokenGistRawVersionMatch = pathname.match(/^\/token:([^\/]+)\/gists\/([^\/]+)\/raw\/([0-9a-f]{40})\/([^\/]+)$/);
  if (tokenGistRawVersionMatch && req.method === 'GET') {
    return gh.handleGetGistRaw(
      req,
      res,
      decodeURIComponent(tokenGistRawVersionMatch[2]),
      decodeURIComponent(tokenGistRawVersionMatch[1]),
      decodeURIComponent(tokenGistRawVersionMatch[3]),
      decodeURIComponent(tokenGistRawVersionMatch[4])
    );
  }
  const gistRawVersionMatch = pathname.match(/^\/gists\/([^\/]+)\/raw\/([0-9a-f]{40})\/([^\/]+)$/);
  if (gistRawVersionMatch && req.method === 'GET') {
    return gh.handleGetGistRaw(
      req,
      res,
      decodeURIComponent(gistRawVersionMatch[1]),
      '',
      decodeURIComponent(gistRawVersionMatch[2]),
      decodeURIComponent(gistRawVersionMatch[3])
    );
  }
  const tokenGistRawMatch = pathname.match(/^\/token:([^\/]+)\/gists\/([^\/]+)\/raw\/([^\/]+)$/);
  if (tokenGistRawMatch && req.method === 'GET') {
    return gh.handleGetGistRaw(
      req,
      res,
      decodeURIComponent(tokenGistRawMatch[2]),
      decodeURIComponent(tokenGistRawMatch[1]),
      decodeURIComponent(tokenGistRawMatch[3]),
      null
    );
  }
  const gistRawMatch = pathname.match(/^\/gists\/([^\/]+)\/raw\/([^\/]+)$/);
  if (gistRawMatch && req.method === 'GET') {
    return gh.handleGetGistRaw(
      req,
      res,
      decodeURIComponent(gistRawMatch[1]),
      '',
      decodeURIComponent(gistRawMatch[2]),
      null
    );
  }

  // Subscription conversion routes
  const tokenGistApiVersionConvertMatch = pathname.match(/^\/token:([^\/]+)\/gists\/([^\/]+)\/raw\/([0-9a-f]{40})\/([^\/]+)\/([A-Za-z0-9.-]+)$/);
  if (tokenGistApiVersionConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(tokenGistApiVersionConvertMatch[2]),
      decodeURIComponent(tokenGistApiVersionConvertMatch[1]),
      decodeURIComponent(tokenGistApiVersionConvertMatch[4]),
      decodeURIComponent(tokenGistApiVersionConvertMatch[5]),
      decodeURIComponent(tokenGistApiVersionConvertMatch[3])
    );
  }
  const gistApiVersionConvertMatch = pathname.match(/^\/gists\/([^\/]+)\/raw\/([0-9a-f]{40})\/([^\/]+)\/([A-Za-z0-9.-]+)$/);
  if (gistApiVersionConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(gistApiVersionConvertMatch[1]),
      '',
      decodeURIComponent(gistApiVersionConvertMatch[3]),
      decodeURIComponent(gistApiVersionConvertMatch[4]),
      decodeURIComponent(gistApiVersionConvertMatch[2])
    );
  }
  const tokenGistApiConvertMatch = pathname.match(/^\/token:([^\/]+)\/gists\/([^\/]+)\/raw\/([^\/]+)\/([A-Za-z0-9.-]+)$/);
  if (tokenGistApiConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(tokenGistApiConvertMatch[2]),
      decodeURIComponent(tokenGistApiConvertMatch[1]),
      decodeURIComponent(tokenGistApiConvertMatch[3]),
      decodeURIComponent(tokenGistApiConvertMatch[4]),
      ''
    );
  }
  const gistApiConvertMatch = pathname.match(/^\/gists\/([^\/]+)\/raw\/([^\/]+)\/([A-Za-z0-9.-]+)$/);
  if (gistApiConvertMatch && req.method === 'GET') {
    return gh.handleGetGistSubConvert(
      req,
      res,
      decodeURIComponent(gistApiConvertMatch[1]),
      '',
      decodeURIComponent(gistApiConvertMatch[2]),
      decodeURIComponent(gistApiConvertMatch[3]),
      ''
    );
  }

  // Gist diff routes
  const tokenGistDiffMatch = pathname.match(/^\/token:([^\/]+)\/gists\/([^\/]+)\/diff\/([0-9a-f]{4,40})$/);
  if (tokenGistDiffMatch && req.method === 'GET') {
    return gh.handleGetGistDiff(req, res, decodeURIComponent(tokenGistDiffMatch[2]), decodeURIComponent(tokenGistDiffMatch[1]), decodeURIComponent(tokenGistDiffMatch[3]));
  }
  const gistDiffMatch = pathname.match(/^\/gists\/([^\/]+)\/diff\/([0-9a-f]{4,40})$/);
  if (gistDiffMatch && req.method === 'GET') {
    return gh.handleGetGistDiff(req, res, decodeURIComponent(gistDiffMatch[1]), '', decodeURIComponent(gistDiffMatch[2]));
  }

  // Gist API-compatible resource routes
  if (pathname === '/gists' && req.method === 'GET') {
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }
    return gh.handleGetGists(req, res);
  }
  if (pathname === '/gists' && req.method === 'POST') {
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }
    return gh.handleCreateGist(req, res);
  }
  const gistApiMatch = pathname.match(/^\/gists\/([^\/]+)$/);
  if (gistApiMatch && req.method === 'GET') {
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }
    return gh.handleGetGist(req, res, decodeURIComponent(gistApiMatch[1]));
  }
  if (gistApiMatch && req.method === 'PATCH') {
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }
    return gh.handlePatchGist(req, res, decodeURIComponent(gistApiMatch[1]));
  }
  if (gistApiMatch && req.method === 'DELETE') {
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }
    return gh.handleDeleteGist(req, res, decodeURIComponent(gistApiMatch[1]));
  }

  // Public text views
  if (pathname.startsWith('/text/')) {
    const slug = decodeURIComponent(pathname.substring(6));
    return h.handlePublicGetTextShare(req, res, slug);
  }

  // Public gist views
  const tokenGistFileVersionPageMatch = pathname.match(/^\/token:([^\/]+)\/gist\/([^\/]+)\/file\/([^\/]+)\/version\/([^\/]+)$/);
  if (tokenGistFileVersionPageMatch && req.method === 'GET') {
    return gh.handlePublicGetGistPage(
      req,
      res,
      decodeURIComponent(tokenGistFileVersionPageMatch[2]),
      decodeURIComponent(tokenGistFileVersionPageMatch[1]),
      decodeURIComponent(tokenGistFileVersionPageMatch[3]),
      decodeURIComponent(tokenGistFileVersionPageMatch[4])
    );
  }
  const gistFileVersionPageMatch = pathname.match(/^\/gist\/([^\/]+)\/file\/([^\/]+)\/version\/([^\/]+)$/);
  if (gistFileVersionPageMatch && req.method === 'GET') {
    return gh.handlePublicGetGistPage(
      req,
      res,
      decodeURIComponent(gistFileVersionPageMatch[1]),
      '',
      decodeURIComponent(gistFileVersionPageMatch[2]),
      decodeURIComponent(gistFileVersionPageMatch[3])
    );
  }
  const tokenGistFilePageMatch = pathname.match(/^\/token:([^\/]+)\/gist\/([^\/]+)\/file\/([^\/]+)$/);
  if (tokenGistFilePageMatch && req.method === 'GET') {
    return gh.handlePublicGetGistPage(
      req,
      res,
      decodeURIComponent(tokenGistFilePageMatch[2]),
      decodeURIComponent(tokenGistFilePageMatch[1]),
      decodeURIComponent(tokenGistFilePageMatch[3]),
      ''
    );
  }
  const gistFilePageMatch = pathname.match(/^\/gist\/([^\/]+)\/file\/([^\/]+)$/);
  if (gistFilePageMatch && req.method === 'GET') {
    return gh.handlePublicGetGistPage(
      req,
      res,
      decodeURIComponent(gistFilePageMatch[1]),
      '',
      decodeURIComponent(gistFilePageMatch[2]),
      ''
    );
  }
  const tokenGistPageMatch = pathname.match(/^\/token:([^\/]+)\/gist\/([^\/]+)$/);
  if (tokenGistPageMatch && req.method === 'GET') {
    return gh.handlePublicGetGistPage(
      req,
      res,
      decodeURIComponent(tokenGistPageMatch[2]),
      decodeURIComponent(tokenGistPageMatch[1]),
      '',
      ''
    );
  }
  const gistPageMatch = pathname.match(/^\/gist\/([^\/]+)$/);
  if (gistPageMatch && req.method === 'GET') {
    return gh.handlePublicGetGistPage(req, res, decodeURIComponent(gistPageMatch[1]), '', '', '');
  }

  // Subscription conversion formats: /raw/<format>, except b64 which stays on the legacy raw handler.
  const tokenSubMatch = pathname.match(/^\/token:([^\/]+)\/([^\/]+)\/raw\/([A-Za-z0-9.-]+)$/);
  if (tokenSubMatch) {
    const token = decodeURIComponent(tokenSubMatch[1]);
    const slug = decodeURIComponent(tokenSubMatch[2]);
    const format = tokenSubMatch[3];
    if (format !== 'b64') return h.handlePublicGetSubConvert(req, res, slug, token, format);
  }
  const subFormatMatch = pathname.match(/^\/([^\/]+)\/raw\/([A-Za-z0-9.-]+)$/);
  if (subFormatMatch) {
    const slug = decodeURIComponent(subFormatMatch[1]);
    const format = subFormatMatch[2];
    if (format !== 'b64') return h.handlePublicGetSubConvert(req, res, slug, null, format);
  }

  // Raw or Raw/B64 text access (all types)
  if (pathname.endsWith('/raw') || pathname.endsWith('/raw/b64')) {
    const isB64 = pathname.endsWith('/b64');
    const tokenMatch = pathname.match(/^\/token:([^\/]+)\/([^\/]+)\/raw(\/b64)?/);
    if (tokenMatch) {
      const token = decodeURIComponent(tokenMatch[1]);
      const slug = decodeURIComponent(tokenMatch[2]);
      return h.handlePublicGetRawText(req, res, slug, token, isB64);
    }
    const slugMatch = pathname.match(/^\/([^\/]+)\/raw(\/b64)?/);
    if (slugMatch) {
      const slug = decodeURIComponent(slugMatch[1]);
      return h.handlePublicGetRawText(req, res, slug, null, isB64);
    }
  }

  if (pathname === '/admin/login') {
    if (req.method === 'GET') return h.serveStaticFile(req, res, path.join(config.ADMIN_DIR, 'login.html'));
    if (req.method === 'POST') return h.handleAdminLogin(req, res);
  }

  if (pathname === '/admin/logout') return h.handleAdminLogout(req, res);

  // Static assets
  if (pathname.startsWith('/admin/')) {
    const relative = pathname.replace(/^\/admin\//, '');
    return h.serveStaticFile(req, res, path.join(config.ADMIN_DIR, relative));
  }

  // API v1
  if (pathname.startsWith('/api/v1/')) {
    const apiPath = pathname.substring(8);

    // Public API (No Auth)
    if (apiPath.startsWith('share/') && apiPath.endsWith('/auth') && req.method === 'POST') {
      const slug = decodeURIComponent(apiPath.split('/')[1]);
      return h.handlePublicAuthShare(req, res, slug);
    }

    // Admin API (Auth via Cookie OR API Key required)
    if (!auth.isAdminAuthed(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    }

    // Share Management (Only the current project APIs)
    if (apiPath === 'admin/text/generate' && req.method === 'POST') return h.handleAdminGenerateTextShare(req, res);
    if (apiPath === 'admin/shares' && req.method === 'GET') return h.handleAdminGetShares(req, res);
    if (apiPath === 'admin/shares' && req.method === 'DELETE') return h.handleAdminDeleteShares(req, res);
    
    if (apiPath.startsWith('admin/shares/')) {
      const slug = decodeURIComponent(apiPath.split('/').pop());
      if (req.method === 'GET') return h.handleAdminGetShare(req, res, slug);
      if (req.method === 'PUT') return h.handleAdminUpdateShare(req, res, slug);
    }

    // Admin Settings
    if (apiPath === 'admin/settings' && req.method === 'GET') return h.handleGetAdminSettings(req, res);
    if (apiPath === 'admin/settings' && req.method === 'POST') return h.handleUpdateAdminSettings(req, res);

    // WebDAV
    if (apiPath === 'admin/webdav/settings' && req.method === 'GET') return h.handleGetWebdavSettings(req, res);
    if (apiPath === 'admin/webdav/settings' && req.method === 'POST') return h.handleSaveWebdavSettings(req, res);
    if (apiPath === 'admin/webdav/backup' && req.method === 'POST') return h.handleWebdavBackup(req, res);
    if (apiPath === 'admin/webdav/restore' && req.method === 'POST') return h.handleWebdavRestore(req, res);

    // Local Export / Import
    if (apiPath === 'admin/export' && req.method === 'POST') return h.handleLocalExport(req, res);
    if (apiPath === 'admin/import' && req.method === 'POST') return h.handleLocalImport(req, res);
  }

  return h.notFound(res);
}

module.exports = { route };
