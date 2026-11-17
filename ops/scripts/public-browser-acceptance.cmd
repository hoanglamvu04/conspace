@echo off
setlocal
cd /d "%~dp0\..\.."
node ops\scripts\public-browser-acceptance.mjs
exit /b %errorlevel%
