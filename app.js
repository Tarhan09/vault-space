/**
 * app.js — VaultSpace core application logic
 * Supabase entegrasyonu ile dosya paylaşımı eklendi
 */
'use strict';

/* ============================================================
   SUPABASE CONFIG
   ============================================================ */
const SUPABASE_URL = 'https://kcmatuufohyhkrwexfyq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtjbWF0dXVmb2hoeWtyd2V4ZnlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDY2NTEsImV4cCI6MjA4OTEyMjY1MX0.tJnLIeA44-1cJT1ZNHzjdpk9KzyoJ9ucIShfD_6O8Rk';
const BUCKET = 'files';

async function supabaseUpload(file) {
  const path = `shared/${Date.now()}_${file.name}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error('Yükleme başarısız');
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function supabaseListFiles() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}/shared`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(f => ({
    id: f.id || f.name,
    name: f.name.replace(/^\d+_/, ''),
    fullPath: `shared/${f.name}`,
    size: f.metadata?.size || 0,
    created: f.created_at || new Date().toISOString(),
    url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/shared/${f.name}`,
    mime: f.metadata?.mimetype || '',
  }));
}

async function supabaseDeleteFile(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [path] }),
  });
  return res.ok;
}

/* ============================================================
   STATE
   ============================================================ */
const STATE = {
  fs: null,
  currentPath: [],
  selectedId: null,
  viewMode: 'grid',
  sortBy: 'name',
  ctxTarget: null,
  renameTarget: null,
  driveMode: 'local', // 'local' | 'network'
  networkFiles: [],
  networkLoading: false,
};

/* ============================================================
   UTILS
   ============================================================ */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function fmtSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function ext(name) {
  const p = name.lastIndexOf('.');
  return p > 0 ? name.slice(p + 1).toLowerCase() : '';
}

function mimeToCategory(mime = '', name = '') {
  const e = ext(name);
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','svg','webp','bmp','ico'].includes(e)) return 'image';
  if (mime.startsWith('video/') || ['mp4','webm','ogg','mov','avi'].includes(e)) return 'video';
  if (mime.startsWith('audio/') || ['mp3','wav','flac','aac','opus'].includes(e)) return 'audio';
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf';
  if (['txt','md','json','js','ts','css','html','xml','yaml','yml','csv','py','c','cpp','h','java','sh'].includes(e)) return 'text';
  if (['zip','rar','7z','tar','gz','bz2'].includes(e)) return 'archive';
  if (['doc','docx','xls','xlsx','ppt','pptx'].includes(e)) return 'office';
  return 'unknown';
}

const ICONS = {
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  image:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  video:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  audio:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  pdf:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="7" y1="13" x2="17" y2="13"/></svg>`,
  text:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  archive:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/></svg>`,
  office: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  unknown:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
};

function nodeIcon(node) {
  if (node.type === 'folder') return ICONS.folder;
  return ICONS[mimeToCategory(node.mime || '', node.name)] || ICONS.unknown;
}

/* ============================================================
   PERSISTENCE (LOCAL)
   ============================================================ */
const LS_KEY = 'vaultspace_fs_v2';

function loadFS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return { id: 'root', name: 'Ana Dizin', type: 'folder', children: [], created: new Date().toISOString(), modified: new Date().toISOString() };
}

function saveFS() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(STATE.fs)); }
  catch (e) {
    if (e.name === 'QuotaExceededError') showToast('Depolama doldu — eski dosyaları silmeyi deneyin.', 'error');
  }
}

/* ============================================================
   FS HELPERS
   ============================================================ */
function getNodeByPath(path) {
  let node = STATE.fs;
  for (const id of path.slice(1)) {
    node = (node.children || []).find(c => c.id === id);
    if (!node) return null;
  }
  return node;
}

function getCurrentFolder() { return getNodeByPath(STATE.currentPath); }

function findNodeById(id, root = STATE.fs) {
  if (root.id === id) return [root, null];
  for (const child of (root.children || [])) {
    if (child.id === id) return [child, root];
    const res = findNodeById(id, child);
    if (res[0]) return res;
  }
  return [null, null];
}

function removeNodeById(id, root = STATE.fs) {
  const children = root.children || [];
  const idx = children.findIndex(c => c.id === id);
  if (idx !== -1) { children.splice(idx, 1); return true; }
  for (const child of children) {
    if (removeNodeById(id, child)) return true;
  }
  return false;
}

function calcFolderSize(node) {
  if (node.type === 'file') return node.size || 0;
  return (node.children || []).reduce((acc, c) => acc + calcFolderSize(c), 0);
}

function calcTotalSize(root = STATE.fs) { return calcFolderSize(root); }

function flatFiles(node) {
  if (node.type === 'file') return [node];
  return (node.children || []).flatMap(flatFiles);
}

/* ============================================================
   DRIVE MODE TOGGLE
   ============================================================ */
document.querySelectorAll('.dt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === STATE.driveMode) return;
    STATE.driveMode = mode;
    document.querySelectorAll('.dt-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));

    if (mode === 'network') {
      document.getElementById('networkView').style.display = 'flex';
      document.getElementById('mainContent').style.display = 'none';
      loadNetworkFiles();
    } else {
      document.getElementById('networkView').style.display = 'none';
      document.getElementById('mainContent').style.display = 'flex';
    }
  });
});

/* ============================================================
   NETWORK VIEW
   ============================================================ */
async function loadNetworkFiles() {
  const container = document.getElementById('networkFileList');
  const emptyEl   = document.getElementById('networkEmpty');
  const loadingEl = document.getElementById('networkLoading');

  loadingEl.style.display = 'flex';
  container.innerHTML = '';
  emptyEl.style.display = 'none';

  try {
    STATE.networkFiles = await supabaseListFiles();
  } catch (e) {
    showToast('Ağ dosyaları yüklenemedi', 'error');
    STATE.networkFiles = [];
  }

  loadingEl.style.display = 'none';

  if (STATE.networkFiles.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }

  STATE.networkFiles.forEach(file => {
    const card = document.createElement('div');
    card.className = 'network-file-card';
    card.innerHTML = `
      <div class="network-file-icon">${ICONS[mimeToCategory(file.mime, file.name)] || ICONS.unknown}</div>
      <div class="network-file-info">
        <div class="network-file-name">${escHtml(file.name)}</div>
        <div class="network-file-meta">${fmtSize(file.size)} · ${fmtDate(file.created)}</div>
      </div>
      <div class="network-file-actions">
        <button class="btn btn-secondary btn-sm" title="Paylaşım linkini kopyala" onclick="copyShareLink('${file.url}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Link
        </button>
        <a class="btn btn-secondary btn-sm" href="${file.url}" download="${escHtml(file.name)}" target="_blank">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
          İndir
        </a>
        <button class="btn btn-ghost btn-danger btn-sm" title="Sil" onclick="deleteNetworkFile('${file.fullPath}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>`;
    container.appendChild(card);
  });
}

function copyShareLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link kopyalandı! Herkesle paylaşabilirsin.', 'success');
  }).catch(() => {
    prompt('Bu linki kopyala:', url);
  });
}

