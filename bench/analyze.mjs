// Analisador estatístico dos JSONs do cgv-bench (schema cgv-bench/2 = suíte).
// Uso:  node bench/analyze.mjs [arquivo.json | pasta]   (default: bench/cgv-bench__*.json)
//
// Cada JSON de suíte tem { version, scenarios:[{kind,label,cells,reps:[{frames:[ms],
// drawsPerFrame,trisPerFrame}]}] }. Lê os timestamps BRUTOS de cada frame e computa
// FPS médio/mediano, percentis, 1%/0.1% low, frame-time, travadas e um perfil
// FPS×trajetória. Se achar 2 versões (baseline + current), cruza tudo e imprime a
// tabela comparativa (speedup por evento + razão de draws/tris) — o resultado do paper.
import fs from 'node:fs';
import path from 'node:path';

// Tabela de células por XML (fallback, caso um JSON antigo não traga cells).
let CELLTAB = {};
try {
  CELLTAB = JSON.parse(fs.readFileSync(path.join('bench', 'cell-counts.json'), 'utf8'));
} catch (e) {
  /* sem tabela — segue sem a coluna de células */
}

const arg = process.argv[2];
function listFiles() {
  if (arg && fs.existsSync(arg) && fs.statSync(arg).isFile()) return [arg];
  const dir = arg && fs.existsSync(arg) && fs.statSync(arg).isDirectory() ? arg : 'bench';
  return fs
    .readdirSync(dir)
    .filter((f) => /^cgv-bench__.*\.json$/.test(f) && !/__ALL__/.test(f))
    .map((f) => path.join(dir, f));
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const gmean = (a) => (a.length ? Math.exp(mean(a.map((x) => Math.log(x)))) : NaN);

function frameTimes(frames) {
  const ft = [];
  for (let i = 1; i < frames.length; i++) ft.push(frames[i] - frames[i - 1]);
  return ft;
}

function statsOf(frames) {
  const ft = frameTimes(frames).filter((d) => d > 0 && d < 2000); // descarta gaps
  if (ft.length < 10) return null;
  const sortedFt = ft.slice().sort((a, b) => a - b);
  const dur = frames[frames.length - 1] - frames[0];
  const fpsInst = ft.map((d) => 1000 / d).sort((a, b) => a - b);
  const worst1 = sortedFt.slice(Math.floor(sortedFt.length * 0.99));
  return {
    frames: frames.length,
    durationS: +(dur / 1000).toFixed(1),
    fpsMean: +((1000 * (frames.length - 1)) / dur).toFixed(1),
    fpsMedian: +(1000 / pct(sortedFt, 0.5)).toFixed(1),
    fpsStd: +std(fpsInst).toFixed(1),
    fpsMin: +fpsInst[0].toFixed(1),
    fpsP1: +pct(fpsInst, 0.01).toFixed(1),
    fpsP5: +pct(fpsInst, 0.05).toFixed(1),
    fpsP95: +pct(fpsInst, 0.95).toFixed(1),
    fpsMax: +fpsInst[fpsInst.length - 1].toFixed(1),
    low1pct: +(1000 / pct(sortedFt, 0.99)).toFixed(1),
    low01pct: +(1000 / pct(sortedFt, 0.999)).toFixed(1),
    worst1AvgFps: +(1000 / mean(worst1)).toFixed(1),
    ftMeanMs: +mean(ft).toFixed(2),
    ftP50Ms: +pct(sortedFt, 0.5).toFixed(2),
    ftP95Ms: +pct(sortedFt, 0.95).toFixed(2),
    ftP99Ms: +pct(sortedFt, 0.99).toFixed(2),
    ftMaxMs: +sortedFt[sortedFt.length - 1].toFixed(2),
    stutterPctOver2xMedian: +((100 * ft.filter((d) => d > 2 * pct(sortedFt, 0.5)).length) / ft.length).toFixed(2),
    framesBelow30fps: ft.filter((d) => d > 33.34).length,
    ftCV: +(std(ft) / mean(ft)).toFixed(3),
  };
}

function profile(frames, bins = 16) {
  const dur = frames[frames.length - 1] - frames[0];
  const binMs = dur / bins;
  const out = [];
  for (let b = 0; b < bins; b++) {
    const lo = b * binMs,
      hi = (b + 1) * binMs;
    const fr = frames.filter((t) => t >= lo && t < hi);
    if (fr.length > 2) {
      const ft = frameTimes(fr).filter((d) => d > 0 && d < 2000);
      out.push(ft.length ? Math.round(1000 / mean(ft)) : 0);
    } else out.push(0);
  }
  return out;
}

// Concatena os FRAME-TIMES reais das reps (sem gap artificial entre reps).
function pooledFrames(reps) {
  const ft = [];
  for (const r of reps) {
    for (let i = 1; i < r.frames.length; i++) {
      const d = r.frames[i] - r.frames[i - 1];
      if (d > 0 && d < 2000) ft.push(d);
    }
  }
  const ts = [0];
  for (const d of ft) ts.push(ts[ts.length - 1] + d);
  return ts;
}

const sparkline = (vals) => {
  const ch = '▁▂▃▄▅▆▇█';
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  return vals.map((v) => ch[Math.min(7, Math.round(((v - lo) / (hi - lo || 1)) * 7))]).join('');
};

// Média (best-effort) de draws/tris por frame entre as reps.
const avgOf = (reps, key) => {
  const v = reps.map((r) => r[key]).filter((x) => x != null && isFinite(x));
  return v.length ? +(mean(v)).toFixed(v[0] >= 1000 ? 0 : 1) : null;
};

// Normaliza qualquer JSON (suíte v2 ou legado) para { version, meta, scenarios:[...] }.
function normalize(rec) {
  if (Array.isArray(rec.scenarios)) {
    return { version: rec.version || 'desconhecida', meta: rec, scenarios: rec.scenarios };
  }
  // legado (cgv-bench/1): um XML por arquivo.
  if (Array.isArray(rec.reps)) {
    return {
      version: rec.versionHint || rec.version || 'legado',
      meta: rec,
      scenarios: [{ kind: rec.mode || 'tour', label: rec.label, cells: rec.cells, reps: rec.reps }],
    };
  }
  return { version: rec.version || '?', meta: rec, scenarios: [] };
}

const cellsOf = (sc) => {
  if (sc.cells?.total != null) return sc.cells.total;
  const key = (sc.label || '').replace(/^test_/, '');
  return CELLTAB[key]?.total ?? null;
};
const scenKey = (sc) => `${sc.kind}::${sc.label}`;

// ── Detalhe por arquivo/versão ──────────────────────────────────────────────
const loaded = [];
for (const file of listFiles()) {
  let rec;
  try {
    rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`(pulei ${path.basename(file)}: ${e.message})`);
    continue;
  }
  const norm = normalize(rec);
  loaded.push({ file, ...norm });

  console.log('\n' + '═'.repeat(80));
  console.log(`📄 ${path.basename(file)}   —   versão=${norm.version}`);
  const m = norm.meta;
  console.log(`   gpu=${m.gpu || '?'}   dpr=${m.dpr ?? '?'}   viewport=${m.viewport?.join('×') || '?'}`);
  if (m.geometry) console.log(`   geometria: ${m.geometry.fromCache ? 'cache' : (m.geometry.loadMs + ' ms')}${m.geometry.bytes ? ' · ' + (m.geometry.bytes / 1e6).toFixed(1) + ' MB' : ''}`);
  console.log(`   note=${m.note || '—'}   ts=${m.ts || '?'}${m.aborted ? '   [ABORTADO: ' + m.aborted + ']' : ''}`);

  for (const sc of norm.scenarios) {
    console.log('─'.repeat(80));
    if (sc.error) {
      console.log(`⛔ ${sc.kind}  ${sc.label}  — FALHOU: ${sc.error}`);
      continue;
    }
    const cells = cellsOf(sc);
    const dpf = avgOf(sc.reps, 'drawsPerFrame');
    const tpf = avgOf(sc.reps, 'trisPerFrame');
    console.log(
      `▶ ${sc.kind}  ${sc.label}` +
        `${sc.slicer ? `  (slicer ∠${sc.slicer.wedgeDeg}°, show-all)` : ''}`,
    );
    console.log(
      `   células(evento)=${cells ?? '?'}   draws/frame=${dpf ?? '?'}   tris/frame=${tpf ?? '?'}` +
        `${sc.parseMs != null ? '   parse=' + sc.parseMs + ' ms' : ''}`,
    );
    const pooled = statsOf(pooledFrames(sc.reps));
    if (!pooled) {
      console.log('   (frames insuficientes)');
      continue;
    }
    console.log(
      `   FPS  média=${pooled.fpsMean}  mediana=${pooled.fpsMedian}  ±${pooled.fpsStd}  [min ${pooled.fpsMin} … max ${pooled.fpsMax}]`,
    );
    console.log(
      `   Lows 1%low=${pooled.low1pct}  0.1%low=${pooled.low01pct}   Frame-time(ms) p50=${pooled.ftP50Ms} p95=${pooled.ftP95Ms} p99=${pooled.ftP99Ms} max=${pooled.ftMaxMs}`,
    );
    console.log(
      `   Suavidade CV=${pooled.ftCV}  travadas>2×med=${pooled.stutterPctOver2xMedian}%  <30fps=${pooled.framesBelow30fps}`,
    );
    if (sc.reps[0]) {
      const prof = profile(sc.reps[0].frames);
      console.log(`   Perfil rep1 (FPS×trajetória) ${sparkline(prof)} [${Math.min(...prof)}–${Math.max(...prof)} fps]`);
    }
  }
}

