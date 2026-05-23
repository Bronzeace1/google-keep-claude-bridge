@echo off
:: Google Keep → Claude Bridge Installer
:: Double-click this file to install everything automatically.
echo.
echo  ============================================
echo   Google Keep ^> Claude Bridge  ^|  Installer
echo  ============================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
