@echo off
rem Lin Files - double-click to start. The server runs in a HIDDEN background window (no terminal to manage).
rem Stop it with "停止 Lin Files.bat". Re-launching while running just opens the browser again.
rem (Keep this .bat ASCII-only: cmd.exe parses .bat files in the legacy ANSI codepage.)
cd /d "%~dp0"
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '.\runtime\node\node.exe' -ArgumentList 'server.js' -WindowStyle Hidden -WorkingDirectory '%~dp0' -RedirectStandardOutput '%~dp0server.log' -RedirectStandardError '%~dp0server.err.log'"
exit