// ── Comparação baseline × current ───────────────────────────────────────────
const byVersion = {};
for (const l of loaded) {
  const v = /base/i.test(l.version) ? 'baseline' : /cur/i.test(l.version) ? 'current' : l.version;
  // fica com o arquivo mais recente por versão
  if (!byVersion[v] || (l.meta.ts || '') > (byVersion[v].meta.ts || '')) byVersion[v] = l;
}

const base = byVersion.baseline;
const cur = byVersion.current;
if (base && cur) {
  console.log('\n' + '═'.repeat(80));
  console.log('COMPARAÇÃO  current × baseline  (speedup = current / baseline)');
  console.log('═'.repeat(80));

  const bMap = new Map(base.scenarios.filter((s) => !s.error).map((s) => [scenKey(s), s]));
  const cMap = new Map(cur.scenarios.filter((s) => !s.error).map((s) => [scenKey(s), s]));
  const keys = [...bMap.keys()].filter((k) => cMap.has(k));

  const kfmt = (n) =>
    n == null || !isFinite(n)
      ? '?'
      : n >= 1e6
        ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
        : n >= 1e3
          ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k'
          : String(n);
  const row = (c) =>
    c[0].padEnd(30).slice(0, 30) +
    '  ' + c[1].padStart(7) +
    '  ' + c[2].padStart(15) +
    '  ' + c[3].padStart(6) +
    '  ' + c[4].padStart(15) +
    '  ' + c[5].padStart(15) +
    '  ' + c[6].padStart(13) +
    '  ' + c[7].padStart(13);
  console.log(row(['cenário / evento', 'cél', 'FPSmed b→c', 'x', '1%low b→c', 'ftp50 b→c', 'draws b→c', 'tris b→c']));
  console.log('─'.repeat(112));

  const speedups = [];
  for (const k of keys) {
    const bs = statsOf(pooledFrames(bMap.get(k).reps));
    const cs = statsOf(pooledFrames(cMap.get(k).reps));
    if (!bs || !cs) continue;
    const spd = cs.fpsMedian / bs.fpsMedian;
    speedups.push(spd);
    const cells = cellsOf(bMap.get(k)) ?? '?';
    const bd = avgOf(bMap.get(k).reps, 'drawsPerFrame');
    const cd = avgOf(cMap.get(k).reps, 'drawsPerFrame');
    const bt = avgOf(bMap.get(k).reps, 'trisPerFrame');
    const ct = avgOf(cMap.get(k).reps, 'trisPerFrame');
    const lbl = k.replace('::', ' ').replace(/\.xml$/, '');
    console.log(
      row([
        lbl,
        String(cells),
        `${bs.fpsMedian}→${cs.fpsMedian}`,
        `${spd.toFixed(2)}×`,
        `${bs.low1pct}→${cs.low1pct}`,
        `${bs.ftP50Ms}→${cs.ftP50Ms}`,
        `${kfmt(bd)}→${kfmt(cd)}`,
        `${kfmt(bt)}→${kfmt(ct)}`,
      ]),
    );
  }
  console.log('─'.repeat(112));
  if (speedups.length) {
    console.log(
      `  Speedup FPS mediana:  min ${Math.min(...speedups).toFixed(2)}×   ` +
        `média-geométrica ${gmean(speedups).toFixed(2)}×   max ${Math.max(...speedups).toFixed(2)}×   (${speedups.length} cenários)`,
    );
  }
  console.log(`  baseline: ${path.basename(base.file)}   (gpu=${base.meta.gpu})`);
  console.log(`  current:  ${path.basename(cur.file)}   (gpu=${cur.meta.gpu})`);
  if (base.meta.gpu && cur.meta.gpu && base.meta.gpu !== cur.meta.gpu)
    console.log('  ⚠ GPUs DIFERENTES entre as versões — comparação contaminada!');
} else {
  console.log('\n(Para a tabela comparativa, rode a suíte nas 2 versões — 1 JSON baseline + 1 current — na mesma pasta.)');
}
console.log('');
