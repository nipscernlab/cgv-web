@echo off
REM ============================================================================
REM CGV-Web FPS bench — abre o Chrome com o TETO DE FPS DESTRAVADO.
REM
REM POR QUE as 2 flags abaixo: num monitor de 60Hz, com vsync ligado o
REM requestAnimationFrame dispara so 60x/s, entao o app RENDERIZA so 60 frames
REM e o numero trava em 60 — mesmo que a GPU consiga 120/200. As flags removem
REM esse teto para a gente MEDIR a velocidade real (ex.: 120fps num painel 60Hz).
REM
REM IMPORTANTE: estas flags NAO deixam o app mais rapido e NAO favorecem a versao
REM nova — elas so deixam a gente CONTAR acima de 60. Sao aplicadas IGUAL nas duas
REM versoes, e NAO mexem nas flags de GPU do app (powerPreference/alpha/precision
REM ficam no renderer.js de cada versao, intactas; flags de linha de comando nao
REM sobrescrevem opcoes de getContext).
REM
REM Uso:   launch-chrome.bat            (porta 8080 = versao atual)
REM        launch-chrome.bat 8081       (porta 8081 = versao baseline 2cbaaa1)
REM
REM Mantenha a janela em PRIMEIRO PLANO durante a medicao (o render loop do app
REM pausa sozinho quando a aba fica oculta — isso e do app, nao das flags).
REM
REM Sanidade: com as flags ativas, o "~fps" ao vivo no painel deve passar de 60
REM na versao nova. Se ficar preso em 60, o vsync nao foi destravado — confira o
REM painel da NVIDIA (Vsync = "Usar config. do aplicativo") e chrome://gpu.
REM ============================================================================
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=8080

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

REM Perfil limpo e dedicado (extensoes/estado do Chrome do dia a dia nao interferem).
set PROFILE=%TEMP%\cgv-bench-profile

%CHROME% ^
  --user-data-dir="%PROFILE%" ^
  --disable-gpu-vsync ^
  --disable-frame-rate-limit ^
  --new-window "http://localhost:%PORT%/?perf=1"

endlocal
