@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js 18 o superior y volve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
if not defined OWNER_KEY (
  if not exist "data\owner.key" node -e "const fs=require('node:fs');fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/owner.key',require('node:crypto').randomBytes(32).toString('base64url'),{flag:'wx'});"
  if exist "data\owner.key" set /p OWNER_KEY=<"data\owner.key"
)
start "DESMADRE - servidor" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
endlocal
