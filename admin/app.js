const $ = id => document.getElementById(id);

async function api(url, method = 'GET', body = null) {
  const options = { method, headers: {} };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (res.status === 401 && !url.includes('/login')) {
    window.location.href = '/admin/login';
    return;
  }
  return res.json();
}

function copyFallback(text) {
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).catch(()=>{}); return; }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy'); } catch(_) {} ta.remove();
}

function copyWithFeedback(btn, text) {
  copyFallback(text);
  btn.classList.add('copy-flash');
  setTimeout(() => btn.classList.remove('copy-flash'), 700);
}

let _confirmResolve = null;
function showConfirm(title, message, okLabel = 'Delete', okType = 'red') {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    const okBtn = $('confirm-ok');
    okBtn.textContent = okLabel;
    okBtn.className = okType === 'green' ? 'btn green-btn' : 'btn red-btn';
    okBtn.style.flex = '1';
    $('confirm-modal').classList.remove('hidden');
  });
}

let _alertResolve = null;
function showAlert(title, message) {
  return new Promise(resolve => {
    _alertResolve = resolve;
    $('alert-title').textContent = title;
    $('alert-message').textContent = message;
    $('alert-modal').classList.remove('hidden');
  });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeMaybe(text) {
  try { return decodeURIComponent(text); } catch (_) { return text; }
}

function scheduleIdle(work, timeout = 250) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(work, { timeout });
  }
  return window.setTimeout(work, 0);
}

function cancelIdle(handle) {
  if (!handle) return;
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}

function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function renderConvertMenuHtml(items) {
  const buttons = items.map(item =>
    `<button class="btn secondary" data-convert-link="${item.url}" style="font-size:12px;padding:6px 12px;">${escapeHtml(item.label)}</button>`
  ).join('');
  return `
    <div class="convert-anchor">
      <button class="btn secondary" data-convert-toggle style="font-size:12px;">⚙ Convert</button>
      <div class="convert-popover hidden">${buttons}</div>
    </div>
  `;
}

function positionConvertPopover(anchor, popover) {
  if (!anchor || !popover) return;
  const margin = 12;
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = vw - 2 * margin;
  popover.style.maxWidth = `${maxW}px`;
  popover.style.overflowY = 'auto';
  const left = Math.min(Math.max(rect.left, margin), Math.max(margin, vw - 260 - margin));
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = 'auto';
  popover.style.bottom = `${Math.round(vh - rect.top + 8)}px`;
  popover.style.maxHeight = `${Math.max(80, rect.top - margin - 8)}px`;
}

