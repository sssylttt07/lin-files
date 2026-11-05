# prepare-release.ps1 — 清理打包，产出两个 zip + 干净发行源目录（全部输出到本地暂存目录）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\prepare-release.ps1 [-StageDir <目录>]
# 产物：
#   LinFiles-v1.0.0\                 干净发行源目录（git 仓库工作树，人工过目后自行推送）
#   LinFiles-v1.0.0-src.zip          源码包（不含 runtime，<10MB）
#   LinFiles-v1.0.0-portable.zip     便携包（含 runtime\node 与 modules/，供 Release 附件）
# 注意：本脚本只做本地打包，绝不执行任何推送；推送请人工复核后自行操作。
param(
  [string]$StageDir = '',
  [string]$Version = 'v1.0.0'
)
$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot

# 默认暂存目录：应用根的上级「推Github\Lin File完全体（推送前先出现在这里）」（相对解析，脚本内不写本机绝对路径）
if (-not $StageDir) {
  $StageDir = Join-Path $AppRoot '..\推Github\Lin File完全体（推送前先出现在这里）'
}
$StageDir = [System.IO.Path]::GetFullPath($StageDir)
if (-not (Test-Path -LiteralPath $StageDir)) { New-Item -ItemType Directory -Path $StageDir -Force | Out-Null }

$RelName = "LinFiles-$Version"
$RelDir = Join-Path $StageDir $RelName

Write-Host "应用根：$AppRoot"
Write-Host "暂存目录：$StageDir"

# ---- 1) 清理旧产物（只动 LinFiles-* 命名的产物，不碰暂存目录里的其他文件）----
Get-ChildItem -LiteralPath $StageDir -Filter "$RelName*" -Force | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName -Recurse -Force
  Write-Host "已清理旧产物：$($_.Name)"
}

# ---- 2) 组装干净发行源目录（白名单复制）----
$entries = @(
  'server.js', 'config.example.json', '.gitignore', 'README.md', 'CHANGELOG.md',
  '启动 Lin Files.bat', '停止 Lin Files.bat',
  'public', 'modules', '示例库', 'scripts'
)
New-Item -ItemType Directory -Path $RelDir -Force | Out-Null
foreach ($e in $entries) {
  $src = Join-Path $AppRoot $e
  if (-not (Test-Path -LiteralPath $src)) { Write-Warning "缺失（跳过）：$e"; continue }
  Copy-Item -LiteralPath $src -Destination (Join-Path $RelDir $e) -Recurse -Force
}

# ---- 3) 发行目录自检：不允许出现个人数据/运行时/日志/备份 ----
$bad = @()
Get-ChildItem -LiteralPath $RelDir -Recurse -Force | ForEach-Object {
  $rel = $_.FullName.Substring($RelDir.Length).TrimStart('\')
  if ($rel -match '^(data|runtime)(\.|\\|/|$)' -or $rel -match '^config\.json$' -or $rel -match '\.(log|bak)$') { $bad += $rel }
}
if ($bad.Count) { throw "发行目录发现禁止打包的文件：`n" + ($bad -join "`n") }

# ---- 4) 内容扫描（复用 check-staged.js，需要 Node；找不到就警告跳过）----
$node = Join-Path $AppRoot 'runtime\node\node.exe'
if (Test-Path -LiteralPath $node) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8   # 子进程 stdout 中文不乱码
  & $node (Join-Path $AppRoot 'scripts\check-staged.js') $RelDir
  if ($LASTEXITCODE -ne 0) { throw 'check-staged 扫描未通过，停止打包。' }
} else {
  Write-Warning '未找到 runtime\node\node.exe，跳过 check-staged 内容扫描（请手动运行）。'
}

# ---- 5) src.zip（不含 runtime，体积 <10MB）----
$srcZip = Join-Path $StageDir "$RelName-src.zip"
tar -a -c -f $srcZip -C $StageDir $RelName
if ($LASTEXITCODE -ne 0) { throw 'src.zip 打包失败' }
$srcMB = [math]::Round((Get-Item -LiteralPath $srcZip).Length / 1MB, 2)
Write-Host "src.zip：$srcMB MB"
if ($srcMB -ge 10) { throw "src.zip 超过 10MB（$srcMB MB），检查是否误带了运行时或个人文件。" }

# ---- 6) portable.zip（含 runtime\node，体量不限）----
$portBuild = Join-Path $StageDir "_build-portable-$Version"
New-Item -ItemType Directory -Path (Join-Path $portBuild $RelName) -Force | Out-Null
Copy-Item -LiteralPath $RelDir -Destination $portBuild -Recurse -Force
$rtSrc = Join-Path $AppRoot 'runtime\node'
if (-not (Test-Path -LiteralPath $rtSrc)) { throw '未找到 runtime\node，无法打包便携版。' }
New-Item -ItemType Directory -Path (Join-Path $portBuild "$RelName\runtime") -Force | Out-Null
Copy-Item -LiteralPath $rtSrc -Destination (Join-Path $portBuild "$RelName\runtime\node") -Recurse -Force
$portZip = Join-Path $StageDir "$RelName-portable.zip"
tar -a -c -f $portZip -C $portBuild $RelName
if ($LASTEXITCODE -ne 0) { throw 'portable.zip 打包失败' }
Remove-Item -LiteralPath $portBuild -Recurse -Force
$portMB = [math]::Round((Get-Item -LiteralPath $portZip).Length / 1MB, 2)
Write-Host "portable.zip：$portMB MB"

# ---- 7) 汇总 ----
Write-Host ''
Write-Host '==== 打包完成（仅本地，未推送） ===='
Get-ChildItem -LiteralPath $StageDir -Filter "$RelName*" | ForEach-Object {
  $sz = if ($_.PSIsContainer) { '<目录>' } else { "$([math]::Round($_.Length/1MB,2)) MB" }
  Write-Host ("  {0}  {1}" -f $_.Name, $sz)
}
Write-Host '发行目录请人工过目；确认后再自行 git push 或调用 scripts\gh-publish.ps1（仅限手动）。'
