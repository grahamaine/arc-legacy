@echo off
title Arc Legacy Agent - REHEARSAL (dry-run, no transactions)
cd /d "%~dp0"
echo Running the autonomous agent in DRY-RUN mode (reads only, sends nothing)...
echo.
node "%~dp0agent\keeper.js" --dry-run
echo.
echo === Rehearsal finished. Press any key to close. ===
pause >nul
