# Lin Hub 本地服务入口（并发版）
# 请求由 RunspacePool 并发处理：单个慢请求（大包上传、hub 网络慢）不再阻塞整个服务。
# 业务代码全部在 linhub-lib.ps1。
param([int]$Workers = 6)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Lib = Join-Path $Root 'linhub-lib.ps1'
if (-not (Test-Path -LiteralPath $Lib)) {
  Write-Host ('缺少 linhub-lib.ps1：' + $Lib)
  exit 1
}
. $Lib

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:' + $Port + '/')
$bound = $false
try { $listener.Start(); $bound = $true } catch {
  Write-Host ('localhost 绑定失败: ' + $_.Exception.Message)
}
if (-not $bound) {
  Write-SrvLog ('bind failed on port ' + $Port)
  exit 1
}

# ---- worker 池 ----
$queue = New-Object 'System.Collections.Concurrent.BlockingCollection[object]'
$pool = [runspacefactory]::CreateRunspacePool(1, [Math]::Max(2, $Workers))
$pool.Open()

$workerScript = {
  param($libPath, $q)
  . $libPath
  while ($true) {
    $item = $null
    try { $item = $q.Take() } catch { break }
    if ($null -eq $item) { break }
    try { Invoke-HubRequest $item } catch {
      try { Write-SrvLog ('worker crash: ' + $_.Exception.Message) } catch {}
    }
  }
}

# 注意：PowerShell 变量名不区分大小写，句柄集合不能叫 $workers（会覆盖参数 $Workers）
$asyncHandles = @()
for ($i = 0; $i -lt $Workers; $i++) {
  $ps = [powershell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddScript($workerScript).AddArgument($Lib).AddArgument($queue)
  $asyncHandles += $ps.BeginInvoke()
}

Write-SrvLog ('--- server start (pid ' + $PID + ', workers ' + $Workers + ') ---')
Write-Host ('Lin Hub 已启动: http://localhost:' + $Port + '/  (并发 worker: ' + $Workers + ')')
Write-Host '关闭本窗口即停止服务。'

try {
  while ($listener.IsListening) {
    $ctx = $null
    try {
      $ctx = $listener.GetContext()
    } catch {
      Write-SrvLog ('accept error: ' + $_.Exception.Message)
      if (-not $listener.IsListening) { break }
      Start-Sleep -Milliseconds 100
      continue
    }
    try {
      $queue.Add($ctx)
    } catch {
      Write-SrvLog ('queue add failed: ' + $_.Exception.Message)
      try { $ctx.Response.Abort() } catch {}
    }
  }
} finally {
  Write-SrvLog '--- server stopping ---'
  try { $queue.CompleteAdding() } catch {}
  Start-Sleep -Milliseconds 300
  try { $pool.Close() } catch {}
  try { $pool.Dispose() } catch {}
  try { $listener.Close() } catch {}
}
