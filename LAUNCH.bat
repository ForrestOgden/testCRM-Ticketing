@echo off
setlocal
cd /d "%~dp0"
title MSP CRM Launcher

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo MSP CRM did not launch successfully.
  echo Review the error above, then press any key to close this window.
  pause >nul
)

exit /b %EXIT_CODE%
