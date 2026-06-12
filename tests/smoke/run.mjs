// CGV Web — end-to-end smoke suite.
//
// Drives the REAL app (real GLB, real WASM parser, real sample events) in a
// headless system browser and asserts the vital flows work after any change:
// boot, OPFS-cached reload, event load, cell hover/pin picking, thresholds,
// the slicer lifecycle (GPU wedge), ghost/minimap/cinema toggles, screenshot
// export and resize. It also enforces the performance contract that the
// 2026-06 overhaul established: draw-call budgets per scene state.
//
// Usage:
//   npm run smoke            (starts its own server on :8123)
//   node tests/smoke/run.mjs [port]
//
// Requirements: Microsoft Edge or Google Chrome installed (playwright-core
// drives the system browser — no browser download). WebGL runs on
// SwiftShader (CPU) in headless mode, so FPS is not asserted — correctness,
// console errors and draw-call counts are.
//
// Output: per-step PASS/FAIL summary + screenshots in .smoke/ (gitignored).
// Exit code 0 = all green.

/* global document, localStorage, getComputedStyle -- page.evaluate callbacks run in the browser */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2]) || 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = '.smoke';
fs.mkdirSync(OUT, { recursive: true });

// Console errors that are pre-existing / environmental, not regressions.
const ERROR_ALLOWLIST = [/analytics\.js/, /favicon/i];

// Draw-call budgets (generous ceilings — today's numbers are far below).
const BUDGET = {
  boot: 60, // measured ~10 (3 cell megas + ghosts + lights overhead)
  event: 450, // measured ~130–160 (tracks/clusters are per-line for picking)
  slicerShowAll: 700, // measured ~134 (chamber mega = 1 draw)
};

// ── infra ─────────────────────────────────────────────────────────────────────
/** @type {{name:string, ok:boolean, ms:number, note:string}[]} */
const results = [];
const errors = [];
let page = null;

function newErrors() {
  const fresh = errors.filter((e) => !ERROR_ALLOWLIST.some((re) => re.test(e)));
  errors.length = 0;
  return fresh;
}

async function step(name, fn) {
  const t0 = Date.now();
  let ok = true;
  let note = '';
  try {
    note = (await fn()) || '';
    const errs = newErrors();
    if (errs.length) {
      ok = false;
      note = `console errors: ${errs.slice(0, 3).join(' | ').slice(0, 300)}`;
    }
  } catch (e) {
    ok = false;
    note = String(e && e.message ? e.message : e).slice(0, 300);
  }
  results.push({ name, ok, ms: Date.now() - t0, note });
  try {
    await page?.screenshot({
      path: path.join(OUT, `${String(results.length).padStart(2, '0')}-${name}.png`),
    });
  } catch (_) {
    /* best-effort */
  }
  console.log(`${ok ? '  ✓' : '  ✗'} ${name} (${Date.now() - t0} ms)${note ? ' — ' + note : ''}`);
}

const hud = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('body > div')].find((d) =>
      /draws/.test(d.textContent || ''),
    );
    return el ? (el.textContent || '').replace(/\n/g, ' | ') : null;
  });

const drawCalls = async () => {
  const t = await hud();
  const m = t && t.match(/(\d+)\s+draws/);
  if (!m) throw new Error('perf HUD not found (need ?perf=1)');
  return Number(m[1]);
};

const waitOverlayGone = () =>
  page.waitForFunction(
    () => {
      const o = document.getElementById('loading-overlay');
      return (
        !o ||
        !o.isConnected ||
        o.classList.contains('hide') ||
        getComputedStyle(o).display === 'none'
      );
    },
    { timeout: 240_000 },
  );

// Waits one HUD refresh so draw-call numbers reflect the current scene state.
const settle = async (ms = 1200) => {
  await page.mouse.move(60, 860); // nudge a frame without hovering the scene
  await page.waitForTimeout(ms);
};

