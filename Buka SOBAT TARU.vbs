Option Explicit

Dim shell, files, folder, pythonPath, serverPath, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")

folder = files.GetParentFolderName(WScript.ScriptFullName)
pythonPath = "C:\Users\Acer1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
serverPath = folder & "\sobat_taru_server.py"

If files.FileExists(pythonPath) Then
    command = """" & pythonPath & """ """ & serverPath & """"
Else
    command = "python """ & serverPath & """"
End If

shell.Run command, 0, False
