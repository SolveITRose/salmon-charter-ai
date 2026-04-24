@echo off
echo ============================================
echo  Salmon Charter AI — Web Deploy to Azure
echo ============================================
echo.

echo [1/2] Building web app...
call npx expo export --platform web
if errorlevel 1 (
  echo.
  echo ERROR: Build failed. Fix errors above and try again.
  exit /b 1
)

echo.
echo [2/2] Deploying to Azure Static Web Apps...
call npx @azure/static-web-apps-cli deploy dist/ --app-name salmon-charter-ai --no-use-keychain
if errorlevel 1 (
  echo.
  echo ERROR: Deploy failed. Check Azure CLI auth and try again.
  exit /b 1
)

echo.
echo ✓ Deployed successfully!
echo.
