/* eslint-disable */
// ============================================================================
// DEPRECADO — não cole mais este arquivo no Console.
// ----------------------------------------------------------------------------
// O bench virou uma SUÍTE automática, carregada pelo próprio app com ?bench=1.
// O runner agora vive em:  public/js/bench.js
// e é injetado pelo index.html quando a URL tem ?bench=1 (via bench/launch-chrome.bat).
// Ele dirige o app pelo hook neutro window.__cgvApp (instalado por public/js/main.js,
// também só sob ?bench=1) — sem raspar HUD por regex, sem colar nada, e medindo
// TODOS os XMLs + o slicer num único clique.
//
// Fluxo novo:  bench\launch-chrome.bat 8080  →  aguarde o app  →  "▶ Rodar suíte
//              completa"  →  baixa 1 JSON.  Troque de branch, F5, repita.
//
// Detalhes e justiça da medição: veja bench/README.md.
// ============================================================================
console.warn(
  '[cgv-bench] Este arquivo foi DEPRECADO. Abra o app com ?bench=1 ' +
    '(bench/launch-chrome.bat) — o painel da suíte carrega sozinho. Veja bench/README.md.',
);
