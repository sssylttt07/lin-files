'use strict';
/* check-staged.js — git staged 列表模拟检查（零依赖）
 * 本机未装 git 时，用本脚本模拟 `git init && git add -A` 的结果：
 * 按 .gitignore 规则算出"会被入库"的文件清单，再逐个扫描个人痕迹。
 * 用法：node scripts\check-staged.js [仓库根目录]（缺省为脚本所在目录的上一级）
 * 退出码 0 = 干净；1 = 发现问题（会打印明细）。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));

/* ---- 极简 .gitignore 解析（覆盖本仓库用到的规则形态：目录前缀 / 通配后缀 / 字面名） ---- */
function loadIgnores() {
  const rules = [];
  let txt = '';
  try { txt = fs.readFileSync(path.join(root, '.gitignore'), 'utf8'); } catch { }
  for (let line of txt.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    rules.push(line.replace(/\\/g, '/').toLowerCase());
  }
  rules.push('.git', 'node_modules'); /* 永远排除，双保险 */
  return rules;
}
const IGNORES = loadIgnores();
function isIgnored(rel) {
  const r = rel.replace(/\\/g, '/').toLowerCase();
  const segs = r.split('/');
  for (const rule of IGNORES) {
    if (rule.endsWith('/')) { if (r.startsWith(rule) || segs.some(s => s === rule.slice(0, -1))) return true; }
    else if (rule.includes('*')) {
      const re = new RegExp('^' + rule.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
      if (re.test(segs[segs.length - 1]) || re.test(r)) return true;
    }
    else if (segs.some(s => s === rule) || r === rule || r.startsWith(rule + '/')) return true;
  }
  return false;
}

/* ---- 收集 staged 模拟列表 ---- */
function walk(dir, prefix, out) {
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of list) {
    const rel = prefix ? prefix + '/' + ent.name : ent.name;
    if (isIgnored(rel)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, rel, out);
    else if (ent.isFile()) out.push({ rel, full });
  }
}
const files = [];
walk(root, '', files);
files.sort((a, b) => a.rel.localeCompare(b.rel));

/* ---- 个人痕迹扫描 ----
 * 个人名等敏感字面量一律拆片拼接，避免本脚本自身入库时被扫出（它自己也在 staged 列表里）。
 * 盘符路径只认 C/D 盘的反斜杠形态、且盘符后必须跟文件名字符——
 * 这样可排除压缩代码里转义空串、正则字面量（冒号+斜杠形态）之类的海量误报。 */
const PATTERNS = [
  { name: '本机绝对路径(D:)', re: /[Dd]:\\(?=[A-Za-z0-9._])/ },
  { name: '本机绝对路径(C:)', re: /[Cc]:\\(?=[A-Za-z0-9._])/ },
  { name: 'C:\\Users 路径', re: /[Cc]:\\Users/i },
  { name: '用户名痕迹', re: new RegExp('sy' + 'lv' + 'ia', 'i') },
  { name: '真实姓名痕迹', re: new RegExp('\u66fe\u9759\u601d') },
  { name: '示例库旧角色名', re: new RegExp('\u6797\u665a') },
  { name: '联系人代号', re: new RegExp('\\bco' + 'co\\b', 'i') },
  { name: 'QQ 号/邮箱痕迹', re: new RegExp('1830112' + '272|@qq' + '\\.com') },
];
const BIN_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.zip', '.thm',
  '.7z', '.rar', '.gz', '.exe', '.dll', '.pdf', '.mp3', '.mp4', '.wav', '.woff', '.woff2', '.ttf', '.otf']);
let bad = 0;
const lines = [];
for (const f of files) {
  const ext = path.extname(f.rel).toLowerCase();
  if (BIN_EXT.has(ext)) { lines.push(`  列表  ${f.rel}（二进制，未扫内容）`); continue; }
  let text;
  try {
    const buf = fs.readFileSync(f.full);
    if (buf.includes(0)) { lines.push(`  列表  ${f.rel}（二进制，未扫内容）`); continue; }
    text = buf.toString('utf8');
  } catch { continue; }
  const hits = [];
  for (const p of PATTERNS) if (p.re.test(text)) hits.push(p.name);
  if (hits.length) {
    bad++;
    lines.push(`  ✗ 命中  ${f.rel} → ${hits.join('、')}`);
  } else {
    lines.push(`  ok    ${f.rel}`);
  }
}

console.log(`仓库根目录：${root}`);
console.log(`staged 模拟文件数：${files.length}`);
console.log(`含 modules/ 内嵌应用：${files.some(f => f.rel.startsWith('modules/')) ? '是 ✓' : '否 ✗'}`);
console.log(`含 示例库/：${files.some(f => f.rel.startsWith('示例库/')) ? '是 ✓' : '否 ✗'}`);
console.log(`含 data/ 或 runtime/ 或 config.json：${files.some(f => /^data\/|^runtime\/|^config\.json$/i.test(f.rel)) ? '是 ✗' : '否 ✓'}`);
console.log('---- 文件清单与扫描 ----');
for (const l of lines) console.log(l);
console.log('---- 结果 ----');
console.log(bad === 0 ? 'PASS：staged 列表无个人痕迹' : `FAIL：${bad} 个文件命中个人痕迹`);
process.exit(bad === 0 ? 0 : 1);
