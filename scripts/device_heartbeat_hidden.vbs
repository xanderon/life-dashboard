Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1Path = scriptDir & "\device_heartbeat.ps1"

WshShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File """ & ps1Path & """", 0

Set WshShell = Nothing
Set fso = Nothing
