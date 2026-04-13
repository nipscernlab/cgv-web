@echo off
setlocal
echo ============================================
echo   CGV-Web Full Build Pipeline
echo ============================================
echo.

REM ---- Step 0: Check required tools ----
echo [0/6] Checking required tools...

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
echo [1/6] Installing Node dependencies...
cd /d "%~dp0"
call npm install --ignore-scripts
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 2: Patch jsroot modules ----
echo [2/6] Patching jsroot modules (setup.mjs)...
cd /d "%~dp0setup"
call node setup.mjs
if %errorlevel% neq 0 (
    echo ERROR: setup.mjs failed.
    exit /b 1
)
cd /d "%~dp0"
echo Done.
echo.

REM ---- Step 3: Delete old .glb file ----
echo [3/6] Deleting old CaloGeometry.glb...
if exist "geometry_data\CaloGeometry.glb" del "geometry_data\CaloGeometry.glb"
echo Done.
echo.

REM ---- Step 4: Check that .root file exists ----
echo [4/6] Checking for source .root file...
if not exist "geometry_data\CaloGeometry.root" (
    echo ERROR: geometry_data\CaloGeometry.root not found!
    echo Place the .root file in geometry_data\ before running this script.
    exit /b 1
)
echo Found geometry_data\CaloGeometry.root
echo.

REM ---- Step 5: Compile .root -> optimized .glb (single step) ----
echo [5/6] Compiling .root to optimized .glb...
call node setup/root2scene.mjs geometry_data/CaloGeometry.root --out geometry_data
if %errorlevel% neq 0 (
    echo ERROR: root2scene.mjs failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 6: Build Rust ATLAS-ID parser (WASM) ----
echo [6/6] Building Rust ATLAS-ID parser (WASM)...
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
echo   - geometry_data\CaloGeometry.glb (optimized + quantized)
echo   - parser\pkg\atlas_id_parser.js
echo   - parser\pkg\atlas_id_parser_bg.wasm
echo.

endlocal
pause
