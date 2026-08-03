@echo off
title ZMT PIECE Builder

echo ============================================
echo    ZMT PIECE - Build Installer v2.0.0
echo ============================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found! Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules\.bin\electron-builder*" (
    echo [*] Installing dependencies...
    call npm install
)

echo [*] Building ZMT PIECE v2.0.0 installer...
echo.

call npx electron-builder --win --x64

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo    [SUCCESS] Installer created!
    echo    Location: dist\ZMT PIECE-Setup-2.0.0.exe
    echo ============================================
) else (
    echo.
    echo [ERROR] Build failed. Check the output above.
)

pause
