; Silent-install AnyDesk bundled with ZMT PIECE.
; Runs after the main installation completes; --install --silent ensures
; no setup window is shown to the user. AnyDesk self-installs to
; %LOCALAPPDATA%\AnyDesk (the same path the app's support button checks).
Function .onInstSuccess
  ExecWait '"$INSTDIR\resources\AnyDesk.exe" --install --silent'
FunctionEnd
