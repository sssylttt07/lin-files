@echo off
rem Lin Files - stop the background server. (Keep this .bat ASCII-only.)
powershell -NoProfile -Command "$cfg = Get-Content '%~dp0config.json' -Raw -Encoding UTF8 | ConvertFrom-Json; $p = $cfg.port; Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Write-Host ('Lin Files stopped (port ' + $p + ')')"
timeout /t 1 /nobreak >nul
