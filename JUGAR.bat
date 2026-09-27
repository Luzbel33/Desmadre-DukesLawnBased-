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
start "DESMADRE - servidor" cmd /k "cd /d ""%~dp0"" && npm start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
endlocal
