// Analisador estatístico dos JSONs do cgv-bench.
// Uso:  node bench/analyze.mjs [arquivo.json | pasta]   (default: todos os bench/cgv-bench__*.json)
// Lê os timestamps BRUTOS de cada frame e computa FPS médio/mediano, percentis,
// 1%/0.1% low, frame-time, travadas e um perfil FPS×trajetória (bins).
import fs from 'node:fs';
import path from 'node:path';

// Tabela de células por XML (computada 1× sobre os arquivos; é propriedade fixa
// do XML, independente de versão/máquina). O run guarda só o label; aqui juntamos.
let CELLTAB = {};
try {
  CELLTAB = JSON.parse(fs.readFileSync('bench/cell-counts.json', 'utf8'));
} catch (e) {
  /* sem tabela — segue sem a coluna de células */
}
const cellsOf = (rec) => {
  if (rec.cells?.total != null) return rec.cells.total; // tester gravou direto
  const key = (rec.label || '').replace(/^test_/, '');
  return CELLTAB[key]?.total ?? null;
};

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

// Frame-times (ms) a partir dos timestamps relativos.
function frameTimes(frames) {
  const ft = [];
  for (let i = 1; i < frames.length; i++) ft.push(frames[i] - frames[i - 1]);
  return ft;
}

function statsOf(frames) {
  const ft = frameTimes(frames).filter((d) => d > 0 && d < 2000); // descarta gaps (stall de aba)
  if (ft.length < 10) return null;
  const sortedFt = ft.slice().sort((a, b) => a - b);
  const dur = frames[frames.length - 1] - frames[0];
  const fpsInst = ft.map((d) => 1000 / d).sort((a, b) => a - b);
  // 1% low / 0.1% low = 1000 / percentil alto do frame-time (padrão CapFrameX).
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
    low1pct: +(1000 / pct(sortedFt, 0.99)).toFixed(1), // 1% low
    low01pct: +(1000 / pct(sortedFt, 0.999)).toFixed(1), // 0.1% low
    worst1AvgFps: +(1000 / mean(worst1)).toFixed(1),
    ftMeanMs: +mean(ft).toFixed(2),
    ftP50Ms: +pct(sortedFt, 0.5).toFixed(2),
    ftP95Ms: +pct(sortedFt, 0.95).toFixed(2),
    ftP99Ms: +pct(sortedFt, 0.99).toFixed(2),
    ftMaxMs: +sortedFt[sortedFt.length - 1].toFixed(2),
    // travadas: frames > 2× a mediana, e frames abaixo de 30 fps (>33.3 ms).
    stutterPctOver2xMedian: +((100 * ft.filter((d) => d > 2 * pct(sortedFt, 0.5)).length) / ft.length).toFixed(2),
    framesBelow30fps: ft.filter((d) => d > 33.34).length,
    // consistência: coeficiente de variação do frame-time (menor = mais suave).
    ftCV: +(std(ft) / mean(ft)).toFixed(3),
  };
}

// Perfil FPS ao longo da trajetória (bins por tempo) — revela o mergulho do cinema.
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

function pooledFrames(rec) {
  // Agrega as reps concatenando os FRAME-TIMES reais (sem gap artificial entre
  // reps) e reconstruindo uma linha do tempo contínua. Assim min/max/p99 do
  // agregado refletem frames reais, não a fronteira entre reps.
  const ft = [];
  for (const r of rec.reps) {
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

for (const file of listFiles()) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('\n' + '═'.repeat(78));
  console.log(`📄 ${path.basename(file)}`);
  const cells = cellsOf(rec);
  console.log(
    `   label=${rec.label}  modo=${rec.mode}  versão=${rec.versionHint}  dpr=${rec.dpr}  viewport=${rec.viewport?.join('×')}`,
  );
  console.log(`   células do evento (TILE+LAr+HEC+FCAL) = ${cells ?? '? (sem cell-counts.json)'}`);
  console.log(`   gpu=${rec.gpu}`);
  console.log(`   note=${rec.note || '—'}  ts=${rec.ts}`);
  console.log('─'.repeat(78));

  const perRep = rec.reps.map((r) => statsOf(r.frames));
  const cols = [
    ['fpsMean', 'FPS méd'],
    ['fpsMedian', 'FPS med'],
    ['low1pct', '1% low'],
    ['low01pct', '0.1% low'],
    ['fpsMin', 'FPS min'],
    ['fpsMax', 'FPS max'],
    ['ftP99Ms', 'ft p99'],
    ['ftMaxMs', 'ft max'],
    ['stutterPctOver2xMedian', '%stut'],
    ['framesBelow30fps', '<30fps'],
    ['ftCV', 'CV'],
  ];
  const header = ['rep   '].concat(cols.map((c) => c[1].padStart(8))).join(' ');
  console.log(header);
  perRep.forEach((s, i) => {
    if (!s) return console.log(`rep ${i + 1}  (poucos frames)`);
    console.log(
      [`rep ${i + 1} `].concat(cols.map((c) => String(s[c[0]]).padStart(8))).join(' '),
    );
  });

  const pooled = statsOf(pooledFrames(rec));
  console.log('─'.repeat(78));
  console.log('AGREGADO (3 reps):');
  console.log(
    `  FPS  média=${pooled.fpsMean}  mediana=${pooled.fpsMedian}  ±${pooled.fpsStd}  [min ${pooled.fpsMin} … max ${pooled.fpsMax}]`,
  );
  console.log(
    `  Lows  1%low=${pooled.low1pct}  0.1%low=${pooled.low01pct}  (média do pior 1% = ${pooled.worst1AvgFps} fps)`,
  );
  console.log(
    `  Frame-time(ms)  méd=${pooled.ftMeanMs}  p50=${pooled.ftP50Ms}  p95=${pooled.ftP95Ms}  p99=${pooled.ftP99Ms}  max=${pooled.ftMaxMs}`,
  );
  console.log(
    `  Suavidade  CV=${pooled.ftCV}  travadas>2×med=${pooled.stutterPctOver2xMedian}%  frames<30fps=${pooled.framesBelow30fps}`,
  );

  const prof = profile(rec.reps[0].frames);
  console.log(
    `  Perfil rep1 (FPS×trajetória)  ${sparkline(prof)}  [${Math.min(...prof)}–${Math.max(...prof)} fps]`,
  );
}
console.log('');