window.copyShareLink = copyShareLink;

async function deleteNetworkFile(path) {
  const ok = await supabaseDeleteFile(path);
  if (ok) {
    showToast('Dosya silindi', 'success');
    loadNetworkFiles();
  } else {
    showToast('Silinemedi', 'error');
  }
}
window.deleteNetworkFile = deleteNetworkFile;

// Network upload butonu
document.getElementById('networkUploadBtn').addEventListener('click', () => {
  document.getElementById('networkFileInput').click();
});

document.getElementById('networkFileInput').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length) return;

  showToast(`${files.length} dosya yükleniyor…`, 'success');

  for (const file of files) {
    try {
      await supabaseUpload(file);
      showToast(`"${file.name}" ağa yüklendi ✓`, 'success');
    } catch {
      showToast(`"${file.name}" yüklenemedi`, 'error');
    }
  }
  loadNetworkFiles();
});

/* ============================================================
   STORAGE INDICATOR
   ============================================================ */
const MAX_STORAGE = 50 * 1024 * 1024;

function updateStorageBar() {
  const used = calcTotalSize();
  const pct  = Math.min((used / MAX_STORAGE) * 100, 100);
  document.getElementById('storageFill').style.width = pct + '%';
  document.getElementById('storageText').textContent = `${fmtSize(used)} / ${fmtSize(MAX_STORAGE)}`;
}

