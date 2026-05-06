@echo off
setlocal

set "SRC=."
set "DEST=..\nipscernweb\projects\cgvweb"
set "TWIKI_DEST=..\nipscernweb\library\cgvweb\twiki"
set "EXCLUDE=%TEMP%\cgvweb_exclude_root.txt"

echo ============================================
echo   CGV-Web Deploy to nipscernweb
echo ============================================
echo.

REM ---- Verify nipscernweb checkout is present ----
if not exist "..\nipscernweb" (
    echo ERROR: ..\nipscernweb not found. Clone nipscernweb next to cgv-web first.
    exit /b 1
)

REM ---- Fetch geometry from GitHub Release (CaloGeometry.glb.gz) ----
echo Fetching geometry...
call node tools\scripts\fetch-geometry.mjs
if errorlevel 1 (
    echo ERROR: fetch-geometry.mjs failed.
    exit /b 1
)
echo.

REM ---- Fetch sample XMLs from GitHub Release ----
echo Fetching sample XMLs...
call node tools\scripts\fetch-samples.mjs
if errorlevel 1 (
    echo ERROR: fetch-samples.mjs failed.
    exit /b 1
)
echo.

echo [1/2] Wiping and recopying...
echo.

REM ---- Wipe projects\cgvweb entirely then copy public\ fresh ----
if exist "%DEST%" (
    rd /s /q "%DEST%"
    echo   - Wiped %DEST%
)
mkdir "%DEST%"
(echo .root)> "%EXCLUDE%"
xcopy "%SRC%\public" "%DEST%\" /e /i /q /exclude:"%EXCLUDE%" >nul
del /q "%EXCLUDE%" 2>nul
echo   - public\ --^> %DEST%\  (sem .root)

REM ---- Wipe library\cgvweb\twiki then copy tools\twiki\ fresh ----
if not exist "..\nipscernweb\library\cgvweb" mkdir "..\nipscernweb\library\cgvweb"
if exist "%TWIKI_DEST%" (
    rd /s /q "%TWIKI_DEST%"
    echo   - Wiped %TWIKI_DEST%
)
xcopy "%SRC%\tools\twiki" "%TWIKI_DEST%\" /e /i /q >nul
echo   - tools\twiki\ --^> %TWIKI_DEST%\

echo.
echo Done.
echo.

REM ---- Summary ----
echo [2/2] Verificando...
echo.
echo Arquivos em %DEST%:
dir /s /b "%DEST%" 2>nul | find /c /v ""
echo Arquivos em %TWIKI_DEST%:
dir /s /b "%TWIKI_DEST%" 2>nul | find /c /v ""
echo.

echo ============================================
echo   Deploy completo!
echo ============================================
echo.
echo Proximos passos:
echo   cd ..\nipscernweb
echo   git add projects\cgvweb library\cgvweb\twiki
echo   git commit -m "Update CGV-Web"
echo   git push
echo.

endlocal
pause
