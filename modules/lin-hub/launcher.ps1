param([switch]$NoOpen)
# Lin Hub launcher: make sure a HEALTHY server is running, then open the page.
# A wedged server (process alive, port bound, no response) is detected and restarted automatically.
# Every step is logged to logs\launcher.log; failures show a message box.
$ErrorActionPreference = 'Stop'
$Port = 8791

$appDir = $PSScriptRoot
if (-not $appDir) { $appDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $appDir) { $appDir = [IO.Path]::GetDirectoryName($MyInvocation.MyCommand.Definition) }
if (-not $appDir) { $appDir = Get-Location }

$logDir = Join-Path $appDir 'logs'
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$logFile = Join-Path $logDir 'launcher.log'

function Write-Log([string]$msg) {
  try { Add-Content -LiteralPath $logFile -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg) -Encoding UTF8 } catch {}
}
function Show-Error([string]$msg) {
  # 10s auto-close: a modal popup that waits forever would hang the launcher itself
  try { (New-Object -ComObject WScript.Shell).Popup($msg, 10, 'Lin Hub', 16) | Out-Null } catch {}
}
function Test-PortOpen {
  $tcp = $null
  try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('127.0.0.1', $Port); return $true }
  catch { return $false }
  finally { if ($tcp) { try { $tcp.Close() } catch {} } }
}
function Test-HttpUp {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri ('http://localhost:' + $Port + '/api/session/check') -TimeoutSec 4
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}
# Match our server by command line. The pattern is assembled at runtime so this
# script's own command line never matches it.
function Get-ServerProcs {
  $pat = 'LinHub\ser' + 'ver.ps1'
  return @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like ('*' + $pat + '*') })
}
function Stop-Servers {
  $procs = Get-ServerProcs
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Log ('killed pid ' + $p.ProcessId) }
    catch { Write-Log ('kill failed pid ' + $p.ProcessId + ': ' + $_.Exception.Message) }
  }
  return $procs.Count
}
function Start-Server {
  $serverScript = Join-Path $appDir 'server.ps1'
  if (-not (Test-Path -LiteralPath $serverScript)) { return $null }
  # PS5.1 Start-Process does not quote array elements that contain spaces.
  $quoted = '"' + $serverScript + '"'
  return Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quoted) `
    -WorkingDirectory $appDir -WindowStyle Hidden -PassThru
}

Write-Log '--- launcher start ---'
Write-Log ('appDir = ' + $appDir)

$healthy = Test-HttpUp
Write-Log ('initial health = ' + $healthy)

if (-not $healthy) {
  if (Test-PortOpen) {
    # Port is bound but nothing answers -> the previous server wedged. Restart it.
    Write-Log 'port bound but http dead -> treating server as wedged, restarting'
    $n = Stop-Servers
    Write-Log ('stopped ' + $n + ' stale server process(es)')
    for ($i = 0; $i -lt 15; $i++) {
      Start-Sleep -Milliseconds 400
      if (-not (Test-PortOpen)) { break }
    }
  }

  try {
    $proc = Start-Server
    if (-not $proc) {
      Write-Log 'FATAL server.ps1 missing'
      Show-Error ('找不到 server.ps1，请检查目录：' + $appDir)
      exit 1
    }
    Write-Log ('spawned pid=' + $proc.Id)
  } catch {
    Write-Log ('spawn failed: ' + $_.Exception.Message)
    Show-Error ('启动服务失败：' + $_.Exception.Message + "`n`n日志：$logFile")
    exit 1
  }

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-HttpUp) { $healthy = $true; break }
  }
  Write-Log ('health after start = ' + $healthy)

  if (-not $healthy) {
    Write-Log 'server started but never answered'
    Show-Error ("Lin Hub 服务启动了但没有响应（端口 $Port）。`n`n请查看日志：`n$logFile`n" + (Join-Path $logDir 'server.log'))
    exit 1
  }
} else {
  Write-Log 'healthy server already running -> reuse'
}

if (-not $NoOpen) {
  Start-Process ('http://localhost:' + $Port + '/') | Out-Null
  Write-Log 'browser opened'
}
Write-Log '--- launcher done ---'
