@echo off
set SCRCPY=%LOCALAPPDATA%\scrcpy\scrcpy-win64-v3.3.4
start "" /D "%SCRCPY%" "%SCRCPY%\scrcpy.exe" --serial 192.168.2.88:5555 --no-audio
