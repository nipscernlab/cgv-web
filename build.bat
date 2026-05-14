@echo off
setlocal
echo ============================================
echo   CGV-Web Full Build Pipeline
echo ============================================
echo.

REM ---- Step 0: Check & auto-install required tools ----
REM This step is self-healing: if Node.js or Rust are missing it installs them
REM via winget when available (Windows 10 1809+ / Windows 11) and falls back to
REM the official MSI / rustup-init.exe over PowerShell otherwise. wasm-pack and
REM the wasm32-unknown-unknown target are installed via cargo/rustup as before.
echo [0/9] Checking required tools (auto-installs missing ones)...

REM --- Node.js ---
where node >nul 2>nul
if not errorlevel 1 goto :have_node

echo  - Node.js not found. Installing...
where winget >nul 2>nul
if errorlevel 1 goto :node_msi

echo    Using winget (OpenJS.NodeJS.LTS)...
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto :have_node
echo    winget did not yield a working node.exe. Falling back to MSI...

:node_msi
echo    Downloading Node.js v22.11.0 LTS MSI via PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-x64.msi' -OutFile '%TEMP%\node-lts.msi'"
if errorlevel 1 (
    echo ERROR: Failed to download Node.js installer.
    exit /b 1
)
echo    Installing MSI (may prompt for elevation)...
msiexec /i "%TEMP%\node-lts.msi" /quiet /norestart
if errorlevel 1 (
    echo ERROR: Node.js MSI install failed. Run build.bat from an elevated shell or install manually from https://nodejs.org
    exit /b 1
)
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js install finished but 'node' is not on PATH for this session.
    echo Open a new terminal and re-run build.bat.
    exit /b 1
)

:have_node

REM npm ships with Node — sanity check.
where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm not found. It should come bundled with Node.js.
    exit /b 1
)

REM --- Rust ---
where rustc >nul 2>nul
if not errorlevel 1 goto :have_rust

echo  - Rust not found. Installing...
where winget >nul 2>nul
if errorlevel 1 goto :rust_init

echo    Using winget (Rustlang.Rustup)...
winget install -e --id Rustlang.Rustup --silent --accept-source-agreements --accept-package-agreements
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where rustc >nul 2>nul
if not errorlevel 1 goto :have_rust
echo    winget did not yield a working rustc.exe. Falling back to rustup-init.exe...

:rust_init
echo    Downloading rustup-init.exe via PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://win.rustup.rs/x86_64' -OutFile '%TEMP%\rustup-init.exe'"
if errorlevel 1 (
    echo ERROR: Failed to download rustup-init.exe.
    exit /b 1
)
echo    Running rustup-init.exe -y --default-toolchain stable --profile minimal...
"%TEMP%\rustup-init.exe" -y --default-toolchain stable --profile minimal
if errorlevel 1 (
    echo ERROR: rustup-init failed.
    exit /b 1
)
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where rustc >nul 2>nul
if errorlevel 1 (
    echo ERROR: Rust install finished but 'rustc' is not on PATH for this session.
    echo Open a new terminal and re-run build.bat.
    exit /b 1
)

:have_rust

REM --- wasm-pack ---
where wasm-pack >nul 2>nul
if errorlevel 1 (
    echo  - wasm-pack not found. Installing via cargo...
    cargo install wasm-pack
    if errorlevel 1 (
        echo ERROR: Failed to install wasm-pack.
        exit /b 1
    )
)

REM --- wasm32-unknown-unknown target ---
REM Verify the wasm32-unknown-unknown target is installed (required by wasm-pack).
rustup target list --installed 2>nul | findstr /B /C:"wasm32-unknown-unknown" >nul
if errorlevel 1 (
    echo  - wasm32-unknown-unknown target missing. Installing via rustup...
    rustup target add wasm32-unknown-unknown
    REM Re-verify by listing targets — rustup target add can return non-zero on
    REM Windows even when the component installed successfully (known rustup quirk).
    rustup target list --installed 2>nul | findstr /B /C:"wasm32-unknown-unknown" >nul
    if errorlevel 1 (
        echo ERROR: Failed to install wasm32-unknown-unknown target.
        exit /b 1
    )
)

echo All tools ready.
echo.

