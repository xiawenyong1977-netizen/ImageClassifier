!macro _KillProcess PROCESS_NAME
  DetailPrint "尝试结束进程: ${PROCESS_NAME}"
  nsExec::ExecToLog 'taskkill /F /IM "${PROCESS_NAME}" /T'
!macroend

!macro customInit
  !insertmacro _KillProcess "XinTuAlbum.exe"
  !insertmacro _KillProcess "XinTuAlbum Helper.exe"
  !insertmacro _KillProcess "XinTuAlbum Helper (Renderer).exe"
  !insertmacro _KillProcess "XinTuAlbum Helper (GPU).exe"
  !insertmacro _KillProcess "XinTuAlbum Helper (Plugin).exe"
  !insertmacro _KillProcess "XinTuAlbum Updater.exe"
!macroend

