@echo off
cd /d "%~dp0"
timeout /t 2 /nobreak >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-browser.ps1"