REM ---- Step 1: Install Node dependencies ----
echo [1/9] Installing Node dependencies...
cd /d "%~dp0"
call npm install --ignore-scripts
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 2: Fetch geometry assets + JiveXML samples ----
REM Both scripts are idempotent (SHA-256 cached) so re-runs are cheap.
REM --with-source pulls the .root inputs (CaloGeometry.root, atlas.root) needed
REM by root2scene.mjs in step 7. The runtime CaloGeometry.glb.gz is also
REM downloaded; step 5 wipes it and steps 7-8 regenerate a fresh one.
echo [2/9] Fetching geometry assets and JiveXML samples...
call node tools/scripts/fetch-geometry.mjs --with-source
if %errorlevel% neq 0 (
    echo ERROR: fetch-geometry.mjs failed.
    exit /b 1
)
call node tools/scripts/fetch-samples.mjs
if %errorlevel% neq 0 (
    echo ERROR: fetch-samples.mjs failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 3: Patch jsroot modules ----
echo [3/9] Patching jsroot modules (setup.mjs)...
cd /d "%~dp0tools\setup"
call node setup.mjs
if %errorlevel% neq 0 (
    echo ERROR: setup.mjs failed.
    exit /b 1
)
cd /d "%~dp0"
echo Done.
echo.

REM ---- Step 4: Clean old Rust/WASM artifacts ----
REM Cargo's incremental cache can hang on to stale target-feature flags from a
REM previous build and produce a subtly-different .wasm. Nuking parser\target
REM and parser\pkg guarantees every release ships the SIMD/bulk-memory-enabled
REM binary that matches the current .cargo\config.toml.
echo [4/9] Cleaning Rust build artifacts (parser\target, parser\pkg)...
if exist "parser\target" rd /s /q "parser\target"
if exist "parser\pkg"    rd /s /q "parser\pkg"
echo Done.
echo.

REM ---- Step 5: Delete old .glb / .glb.gz files ----
echo [5/9] Deleting old CaloGeometry.glb and .glb.gz...
if exist "public\geometry_data\CaloGeometry.glb"    del "public\geometry_data\CaloGeometry.glb"
if exist "public\geometry_data\CaloGeometry.glb.gz" del "public\geometry_data\CaloGeometry.glb.gz"
echo Done.
echo.

REM ---- Step 6: Check that source .root files exist ----
echo [6/9] Checking for source .root files...
if not exist "public\geometry_data\CaloGeometry.root" (
    echo ERROR: public\geometry_data\CaloGeometry.root not found!
    echo Place CaloGeometry.root in public\geometry_data\ before running this script.
    exit /b 1
)
if not exist "public\geometry_data\atlas.root" (
    echo ERROR: public\geometry_data\atlas.root not found!
    echo Place atlas.root in public\geometry_data\ before running this script.
    exit /b 1
)
echo Found public\geometry_data\CaloGeometry.root
echo Found public\geometry_data\atlas.root
echo.

REM ---- Step 7: Compile .root -> optimized .glb (single step) ----
echo [7/9] Compiling .root files to merged optimized .glb...
echo       Atlas filter: MUCH_1,MUC1_2
call node tools/setup/root2scene.mjs public/geometry_data/CaloGeometry.root --atlas public/geometry_data/atlas.root --atlas-subtree-node MUCH_1,MUC1_2 --out public/geometry_data
if %errorlevel% neq 0 (
    echo ERROR: root2scene.mjs failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 8: GZip the .glb file ----
REM CaloGeometry.glb.gz is what the browser actually fetches; gzip encoding is
REM done server-side via Cloudflare on top of this, but shipping a pre-gzipped
REM file saves Cloudflare from having to compress on every cold edge hit.
REM Using Node's zlib instead of PowerShell GZipStream so the script behaves
REM identically in cmd.exe, bash, and CI runners (PowerShell availability
REM varies; Node is already a required dep per step 1).
echo [8/9] Compressing CaloGeometry.glb to CaloGeometry.glb.gz...
call node -e "const fs=require('fs'),zlib=require('zlib');const s='public/geometry_data/CaloGeometry.glb',d='public/geometry_data/CaloGeometry.glb.gz';fs.createReadStream(s).pipe(zlib.createGzip({level:9})).pipe(fs.createWriteStream(d)).on('finish',()=>{const sz=fs.statSync(d).size;console.log('Compressed to '+(sz/1048576).toFixed(2)+' MB');});"
if %errorlevel% neq 0 (
    echo ERROR: GZip compression failed.
    exit /b 1
)
echo Done.
echo.

REM ---- Step 9: Build Rust ATLAS-ID parser (WASM) ----
REM `wasm-pack build --target web --release` reads the .cargo\config.toml
REM rustflags (target-feature=+simd128,+bulk-memory,...) and the
REM [package.metadata.wasm-pack.profile.release] section in Cargo.toml so
REM wasm-opt is invoked with matching --enable-* flags. The worker loads the
REM resulting atlas_id_parser.js + atlas_id_parser_bg.wasm off-main-thread.
echo [9/9] Building Rust ATLAS-ID parser (WASM)...
cd /d "%~dp0parser"
call wasm-pack build --target web --release --out-dir ../public/parser/pkg
if %errorlevel% neq 0 (
    echo ERROR: wasm-pack build failed.
    exit /b 1
)
echo Removing generated .gitignore from public/parser/pkg...
if exist "%~dp0public\parser\pkg\.gitignore" del "%~dp0public\parser\pkg\.gitignore"
cd /d "%~dp0"
echo Done.
echo.

echo ============================================
echo   Build complete!
echo ============================================
echo.
echo Output files:
echo   - public\geometry_data\CaloGeometry.glb (optimized)
echo   - public\geometry_data\CaloGeometry.glb.gz (gzip-compressed)
echo   - public\default_xml\JiveXML_*.xml (6 event samples)
echo   - public\parser\pkg\atlas_id_parser.js      (ES module shim)
echo   - public\parser\pkg\atlas_id_parser_bg.wasm (SIMD + bulk-memory)
echo.
echo Runtime entrypoints:
echo   - js\main.js         (spawns the WASM Web Worker)
echo   - js\wasm_worker.js  (hosts the parser off the main thread)
echo.

endlocal
pause
