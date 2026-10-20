; ==========================================================================
; ZMT PIECE — win7/8 build (Electron 22, Windows 7 SP1 and newer).
; win7.builder.json -> nsis.include = "build/installer-win7.nsh"
;
; NO Windows version guard here: this is the build meant for old systems.
; It must stay usable on Windows 7/8/8.1, otherwise there is no installer
; left for those machines (build/installer.nsh blocks them on purpose).
;
; IMPORTANT: this file is parsed BEFORE common.nsh / MUI2 / LogicLib, so only
; raw NSIS instructions may be used here (no ${If}, no WinVer).
; ==========================================================================

; Same as the main build: install the bundled AnyDesk silently after the
; installation finishes.
Function .onInstSuccess
  ExecWait '"$INSTDIR\resources\AnyDesk.exe" --install --silent'
FunctionEnd
