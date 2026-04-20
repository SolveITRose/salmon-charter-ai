@echo off
echo [1/3] Killing any existing Metro on port 8081...
npx kill-port 8081 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] Starting Metro Bundler...
start "Metro Bundler" cmd /k "npx expo start --port 8081"

echo Waiting for Metro to be ready...
:wait
timeout /t 2 /nobreak >nul
curl -s http://localhost:8081/status | find "running" >nul
if errorlevel 1 goto wait

echo [3/3] Setting up ADB reverse tunnel...
set ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
%ADB% -s 192.168.2.88:5555 reverse --remove-all
%ADB% -s 192.168.2.88:5555 reverse tcp:8081 tcp:8081
%ADB% -s 192.168.2.88:5555 reverse --list

echo.
echo ✓ Ready. On your phone: Expo Go ^> Enter URL ^> exp://localhost:8081
echo   (Only needed on first connect or after Metro restart)
echo.
