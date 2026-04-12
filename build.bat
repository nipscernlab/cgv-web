@echo off
setlocal
echo ============================================
echo   CGV-Web Full Build Pipeline
echo ============================================
echo.

REM ---- Step 0: Check required tools ----
echo [0/7] Checking required tools...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Install Node.js ^>= 18 from https://nodejs.org
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm not found. It should come bundled with Node.js.
    exit /b 1
)

where rustc >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Rust not found. Install from https://www.rust-lang.org/tools/install
    exit /b 1
)

where wasm-pack >nul 2>nul
if %errorlevel% neq 0 (
    echo wasm-pack not found. Installing via cargo...
    cargo install wasm-pack
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install wasm-pack.
        exit /b 1
    )
)

echo All tools found.
echo.

REM ---- Step 1: Install Node dependencies ----
echo [1/7] Installing Node dependencies...
cd /d "%~dp0"
call npm install --ignore-scripts
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 2: Patch jsroot modules ----
echo [2/7] Patching jsroot modules (setup.mjs)...
cd /d "%~dp0setup"
call node setup.mjs
if %errorlevel% neq 0 (
    echo ERROR: setup.mjs failed.
    exit /b 1
)
cd /d "%~dp0"
echo Done.
echo.

REM ---- Step 3: Delete old .cgv and .glb files ----
echo [3/7] Deleting old CaloGeometry.cgv and CaloGeometry.glb...
if exist "geometry_data\CaloGeometry.cgv" del "geometry_data\CaloGeometry.cgv"
if exist "geometry_data\CaloGeometry.glb" del "geometry_data\CaloGeometry.glb"
if exist "geometry_data\CaloGeometry_opt.glb" del "geometry_data\CaloGeometry_opt.glb"
echo Done.
echo.

REM ---- Step 4: Check that .root file exists ----
echo [4/7] Checking for source .root file...
if not exist "geometry_data\CaloGeometry.root" (
    echo ERROR: geometry_data\CaloGeometry.root not found!
    echo Place the .root file in geometry_data\ before running this script.
    exit /b 1
)
echo Found geometry_data\CaloGeometry.root
echo.

REM ---- Step 5: Compile .root -> .cgv + .glb ----
echo [5/7] Compiling .root to .cgv and .glb...
call node setup/root2scene.mjs geometry_data/CaloGeometry.root --out geometry_data
if %errorlevel% neq 0 (
    echo ERROR: root2scene.mjs failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 6: Optimize the GLB ----
echo [6/7] Optimizing GLB (strip + quantize)...
call node setup/optimize_glb.mjs --quantize
if %errorlevel% neq 0 (
    echo ERROR: optimize_glb.mjs failed.
    exit /b 1
)

echo Replacing original GLB with optimized version...
if exist "geometry_data\CaloGeometry_opt.glb" (
    del "geometry_data\CaloGeometry.glb"
    rename "geometry_data\CaloGeometry_opt.glb" "CaloGeometry.glb"
) else (
    echo WARNING: CaloGeometry_opt.glb not found. Skipping rename.
)
echo Done.
echo.

REM ---- Step 7: Build Rust ATLAS-ID parser (WASM) ----
echo [7/7] Building Rust ATLAS-ID parser (WASM)...
cd /d "%~dp0parser"
call wasm-pack build --target web --release
if %errorlevel% neq 0 (
    echo ERROR: wasm-pack build failed.
    exit /b 1
)
echo Removing generated .gitignore from parser/pkg...
if exist "%~dp0parser\pkg\.gitignore" del "%~dp0parser\pkg\.gitignore"
cd /d "%~dp0"
echo Done.
echo.

echo ============================================
echo   Build complete!
echo ============================================
echo.
echo Output files:
echo   - geometry_data\CaloGeometry.cgv
echo   - geometry_data\CaloGeometry.glb (optimized)
echo   - parser\pkg\atlas_id_parser.js
echo   - parser\pkg\atlas_id_parser_bg.wasm
echo.
echo Remember to bump GEO_CACHE_VER in index.html
echo to force client cache refresh.
echo.

endlocal
pause
