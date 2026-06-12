// @ts-check
import {
  renderer,
  scene,
  camera,
  controls,
  dirLight,
  markDirty,
  isDirty,
  clearDirty,
} from './renderer.js';
import { getDprCap, onQualityChange } from './quality.js';
import { getPostFxComposer, resizePostFx } from './postfx.js';

// ── FPS counter / perf HUD ───────────────────────────────────────────────────
// Default: the historical FPS readout. With `?perf=1`: draw calls, triangles,
// rendered-frame CPU time p50/p95 and DPR — the acceptance metrics for the
// performance work (docs/PERFORMANCE_PLAN.md).
const _PERF_HUD = new URLSearchParams(location.search).get('perf') === '1';
const fpsEl = document.createElement('div');
Object.assign(fpsEl.style, {
  position: 'fixed',
  bottom: '8px',
  right: '10px',
  zIndex: '9999',
  fontFamily: 'monospace',
  fontSize: '13px',
  color: '#66ccff',
  opacity: _PERF_HUD ? '0.8' : '0.45',
  pointerEvents: 'none',
  userSelect: 'none',
  whiteSpace: 'pre',
  textAlign: 'right',
});
document.body.appendChild(fpsEl);

// Rendered-frame CPU times (ms), ring buffer for p50/p95 in the perf HUD.
const _frameMs = new Float32Array(120);
let _frameMsN = 0;
let _lastCalls = 0;
let _lastTris = 0;

/** @param {number} p */
function _perfPercentile(p) {
  const n = Math.min(_frameMsN, _frameMs.length);
  if (!n) return 0;
  const a = Array.from(_frameMs.slice(0, n)).sort((x, y) => x - y);
  return a[Math.min(n - 1, Math.floor(p * n))];
}

// ── Render loop ───────────────────────────────────────────────────────────────
// Paused while the tab is hidden: browsers already throttle RAF on hidden tabs,
// but stopping the loop entirely frees the main thread for other tabs. Resumed
// on visibilitychange.
let _fpsFrames = 0,
  _fpsLast = performance.now();
let _loopRunning = false;
let _loopRafId = 0;
let _resumeWarmFrames = 0;
let _onFrameStart = () => {};

function _scheduleWarmFrames(count = 12) {
  _resumeWarmFrames = Math.max(_resumeWarmFrames, count | 0);
  markDirty();
}

function _restoreRendererAfterFocus() {
  const pr = Math.min(window.devicePixelRatio || 1, getDprCap());
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resizePostFx();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  dirLight.position.copy(camera.position);
  controls.update();
  // WebGL-only state reset after focus regain — the WebGPU renderer branch of
  // the union exposes neither isWebGLRenderer nor resetState.
  const r = /** @type {any} */ (renderer);
  if (r.isWebGLRenderer) {
    if (typeof r.resetState === 'function') r.resetState();
    if (r.info && typeof r.info.reset === 'function') r.info.reset();
  }
  _scheduleWarmFrames(18);
}

function _loopTick() {
  if (!_loopRunning) {
    _loopRafId = 0;
    return;
  }
  _loopRafId = requestAnimationFrame(_loopTick);
  _fpsFrames++;
  const now = performance.now();
  if (now - _fpsLast >= 500) {
    const fps = ((_fpsFrames / (now - _fpsLast)) * 1000).toFixed(0);
    if (_PERF_HUD) {
      const r = /** @type {any} */ (renderer);
      const tris = _lastTris >= 1e6 ? (_lastTris / 1e6).toFixed(2) + 'M' : String(_lastTris);
      fpsEl.textContent =
        `${fps} FPS · ${_lastCalls} draws · ${tris} tris\n` +
        `cpu ${_perfPercentile(0.5).toFixed(1)} / ${_perfPercentile(0.95).toFixed(1)} ms · ` +
        `dpr ${(r.getPixelRatio ? r.getPixelRatio() : 1).toFixed(2)}`;
    } else {
      fpsEl.textContent = fps + ' FPS';
    }
    _fpsFrames = 0;
    _fpsLast = now;
  }
  _onFrameStart();
  controls.update();
  if (_resumeWarmFrames > 0) {
    _resumeWarmFrames--;
    markDirty();
  }
  if (controls.autoRotate) markDirty();
  if (!isDirty()) return;
  const t0 = _PERF_HUD ? performance.now() : 0;
  // Beauty preset routes through the post-fx composer (bloom + OutputPass);
  // every other preset keeps the direct-to-canvas path bit-for-bit.
  // renderer.info auto-resets on every internal render() call, which would
  // leave only the composer's final fullscreen quad in the counters — switch
  // to manual reset around the composer so draws/tris stay meaningful.
  const composer = getPostFxComposer();
  if (composer) {
    renderer.info.autoReset = false;
    renderer.info.reset();
    composer.render();
  } else {
    renderer.info.autoReset = true;
    renderer.render(scene, camera);
  }
  if (_PERF_HUD) {
    _frameMs[_frameMsN % _frameMs.length] = performance.now() - t0;
    _frameMsN++;
    const info = /** @type {any} */ (renderer).info;
    if (info?.render) {
      _lastCalls = info.render.calls;
      _lastTris = info.render.triangles;
    }
  }
  clearDirty();
}

function _startLoop() {
  if (_loopRunning) return;
  _loopRunning = true;
  _fpsLast = performance.now();
  _fpsFrames = 0;
  markDirty();
  if (!_loopRafId) _loopRafId = requestAnimationFrame(_loopTick);
}

function _stopLoop() {
  _loopRunning = false;
  if (_loopRafId) {
    cancelAnimationFrame(_loopRafId);
    _loopRafId = 0;
  }
}

/** @param {{ onFrameStart?: () => void }} [opts] */
export function initRenderLoop({ onFrameStart } = {}) {
  if (onFrameStart) _onFrameStart = onFrameStart;

  // Quality preset switch: re-apply the DPR cap and warm a few frames so the
  // resize settles. Effect modules (tone mapping, bloom, ...) subscribe on
  // their own; this is just the renderer-level knob.
  onQualityChange(() => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getDprCap()));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    _scheduleWarmFrames(4);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) _stopLoop();
    else {
      _restoreRendererAfterFocus();
      _startLoop();
    }
  });
  window.addEventListener('focus', () => {
    _restoreRendererAfterFocus();
    _startLoop();
  });
  window.addEventListener('pageshow', () => {
    _restoreRendererAfterFocus();
    _startLoop();
  });
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    resizePostFx();
    markDirty();
  });

  _startLoop();
}
