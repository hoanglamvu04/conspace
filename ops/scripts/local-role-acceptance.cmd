@echo off
setlocal
cd /d "%~dp0\..\.."
node ops\scripts\local-role-acceptance.mjs
exit /b %errorlevel%
