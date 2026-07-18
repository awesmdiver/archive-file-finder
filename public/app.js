'use strict';

const state = {
  config: null,
  mode: 'files', // 'files' | 'archives'
  selected: new Map(), // key `${archivePath}|${internalPath}` -> item
  renderMode: 'files', // mode of the currently-rendered result set (survives tree browsing)
  currentUnits: [], // top-level rows for the active mode: file groups, or archive rows
  pageSize: 25, // 10 | 25 | 50 | 'all'
  page: 1,
};

const el = (id) => document.getElementById(id);
const itemKey = (archivePath, internalPath) => `${archivePath}|${internalPath}`;

// ---- Theme toggle (dark by default; light is an explicit, remembered choice) ----

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    el('themeToggleBtn').textContent = '☀️ Light';
  } else {
    document.documentElement.removeAttribute('data-theme');
    el('themeToggleBtn').textContent = '🌙 Dark';
  }
}

applyTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');

el('themeToggleBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function fmtDate(ts) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadStats() {
  const stats = await api('/api/stats');
  el('statsMain').textContent =
    `${stats.archiveCount.toLocaleString()} archives indexed · ${stats.fileCount.toLocaleString()} matched files · ` +
    `last scan: ${fmtDate(stats.lastScanned)}`;
  const errLink = el('statsErrorLink');
  if (stats.errorCount) {
    errLink.textContent = `${stats.errorCount} archive(s) failed to read`;
    errLink.classList.remove('hidden');
  } else {
    errLink.classList.add('hidden');
  }
}

async function loadConfig() {
  state.config = await api('/api/config');
  el('scanFolder').value = state.config.scanFolder;
  el('outputFolder').value = state.config.outputFolder;
  renderExtensionTags();
}

function renderExtensionTags() {
  const container = el('extensionTags');
  container.innerHTML = '';
  for (const ext of state.config.extensions) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${ext} <button type="button" aria-label="remove">&times;</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state.config.extensions = state.config.extensions.filter((e) => e !== ext);
      renderExtensionTags();
    });
    container.appendChild(tag);
  }
}

function normalizeExtension(raw) {
  let ext = raw.trim().toLowerCase();
  if (!ext) return null;
  if (!ext.startsWith('.')) ext = '.' + ext;
  return ext;
}

el('addExtensionBtn').addEventListener('click', () => {
  const ext = normalizeExtension(el('newExtension').value);
  el('newExtension').value = '';
  if (!ext) return;
  if (!state.config.extensions.includes(ext)) {
    state.config.extensions.push(ext);
    renderExtensionTags();
  }
});
el('newExtension').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); el('addExtensionBtn').click(); }
});

