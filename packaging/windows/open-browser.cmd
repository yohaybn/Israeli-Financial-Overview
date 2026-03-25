@echo off
REM Default app port; override by setting PORT before starting the server
set "FO_PORT=%PORT%"
if "%FO_PORT%"=="" set "FO_PORT=3000"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%FO_PORT%/"
