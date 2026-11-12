@echo off
setlocal
cd /d "%~dp0\..\.."
node ops\scripts\local-smoke.mjs
exit /b %ERRORLEVEL%
