@echo off
title Arc Legacy Agent - LIVE (sends real USDC transactions)
cd /d "%~dp0"
echo Running the autonomous agent for real (one cycle)...
echo.
node "%~dp0agent\keeper.js" --once
echo.
echo === Agent finished. Press any key to close. ===
pause >nul
