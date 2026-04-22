@echo off
setlocal
echo ============================================
echo   CGV-Web Full Build Pipeline
echo ============================================
echo.

REM ---- Step 0: Check required tools ----
echo [0/8] Checking required tools...

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

REM Verify the wasm32-unknown-unknown target is installed (required by wasm-pack).
rustup target list --installed 2>nul | findstr /B /C:"wasm32-unknown-unknown" >nul
if %errorlevel% neq 0 (
    echo wasm32-unknown-unknown target missing. Installing via rustup...
    rustup target add wasm32-unknown-unknown
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install wasm32-unknown-unknown target.
        exit /b 1
    )
)

echo All tools found.
echo.

REM ---- Step 1: Install Node dependencies ----
echo [1/8] Installing Node dependencies...
cd /d "%~dp0"
call npm install --ignore-scripts
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 2: Patch jsroot modules ----
echo [2/8] Patching jsroot modules (setup.mjs)...
cd /d "%~dp0setup"
call node setup.mjs
if %errorlevel% neq 0 (
    echo ERROR: setup.mjs failed.
    exit /b 1
)
cd /d "%~dp0"
echo Done.
echo.

REM ---- Step 3: Clean old Rust/WASM artifacts ----
REM Cargo's incremental cache can hang on to stale target-feature flags from a
REM previous build and produce a subtly-different .wasm. Nuking parser\target
REM and parser\pkg guarantees every release ships the SIMD/bulk-memory-enabled
REM binary that matches the current .cargo\config.toml.
echo [3/8] Cleaning Rust build artifacts (parser\target, parser\pkg)...
if exist "parser\target" rd /s /q "parser\target"
if exist "parser\pkg"    rd /s /q "parser\pkg"
echo Done.
echo.

REM ---- Step 4: Delete old .glb / .glb.gz files ----
echo [4/8] Deleting old CaloGeometry.glb and .glb.gz...
if exist "geometry_data\CaloGeometry.glb"    del "geometry_data\CaloGeometry.glb"
if exist "geometry_data\CaloGeometry.glb.gz" del "geometry_data\CaloGeometry.glb.gz"
echo Done.
echo.

REM ---- Step 5: Check that source .root files exist ----
echo [5/8] Checking for source .root files...
if not exist "geometry_data\CaloGeometry.root" (
    echo ERROR: geometry_data\CaloGeometry.root not found!
    echo Place CaloGeometry.root in geometry_data\ before running this script.
    exit /b 1
)
if not exist "geometry_data\atlas.root" (
    echo ERROR: geometry_data\atlas.root not found!
    echo Place atlas.root in geometry_data\ before running this script.
    exit /b 1
)
echo Found geometry_data\CaloGeometry.root
echo Found geometry_data\atlas.root
echo.

REM ---- Step 6: Compile .root -> optimized .glb (single step) ----
echo [6/8] Compiling .root files to merged optimized .glb...
echo       Atlas filter: MUCH_1,MUC1_2
call node setup/root2scene.mjs geometry_data/CaloGeometry.root --atlas geometry_data/atlas.root --atlas-subtree-node MUCH_1,MUC1_2 --out geometry_data
if %errorlevel% neq 0 (
    echo ERROR: root2scene.mjs failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 7: GZip the .glb file ----
REM CaloGeometry.glb.gz is what the browser actually fetches; gzip encoding is
REM done server-side via Cloudflare on top of this, but shipping a pre-gzipped
REM file saves Cloudflare from having to compress on every cold edge hit.
REM Using Node's zlib instead of PowerShell GZipStream so the script behaves
REM identically in cmd.exe, bash, and CI runners (PowerShell availability
REM varies; Node is already a required dep per step 1).
echo [7/8] Compressing CaloGeometry.glb to CaloGeometry.glb.gz...
call node -e "const fs=require('fs'),zlib=require('zlib');const s='geometry_data/CaloGeometry.glb',d='geometry_data/CaloGeometry.glb.gz';fs.createReadStream(s).pipe(zlib.createGzip({level:9})).pipe(fs.createWriteStream(d)).on('finish',()=>{const sz=fs.statSync(d).size;console.log('Compressed to '+(sz/1048576).toFixed(2)+' MB');});"
if %errorlevel% neq 0 (
    echo ERROR: GZip compression failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 8: Build Rust ATLAS-ID parser (WASM) ----
REM `wasm-pack build --target web --release` reads the .cargo\config.toml
REM rustflags (target-feature=+simd128,+bulk-memory,...) and the
REM [package.metadata.wasm-pack.profile.release] section in Cargo.toml so
REM wasm-opt is invoked with matching --enable-* flags. The worker loads the
REM resulting atlas_id_parser.js + atlas_id_parser_bg.wasm off-main-thread.
echo [8/8] Building Rust ATLAS-ID parser (WASM)...
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
echo   - geometry_data\CaloGeometry.glb (optimized)
echo   - geometry_data\CaloGeometry.glb.gz (gzip-compressed)
echo   - parser\pkg\atlas_id_parser.js      (ES module shim)
echo   - parser\pkg\atlas_id_parser_bg.wasm (SIMD + bulk-memory)
echo.
echo Runtime entrypoints:
echo   - js\main.js         (spawns the WASM Web Worker)
echo   - js\wasm_worker.js  (hosts the parser off the main thread)
echo.

endlocal
pause
