@echo off
rem Lin Hub - start local server and open UI
cd /d "%~dp0"
start "LinHub" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8791/"
