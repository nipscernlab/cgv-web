/* eslint-disable */
// ============================================================================
// CGV-Web — Ferramenta EXTERNA de medição de FPS (stress test do Cinema mode)
// ----------------------------------------------------------------------------
// NÃO faz parte do app. NÃO importa nem modifica nenhum módulo do CGV-Web.
// Mede a cadência REAL de frames com um loop requestAnimationFrame próprio,
// de forma IDÊNTICA em qualquer versão (atual ou pré-performance 2cbaaa1).
//
// LÓGICA DO TESTE (importante):
//   • Entra no Cinema UMA vez, aquece (deixa a ignição/replay e o follower
//     assentarem) e mede N CICLOS COMPLETOS EM SEQUÊNCIA, sem resetar a câmera
//     entre eles — assim cada repetição é um ciclo inteiro e contínuo (nada de
//     "voltar do zero" no meio). O fluxo é segmentado em N reps depois.
//   • Mede com o teto de FPS destravado (rode pelo launch-chrome.bat) para
//     enxergar > 60 fps num monitor de 60Hz.
//   • Aborta com segurança se a aba perde o foco (o render loop do app pausa) ou
//     se os frames param — nesse caso NADA é salvo (medição inválida).
//
// COMO USAR (Windows):
//   1) Abra o Chrome pelo bench/launch-chrome.bat (teto de FPS destravado).
//   2) Carregue um XML pela interface (assista carregar).
//   3) (opcional) Ligue o Slicer (Shift+S) p/ o teste de geometria inteira.
//   4) Cole TODO este arquivo no Console (F12) e Enter → painel no canto.
//   5) Ajuste label/modo, clique "Rodar" e ASSISTA. NÃO troque de aba.
//      Ao fim baixa um JSON com os dados BRUTOS. Análise é feita DEPOIS.
//   6) Carregue o próximo XML e repita.
// ============================================================================
(() => {
  'use strict';

  // cicloS deve ser >= a duracao do loop do cinema (atual ~75s, baseline ~60s),
  // para garantir que cada rep cubra a trajetoria inteira ao menos uma vez.
  const DEFAULTS = { reps: 3, warmupS: 8, cycleS: 78 };
  const LS_KEY = 'cgv-bench-runs';

  // -- Limpeza de instância anterior (re-colagem segura) ---------------------
  document.getElementById('cgv-bench-panel')?.remove();
  if (window.__cgvBench?.probe?.raf) cancelAnimationFrame(window.__cgvBench.probe.raf);
  if (window.__cgvBench?._vis)
    document.removeEventListener('visibilitychange', window.__cgvBench._vis);

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // O teste usa SÓ o modo Tour (cinema padrão). Se algum experimento antigo
  // deixou o app em modo órbita (cgv-tour-mode=0), corrige p/ o próximo reload.
  let _wasOrbit = false;
  try {
    if (localStorage.getItem('cgv-tour-mode') === '0') {
      localStorage.setItem('cgv-tour-mode', '1');
      _wasOrbit = true;
    }
  } catch (e) {
    /* ignore */
  }
  const waitFor = async (fn, timeoutMs, step = 100) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (fn()) return true;
      await sleep(step);
    }
    return fn();
  };

  // -- GPU real via WebGL debug info -----------------------------------------
  function gpuString() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return 'no-webgl';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'no-debug-ext';
    } catch (e) {
      return 'gpu-error:' + e.message;
    }
  }

  const currentXml = () =>
    document.querySelector('.sample-item.cur .sample-item-name')?.textContent.trim() || '';

  // Acha o HUD de FPS DO APP (exclui o painel do bench, que também contém "FPS").
  const appHudEl = () =>
    [...document.querySelectorAll('body > div')].find(
      (d) => d.id !== 'cgv-bench-panel' && /draws|FPS/.test(d.textContent || ''),
    );

  function versionHint() {
    const el = appHudEl();
    return el && /draws/.test(el.textContent) ? 'current(perf-hud)' : 'baseline-or-no-perf';
  }

  // Lê o HUD do app (cross-check). Atual (?perf=1): fps, draws, tris, cpu p50/p95.
  // Antiga: só fps (rAF, capado). Guardamos cru + parseado.
  function readHud() {
    const el = appHudEl();
    const raw = el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    const out = { raw };
    let m;
    if (raw) {
      if ((m = raw.match(/([\d.]+)\s*FPS/i))) out.fps = +m[1];
      if ((m = raw.match(/(\d+)\s*draws/))) out.draws = +m[1];
      if ((m = raw.match(/([\d.]+\s*[MK]?)\s*tris/))) out.tris = m[1].replace(/\s+/g, '');
      if ((m = raw.match(/cpu\s*([\d.]+)\s*\/\s*([\d.]+)/))) {
        out.cpuP50 = +m[1];
        out.cpuP95 = +m[2];
      }
    }
    return out;
  }

  // Conta células do evento (TILE+LAr+HEC+FCAL) baixando o XML atual 1× (cacheado
  // por nome). Deixa cada JSON auto-contido. null se não der (ex.: XML do usuário).
  async function cellCount() {
    const disp = currentXml();
    if (!disp) return null;
    const name = disp.replace(/^test_/, '');
    const ck = 'cgv-bench-cells:' + name;
    try {
      const c = localStorage.getItem(ck);
      if (c) return JSON.parse(c);
    } catch (e) {
      /* ignore */
    }
    try {
      const res = await fetch('./default_xml/' + encodeURIComponent(name));
      if (!res.ok) return null;
      const txt = await res.text();
      const counts = { tile: 0, lar: 0, hec: 0, fcal: 0 };
      const re = /<(TILE|LAr|HEC|FCAL)\b[^>]*count="(\d+)"/g;
      let m;
      while ((m = re.exec(txt))) counts[m[1].toLowerCase()] = +m[2];
      counts.total = counts.tile + counts.lar + counts.hec + counts.fcal;
      try {
        localStorage.setItem(ck, JSON.stringify(counts));
      } catch (e) {
        /* ignore */
      }
      return counts;
    } catch (e) {
      return null;
    }
  }

  // -- Controles de cinema via DOM (ids estáveis nas duas versões) -----------
  const cinemaOn = () => !!$('btn-cinema')?.classList.contains('on');
  const enterCinema = () => {
    if (!cinemaOn()) $('btn-cinema')?.click();
  };
  const exitCinema = () => {
    const x = $('cinema-exit');
    if (x && x.offsetParent !== null) x.click();
    else if (cinemaOn()) $('btn-cinema')?.click();
  };
  // -- Sonda: loop rAF próprio que carimba o timestamp de cada frame ---------
  const probe = {
    on: false,
    ts: [],
    raf: 0,
    start() {
      this.ts = [];
      this.on = true;
      const step = (t) => {
        if (!this.on) return;
        this.ts.push(t);
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
    stop() {
      this.on = false;
      cancelAnimationFrame(this.raf);
      return this.ts.slice();
    },
  };

  // -- Resumo LEVE só para exibição. Os dados BRUTOS é que valem. ------------
  function summarize(ts) {
    if (ts.length < 3) return null;
    const d = [];
    for (let i = 1; i < ts.length; i++) {
      const dt = ts[i] - ts[i - 1];
      if (dt > 0 && dt < 2000) d.push(dt); // descarta gaps (stall)
    }
    if (!d.length) return null;
    const s = d.slice().sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const dur = ts[ts.length - 1] - ts[0];
    return {
      frames: ts.length,
      durationMs: +dur.toFixed(1),
      fpsMean: +(((ts.length - 1) / dur) * 1000).toFixed(1),
      fpsP50: +(1000 / q(0.5)).toFixed(1),
      fps1pctLow: +(1000 / q(0.99)).toFixed(1), // 1% low = 1000 / p99(frame_ms)
      frameMsP50: +q(0.5).toFixed(2),
      frameMsP95: +q(0.95).toFixed(2),
      frameMsP99: +q(0.99).toFixed(2),
    };
  }

  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // -- Estado (persistido p/ sobreviver a reload acidental) ------------------
  const state = { runs: [] };
  try {
    state.runs = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch (e) {
    /* ignore */
  }
  const persist = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.runs));
    } catch (e) {
      /* quota: o download por-run é a fonte da verdade */
    }
  };
  const updateCount = () => {
    const b = $('cgv-bench-dlall');
    if (b) b.textContent = `Baixar tudo (${state.runs.length})`;
  };

  const run = { busy: false, aborted: false, reason: '' };
  const abort = (reason) => {
    run.aborted = true;
    run.reason = reason;
  };
  // Guarda permanente: se a aba ocultar DURANTE um run, aborta (frames pausam).
  const vis = () => {
    if (document.hidden && run.busy) abort('a aba perdeu o foco / ficou oculta');
  };
  document.addEventListener('visibilitychange', vis);

  const readCfg = () => ({
    reps: Math.max(1, Math.min(10, +$('cgv-bench-reps').value || DEFAULTS.reps)),
    warmupS: Math.max(0, +$('cgv-bench-warmup').value || DEFAULTS.warmupS),
    cycleS: Math.max(10, +$('cgv-bench-cycle').value || DEFAULTS.cycleS),
  });

  const setStatus = (msg, color) => {
    const el = $('cgv-bench-status');
    if (el) {
      el.textContent = msg;
      if (color) el.style.color = color;
    }
  };

  const ensureLive = () => {
    if (run.aborted) throw new Error(run.reason);
    if (document.hidden) throw new Error('aba oculta — frames pausados');
  };

  async function countdown(secs, labelFn) {
    for (let s = secs; s > 0; s--) {
      ensureLive();
      setStatus(labelFn(s), '#ffd166');
      await sleep(1000);
    }
  }

  // Mede UM ciclo: espera cycleS, vigiando frames (aborta se pararem).
  async function measureCycle(idx, cfg) {
    const end = performance.now() + cfg.cycleS * 1000;
    let lastLen = probe.ts.length;
    let lastGrow = performance.now();
    while (performance.now() < end) {
      ensureLive();
      await sleep(400);
      const n = probe.ts.length;
      if (n > lastLen) {
        lastLen = n;
        lastGrow = performance.now();
      } else if (performance.now() - lastGrow > 2500) {
        // 2,5 s sem nenhum frame novo = loop parou de verdade (aba sem foco /
        // app pausou). Generoso o bastante p/ não disparar numa cena pesadíssima
        // da versão antiga (mesmo a <1 fps há frame a cada ~1 s).
        throw new Error('frames pararam (app pausou? janela em foco?)');
      }
      const left = ((end - performance.now()) / 1000).toFixed(0);
      const inst = n > 21 ? Math.round(20000 / (probe.ts[n - 1] - probe.ts[n - 21])) : '…';
      setStatus(`ciclo ${idx + 1}/${cfg.reps} · ${left}s · ~${inst} fps · ${n} frames`, '#66ccff');
    }
  }

  function toggleRunUI(busy) {
    $('cgv-bench-run').style.display = busy ? 'none' : 'block';
    $('cgv-bench-stop').style.display = busy ? 'block' : 'none';
    for (const id of ['cgv-bench-reps', 'cgv-bench-warmup', 'cgv-bench-cycle'])
      $(id).disabled = busy;
  }

  // -- Execução: cinema contínuo, N ciclos em sequência, segmentado depois ---
  async function runAll() {
    if (run.busy) return;
    run.busy = true;
    run.aborted = false;
    run.reason = '';
    toggleRunUI(true);
    const cfg = readCfg();
    const label = ($('cgv-bench-label').value || currentXml() || 'run').trim();
    try {
      const cells = await cellCount(); // células do evento (best-effort, cacheado)
      // NÃO resetamos a câmera ('r'): com o slicer ativo, 'r' dispara
      // slicer.resetCamera(), que REVERTE o corte ao padrão (resetState +
      // realinha aos jatos). O tour converge sozinho no aquecimento, então o
      // reset é desnecessário — e assim o seu corte/enquadramento ficam intactos.
      enterCinema();
      if (!(await waitFor(cinemaOn, 3000)))
        throw new Error('não entrei no cinema (#btn-cinema não ficou ON)');

      await countdown(cfg.warmupS, (s) => `aquecendo ${s}s (ignição + follower)`);

      probe.start();
      const bounds = [0];
      for (let i = 0; i < cfg.reps; i++) {
        await measureCycle(i, cfg);
        bounds.push(probe.ts.length);
      }
      const hud = readHud(); // HUD do app em regime (cross-check: fps/draws/tris)
      const all = probe.stop();
      exitCinema();
      await sleep(800);
      if (all.length < 30) throw new Error('frames insuficientes — medição inválida');

      const reps = [];
      for (let i = 0; i < cfg.reps; i++) {
        const seg = all.slice(bounds[i], bounds[i + 1]);
        const base = seg[0] || 0;
        reps.push({
          rep: i + 1,
          frames: seg.map((t) => +(t - base).toFixed(3)), // BRUTO (ms rel. ao 1º frame do ciclo)
          summary: summarize(seg),
        });
      }
      const rec = {
        label,
        mode: $('cgv-bench-mode').value,
        versionHint: versionHint(),
        url: location.href,
        ua: navigator.userAgent,
        gpu: gpuString(),
        dpr: window.devicePixelRatio,
        viewport: [window.innerWidth, window.innerHeight],
        note: $('cgv-bench-note').value || '',
        cells, // {tile,lar,hec,fcal,total} do evento, ou null
        hud, // HUD do app (fps/draws/tris/cpu) — cross-check
        config: cfg,
        ts: new Date().toISOString(),
        reps,
      };
      state.runs.push(rec);
      persist();
      updateCount();
      download(`cgv-bench__${label}__${rec.ts.replace(/[:.]/g, '-')}.json`, rec);
      setStatus(
        `pronto: ${label} · p50/ciclo = ${reps.map((r) => r.summary?.fpsP50).join(', ')} fps · salvo`,
        '#06d6a0',
      );
      console.log('[cgv-bench] salvo:', rec);
    } catch (e) {
      try {
        probe.stop();
      } catch (_) {}
      try {
        exitCinema();
      } catch (_) {}
      setStatus('ABORTADO: ' + e.message + ' — nada salvo', '#ef476f');
      console.warn('[cgv-bench] abortado:', e);
    }
    run.busy = false;
    toggleRunUI(false);
  }

  // -- Painel flutuante -------------------------------------------------------
  const panel = document.createElement('div');
  panel.id = 'cgv-bench-panel';
  panel.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:10px',
    'z-index:2147483647',
    'width:288px',
    'background:rgba(12,14,20,.95)',
    'color:#e8eef5',
    'font:12px/1.4 system-ui,sans-serif',
    'border:1px solid #2a3344',
    'border-radius:10px',
    'padding:10px 12px',
    'box-shadow:0 8px 28px rgba(0,0,0,.55)',
  ].join(';');
  const inp = (id, val, type = 'text') =>
    `<input id="${id}" ${type === 'number' ? 'type="number"' : ''} value="${val}" style="width:100%;box-sizing:border-box;background:#1a212e;color:#fff;border:1px solid #2a3344;border-radius:5px;padding:3px 5px">`;
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <b style="color:#66ccff">CGV FPS bench</b>
      <span id="cgv-bench-close" style="cursor:pointer;opacity:.6;font-size:14px">✕</span>
    </div>
    <label style="display:block;margin:4px 0">label ${inp('cgv-bench-label', currentXml())}</label>
    <label style="display:block;margin:4px 0">modo (só rótulo p/ o JSON)
      <select id="cgv-bench-mode" style="width:100%;background:#1a212e;color:#fff;border:1px solid #2a3344;border-radius:5px;padding:3px">
        <option value="tour">tour</option>
        <option value="tour+slicer">tour+slicer (Shift+S ligado)</option>
      </select>
    </label>
    <label style="display:block;margin:4px 0">nota (máquina/GPU) ${inp('cgv-bench-note', '')}</label>
    <div style="display:flex;gap:6px;margin:6px 0;font-size:11px">
      <label style="flex:1">reps ${inp('cgv-bench-reps', DEFAULTS.reps, 'number')}</label>
      <label style="flex:1">aquece(s) ${inp('cgv-bench-warmup', DEFAULTS.warmupS, 'number')}</label>
      <label style="flex:1.2">ciclo(s) ${inp('cgv-bench-cycle', DEFAULTS.cycleS, 'number')}</label>
    </div>
    <div style="font-size:10px;color:#7c8aa0;margin:-2px 0 6px">ciclo ≥ loop do cinema (atual ~75s · baseline ~60s)</div>
    <button id="cgv-bench-run" style="width:100%;background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:7px;font-weight:600;cursor:pointer">▶ Rodar</button>
    <button id="cgv-bench-stop" style="display:none;width:100%;background:#ef476f;color:#fff;border:0;border-radius:6px;padding:7px;font-weight:600;cursor:pointer">■ Parar</button>
    <div style="display:flex;gap:6px;margin-top:6px">
      <button id="cgv-bench-dlall" style="flex:1;background:#2a3344;color:#fff;border:0;border-radius:6px;padding:5px;cursor:pointer">Baixar tudo (${state.runs.length})</button>
      <button id="cgv-bench-clear" style="background:#2a3344;color:#fff;border:0;border-radius:6px;padding:5px;cursor:pointer">Limpar</button>
    </div>
    <div id="cgv-bench-status" style="margin-top:8px;min-height:16px;color:#8a97a8;font-size:11px">pronto · GPU: ${gpuString().slice(0, 40)}</div>
  `;
  document.body.appendChild(panel);

  $('cgv-bench-run').onclick = runAll;
  $('cgv-bench-stop').onclick = () => abort('parado pelo usuário');
  $('cgv-bench-close').onclick = () => {
    if (run.busy) return setStatus('pare a medição antes de fechar', '#ffd166');
    document.removeEventListener('visibilitychange', vis);
    panel.remove();
  };
  $('cgv-bench-dlall').onclick = () => {
    if (!state.runs.length) return setStatus('nada para baixar', '#ffd166');
    download(`cgv-bench__ALL__${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
      runs: state.runs,
    });
  };
  $('cgv-bench-clear').onclick = () => {
    if (run.busy || !confirm('Limpar os runs guardados nesta sessão? (os JSONs já baixados ficam)'))
      return;
    state.runs = [];
    localStorage.removeItem(LS_KEY);
    updateCount();
    setStatus('limpo', '#aaa');
  };
  if (_wasOrbit)
    setStatus('estava em modo ÓRBITA — dê F5 p/ voltar ao Tour antes de medir', '#ffd166');

  window.__cgvBench = { state, probe, runAll, summarize, _vis: vis };
  console.log('[cgv-bench] pronto. GPU =', gpuString());
})();
