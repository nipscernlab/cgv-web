// @ts-check
// Quality presets (docs/VISUAL_PLAN.md, item A8) — the umbrella under which
// every visual-quality feature hangs. Three presets:
//
//   low      — P1 desk PCs struggling on iGPU: DPR capped at 1, every
//              optional effect off.
//   standard — today's visuals, pixel-comparable to pre-A8 builds. This is
//              the default and what the shifters at P1 see.
//   beauty   — presentation mode: full DPR plus the optional effects
//              (tone mapping, bloom, AO, ...) as they land. Each effect
//              module reads its own flag from the active preset, so adding
//              an effect means adding a field here and subscribing there.
//
// The choice persists per browser in localStorage (like every other CGV
// preference) and is also settable via `?quality=low|standard|beauty` for
// debugging and for the smoke-test harness.
//
// This module is dependency-free (no three.js import) so renderer.js can
// import it before the renderer exists without cycles.

const STORAGE_KEY = 'cgv-quality';

/**
 * @typedef {'low' | 'standard' | 'beauty'} QualityName
 * @typedef {{
 *   dprCap: number,
 *   lineWidthScale: number,
 *   cellShading: boolean,
 *   atmosphere: boolean,
 *   toneMapping: boolean,
 *   bloom: boolean,
 *   ao: boolean,
 * }} QualityPreset
 */

/** @type {Record<QualityName, QualityPreset>} */
export const QUALITY_PRESETS = {
  // lineWidthScale multiplies the base pixel width of every fat line
  // (fatLines.js): low ≈ the historical 1 px look, standard = the width each
  // call site declares, beauty slightly heavier for presentation.
  // cellShading: Fresnel rim + headlight specular on the mega-cell shader
  // (megaCells.js) — volume perception without paying for PBR.
  // atmosphere: exponential fog + radial-gradient backdrop (sceneBackdrop.js)
  // — depth cueing for a 50 m detector.
  low: {
    dprCap: 1.0,
    lineWidthScale: 0.5,
    cellShading: false,
    atmosphere: false,
    toneMapping: false,
    bloom: false,
    ao: false,
  },
  standard: {
    dprCap: 2.0,
    lineWidthScale: 1.0,
    cellShading: false,
    atmosphere: false,
    toneMapping: false,
    bloom: false,
    ao: false,
  },
  beauty: {
    dprCap: 2.0,
    lineWidthScale: 1.25,
    cellShading: true,
    atmosphere: true,
    toneMapping: true,
    bloom: true,
    ao: false,
  },
};

/** @type {QualityName} */
const DEFAULT_QUALITY = 'standard';

/** @param {string | null} v @returns {v is QualityName} */
function _isQualityName(v) {
  return v === 'low' || v === 'standard' || v === 'beauty';
}

/** @returns {QualityName} */
function _restore() {
  // URL override wins (debug / smoke tests), then localStorage, then default.
  const fromUrl = new URLSearchParams(location.search).get('quality');
  if (_isQualityName(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (_isQualityName(saved)) return saved;
  } catch (_) {
    /* storage unavailable — ignore */
  }
  return DEFAULT_QUALITY;
}

/** @type {QualityName} */
let _quality = _restore();

/** @type {Set<(q: QualityName, preset: QualityPreset) => void>} */
const _listeners = new Set();

/** @returns {QualityName} */
export function getQuality() {
  return _quality;
}

/** @returns {QualityPreset} active preset's knobs */
export function getQualityPreset() {
  return QUALITY_PRESETS[_quality];
}

/** Device-pixel-ratio cap for the active preset. */
export function getDprCap() {
  return QUALITY_PRESETS[_quality].dprCap;
}

/**
 * Switch preset, persist it and notify subscribers (renderer DPR, effect
 * modules, UI). No-op if already active.
 * @param {QualityName} q
 */
export function setQuality(q) {
  if (!_isQualityName(q) || q === _quality) return;
  _quality = q;
  try {
    localStorage.setItem(STORAGE_KEY, q);
  } catch (_) {
    /* ignore */
  }
  const preset = QUALITY_PRESETS[q];
  for (const cb of _listeners) cb(q, preset);
}

/**
 * Subscribe to preset changes. Returns an unsubscribe handle.
 * @param {(q: QualityName, preset: QualityPreset) => void} cb
 */
export function onQualityChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