// Opens a native Windows folder-browser dialog (server-spawned, since
// browsers won't hand a web page a real filesystem path) and, if the user
// picks a folder, writes it into the given text input.
async function pickFolderInto(inputId, btn) {
  const initial = el(inputId).value.trim();
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Opening…';
  try {
    const res = await api(`/api/pick-folder?initial=${encodeURIComponent(initial)}`);
    if (res.path) el(inputId).value = res.path;
  } catch (err) {
    alert(`Couldn't open the folder picker: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

el('browseScanFolderBtn').addEventListener('click', (e) => pickFolderInto('scanFolder', e.target));
el('browseOutputFolderBtn').addEventListener('click', (e) => pickFolderInto('outputFolder', e.target));
el('browseExtractDestBtn').addEventListener('click', (e) => pickFolderInto('extractDest', e.target));

async function saveConfig() {
  const payload = {
    scanFolder: el('scanFolder').value.trim(),
    outputFolder: el('outputFolder').value.trim(),
    extensions: state.config.extensions,
  };
  state.config = await api('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  renderExtensionTags();
  return state.config;
}

el('saveConfigBtn').addEventListener('click', saveConfig);

el('scanBtn').addEventListener('click', async () => {
  el('scanBtn').disabled = true;
  await saveConfig(); // always scan against whatever is currently in the form, not a stale saved value
  const progress = el('scanProgress');
  progress.classList.remove('hidden');
  el('progressFill').style.width = '0%';
  el('progressText').textContent = 'Starting scan...';

  const source = new EventSource('/api/scan');
  source.addEventListener('progress', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.phase === 'listing') {
      el('progressText').textContent = d.message;
    } else {
      const pct = d.total ? Math.round((d.current / d.total) * 100) : 100;
      el('progressFill').style.width = pct + '%';
      el('progressText').textContent = `${d.current} / ${d.total} — ${d.message}`;
    }
  });
  source.addEventListener('done', (evt) => {
    const d = JSON.parse(evt.data);
    el('progressText').textContent =
      `Done: ${d.scanned} scanned, ${d.skipped} unchanged, ${d.removed} removed` +
      (d.errors ? `, ${d.errors} failed to read` : '');
    el('progressFill').style.width = '100%';
    el('scanBtn').disabled = false;
    source.close();
    loadStats();
  });
  source.addEventListener('error', (evt) => {
    let message = 'Scan failed or connection lost.';
    try { message = JSON.parse(evt.data).message; } catch (_) {}
    el('progressText').textContent = message;
    el('scanBtn').disabled = false;
    source.close();
  });
});

// ---- Search mode ----

document.querySelectorAll('input[name=searchMode]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    if (!e.target.checked) return;
    state.mode = e.target.value;
    closeTree();
    runSearch();
  });
});

let searchDebounce = null;
el('searchBox').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearch, 200);
});
el('searchBox').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(searchDebounce);
  runSearch();
});
el('searchBtn').addEventListener('click', () => {
  clearTimeout(searchDebounce);
  runSearch();
});

async function runSearch() {
  const q = el('searchBox').value.trim();
  el('archiveTreePanel').classList.add('hidden');

  if (!q) {
    state.currentUnits = [];
    el('resultsTable').classList.add('hidden');
    el('archiveResultsList').classList.add('hidden');
    el('paginationBar').classList.add('hidden');
    el('noResults').classList.remove('hidden');
    el('noResults').textContent = 'No matches yet. Type a mod name above.';
    return;
  }

  const rows = await api(`/api/search?q=${encodeURIComponent(q)}&mode=${state.mode}`);
  el('noResults').classList.toggle('hidden', rows.length > 0);
  if (!rows.length) {
    state.currentUnits = [];
    el('resultsTable').classList.add('hidden');
    el('archiveResultsList').classList.add('hidden');
    el('paginationBar').classList.add('hidden');
    el('noResults').textContent = `No matches found for "${q}".`;
    return;
  }

  state.renderMode = state.mode;
  state.currentUnits = state.mode === 'files' ? groupFileRows(rows) : rows;
  state.page = 1;
  renderCurrentPage();
}

// Rows come pre-sorted (archive name, then file name) from the API, so
// consecutive rows sharing an archive are already contiguous — group them
// so an archive with many matches collapses to one "N matching files" row
// instead of flooding the list (e.g. searching "LOTD" against a big patch
// collection archive).
function groupFileRows(rows) {
  const groups = [];
  let current = null;
  for (const row of rows) {
    if (!current || current.archivePath !== row.archivePath) {
      current = { archivePath: row.archivePath, archiveName: row.archiveName, items: [] };
      groups.push(current);
    }
    current.items.push(row);
  }
  return groups;
}

function paginate(units) {
  const total = units.length;
  const size = state.pageSize === 'all' ? Math.max(total, 1) : state.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / size));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * size;
  return { pageItems: units.slice(start, start + size), totalPages, total };
}

function renderCurrentPage() {
  el('resultsTable').classList.add('hidden');
  el('archiveResultsList').classList.add('hidden');
  el('archiveTreePanel').classList.add('hidden');

  const { pageItems, totalPages, total } = paginate(state.currentUnits);
  if (!total) {
    el('paginationBar').classList.add('hidden');
    return;
  }

  if (state.renderMode === 'files') {
    renderFileResultsPage(pageItems);
  } else {
    renderArchiveResultsPage(pageItems);
  }
  updatePaginationBar(totalPages, total);
}

function updatePaginationBar(totalPages, total) {
  const bar = el('paginationBar');
  bar.classList.remove('hidden');
  el('pageIndicator').textContent = `Page ${state.page} of ${totalPages} (${total} result${total === 1 ? '' : 's'})`;
  el('prevPageBtn').disabled = state.page <= 1;
  el('nextPageBtn').disabled = state.page >= totalPages;
  document.querySelectorAll('.page-size-btn').forEach((btn) => {
    const v = btn.dataset.size === 'all' ? 'all' : Number(btn.dataset.size);
    btn.classList.toggle('active', v === state.pageSize);
  });
}

document.querySelectorAll('.page-size-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.pageSize = btn.dataset.size === 'all' ? 'all' : Number(btn.dataset.size);
    state.page = 1;
    renderCurrentPage();
  });
});
el('prevPageBtn').addEventListener('click', () => {
  if (state.page > 1) { state.page--; renderCurrentPage(); }
});
el('nextPageBtn').addEventListener('click', () => {
  state.page++; renderCurrentPage();
});

function renderFileResultsPage(groups) {
  el('resultsTable').classList.remove('hidden');
  const body = el('resultsBody');
  body.innerHTML = '';

  for (const group of groups) {
    if (group.items.length === 1) {
      body.appendChild(buildFileRow(group.items[0], false));
      continue;
    }
    body.appendChild(buildGroupRow(group));
    for (const row of group.items) {
      const tr = buildFileRow(row, true);
      tr.classList.add('hidden');
      body.appendChild(tr);
    }
  }
}

function buildFileRow(row, indented) {
  const key = itemKey(row.archivePath, row.internalPath);
  const tr = document.createElement('tr');
  if (indented) tr.classList.add('group-child');
  const checked = state.selected.has(key) ? 'checked' : '';
  tr.innerHTML = `
    <td class="col-check"><input type="checkbox" class="file-check" ${checked}></td>
    <td class="${indented ? 'indented-cell' : ''}">${escapeHtml(row.fileName)}</td>
    <td>${escapeHtml(row.extension)}</td>
    <td>${indented ? '' : escapeHtml(row.archiveName)}</td>
  `;
  const item = {
    archivePath: row.archivePath,
    internalPath: row.internalPath,
    fileName: row.fileName,
    archiveName: row.archiveName,
  };
  tr.querySelector('input').addEventListener('change', (e) => {
    if (e.target.checked) state.selected.set(key, item);
    else state.selected.delete(key);
    updateSelectionCount();
    if (indented) syncGroupCheckbox(tr);
  });
  return tr;
}

function buildGroupRow(group) {
  const items = group.items.map((row) => ({
    archivePath: row.archivePath,
    internalPath: row.internalPath,
    fileName: row.fileName,
    archiveName: row.archiveName,
  }));
  const selectedCount = items.filter((it) => state.selected.has(itemKey(it.archivePath, it.internalPath))).length;

  const tr = document.createElement('tr');
  tr.className = 'group-row';
  tr.innerHTML = `
    <td class="col-check"><input type="checkbox" class="group-check"></td>
    <td><button type="button" class="expand-toggle">&#9656; ${items.length} matching files</button></td>
    <td>&mdash;</td>
    <td>${escapeHtml(group.archiveName)}</td>
  `;

  const groupCheckbox = tr.querySelector('.group-check');
  groupCheckbox.checked = selectedCount === items.length;
  groupCheckbox.indeterminate = selectedCount > 0 && selectedCount < items.length;

  groupCheckbox.addEventListener('change', () => {
    const checked = groupCheckbox.checked;
    groupCheckbox.indeterminate = false;
    for (const it of items) {
      const key = itemKey(it.archivePath, it.internalPath);
      if (checked) state.selected.set(key, it);
      else state.selected.delete(key);
    }
    updateSelectionCount();
    let sib = tr.nextElementSibling;
    while (sib && sib.classList.contains('group-child')) {
      sib.querySelector('.file-check').checked = checked;
      sib = sib.nextElementSibling;
    }
  });

  const toggleBtn = tr.querySelector('.expand-toggle');
  toggleBtn.addEventListener('click', () => {
    let sib = tr.nextElementSibling;
    const wasCollapsed = sib && sib.classList.contains('hidden');
    while (sib && sib.classList.contains('group-child')) {
      sib.classList.toggle('hidden');
      sib = sib.nextElementSibling;
    }
    toggleBtn.innerHTML = `${wasCollapsed ? '&#9662;' : '&#9656;'} ${items.length} matching files`;
  });

  return tr;
}

function syncGroupCheckbox(childRow) {
  let groupRow = childRow.previousElementSibling;
  while (groupRow && !groupRow.classList.contains('group-row')) {
    groupRow = groupRow.previousElementSibling;
  }
  if (!groupRow) return;
  const groupCheckbox = groupRow.querySelector('.group-check');
  let sib = groupRow.nextElementSibling;
  let total = 0, checkedCount = 0;
  while (sib && sib.classList.contains('group-child')) {
    total++;
    if (sib.querySelector('.file-check').checked) checkedCount++;
    sib = sib.nextElementSibling;
  }
  groupCheckbox.checked = total > 0 && checkedCount === total;
  groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < total;
}

function renderArchiveResultsPage(rows) {
  const list = el('archiveResultsList');
  list.classList.remove('hidden');
  list.innerHTML = '';
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'archive-result-row';
    const errBadge = row.scanError ? '<span class="badge-error" title="' + escapeHtml(row.scanError) + '">unreadable</span>' : '';
    li.innerHTML = `
      <span class="archive-result-name">${escapeHtml(row.archiveName)}</span>
      <span class="archive-result-size">${fmtSize(row.size)}</span>
      ${errBadge}
    `;
    if (!row.scanError) {
      li.addEventListener('click', () => openTree(row));
    } else {
      li.classList.add('disabled');
    }
    list.appendChild(li);
  }
}

async function openTree(archiveRow) {
  el('archiveResultsList').classList.add('hidden');
  const panel = el('archiveTreePanel');
  panel.classList.remove('hidden');
  el('treeArchiveName').textContent = archiveRow.archiveName;
  const body = el('archiveTreeBody');
  body.innerHTML = 'Loading contents…';
  try {
    const data = await api(`/api/archive-tree?id=${archiveRow.archiveId}`);
    body.innerHTML = '';
    body.appendChild(renderTreeNode(data.tree, data.archivePath, true));
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

function renderTreeNode(node, archivePath, isRoot) {
  if (node.type === 'file') {
    const row = document.createElement('div');
    row.className = 'tree-file-row';
    const key = itemKey(archivePath, node.internalPath);
    const checked = state.selected.has(key) ? 'checked' : '';
    row.innerHTML = `
      <input type="checkbox" class="file-check" ${checked}>
      <span class="tree-file-name">${escapeHtml(node.name)}</span>
      <span class="tree-file-size">${fmtSize(node.size)}</span>
    `;
    const item = {
      archivePath,
      internalPath: node.internalPath,
      fileName: node.name,
      archiveName: archivePathBaseName(archivePath),
    };
    wireCheckbox(row.querySelector('input'), item);
    return row;
  }

  if (isRoot) {
    const container = document.createElement('div');
    for (const child of node.children) container.appendChild(renderTreeNode(child, archivePath, false));
    return container;
  }

  const details = document.createElement('details');
  details.open = false;
  const summary = document.createElement('summary');
  summary.textContent = node.name;
  details.appendChild(summary);
  for (const child of node.children) details.appendChild(renderTreeNode(child, archivePath, false));
  return details;
}

function archivePathBaseName(p) {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1];
}

el('closeTreeBtn').addEventListener('click', closeTree);
function closeTree() {
  el('archiveTreePanel').classList.add('hidden');
  if (state.mode === 'archives' && state.currentUnits.length) {
    renderCurrentPage();
  }
}

function wireCheckbox(checkbox, item) {
  checkbox.addEventListener('change', (e) => {
    const key = itemKey(item.archivePath, item.internalPath);
    if (e.target.checked) state.selected.set(key, item);
    else state.selected.delete(key);
    updateSelectionCount();
  });
}

function updateSelectionCount() {
  el('selectionCount').textContent = `${state.selected.size} selected`;
}

el('selectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.file-check').forEach((cb) => {
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });
});
el('clearSelectionBtn').addEventListener('click', () => {
  state.selected.clear();
  document.querySelectorAll('.file-check').forEach((cb) => { cb.checked = false; });
  document.querySelectorAll('.group-check').forEach((cb) => { cb.checked = false; cb.indeterminate = false; });
  updateSelectionCount();
});

// ---- Extraction ----

el('extractBtn').addEventListener('click', () => {
  if (!state.selected.size) return;
  el('extractCount').textContent = state.selected.size;
  el('extractDest').value = state.config.outputFolder;
  el('extractResults').innerHTML = '';
  el('extractDialog').classList.remove('hidden');
});
el('extractCancelBtn').addEventListener('click', () => {
  el('extractDialog').classList.add('hidden');
});
el('extractConfirmBtn').addEventListener('click', async () => {
  const outputFolder = el('extractDest').value.trim();
  const flat = el('extractFlat').checked;
  const items = Array.from(state.selected.values()).map((it) => ({
    archivePath: it.archivePath,
    internalPath: it.internalPath,
  }));
  const labels = Array.from(state.selected.values());
  el('extractConfirmBtn').disabled = true;
  const resultsEl = el('extractResults');
  resultsEl.innerHTML = 'Extracting...';
  try {
    const res = await api('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, outputFolder, flat }),
    });
    resultsEl.innerHTML = res.results.map((r, i) => {
      const label = labels[i] ? labels[i].fileName : r.key;
      return r.ok
        ? `<div class="ok">&check; ${escapeHtml(label)} &rarr; ${escapeHtml(r.path)}</div>`
        : `<div class="fail">&cross; ${escapeHtml(label)}: ${escapeHtml(r.error)}</div>`;
    }).join('');
  } catch (err) {
    resultsEl.innerHTML = `<div class="fail">${escapeHtml(err.message)}</div>`;
  } finally {
    el('extractConfirmBtn').disabled = false;
  }
});

// ---- Failed archives ----

const failedSelected = new Set();

el('statsErrorLink').addEventListener('click', async (e) => {
  e.preventDefault();
  const rows = await api('/api/failed-archives');
  failedSelected.clear();
  renderFailedList(rows);
  el('failedResults').innerHTML = '';
  el('failedDialog').classList.remove('hidden');
});

function renderFailedList(rows) {
  const list = el('failedList');
  list.innerHTML = '';
  for (const row of rows) {
    const li = document.createElement('li');
    li.innerHTML = `
      <input type="checkbox" class="failed-check">
      <span>
        <span class="failed-item-name">${escapeHtml(row.archiveName)}</span>
        <span class="failed-item-error">${escapeHtml(row.scanError)}</span>
      </span>
    `;
    const checkbox = li.querySelector('input');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) failedSelected.add(row.archiveId);
      else failedSelected.delete(row.archiveId);
      updateFailedSelectionCount();
    });
    list.appendChild(li);
  }
  updateFailedSelectionCount();
}

function updateFailedSelectionCount() {
  el('failedSelectionCount').textContent = `${failedSelected.size} selected`;
}

el('failedSelectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.failed-check').forEach((cb) => {
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });
});

el('failedCloseBtn').addEventListener('click', () => {
  el('failedDialog').classList.add('hidden');
  loadStats();
});

el('failedUntrackBtn').addEventListener('click', async () => {
  if (!failedSelected.size) return;
  const archiveIds = Array.from(failedSelected);
  const res = await api('/api/failed-archives/untrack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archiveIds }),
  });
  reportFailedAction(res.results, 'Removed from index');
  const remaining = await api('/api/failed-archives');
  failedSelected.clear();
  renderFailedList(remaining);
});

el('failedDeleteBtn').addEventListener('click', async () => {
  if (!failedSelected.size) return;
  const confirmed = window.confirm(
    `Permanently delete ${failedSelected.size} file(s) from disk? This cannot be undone.`
  );
  if (!confirmed) return;
  const archiveIds = Array.from(failedSelected);
  const res = await api('/api/failed-archives/delete-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archiveIds }),
  });
  reportFailedAction(res.results, 'Deleted from disk');
  const remaining = await api('/api/failed-archives');
  failedSelected.clear();
  renderFailedList(remaining);
});

function reportFailedAction(results, okLabel) {
  const resultsEl = el('failedResults');
  resultsEl.innerHTML = results.map((r) =>
    r.ok
      ? `<div class="ok">&check; ${okLabel} (archive #${r.archiveId})</div>`
      : `<div class="fail">&cross; #${r.archiveId}: ${escapeHtml(r.error)}</div>`
  ).join('');
}

(async function init() {
  await loadConfig();
  await loadStats();
})();
