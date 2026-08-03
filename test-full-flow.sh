@echo off
REM Test script for full migration flow
REM This script creates a test Excel file and runs the verification
echo ============================================
echo ZMT PIECE - Full Migration Flow Test
echo ============================================
echo.

REM Check if Node.js is available
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js.
    exit /b 1
)

echo [1/2] Installing dependencies if needed...
cd /d "%~dp0"
if not exist "node_modules\xlsx" (
    npm install xlsx --save 2>&1 | findstr /V "^$"
)

echo [2/2] Running test...
echo.
node renderer\tests\migration-flow-test.js

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================
    echo ALL TESTS PASSED SUCCESSFULLY!
    echo ============================================
) else (
    echo.
    echo ============================================
    echo SOME TESTS FAILED - Check output above
    echo ============================================
)
pause