// ── server ────────────────────────────────────────────────────────────────────
console.log(`[smoke] starting serve.py on :${PORT}…`);
const server = spawn('python', ['serve.py', String(PORT)], { stdio: 'ignore' });
const killServer = () => {
  try {
    server.kill();
  } catch (_) {
    /* best-effort */
  }
};
process.on('exit', killServer);
for (let i = 0; ; i++) {
  try {
    const r = await fetch(`${BASE}/index.html`);
    if (r.ok) break;
  } catch (_) {
    /* best-effort */
  }
  if (i > 50) throw new Error('server did not come up');
  await new Promise((r) => setTimeout(r, 200));
}

// ── browser ───────────────────────────────────────────────────────────────────
async function launch() {
  const args = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true, args });
    } catch (_) {
      /* best-effort */
    }
  }
  throw new Error('no system browser (Edge/Chrome) found');
}
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  acceptDownloads: true,
});
// CGV_QUALITY=low|standard|beauty pins the quality preset for the whole run
// (default: whatever the app defaults to — standard). Lets the same suite
// validate the Beauty path (post-fx composer, cell shading, fat-line scale).
const QUALITY = ['low', 'standard', 'beauty'].includes(process.env.CGV_QUALITY)
  ? process.env.CGV_QUALITY
  : null;
await ctx.addInitScript(
  ([quality]) => {
    try {
      localStorage.setItem('cgv-tab', 'sample');
      localStorage.setItem('cgv-minimap', '0');
      if (quality) localStorage.setItem('cgv-quality', quality);
    } catch (_) {
      /* best-effort */
    }
  },
  [QUALITY],
);
if (QUALITY) console.log(`[smoke] quality preset pinned: ${QUALITY}`);
page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  // Append the source URL — Chromium's "Failed to load resource" text alone
  // doesn't say WHAT failed, and the allowlist matches on the URL.
  if (m.type() === 'error') errors.push(`${m.text()} [${m.location()?.url || ''}]`);
});

// ── steps ─────────────────────────────────────────────────────────────────────

await step('boot', async () => {
  await page.goto(`${BASE}/?perf=1`, { waitUntil: 'domcontentloaded' });
  await waitOverlayGone();
  await settle(1500);
  const d = await drawCalls();
  if (d > BUDGET.boot) throw new Error(`boot draws ${d} > budget ${BUDGET.boot}`);
  return `${d} draws`;
});

await step('opfs-cached-reload', async () => {
  // Second load should hit the OPFS geometry cache and still boot clean.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitOverlayGone();
  await settle(1200);
  return await hud();
});

await step('event-load', async () => {
  await page.waitForSelector('.sample-item', { timeout: 60_000 });
  await page.click('.sample-item');
  await page.waitForFunction(
    () => /loaded|ready/i.test(document.getElementById('status-txt')?.textContent || ''),
    { timeout: 240_000 },
  );
  await settle(2500);
  const d = await drawCalls();
  if (d > BUDGET.event) throw new Error(`event draws ${d} > budget ${BUDGET.event}`);
  // Collision HUD (top-left run/event info) — informative, not fatal: the
  // overlay is a user setting and may be off.
  const hudOk = await page.evaluate(() => {
    const el = document.getElementById('collision-hud');
    return !!el && /run|event/i.test(el.textContent || '');
  });
  return `${d} draws${hudOk ? ', collision HUD ok' : ' (collision HUD off/empty)'}`;
});

let pinPoint = null;
await step('cell-hover-tooltip', async () => {
  // Probe a grid until the cell tooltip appears (picking goes through
  // megaCells.pickCell — the merged-mesh raycast replacement).
  for (let y = 280; y <= 640 && !pinPoint; y += 60) {
    for (let x = 480; x <= 1380 && !pinPoint; x += 75) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(90); // hover raycast is throttled to 50 ms
      const open = await page.evaluate(() => {
        const tip = document.getElementById('tip');
        return tip && !tip.hidden && !!document.getElementById('tip-cell')?.textContent;
      });
      if (open) pinPoint = { x, y };
    }
  }
  if (!pinPoint) throw new Error('no cell tooltip found on probe grid');
  const label = await page.evaluate(() => document.getElementById('tip-cell')?.textContent);
  return `tooltip "${label}" @ ${pinPoint.x},${pinPoint.y}`;
});

