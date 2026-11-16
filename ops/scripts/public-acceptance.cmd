@echo off
setlocal
cd /d "%~dp0\..\.."
node ops\scripts\public-acceptance.mjs
exit /b %errorlevel%
