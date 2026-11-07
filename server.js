'use strict';
/* Lin Files — 本地文件管理器后端（纯 Node，零依赖）
 * 启动：runtime\node\node.exe server.js
 * 仅监听 127.0.0.1，所有路径操作限制在已添加的文件夹（库）内。
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const ROOT = __dirname;
const CFG_PATH = path.join(ROOT, 'config.json');
const PUBLIC = path.join(ROOT, 'public');
/* 内嵌应用（modules/ 收在包内，零配置可用；cfg.thmDir / cfg.lwpDir / cfg.lwpFile
 * 是可选高级项：指向本机更新的版本以覆盖包内快照，缺失时回落 modules/，再缺失出提示页） */
const MODULES = path.join(ROOT, 'modules');
const THM_MOD = path.join(MODULES, 'lin-thm');
const LWP_MOD = path.join(MODULES, 'lin-work-pro');

/* ---------------- 配置 ---------------- */
let cfg;
try {
  let raw = fs.readFileSync(CFG_PATH, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); /* 容忍 Windows 记事本保存的 UTF-8 BOM */
  cfg = JSON.parse(raw);
} catch { cfg = {}; }
cfg.port = cfg.port || 8765;
if (!Array.isArray(cfg.vaults)) cfg.vaults = [];
/* 相对路径的库按应用根目录解析（发行版 config.example 用相对路径指向内置示例库，换机器可用） */
for (const v of cfg.vaults) {
  if (v && v.path && !path.isAbsolute(v.path)) v.path = path.resolve(ROOT, v.path);
}
if (!cfg.nextVid) cfg.nextVid = 1;
cfg.showHidden = !!cfg.showHidden; /* 显示隐藏文件开关，默认关 */
/* 主题库（.thm 与封面）根目录：可选，手动指定；未配置时主题库页给出设置引导，不影响其他功能 */
cfg.themeCoverView = String(cfg.themeCoverView || '手机916'); /* 截图/封面默认视图名 */
if (!Array.isArray(cfg.favorites)) cfg.favorites = []; /* 收藏（置顶）列表 */

/* 隐藏判定：点开头 / ~$ Office 临时文件 / 常见系统垃圾（$RECYCLE.BIN 等永远隐藏）+ Windows H 属性 */
const SYS_JUNK = /^(desktop\.ini|thumbs\.db|pagefile\.sys|hiberfil\.sys|swapfile\.sys)$/i;
function isHiddenName(n) { return n.startsWith('.') || n.startsWith('~$') || SYS_JUNK.test(n); }

/* Windows 隐藏属性快照（PowerShell Get-ChildItem -Force，Unicode 安全；按目录缓存，变更事件时清空）
 * 注意：必须异步（execAsync）——同步版本会冻结整个服务事件循环，是卡顿元凶 */
const hiddenAttrCache = new Map(); // dirLower -> Set(basenameLower)
async function getHiddenSet(dir) {
  const key = dir.toLowerCase();
  let set = hiddenAttrCache.get(key);
  if (set) return set;
  set = new Set();
  try {
    const esc = dir.replace(/'/g, "''");
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-ChildItem -Force -Attributes Hidden -LiteralPath '${esc}' -Name)"`,
      { timeout: 8000, windowsHide: true, encoding: 'utf8', maxBuffer: 4e6 }
    );
    for (const line of String(stdout).split(/\r?\n/)) {
      const n = line.trim();
      if (n) set.add(n.toLowerCase());
    }
  } catch {}
  hiddenAttrCache.set(key, set);
  return set;
}
function saveCfg() { fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2), 'utf8'); }

/* ---------------- 基础工具 ---------------- */
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.xml': 'text/xml; charset=utf-8', '.zip': 'application/zip',
  '.thm': 'application/zip'
};
function mimeOf(name) { return MIME[path.extname(name).toLowerCase()] || 'application/octet-stream'; }

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash', '$RECYCLE.BIN', 'System Volume Information']);
const BIN_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.zip', '.thm',
  '.7z', '.rar', '.gz', '.exe', '.dll', '.pdf', '.mp3', '.mp4', '.mov', '.avi', '.mkv', '.wav',
  '.flac', '.ogg', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.db', '.sqlite', '.bin', '.dat',
  '.class', '.jar', '.psd', '.ai', '.sketch', '.wmv', '.webm']);