await step('pin-and-clear', async () => {
  if (!pinPoint) throw new Error('skipped: no hover point');
  await page.mouse.click(pinPoint.x, pinPoint.y);
  await page.waitForTimeout(400);
  const pins = await page.evaluate(() => document.querySelectorAll('.tip-pinned').length);
  if (pins < 1) throw new Error('click did not pin a tooltip card');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => document.querySelectorAll('.tip-pinned').length);
  if (after !== 0) throw new Error(`Escape left ${after} pins`);
  return 'pin + Escape ok';
});

await step('threshold-box', async () => {
  // Type a threshold value into the first numeric panel box (drives
  // applyThreshold → visibility texture writes). Best-effort: panel layout
  // may hide boxes on small viewports.
  const box = page.locator('#rpanel input[type="text"], #rpanel input:not([type])').first();
  if ((await box.count()) === 0) return 'no threshold box found (skipped)';
  const before = await drawCalls();
  await box.fill('999999');
  await box.press('Enter');
  await settle(1000);
  await box.fill('0');
  await box.press('Enter');
  await settle(1000);
  return `ok (draws ${before} → ${await drawCalls()})`;
});

await step('slicer-on-showall', async () => {
  await page.keyboard.press('Shift+S');
  await page.waitForTimeout(4500); // show-all sweep + merged outline build
  const d = await drawCalls();
  if (d > BUDGET.slicerShowAll)
    throw new Error(`slicer draws ${d} > budget ${BUDGET.slicerShowAll}`);
  return `${d} draws (chamber mega + cell megas)`;
});

await step('slicer-drag', async () => {
  // Grab the gizmo handle (framed near canvas centre) and sweep θ/height —
  // this exercises the uniform-only drag path; the heavy refresh fires once
  // on pointerup.
  const cx = 910;
  const cy = 450;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(cx + i * 3, cy - i * 5);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(2000);
  return await hud();
});

await step('slicer-off-restore', async () => {
  await page.keyboard.press('Shift+S');
  await page.waitForTimeout(1800);
  const d = await drawCalls();
  if (d > BUDGET.event) throw new Error(`post-slicer draws ${d} > budget ${BUDGET.event}`);
  return `${d} draws`;
});

await step('ghost-toggle', async () => {
  await page.keyboard.press('g');
  await page.waitForTimeout(500);
  await page.keyboard.press('g');
  await page.waitForTimeout(500);
  return 'G off/on ok';
});

await step('minimap-toggle', async () => {
  const btn = page.locator('#btn-minimap');
  if ((await btn.count()) === 0) return 'no minimap button (skipped)';
  await btn.click();
  await page.waitForTimeout(800);
  await btn.click();
  await page.waitForTimeout(500);
  return 'minimap on/off ok';
});

await step('cinema-cycle', async () => {
  await page.keyboard.press('c');
  await page.waitForTimeout(3000); // camera tour animating
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  return 'cinema in/out ok';
});

await step('screenshot-export', async () => {
  // The export path renders into an offscreen MSAA RenderTarget (the canvas
  // itself is preserveDrawingBuffer:false) — this asserts that pipeline.
  await page.click('#btn-shot');
  await page.waitForSelector('.shot-res[data-w="1280"]', { timeout: 10_000 });
  await page.click('.shot-res[data-w="1280"]');
  const dl = page.waitForEvent('download', { timeout: 120_000 });
  await page.click('#btn-shot-save');
  const download = await dl;
  const file = path.join(OUT, 'export-1280.png');
  await download.saveAs(file);
  const size = fs.statSync(file).size;
  if (size < 10_000) throw new Error(`export suspiciously small (${size} bytes)`);
  await page.click('#btn-shot-cancel').catch(() => {});
  return `${(size / 1024).toFixed(0)} KiB`;
});

await step('resize', async () => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(800);
  return await hud();
});

// ── summary ───────────────────────────────────────────────────────────────────
await browser.close();
killServer();
const failed = results.filter((r) => !r.ok);
console.log('\n──────── smoke summary ────────');
for (const r of results)
  console.log(
    `${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(22)} ${String(r.ms).padStart(6)} ms  ${r.ok ? r.note : '← ' + r.note}`,
  );
console.log(`──────── ${results.length - failed.length}/${results.length} passed ────────`);
process.exit(failed.length ? 1 : 0);
