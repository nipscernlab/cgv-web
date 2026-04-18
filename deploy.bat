@echo off
setlocal

set "SRC=."
set "DEST=..\nipscernweb\projects\cgvweb"
set "TWIKI_DEST=..\nipscernweb\library\cgvweb\twiki"

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

echo [1/2] Refreshing deployed items (per-item delete + copy)...
echo.

REM --- index.html ---
if exist "%DEST%\index.html" del /q "%DEST%\index.html"
copy "%SRC%\index.html" "%DEST%\index.html" >nul
echo   - index.html

REM --- nipscern\ ---
if exist "%DEST%\nipscern" rd /s /q "%DEST%\nipscern"
xcopy "%SRC%\nipscern" "%DEST%\nipscern\" /e /i /q >nul
echo   - nipscern\

REM --- assets\ ---
if exist "%DEST%\assets" rd /s /q "%DEST%\assets"
xcopy "%SRC%\assets" "%DEST%\assets\" /e /i /q >nul
echo   - assets\

REM --- css\ ---
if exist "%DEST%\css" rd /s /q "%DEST%\css"
xcopy "%SRC%\css" "%DEST%\css\" /e /i /q >nul
echo   - css\

REM --- default_xml\ ---
if exist "%DEST%\default_xml" rd /s /q "%DEST%\default_xml"
xcopy "%SRC%\default_xml" "%DEST%\default_xml\" /e /i /q >nul
echo   - default_xml\

REM --- geometry_data\ (without .root) ---
if exist "%DEST%\geometry_data" rd /s /q "%DEST%\geometry_data"
mkdir "%DEST%\geometry_data"
for %%F in ("%SRC%\geometry_data\*") do (
    if /i not "%%~xF"==".root" (
        copy "%%F" "%DEST%\geometry_data\" >nul
    )
)
for /d %%D in ("%SRC%\geometry_data\*") do (
    xcopy "%%D" "%DEST%\geometry_data\%%~nxD\" /e /i /q >nul
)
echo   - geometry_data\ (without .root)

REM --- js\ ---
if exist "%DEST%\js" rd /s /q "%DEST%\js"
xcopy "%SRC%\js" "%DEST%\js\" /e /i /q >nul
echo   - js\

REM --- live_atlas\ ---
if exist "%DEST%\live_atlas" rd /s /q "%DEST%\live_atlas"
xcopy "%SRC%\live_atlas" "%DEST%\live_atlas\" /e /i /q >nul
echo   - live_atlas\

REM --- parser\pkg\ (JS + WASM only) ---
if exist "%DEST%\parser" rd /s /q "%DEST%\parser"
mkdir "%DEST%\parser\pkg"
copy "%SRC%\parser\pkg\atlas_id_parser.js"      "%DEST%\parser\pkg\" >nul
copy "%SRC%\parser\pkg\atlas_id_parser_bg.wasm" "%DEST%\parser\pkg\" >nul
echo   - parser\pkg\ (JS + WASM only)

REM --- twiki\  ->  nipscernweb\library\cgvweb\twiki ---
if exist "%TWIKI_DEST%" rd /s /q "%TWIKI_DEST%"
xcopy "%SRC%\twiki" "%TWIKI_DEST%\" /e /i /q >nul
echo   - twiki\  -^>  %TWIKI_DEST%

echo.
echo Done.
echo.

REM ---- Summary ----
echo [2/2] Verifying...
echo.
echo Files in %DEST%:
dir /s /b "%DEST%" 2>nul | find /c /v ""
echo Files in %TWIKI_DEST%:
dir /s /b "%TWIKI_DEST%" 2>nul | find /c /v ""
echo.

echo ============================================
echo   Deploy complete!
echo ============================================
echo.
echo Next steps:
echo   cd ..\nipscernweb
echo   git add projects\cgvweb library\cgvweb\twiki
echo   git commit -m "Update CGV-Web"
echo   git push
echo.

endlocal
pause