function getVault(vid) {
  const v = cfg.vaults.find(x => x.id === String(vid));
  if (!v) throw httpErr(404, '找不到该文件夹（可能已被移除）');
  return v;
}
function safeJoin(base, rel) {
  const parts = String(rel || '').replace(/\\/g, '/').split('/').filter(p => p && p !== '.');
  if (parts.some(p => p === '..')) throw httpErr(400, '路径不合法');
  const full = path.resolve(path.join(base, ...parts));
  const b = path.resolve(base);
  if (full !== b && !full.startsWith(b + path.sep)) throw httpErr(400, '路径越界');
  return full;
}
const NAME_BAD = /[\\/:*?"<>|]/;
function checkName(name) {
  if (!name || name === '.' || name === '..' || NAME_BAD.test(name)) throw httpErr(400, '名称为空或含非法字符 \\/:*?"<>|');
  return name;
}
function decodeSafe(s) { try { return decodeURIComponent(s); } catch { throw httpErr(400, 'URL 编码错误'); } }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let len = 0;
    req.on('data', c => { len += c.length; if (len > 30e6) { reject(httpErr(413, '内容过大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

/* ---------------- ZIP 解析（最小实现，支持 store/deflate） ---------------- */
function parseZip(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 65558);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw httpErr(400, '不是有效的 ZIP 文件（找不到目录结尾）');
  const count = buf.readUInt16LE(eocd + 10);
  if (count === 0xffff) throw httpErr(400, '暂不支持 ZIP64 格式的大压缩包');
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count && off + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const rawName = buf.slice(off + 46, off + 46 + nameLen);
    const name = (flags & 0x800) ? rawName.toString('utf8') : rawName.toString('latin1');
    entries.push({ name, method, csize, usize, localOff, dir: name.endsWith('/') });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function zipEntry(buf, e) {
  const lnLen = buf.readUInt16LE(e.localOff + 26);
  const leLen = buf.readUInt16LE(e.localOff + 28);
  const start = e.localOff + 30 + lnLen + leLen;
  const data = buf.slice(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return zlib.inflateRawSync(data);
  throw httpErr(400, `不支持的压缩方式（method=${e.method}）`);
}

/* ---------------- 主题库（Tavo .thm / 封面） ---------------- */
const THEME_EXT = '.thm';
const IMG_RE = /\.(png|jpe?g|webp)$/i;
/* 旧版本归档不参与主题库 */
const SKIP_THEME_DIRS = new Set(['旧版本主题存档', '旧版本归档', '旧版本', '历史版本', 'old', 'archive']);

function themeRoot() {
  const r = String(cfg.themeLib || '').trim();
  if (!r) throw httpErr(400, '未设置主题库目录');
  const full = path.resolve(r);
  if (!fs.existsSync(full)) throw httpErr(400, '主题库目录不存在：' + full);
  return full;
}
function insideThemeRoot(relOrAbs) {
  const base = themeRoot();
  const full = path.resolve(base, String(relOrAbs || ''));
  if (full !== base && !full.startsWith(base + path.sep)) throw httpErr(403, '拒绝访问');
  return full;
}
/* 主题显示名 / 封面基名：去掉文件名里的修复后缀 */
function themeBaseName(fileOrDir) {
  return path.basename(fileOrDir, path.extname(fileOrDir)).replace(/-(变色修复|按钮修复|修复版)$/u, '');
}
function relOf(full) { return path.relative(themeRoot(), full).replace(/\\/g, '/'); }

/* 找某个主题对应的封面：同目录优先，其次同目录下的封面子文件夹。
 * 命中优先级：完全同名 > 主题名（视图）> 主题名前缀 */
function findThemeCover(thmAbs) {
  const dir = path.dirname(thmAbs);
  const base = themeBaseName(thmAbs);
  const hits = [];
  const consider = (full, score) => {
    let st; try { st = fs.statSync(full); } catch { return; }
    hits.push({ full, score, mtime: st.mtimeMs, size: st.size });
  };
  const scanDir = (d, inSub) => {
    let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of list) {
      if (!ent.isFile() || !IMG_RE.test(ent.name)) continue;
      const n = ent.name.replace(IMG_RE, '');
      if (n === base) consider(path.join(d, ent.name), inSub ? 95 : 100);
      else if (n.startsWith(base + '（') || n.startsWith(base + '(')) consider(path.join(d, ent.name), inSub ? 90 : 92);
      else if (n.startsWith(base)) consider(path.join(d, ent.name), inSub ? 80 : 85);
    }
  };
  scanDir(dir, false);
  let subs = [];
  try { subs = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !SKIP_THEME_DIRS.has(e.name) && !e.name.startsWith('.')); } catch {}
  for (const s of subs) scanDir(path.join(dir, s.name), true);
  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return hits[0];
}

/* 扫描主题库：所有 .thm + 已解析到的封面 */
function scanThemeLib() {
  const root = themeRoot();
  const themes = [];
  const covers = [];
  const seenCover = new Set();
  const walk = (d) => {
    let list; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of list) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith('.') || SKIP_THEME_DIRS.has(ent.name) || SKIP_DIRS.has(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!ent.name.toLowerCase().endsWith(THEME_EXT)) continue;
      let st; try { st = fs.statSync(full); } catch { continue; }
      const cv = findThemeCover(full);
      const item = {
        rel: relOf(full),
        name: themeBaseName(ent.name),
        fileName: ent.name,
        series: relOf(d) === '' ? '' : relOf(d),
        size: st.size,
        mtime: st.mtimeMs,
        cover: cv ? { rel: relOf(cv.full), name: path.basename(cv.full), mtime: cv.mtime, size: cv.size } : null,
      };
      themes.push(item);
      if (cv && !seenCover.has(cv.full)) {
        seenCover.add(cv.full);
        covers.push({ rel: relOf(cv.full), name: path.basename(cv.full), themeRel: item.rel, themeName: item.name, mtime: cv.mtime, size: cv.size });
      }
    }
  };
  walk(root);
  themes.sort((a, b) => b.mtime - a.mtime);
  covers.sort((a, b) => b.mtime - a.mtime);
  return { root, themes, covers };
}

function pipeFile(res, full) {
  const st = fs.statSync(full);
  res.writeHead(200, { 'Content-Type': mimeOf(full), 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

/* 保存封面：同名覆盖，且清掉同一主题的其它视图封面（一主题一张） */
function saveThemeCover(themeRel, view, buf) {
  const thmAbs = insideThemeRoot(themeRel);
  if (!fs.existsSync(thmAbs)) throw httpErr(404, '主题文件不存在');
  const base = themeBaseName(thmAbs);
  const existing = findThemeCover(thmAbs);
  /* 统一规则：封面永远和 .thm 同目录（2026-11-02 用户要求，方便一一对应查找） */
  const dir = path.dirname(thmAbs);
  /* 若旧封面在别的子目录（历史遗留），顺手清掉，避免同一主题两张封面 */
  if (existing && path.dirname(existing.full) !== dir) {
    try { fs.unlinkSync(existing.full); } catch {}
  }
  const safeView = String(view || cfg.themeCoverView || '手机916').replace(/[\\/:*?"<>|]/g, '_').trim() || '手机916';
  const target = path.join(dir, `${base}（${safeView}）.png`);
  fs.writeFileSync(target, buf);
  const removed = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !IMG_RE.test(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (full === target) continue;
    const n = ent.name.replace(IMG_RE, '');
    if (n === base || n.startsWith(base + '（') || n.startsWith(base + '(')) {
      try { fs.unlinkSync(full); removed.push(ent.name); } catch {}
    }
  }
  return { path: target, rel: relOf(target), name: path.basename(target), removed };
}

/* ---------------- 递归遍历 / 搜索 ---------------- */
function walkSync(dir, cb, prefix = '') {
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of list) {
    if (SKIP_DIRS.has(ent.name)) continue;
    if (!cfg.showHidden && isHiddenName(ent.name)) continue;
    const rel = prefix ? prefix + '/' + ent.name : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSync(full, cb, rel);
    else if (ent.isFile()) cb(rel, full);
  }
}
function flatFiles(vault) {
  const out = [];
  walkSync(vault.path, rel => { if (out.length < 30000) out.push(rel); });
  return out;
}
function doSearch(vault, q) {
  const ql = q.toLowerCase();
  const results = []; const t0 = Date.now();
  walkSync(vault.path, (rel, full) => {
    if (results.length >= 200 || Date.now() - t0 > 8000) return;
    if (BIN_EXT.has(path.extname(rel).toLowerCase())) return;
    let st; try { st = fs.statSync(full); } catch { return; }
    if (st.size > 1024 * 1024) return;
    let text; try { text = fs.readFileSync(full, 'utf8'); } catch { return; }
    if (text.includes('\u0000')) return;
    const nameHit = path.basename(rel).toLowerCase().includes(ql);
    const low = text.toLowerCase();
    let idx = low.indexOf(ql), count = 0;
    while (idx !== -1) { count++; idx = low.indexOf(ql, idx + ql.length); }
    if (!count && !nameHit) return;
    const snippets = [];
    if (count) {
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length && snippets.length < 3; i++) {
        if (lines[i].toLowerCase().includes(ql)) snippets.push({ line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
    }
    results.push({ rel, count, nameHit, snippets });
  });
  return results;
}

/* ---------------- 回收站删除 / 系统打开 ---------------- */
function recycle(p, isDir) {
  return new Promise(resolve => {
    const esc = p.replace(/'/g, "''");
    const fn = isDir ? 'DeleteDirectory' : 'DeleteFile';
    const cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${fn}('${esc}','OnlyErrorDialogs','SendToRecycleBin')"`;
    exec(cmd, { timeout: 30000, windowsHide: true }, err => resolve(!err));
  });
}
function shellOpen(full, reveal) {
  if (reveal) {
    exec(`explorer /select,"${full}"`);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    exec(`start "" "${full}"`, { windowsHide: true, timeout: 10000 }, err => err ? reject(httpErr(500, '系统打开失败')) : resolve());
  });
}

/* ---------------- 文件监视 + SSE 推送 ---------------- */
const sseClients = new Set();
const watchers = new Map();
const pendingEv = new Map();
let evTimer = null;

function broadcast(obj) {
  const s = `data: ${JSON.stringify(obj)}\n\n`;
  for (const c of sseClients) { try { c.res.write(s); } catch { sseClients.delete(c); } }
}
function scheduleEvent(vid, rel) {
  let s = pendingEv.get(vid);
  if (!s) pendingEv.set(vid, s = new Set());
  s.add(rel);
  if (!evTimer) evTimer = setTimeout(() => {
    evTimer = null;
    for (const [v, dirs] of pendingEv) {
      /* 只清被改动路径自身的属性缓存（及其父目录），不清整库——防止整盘库的事件风暴反复触发 PS */
      const vault = cfg.vaults.find(x => x.id === v);
      if (vault) {
        const rootLower = path.resolve(vault.path).toLowerCase();
        for (const fname of dirs) {
          const full = path.resolve(vault.path, String(fname || ''));
          const fl = full.toLowerCase();
          if (!fl.startsWith(rootLower)) continue;
          hiddenAttrCache.delete(fl);
          if (fl !== rootLower) hiddenAttrCache.delete(path.dirname(fl));
        }
      }
      broadcast({ vid: v, dirs: [...dirs] });
    }
    pendingEv.clear();
  }, 300);
}
/* fs.watch 健壮版：整盘库高频写入易触发缓冲溢出（error），出错后指数退避重建，而不是永久聋掉 */
const watchRetryTimers = new Map();
function startWatch(vault) {
  if (watchers.has(vault.id) || watchRetryTimers.has(vault.id)) return;
  tryWatch(vault, 0);
}
function tryWatch(vault, attempt) {
  if (watchers.has(vault.id)) return;
  let w;
  try {
    w = fs.watch(vault.path, { recursive: true }, (ev, fname) => scheduleEvent(vault.id, fname || ''));
  } catch { return retryWatch(vault, attempt); }
  w.on('error', () => {
    try { w.close(); } catch {}
    if (watchers.get(vault.id) === w) watchers.delete(vault.id);
    retryWatch(vault, attempt);
  });
  watchers.set(vault.id, w);
}
function retryWatch(vault, attempt) {
  if (watchers.has(vault.id) || attempt > 12) return;
  const delay = Math.min(30000, 800 * Math.pow(2, attempt));
  const t = setTimeout(() => { watchRetryTimers.delete(vault.id); tryWatch(vault, attempt + 1); }, delay);
  t.unref();
  watchRetryTimers.set(vault.id, t);
}
function stopWatch(vid) {
  const w = watchers.get(vid); if (w) { try { w.close(); } catch {} watchers.delete(vid); }
  const t = watchRetryTimers.get(vid); if (t) { clearTimeout(t); watchRetryTimers.delete(vid); }
}

/* ---------------- .bak 与发布状态 ---------------- */
function bakDirFor(vid) { return path.join(ROOT, 'data', 'bak', vid); }
function bakKeyFor(rel) { return String(rel).replace(/[\\/]/g, '__'); }

/* 服务端代理拉取 Lin Hub 的主题上架状态（缓存 2 分钟，避免每次渲染都拉 10MB 列表） */
let hubPubCache = { t: 0, data: null };
function fetchHubText(hpath) {
  return new Promise((resolve, reject) => {
    const rq = http.get({ host: '127.0.0.1', port: 8791, path: hpath, timeout: 90000, headers: { Host: 'localhost:8791' } }, rs => {
      let d = ''; rs.on('data', c => d += c); rs.on('end', () => resolve(d));
    });
    rq.on('timeout', () => { rq.destroy(); reject(new Error('timeout')); });
    rq.on('error', reject);
  });
}
async function getHubPubStatus() {
  const now = Date.now();
  const ttl = hubPubCache.data && hubPubCache.data.ok ? 600000 : 30000; /* 成功缓存 10 分钟，失败 30 秒后重试 */
  if (hubPubCache.data && now - hubPubCache.t < ttl) return hubPubCache.data;
  try {
    const raw = await fetchHubText('/api/themes');
    const items = (JSON.parse(raw).items) || [];
    const themes = {};
    for (const it of items) {
      themes[String(it.name)] = { published: it.published_version || '', latest: it.latest_version || '' };
    }
    hubPubCache = { t: now, data: { ok: true, themes } };
  } catch (e) {
    hubPubCache = { t: now, data: { ok: false, themes: {} } };
  }
  return hubPubCache.data;
}

/* ---------------- RB（rubii.ai）直推代理（0.4.5e 起，LinWork Pro「⤴ 推送 RB 草稿」经此调用） ----------------
   登录头存 data\rb_auth.json（不进 config.json；删除该文件＝登出）。服务只绑 127.0.0.1；
   代理目标硬编码 rubii.ai，防止被当成任意主机开放代理。 */
const RB_AUTH_PATH = path.join(ROOT, 'data', 'rb_auth.json');
function rbAuthLoad() { try { return JSON.parse(fs.readFileSync(RB_AUTH_PATH, 'utf8')); } catch { return {}; } }
function rbAuthSave(o) { fs.mkdirSync(path.dirname(RB_AUTH_PATH), { recursive: true }); fs.writeFileSync(RB_AUTH_PATH, JSON.stringify(o, null, 2), 'utf8'); }
/* RB 响应头滚动续期：服务端轮换时经 X-New-Access-Token / X-New-Refresh-Token 下发，出现即更新本地 */
function rbAuthRoll(rh) {
  if (!rh) return;
  const na = rh['x-new-access-token'], nr = rh['x-new-refresh-token'];
  if (!na && !nr) return;
  const a = rbAuthLoad();
  if (na) a.headers = Object.assign({}, a.headers, { Authorization: 'Bearer ' + na });
  if (nr) a.refreshToken = nr;
  a.updatedAt = new Date().toISOString();
  rbAuthSave(a);
}
function rbCall(method, rpath, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const rq = https.request({
      host: 'rubii.ai', method, path: rpath, timeout: 30000,
      headers: Object.assign({
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      }, headers || {}, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
    }, rs => {
      let d = ''; rs.on('data', c => d += c);
      rs.on('end', () => resolve({ status: rs.statusCode, headers: rs.headers, text: d }));
    });
    rq.on('timeout', () => { rq.destroy(); reject(new Error('RB 请求超时')); });
    rq.on('error', reject);
    if (data) rq.write(data);
    rq.end();
  });
}

/* ---------------- API 处理 ---------------- */
async function api(req, res, u) {
  const p = u.pathname;
  const q = u.searchParams;
  const method = req.method;

  if (method === 'GET' && p === '/api/debug') {
    return sendJSON(res, 200, {
      watchers: [...watchers.keys()],
      retries: [...watchRetryTimers.keys()],
      sseClients: sseClients.size,
      hiddenCache: hiddenAttrCache.size,
    });
  }

  if (method === 'GET' && p === '/api/ping') return sendJSON(res, 200, { app: 'lin-files' });

  /* 探测 Lin Hub（8791）是否在运行（页面跨端口无法直接 fetch，由服务端代理） */
  if (method === 'GET' && p === '/api/hubping') {
    let ok = false;
    try {
      const body = await new Promise((resolve, reject) => {
        const rq = http.get({ host: '127.0.0.1', port: 8791, path: '/', timeout: 2500, headers: { Host: 'localhost:8791' } }, rs => {
          let d = ''; rs.on('data', c => d += c); rs.on('end', () => resolve(d));
        });
        rq.on('timeout', () => { rq.destroy(); reject(new Error('timeout')); });
        rq.on('error', reject);
      });
      ok = body.includes('Lin Hub');
    } catch {}
    return sendJSON(res, 200, { ok });
  }

  /* 启动联动：拉起 Lin Hub 的隐藏服务（等端口就绪再返回）。
     默认用包内 modules/lin-hub/launcher.ps1（随包分发，零配置）；
     config.json 的 linHubScript 是可选高级项：指向本机另一份 Lin Hub 的启动脚本（覆盖包内版本） */
  if (method === 'POST' && p === '/api/starthub') {
    if (process.platform !== 'win32') return sendJSON(res, 200, { ok: false, error: 'Lin Hub 仅支持 Windows（需要 PowerShell 5.1），当前系统是 ' + process.platform });
    let hubPs = String(cfg.linHubScript || '').trim();
    if (!hubPs) hubPs = path.join(ROOT, 'modules', 'lin-hub', 'launcher.ps1');
    if (!fs.existsSync(hubPs)) return sendJSON(res, 400, { ok: false, error: '未找到 Lin Hub 启动脚本（包内 modules/lin-hub/ 缺失；或 config.json 的 linHubScript 指向不存在的文件）' });
    const already = await new Promise(resolve => {
      const rq = http.get({ host: '127.0.0.1', port: 8791, path: '/', timeout: 1500, headers: { Host: 'localhost:8791' } }, rs => { resolve(true); rs.resume(); });
      rq.on('timeout', () => { rq.destroy(); resolve(false); });
      rq.on('error', () => resolve(false));
    });
    if (!already) {
      exec(`start "" /min powershell -NoProfile -ExecutionPolicy Bypass -File "${hubPs}"`, { windowsHide: true, shell: 'cmd.exe' });
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500));
        const up = await new Promise(resolve => {
          const rq = http.get({ host: '127.0.0.1', port: 8791, path: '/', timeout: 1500, headers: { Host: 'localhost:8791' } }, rs => { resolve(true); rs.resume(); });
          rq.on('timeout', () => { rq.destroy(); resolve(false); });
          rq.on('error', () => resolve(false));
        });
        if (up) break;
      }
    }
    const finalUp = await new Promise(resolve => {
      const rq = http.get({ host: '127.0.0.1', port: 8791, path: '/', timeout: 2000, headers: { Host: 'localhost:8791' } }, rs => { resolve(true); rs.resume(); });
      rq.on('timeout', () => { rq.destroy(); resolve(false); });
      rq.on('error', () => resolve(false));
    });
    return sendJSON(res, 200, { ok: finalUp });
  }

  /* 收藏（置顶）管理：存 config.json */
  if (method === 'GET' && p === '/api/favorites') {
    if (!Array.isArray(cfg.favorites)) cfg.favorites = [];
    return sendJSON(res, 200, cfg.favorites);
  }
  if (method === 'POST' && p === '/api/favorites') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!Array.isArray(cfg.favorites)) cfg.favorites = [];
    if (body.action === 'add') {
      const item = { vid: String(body.vid), rel: String(body.rel) };
      if (!cfg.favorites.some(f => f.vid === item.vid && f.rel === item.rel)) cfg.favorites.push(item);
    } else if (body.action === 'remove') {
      cfg.favorites = cfg.favorites.filter(f => !(f.vid === String(body.vid) && f.rel === String(body.rel)));
    }
    saveCfg();
    return sendJSON(res, 200, cfg.favorites);
  }

  /* 外部拖入的二进制落盘（base64 → 文件，覆盖已有文件前留 .bak） */
  if (method === 'POST' && p === '/api/writebin') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    const buf = Buffer.from(String(body.data || ''), 'base64');
    if (!buf.length) throw httpErr(400, '内容为空');
    if (fs.existsSync(full)) {
      try {
        const bakDir = path.join(ROOT, 'data', 'bak', v.id);
        await fsp.mkdir(bakDir, { recursive: true });
        const key = String(body.rel).replace(/[\\/]/g, '__');
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        await fsp.copyFile(full, path.join(bakDir, `${key}.${ts}.binbak`));
      } catch {}
    }
    await fsp.writeFile(full, buf);
    const st = await fsp.stat(full);
    scheduleEvent(v.id, path.dirname(String(body.rel)));
    return sendJSON(res, 200, { ok: true, size: st.size, mtime: st.mtimeMs });
  }

  if (method === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write(': ok\n\n');
    const client = { res };
    sseClients.add(client);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(hb); sseClients.delete(client); });
    return;
  }

  if (method === 'GET' && p === '/api/settings') return sendJSON(res, 200, { showHidden: !!cfg.showHidden });

  if (method === 'POST' && p === '/api/settings') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    cfg.showHidden = !!body.showHidden; saveCfg();
    return sendJSON(res, 200, { showHidden: cfg.showHidden });
  }

  if (method === 'GET' && p === '/api/vaults') return sendJSON(res, 200, cfg.vaults);

  if (method === 'POST' && p === '/api/vaults') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (body.action === 'add') {
      const full = path.resolve(String(body.path || ''));
      let st; try { st = await fsp.stat(full); } catch { throw httpErr(400, '文件夹不存在'); }
      if (!st.isDirectory()) throw httpErr(400, '请选择文件夹而不是文件');
      if (cfg.vaults.some(v => path.resolve(v.path).toLowerCase() === full.toLowerCase())) throw httpErr(400, '这个文件夹已经在管理器里了');
      const vault = { id: String(cfg.nextVid++), name: path.basename(full) || full, path: full };
      cfg.vaults.push(vault); saveCfg(); startWatch(vault);
      return sendJSON(res, 200, vault);
    }
    if (body.action === 'remove') {
      const i = cfg.vaults.findIndex(v => v.id === String(body.id));
      if (i < 0) throw httpErr(404, '找不到该库');
      const [v] = cfg.vaults.splice(i, 1); saveCfg(); stopWatch(v.id);
      return sendJSON(res, 200, { ok: true });
    }
    if (body.action === 'rename') {
      const v = getVault(body.id);
      v.name = checkName(String(body.name || '')).trim() || v.name; saveCfg();
      return sendJSON(res, 200, v);
    }
    throw httpErr(400, '未知操作');
  }

  if (method === 'POST' && p === '/api/browse') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.path) {
      const drives = [];
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i) + ':\\';
        try { if (fs.statSync(letter).isDirectory()) drives.push({ name: String.fromCharCode(i) + ':', path: letter }); } catch {}
      }
      return sendJSON(res, 200, { drives, dirs: [], path: '', parent: null });
    }
    const full = path.resolve(String(body.path));
    let list; try { list = await fsp.readdir(full, { withFileTypes: true }); } catch { return sendJSON(res, 200, { drives: [], dirs: [], path: full, parent: path.dirname(full), error: '无法读取该文件夹' }); }
    const dirs = list.filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name)).map(e => e.name).sort(collator.compare);
    return sendJSON(res, 200, { drives: [], dirs, path: full, parent: path.dirname(full) });
  }

  /* ---- 以下接口都带 vid ---- */
  if (p === '/api/ls' && method === 'GET') {
    const v = getVault(q.get('vid'));
    const full = safeJoin(v.path, q.get('rel') || '');
    const list = await fsp.readdir(full, { withFileTypes: true }).catch(() => { throw httpErr(400, '无法读取文件夹'); });
    const entries = [];
    let hiddenSet = null;
    for (const e of list) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (!cfg.showHidden) {
        if (isHiddenName(e.name)) continue;
        if (hiddenSet === null) hiddenSet = await getHiddenSet(full);
        if (hiddenSet.has(e.name.toLowerCase())) continue;
      }
      try {
        const st = await fsp.stat(path.join(full, e.name));
        entries.push({ name: e.name, dir: e.isDirectory(), size: st.size, mtime: st.mtimeMs });
      } catch { entries.push({ name: e.name, dir: e.isDirectory(), size: 0, mtime: 0 }); }
    }
    entries.sort((a, b) => (a.dir !== b.dir) ? (a.dir ? -1 : 1) : collator.compare(a.name, b.name));
    return sendJSON(res, 200, { entries });
  }

  if (p === '/api/read' && method === 'GET') {
    const v = getVault(q.get('vid'));
    const full = safeJoin(v.path, q.get('rel') || '');
    const st = await fsp.stat(full).catch(() => { throw httpErr(404, '文件不存在'); });
    if (st.isDirectory()) throw httpErr(400, '这是文件夹');
    if (st.size > 8 * 1024 * 1024) return sendJSON(res, 200, { tooBig: true, size: st.size, mtime: st.mtimeMs });
    const buf = await fsp.readFile(full);
    let binary = false;
    const head = buf.slice(0, 8000);
    for (let i = 0; i < head.length; i++) if (head[i] === 0) { binary = true; break; }
    let text = binary ? '' : buf.toString('utf8');
    if (!binary && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return sendJSON(res, 200, { binary, size: st.size, mtime: st.mtimeMs, text });
  }

  if (method === 'POST' && p === '/api/write') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    /* 覆盖已有文件前留 .bak（每文件保留最近 3 份），存 data\bak\<vid>\ 下 */
    if (fs.existsSync(full)) {
      try {
        const bakDir = path.join(ROOT, 'data', 'bak', v.id);
        await fsp.mkdir(bakDir, { recursive: true });
        const key = String(body.rel).replace(/[\\/]/g, '__');
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        await fsp.copyFile(full, path.join(bakDir, `${key}.${ts}.bak`));
        const olds = (await fsp.readdir(bakDir))
          .filter(f => f.startsWith(key + '.') && f.endsWith('.bak'))
          .sort().reverse();
        for (const f of olds.slice(3)) await fsp.unlink(path.join(bakDir, f)).catch(() => {});
      } catch {}
    }
    await fsp.writeFile(full, String(body.content ?? ''), 'utf8');
    const st = await fsp.stat(full);
    scheduleEvent(v.id, path.relative(v.path, path.dirname(full)));
    return sendJSON(res, 200, { ok: true, size: st.size, mtime: st.mtimeMs });
  }

  if (method === 'POST' && p === '/api/touch') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    checkName(path.basename(String(body.rel || ''))); /* 只校验新文件名本身 */
    if (fs.existsSync(full)) throw httpErr(400, '同名文件已存在');
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, '', 'utf8');
    scheduleEvent(v.id, path.relative(v.path, path.dirname(full)));
    return sendJSON(res, 200, { ok: true });
  }

  if (method === 'POST' && p === '/api/mkdir') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    checkName(path.basename(String(body.rel || ''))); /* 只校验新文件夹名本身 */
    if (fs.existsSync(full)) throw httpErr(400, '同名文件夹已存在');
    await fsp.mkdir(full);
    scheduleEvent(v.id, path.relative(v.path, path.dirname(full)));
    return sendJSON(res, 200, { ok: true });
  }

  if (method === 'POST' && p === '/api/rename') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    const name = checkName(String(body.name || ''));
    const target = path.join(path.dirname(full), name);
    if (fs.existsSync(target)) throw httpErr(400, '同名文件已存在');
    await fsp.rename(full, target);
    const dirRel = path.relative(v.path, path.dirname(full));
    scheduleEvent(v.id, dirRel);
    return sendJSON(res, 200, { ok: true, name });
  }

  if (method === 'POST' && p === '/api/move') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const src = safeJoin(v.path, body.from);
    const dstDir = safeJoin(v.path, body.toDir);
    let dstst; try { dstst = await fsp.stat(dstDir); } catch { throw httpErr(400, '目标文件夹不存在'); }
    if (!dstst.isDirectory()) throw httpErr(400, '目标不是文件夹');
    const dst = path.join(dstDir, path.basename(src));
    if (dst === src) return sendJSON(res, 200, { ok: true });
    if (dst.startsWith(src + path.sep)) throw httpErr(400, '不能移动到它自己的子文件夹里');
    if (fs.existsSync(dst)) throw httpErr(400, '目标位置已有同名文件');
    try { await fsp.rename(src, dst); }
    catch (e) {
      if (e.code === 'EXDEV') { await fsp.cp(src, dst, { recursive: true }); await fsp.rm(src, { recursive: true, force: true }); }
      else throw e;
    }
    scheduleEvent(v.id, path.relative(v.path, path.dirname(src)));
    scheduleEvent(v.id, path.relative(v.path, dstDir));
    return sendJSON(res, 200, { ok: true });
  }

  if (method === 'POST' && p === '/api/delete') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    let st; try { st = await fsp.stat(full); } catch { throw httpErr(404, '文件不存在'); }
    const recycled = await recycle(full, st.isDirectory());
    if (!recycled) await fsp.rm(full, { recursive: true, force: true });
    scheduleEvent(v.id, path.relative(v.path, path.dirname(full)));
    return sendJSON(res, 200, { ok: true, recycled });
  }

  if (method === 'POST' && p === '/api/openfile') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    await shellOpen(full, !!body.reveal);
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/zip' && method === 'GET') {
    const v = getVault(q.get('vid'));
    const full = safeJoin(v.path, q.get('rel') || '');
    const st = await fsp.stat(full).catch(() => { throw httpErr(404, '文件不存在'); });
    const buf = await fsp.readFile(full);
    const entries = parseZip(buf).map(e => ({ name: e.name, dir: e.dir, size: e.usize, csize: e.csize, method: e.method }));
    return sendJSON(res, 200, { entries, size: st.size, mtime: st.mtimeMs });
  }

  if (p === '/api/zipentry' && method === 'GET') {
    const v = getVault(q.get('vid'));
    const full = safeJoin(v.path, q.get('rel') || '');
    const entryName = q.get('entry') || '';
    const buf = await fsp.readFile(full);
    const entries = parseZip(buf);
    const e = entries.find(x => x.name === entryName);
    if (!e) throw httpErr(404, '压缩包里没有这个文件');
    const data = zipEntry(buf, e);
    if (q.get('raw') === '1') {
      res.writeHead(200, { 'Content-Type': mimeOf(e.name), 'Cache-Control': 'no-cache' });
      return res.end(data);
    }
    let binary = false;
    const head = data.slice(0, 8000);
    for (let i = 0; i < head.length; i++) if (head[i] === 0) { binary = true; break; }
    return sendJSON(res, 200, { binary, text: binary ? '' : data.toString('utf8') });
  }

  if (method === 'POST' && p === '/api/extract') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const full = safeJoin(v.path, body.rel);
    const buf = await fsp.readFile(full);
    const entries = parseZip(buf);
    const base = path.basename(body.rel).replace(/\.(zip|thm)$/i, '');
    let dest = path.join(path.dirname(full), base);
    for (let i = 2; fs.existsSync(dest); i++) dest = path.join(path.dirname(full), `${base} ${i}`);
    let n = 0;
    for (const e of entries) {
      if (e.dir) continue;
      const parts = e.name.split('/').filter(x => x && x !== '.' && x !== '..');
      if (!parts.length) continue;
      const target = path.join(dest, ...parts);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, zipEntry(buf, e));
      n++;
    }
    scheduleEvent(v.id, path.relative(v.path, path.dirname(full)));
    return sendJSON(res, 200, { dest, count: n });
  }

  if (method === 'POST' && p === '/api/openpath') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const target = String(body.path || '');
    if (/^https?:/i.test(target)) { await shellOpen(target, false); return sendJSON(res, 200, { ok: true }); }
    await fsp.stat(target).catch(() => { throw httpErr(404, '目标不存在'); });
    await shellOpen(target, !!body.reveal);
    return sendJSON(res, 200, { ok: true });
  }

  if (p === '/api/lnk' && method === 'GET') {
    const v = getVault(q.get('vid'));
    const full = safeJoin(v.path, q.get('rel') || '');
    const e = path.extname(full).toLowerCase();
    if (e === '.url') {
      let text = ''; try { text = fs.readFileSync(full, 'utf8'); } catch {}
      const m = text.match(/^URL=(.+)$/im);
      return sendJSON(res, 200, { url: m ? m[1].trim() : '' });
    }
    if (e !== '.lnk') throw httpErr(400, '不是快捷方式');
    const target = await new Promise(resolve => {
      const esc = full.replace(/'/g, "''");
      exec(`powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ws = New-Object -ComObject WScript.Shell; $l = $ws.CreateShortcut('${esc}'); Write-Output $l.TargetPath"`,
        { timeout: 10000, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout || '').trim()));
    });
    let isDir = false, exists = false;
    if (target) {
      try { const st = await fsp.stat(target); exists = true; isDir = st.isDirectory(); } catch {}
    }
    return sendJSON(res, 200, { target, isDir, exists });
  }

  if (method === 'POST' && p === '/api/cardscan') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const results = [];
    let scanned = 0;
    walkSync(v.path, (rel, full) => {
      if (results.length >= 500 || scanned >= 3000) return;
      scanned++;
      const e = path.extname(rel).toLowerCase();
      try {
        const st = fs.statSync(full);
        if (st.size > 4 * 1024 * 1024) return;
        if (e === '.json') {
          let obj;
          try { obj = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { return; }
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
          let kind = null;
          if ('wb_md' in obj || 'cardFields' in obj || ('ds' in obj && 'cc_md' in obj)) kind = 'archive';
          else if (obj.entries && typeof obj.entries === 'object') {
            const vals = Array.isArray(obj.entries) ? obj.entries : Object.values(obj.entries);
            if (vals.some(x => x && typeof x === 'object' && (('key' in x) || ('keys' in x) || ('content' in x) || ('content' in (x && x.data || {}))))) kind = 'worldbook';
          }
          if (!kind && (obj.spec === 'chara_card_v2' || obj.spec === 'chara_card_v3')) kind = 'card';
          if (!kind) {
            const d = obj.data || obj;
            if (d && typeof d === 'object' && d.name && (d.description != null || d.personality != null || d.first_mes != null || d.character_book || d.scenario != null)) kind = 'card';
          }
          if (kind) {
            const nm = (obj.data && obj.data.name) || obj.name || path.basename(rel, e);
            /* 找配图：优先「角色名_版本号」，没有对应版本就用「角色名_1.0」 */
            let ver = (obj.data && obj.data.character_version) || obj.character_version || '';
            ver = String(ver).slice(0, 24).trim();
            let imgRel = null;
            try {
              const dirAbs = path.dirname(full);
              const dirRel = path.dirname(rel);
              const base = path.basename(rel, e);
              const nmStr = String(nm);
              const vKey = nmStr + '_' + (ver || '1.0');
              const v10Key = nmStr + '_1.0';
              const cands = [];
              const scanDir = (d, rankBase, dirRelFor) => {
                let list;
                try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
                for (const f2 of list) {
                  if (!f2.isFile() || !/\.(png|jpe?g|webp)$/i.test(f2.name)) continue;
                  const fb = path.basename(f2.name, path.extname(f2.name));
                  let r = 99;
                  if (fb === vKey) r = rankBase;                                 /* 角色名_当前版本 */
                  else if (fb.startsWith(vKey)) r = rankBase + 1;
                  else if (fb === v10Key) r = rankBase + 5;                      /* 回退 1.0 */
                  else if (fb.startsWith(v10Key)) r = rankBase + 6;
                  else if (fb.startsWith(nmStr + '_')) r = rankBase + 8;         /* 任意版本兜底 */
                  else if (fb === base) r = rankBase + 9;
                  else if (fb.startsWith(nmStr)) r = rankBase + 10;
                  else if (nmStr.includes(fb) && fb.length >= 2) r = rankBase + 12;
                  if (r < 99) cands.push({ r, rel: path.join(dirRelFor, f2.name).replace(/\\/g, '/') });
                }
              };
              scanDir(dirAbs, 0, dirRel);
              const headDir = path.join(dirAbs, '头像图片');
              if (fs.existsSync(headDir)) scanDir(headDir, 10, path.join(dirRel, '头像图片'));
              const rootHead = path.join(v.path, '头像图片');
              if (fs.existsSync(rootHead)) scanDir(rootHead, 20, '头像图片');
              cands.sort((a, b) => a.r - b.r);
              if (cands.length) imgRel = cands[0].rel;
            } catch {}
            results.push({ rel, kind, name: String(nm).slice(0, 80), imgRel, version: ver });
          }
        } else if (e === '.png') {
          const fd = fs.openSync(full, 'r');
          try {
            const buf = Buffer.alloc(Math.min(st.size, 262144));
            fs.readSync(fd, buf, 0, buf.length, 0);
            if (buf.includes(Buffer.from('chara'))) results.push({ rel, kind: 'pngcard', name: path.basename(rel, e), imgRel: rel });
          } finally { fs.closeSync(fd); }
        }
      } catch {}
    });
    results.sort((a, b) => collator.compare(a.name, b.name));
    return sendJSON(res, 200, { results });
  }

  if (p === '/api/files' && method === 'GET') {
    const v = getVault(q.get('vid'));
    return sendJSON(res, 200, { files: flatFiles(v) });
  }

  if (method === 'POST' && p === '/api/search') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const query = String(body.q || '').trim();
    if (!query) return sendJSON(res, 200, { results: [] });
    return sendJSON(res, 200, { results: doSearch(v, query) });
  }

  /* ==================== 主题库（Tavo .thm / 封面） ==================== */
  if (method === 'GET' && p === '/api/themelib') {
    const exists = fs.existsSync(String(cfg.themeLib || ''));
    return sendJSON(res, 200, { root: cfg.themeLib || '', coverView: cfg.themeCoverView, exists });
  }

  if (method === 'POST' && p === '/api/themelib') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (typeof body.root === 'string' && body.root.trim()) {
      const full = path.resolve(body.root.trim());
      if (!fs.existsSync(full)) throw httpErr(400, '目录不存在：' + full);
      cfg.themeLib = full;
    }
    if (typeof body.coverView === 'string' && body.coverView.trim()) cfg.themeCoverView = body.coverView.trim();
    saveCfg();
    return sendJSON(res, 200, { root: cfg.themeLib, coverView: cfg.themeCoverView });
  }

  if (method === 'GET' && p === '/api/themes') {
    return sendJSON(res, 200, scanThemeLib());
  }

  /* 主题包原始字节（预览用） */
  if (method === 'GET' && p === '/api/themefile') {
    const full = insideThemeRoot(q.get('rel'));
    if (!full.toLowerCase().endsWith(THEME_EXT)) throw httpErr(400, '不是主题文件');
    if (!fs.existsSync(full)) throw httpErr(404, '主题不存在');
    return pipeFile(res, full);
  }

  /* 封面图片（只允许主题库内的图片） */
  if (method === 'GET' && p === '/api/coverimg') {
    const full = insideThemeRoot(q.get('rel'));
    if (!IMG_RE.test(full)) throw httpErr(400, '不是图片');
    if (!fs.existsSync(full)) throw httpErr(404, '封面不存在');
    return pipeFile(res, full);
  }

  /* 保存封面：同名覆盖 + 清掉同主题其它视图封面 */
  if (method === 'POST' && p === '/api/savecover') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.themeRel) throw httpErr(400, '缺少 themeRel');
    if (!body.data) throw httpErr(400, '缺少图片数据');
    const buf = Buffer.from(String(body.data), 'base64');
    if (!buf.length) throw httpErr(400, '图片数据为空');
    const saved = saveThemeCover(body.themeRel, body.view, buf);
    /* 让 File 的主题库视图刷新 */
    broadcast({ type: 'themelib', action: 'cover', rel: saved.rel });
    return sendJSON(res, 200, { ok: true, ...saved });
  }

  /* 拖入 .thm 入库（写入主题库根目录，重名自动加序号） */
  if (method === 'POST' && p === '/api/themeimport') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const name = String(body.name || '').trim();
    if (!name.toLowerCase().endsWith(THEME_EXT)) throw httpErr(400, '只接收 .thm 文件');
    if (/[\\/:*?"<>|]/.test(name)) throw httpErr(400, '文件名含非法字符');
    const buf = Buffer.from(String(body.data || ''), 'base64');
    if (!buf.length) throw httpErr(400, '文件内容为空');
    const root = themeRoot();
    let target = path.join(root, name);
    for (let i = 2; fs.existsSync(target); i++) target = path.join(root, name.replace(/\.thm$/i, ` (${i}).thm`));
    fs.writeFileSync(target, buf);
    broadcast({ type: 'themelib', action: 'import', rel: relOf(target) });
    return sendJSON(res, 200, { ok: true, rel: relOf(target), name: path.basename(target), size: buf.length });
  }

  /* ==================== 发布状态徽标 ==================== */
  if (method === 'GET' && p === '/api/pubstatus') {
    const d = await getHubPubStatus();
    return sendJSON(res, 200, d);
  }

  /* ==================== .bak 历史版本 ==================== */
  if (method === 'GET' && p === '/api/baklist') {
    const v = getVault(q.get('vid'));
    const rel = q.get('rel') || '';
    const key = bakKeyFor(rel);
    const dir = bakDirFor(v.id);
    let items = [];
    try {
      items = fs.readdirSync(dir)
        .filter(f => f.startsWith(key + '.') && f.endsWith('.bak'))
        .map(f => {
          const ts = f.slice(key.length + 1, -4);
          let st = {}; try { st = fs.statSync(path.join(dir, f)); } catch {}
          return { ts, size: st.size || 0, time: ts.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5:$6') };
        })
        .sort((a, b) => b.ts.localeCompare(a.ts));
    } catch {}
    return sendJSON(res, 200, { items });
  }

  if (method === 'GET' && p === '/api/bakcontent') {
    const v = getVault(q.get('vid'));
    const rel = q.get('rel') || '';
    const ts = String(q.get('ts') || '');
    if (!/^\d{14}$/.test(ts)) throw httpErr(400, '时间戳格式错误');
    const f = path.join(bakDirFor(v.id), `${bakKeyFor(rel)}.${ts}.bak`);
    const base = path.resolve(bakDirFor(v.id));
    if (!path.resolve(f).startsWith(base)) throw httpErr(403, '拒绝访问');
    if (!fs.existsSync(f)) throw httpErr(404, '备份不存在');
    const buf = fs.readFileSync(f);
    let binary = false;
    const head = buf.slice(0, 8000);
    for (let i = 0; i < head.length; i++) if (head[i] === 0) { binary = true; break; }
    return sendJSON(res, 200, { binary, text: binary ? '' : buf.toString('utf8'), size: buf.length });
  }

  if (method === 'POST' && p === '/api/bakrestore') {
    const body = JSON.parse((await readBody(req)).toString('utf8'));
    const v = getVault(body.vid);
    const rel = String(body.rel || '');
    const ts = String(body.ts || '');
    if (!/^\d{14}$/.test(ts)) throw httpErr(400, '时间戳格式错误');
    const full = safeJoin(v.path, rel);
    const bak = path.join(bakDirFor(v.id), `${bakKeyFor(rel)}.${ts}.bak`);
    const base = path.resolve(bakDirFor(v.id));
    if (!path.resolve(bak).startsWith(base)) throw httpErr(403, '拒绝访问');
    if (!fs.existsSync(bak)) throw httpErr(404, '备份不存在');
    /* 还原前：当前内容先留一份新 bak，可再还原回来 */
    if (fs.existsSync(full)) {
      const curTs = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      fs.copyFileSync(full, path.join(bakDirFor(v.id), `${bakKeyFor(rel)}.${curTs}.bak`));
    }
    fs.copyFileSync(bak, full);
    scheduleEvent(v.id, path.dirname(rel));
    return sendJSON(res, 200, { ok: true });
  }

  /* ---- RB 直推：令牌管理 ---- */
  if (method === 'GET' && p === '/api/rb/status') {
    const a = rbAuthLoad();
    return sendJSON(res, 200, { ok: true, has: !!(a.headers && Object.keys(a.headers).length), names: a.headers ? Object.keys(a.headers) : [], updatedAt: a.updatedAt || null, draftId: a.draftId || null, hasRefresh: !!a.refreshToken });
  }
  if (method === 'POST' && p === '/api/rb/token') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    if (!body.headers || typeof body.headers !== 'object' || !Object.keys(body.headers).length) return sendJSON(res, 400, { ok: false, error: 'headers 为空' });
    const a = rbAuthLoad();
    a.headers = body.headers;
    a.updatedAt = new Date().toISOString();
    rbAuthSave(a);
    return sendJSON(res, 200, { ok: true });
  }
  /* ---- RB 会话一键同步（谷歌 OAuth 桥，由油猴脚本从 rubii.ai 回传；CORS 仅放行 rubii.ai） ---- */
  if (p === '/api/rb/session') {
    const origin = String(req.headers.origin || '');
    const allow = (origin === 'https://rubii.ai');
    res.setHeader('Access-Control-Allow-Origin', allow ? origin : 'null');
    res.setHeader('Vary', 'Origin');
    if (method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204); res.end(); return;
    }
    if (method !== 'POST') { res.writeHead(405); res.end(); return; }
    if (!allow) return sendJSON(res, 403, { ok: false, error: 'origin 不允许（仅 rubii.ai）' });
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const a = rbAuthLoad();
    const at = String(body.accessToken || '').trim();
    if (at) a.headers = { Authorization: 'Bearer ' + at.replace(/^Bearer\s+/i, '') };
    if (body.refreshToken) a.refreshToken = String(body.refreshToken);
    if (body.draftId && /^[0-9a-f]{24}$/.test(body.draftId)) a.draftId = body.draftId;
    a.updatedAt = new Date().toISOString();
    rbAuthSave(a);
    return sendJSON(res, 200, { ok: true });
  }
  if (method === 'POST' && p === '/api/rb/logout') {
    try { fs.unlinkSync(RB_AUTH_PATH); } catch {}
    return sendJSON(res, 200, { ok: true });
  }
  /* ---- RB 直推：通用代理（host 固定 rubii.ai；Pro 传 method/path/query/body/headers） ---- */
  if (method === 'POST' && p === '/api/rb/call') {
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    const a = rbAuthLoad();
    if (!(a.headers && Object.keys(a.headers).length)) return sendJSON(res, 200, { ok: false, status: 0, error: '未设置 RB 登录头（先在 Pro 里设置）' });
    const rpath = String(body.path || '/');
    if (!/^\/[^\s]*$/.test(rpath)) return sendJSON(res, 400, { ok: false, error: 'path 非法' });
    const qs = body.query ? ('?' + new URLSearchParams(body.query).toString()) : '';
    try {
      const r = await rbCall((body.method || 'GET').toUpperCase(), rpath + qs, body.body, Object.assign({}, a.headers, body.headers || {}));
      rbAuthRoll(r.headers);
      let json = null; try { json = JSON.parse(r.text); } catch {}
      return sendJSON(res, 200, { ok: r.status >= 200 && r.status < 300, status: r.status, json, text: json ? undefined : String(r.text).slice(0, 4000) });
    } catch (e) {
      return sendJSON(res, 200, { ok: false, status: 0, error: e.message });
    }
  }

  throw httpErr(404, `未知接口 ${method} ${p}`);
}

