'use strict';
/* Lin Files 前端 — Obsidian 风格文件管理器 */

/* ================= 基础工具 ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ext = n => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i + 1).toLowerCase(); };
const base = n => { const p = String(n).replace(/\\/g, '/').split('/'); return p[p.length - 1] || p[p.length - 2] || n; };
const dirOf = n => { const p = String(n).replace(/\\/g, '/').split('/'); p.pop(); return p.join('/'); };
const encodeRel = rel => String(rel).split('/').map(encodeURIComponent).join('/');
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp']);
const BIN_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'zip', 'thm', '7z', 'rar', 'gz',
  'exe', 'dll', 'pdf', 'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'woff', 'woff2',
  'ttf', 'otf', 'eot', 'db', 'sqlite', 'bin', 'dat', 'class', 'jar', 'psd', 'ai', 'sketch', 'wmv', 'webm']);
const TEXT_IN_ZIP = new Set(['json', 'md', 'txt', 'js', 'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'csv',
  'log', 'ini', 'cfg', 'conf', 'py', 'bat', 'ps1', 'sh', 'theme', 'svg']);

function fi(paths, cls) {
  return '<svg class="fi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
}
const FI_DIR = fi('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>', 'fi-amber');
const FI_VAULT = fi('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>', 'fi-amber');
const FI_FILE = fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>');
const FI_MD = fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M9 12v5l3-3 3 3v-5"/>');
const FI_HTML = fi('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>');
const FI_IMG = fi('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="M4 17l5-5 3 3 4-4 4 4"/>');
const FI_ZIP = fi('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v3M12 8v2M12 12v2"/><rect x="10.5" y="16.5" width="3" height="2.5" rx="0.5"/>');
const FI_PDF = fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>');
const FI_CODE = fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M10 12l-2 2.5L10 17M14 12l2 2.5L14 17"/>');
const FI_JSON = fi('<path d="M8 3H7a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-1"/>');
const FI_CSS = fi('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>');
const FI_AUD = fi('<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>');
const FI_VID = fi('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l6 3-6 3Z"/>');
const FI_LNK = fi('<path d="M10 14a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>');
const FI_JSONL = fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/>');
const FI_EXE = fi('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>');
const FI_SH = fi('<path d="M13 2L4.5 13.5H11L9.5 22L19.5 9.5H13L13 2Z"/>');
const FI_WARN = fi('<path d="M12 3L2 20h20L12 3Z"/><path d="M12 10v4M12 17v0.5"/>', 'fi-warn');
/* ---------- 动作图标集（按钮/菜单用） ---------- */
const IG = {
  filePlus: fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>'),
  folderPlus: fi('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 11v5M9.5 13.5h5"/>'),
  pencil: fi('<path d="M4 20l1-4L17 4l3 3L8 19l-4 1Z"/><path d="M14 7l3 3"/>'),
  external: fi('<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M10 14L20 4"/><path d="M15 4h5v5"/>'),
  door: fi('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  trash: fi('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>'),
  refresh: fi('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/>'),
  clipboard: fi('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5a3 3 0 0 1 6 0"/><path d="M9 11h6M9 15h4"/>'),
  paperclip: fi('<path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 6"/>'),
  monitor: fi('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  box: fi('<path d="M3 8l9-5 9 5v8l-9 5-9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
  pin: fi('<path d="M9 3h6l1 8 2 2H6l2-2 1-8Z"/><path d="M12 13v8"/>'),
  x: fi('<path d="M6 6l12 12M18 6L6 18"/>'),
  xCircle: fi('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  clock: fi('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  book: fi('<path d="M12 6a4 4 0 0 0-4-3H3v16h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6V3h-5a4 4 0 0 0-4 3Z"/><path d="M12 6v16"/>'),
  code: fi('<path d="M8 8l-4 4 4 4"/><path d="M16 8l4 4-4 4"/>'),
  save: fi('<path d="M5 3h11l5 5v13a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v5h8V3"/><path d="M7 21v-8h10v8"/>'),
  eye: fi('<path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/>'),
  pro: fi('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>'),
  globe: fi('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>'),
  list: fi('<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  grid: fi('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  camera: fi('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l2-3h4l2 3"/><circle cx="12" cy="13" r="3.5"/>'),
  palette: fi('<path d="M12 3a9 9 0 1 0 .5 18c1.4 0 2.1-.9 1.6-2-.6-1.3.3-2.5 1.7-2.5H18a3 3 0 0 0 3-3c0-5.2-4.3-10.5-9-10.5Z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>'),
  image: fi('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="M4 17l5-5 3 3 4-4 4 4"/>'),
  imageOff: fi('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M3 3l18 18"/>'),
  search: fi('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'),
  bulb: fi('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.3-1.1 2.2h-5c0-.9-.4-1.6-1.1-2.2A6 6 0 0 1 12 3Z"/>'),
  rocket: fi('<path d="M5 15c-1.5 3.5-1 5-1 5s1.5.5 5-1"/><path d="M14 4c3.5-2 7-2 7-2s0 3.5-2 7l-5.5 8.5L9 15l-2.5-4.5L14 4Z"/><circle cx="15" cy="9" r="1.5"/>'),
  up: fi('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
  back: fi('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>'),
  chat: fi('<path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1Z"/><path d="M8 9h8M8 12h5"/>'),
  raw: fi('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>'),
  check: fi('<path d="M4 12l5 5L20 7"/>'),
  target: fi('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'),
  card: fi('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="2"/><path d="M5.5 16c.6-1.7 1.7-2.5 3-2.5s2.4.8 3 2.5"/><path d="M14 9h5M14 13h5"/>'),
  archive: fi('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>'),
  file: fi('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>')
};
function iconFor(name, isDir) {
  if (isDir) return FI_DIR;
  const e = ext(name);
  if (e === 'md' || e === 'markdown') return FI_MD;
  if (e === 'html' || e === 'htm') return FI_HTML;
  if (IMG_EXT.has(e)) return FI_IMG;
  if (e === 'zip' || e === 'thm' || e === '7z' || e === 'rar') return FI_ZIP;
  if (e === 'pdf') return FI_PDF;
  if (e === 'js' || e === 'mjs') return FI_CODE;
  if (e === 'json') return FI_JSON;
  if (e === 'css') return FI_CSS;
  if (['mp3', 'wav', 'flac', 'ogg'].includes(e)) return FI_AUD;
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(e)) return FI_VID;
  if (e === 'lnk' || e === 'url') return FI_LNK;
  if (e === 'jsonl') return FI_JSONL;
  if (e === 'exe') return FI_EXE;
  if (['py', 'bat', 'ps1', 'sh', 'cmd'].includes(e)) return FI_SH;
  return FI_FILE;
}
function kindOf(name) {
  const e = ext(name);
  if (e === 'md' || e === 'markdown') return 'md';
  if (e === 'html' || e === 'htm') return 'html';
  if (IMG_EXT.has(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (e === 'jsonl') return 'jsonl';
  if (e === 'lnk' || e === 'url') return 'lnk';
  if (e === 'zip' || e === 'thm') return 'zip';
  if (BIN_EXT.has(e)) return 'bin';
  return 'code';
}
function fmtSize(b) {
  if (b == null) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}
function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ================= 状态 ================= */
const S = {
  vaults: [], vid: null,
  showHidden: false,
  expanded: new Set(),      // `${vid}:${rel}`
  children: new Map(),      // `${vid}:${rel}` -> entries
  flat: new Map(),          // vid -> [rel]
  tabs: [], activeId: null,
  treeSel: null,
};
let tabSeq = 1;
const curVault = () => S.vaults.find(v => v.id === S.vid) || null;
const activeTab = () => S.tabs.find(t => t.id === S.activeId) || null;
const vaultById = id => S.vaults.find(v => v.id === id);

/* ================= API ================= */
async function api(path, body) {
  const opt = body !== undefined
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(path, opt);
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error((data && data.error) || `请求失败 (${r.status})`);
  return data;
}

/* ================= Toast / 弹窗 / 菜单 ================= */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 2600);
}
function openModal(html) {
  const root = $('#modal-root');
  root.classList.remove('hidden');
  root.innerHTML = `<div class="modal">${html}</div>`;
  return root.querySelector('.modal');
}
function closeModal() { const root = $('#modal-root'); root.classList.add('hidden'); root.innerHTML = ''; }
$('#modal-root').addEventListener('mousedown', e => { if (e.target.id === 'modal-root') closeModal(); });

function modalPrompt({ title, value = '', placeholder = '', note = '', okText = '确定' }) {
  return new Promise(resolve => {
    const m = openModal(`<h3>${esc(title)}</h3>
      <div class="m-body"><input type="text" id="mp-in" placeholder="${esc(placeholder)}">${note ? `<div class="m-note">${note}</div>` : ''}</div>
      <div class="m-foot"><button class="m-btn" id="mp-cancel">取消</button><button class="m-btn primary" id="mp-ok">${esc(okText)}</button></div>`);
    const input = m.querySelector('#mp-in');
    input.value = value;
    input.focus();
    input.select();
    const done = v => { closeModal(); resolve(v); };
    m.querySelector('#mp-ok').onclick = () => done(input.value.trim());
    m.querySelector('#mp-cancel').onclick = () => done(null);
    input.onkeydown = e => {
      if (e.key === 'Enter') done(input.value.trim());
      if (e.key === 'Escape') done(null);
    };
  });
}
function modalConfirm({ title, html, okText = '删除' }) {
  return new Promise(resolve => {
    const m = openModal(`<h3>${esc(title)}</h3>
      <div class="m-body"><div class="m-note" style="margin-top:0">${html}</div></div>
      <div class="m-foot"><button class="m-btn" id="mc-cancel">取消</button><button class="m-btn danger" id="mc-ok">${esc(okText)}</button></div>`);
    const done = v => { closeModal(); resolve(v); };
    m.querySelector('#mc-ok').onclick = () => done(true);
    m.querySelector('#mc-cancel').onclick = () => done(false);
  });
}

/* 右键菜单 */
function showCtx(x, y, items) {
  const el = $('#ctxmenu');
  el.innerHTML = items.map(it => it === 'sep' ? '<div class="sep"></div>'
    : `<div class="mi ${it.danger ? 'danger' : ''}" data-i="${items.indexOf(it)}">${it.icon ? `<span>${it.icon}</span>` : ''}<span>${esc(it.label)}</span></div>`).join('');
  el.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  el.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  el.querySelectorAll('.mi').forEach(mi => mi.onclick = () => { hideCtx(); items[+mi.dataset.i].fn(); });
}
function hideCtx() { $('#ctxmenu').classList.add('hidden'); }
document.addEventListener('mousedown', e => { if (!e.target.closest('#ctxmenu')) hideCtx(); });
window.addEventListener('blur', hideCtx);
window.addEventListener('resize', hideCtx);

/* ================= 侧边栏：文件树 ================= */
const childrenKey = (vid, rel) => `${vid}:${rel}`;
async function ensureChildren(vid, rel) {
  const k = childrenKey(vid, rel);
  if (S.children.has(k)) return S.children.get(k);
  const data = await api(`/api/ls?vid=${vid}&rel=${encodeURIComponent(rel)}`);
  S.children.set(k, data.entries);
  return data.entries;
}
function invalidateVault(vid) {
  for (const k of [...S.children.keys()]) if (k.startsWith(vid + ':')) S.children.delete(k);
  S.flat.delete(vid);
}
async function renderTree() {
  const tree = $('#tree');
  const st = tree.scrollTop; // 保留滚动位置，重建不跳屏
  tree.innerHTML = '';
  const v = curVault();
  if (!v) {
    tree.innerHTML = `<div id="tree-empty">还没有管理的文件夹。<br><b id="add-first">＋ 添加第一个文件夹</b></div>`;
    $('#add-first').onclick = () => openVaultBrowser();
    return;
  }
  if (!S.expanded.has(childrenKey(v.id, ''))) S.expanded.add(childrenKey(v.id, ''));
  try {
    const frag = document.createDocumentFragment();
    await buildTreeRows(frag, v.id, '', 0, v.name, FI_VAULT);
    tree.appendChild(frag);
  } catch (e) { tree.innerHTML = `<div id="tree-empty">${esc(e.message)}</div>`; }
  tree.scrollTop = st;
}
async function buildTreeRows(frag, vid, rel, depth, name, icon) {
  const key = childrenKey(vid, rel);
  const isOpen = S.expanded.has(key);
  const row = document.createElement('div');
  row.className = 'tree-item' + (isOpen ? ' open' : '') + (S.treeSel === key ? ' sel' : '');
  row.style.paddingLeft = (6 + depth * 14) + 'px';
  row.draggable = true;
  row.dataset.vid = vid; row.dataset.rel = rel; row.dataset.dir = '1';
  row.innerHTML = `<span class="caret">▶</span><span class="ticon">${icon}</span><span class="tname">${esc(name)}</span>`;
  row.onclick = () => toggleDir(vid, rel);
  row.oncontextmenu = e => { e.preventDefault(); S.treeSel = key; renderTree(); rel === '' ? vaultCtx(e, vid, name) : dirCtx(e, vid, rel, name); };
  attachDrag(row, vid, rel);
  frag.appendChild(row);
  if (!isOpen) return;
  const entries = await ensureChildren(vid, rel);
  for (const ent of entries) {
    if (ent.dir) await buildTreeRows(frag, vid, rel ? rel + '/' + ent.name : ent.name, depth + 1, ent.name, FI_DIR);
    else {
      const childRel = rel ? rel + '/' + ent.name : ent.name;
      const ck = childrenKey(vid, childRel);
      const f = document.createElement('div');
      f.className = 'tree-item' + (S.treeSel === ck ? ' sel' : '');
      f.style.paddingLeft = (6 + (depth + 1) * 14) + 'px';
      f.draggable = true;
      f.dataset.vid = vid; f.dataset.rel = childRel; f.dataset.dir = '0';
      f.innerHTML = `<span class="caret"></span><span class="ticon">${iconFor(ent.name)}</span><span class="tname">${esc(ent.name)}</span>`;
      f.onclick = () => { S.treeSel = ck; markSel(); openFile(vid, childRel); };
      f.oncontextmenu = e => { e.preventDefault(); S.treeSel = ck; markSel(); fileCtx(e, vid, childRel); };
      attachDrag(f, vid, childRel);
      frag.appendChild(f);
    }
  }
}
function markSel() {
  document.querySelectorAll('#tree .tree-item').forEach(el => {
    el.classList.toggle('sel', el.dataset.vid + ':' + el.dataset.rel === S.treeSel);
  });
}
async function toggleDir(vid, rel) {
  const key = childrenKey(vid, rel);
  if (S.expanded.has(key)) S.expanded.delete(key);
  else { S.expanded.add(key); try { await ensureChildren(vid, rel); } catch {} }
  renderTree();
}
function attachDrag(row, vid, rel) {
  row.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/lin', JSON.stringify({ vid, rel }));
    e.dataTransfer.effectAllowed = 'move';
  });
  if (row.dataset.dir === '1') {
    row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drop'); });
    row.addEventListener('dragleave', () => row.classList.remove('drop'));
    row.addEventListener('drop', async e => {
      e.preventDefault(); e.stopPropagation(); row.classList.remove('drop');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        await saveDroppedFiles(e.dataTransfer.files, vid, rel);
        return;
      }
      let d; try { d = JSON.parse(e.dataTransfer.getData('text/lin')); } catch { return; }
      await doMove(d, rel);
    });
  }
}
$('#tree').addEventListener('dragover', e => e.preventDefault());
$('#tree').addEventListener('drop', async e => {
  if (e.target.closest('.tree-item')) return;
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length && S.vid) {
    await saveDroppedFiles(e.dataTransfer.files, S.vid, '');
    return;
  }
  let d; try { d = JSON.parse(e.dataTransfer.getData('text/lin')); } catch { return; }
  await doMove(d, '');
});
async function doMove(d, toDir) {
  if (!d || d.dir) { if (d && d.dir) toast('暂不支持移动文件夹里的全部内容——请拖动具体文件', ''); return; }
  if (d.vid !== S.vid) { toast('只能在同一个文件夹内拖动'); return; }
  if (dirOf(d.rel) === toDir) return;
  try {
    await api('/api/move', { vid: d.vid, from: d.rel, toDir });
    invalidateVault(d.vid);
    // 同步已打开的标签
    const name = base(d.rel);
    for (const t of S.tabs) {
      if (t.vid === d.vid && t.rel === d.rel) t.rel = toDir ? toDir + '/' + name : name;
    }
    renderTree(); renderTabs(); renderView();
  } catch (e) { toast(e.message, 'err'); }
}