/* ============================================================
   TREE (SIDEBAR)
   ============================================================ */
function renderTree() {
  const container = document.getElementById('treeContainer');
  container.innerHTML = '';
  renderTreeNode(STATE.fs, container, [STATE.fs.id]);
}

function renderTreeNode(node, container, path) {
  if (node.type !== 'folder') return;
  const item = document.createElement('div');
  item.className = 'tree-item' + (pathsEqual(path, STATE.currentPath) ? ' active' : '');
  item.innerHTML = `
    <svg class="tree-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    ${ICONS.folder}
    <span>${escHtml(node.name)}</span>`;
  container.appendChild(item);

  const childrenEl = document.createElement('div');
  childrenEl.className = 'tree-children';
  container.appendChild(childrenEl);

  const subFolders = (node.children || []).filter(c => c.type === 'folder');
  subFolders.forEach(child => renderTreeNode(child, childrenEl, [...path, child.id]));

  if (subFolders.length > 0) {
    const isOpen = STATE.currentPath.some((id, i) => path[i] === id && path.length < STATE.currentPath.length + 1);
    if (isOpen) { childrenEl.classList.add('open'); item.classList.add('open'); }
  }

  item.addEventListener('click', () => {
    STATE.currentPath = path;
    STATE.selectedId = null;
    renderTree(); renderBreadcrumb(); renderFiles(); clearDetailPanel();
  });
}

function pathsEqual(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

/* ============================================================
   BREADCRUMB
   ============================================================ */
function renderBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  bc.innerHTML = '';
  STATE.currentPath.forEach((id, idx) => {
    const node = idx === 0 ? STATE.fs : getNodeByPath(STATE.currentPath.slice(0, idx + 1));
    if (!node) return;
    if (idx > 0) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep'; sep.textContent = '/';
      bc.appendChild(sep);
    }
    const item = document.createElement('span');
    item.className = 'bc-item' + (idx === STATE.currentPath.length - 1 ? ' active' : '');
    item.textContent = node.name;
    const snapPath = [...STATE.currentPath.slice(0, idx + 1)];
    item.addEventListener('click', () => {
      if (idx < STATE.currentPath.length - 1) {
        STATE.currentPath = snapPath;
        STATE.selectedId = null;
        renderTree(); renderBreadcrumb(); renderFiles(); clearDetailPanel();
      }
    });
    bc.appendChild(item);
  });
}

/* ============================================================
   FILE GRID / LIST
   ============================================================ */
function sortNodes(nodes) {
  const folders = nodes.filter(n => n.type === 'folder');
  const files   = nodes.filter(n => n.type !== 'folder');
  const cmp = STATE.sortBy === 'date' ? (a, b) => new Date(b.modified) - new Date(a.modified)
            : STATE.sortBy === 'size' ? (a, b) => (b.size || calcFolderSize(b)) - (a.size || calcFolderSize(a))
            : STATE.sortBy === 'type' ? (a, b) => ext(a.name).localeCompare(ext(b.name))
            : (a, b) => a.name.localeCompare(b.name, 'tr');
  folders.sort(cmp); files.sort(cmp);
  return [...folders, ...files];
}

