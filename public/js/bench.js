/* eslint-disable */
// ============================================================================
// CGV-Web — Runner EXTERNO da suíte de FPS (stress test do Cinema mode)
// ----------------------------------------------------------------------------
// Carregado automaticamente pelo index.html quando a URL tem ?bench=1. NÃO faz
// parte do app: mede a cadência REAL de frames com um loop requestAnimationFrame
// PRÓPRIO, de forma IDÊNTICA em qualquer versão (baseline ou current).
//
// JUSTIÇA (inegociável):
//   • A régua de desempenho é ESTE probe rAF externo — mesmo método nas duas
//     branches, sem tocar no código medido. O loop de cinema roda o código
//     original de cada versão.
//   • draws/tris vêm dos contadores NATIVOS do three.js (renderer.info), lidos
//     sob demanda via window.__cgvApp.counters() — custo por-frame ZERO.
//   • NENHUM cronômetro é injetado no loop de render de nenhuma versão.
//
// FLUXO (1 clique, deixa rodando):
//   Para CADA XML da lista: carrega → entra no cinema → aquece → mede N ciclos
//   contínuos → sai. No ÚLTIMO XML, liga o slicer (geometria pesada) e mede de
//   novo. Junta TUDO num único JSON e baixa. Você troca de branch (F5) e repete.
//
// SEGURANÇA: se a aba perde o foco ou os frames param, o cenário atual é
// abortado (medição inválida); a suíte segue e salva o que completou.
// ============================================================================
(() => {
  'use strict';

  const SCHEMA = 'cgv-bench/2';
  const DEFAULTS = { reps: 3, warmupS: 8, cycleS: 78, slicerDeg: 180 };
  const LS_KEY = 'cgv-bench-suite';

  // Limpeza de instância anterior (recarga segura).
  document.getElementById('cgv-bench-panel')?.remove();
  if (window.__cgvBench?.probe?.raf) cancelAnimationFrame(window.__cgvBench.probe.raf);
  if (window.__cgvBench?._vis) document.removeEventListener('visibilitychange', window.__cgvBench._vis);

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // O teste usa SÓ o modo Tour. Se algum experimento deixou o app em órbita
  // (cgv-tour-mode=0), corrige para o próximo reload.
  let _wasOrbit = false;
  try {
    if (localStorage.getItem('cgv-tour-mode') === '0') {
      localStorage.setItem('cgv-tour-mode', '1');
      _wasOrbit = true;
    }
  } catch (e) {
    /* ignore */
  }

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

  // -- Resumo LEVE só para exibição/ordenação. Os dados BRUTOS é que valem. ---
  function summarize(ts) {
    if (ts.length < 3) return null;
    const d = [];
    for (let i = 1; i < ts.length; i++) {
      const dt = ts[i] - ts[i - 1];
      if (dt > 0 && dt < 2000) d.push(dt);
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
      fps1pctLow: +(1000 / q(0.99)).toFixed(1),
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

  // -- Estado / run ----------------------------------------------------------
  const run = { busy: false, aborted: false, reason: '' };
  const abort = (reason) => {
    run.aborted = true;
    run.reason = reason;
  };
  // Se a aba ocultar DURANTE um run, aborta (o render loop do app pausa).
  const vis = () => {
    if (document.hidden && run.busy) abort('a aba perdeu o foco / ficou oculta');
  };
  document.addEventListener('visibilitychange', vis);

  const ensureLive = () => {
    if (run.aborted) throw new Error(run.reason);
    if (document.hidden) throw new Error('aba oculta — frames pausados');
  };

  const readCfg = () => ({
    reps: Math.max(1, Math.min(10, +$('cgv-bench-reps').value || DEFAULTS.reps)),
    warmupS: Math.max(0, +$('cgv-bench-warmup').value || DEFAULTS.warmupS),
    cycleS: Math.max(10, +$('cgv-bench-cycle').value || DEFAULTS.cycleS),
    slicerDeg: Math.max(0, Math.min(360, +$('cgv-bench-slicer').value || DEFAULTS.slicerDeg)),
  });

  const setStatus = (msg, color) => {
    const el = $('cgv-bench-status');
    if (el) {
      el.textContent = msg;
      if (color) el.style.color = color;
    }
  };
  const setPhase = (msg, color) => {
    const el = $('cgv-bench-phase');
    if (el) {
      el.textContent = msg;
      if (color) el.style.color = color;
    }
  };

  async function countdown(secs, labelFn) {
    for (let s = secs; s > 0; s--) {
      ensureLive();
      setStatus(labelFn(s), '#ffd166');
      await sleep(1000);
    }
  }

  // Mede UM ciclo: espera cycleS, vigiando frames (aborta se pararem).
  async function measureCycle(idx, cfg, tag) {
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
        throw new Error('frames pararam (app pausou? janela em foco?)');
      }
      const left = ((end - performance.now()) / 1000).toFixed(0);
      const inst = n > 21 ? Math.round(20000 / (probe.ts[n - 1] - probe.ts[n - 21])) : '…';
      setStatus(`${tag} · ciclo ${idx + 1}/${cfg.reps} · ${left}s · ~${inst} fps · ${n} frames`, '#66ccff');
    }
  }

  // draws/tris por frame a partir de dois snapshots de contadores nativos.
  // accumulates=true (autoReset false): contador soma a cada render -> usa
  // delta/frames. accumulates=false (autoReset true): valor é por-frame -> usa
  // o snapshot final como amostra representativa.
  function perFrameCounters(c0, c1, framesInRep) {
    if (!c0 || !c1) return { drawsPerFrame: null, trisPerFrame: null };
    if (c1.accumulates) {
      const df = Math.max(1, framesInRep - 1);
      return {
        drawsPerFrame: +((c1.calls - c0.calls) / df).toFixed(1),
        trisPerFrame: +((c1.triangles - c0.triangles) / df).toFixed(0),
      };
    }
    return { drawsPerFrame: c1.calls, trisPerFrame: c1.triangles };
  }

  // -- Mede um cenário: cinema contínuo, N ciclos, contadores nas fronteiras --
  // Retorna { reps:[...], counters:{accumulates,dpr} }. Lança em caso de aborto.
  async function measureScenario(app, cfg, tag) {
    app.cinema.enter();
    // espera o botão de cinema ficar 'on'
    for (let i = 0; i < 30 && !app.cinema.isOn(); i++) await sleep(100);
    if (!app.cinema.isOn()) throw new Error('não entrei no cinema');

    await countdown(cfg.warmupS, (s) => `${tag} · aquecendo ${s}s (ignição + follower)`);

    probe.start();
    const bounds = [0];
    const snaps = [app.counters()]; // contador no início do 1º ciclo
    for (let i = 0; i < cfg.reps; i++) {
      await measureCycle(i, cfg, tag);
      bounds.push(probe.ts.length);
      snaps.push(app.counters());
    }
    const all = probe.stop();
    app.cinema.exit();
    await sleep(800);
    if (all.length < 30) throw new Error('frames insuficientes — cenário inválido');

    const reps = [];
    for (let i = 0; i < cfg.reps; i++) {
      const seg = all.slice(bounds[i], bounds[i + 1]);
      const base = seg[0] || 0;
      const pf = perFrameCounters(snaps[i], snaps[i + 1], seg.length);
      reps.push({
        rep: i + 1,
        frames: seg.map((t) => +(t - base).toFixed(3)), // BRUTO, ms rel. 1º frame
        drawsPerFrame: pf.drawsPerFrame,
        trisPerFrame: pf.trisPerFrame,
        counters: { start: snaps[i], end: snaps[i + 1] },
        summary: summarize(seg),
      });
    }
    const meta = snaps[snaps.length - 1] || snaps[0] || {};
    return { reps, counters: { accumulates: !!meta.accumulates, dpr: meta.dpr } };
  }

  // -- Execução da SUÍTE inteira ---------------------------------------------
  async function runSuite() {
    const app = window.__cgvApp;
    if (!app) return setStatus('window.__cgvApp ausente — recarregue com ?bench=1', '#ef476f');
    if (run.busy) return;
    run.busy = true;
    run.aborted = false;
    run.reason = '';
    toggleRunUI(true);
    const cfg = readCfg();
    const scenarios = [];
    let names = [];

    try {
      setPhase('preparando…', '#ffd166');
      await app.whenReady();
      names = await app.samples();
      if (!names.length) throw new Error('lista de amostras vazia (index.json?)');

      // ── Cenário TOUR para cada XML ─────────────────────────────────────────
      for (let k = 0; k < names.length; k++) {
        const name = names[k];
        const tag = `[${k + 1}/${names.length}] ${name}`;
        setPhase(`tour ${k + 1}/${names.length}: ${name}`, '#66ccff');
        try {
          const info = await app.loadSample(name);
          await sleep(400); // deixa a cena assentar antes de medir
          const res = await measureScenario(app, cfg, tag);
          scenarios.push({
            kind: 'tour',
            label: name,
            cells: info.cells,
            parseMs: info.parseMs,
            bytes: info.bytes,
            slicer: null,
            counters: res.counters,
            reps: res.reps,
          });
        } catch (e) {
          if (run.aborted) throw e; // stop/aba oculta = aborta tudo
          scenarios.push({ kind: 'tour', label: name, error: e.message });
          setStatus(`falhou ${name}: ${e.message} — sigo`, '#ffd166');
          try {
            app.cinema.exit();
          } catch (_) {}
          await sleep(500);
        }
      }

      // ── Cenário SLICER no ÚLTIMO XML (geometria pesada) ───────────────────
      if (cfg.slicerDeg > 0 && names.length) {
        const name = names[names.length - 1];
        const tag = `slicer ${name}`;
        setPhase(`slicer: ${name} (∠${cfg.slicerDeg}°, show-all)`, '#f78c6b');
        try {
          const info = await app.loadSample(name);
          app.slicer.set(true, { showAll: true, wedgeDeg: cfg.slicerDeg });
          await sleep(600);
          const res = await measureScenario(app, cfg, tag);
          scenarios.push({
            kind: 'tour+slicer',
            label: name,
            cells: info.cells,
            parseMs: info.parseMs,
            bytes: info.bytes,
            slicer: { wedgeDeg: cfg.slicerDeg, showAll: true },
            counters: res.counters,
            reps: res.reps,
          });
        } catch (e) {
          if (run.aborted) throw e;
          scenarios.push({ kind: 'tour+slicer', label: name, error: e.message });
        } finally {
          try {
            app.slicer.set(false, { showAll: false });
          } catch (_) {}
        }
      }

      const rec = {
        schema: SCHEMA,
        version: app.version,
        apiVersion: app.apiVersion,
        note: $('cgv-bench-note').value || '',
        gpu: gpuString(),
        ua: navigator.userAgent,
        url: location.href,
        dpr: window.devicePixelRatio,
        viewport: [window.innerWidth, window.innerHeight],
        geometry: (() => {
          try {
            return app.geometry();
          } catch (_) {
            return null;
          }
        })(),
        config: cfg,
        ts: new Date().toISOString(),
        scenarios,
      };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(rec));
      } catch (_) {}
      download(`cgv-bench__suite__${rec.version}__${rec.ts.replace(/[:.]/g, '-')}.json`, rec);

      const ok = scenarios.filter((s) => !s.error).length;
      setPhase('concluído', '#06d6a0');
      setStatus(`pronto: ${ok}/${scenarios.length} cenários · ${rec.version} · JSON salvo`, '#06d6a0');
      console.log('[cgv-bench] suíte salva:', rec);
    } catch (e) {
      try {
        probe.stop();
      } catch (_) {}
      try {
        app.cinema.exit();
      } catch (_) {}
      try {
        app.slicer.set(false, { showAll: false });
      } catch (_) {}
      // Salva o parcial se já houver cenários medidos (não perde 20 min de run).
      if (scenarios.some((s) => !s.error)) {
        const rec = {
          schema: SCHEMA,
          version: app.version,
          apiVersion: app.apiVersion,
          note: ($('cgv-bench-note').value || '') + ' [PARCIAL/abortado: ' + e.message + ']',
          gpu: gpuString(),
          ua: navigator.userAgent,
          url: location.href,
          dpr: window.devicePixelRatio,
          viewport: [window.innerWidth, window.innerHeight],
          config: cfg,
          ts: new Date().toISOString(),
          aborted: e.message,
          scenarios,
        };
        download(`cgv-bench__suite__${rec.version}__PARCIAL__${rec.ts.replace(/[:.]/g, '-')}.json`, rec);
        setStatus('ABORTADO: ' + e.message + ' — salvo PARCIAL', '#ef476f');
      } else {
        setStatus('ABORTADO: ' + e.message + ' — nada salvo', '#ef476f');
      }
      setPhase('abortado', '#ef476f');
      console.warn('[cgv-bench] abortado:', e);
    }
    run.busy = false;
    toggleRunUI(false);
  }

  function toggleRunUI(busy) {
    $('cgv-bench-run').style.display = busy ? 'none' : 'block';
    $('cgv-bench-stop').style.display = busy ? 'block' : 'none';
    for (const id of ['cgv-bench-reps', 'cgv-bench-warmup', 'cgv-bench-cycle', 'cgv-bench-slicer', 'cgv-bench-note'])
      $(id).disabled = busy;
  }

  // -- Painel flutuante -------------------------------------------------------
  const panel = document.createElement('div');
  panel.id = 'cgv-bench-panel';
  panel.style.cssText = [
    'position:fixed',
    'top:10px',
    'right:10px',
    'z-index:2147483647',
    'width:300px',
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
      <b style="color:#66ccff">CGV FPS bench · suíte</b>
      <span id="cgv-bench-close" style="cursor:pointer;opacity:.6;font-size:14px">✕</span>
    </div>
    <div id="cgv-bench-verline" style="font-size:11px;color:#7c8aa0;margin:-2px 0 6px">detectando versão…</div>
    <label style="display:block;margin:4px 0">nota (máquina/GPU) ${inp('cgv-bench-note', '')}</label>
    <div style="display:flex;gap:6px;margin:6px 0;font-size:11px">
      <label style="flex:1">reps ${inp('cgv-bench-reps', DEFAULTS.reps, 'number')}</label>
      <label style="flex:1">aquece(s) ${inp('cgv-bench-warmup', DEFAULTS.warmupS, 'number')}</label>
      <label style="flex:1.2">ciclo(s) ${inp('cgv-bench-cycle', DEFAULTS.cycleS, 'number')}</label>
    </div>
    <label style="display:block;margin:4px 0;font-size:11px">slicer ∠° no último XML (0=pular) ${inp('cgv-bench-slicer', DEFAULTS.slicerDeg, 'number')}</label>
    <div style="font-size:10px;color:#7c8aa0;margin:-2px 0 6px">ciclo ≥ loop do cinema (~75s). 1 clique roda TODOS os XMLs + slicer.</div>
    <button id="cgv-bench-run" style="width:100%;background:#1f6feb;color:#fff;border:0;border-radius:6px;padding:8px;font-weight:600;cursor:pointer">▶ Rodar suíte completa</button>
    <button id="cgv-bench-stop" style="display:none;width:100%;background:#ef476f;color:#fff;border:0;border-radius:6px;padding:8px;font-weight:600;cursor:pointer">■ Parar</button>
    <div id="cgv-bench-phase" style="margin-top:8px;min-height:15px;color:#8a97a8;font-size:11px;font-weight:600">ocioso</div>
    <div id="cgv-bench-status" style="margin-top:3px;min-height:16px;color:#8a97a8;font-size:11px">aguardando app…</div>
  `;
  document.body.appendChild(panel);

  $('cgv-bench-run').onclick = runSuite;
  $('cgv-bench-stop').onclick = () => abort('parado pelo usuário');
  $('cgv-bench-close').onclick = () => {
    if (run.busy) return setStatus('pare a medição antes de fechar', '#ffd166');
    document.removeEventListener('visibilitychange', vis);
    panel.remove();
  };
  if (_wasOrbit) setStatus('estava em ÓRBITA — dê F5 p/ voltar ao Tour antes de medir', '#ffd166');

  // -- Espera o hook do app (window.__cgvApp) ficar disponível ---------------
  (async () => {
    const t0 = performance.now();
    while (!window.__cgvApp && performance.now() - t0 < 30000) await sleep(150);
    const app = window.__cgvApp;
    const verEl = $('cgv-bench-verline');
    if (!app) {
      if (verEl) verEl.textContent = 'window.__cgvApp não apareceu — abriu com ?bench=1?';
      if (verEl) verEl.style.color = '#ef476f';
      setStatus('hook do app ausente', '#ef476f');
      return;
    }
    if (verEl) verEl.textContent = `versão do app: ${app.version} · api v${app.apiVersion} · GPU: ${gpuString().slice(0, 30)}`;
    if (!_wasOrbit) setStatus('pronto — clique em Rodar', '#8a97a8');
  })();

  window.__cgvBench = { probe, runSuite, summarize, _vis: vis };
  console.log('[cgv-bench] runner pronto (aguardando window.__cgvApp).');
})();
