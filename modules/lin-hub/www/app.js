'use strict';
/* Lin Hub - 前端 */
/* embed 模式（?embed=1）：被 Lin Files 内嵌时收起品牌头，账号区保留 */
if (new URLSearchParams(location.search).get('embed') === '1') {
  document.documentElement.classList.add('hub-embed');
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
// 路径清洗：Windows「复制为路径」会给整条路径加双引号（也有全角引号/首尾空格）。
// 输入框粘贴后也能直接用，不必手动删引号。
function normPath(s) {
  let v = String(s == null ? '' : s).trim();
  for (let i = 0; i < 3; i++) {
    const t = v.replace(/^["“”‘’'\s]+/, '').replace(/["“”‘’'\s]+$/, '');
    if (t === v) break;
    v = t;
  }
  return v;
}
// 失焦时把清洗后的值回填到输入框，让用户看到实际会用的路径
function bindPathInputs() {
  ['#batchDir', '#batchCoverDir', '#upThm', '#upCover', '#cvPath', '#plFile', '#ckFile'].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el || el._pathBound) return;
    el._pathBound = true;
    el.addEventListener('blur', () => {
      const cleaned = normPath(el.value);
      if (cleaned !== el.value) el.value = cleaned;
    });
  });
}
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.remove('hidden');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.add('hidden'), isErr ? 6000 : 2600);
}
async function api(path, opts) {
  const r = await fetch(path, opts || {});
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    const msg = (j && (j.error || j.body)) || ('HTTP ' + r.status);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return j;
}
function bumpVersion(v, policy) {
  const m = String(v || '0.0.0').split('.').map(Number);
  const M = m[0] || 0, m2 = m[1] || 0, b = m[2] || 0;
  return policy === 'minor' ? `${M}.${m2 + 1}.0` : `${M}.${m2}.${b + 1}`;
}
function getPolicy() {
  const el = document.querySelector('input[name=policy]:checked');
  return el ? el.value : 'patch';
}
function openMask(id) { $(id).classList.remove('hidden'); }
function closeMask(id) { $(id).classList.add('hidden'); }

/* ---------- 账号 ---------- */
let accounts = { active: '', items: [] };

async function refreshAccounts() {
  try {
    accounts = await api('/api/accounts');
    const sel = $('#acctSelect');
    sel.innerHTML = accounts.items.map(a =>
      `<option value="${esc(a.id)}">${esc(a.name)}${a.email ? ' (' + esc(a.email) + ')' : ''}</option>`).join('');
    sel.value = accounts.active;
    await checkSession();
  } catch (e) { setDot(false); }
}
async function checkSession() {
  setDot(false);
  if (!accounts.active) return;
  try {
    const r = await api('/api/session/check');
    setDot(!!r.ok);
    if (!r.ok) toast('当前账号会话已失效，请在账号管理中重新登录', true);
  } catch (e) { setDot(false); }
}
function setDot(on) { $('#acctDot').classList.toggle('on', !!on); $('#acctDot').classList.toggle('off', !on); }

