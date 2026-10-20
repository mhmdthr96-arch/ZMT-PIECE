@echo off
setlocal EnableExtensions EnableDelayedExpansion
rem =========================================================================
rem  verify-copy.cmd - run AFTER copying the installers somewhere else (USB
rem  stick, another PC) to prove the copy is byte-perfect.
rem
rem     verify-copy.cmd "D:\ZMT"     folder holding SHA256SUMS.txt
rem     verify-copy.cmd              defaults to this folder
rem
rem  Compares every file listed in SHA256SUMS.txt (written by
rem  scripts\verify-installers.js after each build) with certutil's SHA256.
rem  Exit code 0 = copy is good, 1 = something is missing or corrupted.
rem =========================================================================

set "FOLDER=%~1"
if "%FOLDER%"=="" set "FOLDER=%CD%"
if not exist "%FOLDER%\SHA256SUMS.txt" (
  echo FAIL: SHA256SUMS.txt not found in "%FOLDER%"
  exit /b 1
)

echo Verifying files in "%FOLDER%" against SHA256SUMS.txt ...
set /a OKCNT=0
set /a BADCNT=0

for /f "usebackq tokens=1,* delims= " %%A in ("%FOLDER%\SHA256SUMS.txt") do (
  set "EXPECTED=%%A"
  set "NAME=%%B"
  if not "!NAME!"=="" if not "!EXPECTED!"=="" (
    if not exist "%FOLDER%\!NAME!" (
      echo FAIL  !NAME!  [missing]
      set /a BADCNT+=1
    ) else (
      set "ACTUAL="
      for /f "delims=" %%H in ('certutil -hashfile "%FOLDER%\!NAME!" SHA256 ^| findstr /r /v ":"') do if not defined ACTUAL set "ACTUAL=%%H"
      set "ACTUAL=!ACTUAL: =!"
      if "!ACTUAL!"=="" (
        echo FAIL  !NAME!  [could not hash]
        set /a BADCNT+=1
      ) else if /i "!ACTUAL!"=="!EXPECTED!" (
        echo OK    !NAME!
        set /a OKCNT+=1
      ) else (
        echo FAIL  !NAME!  [corrupted copy]
        echo        expected !EXPECTED!
        echo        actual   !ACTUAL!
        set /a BADCNT+=1
      )
    )
  )
)

echo.
if %BADCNT% GTR 0 (
  echo RESULT: %BADCNT% bad, %OKCNT% good - DO NOT use these files.
  exit /b 1
)
if %OKCNT% EQU 0 (
  echo RESULT: nothing verified - SHA256SUMS.txt is empty?
  exit /b 1
)
echo RESULT: %OKCNT% file(s) verified, copy is good.
exit /b 0