function renderFiles(searchTerm = '') {
  const grid    = document.getElementById('fileGrid');
  const emptyEl = document.getElementById('emptyState');
  const folder  = getCurrentFolder();
  if (!folder) return;

  let nodes = sortNodes(folder.children || []);
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    nodes = flatFiles(STATE.fs).filter(n => n.name.toLowerCase().includes(q));
  }

  grid.innerHTML = '';
  grid.className = 'file-grid' + (STATE.viewMode === 'list' ? ' list-view' : '');

  if (nodes.length === 0) { emptyEl.style.display = 'flex'; return; }
  emptyEl.style.display = 'none';

  nodes.forEach(node => {
    if (STATE.viewMode === 'grid') grid.appendChild(buildCard(node));
    else grid.appendChild(buildRow(node));
  });
}

function buildCard(node) {
  const el = document.createElement('div');
  el.className = 'file-card' + (node.id === STATE.selectedId ? ' selected' : '');
  el.dataset.id = node.id;
  const meta = node.type === 'folder' ? `${(node.children || []).length} öğe` : fmtSize(node.size || 0);
  el.innerHTML = `
    <div class="file-card-icon">${nodeIcon(node)}</div>
    <div class="file-card-name">${escHtml(node.name)}</div>
    <div class="file-card-meta">${meta}</div>`;
  el.addEventListener('click', e => onItemClick(e, node));
  el.addEventListener('dblclick', () => onItemDblClick(node));
  el.addEventListener('contextmenu', e => onItemCtx(e, node));
  return el;
}

function buildRow(node) {
  const el = document.createElement('div');
  el.className = 'file-row' + (node.id === STATE.selectedId ? ' selected' : '');
  el.dataset.id = node.id;
  const cat = node.type === 'folder' ? 'Klasör' : (ext(node.name).toUpperCase() || 'Dosya');
  el.innerHTML = `
    <div class="file-row-icon">${nodeIcon(node)}</div>
    <div class="file-row-name">${escHtml(node.name)}</div>
    <div class="file-row-type">${cat}</div>
    <div class="file-row-size">${node.type === 'file' ? fmtSize(node.size || 0) : ''}</div>
    <div class="file-row-date">${fmtDate(node.modified)}</div>`;
  el.addEventListener('click', e => onItemClick(e, node));
  el.addEventListener('dblclick', () => onItemDblClick(node));
  el.addEventListener('contextmenu', e => onItemCtx(e, node));
  return el;
}

function onItemClick(e, node) {
  e.stopPropagation();
  STATE.selectedId = node.id;
  document.querySelectorAll('.file-card, .file-row').forEach(el => el.classList.remove('selected'));
  e.currentTarget.classList.add('selected');
  showDetailPanel(node);
}

function onItemDblClick(node) {
  if (node.type === 'folder') {
    STATE.currentPath = [...STATE.currentPath, node.id];
    STATE.selectedId = null;
    renderTree(); renderBreadcrumb(); renderFiles(); clearDetailPanel();
  } else {
    openPreview(node);
  }
}

function onItemCtx(e, node) {
  e.preventDefault(); e.stopPropagation();
  STATE.ctxTarget = node;
  STATE.selectedId = node.id;
  document.querySelectorAll('.file-card, .file-row').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`[data-id="${node.id}"]`);
  if (el) el.classList.add('selected');
  showContextMenu(e.clientX, e.clientY, node);
}

document.getElementById('fileGrid').addEventListener('click', () => {
  STATE.selectedId = null;
  document.querySelectorAll('.file-card, .file-row').forEach(el => el.classList.remove('selected'));
  clearDetailPanel();
});

/* ============================================================
   DETAIL PANEL
   ============================================================ */