/* 右键菜单内容 */
function vaultCtx(e, vid, name) {
  showCtx(e.clientX, e.clientY, [
    { icon: IG.filePlus, label: '新建笔记', fn: () => newFile(vid, '', true) },
    { icon: IG.filePlus, label: '新建文件', fn: () => newFile(vid, '', false) },
    { icon: IG.folderPlus, label: '新建文件夹', fn: () => newFolder(vid, '') },
    'sep',
    { icon: IG.pencil, label: '重命名显示名', fn: () => renameVault(vid, name) },
    { icon: IG.external, label: '在资源管理器中显示', fn: () => api('/api/openfile', { vid, rel: '', reveal: true }).catch(x => toast(x.message, 'err')) },
    'sep',
    { icon: IG.door, label: '从管理器移除（不删文件）', fn: () => removeVault(vid) },
  ]);
}
/* 文件夹快捷方式 → 把目标文件夹作为库直接打开（已添加则直接切换） */
async function openFolderShortcut(target) {
  try {
    let vault = null;
    try { vault = await api('/api/vaults', { action: 'add', path: target }); }
    catch (e) {
      const vs = await api('/api/vaults');
      const norm = s => String(s).replace(/\//g, '\\').replace(/[\\]+$/, '').toLowerCase();
      vault = vs.find(v => norm(v.path) === norm(target));
      if (!vault) throw e;
    }
    S.vid = vault.id;
    await loadVaults();
    renderTree(); renderView();
    toast('已在管理器中打开：' + vault.name, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function renameVault(vid, name) {
  const nn = await modalPrompt({ title: '重命名（只改管理器里显示的名字）', value: name });
  if (!nn || nn === name) return;
  try {
    await api('/api/vaults', { action: 'rename', id: vid, name: nn });
    await loadVaults(); renderTree();
  } catch (e) { toast(e.message, 'err'); }
}
async function removeVault(vid) {
  const v = vaultById(vid);
  const ok = await modalConfirm({
    title: '移除文件夹',
    html: `只把 <b style="color:var(--text)">${esc(v.name)}</b> 从管理器移除。<br><b>不会删除磁盘上的任何文件</b>，随时可以再添加回来。`,
    okText: '移除',
  });
  if (!ok) return;
  try {
    await api('/api/vaults', { action: 'remove', id: vid });
    S.tabs = S.tabs.filter(t => t.vid !== vid);
    if (S.activeId && !S.tabs.find(t => t.id === S.activeId)) S.activeId = S.tabs.length ? S.tabs[S.tabs.length - 1].id : null;
    await loadVaults(); renderTree(); renderTabs(); renderView();
    toast('已移除（文件没有删除）', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function dirCtx(e, vid, rel, name) {
  showCtx(e.clientX, e.clientY, [
    { icon: IG.filePlus, label: '新建笔记', fn: () => newFile(vid, rel, true) },
    { icon: IG.filePlus, label: '新建文件', fn: () => newFile(vid, rel, false) },
    { icon: IG.folderPlus, label: '新建文件夹', fn: () => newFolder(vid, rel) },
    'sep',
    { icon: IG.pencil, label: '重命名', fn: () => renameEntry(vid, rel, name, true) },
    { icon: IG.trash, label: '删除', danger: true, fn: () => deleteEntry(vid, rel, name, true) },
    'sep',
    { icon: IG.external, label: '在资源管理器中显示', fn: () => api('/api/openfile', { vid, rel, reveal: true }).catch(x => toast(x.message, 'err')) },
    { icon: IG.refresh, label: '刷新', fn: () => { invalidateVault(vid); renderTree(); } },
  ]);
}
function absPath(vid, rel) {
  const v = vaultById(vid);
  const r = String(rel || '').replace(/\//g, '\\');
  return v ? v.path + (r ? '\\' + r : '') : r;
}
function legacyCopy(s) {
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
function copyText(s, label) {
  const done = () => toast((label || '路径') + '已复制', 'ok');
  const fail = () => toast('复制失败：请确认管理器窗口处于前台', 'err');
  if (navigator.clipboard && document.hasFocus()) {
    navigator.clipboard.writeText(s).then(done, () => legacyCopy(s) ? done() : fail());
  } else {
    legacyCopy(s) ? done() : fail();
  }
}
function fileCtx(e, vid, rel) {
  const name = base(rel);
  const items = [
    { icon: IG.pencil, label: '重命名', fn: () => renameEntry(vid, rel, name, false) },
    { icon: IG.clipboard, label: '复制名称', fn: () => copyText(name, '名称') },
    { icon: IG.paperclip, label: '复制完整路径', fn: () => copyText(absPath(vid, rel)) },
    'sep',
    { icon: IG.external, label: '在资源管理器中显示', fn: () => api('/api/openfile', { vid, rel, reveal: true }).catch(x => toast(x.message, 'err')) },
    { icon: IG.monitor, label: '用系统程序打开', fn: () => api('/api/openfile', { vid, rel }).catch(x => toast(x.message, 'err')) },
    'sep',
    { icon: IG.trash, label: '删除', danger: true, fn: () => deleteEntry(vid, rel, name, false) },
  ];
  if (kindOf(name) === 'zip') items.unshift({ icon: IG.box, label: '解压到同名文件夹', fn: () => extractZip(vid, rel) });
  showCtx(e.clientX, e.clientY, items);
}
async function newFile(vid, dirRel, isMd) {
  const def = isMd ? '未命名.md' : '新建文件.txt';
  const name = await modalPrompt({ title: '新建笔记', value: def, note: '将创建在：' + esc(dirRel || '根目录') });
  if (!name) return;
  const rel = (dirRel ? dirRel + '/' : '') + name;
  try {
    await api('/api/touch', { vid, rel });
    invalidateVault(vid);
    S.expanded.add(childrenKey(vid, dirRel));
    renderTree();
    openFile(vid, rel);
  } catch (e) { toast(e.message, 'err'); }
}
async function newFolder(vid, dirRel) {
  const name = await modalPrompt({ title: '新建文件夹', value: '新建文件夹', note: '将创建在：' + esc(dirRel || '根目录') });
  if (!name) return;
  try {
    await api('/api/mkdir', { vid, rel: (dirRel ? dirRel + '/' : '') + name });
    invalidateVault(vid);
    renderTree();
  } catch (e) { toast(e.message, 'err'); }
}
async function renameEntry(vid, rel, name, isDir) {
  const nn = await modalPrompt({ title: '重命名', value: name });
  if (!nn || nn === name) return;
  try {
    await api('/api/rename', { vid, rel, name: nn });
    invalidateVault(vid);
    const dir = dirOf(rel);
    const newRel = (dir ? dir + '/' : '') + nn;
    for (const t of S.tabs) {
      if (t.vid === vid && t.rel === rel) { t.rel = newRel; }
      else if (isDir && t.vid === vid && t.rel.startsWith(rel + '/')) t.rel = newRel + t.rel.slice(rel.length);
    }
    if (S.treeSel) S.treeSel = S.treeSel.replace(vid + ':' + rel, vid + ':' + newRel);
    renderTree(); renderTabs(); renderView();
  } catch (e) { toast(e.message, 'err'); }
}
async function deleteEntry(vid, rel, name, isDir) {
  const ok = await modalConfirm({
    title: `删除${isDir ? '文件夹' : '文件'}`,
    html: `确定删除 <b style="color:var(--text)">${esc(name)}</b> 吗？${isDir ? '<br>文件夹里的所有内容都会一起删除。' : ''}<br>删除后会进入<b>回收站</b>，还可以还原。`,
  });
  if (!ok) return;
  try {
    const r = await api('/api/delete', { vid, rel });
    toast(r.recycled ? '已移入回收站' : '已删除', 'ok');
    invalidateVault(vid);
    S.tabs = S.tabs.filter(t => !(t.vid === vid && (t.rel === rel || t.rel.startsWith(rel + '/'))));
    if (S.activeId && !S.tabs.find(t => t.id === S.activeId)) S.activeId = S.tabs.length ? S.tabs[S.tabs.length - 1].id : null;
    renderTree(); renderTabs(); renderView();
  } catch (e) { toast(e.message, 'err'); }
}
async function extractZip(vid, rel) {
  try {
    const r = await api('/api/extract', { vid, rel });
    toast(`已解压 ${r.count} 个文件`, 'ok');
    invalidateVault(vid);
    renderTree();
  } catch (e) { toast(e.message, 'err'); }
}

/* ================= 库（vault）管理 ================= */
async function loadVaults() {
  S.vaults = await api('/api/vaults');
  const sel = $('#vaultSel');
  sel.innerHTML = S.vaults.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('');
  if (!S.vaults.find(v => v.id === S.vid)) {
    /* 默认库：角色卡库（存在就优先落在它上面） */
    const pref = S.vaults.find(v => v.name === '角色卡库');
    S.vid = pref ? pref.id : (S.vaults[0] ? S.vaults[0].id : null);
  }
  if (S.vid) sel.value = S.vid;
}
function openVaultBrowser() {
  let cur = '';
  let pickedName = '';
  const m = openModal(`<h3>添加要管理的文件夹</h3>
    <div class="m-body">
      <div class="fb-drives" id="fb-drives"></div>
      <div class="fb-path" id="fb-path"></div>
      <div class="fb-list" id="fb-list"></div>
      <input type="text" id="fb-name" placeholder="在管理器里显示的名称">
    </div>
    <div class="m-foot">
      <button class="m-btn" id="fb-up">${IG.up} 上一级</button>
      <span style="flex:1"></span>
      <button class="m-btn" id="fb-cancel">取消</button>
      <button class="m-btn primary" id="fb-ok">添加</button>
    </div>`);
  const done = v => { closeModal(); if (v) loadVaults().then(() => { renderTree(); renderView(); }); };
  m.querySelector('#fb-cancel').onclick = () => done(false);
  async function nav(p) {
    const d = await api('/api/browse', { path: p || null });
    cur = d.path;
    m.querySelector('#fb-path').textContent = d.path || '（选择磁盘）';
    m.querySelector('#fb-up').style.visibility = d.parent ? 'visible' : 'hidden';
    m.querySelector('#fb-up').onclick = () => nav(d.parent);
    const dv = m.querySelector('#fb-drives');
    dv.innerHTML = d.drives.map(x => `<button class="m-btn" data-p="${esc(x.path)}">${esc(x.name)}</button>`).join('');
    dv.querySelectorAll('button').forEach(b => b.onclick = () => nav(b.dataset.p));
    const ls = m.querySelector('#fb-list');
    if (!d.dirs.length && d.path) ls.innerHTML = `<div class="fb-empty">这里面没有子文件夹了</div>`;
    else ls.innerHTML = d.dirs.map(n => `<div class="fb-item" data-n="${esc(n)}"><span>${FI_DIR}</span><span>${esc(n)}</span></div>`).join('');
    ls.querySelectorAll('.fb-item').forEach(it => it.onclick = () => nav((d.path ? d.path.replace(/[\\/]+$/, '') + '\\' : '') + it.dataset.n));
    m.querySelector('#fb-name').value = d.path ? base(d.path.replace(/[\\/]+$/, '')) : '';
    m.querySelector('#fb-ok').disabled = !d.path;
    m.querySelector('#fb-ok').style.opacity = d.path ? '1' : '.5';
  }
  m.querySelector('#fb-ok').onclick = async () => {
    try {
      await api('/api/vaults', { action: 'add', path: cur });
      toast('已添加', 'ok');
      done(true);
    } catch (e) { toast(e.message, 'err'); }
  };
  nav('');
}
$('#btnAddVault').onclick = () => openVaultBrowser();
$('#vaultSel').onchange = e => { S.vid = e.target.value; renderTree(); };
$('#btnNewMd').onclick = () => { const v = curVault(); if (v) newFile(v.id, '', true); else openVaultBrowser(); };

/* ================= 标签页 ================= */
function renderTabs() {
  const bar = $('#tabs');
  bar.innerHTML = '';
  for (const t of S.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === S.activeId ? ' active' : '');
    el.title = t.rel;
    const editable = t.kind === 'md' || t.kind === 'code' || t.kind === 'html' || t.kind === 'jsonl';
    const dirty = editable ? (t.text !== t.orig) : false;
    const title = t.kind === 'search' ? '搜索' : t.kind === 'cards' ? '卡库'
      : t.kind === 'themelib' ? '主题库' : t.kind === 'covers' ? '封面'
      : t.kind === 'onlinelib' ? '在线库' : base(t.rel);
    el.innerHTML = `<span class="ticon">${iconFor(title === base(t.rel) ? t.rel : '卡库', t.kind === 'search' || t.kind === 'cards')}</span>
      <span class="tname">${esc(title)}</span>
      ${dirty ? '<span class="dot">•</span>' : ''}
      <span class="close" title="关闭 (Alt+W)">×</span>`;
    el.onclick = e => { if (e.target.classList.contains('close')) closeTab(t.id); else activateTab(t.id); };
    el.onauxclick = e => { if (e.button === 1) closeTab(t.id); };
    el.oncontextmenu = e => {
      e.preventDefault();
      const items = [];
      if (t.vid) {
        items.push({ icon: IG.paperclip, label: '复制完整路径', fn: () => copyText(absPath(t.vid, t.rel)) });
        items.push({ icon: IG.pin, label: isFav(t.vid, t.rel) ? '取消收藏' : '收藏置顶', fn: () => toggleFav(t.vid, t.rel) });
        items.push({ icon: IG.external, label: '在资源管理器中显示', fn: () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {}) });
        items.push('sep');
      }
      items.push({ icon: IG.x, label: '关闭标签', fn: () => closeTab(t.id) });
      items.push({ icon: IG.xCircle, label: '关闭其他标签', fn: () => { S.tabs = S.tabs.filter(x => x.id === t.id); S.activeId = t.id; renderTabs(); renderView(); } });
      showCtx(e.clientX, e.clientY, items);
    };
    bar.appendChild(el);
  }
}
function activateTab(id) { S.activeId = id; renderTabs(); renderView(); }
function closeTab(id) {
  const i = S.tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const t = S.tabs[i];
  if ((t.kind === 'md' || t.kind === 'code' || t.kind === 'html' || t.kind === 'jsonl') && t.text !== t.orig) {
    // 有未保存修改，提示（简单起见直接确认）
    if (!confirm(`「${base(t.rel)}」有未保存的修改，关闭将丢弃。确定关闭？`)) return;
  }
  S.tabs.splice(i, 1);
  if (S.activeId === id) S.activeId = S.tabs.length ? S.tabs[Math.min(i, S.tabs.length - 1)].id : null;
  renderTabs(); renderView();
}
async function openFile(vid, rel) {
  if (!rel) return;
  const exist = S.tabs.find(t => t.vid === vid && t.rel === rel);
  if (exist) return activateTab(exist.id);
  const kind = kindOf(base(rel));
  if (kind === 'lnk') {
    let info = {};
    try { info = await api(`/api/lnk?vid=${vid}&rel=${encodeURIComponent(rel)}`); } catch {}
    if (info.target && info.isDir) { await openFolderShortcut(info.target); return; }
    const tab = { id: 't' + (tabSeq++), vid, rel, kind: 'lnk', mode: 'preview', text: '', orig: '', meta: { lnk: info } };
    S.tabs.push(tab);
    activateTab(tab.id);
    return;
  }
  const tab = { id: 't' + (tabSeq++), vid, rel, kind, mode: 'preview', text: '', orig: '', meta: {} };
  try {
    if (kind === 'md' || kind === 'code' || kind === 'html' || kind === 'jsonl' || kind === 'bin') {
      const d = await api(`/api/read?vid=${vid}&rel=${encodeURIComponent(rel)}`);
      if (d.tooBig) { tab.kind = 'bin'; tab.meta = { size: d.size, tooBig: true }; }
      else if (d.binary && (kind === 'md' || kind === 'code' || kind === 'html')) { tab.kind = 'bin'; tab.meta = { size: d.size }; }
      else {
        if (kind !== 'bin') { tab.text = d.text; tab.orig = d.text; }
        tab.meta = { size: d.size, mtime: d.mtime, binary: d.binary };
        /* RB 整卡（含五板块标记）→ 用 LinWork Pro 的 RB 模式打开 */
        if (kind === 'md' && /LIN-RB-CARD/.test(String(d.text || ''))) tab.kind = 'rbmv';
      }
    }
    S.tabs.push(tab);
    activateTab(tab.id);
  } catch (e) { toast(e.message, 'err'); }
}

/* ================= 视图渲染 ================= */
function renderView() {
  const view = $('#view');
  const t = activeTab();
  stopRbAuto(); stopProAuto();
  view.innerHTML = '';
  if (!t) {
    view.innerHTML = `<div class="welcome"><svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="lwgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6535D4"/><stop offset="1" stop-color="#37C89A"/></linearGradient></defs><rect width="512" height="512" rx="138" fill="#14121D"/><path fill-rule="evenodd" fill="url(#lwgrad)" d="M86 132A20 20 0 0 1 106 112L236 112A20 20 0 0 1 256 132L256 172L390 172A36 36 0 0 1 426 208L426 388A36 36 0 0 1 390 424L122 424A36 36 0 0 1 86 388ZM203 246L247 246L247 314L309 314L309 358L203 358Z"/></svg>
      <h2><b>Lin</b> Files</h2><p>左侧选择文件打开 · Ctrl+P 快速打开 · Ctrl+Shift+F 全文搜索</p>
      ${S.vaults.length ? '' : '<p style="margin-top:8px">先 <b id="w-add">添加一个文件夹</b> 开始管理</p>'}</div>`;
    const b = $('#w-add');
    if (b) b.onclick = openVaultBrowser;
    updateStatus();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'view-wrap';
  view.appendChild(wrap);
  const body = document.createElement('div');
  body.className = 'view-body';
  ({ md: viewMd, code: viewCode, html: viewHtml, image: viewImage, pdf: viewPdf, zip: viewZip, bin: viewBin, lnk: viewLnk, jsonl: viewJsonl, cards: viewCards, search: viewSearch, rbmv: viewRbCard, themelib: viewThemes, covers: viewCovers, thmpv: viewThmPreview, onlinelib: viewOnlineLib }[t.kind] || viewBin)(wrap, body, t);
  updateStatus();
}
function toolbar(wrap, left = [], right = []) {
  const bar = document.createElement('div');
  bar.className = 'view-toolbar';
  for (const b of left) bar.appendChild(b);
  const sp = document.createElement('span'); sp.className = 'spacer'; bar.appendChild(sp);
  for (const b of right) bar.appendChild(b);
  wrap.appendChild(bar);
}
function vbtn(label, onclick, on) {
  const b = document.createElement('button');
  b.className = 'vbtn' + (on ? ' on' : '');
  b.innerHTML = label;
  b.onclick = onclick;
  return b;
}
function makeTextarea(t, cls) {
  const ta = document.createElement('textarea');
  ta.className = 'code ' + (cls || '');
  ta.value = t.text;
  ta.spellcheck = false;
  ta.addEventListener('input', () => {
    t.text = ta.value;
    const was = t._dirtyShown, is = t.text !== t.orig;
    if (was !== is) { t._dirtyShown = is; renderTabs(); } // 只在脏状态翻转时重建标签栏
    updateStatus();
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); t.text = ta.value; }
  });
  return ta;
}

/* ---- Markdown ---- */
function joinRel(baseDir, rel) {
  const segs = (baseDir ? baseDir.split('/') : []);
  for (const p of rel.replace(/\\/g, '/').split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') segs.pop(); else segs.push(p);
  }
  return segs.join('/');
}
function assetUrl(vid, baseDir, src) {
  if (/^(https?:|data:|blob:|#|mailto:)/i.test(src)) return src;
  return `/v/${vid}/${encodeRel(joinRel(baseDir, src.replace(/^\.\//, '')))}`;
}
function renderMdDom(t) {
  const tpl = document.createElement('template');
  tpl.innerHTML = marked.parse(t.text, { gfm: true, breaks: true });
  const bd = dirOf(t.rel);
  tpl.content.querySelectorAll('img').forEach(im => { im.src = assetUrl(t.vid, bd, im.getAttribute('src') || ''); im.loading = 'lazy'; });
  tpl.content.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (/^(https?:|mailto:|#)/i.test(href)) { a.target = '_blank'; return; }
    a.dataset.open = joinRel(bd, href);
    a.removeAttribute('href');
    a.classList.add('md-link');
  });
  tpl.content.querySelectorAll('pre code').forEach(c => { try { hljs.highlightElement(c); } catch {} });
  return tpl.content;
}
function viewMd(wrap, body, t) {
  if (t.mode !== 'edit') t.mode = 'preview';
  toolbar(wrap, [
    vbtn(IG.book + ' 预览', () => { t.mode = 'preview'; renderView(); }, t.mode === 'preview'),
    vbtn(IG.pencil + ' 编辑', () => { t.mode = 'edit'; renderView(); }, t.mode === 'edit'),
  ], [
    vbtn(IG.save + ' 保存 (Ctrl+S)', () => saveActive()),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  if (t.mode === 'edit') {
    body.appendChild(makeTextarea(t));
  } else {
    const md = document.createElement('div');
    md.className = 'md-body';
    md.appendChild(renderMdDom(t));
    md.addEventListener('click', e => {
      const a = e.target.closest('a[data-open]');
      if (a) openFile(t.vid, a.dataset.open);
    });
    body.appendChild(md);
  }
  wrap.appendChild(body);
}
async function saveActive() {
  const t = activeTab();
  if (!t || (t.kind !== 'md' && t.kind !== 'code' && t.kind !== 'html' && t.kind !== 'jsonl')) { toast('当前标签不可编辑'); return; }
  try {
    if (t.kind === 'jsonl' && t._lines) jlSyncText(t);
    await api('/api/write', { vid: t.vid, rel: t.rel, content: t.text });
    t.orig = t.text;
    toast('已保存', 'ok');
    renderTabs(); updateStatus();
  } catch (e) { toast('保存失败：' + e.message, 'err'); }
}

/* JSON 类型嗅探：Pro 工作区存档 / 角色卡 / 世界书 / 普通 json */
function jsonSniff(text) {
  let obj = null;
  try { obj = JSON.parse(text); } catch { return { k: 'invalid' }; }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if ('wb_md' in obj || 'cardFields' in obj || ('ds' in obj && 'cc_md' in obj)) return { k: 'archive' };
    if (obj.entries && typeof obj.entries === 'object') {
      const vals = Array.isArray(obj.entries) ? obj.entries : Object.values(obj.entries);
      if (vals.some(x => x && typeof x === 'object' && (('key' in x) || ('keys' in x) || ('content' in x) || ('content' in ((x && x.data) || {}))))) return { k: 'worldbook' };
    }
    if (obj.spec === 'chara_card_v2' || obj.spec === 'chara_card_v3') return { k: 'card' };
    const d = obj.data || obj;
    if (d && typeof d === 'object' && d.name && (d.description != null || d.personality != null || d.first_mes != null || d.character_book || d.scenario != null)) return { k: 'card' };
  }
  return { k: 'json' };
}
const SNIFF_LABEL = { archive: 'Linwork Pro 工作区存档', card: '角色卡', worldbook: '世界书', json: '普通 JSON', invalid: '无效 JSON' };

async function viewProJson(wrap, body, t) {
  const sniff = t.proSniff || (t.proSniff = jsonSniff(t.text));
  toolbar(wrap, [
    vbtn(IG.eye + ' 高亮查看', () => { t.mode = 'view'; renderView(); }, false),
    vbtn(IG.pencil + ' 编辑', () => { t.mode = 'edit'; renderView(); }, false),
    vbtn(IG.pro + ' Linwork Pro', () => {}, true),
  ], [
    vbtn(IG.save + ' 存回库文件', () => proSaveBack(t)),
    vbtn(IG.refresh + ' 重新载入', () => { t.proSniff = null; renderView(); }),
  ]);
  body.style.overflow = 'hidden';
  const f = document.createElement('iframe');
  f.className = 'html-frame';
  f.src = '/lwp/';
  f.addEventListener('load', () => {
    setTimeout(async () => {
      try {
        const w = f.contentWindow;
        const sel = { archive: 'input[onchange="tavoMigrate(this)"]', card: '#cc_import', worldbook: '#wb_import' }[sniff.k];
        if (!sel) throw new Error(sniff.k === 'invalid' ? '文件不是有效的 JSON' : '普通 JSON 无需用 Pro 打开');
        const inp = w.document.querySelector(sel);
        if (!inp) throw new Error('Linwork Pro 还在初始化，稍候点「重新载入」');
        const file = new w.File([t.text], base(t.rel), { type: 'application/json' });
        const dt = new w.DataTransfer();
        dt.items.add(file);
        inp.files = dt.files;
        inp.dispatchEvent(new w.Event('change'));
        /* 用户工作流以 Tavo 为主 → 喂入后自动切到 Tavo 模式（可随时点回 RB） */
        if (sniff.k === 'card' || sniff.k === 'archive') {
          try { const seg = w.document.getElementById('modeSegTavo'); if (seg) seg.click(); } catch {}
        }
        /* Pro 模式自动保存：编辑后约 2 秒写回库文件 */
        /* 自动保存已关闭（仅手动保存） */
      } catch (e) { toast('Linwork Pro 载入失败：' + e.message, 'err'); }
    }, 500);
  });
  body.appendChild(f);
  wrap.appendChild(body);
}
async function proSaveBack(t) {
  const f = document.querySelector('#view iframe');
  const w = f && f.contentWindow;
  if (!w) { toast('Linwork Pro 未加载'); return; }
  const sniff = t.proSniff || jsonSniff(t.text);
  const note = { card: '将按角色卡 V2 格式导出保存。', worldbook: '将按世界书 entries 格式保存。', archive: '将保存 Linwork Pro 完整工作区存档。' }[sniff.k];
  const ok = await modalConfirm({
    title: '存回库文件',
    html: `把 Linwork Pro 里的编辑结果写回 <b style="color:var(--text)">${esc(base(t.rel))}</b>？<br>${note || '该类型不支持存回。'}`,
    okText: '保存',
  });
  if (!ok) return;
  try {
    const ws = w.__tavoAPI && w.__tavoAPI.get();
    if (!ws) throw new Error('Pro 工作区接口不可用');
    let out;
    if (sniff.k === 'archive') {
      out = JSON.stringify(ws, null, 2);
    } else if (sniff.k === 'card') {
      /* Pro 导出函数在内部作用域拿不到 → 用官方 __tavoAPI.get() 的 cardFields
         按原文件结构做字段级合并，保留原有格式与扩展字段 */
      let orig;
      try { orig = JSON.parse(t.text); } catch { orig = null; }
      if (!orig || typeof orig !== 'object') throw new Error('原文件不是可解析的角色卡 JSON');
      const d = (orig.data && typeof orig.data === 'object') ? orig.data : orig;
      let merged = 0;
      for (const k of Object.keys(d)) {
        if (k in ws.cardFields && (typeof ws.cardFields[k] === 'string' || Array.isArray(ws.cardFields[k]))) { d[k] = ws.cardFields[k]; merged++; }
      }
      if (!merged) throw new Error('没有可回写的字段（原文件与 Pro 表单字段不匹配）');
      out = JSON.stringify(orig, null, 2);
    } else if (sniff.k === 'worldbook') {
      out = JSON.stringify({ entries: ws.wbEntries }, null, 2);
    } else throw new Error('该类型不支持存回');
    await api('/api/write', { vid: t.vid, rel: t.rel, content: out });
    t.text = out; t.orig = out;
    toast('已存回库文件', 'ok');
    renderTabs(); updateStatus();
  } catch (e) { toast('存回失败：' + e.message, 'err'); }
}

/* JSON 面板「写回文档」→ 顺手落盘到库文件 */
window.addEventListener('message', ev => {
  try {
    if (!ev.data || ev.data.type !== 'lwp-doc-writeback') return;
    const t = activeTab();
    if (!t || t.kind !== 'code' || t.mode !== 'pro' || !t.vid) return;
    const json = String(ev.data.json || '');
    if (!json || json === t.orig) return;
    api('/api/write', { vid: t.vid, rel: t.rel, content: json }).then(() => {
      t.text = json; t.orig = json;
      const info = $('#stInfo');
      if (info) info.textContent = 'JSON 面板已写回并保存 ' + new Date().toLocaleTimeString();
    }).catch(() => {});
  } catch (e) {}
});

/* ---- 代码/文本 ---- */
function viewCode(wrap, body, t) {
  const isJson = ext(t.rel) === 'json';
  if (t.mode !== 'edit' && t.mode !== 'view' && t.mode !== 'pro') t.mode = (ext(t.rel) === 'txt' || ext(t.rel) === 'log') ? 'edit' : 'view';
  if (isJson && t.mode === 'pro') return viewProJson(wrap, body, t);
  toolbar(wrap, [
    vbtn(IG.eye + ' 查看', () => { t.mode = 'view'; renderView(); }, t.mode === 'view'),
    vbtn(IG.pencil + ' 编辑', () => { t.mode = 'edit'; renderView(); }, t.mode === 'edit'),
    ...(isJson ? [vbtn(IG.pro + ' Linwork Pro', () => { t.mode = 'pro'; renderView(); }, false)] : []),
  ], [
    vbtn(IG.save + ' 保存 (Ctrl+S)', () => saveActive()),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  if (t.mode === 'edit') {
    body.appendChild(makeTextarea(t));
  } else {
    const div = document.createElement('div');
    div.className = 'code-readonly';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    let text = t.text;
    if (ext(t.rel) === 'json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {} }
    code.textContent = text;
    const lang = ext(t.rel);
    if (window.hljs && hljs.getLanguage(lang)) code.className = 'language-' + lang;
    pre.appendChild(code);
    div.appendChild(pre);
    try { if (window.hljs) hljs.highlightElement(code); } catch {}
    div.addEventListener('dblclick', () => { t.mode = 'edit'; renderView(); });
    body.appendChild(div);
  }
  wrap.appendChild(body);
}

/* ---- HTML ---- */
function viewHtml(wrap, body, t) {
  if (t.mode !== 'code') t.mode = 'preview';
  const srcUrl = `/v/${t.vid}/${encodeRel(t.rel)}?t=${t._stamp || 0}`;
  toolbar(wrap, [
    vbtn(IG.globe + ' 预览', () => { t.mode = 'preview'; renderView(); }, t.mode === 'preview'),
    vbtn(IG.code + ' 源码', () => { t.mode = 'code'; renderView(); }, t.mode === 'code'),
  ], [
    vbtn(IG.save + ' 保存 (Ctrl+S)', () => saveActive()),
    vbtn(IG.monitor + ' 系统浏览器打开', () => api('/api/openfile', { vid: t.vid, rel: t.rel }).catch(() => {})),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  if (t.mode === 'preview') {
    const f = document.createElement('iframe');
    f.className = 'html-frame';
    f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals');
    f.src = srcUrl;
    body.style.overflow = 'hidden';
    body.appendChild(f);
  } else {
    body.appendChild(makeTextarea(t));
  }
  wrap.appendChild(body);
}

/* ---- 图片 / PDF ---- */
function viewImage(wrap, body, t) {
  toolbar(wrap, [], [
    vbtn(IG.monitor + ' 系统打开', () => api('/api/openfile', { vid: t.vid, rel: t.rel }).catch(() => {})),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  const box = document.createElement('div');
  box.className = 'img-view';
  const img = document.createElement('img');
  img.src = `/v/${t.vid}/${encodeRel(t.rel)}`;
  img.alt = base(t.rel);
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = `${base(t.rel)} · ${fmtSize(t.meta.size)}${t.meta.mtime ? ' · ' + fmtTime(t.meta.mtime) : ''}`;
  img.onload = () => cap.textContent += ` · ${img.naturalWidth}×${img.naturalHeight}`;
  box.appendChild(img); box.appendChild(cap);
  body.appendChild(box);
  wrap.appendChild(body);
}
function viewPdf(wrap, body, t) {
  toolbar(wrap, [], [
    vbtn(IG.monitor + ' 系统打开', () => api('/api/openfile', { vid: t.vid, rel: t.rel }).catch(() => {})),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  body.style.overflow = 'hidden';
  const f = document.createElement('iframe');
  f.className = 'html-frame';
  f.src = `/v/${t.vid}/${encodeRel(t.rel)}`;
  body.appendChild(f);
  wrap.appendChild(body);
}

/* ---- ZIP ---- */
async function viewZip(wrap, body, t) {
  const isThm = ext(t.rel) === 'thm';
  if (t.zipMode !== 'thm') t.zipMode = 'list';
  const left = [];
  if (isThm) {
    left.push(vbtn(IG.list + ' 文件列表', () => { t.zipMode = 'list'; renderView(); }, t.zipMode === 'list'));
    left.push(vbtn(IG.palette + ' Lin Thm 预览', () => { t.zipMode = 'thm'; renderView(); }, t.zipMode === 'thm'));
  }
  if (t.zipMode === 'list') {
    left.push(vbtn(IG.box + ' 解压全部', () => extractZip(t.vid, t.rel)));
    left.push(vbtn(IG.refresh + ' 刷新', () => { delete t.zipData; renderView(); }));
  }
  toolbar(wrap, left, [
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  if (isThm && t.zipMode === 'thm') {
    /* 内嵌真正的 Lin Thm 预览器（同源），加载后把当前 .thm 喂给它 */
    body.style.overflow = 'hidden';
    const f = document.createElement('iframe');
    f.className = 'html-frame';
    f.src = '/thm/';
    f.addEventListener('load', async () => {
      try {
        const w = f.contentWindow;
        if (!w || typeof w.handleFiles !== 'function') return;
        const r = await fetch(`/v/${t.vid}/${encodeRel(t.rel)}`);
        const blob = await r.blob();
        await w.handleFiles([new File([blob], base(t.rel), { type: 'application/zip' })]);
      } catch (e) { toast('载入主题失败：' + e.message, 'err'); }
    });
    body.appendChild(f);
    wrap.appendChild(body);
    return;
  }
  if (!t.zipData) {
    body.innerHTML = '<div class="search-empty">正在读取压缩包…</div>';
    wrap.appendChild(body);
    try { t.zipData = await api(`/api/zip?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}`); }
    catch (e) { body.innerHTML = `<div class="search-empty">${esc(e.message)}</div>`; return; }
    if (activeTab() !== t) return;
    return renderView(); // 重新渲染为完整列表
  }
  const d = t.zipData;
  const files = d.entries.filter(e => !e.dir);
  const total = files.reduce((s, e) => s + e.size, 0);
  const sel = t.zipSel;
  if (sel) {
    const bar = document.createElement('div');
    bar.style.padding = '0';
    body.appendChild(Object.assign(document.createElement('div'), { className: 'zip-view' }));
    const zv = body.firstChild;
    const back = vbtn(IG.back + ' 返回文件列表', () => { t.zipSel = null; renderView(); });
    back.className = 'vbtn back';
    zv.appendChild(back);
    const holder = document.createElement('div');
    zv.appendChild(holder);
    wrap.appendChild(body);
    try {
      const e = ext(sel);
      if (IMG_EXT.has(e)) {
        const box = document.createElement('div'); box.className = 'img-view';
        const img = document.createElement('img');
        img.src = `/api/zipentry?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}&entry=${encodeURIComponent(sel)}&raw=1`;
        box.appendChild(img);
        const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = sel;
        box.appendChild(cap);
        holder.appendChild(box);
      } else if (e === 'html' || e === 'htm') {
        const r = await api(`/api/zipentry?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}&entry=${encodeURIComponent(sel)}`);
        const url = URL.createObjectURL(new Blob([r.text], { type: 'text/html' }));
        const f = document.createElement('iframe');
        f.className = 'html-frame';
        f.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals');
        f.style.height = '70vh';
        f.src = url;
        holder.appendChild(f);
      } else {
        const r = await api(`/api/zipentry?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}&entry=${encodeURIComponent(sel)}`);
        if (r.binary) { holder.innerHTML = `<div class="search-empty">二进制文件，暂不支持预览</div>`; }
        else {
          const div = document.createElement('div'); div.className = 'code-readonly';
          const pre = document.createElement('pre'); const code = document.createElement('code');
          let text = r.text;
          if (e === 'json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {} }
          code.textContent = text;
          if (window.hljs && hljs.getLanguage(e)) code.className = 'language-' + e;
          pre.appendChild(code); div.appendChild(pre); holder.appendChild(div);
          try { if (window.hljs) hljs.highlightElement(code); } catch {}
        }
      }
    } catch (e) { holder.innerHTML = `<div class="search-empty">${esc(e.message)}</div>`; }
    return;
  }
  const box = document.createElement('div');
  box.className = 'zip-view';
  box.innerHTML = `<div class="zip-head"><span class="big">${FI_ZIP}</span>
    <div><div><b>${esc(base(t.rel))}</b></div>
    <div class="meta">${files.length} 个文件 · 压缩包 ${fmtSize(d.size)} · 解压后约 ${fmtSize(total)}</div></div></div>
    <table class="zip-table"><thead><tr><th>名称</th><th style="text-align:right">原始大小</th><th style="text-align:right">压缩后</th></tr></thead>
    <tbody>${d.entries.map((e, i) => e.dir
      ? `<tr><td class="zname">${FI_DIR} ${esc(e.name)}</td><td class="num" colspan="2">—</td></tr>`
      : `<tr class="row" data-i="${i}"><td class="zname">${iconFor(e.name)} ${esc(e.name)}</td><td class="num">${fmtSize(e.size)}</td><td class="num">${fmtSize(e.csize)}</td></tr>`
    ).join('')}</tbody></table>`;
  box.querySelectorAll('tr.row').forEach(tr => tr.onclick = () => {
    t.zipSel = d.entries[+tr.dataset.i].name;
    renderView();
  });
  body.appendChild(box);
  wrap.appendChild(body);
}

/* ---- 快捷方式信息卡（文件/网址/失效目标；文件夹目标已被 openFile 直接打开） ---- */
async function viewLnk(wrap, body, t) {
  if (!t.meta.lnk) {
    try { t.meta.lnk = await api(`/api/lnk?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}`); } catch { t.meta.lnk = {}; }
  }
  const info = t.meta.lnk;
  const isUrl = !!info.url;
  const label = isUrl ? FI_HTML : (info.target && info.isDir) ? FI_DIR : info.exists ? FI_FILE : FI_WARN;
  const sub = isUrl ? '网址快捷方式' : (info.target && info.isDir) ? '文件夹快捷方式' : info.exists ? '文件快捷方式' : (info.target ? '目标不存在' : '无法解析目标');
  const dest = isUrl ? info.url : (info.target || '（空）');
  toolbar(wrap, [], [
    vbtn('🔄 重新解析', async () => { try { t.meta.lnk = await api(`/api/lnk?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}`); } catch {} renderView(); }),
  ]);
  const box = document.createElement('div');
  box.className = 'bin-view';
  box.innerHTML = `<div class="bin-card">
    <div class="big">${label}</div>
    <h3>${esc(base(t.rel))}</h3>
    <div class="meta">${esc(sub)}</div>
    <div class="meta" style="max-width:440px;overflow-wrap:anywhere;margin-bottom:18px;user-select:text">→ ${esc(dest)}</div>
    <div class="row" id="lnk-btns"></div>
    ${info.target && info.isDir ? '<div class="m-note" style="text-align:center">双击此快捷方式即可在管理器中直接打开并管理目标文件夹</div>' : ''}
  </div>`;
  const btns = box.querySelector('#lnk-btns');
  const addBtn = (text, fn) => btns.appendChild(vbtn(text, fn));
  if (isUrl) addBtn(IG.globe + ' 打开网址', () => api('/api/openpath', { path: info.url }).catch(e => toast(e.message, 'err')));
  if (info.exists) {
    addBtn(IG.monitor + ' 用系统程序打开', () => api('/api/openpath', { path: info.target }).catch(e => toast(e.message, 'err')));
    addBtn(IG.external + ' 显示目标位置', () => api('/api/openpath', { path: info.target, reveal: true }).catch(e => toast(e.message, 'err')));
  }
  if (info.target && info.isDir) addBtn(IG.archive + ' 在管理器中打开此文件夹', () => openFolderShortcut(info.target));
  addBtn(IG.external + ' 快捷方式位置', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(e => toast(e.message, 'err')));
  body.appendChild(box);
  wrap.appendChild(body);
}

/* ---- JSONL 查看器（SillyTavern/Tavo 聊天记录：逐行 JSON，首行元数据） ---- */
function jlFmtDate(d) {
  try { const x = new Date(d); if (isNaN(x)) return String(d || ''); return fmtTime(x.getTime()); } catch { return String(d || ''); }
}
function jlSyncText(t) {
  t.text = t._lines.map(l => JSON.stringify(l)).join('\n') + '\n';
  renderTabs(); updateStatus();
}
function viewJsonl(wrap, body, t) {
  if (t.mode !== 'raw') t.mode = 'chat';
  toolbar(wrap, [
    vbtn('💬 聊天视图', () => { t.mode = 'chat'; renderView(); }, t.mode === 'chat'),
    vbtn('🧾 原始编辑', () => { t.mode = 'raw'; renderView(); }, t.mode === 'raw'),
  ], [
    vbtn(IG.save + ' 保存 (Ctrl+S)', () => saveActive()),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ]);
  if (t.mode === 'raw') {
    body.appendChild(makeTextarea(t));
    wrap.appendChild(body);
    return;
  }
  if (!t._lines) {
    try { t._lines = t.text.split(/\r?\n/).filter(s => s.trim()).map(JSON.parse); }
    catch (e) {
      body.innerHTML = `<div class="search-empty">JSONL 解析失败：${esc(e.message)}<br>请用「原始编辑」模式查看</div>`;
      wrap.appendChild(body);
      return;
    }
  }
  const lines = t._lines;
  const meta = (lines[0] && typeof lines[0] === 'object' && !('mes' in lines[0])) ? lines[0] : null;
  const msgIdx = [];
  lines.forEach((m, i) => { if (m && typeof m === 'object' && ('mes' in m || 'name' in m) && i !== 0) msgIdx.push(i); });
  const box = document.createElement('div');
  box.className = 'jsonl-view';
  const head = document.createElement('div');
  head.className = 'jl-meta';
  head.textContent = (meta && meta.character_name ? `${meta.character_name} × ${meta.user_name || '用户'}` : '聊天记录') + ` · ${msgIdx.length} 条消息 · ${base(t.rel)}`;
  box.appendChild(head);
  msgIdx.forEach(i => {
    const m = lines[i];
    const cur = (Array.isArray(m.swipes) && m.swipes.length && m.swipe_id != null) ? m.swipes[m.swipe_id] : m.mes;
    const row = document.createElement('div');
    row.className = 'jl-msg ' + (m.is_user ? 'jl-user' : 'jl-char');
    row.innerHTML = `<div class="jl-head"><b>${esc(m.name || (m.is_user ? '用户' : '角色'))}</b>
      <span class="jl-date">${esc(jlFmtDate(m.send_date))}</span>
      ${Array.isArray(m.swipes) && m.swipes.length > 1 ? `<span class="jl-swipes">⟲ ${m.swipes.length} 候选 · 当前第 ${(m.swipe_id || 0) + 1} 条</span>` : ''}
      <button class="vbtn jl-edit">${IG.pencil} 编辑</button></div>
      <div class="jl-bubble"><span class="jl-text">${esc(cur || '').replace(/\n/g, '<br>')}</span></div>`;
    row.querySelector('.jl-edit').onclick = () => {
      const bubble = row.querySelector('.jl-bubble');
      bubble.innerHTML = '';
      const ta = document.createElement('textarea');
      ta.className = 'code';
      ta.value = cur || '';
      ta.rows = Math.min(14, ta.value.split('\n').length + 2);
      ta.style.minWidth = '100%';
      const okB = vbtn(IG.check + ' 保存修改', () => {
        m.mes = ta.value;
        if (Array.isArray(m.swipes) && m.swipes.length) m.swipes[m.swipe_id || 0] = ta.value;
        jlSyncText(t);
        renderView();
        toast('已修改，记得 Ctrl+S 存入文件', 'ok');
      });
      const noB = vbtn('取消', () => renderView());
      bubble.appendChild(ta);
      const br = document.createElement('div');
      br.appendChild(okB); br.appendChild(noB);
      bubble.appendChild(br);
      ta.focus();
    };
    box.appendChild(row);
  });
  body.appendChild(box);
  wrap.appendChild(body);
}

/* ---- 卡库（角色卡/世界书管理器） ---- */
async function viewCards(wrap, body, t) {
  const libVault = S.vaults.find(v => v.name === '角色卡库');
  const scanAll = !!t.allVaults || !libVault;
  toolbar(wrap, [
    vbtn(IG.refresh + ' 重新扫描', () => { t.results = null; renderView(); }),
    vbtn(scanAll ? (IG.target + ' 只看角色卡库') : (IG.archive + ' 扫描全部库'), () => { t.allVaults = !t.allVaults; t.results = null; renderView(); }),
    vbtn('＋ 新建 RB 卡', () => newRbCard()),
    vbtn('＋ 新建 Tavo 卡', () => newTavoCard()),
    vbtn('＋ 新建世界书', () => newWorldbook()),
  ], []);
  /* 第二栏：分类筛选（角色卡 / 世界书）——计数在数据载入后回填 */
  const flt = t.filter || 'all';
  const btnAll = vbtn('全部', () => { t.filter = 'all'; renderView(); }, flt === 'all');
  const btnCard = vbtn(IG.card + ' 角色卡', () => { t.filter = 'card'; renderView(); }, flt === 'card');
  const btnWb = vbtn(IG.globe + ' 世界书', () => { t.filter = 'worldbook'; renderView(); }, flt === 'worldbook');
  const btnArch = vbtn(IG.archive + ' 存档', () => { t.filter = 'archive'; renderView(); }, flt === 'archive');
  btnArch.style.display = 'none';
  const updateFilterLabels = () => {
    const c = { card: 0, worldbook: 0, archive: 0 };
    for (const g of (t.results || [])) {
      for (const x of g.results) {
        if (x.kind === 'card' || x.kind === 'pngcard') c.card++;
        else if (x.kind === 'worldbook') c.worldbook++;
        else c.archive++;
      }
    }
    btnCard.innerHTML = IG.card + ' 角色卡 ' + c.card;
    btnWb.innerHTML = IG.globe + ' 世界书 ' + c.worldbook;
    btnArch.innerHTML = IG.archive + ' 存档 ' + c.archive;
    btnArch.style.display = c.archive ? '' : 'none';
  };
  updateFilterLabels();
  t._updateFilterLabels = updateFilterLabels;
  const searchInp = document.createElement('input');
  searchInp.type = 'text';
  searchInp.placeholder = '搜索角色名 / 文件名…';
  searchInp.style.cssText = 'margin-left:10px;max-width:220px';
  searchInp.value = t.q || '';
  searchInp.oninput = () => {
    t.q = searchInp.value;
    renderView();
    const el2 = document.querySelector('#view .view-toolbar input');
    if (el2) { el2.focus(); el2.selectionStart = el2.value.length; }
  };
  toolbar(wrap, [btnAll, btnCard, btnWb, btnArch], [searchInp]);
  const box = document.createElement('div');
  box.className = 'search-view';
  body.appendChild(box);
  wrap.appendChild(body);
  if (!t.results) {
    box.innerHTML = '<div class="search-empty">正在扫描角色卡 / 世界书 / Pro 存档…</div>';
    const groups = [];
    const scope = scanAll ? S.vaults : [libVault];
    for (const v of scope) {
      try {
        const d = await api('/api/cardscan', { vid: v.id });
        if (d.results.length) groups.push({ v, results: d.results });
      } catch {}
    }
    t.results = groups;
    if (activeTab() !== t) return;
    box.innerHTML = '';
    try { if (t._updateFilterLabels) t._updateFilterLabels(); } catch {}
  }
  const KIND_META = { card: [IG.card, '角色卡'], worldbook: [IG.globe, '世界书'], archive: [IG.archive, 'Pro 存档'], pngcard: [IG.image, 'PNG 卡'] };
  /* 分区：角色卡（含 PNG 卡）/ 世界书 / Pro 存档，各自独立成块 */
  const SECTIONS = [
    { key: 'card', icon: IG.card, label: '角色卡', match: c => c.kind === 'card' || c.kind === 'pngcard' },
    { key: 'worldbook', icon: IG.globe, label: '世界书', match: c => c.kind === 'worldbook' },
    { key: 'archive', icon: IG.archive, label: 'Pro 存档', match: c => c.kind === 'archive' || (c.kind !== 'card' && c.kind !== 'pngcard' && c.kind !== 'worldbook') }
  ];
  let total = 0;
  for (const g of t.results) {
    const gh = document.createElement('div');
    gh.className = 'card-group';
    gh.innerHTML = IG.archive + ' ' + esc(g.v.name) + ' · ' + g.results.length + ' 个';
    box.appendChild(gh);
    for (const sec of SECTIONS) {
      const activeFilter = t.filter || 'all';
      if (activeFilter !== 'all' && sec.key !== activeFilter) continue;
      const q = String(t.q || '').trim().toLowerCase();
      const list = g.results.filter(c => sec.match(c) && (!q || String(c.name).toLowerCase().includes(q) || String(c.rel).toLowerCase().includes(q)));
      if (!list.length) continue;
      const sh = document.createElement('div');
      sh.className = 'cc-section';
      sh.innerHTML = `<span class="cc-section-title">${sec.icon} ${sec.label}</span><span class="cc-section-count">${list.length}</span>`;
      box.appendChild(sh);
      const grid = document.createElement('div');
      grid.className = 'cc-grid';
      for (const c of list) {
        total++;
        const [, klabel] = KIND_META[c.kind] || [IG.file, c.kind];
        const card = document.createElement('div');
        card.className = 'cc-card';
        const img = c.imgRel
          ? `<img loading="lazy" src="/v/${g.v.id}/${encodeRel(String(c.imgRel))}" alt="${esc(c.name)}" onerror="this.parentNode.classList.add('noimg');this.remove()">`
          : '';
        card.innerHTML = `<div class="cc-img">${img}<span class="cc-ph">${esc(String(c.name || '?').slice(0, 1))}</span></div>
          <div class="cc-meta"><div class="cc-name" title="${esc(c.name)}">${esc(c.name)}${c.version ? `<span class="cc-ver">v${esc(String(c.version).replace(/^v/i, ''))}</span>` : ''}</div>
          <div class="cc-sub"><span class="cc-badge">${klabel}</span><span class="cc-path" title="${esc(c.rel)}">${esc(c.rel)}</span></div></div>`;
        card.onclick = () => openCard(g.v.id, c.rel);
        grid.appendChild(card);
      }
      box.appendChild(grid);
    }
  }
  if (!total) box.innerHTML += '<div class="search-empty">各库里还没有识别到角色卡 / 世界书 JSON（或 PNG 卡）。<br>把卡放进任何受管理的文件夹，这里就会自动出现。</div>';
}
async function openCard(vid, rel) {
  await openFile(vid, rel);
  const tab = S.tabs.find(x => x.vid === vid && x.rel === rel);
  if (tab && tab.kind === 'code') { tab.mode = 'pro'; activateTab(tab.id); }
}
function openCards() {
  focusVaultByName('角色卡库');
  let t = S.tabs.find(x => x.kind === 'cards');
  if (!t) { t = { id: 't' + (tabSeq++), vid: S.vid || '1', rel: ':cards', kind: 'cards', mode: 'preview', text: '', orig: '', results: null }; S.tabs.push(t); }
  activateTab(t.id);
}

/* ---- 二进制信息 ---- */
function viewBin(wrap, body, t) {
  const m = t.meta || {};
  const box = document.createElement('div');
  box.className = 'bin-view';
  box.innerHTML = `<div class="bin-card">
    <div class="big">${iconFor(base(t.rel))}</div>
    <h3>${esc(base(t.rel))}</h3>
    <div class="meta">${m.tooBig ? '文件过大，不支持在管理器里预览 · ' : ''}${fmtSize(m.size)}${m.mtime ? ' · ' + fmtTime(m.mtime) : ''}</div>
    <div class="row">
      <button class="vbtn" id="bin-sys">${IG.monitor} 用系统程序打开</button>
      <button class="vbtn" id="bin-reveal">${IG.external} 所在文件夹</button>
    </div></div>`;
  box.querySelector('#bin-sys').onclick = () => api('/api/openfile', { vid: t.vid, rel: t.rel }).catch(e => toast(e.message, 'err'));
  box.querySelector('#bin-reveal').onclick = () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(e => toast(e.message, 'err'));
  body.appendChild(box);
  wrap.appendChild(body);
}

/* ---- 搜索 ---- */
function viewSearch(wrap, body, t) {
  toolbar(wrap, [], []);
  const box = document.createElement('div');
  box.className = 'search-view';
  box.innerHTML = `<div class="search-bar">
      <input type="text" id="sq" placeholder="搜索当前文件夹里的文件名和内容…">
      <button class="vbtn" id="srun">${IG.search} 搜索</button>
    </div>
    <div class="search-hint">搜索范围：当前文件夹（${esc(curVault() ? curVault().name : '')}）· 跳过图片/压缩包/系统文件夹</div>
    <div id="sres"></div>`;
  body.appendChild(box);
  wrap.appendChild(body);
  const input = box.querySelector('#sq');
  const res = box.querySelector('#sres');
  input.value = t.q || '';
  const run = async () => {
    const q = input.value.trim();
    t.q = q;
    if (!q) { res.innerHTML = ''; return; }
    const v = curVault();
    if (!v) return;
    res.innerHTML = '<div class="search-empty">搜索中…</div>';
    try {
      const d = await api('/api/search', { vid: v.id, q });
      t.results = d.results;
      renderResults(res, d.results, q, v.id);
    } catch (e) { res.innerHTML = `<div class="search-empty">${esc(e.message)}</div>`; }
  };
  box.querySelector('#srun').onclick = run;
  input.onkeydown = e => { if (e.key === 'Enter') run(); };
  if (t.q && t.results) renderResults(res, t.results, t.q, curVault() ? curVault().id : '');
  input.focus();
}
function renderResults(res, results, q, vid) {
  if (!results.length) { res.innerHTML = '<div class="search-empty">没有找到匹配的内容</div>'; return; }
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  res.innerHTML = results.map((r, i) => `<div class="sr-file" data-i="${i}">
      <div class="sr-head">${iconFor(base(r.rel))}<b>${esc(base(r.rel))}</b>
        ${r.nameHit ? '<span class="badge">文件名</span>' : ''}${r.count ? `<span class="badge">${r.count} 处</span>` : ''}
        <span class="path">${esc(r.rel)}</span></div>
      ${r.snippets.map(s => `<div class="sr-snippet"><div class="sn"><span class="ln">L${s.line}</span>${esc(s.text).replace(rx, m => `<b>${esc(m)}</b>`)}</div></div>`).join('')}
    </div>`).join('');
  res.querySelectorAll('.sr-file').forEach(el => el.onclick = () => openFile(vid, results[+el.dataset.i].rel));
}
function openSearch() {
  const v = curVault();
  if (!v) { toast('先添加一个文件夹'); return; }
  let t = S.tabs.find(x => x.kind === 'search');
  if (!t) { t = { id: 't' + (tabSeq++), vid: v.id, rel: ':search', kind: 'search', q: '', results: null }; S.tabs.push(t); }
  else t.vid = v.id;
  activateTab(t.id);
}
$('#btnSearch').onclick = openSearch;
$('#btnCards').onclick = openCards;

/* 显示隐藏文件开关（服务端统一过滤，状态存 config.json） */
function updateHiddenBtn() {
  const b = $('#btnHidden');
  const eyeOpen = '<svg class="icn" viewBox="0 0 24 24"><path d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg class="icn" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-3.1 3.9M6.6 6.6C4.6 8 3 12 3 12s3 7 9 7a9.7 9.7 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  b.innerHTML = (S.showHidden ? eyeOpen : eyeOff) + ' 隐藏文件 · ' + (S.showHidden ? '开' : '关');
  b.classList.toggle('ghost', !S.showHidden);
}
$('#btnHidden').onclick = async () => {
  S.showHidden = !S.showHidden;
  try { await api('/api/settings', { showHidden: S.showHidden }); }
  catch (e) { toast(e.message, 'err'); }
  S.children.clear(); S.flat.clear();
  for (const t of S.tabs) { if (t.kind === 'cards' || t.kind === 'search') t.results = null; }
  updateHiddenBtn();
  renderTree();
  toast(S.showHidden ? '已显示隐藏文件' : '已隐藏隐藏文件', 'ok');
};

/* ================= 快速打开 (Ctrl+P) ================= */
async function quickOpen() {
  const v = curVault();
  if (!v) { toast('先添加一个文件夹'); return; }
  const m = openModal(`<h3>快速打开</h3><div class="m-body">
    <input type="text" class="qs-input" id="qs-in" placeholder="输入文件名，回车打开第一个…">
    <div class="qs-list" id="qs-list"></div></div>`);
  const input = m.querySelector('#qs-in');
  const list = m.querySelector('#qs-list');
  let files;
  try { files = (S.flat.get(v.id) || (S.flat.set(v.id, (await api(`/api/files?vid=${v.id}`)).files)).get(v.id)); }
  catch (e) { toast(e.message, 'err'); return; }
  let sel = 0, items = [];
  function fuzzy(q, rel) {
    const b = base(rel).toLowerCase(), ql = q.toLowerCase();
    if (b.startsWith(ql)) return 100 - rel.length / 1000;
    const i = b.indexOf(ql);
    if (i >= 0) return 60 - i;
    let bi = 0;
    for (const ch of ql) { bi = b.indexOf(ch, bi); if (bi < 0) return -1; bi++; }
    return 20;
  }
  function renderList() {
    const q = input.value.trim();
    items = !q ? files.slice(0, 30).map(f => ({ rel: f, s: 0 }))
      : files.map(f => ({ rel: f, s: fuzzy(q, f) })).filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s).slice(0, 30);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map((it, i) => `<div class="qs-item ${i === sel ? 'sel' : ''}" data-i="${i}">
      <span>${iconFor(base(it.rel))}</span><span class="qn">${esc(base(it.rel))}</span><span class="qp">${esc(dirOf(it.rel))}</span></div>`).join('')
      || '<div class="fb-empty">没有匹配的文件</div>';
    list.querySelectorAll('.qs-item').forEach(el => {
      el.onclick = () => { closeModal(); openFile(v.id, items[+el.dataset.i].rel); };
      el.onmousemove = () => { sel = +el.dataset.i; list.querySelectorAll('.qs-item').forEach((x, i) => x.classList.toggle('sel', i === sel)); };
    });
  }
  input.oninput = () => { sel = 0; renderList(); };
  input.onkeydown = e => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); renderList(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); renderList(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (items[sel]) { closeModal(); openFile(v.id, items[sel].rel); } }
    else if (e.key === 'Escape') closeModal();
  };
  renderList();
  input.focus();
}
$('#btnQuick').onclick = quickOpen;

/* ================= 状态栏 ================= */
function updateStatus() {
  const t = activeTab();
  const v = curVault();
  if (!t) { $('#stPath').textContent = v ? v.path : ''; $('#stInfo').textContent = ''; return; }
  if (t.kind === 'search') { $('#stPath').textContent = '搜索'; $('#stInfo').textContent = ''; return; }
  if (!t.vid) {
    /* 主题库 / 封面 这类虚拟标签 */
    $('#stPath').textContent = (window.__TL && window.__TL.root) || '';
    $('#stInfo').textContent = t.kind === 'themelib'
      ? ((window.__TL ? window.__TL.themes.length : 0) + ' 个主题')
      : (t.kind === 'covers' ? ((window.__TL ? window.__TL.covers.length : 0) + ' 张封面') : '');
    return;
  }
  $('#stPath').textContent = (v ? v.path + '\\' : '') + t.rel.replace(/\//g, '\\');
  const dirty = (t.kind === 'md' || t.kind === 'code' || t.kind === 'html' || t.kind === 'jsonl') && t.text !== t.orig;
  const bits = [];
  if (t.meta && t.meta.size != null) bits.push(fmtSize(t.meta.size));
  if (t.meta && t.meta.mtime) bits.push(fmtTime(t.meta.mtime));
  if (dirty) bits.push('● 未保存');
  $('#stInfo').textContent = bits.join(' · ');
}

/* ================= SSE：外部改动同步 =================
 * 限流 + 精准刷新：只重取受影响且已展开的目录，名称没变就不重建树（防止整盘库的事件让树一直闪） */
function sameTreeEntries(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!b[i] || a[i].name !== b[i].name || a[i].dir !== b[i].dir) return false;
  }
  return true;
}
function connectEvents() {
  const es = new EventSource('/api/events');
  const buckets = new Map(); // vid -> Set(变更路径)
  let flushTimer = null;
  let tabTimer = null;
  const tabReloads = new Set();
  es.onmessage = ev => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (!d.vid) return;
    let b = buckets.get(d.vid);
    if (!b) buckets.set(d.vid, b = new Set());
    for (const x of (d.dirs || [])) b.add(x);
    if (!flushTimer) flushTimer = setTimeout(flushEvents, 1000);
    for (const t of S.tabs) {
      if (t.vid !== d.vid || t.kind === 'search' || t.kind === 'cards') continue;
      if ((t.kind === 'md' || t.kind === 'code' || t.kind === 'html' || t.kind === 'jsonl') && t.text !== t.orig) continue; // 有未保存改动不打扰
      tabReloads.add(t);
    }
    if (tabReloads.size && !tabTimer) tabTimer = setTimeout(flushTabs, 1500);
  };
  async function flushEvents() {
    flushTimer = null;
    for (const [vid, dirs] of buckets) {
      // 受影响的已展开目录 = 变更路径的祖先链里已展开的那些（含根）；fs.watch 路径是反斜杠，先统一
      const affected = new Set(['']);
      for (const rel of dirs) {
        const parts = String(rel).replace(/\\/g, '/').split('/');
        for (let i = 1; i < parts.length; i++) {
          const dir = parts.slice(0, i).join('/');
          if (S.expanded.has(childrenKey(vid, dir))) affected.add(dir);
        }
      }
      const oldSnap = new Map();
      for (const dir of affected) oldSnap.set(dir, S.children.get(childrenKey(vid, dir)));
      invalidateVault(vid);
      if (vid !== S.vid) continue;
      let changed = false;
      for (const dir of affected) {
        const k = childrenKey(vid, dir);
        let newEntries;
        try { newEntries = (await api(`/api/ls?vid=${vid}&rel=${encodeURIComponent(dir)}`)).entries; }
        catch { continue; }
        S.children.set(k, newEntries);
        if (!sameTreeEntries(oldSnap.get(dir), newEntries)) changed = true;
      }
      if (changed) renderTree();
    }
    buckets.clear();
  }
  async function flushTabs() {
    tabTimer = null;
    const list = [...tabReloads];
    tabReloads.clear();
    let touchedView = false;
    for (const t of list) {
      if (!S.tabs.includes(t)) continue;
      if (t.kind === 'zip') { delete t.zipData; if (t.id === S.activeId) touchedView = true; continue; }
      if (t.kind === 'md' || t.kind === 'code' || t.kind === 'html' || t.kind === 'jsonl') {
        try {
          const nd = await api(`/api/read?vid=${t.vid}&rel=${encodeURIComponent(t.rel)}`);
          if (nd.binary || nd.tooBig) continue;
          t.text = nd.text; t.orig = nd.text; t.meta = { size: nd.size, mtime: nd.mtime };
          if (t.kind === 'jsonl') t._lines = null;
          if (t.id === S.activeId) touchedView = true; else renderTabs();
        } catch {}
      }
    }
    if (touchedView) renderView();
  }
}

/* ================= 全局快捷键 ================= */
document.addEventListener('keydown', e => {
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveActive(); }
  else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); quickOpen(); }
  else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); }
  else if (e.altKey && e.key.toLowerCase() === 'w') { e.preventDefault(); if (S.activeId) closeTab(S.activeId); }
  else if (e.key === 'F2') {
    const sel = document.querySelector('#tree .tree-item.sel');
    if (sel) {
      e.preventDefault();
      const vid = sel.dataset.vid, rel = sel.dataset.rel;
      if (rel === '') renameVault(vid, curVault() ? curVault().name : '');
      else renameEntry(vid, rel, base(rel), sel.dataset.dir === '1');
    }
  }
  else if (e.key === 'Delete') {
    const sel = document.querySelector('#tree .tree-item.sel');
    if (sel && !e.target.closest('input,textarea')) {
      e.preventDefault();
      if (sel.dataset.rel === '') { toast('要移除整个文件夹，请右键它 → 从管理器移除（不会删文件）'); return; }
      deleteEntry(sel.dataset.vid, sel.dataset.rel, base(sel.dataset.rel), sel.dataset.dir === '1');
    }
  }
  else if (e.key === 'Escape') { hideCtx(); }
});

/* ================= 启动 ================= */
(async function init() {
  marked.use({ gfm: true, breaks: true });
  try {
    await loadVaults();
    S.showHidden = (await api('/api/settings')).showHidden;
  } catch (e) { toast('无法连接服务：' + e.message, 'err'); }
  updateHiddenBtn();
  renderTree();
  renderView();
  connectEvents();
  loadFavorites();
  initThemeRow();
  /* 发布状态后台预取，回来后刷新文件树（给 .thm 加上架圆点） */
  loadPubStatus().then(() => { try { renderTree(); } catch (e) {} }).catch(() => {});
})();

/* ================= 主题库 / 封面（Tavo .thm） ================= */
const TL = { root: '', coverView: '手机916', themes: [], covers: [], loaded: false, mode: 'grid', sel: new Set() };
window.__TL = TL;

async function loadThemeLib(force) {
  if (TL.loaded && !force) return TL;
  const d = await api('/api/themes');
  TL.root = d.root || '';
  TL.themes = d.themes || [];
  TL.covers = d.covers || [];
  TL.loaded = true;
  return TL;
}
const coverUrl = rel => '/api/coverimg?rel=' + encodeURIComponent(rel);

/* 让左侧文件树跟着当前视图切换（主题库/封面 → 主题库目录；卡库 → 角色卡库） */
function focusVaultByName(name) {
  const v = S.vaults.find(x => x.name === name);
  if (!v) return false;
  if (S.vid !== v.id) {
    S.vid = v.id;
    const sel = $('#vaultSel');
    if (sel) sel.value = v.id;
    renderTree();
  }
  return true;
}
function openLibTab(kind) {
  focusVaultByName('Tavo主题上架');
  const exist = S.tabs.find(t => t.kind === kind);
  if (exist) return activateTab(exist.id);
  const tab = { id: 't' + (tabSeq++), vid: null, rel: kind === 'covers' ? '封面' : '主题库', kind, mode: 'preview', text: '', orig: '', meta: {} };
  S.tabs.push(tab);
  activateTab(tab.id);
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('读取文件失败'));
    fr.readAsDataURL(file);
  });
}
function openThemePreview(it) {
  const exist = S.tabs.find(t => t.kind === 'thmpv' && t.rel === it.rel);
  if (exist) { exist.meta.theme = it; return activateTab(exist.id); }
  const tab = { id: 't' + (tabSeq++), vid: null, rel: it.rel, kind: 'thmpv', mode: 'preview', text: '', orig: '', meta: { theme: it } };
  S.tabs.push(tab);
  activateTab(tab.id);
}

/* ---------- 主题库视图 ---------- */
function viewThemes(wrap, body, t) {
  toolbar(wrap, [
    vbtn(IG.refresh + ' 刷新', async () => { TL.loaded = false; await loadThemeLib(true); renderView(); }),
    vbtn(TL.mode === 'grid' ? (IG.list + ' 列表') : (IG.grid + ' 网格'), () => { TL.mode = TL.mode === 'grid' ? 'list' : 'grid'; renderView(); }),
    vbtn(IG.camera + ' 批量截图（覆盖封面）', () => openBatchShotModal()),
  ], [
    vbtn(IG.external + ' 打开主题库文件夹', () => api('/api/openpath', { path: TL.root }).catch(() => {})),
  ]);
  wrap.appendChild(body);
  body.style.overflow = 'auto';
  body.innerHTML = '<div class="search-empty">正在扫描主题库…</div>';

  body.ondragover = e => { e.preventDefault(); };
  body.ondrop = async e => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.toLowerCase().endsWith('.thm'));
    if (!files.length) { toast('只接收 .thm 文件', 'err'); return; }
    let ok = 0;
    for (const f of files) {
      try { await api('/api/themeimport', { name: f.name, data: await fileToBase64(f) }); ok++; }
      catch (err) { toast(f.name + ' 入库失败：' + err.message, 'err'); }
    }
    if (ok) { TL.loaded = false; toast('已入库 ' + ok + ' 个主题', 'ok'); renderView(); }
  };

  loadThemeLib().then(() => {
    if (activeTab() !== t) return;
    body.innerHTML = '';
    const hint = document.createElement('div');
    hint.style.cssText = 'color:#7d8492;font-size:12px;margin:0 2px 10px';
    hint.textContent = TL.themes.length + ' 个主题 · ' + TL.covers.length + ' 张封面 · 可直接把 .thm 文件拖进这里入库';
    body.appendChild(hint);
    loadPubStatus().then(() => {
      if (activeTab() !== t) return;
      const grid = document.createElement('div');
      grid.className = TL.mode === 'grid' ? 'theme-grid' : 'theme-list';
      for (const it of TL.themes) {
        const card = document.createElement('div');
        card.className = 'theme-card';
        card.innerHTML = `<div class="tc-cover">${it.cover ? `<img loading="lazy" src="${coverUrl(it.cover.rel)}" alt="">` : '<span class="tc-no">无封面</span>'}</div>
          <div class="tc-meta"><div class="tc-name" title="${esc(it.name)}">${esc(it.name)}${pubBadge(it.name)}</div>
          <div class="tc-sub" title="${esc(it.rel)}">${esc(it.series || '根目录')}</div></div>`;
        card.onclick = () => openThemePreview(it);
        grid.appendChild(card);
      }
      body.appendChild(grid);
      updateStatus();
    });
  }).catch(e => { body.innerHTML = `<div class="search-empty">${esc(e.message)}</div>`; });
}

/* ---------- 封面视图（只列主题库里的封面） ---------- */
function viewCovers(wrap, body, t) {
  toolbar(wrap, [
    vbtn(IG.refresh + ' 刷新', async () => { TL.loaded = false; await loadThemeLib(true); renderView(); }),
  ], [
    vbtn(IG.palette + ' 去主题库', () => openLibTab('themelib')),
  ]);
  wrap.appendChild(body);
  body.style.overflow = 'auto';
  body.innerHTML = '<div class="search-empty">正在读取封面…</div>';
  loadThemeLib().then(() => {
    if (activeTab() !== t) return;
    body.innerHTML = '';
    const hint = document.createElement('div');
    hint.style.cssText = 'color:#7d8492;font-size:12px;margin:0 2px 10px';
    hint.textContent = TL.covers.length + ' 张封面（点开可看主题 + 封面双视窗）';
    body.appendChild(hint);
    const grid = document.createElement('div');
    grid.className = 'theme-grid';
    for (const cv of TL.covers) {
      const card = document.createElement('div');
      card.className = 'theme-card';
      card.innerHTML = `<div class="tc-cover"><img loading="lazy" src="${coverUrl(cv.rel)}" alt=""></div>
        <div class="tc-meta"><div class="tc-name" title="${esc(cv.name)}">${esc(cv.themeName)}</div>
        <div class="tc-sub" title="${esc(cv.rel)}">${esc(cv.name)}</div></div>`;
      card.onclick = () => {
        const it = TL.themes.find(x => x.rel === cv.themeRel);
        if (it) openThemePreview(it); else toast('找不到对应主题', 'err');
      };
      grid.appendChild(card);
    }
    body.appendChild(grid);
    updateStatus();
  }).catch(e => { body.innerHTML = `<div class="search-empty">${esc(e.message)}</div>`; });
}

/* ---------- 双视窗：左主题预览 / 右封面 ---------- */
function viewThmPreview(wrap, body, t) {
  const it = t.meta.theme;
  toolbar(wrap, [
    vbtn(IG.palette + ' 主题库', () => openLibTab('themelib')),
    vbtn(t.meta.coverOff ? (IG.image + ' 显示封面') : (IG.imageOff + ' 隐藏封面'), () => { t.meta.coverOff = !t.meta.coverOff; renderView(); }),
  ], [
    vbtn(IG.camera + ' 截图并保存封面', () => shotAndSave(t)),
  ]);
  wrap.appendChild(body);
  body.style.overflow = 'hidden';
  const split = document.createElement('div');
  split.className = 'thm-split' + (t.meta.coverOff ? ' single' : '');
  const left = document.createElement('div'); left.className = 'thm-left';
  const right = document.createElement('div'); right.className = 'thm-right';
  split.appendChild(left); split.appendChild(right);
  body.appendChild(split);

  const f = document.createElement('iframe');
  f.className = 'html-frame';
  f.src = '/thm/?embed=1';
  f.addEventListener('load', async () => {
    try {
      const r = await fetch('/api/themefile?rel=' + encodeURIComponent(it.rel));
      const u8 = new Uint8Array(await r.arrayBuffer());
      await f.contentWindow.__thmHost.load(u8, it.fileName || (it.name + '.thm'));
    } catch (e) { toast('载入主题失败：' + e.message, 'err'); }
  });
  left.appendChild(f);

  const cv = it.cover;
  right.innerHTML = `
    <div class="cv-head"><b>${esc(it.name)}</b><span class="muted">${esc(it.series || '根目录')}</span></div>
    <div class="cv-box">${cv ? `<img src="${coverUrl(cv.rel)}" alt="">` : '<div class="muted" style="padding:20px;font-size:12px">该主题还没有封面</div>'}</div>
    <div class="cv-info">封面文件：${cv ? esc(cv.name) : '—'}<br>主题文件：${esc(it.fileName || '')}<br>截图会覆盖同名封面（一主题一张）</div>`;
  updateStatus();
}

async function getHostFrame() {
  let f = document.getElementById('__thmhost');
  if (!f) {
    f = document.createElement('iframe');
    f.id = '__thmhost';
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1200px;height:900px;visibility:hidden';
    f.src = '/thm/?embed=1';
    document.body.appendChild(f);
    await new Promise(res => f.addEventListener('load', res, { once: true }));
    await new Promise(res => setTimeout(res, 600));
  }
  return f;
}

async function shotAndSave(t) {
  const it = t.meta.theme;
  const f = document.querySelector('#view iframe');
  const host = f && f.contentWindow && f.contentWindow.__thmHost;
  if (!host) { toast('预览器还没就绪', 'err'); return; }
  try {
    const shot = await host.shot(TL.device || 'm916');
    const saved = await api('/api/savecover', { themeRel: it.rel, view: shot.label, data: String(shot.dataUrl).split(',')[1] });
    it.cover = { rel: saved.rel, name: saved.name };
    TL.loaded = false;
    toast('封面已保存：' + saved.name, 'ok');
    renderView();
  } catch (e) { toast('截图失败：' + e.message, 'err'); }
}

function openBatchShotModal() {
  const picked = TL.themes.filter(x => TL.sel.has(x.rel));
  const targets = picked.length ? picked : TL.themes;
  const m = openModal(`<h3>批量截图（覆盖封面）</h3>
    <div class="m-body">
      <div style="font-size:12.5px;line-height:1.7">将对 <b>${targets.length}</b> 个主题截图${picked.length ? '（已勾选的）' : '（全部，可在主题库按住 Ctrl 点选）'}，并写入同名封面。</div>
      <div style="margin:12px 0"><label style="font-size:12.5px">设备：
        <select id="bsDev" style="margin-left:6px">
          <option value="m916">手机916</option>
          <option value="mfull">手机全面屏</option>
          <option value="pc">电脑（当前宽度）</option>
        </select></label></div>
      <div class="batch-bar"><i id="bsBar"></i></div>
      <div id="bsMsg" style="color:#7d8492;font-size:12px;min-height:18px"></div>
    </div>
    <div class="m-foot"><button class="m-btn" id="bsCancel">取消</button><button class="m-btn primary" id="bsGo">开始</button></div>`);
  m.querySelector('#bsCancel').onclick = closeModal;
  m.querySelector('#bsGo').onclick = async () => {
    const dev = m.querySelector('#bsDev').value;
    const go = m.querySelector('#bsGo'), cancel = m.querySelector('#bsCancel');
    go.disabled = true; cancel.disabled = true;
    const bar = m.querySelector('#bsBar'), msg = m.querySelector('#bsMsg');
    let ok = 0, fail = 0;
    try {
      const host = await getHostFrame();
      for (let i = 0; i < targets.length; i++) {
        const it = targets[i];
        msg.textContent = `第 ${i + 1}/${targets.length} 个：${it.name}`;
        try {
          const r = await fetch('/api/themefile?rel=' + encodeURIComponent(it.rel));
          const u8 = new Uint8Array(await r.arrayBuffer());
          await host.contentWindow.__thmHost.load(u8, it.fileName || (it.name + '.thm'));
          await new Promise(res => setTimeout(res, 400));
          const shot = await host.contentWindow.__thmHost.shot(dev);
          const saved = await api('/api/savecover', { themeRel: it.rel, view: shot.label, data: String(shot.dataUrl).split(',')[1] });
          it.cover = { rel: saved.rel, name: saved.name };
          ok++;
        } catch (e) { fail++; console.warn('batch shot failed', it.rel, e); }
        bar.style.width = Math.round((i + 1) / targets.length * 100) + '%';
      }
      msg.textContent = `完成：成功 ${ok}，失败 ${fail}`;
      TL.loaded = false;
      toast(`批量截图完成：${ok} 成功 / ${fail} 失败`, fail ? 'err' : 'ok');
      renderView();
    } catch (e) {
      msg.textContent = '出错：' + e.message;
    } finally {
      go.disabled = false; cancel.disabled = false;
      const c = m.querySelector('#bsCancel'); if (c) c.textContent = '关闭';
    }
  };
}

/* 侧栏入口 */
$('#btnThemes').onclick = () => openLibTab('themelib');
$('#btnCovers').onclick = () => openLibTab('covers');

/* ================= RB 整卡（md）================= */
const RB_DIR_REL = 'md/RB';
let rbAutoTimer = null;

function stopRbAuto() { if (rbAutoTimer) { clearInterval(rbAutoTimer); rbAutoTimer = null; } }

function rbVault() { return S.vaults.find(v => v.name === '角色卡库') || null; }

async function newRbCard() {
  const v = rbVault();
  if (!v) { toast('找不到「角色卡库」库', 'err'); return; }
  const name = prompt('新 RB 角色卡名称（文件名）：', '未命名角色');
  if (!name) return;
  const safe = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!safe) return;
  const rel = RB_DIR_REL + '/' + safe + '.md';
  const body = '<!-- LIN-RB-CARD v1 -->\n\n# ▍角色\n\n# 角色卡——' + safe + '\n\n# ▍样式\n\n# ▍时刻\n\n# ▍开场\n\n# ▍简介\n\n<!-- /LIN-RB-CARD -->\n';
  try {
    await api('/api/write', { vid: v.id, rel, content: body });
    await openFile(v.id, rel);
    toast('已新建：' + safe + '.md', 'ok');
  } catch (e) { toast('新建失败：' + e.message, 'err'); }
}

async function saveRbNow(t, silent) {
  const f = document.querySelector('#view iframe');
  const w = f && f.contentWindow;
  if (!w || !w.__lwpRb) { toast('编辑器未就绪', 'err'); return false; }
  try {
    const md = w.__lwpRb.exportMd();
    if (!md) return false;
    if (md === t.orig) { if (!silent) toast('没有变化'); await syncRbName(t, w); return true; }
    await api('/api/write', { vid: t.vid, rel: t.rel, content: md });
    t.text = md; t.orig = md;
    await syncRbName(t, w);
    if (!silent) toast('已保存', 'ok');
    return true;
  } catch (e) { toast('保存失败：' + e.message, 'err'); return false; }
}

/* RB md 命名法：角色卡姓名-时刻名（时刻名 = 时刻简介主标题全部段拼接） */
async function syncRbName(t, w) {
  try {
    if (!w.__lwpRb || typeof w.__lwpRb.fileName !== 'function') return;
    const base = String(w.__lwpRb.fileName() || '').trim();
    if (!base) return;
    const cur = String(t.rel).split('/').pop().replace(/\.md$/i, '');
    if (cur === base) return;
    const dir = String(t.rel).replace(/\/[^/]*$/, '');
    const name = base + '.md';
    await api('/api/rename', { vid: t.vid, rel: t.rel, name });
    t.rel = (dir && dir !== t.rel ? dir + '/' : '') + name;
    renderTabs();
    const info = $('#stInfo');
    if (info) info.textContent = '已按规范重命名：' + name;
  } catch (e) { /* 同名占用等情况静默跳过 */ }
}

function startRbAuto(t, w) {
  stopRbAuto(); stopProAuto();
  let last = t.orig;
  rbAutoTimer = setInterval(async () => {
    try {
      if (activeTab() !== t) { stopRbAuto(); return; }
      if (!w.__lwpRb) return;
      const md = w.__lwpRb.exportMd();
      if (!md) return;
      if (md !== last) {
        last = md; t.text = md;
        await api('/api/write', { vid: t.vid, rel: t.rel, content: md });
        t.orig = md;
        const info = $('#stInfo');
        if (info) info.textContent = '已自动保存 ' + new Date().toLocaleTimeString();
      }
      await syncRbName(t, w);
    } catch (e) { /* 静默重试 */ }
  }, 1800);
}

function viewRbCard(wrap, body, t) {
  toolbar(wrap, [
    vbtn(IG.save + ' 立即保存', () => saveRbNow(t)),
    vbtn(IG.external + ' 所在文件夹', () => api('/api/openfile', { vid: t.vid, rel: t.rel, reveal: true }).catch(() => {})),
  ], [
    vbtn(IG.save + ' 手动保存', () => {}, true),
  ]);
  wrap.appendChild(body);
  body.style.overflow = 'hidden';
  const f = document.createElement('iframe');
  f.className = 'html-frame';
  f.src = '/lwp/?embed=1&rb=1';
  f.addEventListener('load', async () => {
    try {
      const w = f.contentWindow;
      const seg = w.document.getElementById('modeSegRb');
      if (seg) seg.click();
      await new Promise(r => setTimeout(r, 400));
      if (!w.__lwpRb) { toast('LWP 版本不支持 RB 整卡（需 0.3.0e+）', 'err'); return; }
      w.__lwpRb.importMd(t.text);
      /* 自动保存已关闭（仅手动保存） */
    } catch (e) { toast('RB 卡载入失败：' + e.message, 'err'); }
  });
  body.appendChild(f);
  updateStatus();
}

/* ================= Pro 模式（Tavo json 卡）自动保存 ================= */
let proAutoTimer = null;
function stopProAuto() { if (proAutoTimer) { clearInterval(proAutoTimer); proAutoTimer = null; } }

function mergeCardFields(text, fields) {
  let orig;
  try { orig = JSON.parse(text); } catch (e) { return null; }
  if (!orig || typeof orig !== 'object') return null;
  const d = (orig.data && typeof orig.data === 'object') ? orig.data : orig;
  let merged = 0;
  for (const k of Object.keys(d)) {
    if (k in fields && (typeof fields[k] === 'string' || Array.isArray(fields[k]))) {
      if (JSON.stringify(d[k]) !== JSON.stringify(fields[k])) { d[k] = fields[k]; merged++; }
    }
  }
  return merged ? { json: JSON.stringify(orig, null, 2), merged } : { json: null, merged: 0 };
}

function startProAuto(t, w) {
  stopProAuto();
  proAutoTimer = setInterval(async () => {
    try {
      if (activeTab() !== t) { stopProAuto(); return; }
      const apiObj = w.__tavoAPI && w.__tavoAPI.get && w.__tavoAPI.get();
      if (!apiObj) return;
      const res = mergeCardFields(t.orig || t.text, apiObj.cardFields || {});
      if (!res || !res.json) return;
      await api('/api/write', { vid: t.vid, rel: t.rel, content: res.json });
      t.text = res.json; t.orig = res.json;
      const info = $('#stInfo');
      if (info) info.textContent = '已自动保存 ' + new Date().toLocaleTimeString() + '（' + res.merged + ' 字段）';
    } catch (e) { /* 静默重试 */ }
  }, 2200);
}

/* ================= 新建 Tavo 卡 / 世界书 ================= */
function safeFileName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').replace(/[.\s]+$/g, '').trim();
}

async function fileExists(vid, rel) {
  try { await api(`/api/read?vid=${vid}&rel=${encodeURIComponent(rel)}`); return true; }
  catch (e) { return false; }
}

async function newTavoCard() {
  const v = rbVault();
  if (!v) { toast('找不到「角色卡库」库', 'err'); return; }
  const name = prompt('新 Tavo 角色卡名称（文件名）：', '未命名角色');
  if (!name) return;
  const safe = safeFileName(name);
  if (!safe) return;
  const rel = 'json库/' + safe + '.json';
  if (await fileExists(v.id, rel)) { toast('同名卡已存在：' + safe, 'err'); return; }
  const card = {
    spec: 'chara_card_v2', spec_version: '2.0',
    data: {
      name: safe, description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
      creator_notes: '', system_prompt: '', post_history_instructions: '',
      alternate_greetings: [], tags: [], creator: 'Lin', character_version: '', extensions: {}
    }
  };
  try {
    await api('/api/write', { vid: v.id, rel, content: JSON.stringify(card, null, 2) });
    await openCard(v.id, rel);
    toast('已新建 Tavo 卡：' + safe + '.json', 'ok');
  } catch (e) { toast('新建失败：' + e.message, 'err'); }
}

async function newWorldbook() {
  const v = rbVault();
  if (!v) { toast('找不到「角色卡库」库', 'err'); return; }
  const name = prompt('新世界书名称（文件名）：', '未命名世界书');
  if (!name) return;
  const safe = safeFileName(name);
  if (!safe) return;
  const rel = 'json库/' + safe + '.json';
  if (await fileExists(v.id, rel)) { toast('同名世界书已存在：' + safe, 'err'); return; }
  const wb = {
    entries: {
      '0': {
        uid: 0, key: [], keysecondary: [], comment: safe + ' · 示例条目',
        content: '', constant: false, selective: true, order: 100,
        position: 0, disable: false, depth: 4, probability: 100, useProbability: true
      }
    }
  };
  try {
    await api('/api/write', { vid: v.id, rel, content: JSON.stringify(wb, null, 2) });
    await openCard(v.id, rel);
    toast('已新建世界书：' + safe + '.json', 'ok');
  } catch (e) { toast('新建失败：' + e.message, 'err'); }
}

/* ================= iframe 加载完成后再显示（防白闪） ================= */
document.addEventListener('load', function (e) {
  var el = e.target;
  if (el && el.tagName === 'IFRAME' && el.classList && el.classList.contains('html-frame')) {
    el.classList.add('frame-shown');
  }
}, true);

/* ================= 在线库（Lin Hub 内嵌） ================= */
function openOnlineLib() {
  let t = S.tabs.find(x => x.kind === 'onlinelib');
  if (!t) { t = { id: 't' + (tabSeq++), vid: null, rel: ':onlinelib', kind: 'onlinelib', mode: 'preview', text: '', orig: '', meta: {} }; S.tabs.push(t); }
  activateTab(t.id);
}
function viewOnlineLib(wrap, body, t) {
  toolbar(wrap, [
    vbtn(IG.refresh + ' 重新加载', () => renderView()),
    vbtn(IG.globe + ' 独立窗口打开', () => api('/api/openpath', { path: 'http://localhost:8791/' }).catch(() => {})),
  ], [
    vbtn(IG.bulb + ' 账号切换在右上角', () => {}, true),
  ]);
  wrap.appendChild(body);
  body.style.overflow = 'hidden';
  body.innerHTML = '<div class="search-empty">正在连接 Lin Hub（localhost:8791）…</div>';
  /* 服务端代理探测 Lin Hub 是否在运行（页面跨端口无法直接 fetch） */
  api('/api/hubping').then(r => {
    if (activeTab() !== t) return;
    if (!r.ok) {
      body.innerHTML = `<div class="search-empty">Lin Hub 没有在运行。<br><br><button class="vbtn primary" id="btnStartHub" style="font-size:13px;padding:8px 22px">${IG.rocket} 一键启动 Lin Hub</button><br><br><span class="muted">启动后此页会自动连上（账号切换在右上角）</span></div>`;
      const sb = document.getElementById('btnStartHub');
      if (sb) sb.onclick = () => startHubFromUI();
      return;
    }
    body.innerHTML = '';
    const f = document.createElement('iframe');
    f.className = 'html-frame frame-shown';
    f.src = 'http://localhost:8791/?embed=1&t=' + Date.now();
    body.appendChild(f);
  }).catch(e => { body.innerHTML = `<div class="search-empty">探测失败：${esc(e.message)}</div>`; });
  updateStatus();
}

/* 侧栏入口 */
$('#btnOnline').onclick = openOnlineLib;

/* ================= 发布状态徽标 + .bak 历史版本 ================= */
const PUB = { loaded: false, ok: false, themes: null };
async function loadPubStatus(force) {
  if (PUB.loaded && !force) return PUB;
  try {
    const r = await api('/api/pubstatus');
    PUB.ok = !!r.ok;
    PUB.themes = r.themes || {};
    PUB.loaded = true;
  } catch (e) { PUB.ok = false; }
  return PUB;
}
function themeBaseName(name) {
  return String(name || '').replace(/\.thm$/i, '').replace(/-(变色修复|按钮修复|修复版)$/u, '');
}
function pubBadge(name) {
  if (!PUB.ok || !PUB.themes) return '';
  const h = PUB.themes[themeBaseName(name)];
  if (!h) return '<span class="pub-badge st-none">未上架</span>';
  const v = esc(String(h.published || '').replace(/^v/i, ''));
  if (h.published && h.published === h.latest) return `<span class="pub-badge st-ok" title="已上架且已同步">v${v}</span>`;
  if (h.published) return `<span class="pub-badge st-warn" title="有新版本未发布（最新 v${esc(String(h.latest).replace(/^v/i, ''))}）">待发布</span>`;
  return '<span class="pub-badge st-none">未发布</span>';
}
function pubDot(name) {
  if (!PUB.ok || !PUB.themes) return '';
  const h = PUB.themes[themeBaseName(name)];
  if (!h) return '';
  if (h.published && h.published === h.latest) return '<span class="pub-dot st-ok" title="已上架 v' + esc(String(h.published).replace(/^v/i, '')) + '"></span>';
  if (h.published) return '<span class="pub-dot st-warn" title="有新版本未发布"></span>';
  return '';
}
/* 文件树 .thm 行加圆点：包一层 renderTree，等发布状态就绪后补一次刷新 */
(function () {
  const orig = renderTree;
  renderTree = function (...args) {
    const r = orig.apply(this, args);
    if (PUB.loaded && typeof orig === 'function') {
      /* 给 .thm 文件行补圆点（原渲染不含，等树构建完成后追加） */
      setTimeout(() => {
        document.querySelectorAll('#tree .tree-item[data-dir="0"]').forEach(el => {
          const rel = el.dataset.rel || '';
          if (!/\.thm$/i.test(rel) || el.querySelector('.pub-dot')) return;
          const dot = pubDot(rel.split('/').pop());
          if (dot) {
            const tn = el.querySelector('.tname');
            if (tn) tn.insertAdjacentHTML('afterend', dot);
          }
        });
      }, 350);
    }
    return r;
  };
})();

/* ---------- .bak 历史版本 ---------- */
async function showBakHistory(vid, rel) {
  let d;
  try { d = await api(`/api/baklist?vid=${vid}&rel=${encodeURIComponent(rel)}`); }
  catch (e) { toast('读取备份失败: ' + e.message, 'err'); return; }
  const rows = d.items || [];
  const m = openModal(`<h3>${IG.clock} 历史版本 · ${esc(base(rel))}</h3>
    <div class="m-body" id="bakBox">
      ${rows.length ? rows.map(r => `
        <div class="bak-row" data-ts="${esc(r.ts)}">
          <span class="bak-time">${esc(r.time)}</span>
          <span class="bak-size">${fmtSize(r.size)}</span>
          <button class="m-btn" data-act="view">预览</button>
          <button class="m-btn primary" data-act="restore">还原</button>
          <pre class="bak-preview hidden"></pre>
        </div>`).join('') : '<div class="muted" style="padding:12px">还没有备份 —— 文件被覆盖保存时才会自动产生。</div>'}
    </div>
    <div class="m-foot"><button class="m-btn" onclick="closeModal()">关闭</button></div>`);
  m.querySelectorAll('.bak-row').forEach(row => {
    const ts = row.dataset.ts;
    const pre = row.querySelector('.bak-preview');
    row.querySelector('[data-act=view]').onclick = async () => {
      if (!pre.classList.contains('hidden')) { pre.classList.add('hidden'); return; }
      try {
        const c = await api(`/api/bakcontent?vid=${vid}&rel=${encodeURIComponent(rel)}&ts=${encodeURIComponent(ts)}`);
        pre.textContent = c.binary ? '（二进制文件，无法预览，可还原）' : (c.text || '（空）').slice(0, 4000);
        pre.classList.remove('hidden');
      } catch (e) { pre.textContent = '读取失败: ' + e.message; pre.classList.remove('hidden'); }
    };
    row.querySelector('[data-act=restore]').onclick = async () => {
      if (!confirm('还原到 ' + row.querySelector('.bak-time').textContent + ' ？\n当前内容会先自动备份一份。')) return;
      try {
        await api('/api/bakrestore', { vid, rel, ts });
        toast('已还原', 'ok');
        closeModal();
        /* 若该文件标签开着，强制重新加载 */
        const t = S.tabs.find(x => x.vid === vid && x.rel === rel);
        if (t) { closeTab(t.id); openFile(vid, rel); }
        invalidateVault(vid); renderTree();
      } catch (e) { toast('还原失败: ' + e.message, 'err'); }
    };
  });
}

/* 右键菜单挂入口：文件树 + 标签页 */
(function () {
  const origFileCtx = fileCtx;
  fileCtx = function (e, vid, rel) {
    const name = base(rel);
    const items = [
      { icon: IG.pencil, label: '重命名', fn: () => renameEntry(vid, rel, name, false) },
      { icon: IG.clipboard, label: '复制名称', fn: () => copyText(name, '名称') },
      { icon: IG.paperclip, label: '复制完整路径', fn: () => copyText(absPath(vid, rel)) },
      { icon: IG.clock, label: '历史版本 (.bak)', fn: () => showBakHistory(vid, rel) },
      { icon: IG.pin, label: isFav(vid, rel) ? '取消收藏' : '收藏置顶', fn: () => toggleFav(vid, rel) },
      'sep',
      { icon: IG.external, label: '在资源管理器中显示', fn: () => api('/api/openfile', { vid, rel, reveal: true }).catch(x => toast(x.message, 'err')) },
      { icon: IG.monitor, label: '用系统程序打开', fn: () => api('/api/openfile', { vid, rel }).catch(x => toast(x.message, 'err')) },
      'sep',
      { icon: IG.trash, label: '删除', danger: true, fn: () => deleteEntry(vid, rel, name, false) },
    ];
    if (kindOf(name) === 'zip') items.unshift({ icon: IG.box, label: '解压到同名文件夹', fn: () => extractZip(vid, rel) });
    showCtx(e.clientX, e.clientY, items);
  };
})();

/* ================= 外部文件拖入 / 收藏 / 启动联动 ================= */
async function fileToBase64File(file) { return fileToBase64(file); }

/* 外部文件落库：角色卡库根目录按扩展名自动归位，其余落到目标文件夹 */
function routeDropRel(vaultName, dirRel, fileName) {
  const ext = ext(fileName);
  if (vaultName === '角色卡库' && !dirRel) {
    if (ext === 'json') return 'json库/' + fileName;
    if (ext === 'jsonl') return 'jsonl库/' + fileName;
    if (ext === 'md') return 'md/' + fileName;
    if (ext === 'txt') return 'txt/' + fileName;
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return '头像图片/' + fileName;
  }
  return dirRel ? dirRel + '/' + fileName : fileName;
}
async function saveDroppedFiles(files, vid, dirRel) {
  const v = vaultById(vid);
  if (!v) { toast('找不到目标库', 'err'); return; }
  let ok = 0; const errs = [];
  for (const f of files) {
    const rel = routeDropRel(v.name, dirRel, f.name);
    try {
      const data = await fileToBase64(f);
      await api('/api/writebin', { vid, rel, data });
      ok++;
    } catch (e) { errs.push(f.name + '：' + e.message); }
  }
  if (ok) {
    invalidateVault(vid);
    S.expanded.add(childrenKey(vid, dirOf(routeDropRel(v.name, dirRel, 'x'))));
    renderTree();
    toast('已收入 ' + ok + ' 个文件', 'ok');
  }
  if (errs.length) toast(errs.join('\n'), 'err');
}

/* ---------- 收藏（置顶） ---------- */
let favorites = [];
async function loadFavorites() {
  try { favorites = await api('/api/favorites'); } catch { favorites = []; }
  renderFavorites();
}
function isFav(vid, rel) { return favorites.some(f => f.vid === vid && f.rel === rel); }
async function toggleFav(vid, rel) {
  favorites = await api('/api/favorites', { action: isFav(vid, rel) ? 'remove' : 'add', vid, rel });
  renderFavorites();
  toast(isFav(vid, rel) ? '已收藏' : '已取消收藏', 'ok');
}
function renderFavorites() {
  const box = document.getElementById('favList');
  if (!box) return;
  box.innerHTML = '';
  if (!favorites.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  for (const f of favorites) {
    const v = vaultById(f.vid);
    const el = document.createElement('div');
    el.className = 'fav-item';
    el.title = absPath(f.vid, f.rel);
    el.innerHTML = `<span class="ticon">${iconFor(f.rel)}</span><span class="tname">${esc(base(f.rel))}</span>`;
    el.onclick = () => openFile(f.vid, f.rel);
    el.oncontextmenu = e => {
      e.preventDefault();
      showCtx(e.clientX, e.clientY, [
        { icon: IG.paperclip, label: '复制完整路径', fn: () => copyText(absPath(f.vid, f.rel)) },
        { icon: IG.pin, label: '取消收藏', fn: async () => { await toggleFav(f.vid, f.rel); } },
      ]);
    };
    box.appendChild(el);
  }
}

/* 在线库：Hub 没跑时一键启动 */
async function startHubFromUI() {
  toast('正在启动 Lin Hub…');
  try {
    const r = await api('/api/starthub', {});
    if (r.ok) { toast('Lin Hub 已启动', 'ok'); renderView(); }
    else toast('启动失败，请双击桌面「Lin Hub」', 'err');
  } catch (e) { toast('启动失败：' + e.message, 'err'); }
}

/* ================= Lin 家族主题切换 ================= */
const LIN_SKINS = [
  { key: 'lin',     name: '林夜', bg: '#0F0D17' },
  { key: 'pine',    name: '松烟', bg: '#0E1513' },
  { key: 'warmnight',name:'暖夜', bg: '#171210' },
  { key: 'mibai',   name: '米白', bg: '#F5F1E8' },
  { key: 'mist',    name: '雾蓝', bg: '#EDF1F7' },
  { key: 'shusui',  name: '鼠尾', bg: '#EFF1EC' },
];
function applyTheme(key) {
  if (key) document.documentElement.dataset.theme = key;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('lin-theme', key || 'lin'); } catch (e) {}
  document.querySelectorAll('#themeRow .theme-dot').forEach(d => d.classList.toggle('on', d.dataset.k === (key || '')));
}
function initThemeRow() {
  const row = document.getElementById('themeRow');
  if (!row) return;
  for (const s of LIN_SKINS) {
    const d = document.createElement('button');
    d.className = 'theme-dot';
    d.dataset.k = s.key;
    d.title = s.name;
    if (s.key === '') { d.classList.add('default'); }
    else d.style.background = s.bg;
    d.onclick = () => applyTheme(s.key);
    row.appendChild(d);
  }
  let saved = 'lin';
  try { saved = localStorage.getItem('lin-theme'); if (saved === null || saved === '') saved = 'lin'; } catch (e) { saved = 'lin'; }
  applyTheme(saved);
}
