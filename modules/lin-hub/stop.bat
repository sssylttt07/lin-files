@echo off
rem Stop the Lin Hub local server.
rem NOTE: Get-NetTCPConnection reports the listener owner as PID 4 (http.sys), so we must
rem match the powershell process by its command line instead of by port.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pat = 'LinHub\ser' + 'ver.ps1'; $procs = @(Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like ('*' + $pat + '*') }); if ($procs.Count -eq 0) { Write-Host 'Lin Hub is not running.' } else { foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped process ' + $p.ProcessId) } }"
pause