$('#acctSelect').addEventListener('change', async (e) => {
  try {
    await api('/api/accounts/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.target.value }) });
    await refreshAccounts();
    refreshThemes(); refreshPlugins();
  } catch (err) { toast(String(err.message || err), true); }
});
$('#btnAccounts').addEventListener('click', async () => { renderAcctList(); refreshPact('gitee'); refreshPact('github'); openMask('#acctMask'); });
$('#acctClose').addEventListener('click', () => closeMask('#acctMask'));

/* 账号弹窗内平台切换（Tavo Hub / Gitee / GitHub） */
function switchAcctPf(pf) {
  $$('#acctMask .pfbtn').forEach(b => b.classList.toggle('active', b.dataset.apf === pf));
  ['tavo', 'gitee', 'github'].forEach(p => {
    const pane = document.getElementById('acctPane-' + p);
    if (pane) pane.classList.toggle('hidden', p !== pf);
  });
  if (pf !== 'tavo') refreshPact(pf);
}
$$('#acctMask .pfbtn').forEach(b => b.addEventListener('click', () => switchAcctPf(b.dataset.apf)));

/* ---------- Gitee / GitHub 平台账号（多令牌管理） ---------- */
let pactStores = { gitee: { active: '', items: [] }, github: { active: '', items: [] } };
async function refreshPact(platform) {
  try {
    pactStores[platform] = await api('/api/paccounts?platform=' + platform);
  } catch (e) { /* 保持旧值 */ }
  renderPactList(platform);
  return pactStores[platform];
}
function activePactName(platform) {
  const s = pactStores[platform] || { items: [] };
  const a = (s.items || []).find(x => x.id === s.active);
  return a ? (a.login || a.name) : '';
}
function renderPactList(platform) {
  const store = pactStores[platform];
  const box = $('#pactList-' + platform);
  if (!box) return;
  const label = platform === 'gitee' ? 'Gitee' : 'GitHub';
  if (!store.items.length) {
    box.innerHTML = '<div class="muted">还没有 ' + label + ' 账号，用下面任一方式添加。</div>';
    return;
  }
  box.innerHTML = store.items.map(a => `
    <div class="acct-item ${a.id === store.active ? 'active' : ''}">
      <span class="grow"><b>${esc(a.name)}</b> ${a.login ? '<span class="muted">' + esc(a.login) + '</span>' : ''}<br>
      <span class="muted mono">token: ${esc(a.tokenMasked)} · ${esc(String(a.created || '').slice(0, 10))}</span></span>
      ${a.id === store.active ? '<span class="pill ok">当前</span>' : `<button data-psel="${esc(a.id)}">设为当前</button>`}
      <button class="danger" data-pdel="${esc(a.id)}">删除</button>
    </div>`).join('');
  box.querySelectorAll('[data-psel]').forEach(b => b.onclick = async () => {
    await api('/api/paccounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, action: 'select', id: b.dataset.psel }) });
    await refreshPact(platform);
    if (platform === 'gitee') refreshGitee(); else refreshGithub();
  });
  box.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    if (!confirm('删除这条 ' + label + ' 账号记录？（不影响平台上的内容）')) return;
    await api('/api/paccounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, action: 'remove', id: b.dataset.pdel }) });
    await refreshPact(platform);
    if (platform === 'gitee') refreshGitee(); else refreshGithub();
  });
}
async function addPactToken(platform, tok, name, msgEl, inputEl, nameEl) {
  if (!tok) { toast('请输入令牌', true); return; }
  msgEl.textContent = '验证中…';
  try {
    const r = await api('/api/paccounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, action: 'add', token: tok, name }) });
    if (!r.ok) { msgEl.textContent = '添加失败：' + (r.error || '令牌无效'); return; }
    msgEl.textContent = r.added ? ('已添加并设为当前：' + (r.login || r.name || '')) : ('该令牌已存在，已设为当前（' + (r.login || '') + '）');
    inputEl.value = ''; if (nameEl) nameEl.value = '';
    await refreshPact(platform);
    if (platform === 'gitee') refreshGitee(); else refreshGithub();
  } catch (e) { msgEl.textContent = '添加失败：' + e.message; }
}
$('#btnGiteeTokAdd').addEventListener('click', () => addPactToken('gitee', $('#giteeTokIn').value.trim(), $('#giteeTokName').value.trim(), $('#giteeTokMsg'), $('#giteeTokIn'), $('#giteeTokName')));
$('#btnGithubTokAdd').addEventListener('click', () => addPactToken('github', $('#githubTokIn').value.trim(), $('#githubTokName').value.trim(), $('#githubTokMsg'), $('#githubTokIn'), $('#githubTokName')));

async function renderAcctList() {
  await refreshAccounts();
  const box = $('#acctList');
  if (!accounts.items.length) { box.innerHTML = '<div class="muted">还没有账号，请用下面任一方式添加。</div>'; return; }
  box.innerHTML = accounts.items.map(a => `
    <div class="acct-item ${a.id === accounts.active ? 'active' : ''}">
      <span class="grow"><b>${esc(a.name)}</b> ${a.email ? '<span class="muted">' + esc(a.email) + '</span>' : ''}<br>
      <span class="muted mono">sid: ${esc(a.sidMasked)}</span></span>
      ${a.id === accounts.active ? '<span class="pill ok">当前</span>' : `<button data-sel="${esc(a.id)}">设为当前</button>`}
      <button class="danger" data-del="${esc(a.id)}">删除</button>
    </div>`).join('');
  box.querySelectorAll('[data-sel]').forEach(b => b.onclick = async () => {
    await api('/api/accounts/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.sel }) });
    await refreshAccounts(); renderAcctList(); refreshThemes();
  });
  box.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('确定删除该账号记录？（不影响 hub 上的内容）')) return;
    await api('/api/accounts/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.del }) });
    await refreshAccounts(); renderAcctList();
  });
}

$('#btnSendCode').addEventListener('click', async () => {
  const email = $('#loginEmail').value.trim();
  if (!email) { toast('请输入邮箱', true); return; }
  try {
    const r = await api('/api/login/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    $('#loginMsg').textContent = r.ok ? '验证码已发送，请查收邮箱（60 秒后可重发）' : ('发送失败: ' + (r.body || r.status));
    if (!r.ok) toast('发送失败: ' + (r.body || r.status), true);
  } catch (e) { $('#loginMsg').textContent = '发送失败: ' + e.message; }
});
$('#btnLogin').addEventListener('click', async () => {
  const email = $('#loginEmail').value.trim(), code = $('#loginCode').value.trim();
  if (!email || !code) { toast('请输入邮箱和验证码', true); return; }
  try {
    const r = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, name: $('#loginName').value.trim() }) });
    if (r.ok) {
      toast('登录成功：' + r.account.name);
      $('#loginCode').value = '';
      await refreshAccounts(); renderAcctList(); refreshThemes(); refreshPlugins();
    } else toast('登录失败', true);
  } catch (e) { $('#loginMsg').textContent = '登录失败: ' + e.message; }
});
$('#btnImportBrowser').addEventListener('click', async () => {
  $('#importMsg').textContent = '扫描中…（浏览器需已完全关闭）';
  try {
    const r = await api('/api/import-browser', { method: 'POST' });
    const n = (r.added || []).length;
    $('#importMsg').textContent = n ? ('已导入 ' + n + ' 个会话') : (r.note || '未找到会话');
    if (n) { await refreshAccounts(); renderAcctList(); refreshThemes(); }
  } catch (e) { $('#importMsg').textContent = '导入失败: ' + e.message; }
});
$('#btnManualAdd').addEventListener('click', async () => {
  const sid = $('#manualSid').value.trim();
  if (!sid) { toast('请输入 sid', true); return; }
  try {
    await api('/api/accounts/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, name: $('#manualName').value.trim() }) });
    toast('已添加并设为当前');
    $('#manualSid').value = '';
    await refreshAccounts(); renderAcctList(); refreshThemes();
  } catch (e) { toast('添加失败: ' + e.message, true); }
});

/* ---------- Tabs ---------- */
$$('nav .tab').forEach(t => t.addEventListener('click', () => {
  $$('nav .tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(p => p.classList.remove('active'));
  t.classList.add('active');
  $('#tab-' + t.dataset.tab).classList.add('active');
  if (t.dataset.tab === 'covers') refreshCovers();
  if (t.dataset.tab === 'library') refreshLibrary();
  if (t.dataset.tab === 'gitee') refreshGitee();
}));

/* ---------- 主题库 ---------- */
let themes = [];
async function refreshThemes() {
  try {
    const r = await api('/api/themes');   // hub 原始结构: { items, next_cursor, ... }
    themes = r.items || [];
    renderThemes();
  } catch (e) {
    themes = [];
    renderThemes();
    toast('获取主题列表失败: ' + e.message, true);
  }
}
function renderThemes() {
  const q = ($('#themeSearch').value || '').trim().toLowerCase();
  const list = themes.filter(t => !q || String(t.name).toLowerCase().includes(q));
  $('#themeCount').textContent = list.length + ' / ' + themes.length + ' 个主题';
  $('#themesTable tbody').innerHTML = list.map(t => {
    const synced = t.published_version === t.latest_version;
    const status = t.status === 'published'
      ? (synced ? '<span class="pill ok">已同步</span>' : '<span class="pill warn">待发布</span>')
      : '<span class="pill bad">' + esc(t.status || '未知') + '</span>';
    return `<tr>
      <td>${t.cover_thumbnail_url || t.cover_url ? `<img class="thumb" loading="lazy" src="${esc(t.cover_thumbnail_url || t.cover_url)}">` : ''}</td>
      <td>${esc(t.name)}</td>
      <td class="mono">${esc(t.published_version || '—')}</td>
      <td class="mono">${esc(t.latest_version || '—')}</td>
      <td>${status}</td>
      <td class="muted">${esc(String(t.updated_at || '').slice(0, 10))}</td>
      <td>
        <button data-act="detail" data-id="${esc(t.id)}">详情</button>
        <button data-act="update" data-id="${esc(t.id)}">更新</button>
        <button data-act="cover" data-id="${esc(t.id)}">仅封面</button>
        <button data-act="backup" data-id="${esc(t.id)}">备份</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">无数据，请先添加账号并刷新</td></tr>';
  bindThemeActions();
}
function findTheme(id) { return themes.find(t => t.id === id); }
function bindThemeActions() {
  $$('#themesTable [data-act]').forEach(b => b.onclick = () => {
    const t = findTheme(b.dataset.id);
    if (!t) return;
    if (b.dataset.act === 'detail') openDetail(t);
    if (b.dataset.act === 'update') openUpdateModal(t);
    if (b.dataset.act === 'cover') openCoverModal(t);
    if (b.dataset.act === 'backup') doBackup(t);
  });
}
$('#btnThemesRefresh').addEventListener('click', refreshThemes);
$('#themeSearch').addEventListener('input', renderThemes);

/* 通用小弹窗 */
function openOpModal(html) { $('#opModal').innerHTML = html; openMask('#opMask'); bindOpModal(); bindPathInputs(); }
function bindOpModal() {
  const m = $('#opModal');
  const c = m.querySelector('[data-close]');
  if (c) c.onclick = () => closeMask('#opMask');
}
$('#opMask').addEventListener('click', (e) => { if (e.target.id === 'opMask') closeMask('#opMask'); });
$('#drawerMask').addEventListener('click', (e) => { if (e.target.id === 'drawerMask') closeMask('#drawerMask'); });
$('#drawerClose').addEventListener('click', () => closeMask('#drawerMask'));

function openUpdateModal(t) {
  const v = bumpVersion(t.latest_version, getPolicy());
  openOpModal(`
    <div class="drawer-head"><h3>上传新版本 · ${esc(t.name)}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">Hub 名称</label><input type="text" id="upName" value="${esc(t.name)}" readonly></div>
      <div class="row"><label style="width:90px">版本号</label><input type="text" id="upVer" value="${esc(v)}">
        <select id="upPolicy"><option value="patch">patch+1</option><option value="minor">minor+1</option></select>
        <label class="inline"><input type="checkbox" id="upPub" checked>上传后自动发布</label></div>
      <div class="row"><label style="width:90px">.thm 路径</label><input type="text" id="upThm" placeholder="D:\\…\\xxx.thm"></div>
      <div class="row"><label style="width:90px">封面路径</label><input type="text" id="upCover" placeholder="可选，一并更新封面"></div>
      <div class="row"><button class="primary" id="upGo">上传</button><span class="muted">服务端会先校验包，再上传</span></div>
      <div id="upMsg" class="muted"></div>
    </div>`);
  $('#upPolicy').value = document.querySelector('input[name=policy]:checked').value;
  $('#upPolicy').addEventListener('change', () => { $('#upVer').value = bumpVersion(t.latest_version, $('#upPolicy').value); });
  $('#upGo').addEventListener('click', async () => {
    const thm = normPath($('#upThm').value);
    if (!thm) { toast('请填写 .thm 路径', true); return; }
    $('#upMsg').textContent = '上传中…（大包可能需要几十秒）';
    try {
      const r = await api('/api/theme/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        id: t.id, thmPath: thm, coverPath: normPath($('#upCover').value), version: $('#upVer').value.trim(), autoPublish: $('#upPub').checked, policy: $('#upPolicy').value }) });
      $('#upMsg').textContent = '完成: 版本 ' + r.version + (r.published === false ? '（未发布，可稍后在详情里发布）' : ' 已发布');
      toast('上传成功 ' + r.version);
      refreshThemes();
    } catch (e) { $('#upMsg').textContent = '失败: ' + e.message; }
  });
}
function openCoverModal(t, fromGrid) {
  const v = bumpVersion(t.latest_version, getPolicy());
  openOpModal(`
    <div class="drawer-head"><h3>仅换封面 · ${esc(t.name)}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="muted">不重传 .thm：服务端沿用旧包，仅更新封面并发布新版本 ${esc(v)}。</div>
      <div class="row"><label style="width:90px">封面路径</label><input type="text" id="cvPath" placeholder="D:\\…\\cover.png"></div>
      <div class="row"><label style="width:90px">版本策略</label><select id="cvPolicy"><option value="patch">patch+1</option><option value="minor">minor+1</option></select>
        <button class="primary" id="cvGo">换封面并发布</button></div>
      <div id="cvMsg" class="muted"></div>
    </div>`);
  $('#cvPolicy').value = getPolicy();
  const lastDir = localStorage.getItem('coverDir');
  if (lastDir) $('#cvPath').placeholder = lastDir + '\\<名称>.png';
  $('#cvGo').addEventListener('click', async () => {
    const p = normPath($('#cvPath').value);
    if (!p) { toast('请填写封面路径', true); return; }
    $('#cvMsg').textContent = '上传中…';
    try {
      const r = await api('/api/theme/cover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, coverPath: p, policy: $('#cvPolicy').value }) });
      $('#cvMsg').textContent = '完成: ' + r.version;
      toast('封面已更新 ' + r.version);
      refreshThemes();
      if (fromGrid) renderCovers();
    } catch (e) { $('#cvMsg').textContent = '失败: ' + e.message; }
  });
}
async function doBackup(t) {
  try {
    toast('备份下载中…');
    const r = await api('/api/theme/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
    toast('已备份到 ' + r.file + (r.shaMatch ? '' : '（警告: sha 不匹配！）'), !r.shaMatch);
  } catch (e) { toast('备份失败: ' + e.message, true); }
}
async function openDetail(t) {
  openMask('#drawerMask');
  $('#drawerTitle').textContent = '主题详情 · ' + t.name;
  $('#drawerBody').innerHTML = '<div class="muted">加载中…</div>';
  let d = null;
  try {
    d = await api('/api/theme?id=' + encodeURIComponent(t.id));   // hub 原始详情
  } catch (e) { $('#drawerBody').innerHTML = '<div class="muted">加载失败: ' + esc(e.message) + '</div>'; return; }
  const versions = (d && d.versions) || [];
  $('#drawerBody').innerHTML = `
    <div class="kv">
      <span class="k">名称</span><span>${esc(d.name)}</span>
      <span class="k">已发布 / 最新</span><span class="mono">${esc(d.published_version || '—')} / ${esc(d.latest_version || '—')}</span>
      <span class="k">状态</span><span>${esc(d.status || '')}</span>
      <span class="k">摘要</span><span>${esc(d.summary || '—')}</span>
      <span class="k">外链</span><input type="text" id="dUrl" value="${esc(d.external_url || '')}">
      <span class="k"></span><span><button id="dUrlGo">保存外链</button>
      <button id="dPub">发布最新版本</button>
      <input type="text" id="dPubVer" placeholder="版本号(默认最新)" style="width:160px"></span>
    </div>
    <h4>版本历史（${versions.length}）</h4>
    <div class="tablewrap" style="max-height:260px"><table><thead><tr><th>版本</th><th>时间</th><th>状态</th></tr></thead>
    <tbody>${versions.map(v => `<tr><td class="mono">${esc(v.version)}</td><td class="muted">${esc(String(v.created_at || '').slice(0, 19).replace('T', ' '))}</td><td>${esc(v.status || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">无</td></tr>'}</tbody></table></div>
    <div id="dMsg" class="muted" style="margin-top:8px"></div>`;
  $('#dUrlGo').addEventListener('click', async () => {
    try {
      await api('/api/theme/external-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, url: $('#dUrl').value.trim() }) });
      $('#dMsg').textContent = '外链已保存'; toast('外链已保存');
    } catch (e) { $('#dMsg').textContent = '失败: ' + e.message; }
  });
  $('#dPub').addEventListener('click', async () => {
    const ver = $('#dPubVer').value.trim() || d.latest_version;
    if (!ver) { toast('没有可发布的版本', true); return; }
    if (!confirm('发布版本 ' + ver + ' ？')) return;
    try {
      await api('/api/theme/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, version: ver }) });
      $('#dMsg').textContent = '已发布 ' + ver; toast('已发布 ' + ver);
      refreshThemes();
    } catch (e) { $('#dMsg').textContent = '失败: ' + e.message; }
  });
}

/* ---------- 批量 ---------- */
$('#batchDir').value = normPath(localStorage.getItem('batchDir') || '');
$('#batchCoverDir').value = normPath(localStorage.getItem('batchCoverDir') || '');
let planRows = [];

$('#btnPlan').addEventListener('click', async () => {
  const dir = normPath($('#batchDir').value);
  if (!dir) { toast('请填写主题目录', true); return; }
  localStorage.setItem('batchDir', dir);
  localStorage.setItem('batchCoverDir', normPath($('#batchCoverDir').value));
  try {
    const r = await api('/api/batch/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir, coverDir: normPath($('#batchCoverDir').value) }) });
    const hubByName = {};
    themes.forEach(t => { hubByName[t.name] = t; });
    let libBindings = {};
    try {
      const lb = await api('/api/library/bindings');
      (lb.items || []).forEach(x => { libBindings[normPath(x.file)] = x; });
    } catch (e) {}
    planRows = (r.rows || []).map(row => {
      const b = libBindings[normPath(row.file)] || null;
      const boundHub = (b && b.hubThemeId) ? themes.find(t => String(t.id) === String(b.hubThemeId)) : null;
      const hub = boundHub || hubByName[row.hubName] || hubByName[row.localName] || null;
      const usable = !!(row.hubName || row.localName);
      return {
        ...row,
        matched: !!hub,
        usable: usable,
        hubId: hub ? hub.id : '',
        published: hub ? hub.published_version : '',
        latest: hub ? hub.latest_version : '',
        note: (boundHub ? '本地库绑定匹配' + (row.note ? ' · ' + row.note : '') : (hub ? row.note : (row.note || (usable ? 'hub 上没有这个主题，可新建上传' : ''))))
      };
    });
    renderPlan();
    $('#planBox').classList.remove('hidden');
    $('#jobBox').classList.add('hidden');
  } catch (e) { toast('生成计划失败: ' + e.message, true); }
});
function renderPlan() {
  const tb = $('#planTable tbody');
  tb.innerHTML = planRows.map((r, i) => {
    const hasCover = !!r.coverPath;
    const coverCell = hasCover ? '<span class="pill ok">有</span>' : '<span class="pill warn">无</span>';
    const fileCell = `<td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.file)}">${esc(r.file.split('\\').pop())}</td>`;

    if (!r.matched) {
      if (!r.usable) {
        return `<tr><td><input type="checkbox" disabled></td>${fileCell}
          <td>${esc(r.localName || '?')}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
          <td class="muted">${esc(r.note || '无法解析主题名，不能新建')}</td></tr>`;
      }
      return `<tr>
        <td><input type="checkbox" class="planck" data-i="${i}" checked></td>
        ${fileCell}
        <td>${esc(r.localName || '?')}</td><td>${esc(r.hubName)}</td>
        <td><span class="pill warn">新</span></td><td>—</td>
        <td>${coverCell}</td>
        <td><select data-op="${i}"><option value="create">新建并发布</option></select>
          <input type="text" data-ver="${i}" value="1.0.0" title="新主题版本号" style="width:76px;margin-left:4px"></td>
        <td class="muted">${esc(r.note || 'hub 上不存在，将新建')}</td></tr>`;
    }
    return `<tr>
      <td><input type="checkbox" class="planck" data-i="${i}" checked></td>
      ${fileCell}
      <td>${esc(r.localName)}</td><td>${esc(r.hubName)}</td>
      <td class="mono">${esc(r.published)}</td><td class="mono">${esc(r.latest)}</td>
      <td>${coverCell}</td>
      <td><select data-op="${i}">
          <option value="update">更新包+发布</option>
          <option value="cover" ${hasCover ? '' : 'disabled'}>仅换封面</option>
        </select></td>
      <td class="muted">${esc(r.note || '')}</td></tr>`;
  }).join('');
  $$('#planTable .planck').forEach(c => c.onchange = updatePlanStat);
  updatePlanStat();
}
function updatePlanStat() {
  const n = $$('#planTable .planck:checked').length;
  const nUpd = planRows.filter(r => r.matched).length;
  const nNew = planRows.filter(r => !r.matched && r.usable).length;
  $('#planStat').textContent = `已勾选 ${n} 项（${nUpd} 个更新、${nNew} 个新建）`;
}
$('#planAll').addEventListener('change', (e) => {
  $$('#planTable .planck').forEach(c => c.checked = e.target.checked);
  updatePlanStat();
});
$('#btnAll').addEventListener('click', () => { $$('#planTable .planck').forEach(c => c.checked = true); updatePlanStat(); });
$('#btnNone').addEventListener('click', () => { $$('#planTable .planck').forEach(c => c.checked = false); updatePlanStat(); });

let pollTm = null;
$('#btnRunBatch').addEventListener('click', async () => {
  const rows = [];
  $$('#planTable .planck:checked').forEach(c => {
    const i = Number(c.dataset.i);
    const r = planRows[i];
    if (!r) return;
    if (!r.matched) {
      if (!r.usable) return;
      const verEl = document.querySelector(`[data-ver="${i}"]`);
      rows.push({
        file: r.file, op: 'create', hubId: '', hubName: r.hubName, localName: r.localName,
        coverPath: r.coverPath || '', version: verEl ? verEl.value.trim() : '1.0.0'
      });
      return;
    }
    const sel = document.querySelector(`[data-op="${i}"]`);
    rows.push({ file: r.file, op: sel ? sel.value : 'update', hubId: r.hubId, hubName: r.hubName, coverPath: r.coverPath || '', version: '', policy: getPolicy() });
  });
  if (!rows.length) { toast('请先勾选要执行的行', true); return; }
  const nNew = rows.filter(r => r.op === 'create').length;
  const msg = nNew
    ? `将更新 ${rows.length - nNew} 个已有主题、新建并发布 ${nNew} 个新主题，继续？`
    : `将对 ${rows.length} 个主题执行批量操作，继续？`;
  if (!confirm(msg)) return;
  try {
    const r = await api('/api/batch/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
    $('#jobBox').classList.remove('hidden');
    $('#jobTable tbody').innerHTML = '';
    $('#jobBar').style.width = '0%';
    pollJob(r.jobId);
  } catch (e) { toast('启动失败: ' + e.message, true); }
});
function pollJob(jobId) {
  clearInterval(pollTm);
  pollTm = setInterval(async () => {
    try {
      const j = await api('/api/job?id=' + encodeURIComponent(jobId));
      $('#jobBar').style.width = (j.total ? Math.round(100 * j.done / j.total) : 0) + '%';
      $('#jobText').textContent = '进度 ' + j.done + ' / ' + j.total;
      const tb = $('#jobTable tbody');
      const opName = { create: '新建', update: '更新', cover: '换封面', publish: '发布' };
      tb.innerHTML = (j.results || []).map(r => `<tr>
        <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.file)}">${esc(String(r.file).split('\\').pop())}</td>
        <td>${esc(opName[r.op] || r.op)}</td>
        <td>${r.skipped ? '<span class="pill warn">跳过</span>' : (r.ok ? '<span class="pill ok">成功</span>' : '<span class="pill bad">失败</span>')}</td>
        <td class="muted">${esc((r.version ? 'v' + r.version + ' ' : '') + (r.note || ''))}</td></tr>`).join('');
      if (j.status === 'done') {
        clearInterval(pollTm);
        toast('批量任务完成: ' + (j.results || []).filter(r => r.ok).length + ' 成功 / ' + (j.results || []).filter(r => !r.ok).length + ' 失败');
        refreshThemes();
      }
    } catch (e) { /* keep polling */ }
  }, 1500);
}

/* ---------- 封面 ---------- */
async function refreshCovers() {
  if (!themes.length) await refreshThemes();
  renderCovers();
}
function renderCovers() {
  const q = ($('#coverSearch').value || '').trim().toLowerCase();
  const list = themes.filter(t => !q || String(t.name).toLowerCase().includes(q));
  $('#coverGrid').innerHTML = list.map(t => `
    <div class="card">
      ${(t.cover_thumbnail_url || t.cover_url) ? `<img loading="lazy" src="${esc(t.cover_thumbnail_url || t.cover_url)}">` : '<div class="muted">无封面</div>'}
      <div class="name" title="${esc(t.name)}">${esc(t.name)}</div>
      <div class="muted">v${esc(t.published_version || '?')}</div>
      <button data-cv="${esc(t.id)}">仅换封面</button>
    </div>`).join('') || '<div class="muted">无数据</div>';
  $$('#coverGrid [data-cv]').forEach(b => b.onclick = () => {
    const t = findTheme(b.dataset.cv);
    if (t) openCoverModal(t, true);
  });
}
$('#btnCoversRefresh').addEventListener('click', refreshCovers);
$('#coverSearch').addEventListener('input', renderCovers);

/* ---------- 插件 ---------- */
let plugins = [];
async function refreshPlugins() {
  try {
    const r = await api('/api/plugins');   // hub 原始结构: { items, ... }
    plugins = r.items || [];
    renderPlugins();
  } catch (e) {
    plugins = [];
    renderPlugins();
  }
}
function renderPlugins() {
  $('#pluginsTable tbody').innerHTML = plugins.map(p => {
    const tags = Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || '');
    return `<tr>
      <td>${esc(p.name)}</td>
      <td class="muted">${esc(tags)}</td>
      <td class="mono" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(p.external_url || '—')}</td>
      <td class="muted">${esc(String(p.updated_at || '').slice(0, 10))}</td>
      <td>
        <button data-pact="update" data-pid="${esc(p.id)}">更新发布</button>
        <button data-pact="meta" data-pid="${esc(p.id)}">改元数据</button>
        <button data-pact="check" data-pid="${esc(p.id)}">检查包</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="5" class="muted">无数据</td></tr>';
  $$('#pluginsTable [data-pact]').forEach(b => b.onclick = () => {
    const p = plugins.find(x => x.id === b.dataset.pid);
    if (!p) return;
    if (b.dataset.pact === 'update') openPluginModal(p, true);
    if (b.dataset.pact === 'meta') openPluginModal(p, false);
    if (b.dataset.pact === 'check') openPluginCheck(p);
  });
}
$('#btnPluginsRefresh').addEventListener('click', refreshPlugins);
$('#btnPluginCreate').addEventListener('click', () => openPluginModal(null, true));

// 插件分类：hub 只接受这 6 个 key 中的一个（来自 /api/plugin/tags）
let pluginTagOptions = [
  { key: 'memory', label: '记忆' },
  { key: 'gameplay', label: '玩法' },
  { key: 'chat', label: '聊天' },
  { key: 'creation', label: '创作' },
  { key: 'appearance', label: '美化' },
  { key: 'utilities', label: '工具' }
];
async function loadPluginTags() {
  try {
    const r = await api('/api/plugin/tags');
    const items = r.items || [];
    if (items.length) pluginTagOptions = items.map(i => ({ key: i.key, label: i.label || i.key }));
  } catch (e) { /* 用内置兜底列表 */ }
}

function pluginForm(p, withFile) {
  const curTag = p && Array.isArray(p.tags) && p.tags.length ? String(p.tags[0]) : '';
  const opts = pluginTagOptions.map(o =>
    `<option value="${esc(o.key)}"${o.key === curTag ? ' selected' : ''}>${esc(o.label)}（${esc(o.key)}）</option>`).join('');
  return `
    <div class="row"><label style="width:90px">名称</label><input type="text" id="plName" value="${esc(p ? p.name : '')}" placeholder="插件显示名称"></div>
    <div class="row"><label style="width:90px">分类</label><select id="plTag">${opts}</select>
      <span class="muted">hub 只允许一个分类</span></div>
    <div class="row"><label style="width:90px">外链</label><input type="text" id="plUrl" value="${esc(p ? (p.external_url || '') : '')}" placeholder="可留空；填写需 http(s)://"></div>
    <div class="row"><label style="width:90px">描述</label><input type="text" id="plDesc" value="${esc(p ? (p.description || '') : '')}" placeholder="可留空，默认用包内 description"></div>
    ${withFile ? `<div class="row"><label style="width:90px">.tpg 路径</label><input type="text" id="plFile" placeholder="D:\\…\\xxx.tpg"></div>
    <div class="row"><span class="muted">${p ? '提交前会先校验包，通过后才发布' : '提交前会先校验包，通过后才创建'}</span></div>` : ''}
    <div class="row"><button class="primary" id="plGo">${withFile ? (p ? '更新并发布' : '上传新插件') : '保存元数据'}</button></div>
    <div id="plMsg" class="muted"></div>`;
}
function openPluginModal(p, withFile) {
  openOpModal(`
    <div class="drawer-head"><h3>${p ? (withFile ? '更新插件 · ' + esc(p.name) : '改元数据 · ' + esc(p.name)) : '上传新插件'}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">${pluginForm(p, withFile)}</div>`);
  $('#plGo').addEventListener('click', async () => {
    const meta = {
      name: $('#plName').value.trim(),
      externalUrl: $('#plUrl').value.trim(),
      tags: [$('#plTag').value],
      description: $('#plDesc').value.trim()
    };
    const btn = $('#plGo');
    btn.disabled = true;
    $('#plMsg').textContent = '提交中…（会先校验包）';
    try {
      if (p && withFile) {
        await api('/api/plugin/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, filePath: normPath($('#plFile').value), ...meta }) });
      } else if (p) {
        await api('/api/plugin/metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, ...meta }) });
      } else {
        await api('/api/plugin/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: normPath($('#plFile').value), ...meta }) });
      }
      toast('插件操作完成');
      refreshPlugins();
      closeMask('#opMask');
    } catch (e) {
      $('#plMsg').textContent = '失败: ' + e.message;
    } finally { btn.disabled = false; }
  });
}
function openPluginCheck(p) {
  openOpModal(`
    <div class="drawer-head"><h3>检查插件包 · ${esc(p.name)}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">.tpg 路径</label><input type="text" id="ckFile" placeholder="D:\\…\\xxx.tpg"></div>
      <div class="row"><button class="primary" id="ckGo">检查</button></div>
      <pre id="ckOut" class="mono" style="white-space:pre-wrap"></pre>
    </div>`);
  $('#ckGo').addEventListener('click', async () => {
    try {
      const r = await api('/api/plugin/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: normPath($('#ckFile').value) }) });
      $('#ckOut').textContent = 'HTTP ' + r.status + '\n' + JSON.stringify(r.data || r.body, null, 2);
    } catch (e) { $('#ckOut').textContent = '失败: ' + e.message; }
  });
}

/* ---------- init ---------- */
(async function init() {
  bindPathInputs();
  await refreshAccounts();
  refreshThemes();
  refreshPlugins();
  loadPluginTags();
})();

/* ================= Gitee 项目推送 ================= */
let giteeProjects = [];
let giteeCfg = { org: 'OFFAXIS', repo: '', hasToken: false };

async function refreshGitee() {
  try {
    giteeCfg = await api('/api/gitee/config');
    const r = await api('/api/gitee/projects');
    giteeProjects = r.projects || [];
    await refreshPact('gitee');
    renderGitee();
  } catch (e) {
    $('#giteeHint').textContent = '读取失败：' + e.message;
  }
}
function renderGitee() {
  const hint = $('#giteeHint');
  const accName = activePactName('gitee');
  const accPrefix = accName ? '账号 ' + accName + ' · ' : '';
  if (!giteeCfg.hasToken) {
    hint.textContent = '⚠ 还没配 Gitee 账号 —— 打开「账号管理 → Gitee」添加令牌';
  } else if (!giteeCfg.repo) {
    hint.textContent = accPrefix + '⚠ 还没指定仓库 —— 点「设置」填仓库名，或点「新建仓库」';
  } else {
    hint.textContent = accPrefix + giteeCfg.org + ' / ' + giteeCfg.repo;
  }
  const tb = $('#giteeTable tbody');
  if (!giteeProjects.length) {
    tb.innerHTML = '<tr><td colspan="5" class="muted">还没有推送记录。点「设置」配好令牌和仓库，然后用下面的「推送新版本」。</td></tr>';
    return;
  }
  tb.innerHTML = giteeProjects.map(p => `<tr>
    <td>${esc(p.name)}</td>
    <td class="mono">${esc(p.version || '—')}</td>
    <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis" title="${esc(p.localPath || '')}">${esc((p.localPath || '').split('\\').pop() || '—')}</td>
    <td class="muted">${esc(String(p.pushedAt || '').slice(0, 16).replace('T', ' ')) || '未推送'}</td>
    <td>
      <button data-gact="push" data-gid="${esc(p.id)}">推送新版本</button>
      <button data-gact="edit" data-gid="${esc(p.id)}">编辑</button>
      <button class="danger" data-gact="del" data-gid="${esc(p.id)}">删除</button>
    </td></tr>`).join('');
  $$('#giteeTable [data-gact]').forEach(b => b.onclick = () => {
    const p = giteeProjects.find(x => x.id === b.dataset.gid);
    if (!p) return;
    if (b.dataset.gact === 'push') openGiteePushModal(p);
    if (b.dataset.gact === 'edit') openGiteeEditModal(p);
    if (b.dataset.gact === 'del') {
      if (!confirm('删除项目记录「' + p.name + '」？（不影响 Gitee 上的内容）')) return;
      api('/api/gitee/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', id: p.id }) }).then(refreshGitee);
    }
  });
}
function bumpVer(v) {
  const m = String(v || '0.0.0').split('.').map(Number);
  return `${m[0] || 0}.${m[1] || 0}.${(m[2] || 0) + 1}`;
}
function openGiteePushModal(p) {
  const nextVer = p ? bumpVer(p.version) : '1.0.0';
  openOpModal(`
    <div class="drawer-head"><h3>推送到 Gitee · ${esc(p ? p.name : '新项目')}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">项目名</label><input type="text" id="gpName" value="${esc(p ? p.name : '')}"></div>
      <div class="row"><label style="width:90px">文件路径</label><input type="text" id="gpPath" value="${esc(p ? (p.localPath || '') : '')}" placeholder="D:\\…\\xxx.zip"></div>
      <div class="row"><label style="width:90px">版本号</label><input type="text" id="gpVer" value="${esc(nextVer)}" style="width:120px">
        <span class="muted">会创建 tag v${esc(nextVer)} 并上传附件</span></div>
      <div class="row"><label style="width:90px">说明</label><input type="text" id="gpDesc" value="${esc(p ? (p.note || '') : '')}" placeholder="一句话（可留空）"></div>
      <div class="row"><button class="primary" id="gpGo">推送</button><span id="gpMsg" class="muted"></span></div>
    </div>`);
  $('#gpGo').addEventListener('click', async () => {
    const btn = $('#gpGo'); btn.disabled = true;
    $('#gpMsg').textContent = '推送中…';
    try {
      const r = await api('/api/gitee/push', {
        name: $('#gpName').value.trim(),
        filePath: normPath($('#gpPath').value),
        version: $('#gpVer').value.trim(),
        desc: $('#gpDesc').value.trim()
      });
      $('#gpMsg').textContent = '完成：' + (r.actions || []).join(' / ');
      toast('推送成功 ' + r.tag);
      refreshGitee();
    } catch (e) {
      $('#gpMsg').textContent = '失败：' + e.message;
    } finally { btn.disabled = false; }
  });
}
function openGiteeEditModal(p) {
  openOpModal(`
    <div class="drawer-head"><h3>编辑项目 · ${esc(p.name)}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">项目名</label><input type="text" id="geName" value="${esc(p.name)}"></div>
      <div class="row"><label style="width:90px">文件路径</label><input type="text" id="gePath" value="${esc(p.localPath || '')}"></div>
      <div class="row"><label style="width:90px">当前版本</label><input type="text" id="geVer" value="${esc(p.version || '')}" style="width:120px"></div>
      <div class="row"><button class="primary" id="geGo">保存</button></div>
    </div>`);
  $('#geGo').addEventListener('click', async () => {
    await api('/api/gitee/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      action: 'update', id: p.id,
      name: $('#geName').value.trim(), localPath: normPath($('#gePath').value), version: $('#geVer').value.trim()
    }) });
    toast('已保存'); refreshGitee(); closeMask('#opMask');
  });
}
function openGiteeSettings() {
  openOpModal(`
    <div class="drawer-head"><h3>Gitee 设置</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><span class="muted">当前账号：${esc(activePactName('gitee') || '未配置（在「账号管理 → Gitee」里添加令牌）')}</span></div>
      <div class="row"><label style="width:90px">组织</label><input type="text" id="gsOrg" value="${esc(giteeCfg.org || 'OFFAXIS')}"></div>
      <div class="row"><label style="width:90px">仓库名</label><input type="text" id="gsRepo" value="${esc(giteeCfg.repo || '')}" placeholder="例如 lin-projects"></div>
      <div class="row"><button class="primary" id="gsGo">保存</button><span id="gsMsg" class="muted"></span></div>
    </div>`);
  $('#gsGo').addEventListener('click', async () => {
    $('#gsMsg').textContent = '保存中…';
    try {
      await api('/api/gitee/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: '', org: $('#gsOrg').value.trim(), repo: $('#gsRepo').value.trim() }) });
      await refreshGitee();
      $('#gsMsg').textContent = '已保存';
      toast('设置已保存');
    } catch (e) { $('#gsMsg').textContent = '失败：' + e.message; }
  });
}
function openGiteeNewRepo() {
  openOpModal(`
    <div class="drawer-head"><h3>新建 Gitee 仓库</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">组织</label><input type="text" id="gnOrg" value="${esc(giteeCfg.org || 'OFFAXIS')}"></div>
      <div class="row"><label style="width:90px">仓库名</label><input type="text" id="gnRepo" placeholder="lin-projects"></div>
      <div class="row"><label style="width:90px">简介</label><input type="text" id="gnDesc" placeholder="可留空"></div>
      <div class="row"><label style="width:90px">可见性</label>
        <label class="inline"><input type="radio" name="gnPriv" value="1" checked>私有</label>
        <label class="inline"><input type="radio" name="gnPriv" value="0">公开</label></div>
      <div class="row"><button class="primary" id="gnGo">创建</button><span id="gnMsg" class="muted"></span></div>
    </div>`);
  $('#gnGo').addEventListener('click', async () => {
    const priv = document.querySelector('input[name=gnPriv]:checked').value === '1';
    $('#gnMsg').textContent = '创建中…';
    try {
      const r = await api('/api/gitee/createrepo', {
        org: $('#gnOrg').value.trim(), repo: $('#gnRepo').value.trim(),
        description: $('#gnDesc').value.trim(), private: priv
      });
      $('#gnMsg').textContent = '已创建：' + r.htmlUrl;
      toast('仓库创建成功', 'ok');
      await refreshGitee();
    } catch (e) { $('#gnMsg').textContent = '失败：' + e.message; }
  });
}
$('#btnGiteeRefresh').addEventListener('click', refreshGitee);
$('#btnGiteeSettings').addEventListener('click', openGiteeSettings);
$('#btnGiteeNewRepo').addEventListener('click', openGiteeNewRepo);

/* ================= GitHub 发布台 ================= */
let ghProjects = [];
let ghCfg = { owner: '', repo: '', hasToken: false };

/* 平台切换（Gitee / GitHub 共用「项目推送」页签） */
function switchPF(pf) {
  $$('.pfbtn').forEach(b => b.classList.toggle('active', b.dataset.pf === pf));
  $('#pane-gitee').classList.toggle('hidden', pf !== 'gitee');
  $('#pfGiteeBar').classList.toggle('hidden', pf !== 'gitee');
  $('#pane-github').classList.toggle('hidden', pf !== 'github');
  $('#pfGithubBar').classList.toggle('hidden', pf !== 'github');
  if (pf === 'github') refreshGithub();
}
$$('.pfbtn').forEach(b => b.addEventListener('click', () => switchPF(b.dataset.pf)));

async function refreshGithub() {
  try {
    ghCfg = await api('/api/github/config');
    const r = await api('/api/github/projects');
    ghProjects = r.projects || [];
    await refreshPact('github');
    renderGithub();
  } catch (e) {
    $('#ghHint').textContent = '读取失败：' + e.message;
  }
}
function renderGithub() {
  const hint = $('#ghHint');
  const accName = activePactName('github');
  const accPrefix = accName ? '账号 ' + accName + ' · ' : '';
  if (!ghCfg.hasToken) {
    hint.textContent = '⚠ 还没配 GitHub 账号 —— 打开「账号管理 → GitHub」添加令牌';
  } else {
    hint.textContent = accPrefix + (ghCfg.owner ? ghCfg.owner + (ghCfg.repo ? ' / ' + ghCfg.repo : '') : '默认仓库在推送弹窗里手填');
  }
  const tb = $('#ghTable tbody');
  if (!ghProjects.length) {
    tb.innerHTML = '<tr><td colspan="5" class="muted">还没有 GitHub 推送记录。点「推送新项目」开始（owner / 仓库名在推送弹窗里手填，仓库需已存在于 GitHub）。</td></tr>';
    return;
  }
  tb.innerHTML = ghProjects.map(p => `<tr>
    <td>${esc(p.name)}</td>
    <td class="mono">${esc(p.version || '—')}</td>
    <td class="mono" style="max-width:280px;overflow:hidden;text-overflow:ellipsis" title="${esc(p.localPath || '')}">${esc((p.localPath || '').split('\\').pop() || '—')}</td>
    <td class="muted">${esc(String(p.pushedAt || '').slice(0, 16).replace('T', ' ')) || '未推送'}</td>
    <td>
      <button data-hact="push" data-hid="${esc(p.id)}">推送新版本</button>
      <button data-hact="edit" data-hid="${esc(p.id)}">编辑</button>
      <button class="danger" data-hact="del" data-hid="${esc(p.id)}">删除</button>
    </td></tr>`).join('');
  $$('#ghTable [data-hact]').forEach(b => b.onclick = () => {
    const p = ghProjects.find(x => x.id === b.dataset.hid);
    if (!p) return;
    if (b.dataset.hact === 'push') openGhPushModal(p);
    if (b.dataset.hact === 'edit') openGhEditModal(p);
    if (b.dataset.hact === 'del') {
      if (!confirm('删除项目记录「' + p.name + '」？（不影响 GitHub 上的内容）')) return;
      api('/api/github/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', id: p.id }) }).then(refreshGithub);
    }
  });
}
function openGhPushModal(p) {
  const nextVer = p ? bumpVer(p.version) : '1.0.0';
  openOpModal(`
    <div class="drawer-head"><h3>推送到 GitHub · ${esc(p ? p.name : '新项目')}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">项目名</label><input type="text" id="gpName" value="${esc(p ? p.name : '')}"></div>
      <div class="row"><label style="width:90px">文件路径</label><input type="text" id="gpPath" value="${esc(p ? (p.localPath || '') : '')}" placeholder="D:\\…\\xxx.zip"></div>
      <div class="row"><label style="width:90px">owner</label><input type="text" id="gpOwner" value="${esc(ghCfg.owner || '')}" placeholder="例如 sssylttt07"></div>
      <div class="row"><label style="width:90px">仓库名</label><input type="text" id="gpRepo" value="${esc(ghCfg.repo || '')}" placeholder="仓库需已存在于 GitHub"></div>
      <div class="row"><label style="width:90px">版本号</label><input type="text" id="gpVer" value="${esc(nextVer)}" style="width:120px">
        <span class="muted">会创建 tag v${esc(nextVer)} 并把文件挂到 Release 附件</span></div>
      <div class="row"><label style="width:90px">说明</label><input type="text" id="gpDesc" value="${esc(p ? (p.note || '') : '')}" placeholder="一句话（可留空）"></div>
      <div class="row"><button class="primary" id="gpGo">推送</button><span id="gpMsg" class="muted"></span></div>
      <div class="row"><span class="muted" style="font-size:12px">空仓库会自动先引导一个 README 提交；同名附件会先删旧再传新。owner/仓库会记住为下次默认。</span></div>
    </div>`);
  $('#gpGo').addEventListener('click', async () => {
    const name = $('#gpName').value.trim(), path = normPath($('#gpPath').value);
    const owner = $('#gpOwner').value.trim(), repo = $('#gpRepo').value.trim();
    if (!name) { toast('请填写项目名', true); return; }
    if (!path) { toast('请填写文件路径', true); return; }
    if (!owner || !repo) { toast('请填写 owner 和仓库名', true); return; }
    const btn = $('#gpGo'); btn.disabled = true;
    $('#gpMsg').textContent = '推送中…';
    try {
      const r = await api('/api/github/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name, filePath: path, owner, repo,
        version: $('#gpVer').value.trim(), desc: $('#gpDesc').value.trim()
      }) });
      $('#gpMsg').textContent = '完成：' + (r.actions || []).join(' / ');
      toast('推送成功 ' + r.tag);
      refreshGithub();
    } catch (e) {
      $('#gpMsg').textContent = '失败：' + e.message;
    } finally { btn.disabled = false; }
  });
}
function openGhEditModal(p) {
  openOpModal(`
    <div class="drawer-head"><h3>编辑项目 · ${esc(p.name)}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><label style="width:90px">项目名</label><input type="text" id="geName" value="${esc(p.name)}"></div>
      <div class="row"><label style="width:90px">文件路径</label><input type="text" id="gePath" value="${esc(p.localPath || '')}"></div>
      <div class="row"><label style="width:90px">当前版本</label><input type="text" id="geVer" value="${esc(p.version || '')}" style="width:120px"></div>
      <div class="row"><button class="primary" id="geGo">保存</button></div>
    </div>`);
  $('#geGo').addEventListener('click', async () => {
    await api('/api/github/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      action: 'update', id: p.id,
      name: $('#geName').value.trim(), localPath: normPath($('#gePath').value), version: $('#geVer').value.trim()
    }) });
    toast('已保存'); refreshGithub(); closeMask('#opMask');
  });
}
function openGhSettings() {
  openOpModal(`
    <div class="drawer-head"><h3>GitHub 设置</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="row"><span class="muted">当前账号：${esc(activePactName('github') || '未配置（在「账号管理 → GitHub」里添加令牌）')}</span></div>
      <div class="row"><label style="width:90px">默认 owner</label><input type="text" id="gsOwner" value="${esc(ghCfg.owner || '')}" placeholder="例如 sssylttt07"></div>
      <div class="row"><label style="width:90px">默认仓库</label><input type="text" id="gsRepo" value="${esc(ghCfg.repo || '')}" placeholder="推送弹窗里的预填值，可留空"></div>
      <div class="row"><button class="primary" id="gsGo">保存</button><span id="gsMsg" class="muted"></span></div>
    </div>`);
  $('#gsGo').addEventListener('click', async () => {
    $('#gsMsg').textContent = '保存中…';
    try {
      await api('/api/github/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: '', owner: $('#gsOwner').value.trim(), repo: $('#gsRepo').value.trim() }) });
      await refreshGithub();
      $('#gsMsg').textContent = '已保存';
      toast('设置已保存');
    } catch (e) { $('#gsMsg').textContent = '失败：' + e.message; }
  });
}
$('#btnGhRefresh').addEventListener('click', refreshGithub);
$('#btnGhSettings').addEventListener('click', openGhSettings);
$('#btnGhNew').addEventListener('click', () => openGhPushModal(null));

/* ================= 本地库（扫描 + 手动绑定在线库） ================= */
let libRows = [];

async function refreshLibrary() {
  const dir = normPath($('#libDir').value);
  if (!dir) { $('#libStat').textContent = '请先填库目录'; return; }
  localStorage.setItem('libDir', dir);
  $('#libStat').textContent = '扫描中…';
  if (!themes.length) { try { await refreshThemes(); } catch (e) {} }
  if (!plugins.length) { try { await refreshPlugins(); } catch (e) {} }
  try { if (!giteeProjects.length) await refreshGitee(); } catch (e) {}
  try { if (!ghProjects.length) await refreshGithub(); } catch (e) {}
  try {
    const r = await api('/api/library/scan?dir=' + encodeURIComponent(dir));
    libRows = r.rows || [];
    renderLibrary();
  } catch (e) { $('#libStat').textContent = '扫描失败：' + e.message; }
}
function renderLibrary() {
  const tb = $('#libTable tbody');
  if (!libRows.length) {
    tb.innerHTML = '<tr><td colspan="8" class="muted">没有扫到 .thm / .tpg 文件</td></tr>';
    $('#libStat').textContent = '';
    return;
  }
  const bound = libRows.filter(r => r.binding && (r.binding.hubThemeId || r.binding.hubPluginId || r.binding.giteeProjectId || r.binding.githubProjectId)).length;
  $('#libStat').textContent = libRows.length + ' 个包，' + bound + ' 个已有绑定';
  tb.innerHTML = libRows.map((r, i) => {
    const b = r.binding || {};
    let tavoCell = '<span class="pill warn">未绑</span>';
    if (b.hubThemeId) {
      const t = themes.find(x => String(x.id) === String(b.hubThemeId));
      tavoCell = '<span class="pill ok">主题</span> ' + esc(t ? t.name : (b.hubThemeName || b.hubThemeId));
    } else if (b.hubPluginId) {
      const p = plugins.find(x => String(x.id) === String(b.hubPluginId));
      tavoCell = '<span class="pill ok">插件</span> ' + esc(p ? p.name : b.hubPluginId);
    }
    const gp = b.giteeProjectId ? giteeProjects.find(x => x.id === b.giteeProjectId) : null;
    const giteeCell = b.giteeProjectId ? ('<span class="pill ok">项目</span> ' + esc(gp ? gp.name : b.giteeProjectId)) : '<span class="muted">—</span>';
    const hp = b.githubProjectId ? ghProjects.find(x => x.id === b.githubProjectId) : null;
    const ghCell = b.githubProjectId ? ('<span class="pill ok">项目</span> ' + esc(hp ? hp.name : b.githubProjectId)) : '<span class="muted">—</span>';
    const hasBind = !!(b.hubThemeId || b.hubPluginId || b.giteeProjectId || b.githubProjectId);
    return `<tr>
      <td class="mono" style="max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.file)}">${esc(r.file.split('\\').pop())}</td>
      <td>${r.kind === 'theme' ? '主题' : '插件'}</td>
      <td>${esc(r.name || '?')}</td>
      <td class="mono">${esc(r.version || '—')}</td>
      <td>${tavoCell}</td><td>${giteeCell}</td><td>${ghCell}</td>
      <td><button data-lbind="${i}">${hasBind ? '改绑定' : '绑定'}</button></td>
    </tr>`;
  }).join('');
  $$('#libTable [data-lbind]').forEach(btn => btn.onclick = () => openLibBindModal(libRows[Number(btn.dataset.lbind)]));
}
function openLibBindModal(row) {
  const b = row.binding || {};
  const curTavo = b.hubThemeId ? ('theme:' + b.hubThemeId) : (b.hubPluginId ? ('plugin:' + b.hubPluginId) : '');
  const themeOpts = themes.map(t => `<option value="theme:${esc(t.id)}"${String(b.hubThemeId) === String(t.id) ? ' selected' : ''}>主题 · ${esc(t.name)}（v${esc(t.latest_version || '?')}）</option>`).join('');
  const pluginOpts = plugins.map(p => `<option value="plugin:${esc(p.id)}"${String(b.hubPluginId) === String(p.id) ? ' selected' : ''}>插件 · ${esc(p.name)}</option>`).join('');
  const giteeOpts = giteeProjects.map(p => `<option value="${esc(p.id)}"${b.giteeProjectId === p.id ? ' selected' : ''}>${esc(p.name)}（v${esc(p.version || '?')}）</option>`).join('');
  const ghOpts = ghProjects.map(p => `<option value="${esc(p.id)}"${b.githubProjectId === p.id ? ' selected' : ''}>${esc(p.name)}（v${esc(p.version || '?')}）</option>`).join('');
  openOpModal(`
    <div class="drawer-head"><h3>绑定 · ${esc(row.file.split('\\').pop())}</h3><button class="ghost" data-close>✕</button></div>
    <div class="modal-body">
      <div class="muted">${r.kind === 'theme' ? '主题' : '插件'} · ${esc(row.name || '?')} · v${esc(row.version || '?')}${r.note ? ' · ⚠ ' + esc(r.note) : ''}</div>
      <div class="row"><label style="width:110px">Tavo Hub</label>
        <select id="lbTavo" style="min-width:280px"><option value="">不绑定</option>${themeOpts}${pluginOpts}</select></div>
      <div class="row"><label style="width:110px">Gitee 项目</label>
        <select id="lbGitee"><option value="">不绑定</option>${giteeOpts}</select>
        <span class="muted">${giteeProjects.length ? '' : '（项目推送页还没有 Gitee 项目）'}</span></div>
      <div class="row"><label style="width:110px">GitHub 项目</label>
        <select id="lbGithub"><option value="">不绑定</option>${ghOpts}</select>
        <span class="muted">${ghProjects.length ? '' : '（项目推送页还没有 GitHub 项目）'}</span></div>
      <div class="row"><label style="width:110px">备注</label><input type="text" id="lbNote" value="${esc(b.note || '')}" placeholder="可留空"></div>
      <div class="row"><button class="primary" id="lbGo">保存绑定</button><span id="lbMsg" class="muted"></span></div>
    </div>`);
  // 绑定目标已不在在线列表里（如记录被删）→ 回落到「不绑定」，避免保存时丢目标
  $('#lbTavo').value = curTavo;
  if ($('#lbTavo').value !== curTavo) $('#lbTavo').value = '';
  $('#lbGitee').value = b.giteeProjectId || '';
  if ($('#lbGitee').value !== (b.giteeProjectId || '')) $('#lbGitee').value = '';
  $('#lbGithub').value = b.githubProjectId || '';
  if ($('#lbGithub').value !== (b.githubProjectId || '')) $('#lbGithub').value = '';
  $('#lbGo').addEventListener('click', async () => {
    const tv = $('#lbTavo').value;
    const binding = {
      hubThemeId: tv.indexOf('theme:') === 0 ? tv.slice(6) : '',
      hubThemeName: '',
      hubPluginId: tv.indexOf('plugin:') === 0 ? tv.slice(7) : '',
      giteeProjectId: $('#lbGitee').value,
      githubProjectId: $('#lbGithub').value,
      note: $('#lbNote').value.trim()
    };
    if (binding.hubThemeId) {
      const t = themes.find(x => String(x.id) === binding.hubThemeId);
      binding.hubThemeName = t ? t.name : '';
    }
    try {
      await api('/api/library/bindings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: row.file, binding }) });
      row.binding = binding;
      toast('绑定已保存');
      renderLibrary();
      closeMask('#opMask');
    } catch (e) { $('#lbMsg').textContent = '保存失败：' + e.message; }
  });
}
$('#btnLibScan').addEventListener('click', refreshLibrary);
$('#libDir').value = normPath(localStorage.getItem('libDir') || '');
