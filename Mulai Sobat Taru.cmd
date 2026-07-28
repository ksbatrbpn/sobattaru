@echo off
setlocal
cd /d "%~dp0"
set "CODEX_PYTHON=C:\Users\Acer1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%CODEX_PYTHON%" (
  "%CODEX_PYTHON%" sobat_taru_server.py
) else (
  python sobat_taru_server.py
)
if errorlevel 1 (
  echo.
  echo Sobat Taru tidak dapat dijalankan. Pastikan Python tersedia.
  pause
)