function showDetailPanel(node) {
  const body    = document.getElementById('detailBody');
  const actions = document.getElementById('detailActions');
  const pushBtn = document.getElementById('pushToNetworkBtn');
  actions.style.display = 'flex';
  pushBtn.style.display = node.type === 'file' ? 'block' : 'none';

  const isImg   = mimeToCategory(node.mime, node.name) === 'image';
  const isVideo = mimeToCategory(node.mime, node.name) === 'video';
  const isAudio = mimeToCategory(node.mime, node.name) === 'audio';

  let previewHtml = '';
  if (node.dataUrl) {
    if (isImg)        previewHtml = `<div class="detail-preview"><img src="${node.dataUrl}" alt="${escHtml(node.name)}" /></div>`;
    else if (isVideo) previewHtml = `<div class="detail-preview"><video src="${node.dataUrl}" controls></video></div>`;
    else if (isAudio) previewHtml = `<div class="detail-preview"><audio src="${node.dataUrl}" controls style="width:100%;padding:8px 0"></audio></div>`;
  }

  const size  = node.type === 'folder' ? fmtSize(calcFolderSize(node)) : fmtSize(node.size || 0);
  const items = node.type === 'folder' ? `${(node.children || []).length} öğe` : '—';

  body.innerHTML = `
    ${previewHtml}
    <div class="detail-filename">${escHtml(node.name)}</div>
    <div class="detail-info-row"><span class="detail-info-label">Tür</span><span class="detail-info-value">${node.type === 'folder' ? 'Klasör' : (node.mime || ext(node.name) || 'Bilinmiyor')}</span></div>
    <div class="detail-info-row"><span class="detail-info-label">Boyut</span><span class="detail-info-value">${size}</span></div>
    ${node.type === 'folder' ? `<div class="detail-info-row"><span class="detail-info-label">İçerik</span><span class="detail-info-value">${items}</span></div>` : ''}
    <div class="detail-info-row"><span class="detail-info-label">Oluşturulma</span><span class="detail-info-value">${fmtDate(node.created)} ${fmtTime(node.created)}</span></div>
    <div class="detail-info-row"><span class="detail-info-label">Değiştirilme</span><span class="detail-info-value">${fmtDate(node.modified)} ${fmtTime(node.modified)}</span></div>`;
}

