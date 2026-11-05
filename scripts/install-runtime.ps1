# install-runtime.ps1 — 从 GitHub Release 下载 Node 运行时并解压到位（给 src 包用户用）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\install-runtime.ps1 -Url <运行时zip地址>
# 运行时以 zip 附件形式随 Release 分发（不入 git 仓库）；下载后解压为 runtime\node\node.exe。
# 仅限手动调用。
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$AppRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$RuntimeDir = Join-Path $AppRoot 'runtime'
$NodeExe = Join-Path $RuntimeDir 'node\node.exe'

if (Test-Path -LiteralPath $NodeExe) {
  Write-Host "运行时已存在：$NodeExe（如需重装请先删除 runtime 目录）"
  return
}

Write-Host "下载运行时：$Url"
$tmpZip = Join-Path $env:TEMP ('linfiles-runtime-' + [guid]::NewGuid().ToString('N') + '.zip')
try {
  Invoke-WebRequest -Uri $Url -OutFile $tmpZip -UseBasicParsing
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
  Write-Host '解压中…'
  Expand-Archive -LiteralPath $tmpZip -DestinationPath $RuntimeDir -Force
} finally {
  Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $NodeExe) {
  Write-Host "完成：$NodeExe"
  Write-Host '现在可以双击「启动 Lin Files.bat」启动。'
} else {
  # 兼容 zip 内多套一层目录的情况：把找到的 node.exe 那层挪到 runtime\node
  $found = Get-ChildItem -LiteralPath $RuntimeDir -Recurse -Filter 'node.exe' | Select-Object -First 1
  if ($found) {
    New-Item -ItemType Directory -Path (Join-Path $RuntimeDir 'node') -Force | Out-Null
    Get-ChildItem -LiteralPath $found.DirectoryName -Force | Move-Item -Destination (Join-Path $RuntimeDir 'node') -Force
    Write-Host "完成（已归位）：$NodeExe"
  } else {
    throw '解压后未找到 node.exe，请检查运行时包内容。'
  }
}
