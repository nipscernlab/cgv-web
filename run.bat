@echo off
setlocal
cd /d "%~dp0"

rem Optional: pass a port, e.g.  run.bat 9090
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

echo.
echo   CGV Web -- Local Launcher
echo   -------------------------
echo   Starting static server on port %PORT%
echo   Close this window (or press Ctrl+C) to stop.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-server.ps1" -Root "%~dp0." -Port %PORT%
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
    echo.
    echo Server exited with code %RC%.
    pause
)

endlocal
