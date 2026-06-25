// @ts-check
// Collision replay (docs/VISUAL_PLAN.md, item B2).
//
// A spherical wavefront expands from the primary vertex at (a readably
// slowed-down) speed of light; calorimeter cells light up as the front
// crosses them. Physically motivated — every particle in the event moves at
// ~c, so "distance from the vertex" doubles as "time since the collision" —
// and it needs zero extra data: the mega-cell shader already knows every
// cell's centre (uCenterTex), so the whole effect is ONE uniform compared
// per vertex (CGV_WAVE_UNIFORM, wired in megaCells.js).
//
// This is a finite, explicitly-triggered animation (cinema entry / replay),
// so it may drive continuous frames while it runs — the idle GPU contract
// (VISUAL_PLAN, restriction I.4.3) stays intact: the uniform rests at -1
// (disabled) and the rAF loop self-terminates.

import { markDirty } from './renderer.js';

// -1 = wave off (shader short-circuits). Otherwise: front radius in mm.
// Shared by reference into BOTH the calorimeter mega-cell material
// (megaCells.js) and the muon-chamber mega-mesh material
// (trackAtlasIntersections.js), so one animation lights up cells AND the hit
// chambers in lockstep.
export const CGV_WAVE_UNIFORM = { value: -1 };

// Tail fade [0..1], also shared into both materials. The shaders lerp the
// wave's contribution back toward "normal" by this factor, so the effect
// dissolves over the last stretch of the sweep instead of being cut off when
// the uniform snaps to -1. Rests at 1 (full strength) while the wave runs.
export const CGV_WAVE_FADE = { value: 1 };

// One continuous reach from the vertex out through the muon spectrometer. The
// detector is treated as a single continuum of cells: calorimeter cells (out to
// ~9.5 m) and the hit muon chambers (outer barrel ~13 m, endcap chambers out to
// ~23 m) are lit by the SAME expanding front with no mid-sweep pause. R_MAX
// runs a little past the outermost chamber so the band clears before shutoff.
const R_MAX_MM = 25000;
// The wave's contribution fades to nothing over t ∈ [FADE_FROM, 1].
const FADE_FROM = 0.84;

// Quintic smootherstep (6x⁵−15x⁴+10x³): monotonic, zero velocity ONLY at the
// endpoints — so the front emerges gently from the vertex, sweeps the whole
// detector as one continuum (no interior stall), and winds down at the rim.
/** @param {number} x */
const _smootherstep = (x) => x * x * x * (x * (x * 6 - 15) + 10);

let _raf = 0;

/**
 * Plays the expanding-light-front animation once. Re-triggering restarts it.
 * @param {number} [durationMs]
 */
export function replayCollision(durationMs = 7000) {
  cancelReplay();
  const t0 = performance.now();
  const step = () => {
    const t = (performance.now() - t0) / durationMs;
    if (t >= 1) {
      cancelReplay();
      return;
    }
    CGV_WAVE_UNIFORM.value = _smootherstep(t) * R_MAX_MM;
    CGV_WAVE_FADE.value = t <= FADE_FROM ? 1 : 1 - _smootherstep((t - FADE_FROM) / (1 - FADE_FROM));
    markDirty();
    _raf = requestAnimationFrame(step);
  };
  _raf = requestAnimationFrame(step);
}

/** Stops the animation and restores normal cell lighting. */
export function cancelReplay() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = 0;
  CGV_WAVE_UNIFORM.value = -1;
  CGV_WAVE_FADE.value = 1;
  markDirty();
}
