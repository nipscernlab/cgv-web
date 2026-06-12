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
export const CGV_WAVE_UNIFORM = { value: -1 };

// Outermost cell distance is ~8.2 m (HEC/FCAL far corners); run a little
// past it so the tail of the band clears the detector before shutoff.
const WAVE_MAX_R_MM = 9500;

let _raf = 0;

/**
 * Plays the expanding-light-front animation once. Re-triggering restarts it.
 * @param {number} [durationMs]
 */
export function replayCollision(durationMs = 4500) {
  cancelReplay();
  const t0 = performance.now();
  const step = () => {
    const t = (performance.now() - t0) / durationMs;
    if (t >= 1) {
      cancelReplay();
      return;
    }
    // Ease-out: the front blasts through the inner detector and decelerates
    // through the calorimeters where the information density is.
    const e = 1 - Math.pow(1 - t, 2.2);
    CGV_WAVE_UNIFORM.value = e * WAVE_MAX_R_MM;
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
  markDirty();
}
