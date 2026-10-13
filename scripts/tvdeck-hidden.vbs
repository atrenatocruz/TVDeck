' Starts the production TVDeck server with no console window and waits for it, so Task Scheduler
' can see the exit code (restart-on-failure) and "End" stops the whole thing.
' Why wscript + Run(..., 0): window style 0 creates the console hidden from the start, so there is no
' flash (unlike "powershell -WindowStyle Hidden", which briefly shows a window before hiding it).
Option Explicit
Dim fso, shell, root, rc
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root
rc = shell.Run("cmd.exe /d /c npm start", 0, True)
WScript.Quit rc