function guessCodeMirrorMode(filename, typeHint = '') {
  const explicit = String(typeHint || '').toLowerCase();
  if (explicit === 'sub' || explicit === 'code') return 'javascript';
  const ext = (String(filename || '').split('.').pop() || '').toLowerCase();
  if (explicit === 'markdown' || ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'htmlmixed';
  if (ext === 'css') return 'css';
  if (ext === 'xml' || ext === 'plist' || ext === 'svg') return 'xml';
  if (ext === 'py') return 'python';
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') return 'shell';
  if (ext === 'json' || ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'ts' || ext === 'tsx' || ext === 'jsx') return 'javascript';
  if (ext === 'txt' || ext === 'conf' || ext === 'yaml' || ext === 'yml') return 'javascript';
  return 'javascript';
}

function normalizeGistFilename(filename) {
  return String(filename || '').trim();
}

let lastSharesJson = "";
let lastGistsJson = "";
const gistRawUrlsMap = new Map();
let currentGistId = null;
let originalGistFilenames = [];
let currentEditType = 'txt';
let editCm = null;
let editPreviewOn = false;
const gistFileEditors = new WeakMap();
let sharePreviewJob = null;
let editPreviewJob = null;
let gistNavIdx = 0;

function updateGistFileNav() {
  const nav = $('gist-file-nav');
  if (!nav) return;
  const cards = document.querySelectorAll('#gist-files-list .gist-file-card');
  if (cards.length > 1) {
    nav.classList.remove('hidden');
  } else {
    nav.classList.add('hidden');
    return;
  }
  $('gist-nav-up').disabled = gistNavIdx <= 0;
  $('gist-nav-down').disabled = gistNavIdx >= cards.length - 1;
}

function scrollToGistFile(idx) {
  const cards = Array.from(document.querySelectorAll('#gist-files-list .gist-file-card'));
  if (idx < 0 || idx >= cards.length) return;
  gistNavIdx = idx;
  const card = cards[idx];
  // Find the first ancestor that is actually scrollable (panel on desktop, grid/modal on mobile)
  const candidates = [
    $('gist-files-list').closest('.gist-files-panel'),
    $('gist-files-list').closest('.gist-editor-grid'),
    $('gist-files-list').closest('.modal')
  ].filter(Boolean);
  const scrollEl = candidates.find(el => el.scrollHeight > el.clientHeight + 1);
  if (scrollEl) {
    const containerRect = scrollEl.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    scrollEl.scrollTop = scrollEl.scrollTop + cardRect.top - containerRect.top - 12;
  } else {
    card.scrollIntoView({ block: 'nearest' });
  }
  const editor = gistFileEditors.get(card);
  if (editor) setTimeout(() => editor.focus(), 300);
  updateGistFileNav();
}

async function loadShares() {
  const j = await api('/api/v1/admin/shares');
  if (j && j.ok) {
    const currentJson = JSON.stringify(j.shares);
    if (currentJson === lastSharesJson) return;
    lastSharesJson = currentJson;
    renderShares(j.shares);
  }
}

function renderShares(shares) {
  const tbody = $('shares-tbody');
  tbody.innerHTML = (shares || []).map(sh => {
    const expStr = sh.expiresAt ? new Date(sh.expiresAt).toLocaleDateString() : 'Forever';
    const isExpired = sh.expiresAt && new Date(sh.expiresAt) < new Date();
    const safeSlug = escapeHtml(sh.slug);
    return `
      <tr data-slug="${safeSlug}">
        <td style="width:32px;"><input type="checkbox" class="share-check" data-slug="${safeSlug}" style="cursor:pointer;width:16px;height:16px;accent-color:var(--blue);"></td>
        <td><a href="/text/${sh.slug}" target="_blank" class="td-link">📄 ${sh.slug}</a></td>
        <td><span class="badge">${sh.nodeSid}</span></td>
        <td class="td-sub">${new Date(sh.createdAt).toLocaleDateString()}</td>
        <td class="${isExpired ? 'td-expired' : ''}">${expStr}${isExpired ? ' (Expired)' : ''}</td>
        <td>${sh.hasPassword ? '🔐' : 'Open'}</td>
        <td><div class="td-actions">
          <button class="btn secondary small-btn" onclick="copyWithFeedback(this,'${window.location.origin}/text/${sh.slug}')">Copy</button>
          <button class="btn secondary small-btn" onclick="copyWithFeedback(this,'${sh.hasPassword ? `${window.location.origin}/token:${sh.token}/${sh.slug}/raw` : `${window.location.origin}/${sh.slug}/raw`}')">Copy Raw</button>
          <button class="btn secondary small-btn" onclick="openEditModal('${sh.slug}')">Edit</button>
          <button class="btn red-btn small-btn" onclick="deleteShare('${sh.slug}')">Del</button>
        </div></td>
      </tr>`;
  }).join('') || `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">No links found</td></tr>`;
  updateBatchBar();
}

async function deleteShare(slug) {
  const ok = await showConfirm('Delete Share', `Delete share "${slug}"?`);
  if (!ok) return;
  const row = $('shares-tbody').querySelector(`tr[data-slug="${CSS.escape(slug)}"]`);
  if (row) row.remove();
  lastSharesJson = '';
  updateBatchBar();
  const res = await api('/api/v1/admin/shares', 'DELETE', { slugs: [slug] });
  if (!res || !res.ok) loadShares();
}

let currentEditSlug = null;
async function openEditModal(slug) {
  currentEditSlug = slug;
  $('edit-slug').value = slug;
  $('edit-pass').value = '';
  $('edit-expiry').value = '';
  $('edit-content').value = 'Loading...';
  $('edit-type').value = 'txt';
  $('edit-modal').classList.remove('hidden');
  const res = await api(`/api/v1/admin/shares/${slug}`);
  if (!res || !res.ok || !res.share) {
    $('edit-content').value = '';
    $('edit-type').value = 'txt';
    await showAlert('Error', res?.error || 'Failed to load share');
    return;
  }
  currentEditType = res.share.type || 'txt';
  $('edit-type').value = currentEditType;
  $('edit-pass').value = res.share.hasPassword ? '__KEEP_EXISTING_PASSWORD__' : '';
  $('edit-expiry').value = res.share.expiresAt || '';
  $('edit-content').value = res.share.content || '';
  updateEditEditorMode();
  scheduleIdle(() => {
    if (editCm) editCm.refresh();
  }, 200);
}

$('btn-close-edit').onclick = () => $('edit-modal').classList.add('hidden');
$('btn-confirm-edit').onclick = async () => {
  const content = editCm ? editCm.getValue() : $('edit-content').value;
  const res = await api(`/api/v1/admin/shares/${currentEditSlug}`, 'PUT', {
    slug: $('edit-slug').value,
    type: $('edit-type').value,
    password: $('edit-pass').value,
    expiresAt: $('edit-expiry').value,
    content
  });
  if (res && res.ok) {
    $('edit-modal').classList.add('hidden');
    loadShares();
  } else await showAlert('Error', res?.error || 'Update failed');
};

$('btn-open-manage').onclick = () => {
  $('manage-modal').classList.remove('hidden');
  loadShares();
};
$('btn-close-manage').onclick = () => {
  $('manage-modal').classList.add('hidden');
  document.querySelectorAll('.share-check').forEach(cb => { cb.checked = false; });
  const selectAll = $('check-all-shares');
  if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
  updateBatchBar();
};

async function loadGists() {
  const list = await api('/gists');
  if (list) {
    const currentJson = JSON.stringify(list);
    if (currentJson === lastGistsJson) return;
    lastGistsJson = currentJson;
    renderGists(list);
  }
}

function renderGists(gists) {
  const tbody = $('gists-tbody');
  gistRawUrlsMap.clear();
  tbody.innerHTML = (gists || []).map(gist => {
    const files = Object.values(gist.files || {});
    const fileNames = files.map(f => decodeMaybe(f.filename)).slice(0, 3).join(', ');
    gistRawUrlsMap.set(gist.id, files.map(f => ({ filename: decodeMaybe(f.filename), rawUrl: f.raw_url || '' })));
    return `
      <tr data-gist-id="${escapeHtml(gist.id)}">
        <td>
          <a href="${gist.html_url}" target="_blank" class="td-link">🗂️ ${escapeHtml(gist.description || gist.id)}</a>
          <div class="td-sub" style="margin-top:4px">${escapeHtml(gist.id)}</div>
        </td>
        <td>
          <div>${files.length} file(s)</div>
          <div class="td-sub" style="margin-top:4px">${escapeHtml(fileNames || 'No files')}</div>
        </td>
        <td class="td-sub">${new Date(gist.updated_at).toLocaleString()}</td>
        <td>${gist.public ? 'Public' : '🔐 Token'}</td>
        <td><div class="td-actions" style="flex-wrap:wrap">
          <button class="btn secondary small-btn" onclick="copyWithFeedback(this,'${gist.html_url.replace(/'/g,'&#039;')}')">Copy</button>
          <button class="btn secondary small-btn" data-gist-raw="${escapeHtml(gist.id)}">Copy Raw</button>
          <button class="btn secondary small-btn" onclick="openGistEditor('${gist.id}')">Edit</button>
          <button class="btn red-btn small-btn" onclick="deleteGist('${gist.id}')">Del</button>
        </div></td>
      </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted)">No gists found</td></tr>';
}

function showStatus(elId, msg, isError) {
  const el = $(elId);
  el.classList.remove('hidden');
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
}
const showGistStatus = (msg, err) => showStatus('gist-editor-status', msg, err);

function resetGistEditor() {
  currentGistId = null;
  originalGistFilenames = [];
  gistNavIdx = 0;
  $('gist-editor-title').textContent = 'Create Gist';
  $('gist-description').value = '';
  $('gist-public').value = 'false';
  $('gist-editor-status').classList.add('hidden');
  $('gist-generate-result').classList.add('hidden');
  $('gist-files-list').innerHTML = '';
  addGistFileRow();
}

function addGistFileRow(filename = '', content = '', meta = '', originalFilename = '') {
  const list = $('gist-files-list');
  const card = document.createElement('div');
  card.className = 'gist-file-card';
  card.dataset.originalFilename = originalFilename || filename || '';
  card.innerHTML = `
    <div class="gist-file-card-header">
      <input type="text" class="gist-file-name" placeholder="filename.ext" value="${escapeHtml(filename)}" autocomplete="off" data-1p-ignore data-lpignore="true">
      <button class="btn red-btn gist-file-remove" type="button">Remove</button>
    </div>
    <div class="gist-file-editor-shell">
      <textarea class="gist-file-content" placeholder="File content...">${escapeHtml(content)}</textarea>
      <button class="editor-fab gist-file-fab" type="button" title="Find & Replace">🔍</button>
    </div>
    ${meta ? `<div class="gist-file-meta"><span style="color:var(--muted);font-size:11px;">Current raw — </span><button class="gist-raw-meta-btn" type="button" data-copy-url="${escapeHtml(meta)}">Copy URL</button></div>` : '<div class="gist-file-meta"></div>'}
  `;
  const nameInput = card.querySelector('.gist-file-name');
  card.querySelector('.gist-file-remove').onclick = () => {
    const existingEditor = gistFileEditors.get(card);
    if ($('gist-files-list').children.length === 1) {
      nameInput.value = '';
      if (existingEditor) existingEditor.setValue('');
      else card.querySelector('.gist-file-content').value = '';
      card.querySelector('.gist-file-meta').textContent = '';
      return;
    }
    if (existingEditor) {
      existingEditor.toTextArea();
      gistFileEditors.delete(card);
    }
    card.remove();
    gistNavIdx = Math.max(0, gistNavIdx - 1);
    updateGistFileNav();
  };
  list.appendChild(card);
  scheduleIdle(() => updateGistFileNav(), 50);

  // Defer CodeMirror init so each card renders before the editor is created,
  // preventing multi-file gists from freezing the UI during batch load.
  scheduleIdle(() => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textArea = card.querySelector('.gist-file-content');
    if (!textArea || !card.isConnected) return;
    const editor = CodeMirror.fromTextArea(textArea, {
      lineNumbers: true,
      mode: guessCodeMirrorMode(filename),
      theme: isLight ? 'idea' : 'darcula',
      lineWrapping: true,
      viewportMargin: 10,
      flattenSpans: true,
      inputStyle: 'contenteditable'
    });
    editor.on('focus', () => {
      if (window.innerWidth <= 900) {
        setTimeout(() => {
          editor.getWrapperElement().scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
    editor.setValue(content || '');
    editor.setSize(null, 220);
    gistFileEditors.set(card, editor);
    const updateFileMode = debounce(() => {
      editor.setOption('mode', guessCodeMirrorMode(nameInput.value));
    }, 120);
    nameInput.addEventListener('input', updateFileMode);
    const fileFab = card.querySelector('.gist-file-fab');
    fileFab.onclick = () => toggleCodeSearchDialogFor(editor);
    fileFab.addEventListener('mousedown', (e) => {
      if (editor && editor.getWrapperElement().querySelectorAll('.CodeMirror-dialog').length > 0) e.preventDefault();
    });
    scheduleIdle(() => editor.refresh(), 200);
  }, 150);
}

function collectGistFiles() {
  const files = {};
  const currentNames = new Set();
  const rows = Array.from(document.querySelectorAll('#gist-files-list .gist-file-card'));
  for (const row of rows) {
    const nameInput = row.querySelector('.gist-file-name');
    const filename = normalizeGistFilename(nameInput.value);
    if (filename) nameInput.value = filename;
    const editor = gistFileEditors.get(row);
    const content = editor ? editor.getValue() : row.querySelector('.gist-file-content').value;
    if (!filename) continue;
    currentNames.add(filename);
    files[filename] = { content };
    const originalFilename = row.dataset.originalFilename || '';
    if (originalFilename && originalFilename !== filename && !files[originalFilename]) {
      files[originalFilename] = { content: '' };
    }
  }
  for (const originalFilename of originalGistFilenames) {
    if (!currentNames.has(originalFilename) && !files[originalFilename]) {
      files[originalFilename] = { content: '' };
    }
  }
  return files;
}

async function openGistEditor(gistId = null) {
  resetGistEditor();
  $('gist-editor-modal').classList.remove('hidden');
  scheduleIdle(() => {
    Array.from(document.querySelectorAll('#gist-files-list .gist-file-card')).forEach(card => {
      const editor = gistFileEditors.get(card);
      if (editor) editor.refresh();
    });
  }, 220);
  if (!gistId) return;

  currentGistId = gistId;
  $('gist-editor-title').textContent = 'Edit Gist';
  const gist = await api(`/gists/${gistId}`);
  if (!gist || !gist.id) {
    showGistStatus('Failed to load gist', true);
    return;
  }

  $('gist-description').value = gist.description || '';
  $('gist-public').value = gist.public ? 'true' : 'false';
  $('gist-files-list').innerHTML = '';
  const files = Object.values(gist.files || {});
  originalGistFilenames = files.map(file => file.filename);
  if (!files.length) {
    addGistFileRow();
  } else {
    files.forEach(file => {
      addGistFileRow(file.filename, file.content || '', file.raw_url || '', file.filename);
    });
  }
  scheduleIdle(() => {
    Array.from(document.querySelectorAll('#gist-files-list .gist-file-card')).forEach(card => {
      const editor = gistFileEditors.get(card);
      if (editor) editor.refresh();
    });
  }, 220);
}

async function saveGist() {
  const files = collectGistFiles();
  if (!Object.keys(files).length) {
    showGistStatus('At least one file is required', true);
    return;
  }

  const payload = {
    description: $('gist-description').value.trim(),
    public: $('gist-public').value === 'true',
    files
  };

  const method = currentGistId ? 'PATCH' : 'POST';
  const url = currentGistId ? `/gists/${currentGistId}` : '/gists';
  showGistStatus(currentGistId ? 'Saving gist...' : 'Creating gist...', false);
  $('btn-save-gist').disabled = true;
  const res = await api(url, method, payload);
  $('btn-save-gist').disabled = false;

  if (!res || !res.id) {
    showGistStatus(res?.error || 'Save failed', true);
    return;
  }

  currentGistId = res.id;
  $('gist-editor-title').textContent = 'Edit Gist';
  showGistStatus('Gist saved successfully', false);
  const filesOut = Object.values(res.files || {});
  const links = filesOut.map(file =>
    `<button class="btn secondary" style="font-size:12px;padding:4px 10px;" data-copy-url="${escapeHtml(file.raw_url || '')}">${escapeHtml(decodeMaybe(file.filename))}</button>`
  ).join('');
  $('gist-generate-result').classList.remove('hidden');
  $('gist-generate-result').innerHTML = `
    <div>✅ Gist: <a href="${res.html_url}" target="_blank" style="color:var(--accent)">${res.html_url}</a></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;">
      <span style="font-size:12px;color:var(--muted);white-space:nowrap;">Raw files:</span>${links}
    </div>
  `;
  loadGists();
}

async function deleteGist(gistId) {
  const ok = await showConfirm('Delete Gist', `Delete gist "${gistId}"?`);
  if (!ok) return;
  const row = $('gists-tbody').querySelector(`tr[data-gist-id="${CSS.escape(gistId)}"]`);
  if (row) row.remove();
  lastGistsJson = '';
  if (currentGistId === gistId) $('gist-editor-modal').classList.add('hidden');
  const res = await api(`/gists/${gistId}`, 'DELETE');
  if (!res || !res.ok) loadGists();
}

$('btn-open-gists').onclick = () => {
  $('gists-modal').classList.remove('hidden');
  loadGists();
};
$('btn-close-gists').onclick = () => $('gists-modal').classList.add('hidden');
$('btn-new-gist').onclick = () => openGistEditor(null);
$('btn-close-gist-editor').onclick = () => {
  $('gist-editor-modal').classList.add('hidden');
  $('gist-file-nav').classList.add('hidden');
};
$('btn-add-gist-file').onclick = () => addGistFileRow();
$('btn-save-gist').onclick = () => saveGist();
$('gist-nav-up').onclick = () => scrollToGistFile(gistNavIdx - 1);
$('gist-nav-down').onclick = () => scrollToGistFile(gistNavIdx + 1);

// WebDAV Modal
$('btn-open-webdav').onclick = async () => {
  $('webdav-modal').classList.remove('hidden');
  $('webdav-status').classList.add('hidden');
  try {
    const res = await api('/api/v1/admin/webdav/settings', 'GET');
    if (res && res.ok) {
      $('webdav-url').value = res.settings.url || '';
      $('webdav-user').value = res.settings.username || '';
      $('webdav-pass').value = res.settings.password || '';
      $('webdav-encrypt-key').value = res.settings.encryptKey || '';
      $('webdav-auto-interval').value = String(res.settings.autoBackupIntervalHours || 0);
      const ab = res.autoBackup || {};
      const statusEl = $('webdav-auto-status');
      if (ab.intervalHours && ab.active) {
        if (ab.lastBackupError) {
          statusEl.textContent = `Auto backup: last failed — ${ab.lastBackupError}`;
          statusEl.style.color = 'var(--red)';
        } else if (ab.lastBackupAt) {
          const ago = Math.round((Date.now() - new Date(ab.lastBackupAt)) / 60000);
          statusEl.textContent = `Auto backup: last succeeded ${ago < 1 ? 'just now' : ago + 'm ago'}`;
          statusEl.style.color = 'var(--green)';
        } else {
          statusEl.textContent = `Auto backup: active, not yet run`;
          statusEl.style.color = 'var(--muted)';
        }
      } else {
        statusEl.textContent = '';
      }
    }
  } catch(e) {}
};
$('btn-close-webdav').onclick = () => $('webdav-modal').classList.add('hidden');

const showWebdavStatus = (msg, err) => showStatus('webdav-status', msg, err);

$('btn-save-webdav').onclick = async () => {
  const payload = {
    url: $('webdav-url').value,
    username: $('webdav-user').value,
    password: $('webdav-pass').value,
    encryptKey: $('webdav-encrypt-key').value,
    autoBackupIntervalHours: Number($('webdav-auto-interval').value) || 0
  };
  const res = await api('/api/v1/admin/webdav/settings', 'POST', payload);
  if (res && res.ok) showWebdavStatus('Settings saved successfully!', false);
  else showWebdavStatus(res?.error || 'Save failed', true);
};

$('btn-webdav-backup').onclick = async () => {
  if (!await showConfirm('Backup', 'Start encrypted backup to WebDAV?', 'Confirm', 'green')) return;
  showWebdavStatus('Backing up...', false);
  $('btn-webdav-backup').disabled = true;
  const res = await api('/api/v1/admin/webdav/backup', 'POST');
  $('btn-webdav-backup').disabled = false;
  if (res && res.ok) showWebdavStatus('✅ ' + res.message, false);
  else showWebdavStatus('❌ ' + (res?.error || 'Backup failed'), true);
};

$('btn-webdav-restore').onclick = async () => {
  if (!await showConfirm('Restore', 'Restore from WebDAV? This will OVERWRITE existing data with the same slugs.', 'Confirm', 'green')) return;
  showWebdavStatus('Restoring...', false);
  $('btn-webdav-restore').disabled = true;
  const res = await api('/api/v1/admin/webdav/restore', 'POST');
  $('btn-webdav-restore').disabled = false;
  if (res && res.ok) {
    showWebdavStatus('✅ ' + res.message + ' — Reloading...', false);
    setTimeout(() => window.location.reload(), 1200);
  } else showWebdavStatus('❌ ' + (res?.error || 'Restore failed'), true);
};

// Export / Import Modal
$('btn-open-export').onclick = () => {
  $('export-modal').classList.remove('hidden');
  $('export-status').classList.add('hidden');
};
$('btn-close-export').onclick = () => $('export-modal').classList.add('hidden');

// Admin Settings Modal
$('btn-open-settings').onclick = async () => {
  $('settings-modal').classList.remove('hidden');
  try {
    const res = await api('/api/v1/admin/settings', 'GET');
    if (res && res.ok) {
      $('settings-username').value = res.settings.username || '';
      $('settings-password').value = res.settings.password || '';
      $('settings-api-key').value = res.settings.apiKey || '';
    }
  } catch (e) {}
};
$('btn-close-settings').onclick = () => $('settings-modal').classList.add('hidden');

$('btn-gen-api-key').onclick = () => {
  const chars = 'abcdef0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  $('settings-api-key').value = key;
};

$('settings-api-key').onclick = () => {
  const val = $('settings-api-key').value;
  if (val && val !== 'Copied!') {
    copyFallback(val);
    $('settings-api-key').value = 'Copied!';
    setTimeout(() => { $('settings-api-key').value = val; }, 800);
  }
};

$('btn-save-settings').onclick = async () => {
  const payload = {
    username: $('settings-username').value,
    password: $('settings-password').value,
    apiKey: $('settings-api-key').value
  };
  const res = await api('/api/v1/admin/settings', 'POST', payload);
  if (res && res.ok) {
    showAlert('Success', 'Admin settings updated successfully.');
    $('settings-modal').classList.add('hidden');
  } else {
    showAlert('Error', res?.error || 'Failed to update settings');
  }
};

const showExportStatus = (msg, err) => showStatus('export-status', msg, err);

$('btn-do-export').onclick = async () => {
  const key = $('export-encrypt-key').value;
  if (!key) return showExportStatus('Please enter an encryption password', true);
  showExportStatus('Exporting...', false);
  $('btn-do-export').disabled = true;
  try {
    const res = await fetch('/api/v1/admin/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ encryptKey: key })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'litegist_backup.enc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showExportStatus('✅ Export downloaded!', false);
  } catch (err) {
    showExportStatus('❌ ' + err.message, true);
  }
  $('btn-do-export').disabled = false;
};

$('btn-do-import').onclick = () => {
  const key = $('export-encrypt-key').value;
  if (!key) return showExportStatus('Please enter the encryption password first', true);
  $('import-file-input').click();
};

$('import-file-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const key = $('export-encrypt-key').value;
  showExportStatus('Importing...', false);
  $('btn-do-import').disabled = true;
  try {
    const data = await file.text();
    const res = await api('/api/v1/admin/import', 'POST', { encryptKey: key, data });
    if (res && res.ok) {
      showExportStatus('✅ ' + res.message + ' — Reloading...', false);
      setTimeout(() => window.location.reload(), 1200);
    } else {
      showExportStatus('❌ ' + (res?.error || 'Import failed'), true);
    }
  } catch (err) {
    showExportStatus('❌ ' + err.message, true);
  }
  $('btn-do-import').disabled = false;
  $('import-file-input').value = '';
};

$('btn-confirm-generate').onclick = async () => {
  const content = cm ? cm.getValue() : $('share-content').value;
  if (!content) { await showAlert('Error', 'Content required'); return; }
  
  const payload = {
    content,
    slug: $('share-slug').value,
    password: $('share-pass').value,
    type: $('share-type').value
  };
  
  const expiryDays = parseInt($('share-expiry').value);
  if (expiryDays) {
    const d = new Date();
    d.setDate(d.getDate() + expiryDays);
    payload.expiresAt = d.toISOString();
  }

  const res = await api('/api/v1/admin/text/generate', 'POST', payload);
  if (res && res.ok) {
    const box = $('generate-result');
    box.classList.remove('hidden');
    const fullUrl = window.location.origin + res.shareUrl;
    const slug = res.shareUrl.replace('/text/', '');
    const token = res.token || '';
    if (payload.type === 'sub') {
      const fmts = [
        { label: 'Clash', fmt: 'clash' },
        { label: 'Mihomo', fmt: 'mihomo' },
        { label: 'Stash', fmt: 'stash' },
        { label: 'Surfboard', fmt: 'surfboard' },
        { label: 'Surge', fmt: 'surge' },
        { label: 'Surge (macOS)', fmt: 'surgemac' },
        { label: 'Loon', fmt: 'loon' },
        { label: 'Shadowrocket', fmt: 'shadowrocket' },
        { label: 'QX', fmt: 'qx' },
        { label: 'Egern', fmt: 'egern' },
        { label: 'Sing-box', fmt: 'singbox' },
        { label: 'V2Ray', fmt: 'v2ray' },
        { label: 'URI', fmt: 'uri' },
        { label: 'JSON', fmt: 'json' },
        { label: 'Base64', fmt: 'b64' },
        { label: 'Base32', fmt: 'b32' }
      ];
      const convertMenu = renderConvertMenuHtml(fmts.map(f => ({
        label: f.label,
        url: token ? `${window.location.origin}/token:${token}/${slug}/raw/${f.fmt}` : `${window.location.origin}/${slug}/raw/${f.fmt}`
      })));
      const rawPattern = token ? `/token:${token}/${slug}/raw/&lt;format&gt;` : `/${slug}/raw/&lt;format&gt;`;
      box.innerHTML = `<div>✅ Share: <a href="${res.shareUrl}" target="_blank" style="color:var(--accent)">${fullUrl}</a></div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted)">Subscription conversion (click to copy link):</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${convertMenu}</div>
        <div style="margin-top:8px;font-size:12px;color:var(--muted)">Raw URL pattern: <code>${rawPattern}</code></div>`;
    } else {
      box.innerHTML = `Success! Link: <a href="${res.shareUrl}" target="_blank" style="color:var(--accent)">${fullUrl}</a>`;
    }
    loadShares();
  } else await showAlert('Error', res?.error || 'Generation failed');
};

let cm = null;

function getShareEditorValue() {
  return cm ? cm.getValue() : $('share-content').value;
}

function getEditEditorValue() {
  return editCm ? editCm.getValue() : $('edit-content').value;
}

function renderMarkdownInto(raw, targetEl) {
  if (!raw) { targetEl.innerHTML = ''; return; }
  try {
    const html = DOMPurify.sanitize(marked.parse(raw));
    targetEl.innerHTML = html;
    const blocks = Array.from(targetEl.querySelectorAll('pre code'));
    if (!blocks.length) return;
    scheduleIdle(() => {
      blocks.forEach((block) => {
        hljs.highlightElement(block);
      });
    }, 400);
  } catch(e) {}
}

function renderMarkdown() {
  renderMarkdownInto(getShareEditorValue(), $('md-preview'));
}

function renderEditMarkdown() {
  renderMarkdownInto(getEditEditorValue(), $('edit-md-preview'));
}

let mdTimeout;
$('share-content').addEventListener('input', () => {
  if ($('share-type').value === 'markdown') {
    clearTimeout(mdTimeout);
    mdTimeout = setTimeout(() => {
      cancelIdle(sharePreviewJob);
      sharePreviewJob = scheduleIdle(() => renderMarkdown(), 400);
    }, 500);
  }
});

let mdPreviewOn = false;
let editMdTimeout;

function isCodeLikeType(type) {
  return type === 'code' || type === 'sub';
}

function applyEditorMode(instance, type) {
  instance.setOption('mode', guessCodeMirrorMode('', type));
}

function ensureCodeEditor(currentVal, type) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (!cm) {
    cm = CodeMirror.fromTextArea($('share-content'), {
      lineNumbers: true,
      mode: 'javascript',
      theme: isLight ? 'idea' : 'darcula',
      lineWrapping: true,
      viewportMargin: 10,
      flattenSpans: true,
      inputStyle: 'contenteditable'
    });
    cm.on('focus', () => {
      if (window.innerWidth <= 900) {
        setTimeout(() => {
          cm.getWrapperElement().scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
  }

  applyEditorMode(cm, type);
  if (cm.getValue() !== currentVal) cm.setValue(currentVal);
  cm.setSize(null, '100%');
}

function ensureEditCodeEditor(currentVal, type) {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (!editCm) {
    editCm = CodeMirror.fromTextArea($('edit-content'), {
      lineNumbers: true,
      mode: 'javascript',
      theme: isLight ? 'idea' : 'darcula',
      lineWrapping: true,
      viewportMargin: 10,
      flattenSpans: true,
      inputStyle: 'contenteditable'
    });
    editCm.on('focus', () => {
      if (window.innerWidth <= 900) {
        setTimeout(() => {
          editCm.getWrapperElement().scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
    editCm.on('change', () => {
      if ($('edit-type').value === 'markdown' && editPreviewOn) renderEditMarkdown();
    });
  }

  applyEditorMode(editCm, type);
  if (editCm.getValue() !== currentVal) editCm.setValue(currentVal);
  editCm.setSize(null, 420);
  scheduleIdle(() => editCm.refresh(), 200);
}

function toggleCodeSearchDialogFor(instance) {
  if (!instance) return;
  const wrapper = instance.getWrapperElement();
  const dialogs = wrapper.querySelectorAll('.CodeMirror-dialog');
  if (dialogs.length) {
    dialogs.forEach(dialog => dialog.remove());
    instance.focus();
    return;
  }
  instance.execCommand('replace');
}

function toggleCodeSearchDialog() {
  toggleCodeSearchDialogFor(cm);
}

function updateEditorMode() {
  const type = $('share-type').value;
  const currentVal = cm ? cm.getValue() : $('share-content').value;
  const fab = $('editor-fab');
  
  // Tear down CodeMirror if leaving code mode
  if (cm && !isCodeLikeType(type)) {
    cm.toTextArea();
    cm = null;
    $('share-content').value = currentVal;
  }
  
  // Reset markdown preview state
  mdPreviewOn = false;
  
  if (type === 'txt') {
    $('md-preview').classList.add('hidden');
    $('share-content').classList.remove('hidden');
    fab.classList.add('hidden');
  } else if (type === 'markdown') {
    $('md-preview').classList.add('hidden');
    $('share-content').classList.remove('hidden');
    fab.classList.remove('hidden');
    fab.textContent = '👁';
    fab.title = 'Preview';
  } else if (isCodeLikeType(type)) {
    $('md-preview').classList.add('hidden');
    fab.classList.remove('hidden');
    fab.textContent = '🔍';
    fab.title = 'Find & Replace';
    ensureCodeEditor(currentVal, type);
  }
}

function updateEditEditorMode() {
  const type = $('edit-type').value;
  const currentVal = getEditEditorValue();
  const fab = $('edit-editor-fab');

  if (editCm && !isCodeLikeType(type)) {
    editCm.toTextArea();
    editCm = null;
    $('edit-content').value = currentVal;
  }

  editPreviewOn = false;

  if (type === 'txt') {
    $('edit-md-preview').classList.add('hidden');
    $('edit-content').classList.remove('hidden');
    fab.classList.add('hidden');
  } else if (type === 'markdown') {
    $('edit-md-preview').classList.add('hidden');
    $('edit-content').classList.remove('hidden');
    fab.classList.remove('hidden');
    fab.textContent = '👁';
    fab.title = 'Preview';
  } else if (isCodeLikeType(type)) {
    $('edit-md-preview').classList.add('hidden');
    fab.classList.remove('hidden');
    fab.textContent = '🔍';
    fab.title = 'Find & Replace';
    ensureEditCodeEditor(currentVal, type);
  }
}

$('editor-fab').addEventListener('mousedown', (e) => {
  const type = $('share-type').value;
  if (isCodeLikeType(type) && cm && cm.getWrapperElement().querySelectorAll('.CodeMirror-dialog').length > 0) e.preventDefault();
});
$('editor-fab').onclick = () => {
  const type = $('share-type').value;
  if (isCodeLikeType(type) && cm) {
    toggleCodeSearchDialog();
  } else if (type === 'markdown') {
    mdPreviewOn = !mdPreviewOn;
    const fab = $('editor-fab');
    if (mdPreviewOn) {
      renderMarkdown();
      $('share-content').classList.add('hidden');
      $('md-preview').classList.remove('hidden');
      fab.textContent = '✏️';
      fab.title = 'Edit';
    } else {
      $('share-content').classList.remove('hidden');
      $('md-preview').classList.add('hidden');
      fab.textContent = '👁';
      fab.title = 'Preview';
    }
  }
};

$('edit-editor-fab').addEventListener('mousedown', (e) => {
  const type = $('edit-type').value;
  if (isCodeLikeType(type) && editCm && editCm.getWrapperElement().querySelectorAll('.CodeMirror-dialog').length > 0) e.preventDefault();
});
$('edit-editor-fab').onclick = () => {
  const type = $('edit-type').value;
  if (isCodeLikeType(type) && editCm) {
    toggleCodeSearchDialogFor(editCm);
  } else if (type === 'markdown') {
    editPreviewOn = !editPreviewOn;
    const fab = $('edit-editor-fab');
    if (editPreviewOn) {
      renderEditMarkdown();
      $('edit-content').classList.add('hidden');
      $('edit-md-preview').classList.remove('hidden');
      fab.textContent = '✏️';
      fab.title = 'Edit';
    } else {
      $('edit-content').classList.remove('hidden');
      $('edit-md-preview').classList.add('hidden');
      fab.textContent = '👁';
      fab.title = 'Preview';
    }
  }
};

$('share-type').addEventListener('change', updateEditorMode);
$('edit-type').addEventListener('change', updateEditEditorMode);
$('edit-content').addEventListener('input', () => {
  if ($('edit-type').value === 'markdown') {
    clearTimeout(editMdTimeout);
    editMdTimeout = setTimeout(() => {
      cancelIdle(editPreviewJob);
      editPreviewJob = scheduleIdle(() => renderEditMarkdown(), 400);
    }, 500);
  }
});

// Theme Management
const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (cm) cm.setOption("theme", theme === 'light' ? 'idea' : 'darcula');
  if (editCm) editCm.setOption("theme", theme === 'light' ? 'idea' : 'darcula');
  document.querySelectorAll('#gist-files-list .gist-file-card').forEach(card => {
    const editor = gistFileEditors.get(card);
    if (editor) editor.setOption('theme', theme === 'light' ? 'idea' : 'darcula');
  });
}

function initTheme() {
  const saved = sessionStorage.getItem('theme');
  if (saved) {
    applyTheme(saved);
  } else {
    applyTheme(themeQuery.matches ? 'dark' : 'light');
  }
}

$('theme-toggle').onclick = () => {
  const current = document.documentElement.getAttribute('data-theme');
  const target = current === 'dark' ? 'light' : 'dark';
  applyTheme(target);
  sessionStorage.setItem('theme', target);
};

themeQuery.addEventListener('change', (e) => {
  if (!sessionStorage.getItem('theme')) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-convert-toggle]');
  if (toggle) {
    const anchor = toggle.closest('.convert-anchor');
    const popover = anchor ? anchor.querySelector('.convert-popover') : null;
    document.querySelectorAll('.convert-popover').forEach(node => {
      if (node !== popover) node.classList.add('hidden');
    });
    if (popover) {
      const willOpen = popover.classList.contains('hidden');
      popover.classList.toggle('hidden');
      if (willOpen) positionConvertPopover(anchor, popover);
    }
    return;
  }

  const linkBtn = event.target.closest('[data-convert-link]');
  if (linkBtn) {
    const url = window.location.origin + linkBtn.getAttribute('data-convert-link');
    copyFallback(url);
    linkBtn.classList.add('copy-flash');
    setTimeout(() => linkBtn.classList.remove('copy-flash'), 700);
    return;
  }

  if (!event.target.closest('.convert-anchor')) {
    document.querySelectorAll('.convert-popover').forEach(node => node.classList.add('hidden'));
  }
});

window.addEventListener('resize', () => {
  document.querySelectorAll('.convert-anchor').forEach(anchor => {
    const popover = anchor.querySelector('.convert-popover');
    if (popover && !popover.classList.contains('hidden')) positionConvertPopover(anchor, popover);
  });
});

$('confirm-cancel').onclick = () => {
  $('confirm-modal').classList.add('hidden');
  if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
};
$('confirm-ok').onclick = () => {
  $('confirm-modal').classList.add('hidden');
  if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
};
$('alert-ok').onclick = () => {
  $('alert-modal').classList.add('hidden');
  if (_alertResolve) { _alertResolve(); _alertResolve = null; }
};

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!$('confirm-modal').classList.contains('hidden')) { $('confirm-ok').click(); return; }
  if (!$('alert-modal').classList.contains('hidden')) { $('alert-ok').click(); return; }
});

// Batch delete & multi-select for Manage Links
function updateBatchBar() {
  const checked = document.querySelectorAll('.share-check:checked');
  const bar = $('batch-bar');
  if (!bar) return;
  if (checked.length > 0) {
    bar.classList.remove('hidden');
    $('batch-count').textContent = `${checked.length} selected`;
  } else {
    bar.classList.add('hidden');
  }
  const allBoxes = document.querySelectorAll('.share-check');
  const allChecked = allBoxes.length > 0 && checked.length === allBoxes.length;
  const selectAll = $('check-all-shares');
  if (selectAll) {
    selectAll.checked = allChecked;
    selectAll.indeterminate = !allChecked && checked.length > 0;
  }
}

$('shares-tbody').addEventListener('change', e => {
  if (e.target.classList.contains('share-check')) updateBatchBar();
});

$('check-all-shares').addEventListener('change', e => {
  document.querySelectorAll('.share-check').forEach(cb => { cb.checked = e.target.checked; });
  updateBatchBar();
});

$('btn-batch-delete').onclick = async () => {
  const checked = Array.from(document.querySelectorAll('.share-check:checked'));
  if (!checked.length) return;
  const slugs = checked.map(cb => cb.dataset.slug);
  const ok = await showConfirm('Delete Selected', `Delete ${slugs.length} share(s)?`);
  if (!ok) return;
  checked.forEach(cb => { const row = cb.closest('tr'); if (row) row.remove(); });
  lastSharesJson = '';
  updateBatchBar();
  await api('/api/v1/admin/shares', 'DELETE', { slugs });
  loadShares();
};

// Gist raw copy popover
document.addEventListener('click', e => {
  const rawBtn = e.target.closest('[data-gist-raw]');
  if (rawBtn) {
    const gistId = rawBtn.dataset.gistRaw;
    const files = gistRawUrlsMap.get(gistId) || [];
    const popover = $('gist-raw-popover');
    popover.innerHTML = files.length
      ? files.map(f => `<button class="capsule-btn" style="background:var(--panel);border:1px solid var(--line);color:var(--text);cursor:pointer;" data-copy-raw-url="${escapeHtml(f.rawUrl)}">${escapeHtml(f.filename)}</button>`).join('')
      : '<span style="font-size:12px;color:var(--muted);">No files</span>';
    const rect = rawBtn.getBoundingClientRect();
    popover.classList.remove('hidden');
    requestAnimationFrame(() => {
      const pw = popover.offsetWidth || 200;
      const ph = popover.offsetHeight || 60;
      let top = rect.bottom + 8;
      let left = rect.left;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (left < 8) left = 8;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 8);
      popover.style.top = `${Math.round(top)}px`;
      popover.style.left = `${Math.round(left)}px`;
    });
    e.stopPropagation();
    return;
  }

  const rawCapsule = e.target.closest('[data-copy-raw-url]');
  if (rawCapsule) {
    copyWithFeedback(rawCapsule, rawCapsule.dataset.copyRawUrl);
    setTimeout(() => $('gist-raw-popover').classList.add('hidden'), 700);
    e.stopPropagation();
    return;
  }

  const copyUrlBtn = e.target.closest('[data-copy-url]');
  if (copyUrlBtn) {
    copyWithFeedback(copyUrlBtn, copyUrlBtn.dataset.copyUrl);
    return;
  }

  if (!e.target.closest('#gist-raw-popover')) {
    $('gist-raw-popover').classList.add('hidden');
  }
});

// Password visibility toggle on hover
[ $('share-pass'), $('edit-pass') ].forEach(el => {
  if (!el) return;
  el.onmouseenter = () => { el.type = 'text'; };
  el.onmouseleave = () => { el.type = 'password'; };
});

// Init
initTheme();
scheduleIdle(() => {
  updateEditorMode();
  loadShares();
  setInterval(loadShares, 60000);
}, 300);