function clearDetailPanel() {
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      <p>Bir dosya veya klasör seçin</p>
    </div>`;
  document.getElementById('detailActions').style.display = 'none';
}

document.getElementById('closeDetail').addEventListener('click', () => {
  document.getElementById('detailPanel').classList.toggle('collapsed');
});

/* ============================================================
   PUSH TO NETWORK (Yerel → Supabase)
   ============================================================ */
document.getElementById('pushToNetworkBtn').addEventListener('click', async () => {
  const [node] = findNodeById(STATE.selectedId);
  if (!node || node.type !== 'file' || !node.dataUrl) {
    showToast('Gönderilebilir dosya yok', 'error');
    return;
  }

  showToast(`"${node.name}" ağa gönderiliyor…`, 'success');

  try {
    // dataUrl → Blob → File
    const res  = await fetch(node.dataUrl);
    const blob = await res.blob();
    const file = new File([blob], node.name, { type: node.mime || blob.type });
    const url  = await supabaseUpload(file);
    showToast(`"${node.name}" ağa gönderildi! Link kopyalandı.`, 'success');
    navigator.clipboard.writeText(url).catch(() => {});
  } catch (e) {
    showToast('Gönderilemedi: ' + e.message, 'error');
  }
});

/* ============================================================
   UPLOAD (LOCAL)
   ============================================================ */
document.getElementById('uploadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', e => {
  handleFiles(Array.from(e.target.files));
  e.target.value = '';
});

function handleFiles(files) {
  if (!files.length) return;
  const panel = document.getElementById('uploadProgress');
  const list  = document.getElementById('upList');
  panel.style.display = 'block';

  files.forEach(file => {
    const id   = uuid();
    const item = document.createElement('div');
    item.className = 'up-item';
    item.innerHTML = `
      <div class="up-item-name">${escHtml(file.name)}</div>
      <div class="up-bar"><div class="up-bar-fill" id="bar-${id}" style="width:0%"></div></div>
      <div class="up-item-status" id="stat-${id}">Hazırlanıyor…</div>`;
    list.appendChild(item);
    readFile(file, id);
  });
}

function readFile(file, id) {
  return new Promise(resolve => {
    const reader = new FileReader();
    const bar    = document.getElementById(`bar-${id}`);
    const stat   = document.getElementById(`stat-${id}`);

    reader.onprogress = e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        if (bar) bar.style.width = pct + '%';
        if (stat) stat.textContent = pct + '%';
      }
    };

    reader.onload = e => {
      if (bar) bar.style.width = '100%';
      if (stat) stat.textContent = 'Tamamlandı';
      const folder = getCurrentFolder();
      const node = {
        id: uuid(), name: file.name, type: 'file',
        mime: file.type || '', size: file.size,
        dataUrl: e.target.result,
        created: new Date().toISOString(), modified: new Date().toISOString(),
      };
      folder.children = folder.children || [];
      folder.children.push(node);
      saveFS(); renderTree(); renderBreadcrumb(); renderFiles(); updateStorageBar();
      showToast(`"${file.name}" yüklendi`, 'success');
      resolve();
    };

    reader.onerror = () => {
      if (stat) stat.textContent = 'Hata!';
      showToast(`"${file.name}" yüklenemedi`, 'error');
      resolve();
    };

    reader.readAsDataURL(file);
  });
}

document.getElementById('closeUploadProgress').addEventListener('click', () => {
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('upList').innerHTML = '';
});

/* ============================================================
   DRAG & DROP
   ============================================================ */
const mainContent = document.getElementById('mainContent');
const dropOverlay = document.getElementById('dropOverlay');
let dragCounter = 0;

mainContent.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; dropOverlay.classList.add('active'); });
mainContent.addEventListener('dragleave', () => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.remove('active'); } });
mainContent.addEventListener('dragover', e => { e.preventDefault(); });
mainContent.addEventListener('drop', e => {
  e.preventDefault(); dragCounter = 0; dropOverlay.classList.remove('active');
  handleFiles(Array.from(e.dataTransfer.files));
});

/* ============================================================
   NEW FOLDER
   ============================================================ */
function openFolderModal() {
  document.getElementById('folderName').value = '';
  document.getElementById('folderModal').classList.add('open');
  setTimeout(() => document.getElementById('folderName').focus(), 50);
}
function closeFolderModal() { document.getElementById('folderModal').classList.remove('open'); }

['newFolderBtn', 'newFolderBtnMain'].forEach(id => {
  document.getElementById(id).addEventListener('click', openFolderModal);
});
document.getElementById('closeFolderModal').addEventListener('click', closeFolderModal);
document.getElementById('cancelFolder').addEventListener('click', closeFolderModal);
document.getElementById('folderModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeFolderModal(); });
document.getElementById('folderName').addEventListener('keydown', e => { if (e.key === 'Enter') confirmCreateFolder(); });
document.getElementById('confirmFolder').addEventListener('click', confirmCreateFolder);

function confirmCreateFolder() {
  const name = document.getElementById('folderName').value.trim();
  if (!name) { showToast('Klasör adı boş olamaz', 'error'); return; }
  const folder = getCurrentFolder();
  if ((folder.children || []).some(c => c.name === name && c.type === 'folder')) {
    showToast('Bu isimde bir klasör zaten var', 'error'); return;
  }
  const node = { id: uuid(), name, type: 'folder', children: [], created: new Date().toISOString(), modified: new Date().toISOString() };
  folder.children = folder.children || [];
  folder.children.push(node);
  saveFS(); renderTree(); renderFiles(); updateStorageBar();
  closeFolderModal();
  showToast(`"${name}" oluşturuldu`, 'success');
}

/* ============================================================
   CONTEXT MENU
   ============================================================ */
const ctxMenu = document.getElementById('contextMenu');

function showContextMenu(x, y, node) {
  ctxMenu.classList.add('open');
  const { innerWidth: W, innerHeight: H } = window;
  const mw = ctxMenu.offsetWidth || 160, mh = ctxMenu.offsetHeight || 150;
  ctxMenu.style.left = (x + mw > W ? x - mw : x) + 'px';
  ctxMenu.style.top  = (y + mh > H ? y - mh : y) + 'px';
  document.getElementById('ctxDownload').style.display = node.type === 'file' ? 'block' : 'none';
  document.getElementById('ctxPushNetwork').style.display = node.type === 'file' ? 'block' : 'none';
}

function hideContextMenu() { ctxMenu.classList.remove('open'); }
document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', hideContextMenu);

document.getElementById('ctxOpen').addEventListener('click', () => { if (STATE.ctxTarget) onItemDblClick(STATE.ctxTarget); });
document.getElementById('ctxRename').addEventListener('click', () => { if (STATE.ctxTarget) openRenameModal(STATE.ctxTarget); });
document.getElementById('ctxDownload').addEventListener('click', () => { if (STATE.ctxTarget) downloadNode(STATE.ctxTarget); });
document.getElementById('ctxDelete').addEventListener('click', () => { if (STATE.ctxTarget) deleteNode(STATE.ctxTarget.id); });
document.getElementById('ctxPushNetwork').addEventListener('click', () => {
  if (STATE.ctxTarget) {
    STATE.selectedId = STATE.ctxTarget.id;
    document.getElementById('pushToNetworkBtn').click();
  }
});

/* ============================================================
   RENAME
   ============================================================ */
function openRenameModal(node) {
  STATE.renameTarget = node;
  document.getElementById('renameName').value = node.name;
  document.getElementById('renameModal').classList.add('open');
  setTimeout(() => document.getElementById('renameName').select(), 50);
}
function closeRenameModal() { document.getElementById('renameModal').classList.remove('open'); STATE.renameTarget = null; }

document.getElementById('closeRenameModal').addEventListener('click', closeRenameModal);
document.getElementById('cancelRename').addEventListener('click', closeRenameModal);
document.getElementById('renameModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeRenameModal(); });
document.getElementById('renameName').addEventListener('keydown', e => { if (e.key === 'Enter') confirmRename(); });
document.getElementById('confirmRename').addEventListener('click', confirmRename);

function confirmRename() {
  const name = document.getElementById('renameName').value.trim();
  if (!name || !STATE.renameTarget) return;
  STATE.renameTarget.name = name;
  STATE.renameTarget.modified = new Date().toISOString();
  saveFS(); renderTree(); renderFiles();
  if (STATE.selectedId === STATE.renameTarget.id) showDetailPanel(STATE.renameTarget);
  closeRenameModal();
  showToast('Yeniden adlandırıldı', 'success');
}

/* ============================================================
   DELETE
   ============================================================ */
function deleteNode(id) {
  const [node] = findNodeById(id);
  removeNodeById(id);
  saveFS(); renderTree(); renderFiles(); updateStorageBar(); clearDetailPanel();
  showToast(`"${node ? node.name : 'Öğe'}" silindi`, 'success');
  STATE.selectedId = null;
}

document.getElementById('deleteBtn').addEventListener('click', () => {
  if (STATE.selectedId) deleteNode(STATE.selectedId);
});

/* ============================================================
   DOWNLOAD
   ============================================================ */
function downloadNode(node) {
  if (!node.dataUrl) { showToast('İndirilebilir veri yok', 'error'); return; }
  const a = document.createElement('a');
  a.href = node.dataUrl; a.download = node.name; a.click();
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  const [node] = findNodeById(STATE.selectedId);
  if (node) downloadNode(node);
});

/* ============================================================
   PREVIEW MODAL
   ============================================================ */
function openPreview(node) {
  if (node.type === 'folder') return;
  document.getElementById('previewTitle').textContent = node.name;
  const body = document.getElementById('previewBody');
  body.innerHTML = '';
  const cat = mimeToCategory(node.mime, node.name);

  if (!node.dataUrl) {
    body.innerHTML = `<div class="preview-nopreview">Önizleme için veri yok.</div>`;
  } else if (cat === 'image') {
    body.innerHTML = `<img src="${node.dataUrl}" alt="${escHtml(node.name)}" />`;
  } else if (cat === 'video') {
    body.innerHTML = `<video src="${node.dataUrl}" controls autoplay></video>`;
  } else if (cat === 'audio') {
    body.innerHTML = `<audio src="${node.dataUrl}" controls autoplay></audio>`;
  } else if (cat === 'text') {
    const pre = document.createElement('pre');
    try {
      const raw = atob(node.dataUrl.split(',')[1]);
      const decoder = new TextDecoder('utf-8');
      const bytes = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      pre.textContent = decoder.decode(bytes);
    } catch { pre.textContent = '(Metin okunamadı)'; }
    body.appendChild(pre);
  } else {
    body.innerHTML = `<div class="preview-nopreview">Bu dosya türü için önizleme desteklenmiyor.</div>`;
  }
  document.getElementById('previewModal').classList.add('open');
}

document.getElementById('closePreview').addEventListener('click', () => {
  document.getElementById('previewModal').classList.remove('open');
  document.getElementById('previewBody').innerHTML = '';
});
document.getElementById('previewModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    document.getElementById('previewModal').classList.remove('open');
    document.getElementById('previewBody').innerHTML = '';
  }
});

/* ============================================================
   SIDEBAR TOGGLE
   ============================================================ */
document.getElementById('sidebarToggle').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
  }
});
document.getElementById('sidebarBackdrop').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('active');
});

/* ============================================================
   VIEW MODE & SORT
   ============================================================ */
document.getElementById('viewGrid').addEventListener('click', () => {
  STATE.viewMode = 'grid';
  document.getElementById('viewGrid').classList.add('active');
  document.getElementById('viewList').classList.remove('active');
  renderFiles();
});
document.getElementById('viewList').addEventListener('click', () => {
  STATE.viewMode = 'list';
  document.getElementById('viewList').classList.add('active');
  document.getElementById('viewGrid').classList.remove('active');
  renderFiles();
});
document.getElementById('sortSelect').addEventListener('change', e => {
  STATE.sortBy = e.target.value; renderFiles();
});

/* ============================================================
   SEARCH
   ============================================================ */
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', e => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => renderFiles(e.target.value.trim()), 200);
});

/* ============================================================
   THEME TOGGLE
   ============================================================ */
document.getElementById('themeToggle').addEventListener('click', () => {
  showToast('Tema özelliği yakında eklenecek!', 'success');
});

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(16px)';
    toast.style.transition = 'all .3s';
    setTimeout(() => toast.remove(), 320);
  }, 3000);
}

/* ============================================================
   ESCAPE HTML
   ============================================================ */
function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    hideContextMenu();
    document.getElementById('folderModal').classList.remove('open');
    document.getElementById('previewModal').classList.remove('open');
    document.getElementById('renameModal').classList.remove('open');
    document.getElementById('previewBody').innerHTML = '';
  }
  if (e.key === 'Delete' && STATE.selectedId && document.activeElement.tagName !== 'INPUT') {
    deleteNode(STATE.selectedId);
  }
  if (e.key === 'F2' && STATE.selectedId) {
    const [node] = findNodeById(STATE.selectedId);
    if (node) openRenameModal(node);
  }
});

/* ============================================================
   INIT
   ============================================================ */
function init() {
  STATE.fs = loadFS();
  STATE.currentPath = [STATE.fs.id];
  renderTree(); renderBreadcrumb(); renderFiles(); updateStorageBar();
}

document.addEventListener('DOMContentLoaded', init);
