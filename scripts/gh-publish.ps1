# gh-publish.ps1 — GitHub 单文件发布工具（预留模块，仅限手动调用）
#
# ⚠️ 本脚本只能由用户手动执行；任何自动化流程（如 prepare-release.ps1）都不得调用它。
# ⚠️ 推送前请先人工过目待推送内容。
#
# 配置来源：应用根目录 config.json 的两个键（见 config.example.json）：
#   githubPat  — GitHub Personal Access Token（需要 repo 写权限；只存本机，不入库）
#   githubRepo — 目标仓库，形如 "user/repo"
#
# 用法：
#   列远端文件 sha：   powershell -ExecutionPolicy Bypass -File scripts\gh-publish.ps1 -Action List -Path README.md
#   更新单个文件：     powershell -ExecutionPolicy Bypass -File scripts\gh-publish.ps1 -Action Put -Path README.md -File README.md -Message "docs: update README"
#   新建文件（远端无此文件时 Put 自动成为创建）：
#                      powershell -ExecutionPolicy Bypass -File scripts\gh-publish.ps1 -Action Put -Path docs/note.md -File 本地文件.md -Message "docs: add note"
#
# 实现：GitHub Contents API（PUT /repos/{owner}/{repo}/contents/{path}），PowerShell 原生 Invoke-RestMethod，无第三方依赖。
param(
  [Parameter(Mandatory = $true)][ValidateSet('List', 'Put')][string]$Action,
  [Parameter(Mandatory = $true)][string]$Path,          # 仓库内路径（正/反斜杠均可）
  [string]$File = '',                                   # 仅 Put：本地文件路径
  [string]$Message = '',                                # 仅 Put：commit 信息
  [string]$Branch = ''                                  # 可选：目标分支，缺省用仓库默认分支
)
$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot

# ---- 读取凭据配置 ----
$cfgPath = Join-Path $AppRoot 'config.json'
if (-not (Test-Path -LiteralPath $cfgPath)) { throw "未找到 $cfgPath；请先从 config.example.json 复制并填写 githubPat / githubRepo。" }
$cfg = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Pat = [string]$cfg.githubPat
$Repo = [string]$cfg.githubRepo
if (-not $Pat -or -not $Repo) { throw 'config.json 缺少 githubPat 或 githubRepo（见 config.example.json）。' }

$ApiBase = "https://api.github.com/repos/$Repo/contents"
$Headers = @{
  'Authorization' = "Bearer $Pat"
  'User-Agent'    = 'lin-files-gh-publish'
  'Accept'        = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}
# 仓库内路径 → 逐段 URL 编码（保留 /）
$RepoPath = ($Path -replace '\\', '/') -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }
$ApiPath = ($RepoPath -join '/')

function Get-GhFileSha {
  param([string]$P)
  try {
    $r = Invoke-RestMethod -Method Get -Uri "$ApiBase/$P" -Headers $Headers
    return [string]$r.sha
  } catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 404) { return $null }   # 远端不存在 → 新建
    throw
  }
}

Write-Host "仓库：$Repo  路径：$($Path -replace '\\','/')" 

switch ($Action) {
  'List' {
    $sha = Get-GhFileSha -P $ApiPath
    if ($sha) { Write-Host "远端 sha：$sha" }
    else      { Write-Host '远端不存在此文件（推送时将创建）。' }
  }
  'Put' {
    if (-not $File -or -not (Test-Path -LiteralPath $File)) { throw 'Put 需要有效的 -File 本地文件路径。' }
    if (-not $Message) { throw 'Put 需要提交信息 -Message。' }
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $File))
    $body = @{
      message = $Message
      content = [Convert]::ToBase64String($bytes)
    }
    if ($Branch) { $body.branch = $Branch }
    $sha = Get-GhFileSha -P $ApiPath
    if ($sha) { $body.sha = $sha }        # 有 sha = 更新，无 = 新建
    $json = $body | ConvertTo-Json
    $r = Invoke-RestMethod -Method Put -Uri "$ApiBase/$ApiPath" -Headers $Headers -ContentType 'application/json' -Body $json
    Write-Host "已提交：$($r.commit.sha)  ($($r.content.path))"
  }
}
