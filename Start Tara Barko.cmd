@echo off
rem Double-click this to run the system on this laptop.
rem
rem It serves the files over http and opens the browser. It does not install
rem anything and it does not change anything -- closing the window stops it.

title Tara Barko Maritime - running locally
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this laptop, and this needs it.
  echo   Get it from https://nodejs.org  ^(the LTS version^), then run this again.
  echo.
  pause
  exit /b 1
)

start "" http://localhost:4173/
node tools\serve.js 4173

echo.
echo   Stopped.
pause
