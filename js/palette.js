import * as THREE from 'three';

const PAL_N = 256;

// Linear color ramps — inputs clamped to [0, 1].
function _rampTile(t) {
  t = Math.max(0, Math.min(1, t));
  return new THREE.Color(
    1.000 + t * (0.300 - 1.000),  // R: 1.0 -> 0.30
    1.000 + t * (0.000 - 1.000),  // G: 1.0 -> 0
    0.0
  );
}
function _rampHec(t) {
  t = Math.max(0, Math.min(1, t));
  return new THREE.Color(
    0.4000 + t * (0.0471 - 0.4000),
    0.8784 + t * (0.0118 - 0.8784),
    0.9647 + t * (0.4078 - 0.9647)
  );
}
function _rampLAr(t) {
  t = Math.max(0, Math.min(1, t));
  return new THREE.Color(
    0.0902 + t * (0.1529 - 0.0902),
    0.8118 + t * (0.0000 - 0.8118),
    0.2588
  );
}

// Build a 256-entry palette by sampling a ramp function, then boosting saturation.
const _mkPal = ramp => Array.from({ length: PAL_N }, (_, i) => {
  const c = ramp(i / (PAL_N - 1));
  c.offsetHSL(0, 0.35, 0);
  return c;
});

export const PAL_TILE_COLOR = _mkPal(_rampTile);
export const PAL_HEC_COLOR  = _mkPal(_rampHec);
export const PAL_LAR_COLOR  = _mkPal(_rampLAr);

// Shared cell materials — one per detector. Per-instance colors come from
// InstancedMesh.setColorAt on top of the base white.
export const matTile = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide, flatShading: true });
export const matHec  = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide, flatShading: true });
export const matLAr  = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide, flatShading: true });

// Default energy scale ceilings (MeV). Used as the slider cap before any
// event loads and as a fallback when a per-event ceiling can't be computed.
export const TILE_SCALE = 2000;
export const HEC_SCALE  = 5000;
export const LAR_SCALE  = 1000;
export const FCAL_SCALE = 7000;

// Live palette floor+ceiling — overwritten per event so the full [min, p_N]
// range of the actual event maps to the palette's full color range. Floor can
// go negative (real ATLAS XML contains negative cell energies from pedestal
// subtraction), so the smallest cell maps to the light end of the ramp.
let _tileMin = 0, _tileMax = TILE_SCALE;
let _hecMin  = 0, _hecMax  = HEC_SCALE;
let _larMin  = 0, _larMax  = LAR_SCALE;
let _fcalMin = 0, _fcalMax = FCAL_SCALE;

const _setFinite = (mev, fallback) => (isFinite(mev) ? mev : fallback);
export const setPalMaxTile = mev => { _tileMax = _setFinite(mev, TILE_SCALE); };
export const setPalMaxHec  = mev => { _hecMax  = _setFinite(mev, HEC_SCALE);  };
export const setPalMaxLAr  = mev => { _larMax  = _setFinite(mev, LAR_SCALE);  };
export const setPalMaxFcal = mev => { _fcalMax = _setFinite(mev, FCAL_SCALE); };
export const setPalMinTile = mev => { _tileMin = _setFinite(mev, 0); };
export const setPalMinHec  = mev => { _hecMin  = _setFinite(mev, 0); };
export const setPalMinLAr  = mev => { _larMin  = _setFinite(mev, 0); };
export const setPalMinFcal = mev => { _fcalMin = _setFinite(mev, 0); };

// Map v ∈ [lo, hi] to a 0..PAL_N-1 palette index. lo === hi falls back to hi.
const _palIdx = (v, lo, hi) => {
  const span = hi - lo;
  const t    = span > 0 ? (v - lo) / span : 1;
  return Math.round(Math.max(0, Math.min(1, t)) * (PAL_N - 1));
};
export const palColorTile = (eMev) => PAL_TILE_COLOR[_palIdx(eMev, _tileMin, _tileMax)];
export const palColorHec  = (eMev) => PAL_HEC_COLOR [_palIdx(eMev, _hecMin,  _hecMax )];
export const palColorLAr  = (eMev) => PAL_LAR_COLOR [_palIdx(eMev, _larMin,  _larMax )];
export const palColorFcal = (eMev) => {
  const span = _fcalMax - _fcalMin;
  const t    = span > 0 ? (eMev - _fcalMin) / span : 1;
  return palColorFcalRgb(t);
};
const _FCAL_STOPS = [
  [0.102, 0.024, 0.000],
  [0.420, 0.137, 0.063],
  [0.784, 0.392, 0.165],
  [1.000, 0.698, 0.416],
  [1.000, 0.918, 0.745],
];
const _FCAL_STEPS = [0.0, 0.25, 0.55, 0.80, 1.0];
function palColorFcalRgb(t) {
  t = Math.max(0, Math.min(1, t));
  t = Math.pow(t, 0.55);
  for (let i = 1; i < _FCAL_STEPS.length; i++) {
    if (t <= _FCAL_STEPS[i]) {
      const k = (t - _FCAL_STEPS[i-1]) / (_FCAL_STEPS[i] - _FCAL_STEPS[i-1]);
      const a = _FCAL_STOPS[i-1], b = _FCAL_STOPS[i];
      return [a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k];
    }
  }
  return _FCAL_STOPS[_FCAL_STOPS.length - 1];
}
