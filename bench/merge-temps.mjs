// ============================================================================
// Casa o log de temperatura da GPU (bench/log-gpu.ps1) com os cenarios de um
// JSON de suite, pelos campos startedMs/endedMs (epoch UTC ms) de cada cenario.
// Para cada cenario, anexa { thermal: { tGpuStart, tGpuEnd, tGpuMin, tGpuMax,
// tGpuMean, clockMean, utilMean, powerMean, samples } } e um thermalSummary no
// topo. NAO altera nenhuma medicao de FPS - so acrescenta contexto termico.
//
// USO:  node bench/merge-temps.mjs <suite.json> <gpu-log.csv> [saida.json]
//   sem [saida] -> grava <suite>__temp.json ao lado do original.
//
// Um mesmo CSV cobre a sessao toda: rode uma vez por JSON de suite, apontando o
// CSV que estava gravando naquele momento.
// ============================================================================
import fs from 'node:fs';

const [, , suitePath, csvPath, outArg] = process.argv;
if (!suitePath || !csvPath) {
  console.error('uso: node bench/merge-temps.mjs <suite.json> <gpu-log.csv> [saida.json]');
  process.exit(1);
}

const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
const lines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
if (/epochMs/i.test(lines[0])) lines.shift(); // cabecalho
const samples = lines
  .map((l) => l.split(',').map((s) => s.trim()))
  .filter((a) => a.length >= 2)
  .map((a) => ({ ms: +a[0], temp: +a[1], clock: +a[2], util: +a[3], power: +a[4] }))
  .filter((s) => Number.isFinite(s.ms) && Number.isFinite(s.temp))
  .sort((a, b) => a.ms - b.ms);

if (!samples.length) {
  console.error(`(CSV sem amostras validas: ${csvPath})`);
  process.exit(1);
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const nearest = (ms) => {
  let best = null, bd = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.ms - ms);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
};

let annotated = 0, noTemp = 0;
for (const sc of suite.scenarios || []) {
  if (sc.error || sc.startedMs == null || sc.endedMs == null) continue;
  const win = samples.filter((s) => s.ms >= sc.startedMs - 500 && s.ms <= sc.endedMs + 500);
  if (!win.length) { noTemp++; continue; }
  const temps = win.map((s) => s.temp);
  sc.thermal = {
    tGpuStart: nearest(sc.startedMs)?.temp ?? null,
    tGpuEnd: nearest(sc.endedMs)?.temp ?? null,
    tGpuMin: Math.min(...temps),
    tGpuMax: Math.max(...temps),
    tGpuMean: +mean(temps).toFixed(1),
    clockMean: +mean(win.map((s) => s.clock)).toFixed(0),
    utilMean: +mean(win.map((s) => s.util)).toFixed(0),
    powerMean: +mean(win.map((s) => s.power)).toFixed(1),
    samples: win.length,
  };
  annotated++;
}

const th = (suite.scenarios || []).filter((s) => s.thermal).map((s) => s.thermal);
suite.thermalSummary = th.length
  ? {
      tGpuMaxOverall: Math.max(...th.map((t) => t.tGpuMax)),
      tGpuMeanOverall: +mean(th.map((t) => t.tGpuMean)).toFixed(1),
      clockMeanOverall: +mean(th.map((t) => t.clockMean)).toFixed(0),
      csv: csvPath,
    }
  : null;

const out = outArg || suitePath.replace(/\.json$/, '__temp.json');
fs.writeFileSync(out, JSON.stringify(suite));
console.log(`OK: ${annotated} cenarios anotados${noTemp ? `, ${noTemp} sem amostra` : ''}.`);
if (suite.thermalSummary) {
  const s = suite.thermalSummary;
  console.log(`   GPU: max ${s.tGpuMaxOverall} C, media ${s.tGpuMeanOverall} C, clock ${s.clockMeanOverall} MHz`);
  console.log(`   -> ${out}`);
} else {
  console.log('   nenhum cenario casou com o log - confira se o logger rodou durante ESTA suite.');
}
