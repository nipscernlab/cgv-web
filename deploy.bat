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

REM ---- Ensure destination roots exist (do NOT wipe nipscernweb) ----
if not exist "%DEST%" mkdir "%DEST%"
if not exist "..\nipscernweb\library" mkdir "..\nipscernweb\library"
if not exist "..\nipscernweb\library\cgvweb" mkdir "..\nipscernweb\library\cgvweb"

REM ---- Ensure sample XMLs are present (fetched from GitHub Release) ----
call node tools\scripts\fetch-samples.mjs
if errorlevel 1 (
    echo ERROR: fetch-samples.mjs failed.
    exit /b 1
)

echo [1/2] Refreshing deployed items (per-item delete + copy)...
echo.

REM --- index.html ---
if exist "%DEST%\index.html" del /q "%DEST%\index.html"
copy "%SRC%\public\index.html" "%DEST%\index.html" >nul
echo   - index.html

REM --- nipscern\ ---
if exist "%DEST%\nipscern" rd /s /q "%DEST%\nipscern"
xcopy "%SRC%\public\nipscern" "%DEST%\nipscern\" /e /i /q >nul
echo   - nipscern\

REM --- assets\ ---
if exist "%DEST%\assets" rd /s /q "%DEST%\assets"
xcopy "%SRC%\public\assets" "%DEST%\assets\" /e /i /q >nul
echo   - assets\

REM --- css\ ---
if exist "%DEST%\css" rd /s /q "%DEST%\css"
xcopy "%SRC%\public\css" "%DEST%\css\" /e /i /q >nul
echo   - css\

REM --- default_xml\ ---
if exist "%DEST%\default_xml" rd /s /q "%DEST%\default_xml"
xcopy "%SRC%\public\default_xml" "%DEST%\default_xml\" /e /i /q >nul
echo   - default_xml\

REM --- geometry_data\ (sem .root em nenhum nivel de subpasta) ---
if exist "%DEST%\geometry_data" rd /s /q "%DEST%\geometry_data"
(echo .root)> "%EXCLUDE%"
xcopy "%SRC%\public\geometry_data" "%DEST%\geometry_data\" /e /i /q /exclude:"%EXCLUDE%" >nul
del /q "%EXCLUDE%" 2>nul
echo   - geometry_data\ (sem .root)

REM --- js\ ---
if exist "%DEST%\js" rd /s /q "%DEST%\js"
xcopy "%SRC%\public\js" "%DEST%\js\" /e /i /q >nul
echo   - js\

REM --- live_atlas\ ---
if exist "%DEST%\live_atlas" rd /s /q "%DEST%\live_atlas"
xcopy "%SRC%\public\live_atlas" "%DEST%\live_atlas\" /e /i /q >nul
echo   - live_atlas\

REM --- parser\pkg\ (apenas .js e .wasm, sem .d.ts ou package.json) ---
if exist "%DEST%\parser" rd /s /q "%DEST%\parser"
mkdir "%DEST%\parser\pkg"
copy "%SRC%\public\parser\pkg\atlas_id_parser.js"      "%DEST%\parser\pkg\" >nul
copy "%SRC%\public\parser\pkg\atlas_id_parser_bg.wasm" "%DEST%\parser\pkg\" >nul
echo   - parser\pkg\ (JS + WASM)

REM --- vendor\ (Three.js, flag-icons, fontes, tabler-icons) ---
if exist "%DEST%\vendor" rd /s /q "%DEST%\vendor"
xcopy "%SRC%\public\vendor" "%DEST%\vendor\" /e /i /q >nul
echo   - vendor\

REM --- tools\twiki\  ->  nipscernweb\library\cgvweb\twiki ---
if exist "%TWIKI_DEST%" rd /s /q "%TWIKI_DEST%"
xcopy "%SRC%\tools\twiki" "%TWIKI_DEST%\" /e /i /q >nul
echo   - tools\twiki\  -^>  %TWIKI_DEST%

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
