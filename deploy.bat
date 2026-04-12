@echo off
setlocal

set "SRC=c:\Users\chrys\Documents\GitHub\cgv-web"
set "DEST=c:\Users\chrys\Documents\GitHub\nipscernweb\projects\cgvweb"

echo ============================================
echo   CGV-Web Deploy to nipscernweb
echo ============================================
echo.

REM ---- Verify destination exists ----
if not exist "%DEST%" (
    echo ERROR: Destination folder not found: %DEST%
    exit /b 1
)

REM ---- Clean destination ----
echo [1/3] Cleaning destination folder...
rd /s /q "%DEST%" 2>nul
mkdir "%DEST%"
echo Done.
echo.

REM ---- Copy files ----
echo [2/3] Copying project files...

REM index.html
copy "%SRC%\index.html" "%DEST%\index.html" >nul
echo   - index.html

REM assets
xcopy "%SRC%\assets" "%DEST%\assets\" /e /i /q >nul
echo   - assets\

REM css
xcopy "%SRC%\css" "%DEST%\css\" /e /i /q >nul
echo   - css\

REM default_xml
xcopy "%SRC%\default_xml" "%DEST%\default_xml\" /e /i /q >nul
echo   - default_xml\

REM geometry_data (without .root)
xcopy "%SRC%\geometry_data" "%DEST%\geometry_data\" /e /i /q /exclude:%SRC%\deploy_exclude.tmp >nul 2>nul
REM Use explicit copy to exclude .root
mkdir "%DEST%\geometry_data" 2>nul
for %%F in ("%SRC%\geometry_data\*") do (
    if /i not "%%~xF"==".root" (
        copy "%%F" "%DEST%\geometry_data\" >nul
    )
)
REM Copy subdirectories if any
for /d %%D in ("%SRC%\geometry_data\*") do (
    xcopy "%%D" "%DEST%\geometry_data\%%~nxD\" /e /i /q >nul
)
echo   - geometry_data\ (without .root)

REM js
xcopy "%SRC%\js" "%DEST%\js\" /e /i /q >nul
echo   - js\

REM live_atlas
xcopy "%SRC%\live_atlas" "%DEST%\live_atlas\" /e /i /q >nul
echo   - live_atlas\

REM parser/pkg (only WASM and JS needed at runtime)
mkdir "%DEST%\parser\pkg" 2>nul
copy "%SRC%\parser\pkg\atlas_id_parser.js" "%DEST%\parser\pkg\" >nul
copy "%SRC%\parser\pkg\atlas_id_parser_bg.wasm" "%DEST%\parser\pkg\" >nul
echo   - parser\pkg\ (JS + WASM only)

echo.
echo Done.
echo.

REM ---- Summary ----
echo [3/3] Verifying...
echo.
echo Deployed files:
dir /s /b "%DEST%" 2>nul | find /c /v ""
echo  file(s) copied to %DEST%
echo.

echo ============================================
echo   Deploy complete!
echo ============================================
echo.
echo Next steps:
echo   cd %DEST%\..\..\
echo   git add projects/cgvweb
echo   git commit -m "Update CGV-Web"
echo   git push
echo.

endlocal
pause
