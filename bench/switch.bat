@echo off
REM ============================================================================
REM CGV-Web bench - alterna entre a versao ATUAL e a ANTERIOR (pre-performance).
REM Mesmo diretorio, mesmo servidor: troca o branch; voce recarrega o Chrome
REM (o serve.py serve do disco, sem cache => reflete a versao trocada).
REM
REM Uso:   bench\switch.bat current     (versao atual,  branch bench-current)
REM        bench\switch.bat baseline    (antes da perf, branch bench-baseline @ 2cbaaa1)
REM
REM Requer git no PATH (e node, so se faltar baixar geometria/XMLs).
REM ============================================================================
setlocal
set "V=%~1"
if /i "%V%"=="current"  ( set "BRANCH=bench-current"  & goto run )
if /i "%V%"=="baseline" ( set "BRANCH=bench-baseline" & goto run )
echo Uso: bench\switch.bat current^|baseline
exit /b 1

:run
cd /d "%~dp0.."
git checkout %BRANCH%
if errorlevel 1 ( echo ERRO: git checkout falhou ^(mudancas nao commitadas? rode "git status"^). & exit /b 1 )

if not exist "public\geometry_data\CaloGeometry.glb.gz" (
  echo baixando geometria...
  node tools\scripts\fetch-geometry.mjs
)
if not exist "public\default_xml\index.json" (
  echo baixando samples...
  node tools\scripts\fetch-samples.mjs
)

echo.
echo === Versao ativa: %V%  ^(branch %BRANCH%^) ===
git rev-parse --short HEAD
echo Garanta 'python serve.py 8080' rodando e de F5 no Chrome.
echo Depois cole bench\cgv-bench.js no console e meca.
endlocal
