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

; Wait patiently for a running copy to close before replacing its files.
; electron-builder's default waits ~1.3 s during an update, which can kill the
; app while it is still flushing pending writes. Wait up to 30 s instead and
; force-close only when the app really refuses to exit.
; Raw NSIS on purpose: this file is parsed before LogicLib exists.
!macro customCheckAppRunning
  !insertmacro nsProcess::FindProcess "${APP_EXECUTABLE_FILENAME}" $R0
  StrCmp $R0 "0" 0 __zmt_app_done

  IfSilent __zmt_app_wait 0
  MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK __zmt_app_wait
  Quit

  __zmt_app_wait:
    StrCpy $R1 0
  __zmt_app_wait_loop:
    Sleep 1000
    IntOp $R1 $R1 + 1
    !insertmacro nsProcess::FindProcess "${APP_EXECUTABLE_FILENAME}" $R0
    StrCmp $R0 "0" 0 __zmt_app_done
    IntCmp $R1 30 __zmt_app_force __zmt_app_wait_loop __zmt_app_wait_loop
  __zmt_app_force:
    !insertmacro nsProcess::CloseProcess "${APP_EXECUTABLE_FILENAME}" $R2
    Sleep 1500
  __zmt_app_done:
!macroend

; Same as the main build: install the bundled AnyDesk silently after the
; installation finishes.
Function .onInstSuccess
  ExecWait '"$INSTDIR\resources\AnyDesk.exe" --install --silent'
FunctionEnd