/* ---------------- 静态文件 / 库内原始文件 ---------------- */
async function serveStatic(req, res, u) {
  let p = decodeSafe(u.pathname);
  if (p === '/') p = '/index.html';
  const full = path.resolve(path.join(PUBLIC, '.' + p));
  if (!full.startsWith(PUBLIC + path.sep)) throw httpErr(403, '拒绝访问');
  const st = await fsp.stat(full).catch(() => { throw httpErr(404, '文件不存在'); });
  if (st.isDirectory()) throw httpErr(404, '文件不存在');
  res.writeHead(200, { 'Content-Type': mimeOf(full), 'Content-Length': st.size, 'Cache-Control': 'no-store, no-cache, must-revalidate' });
  fs.createReadStream(full).pipe(res);
}
/* 前缀路由托管（路径限制在 baseDir 内），默认文件用于根路径 */
async function servePrefixed(req, res, u, prefix, baseDir, defaultFile) {
  let rel = decodeSafe(u.pathname.slice(prefix.length));
  if (!rel || rel === '/') rel = defaultFile;
  const full = path.resolve(baseDir, rel);
  const base = path.resolve(baseDir);
  if (full !== base && !full.startsWith(base + path.sep)) throw httpErr(403, '拒绝访问');
  const st = await fsp.stat(full).catch(() => { throw httpErr(404, '文件不存在'); });
  if (st.isDirectory()) throw httpErr(404, '文件不存在');
  res.writeHead(200, { 'Content-Type': mimeOf(full), 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

/* 「功能未配置」友好提示页：modules 包内缺失、cfg 又未指定外部目录时兜底，不崩溃 */
function pageUnconfigured(res, what) {
  const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>功能未配置 - Lin Files</title>
<style>body{font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;background:#f5f6f8;color:#3a3f47;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{text-align:center;max-width:34em;padding:2.5em;background:#fff;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.08)}h1{font-size:1.25em;margin:0 0 .6em}p{line-height:1.7;margin:.4em 0}code{background:#eef0f3;padding:.15em .45em;border-radius:5px;font-size:.92em}</style></head>
<body><main><h1>此功能尚未配置</h1><p>${what}未包含在本发行包的 <code>modules/</code> 中，也未在 <code>config.json</code> 里指定外部目录。</p><p>把 <code>config.example.json</code> 复制为 <code>config.json</code>，填写对应路径后重启即可启用。</p></main></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}

/* Tavo 真机基础样式：modules/lin-thm/tavo-dist/ → /thmdist/（预览器加载真机 bundle.min.css） */
async function serveThmDist(req, res, u) {
  const distDir = path.join(THM_MOD, 'tavo-dist');
  return servePrefixed(req, res, u, '/thmdist/', distDir, 'index.html');
}
/* 内置字体包：modules/lin-thm/fonts/ → /thmfonts/（预览器 @font-face 兜底用） */
async function serveThmFonts(req, res, u) {
  const fontDir = path.join(THM_MOD, 'fonts');
  return servePrefixed(req, res, u, '/thmfonts/', fontDir, 'index.txt');
}
/* Lin Thm 预览器托管：modules/lin-thm 包内优先，其次 cfg.thmDir（作者本机新版覆盖） */
async function serveThm(req, res, u) {
  if (fs.existsSync(path.join(THM_MOD, 'Lin Thm.html')))
    return servePrefixed(req, res, u, '/thm/', THM_MOD, 'Lin Thm.html');
  const dir = String(cfg.thmDir || '').trim();
  if (!dir || !fs.existsSync(dir)) return pageUnconfigured(res, 'Lin Thm 预览器');
  return servePrefixed(req, res, u, '/thm/', dir, 'Lin Thm.html');
}

/* LinWork Pro 托管：modules/lin-work-pro 包内优先（绿色版），其次 cfg.lwpDir + cfg.lwpFile */
async function serveLwp(req, res, u) {
  if (fs.existsSync(LWP_MOD)) {
    let f = 'LinWork Pro V0.4.9-gre.html';
    if (!fs.existsSync(path.join(LWP_MOD, f))) {
      const hits = fs.readdirSync(LWP_MOD).filter(n => /^LinWork Pro.*\.html$/i.test(n)).sort();
      if (hits.length) f = hits[hits.length - 1];
    }
    return servePrefixed(req, res, u, '/lwp/', LWP_MOD, f);
  }
  const dir = String(cfg.lwpDir || '').trim();
  if (!dir || !fs.existsSync(dir)) return pageUnconfigured(res, 'LinWork Pro');
  let file = String(cfg.lwpFile || '').trim();
  if (!file || !fs.existsSync(path.join(dir, file))) {
    const hits = fs.readdirSync(dir).filter(n => /^LinWork Pro.*\.html$/i.test(n)).sort();
    if (hits.length) file = hits[hits.length - 1];
    else if (!file) file = 'LinWork Pro V0.4.8e.html';
  }
  return servePrefixed(req, res, u, '/lwp/', dir, file);
}

async function serveVaultFile(req, res, u) {  const m = u.pathname.match(/^\/v\/(\w+)(?:\/(.*))?$/);
  if (!m) throw httpErr(404, 'not found');
  const v = getVault(m[1]);
  const rel = decodeSafe(m[2] || '');
  const full = safeJoin(v.path, rel);
  const st = await fsp.stat(full).catch(() => { throw httpErr(404, '文件不存在'); });
  if (st.isDirectory()) throw httpErr(400, '这是文件夹');
  res.writeHead(200, { 'Content-Type': mimeOf(full), 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

/* ---------------- 服务器 ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw httpErr(403, '拒绝访问');
    const u = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    /* CSRF 防护（v1.1.1）：写操作校验 Origin。浏览器对本站同源 POST 会带 Origin=http://127.0.0.1:port（放行）；
       恶意网页发起的跨站简单请求（如 text/plain）Origin 是对方域名——一律 403。
       /api/rb/session 是油猴脚本从 rubii.ai 跨域回传的合法入口，由其自身处理器做白名单。 */
    if (req.method !== 'GET' && req.method !== 'HEAD' && u.pathname !== '/api/rb/session') {
      const origin = String(req.headers.origin || '');
      if (origin) {
        let localOk = false;
        try { localOk = ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(new URL(origin).hostname); } catch {}
        if (!localOk) throw httpErr(403, '跨站请求已拒绝（CSRF 防护）');
      }
    }
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    if (u.pathname.startsWith('/v/')) return await serveVaultFile(req, res, u);
    if (u.pathname.startsWith('/thmdist/')) return await serveThmDist(req, res, u);
    if (u.pathname.startsWith('/thmfonts/')) return await serveThmFonts(req, res, u);    if (u.pathname.startsWith('/thm/')) return await serveThm(req, res, u);
    if (u.pathname.startsWith('/lwp/')) return await serveLwp(req, res, u);
    return await serveStatic(req, res, u);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[error]', req.url, e.message);
    if (!res.headersSent) sendJSON(res, status, { error: e.message || '服务器错误' });
    else try { res.end(); } catch {}
  }
});
server.on('error', e => console.error('[server]', e.message));

function listen(port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
}
function probe(port) {
  return new Promise(resolve => {
    const r = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 800 }, x => {
      let d = '';
      x.on('data', c => d += c);
      x.on('end', () => { try { resolve(JSON.parse(d).app === 'lin-files'); } catch { resolve(false); } });
    });
    r.on('error', () => resolve(false));
    r.on('timeout', () => { r.destroy(); resolve(false); });
  });
}
function openBrowser(port) { if (process.env.LIN_NO_BROWSER) return; exec(`start "" "http://127.0.0.1:${port}/"`, { windowsHide: true }); }

(async () => {
  for (let i = 0; i < 12; i++) {
    const p = cfg.port + i;
    if (await probe(p)) {
      console.log(`Lin Files 已在运行 → http://127.0.0.1:${p}/`);
      if (!process.env.LIN_NO_BROWSER) { try { execSync(`start "" "http://127.0.0.1:${p}/"`, { shell: 'cmd.exe', windowsHide: true, timeout: 5000 }); } catch {} }
      process.exit(0);
    }
    try { await listen(p); cfg.port = p; saveCfg(); break; } catch {}
    if (i === 11) { console.error('找不到可用端口'); process.exit(1); }
  }
  console.log(`Lin Files 服务已启动 → http://127.0.0.1:${cfg.port}/`);
  console.log('管理的文件夹：');
  for (const v of cfg.vaults) { console.log(`  - ${v.name}  (${v.path})`); startWatch(v); }
  openBrowser(cfg.port);
})();
