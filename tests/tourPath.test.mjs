// Unit tests for the cinema tour-path bake (js/cinema/tourPath.js).
// These pin down the smoothness guarantees the cinema relies on: bounded
// per-sample steps (no cusps), safe-envelope clearance outside the beam
// dive, pinned loop duration, the dwell/cruise speed contrast around POIs,
// scene-rotation compensation, and the slicer arc/pendulum confinement.

import { describe, it, expect } from 'vitest';
import {
  extractPOIs,
  bakeTourPath,
  samplePathPoint,
  samplePathSpeed,
  nearestPathU,
  filterPOIsByMinimap,
} from '../public/js/cinema/tourPath.js';

const R_SAFE_MM = 14000;
const CAM_DIP_MM = 1100;
const TWO_PI = Math.PI * 2;
// Dive window — keep in sync with DIVE_U0/DIVE_U1 in tourPath.js.
const DIVE_U0 = 0.7;
const DIVE_U1 = 0.95;

// Loop parameter at which the camera's world azimuth passes a POI at
// ATLAS φ (with optional scene rotation): α(u) = 2πu − π and the POI sits
// at world α = φ + π + rotZ, so u = (φ + rotZ)/2π mod 1.
const uAtPoi = (phi, rotZ = 0) => ((((phi + rotZ) / TWO_PI) % 1) + 1) % 1;

const wrapAbs = (a) => {
  let d = a % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return Math.abs(d);
};

/** A spread of POIs that used to produce hairpins in the old Catmull-Rom
 *  path: adjacent in φ but with opposite η. */
const ZIGZAG_POIS = [
  { eta: 2.5, phi: 0.1, energyMev: 90000 },
  { eta: -2.4, phi: 0.6, energyMev: 80000 },
  { eta: 2.2, phi: 1.1, energyMev: 70000 },
  { eta: -1.8, phi: -2.0, energyMev: 60000 },
  { eta: 0.3, phi: 2.8, energyMev: 50000 },
];

function bakeAll(pois, opts) {
  const path = bakeTourPath(pois, opts);
  expect(path.n).toBeGreaterThan(0);
  for (const key of [
    'px',
    'py',
    'pz',
    'tx',
    'ty',
    'tz',
    'speed',
    'roll',
    'dg',
    'upx',
    'upy',
    'upz',
  ]) {
    for (let i = 0; i < path.n; i++) expect(Number.isFinite(path[key][i])).toBe(true);
  }
  return path;
}

describe('bakeTourPath', () => {
  it('produces finite tables for empty, single and many-POI inputs', () => {
    bakeAll([]);
    bakeAll([{ eta: 0.5, phi: 1.0, energyMev: 1000 }]);
    bakeAll(ZIGZAG_POIS);
    bakeAll(ZIGZAG_POIS, { rotZ: 1.3, arc: { center: 0.2, halfWidth: 0.7 } });
  });

  it('keeps the camera on the safe envelope outside the beam dive', () => {
    for (const pois of [[], ZIGZAG_POIS]) {
      const path = bakeTourPath(pois, { dive: false });
      for (let i = 0; i < path.n; i++) {
        const r = Math.hypot(path.px[i], path.py[i]);
        expect(r).toBeGreaterThanOrEqual(R_SAFE_MM - CAM_DIP_MM - 1);
        expect(r).toBeLessThanOrEqual(R_SAFE_MM + 1);
      }
    }
  });

  it('dives through the beam bore once per loop (traverses along the axis)', () => {
    const path = bakeTourPath(ZIGZAG_POIS); // dive on by default
    let zOnAxisMin = Infinity;
    let zOnAxisMax = -Infinity;
    for (let i = 0; i < path.n; i++) {
      const u = i / path.n;
      const r = Math.hypot(path.px[i], path.py[i]);
      if (u <= DIVE_U0 || u >= DIVE_U1) {
        // Outside the dive the envelope holds.
        expect(r).toBeGreaterThanOrEqual(R_SAFE_MM - CAM_DIP_MM - 1);
      }
      if (r < 200) {
        zOnAxisMin = Math.min(zOnAxisMin, path.pz[i]);
        zOnAxisMax = Math.max(zOnAxisMax, path.pz[i]);
      }
    }
    // Pinned to the axis for a stretch that crosses the whole calo region
    // (z from beyond +3 m, through the interaction point, to beyond −3 m).
    expect(zOnAxisMax).toBeGreaterThan(3000);
    expect(zOnAxisMin).toBeLessThan(-3000);
  });

  it('the dive never enters the calorimeter volume (no cell fly-through)', () => {
    // Forbidden region: inside the calo cylinder (r < 4.9 m AND |z| < 6.5 m)
    // anywhere off the beam corridor (r > 150 mm). The overlapping dive
    // gates must hold the camera high over the end cap while the radius
    // collapses, entering the calo z-range only once pinned to the axis.
    const cases = [
      bakeTourPath([]),
      bakeTourPath(ZIGZAG_POIS),
      bakeTourPath([{ eta: 2.5, phi: 1.0, energyMev: 100000 }]), // reversed dive
      bakeTourPath(ZIGZAG_POIS, { arc: { center: Math.PI / 2, halfWidth: 0.8 } }),
    ];
    for (const path of cases) {
      for (let i = 0; i < path.n; i++) {
        const r = Math.hypot(path.px[i], path.py[i]);
        if (r > 150 && r < 4900) {
          expect(Math.abs(path.pz[i])).toBeGreaterThan(6500);
        }
      }
    }
  });

  it('enters the dive from the end opposite the energy concentration', () => {
    // All the energy far forward (+z): the dive must fly −z → +z so the hot
    // region is ahead of the camera, not behind it.
    const hotForward = [{ eta: 2.5, phi: 1.0, energyMev: 100000 }];
    const path = bakeTourPath(hotForward);
    let firstAxisZ = NaN;
    let lastAxisZ = NaN;
    for (let i = 0; i < path.n; i++) {
      const r = Math.hypot(path.px[i], path.py[i]);
      if (r < 200) {
        if (Number.isNaN(firstAxisZ)) firstAxisZ = path.pz[i];
        lastAxisZ = path.pz[i];
      }
    }
    expect(firstAxisZ).toBeLessThan(0);
    expect(lastAxisZ).toBeGreaterThan(0);
  });

  it('dwells around the hot landmark while inside the bore', () => {
    const hotForward = [{ eta: 2.5, phi: 1.0, energyMev: 100000 }];
    const path = bakeTourPath(hotForward);
    let minS = Infinity;
    let zAtMinS = NaN;
    for (let i = 0; i < path.n; i++) {
      const u = i / path.n;
      if (u <= DIVE_U0 || u >= DIVE_U1) continue;
      if (Math.hypot(path.px[i], path.py[i]) > 200) continue;
      if (path.speed[i] < minS) {
        minS = path.speed[i];
        zAtMinS = path.pz[i];
      }
    }
    // POI at η=2.5 puts the landmark at z ≈ +2.47 m — the slowest on-axis
    // point must sit near it, not at the geometric centre.
    expect(zAtMinS).toBeGreaterThan(1200);
    expect(zAtMinS).toBeLessThan(4200);
  });

  it('keeps the up vector perpendicular to the line of sight (no flip glitch)', () => {
    // The y-up orbit passes over/under the detector twice per loop with the
    // gaze near the centre — with a fixed up, lookAt snap-rolls 180° there
    // (the "scene flips for a moment" glitch). The baked up field is
    // parallel-transported, so view ⊥ up holds at EVERY sample by
    // construction. Stress all three regimes: default orbit (exact
    // degeneracy at u=0.25), POI-steered, and a slicer pendulum centred
    // exactly on the pole.
    const cases = [
      bakeTourPath([]),
      bakeTourPath(ZIGZAG_POIS),
      bakeTourPath(ZIGZAG_POIS, { arc: { center: Math.PI / 2, halfWidth: 0.8 } }),
    ];
    for (const path of cases) {
      for (let i = 0; i < path.n; i++) {
        const vx = path.tx[i] - path.px[i];
        const vy = path.ty[i] - path.py[i];
        const vz = path.tz[i] - path.pz[i];
        const vl = Math.hypot(vx, vy, vz);
        expect(vl).toBeGreaterThan(1);
        const dot = Math.abs((vx * path.upx[i] + vy * path.upy[i] + vz * path.upz[i]) / vl);
        expect(dot).toBeLessThan(0.02);
        expect(Math.hypot(path.upx[i], path.upy[i], path.upz[i])).toBeCloseTo(1, 5);
      }
      // The loop seam must close: the up at the last sample matches the
      // first within one roll-rate step (no transient at the wrap).
      const seam = Math.hypot(
        path.upx[0] - path.upx[path.n - 1],
        path.upy[0] - path.upy[path.n - 1],
        path.upz[0] - path.upz[path.n - 1],
      );
      expect(seam).toBeLessThan(0.2);
    }
  });

  it('bakes one full barrel roll inside the dive and none outside', () => {
    const path = bakeTourPath([]);
    let maxRoll = 0;
    for (let i = 0; i < path.n; i++) {
      const u = i / path.n;
      if (u <= DIVE_U0 || u >= DIVE_U1) expect(path.roll[i]).toBe(0);
      maxRoll = Math.max(maxRoll, path.roll[i]);
    }
    expect(maxRoll).toBeCloseTo(2 * Math.PI, 3);
  });

  it('has no cusps: per-sample steps stay bounded even for η-zigzag POIs', () => {
    // A uniform circular orbit of radius 14 m steps ~2π·14000/720 ≈ 122 mm
    // per sample; the dive's height-alignment climb is the longest smooth
    // stride (worst case ~1 m/sample when a forward POI drags the orbit to
    // the end opposite the entry). A hairpin reversal would produce
    // multi-thousand-mm steps.
    const MAX_STEP_MM = 1100;
    for (const opts of [undefined, { arc: { center: 0.5, halfWidth: 0.9 } }]) {
      const path = bakeTourPath(ZIGZAG_POIS, opts);
      for (let i = 0; i < path.n; i++) {
        const j = (i + 1) % path.n;
        const step = Math.hypot(
          path.px[j] - path.px[i],
          path.py[j] - path.py[i],
          path.pz[j] - path.pz[i],
        );
        expect(step).toBeLessThan(MAX_STEP_MM);
      }
    }
  });

  it('normalises the speed profile so one loop takes exactly the nominal time', () => {
    for (const pois of [[], ZIGZAG_POIS]) {
      const path = bakeTourPath(pois);
      let loop = 0;
      for (let i = 0; i < path.n; i++) loop += 1 / path.n / path.speed[i];
      expect(loop).toBeCloseTo(1, 6);
    }
  });

  it('dwells near hotspots: slower at a POI azimuth than in an empty gap', () => {
    const pois = [{ eta: 0.0, phi: 0.5, energyMev: 100000 }];
    const path = bakeTourPath(pois, { dive: false });
    const sAt = samplePathSpeed(path, uAtPoi(0.5));
    const sAway = samplePathSpeed(path, (uAtPoi(0.5) + 0.5) % 1);
    expect(sAt).toBeLessThan(sAway * 0.6);
  });

  it('compensates the scene rotation: dwell follows the rotated POI', () => {
    const pois = [{ eta: 0.0, phi: 0.5, energyMev: 100000 }];
    const rotZ = 2.0;
    const path = bakeTourPath(pois, { rotZ, dive: false });
    const sAt = samplePathSpeed(path, uAtPoi(0.5, rotZ));
    const sAway = samplePathSpeed(path, (uAtPoi(0.5, rotZ) + 0.5) % 1);
    expect(sAt).toBeLessThan(sAway * 0.6);
  });

  it('aims the gaze at the hotspot when the camera passes it', () => {
    const poi = { eta: 0.0, phi: 0.5, energyMev: 100000 };
    const path = bakeTourPath([poi], { dive: false });
    const pos = { x: 0, y: 0, z: 0 };
    const tgt = { x: 0, y: 0, z: 0 };
    samplePathPoint(path, uAtPoi(0.5), pos, tgt);
    // POI world centre (matches the codebase η/φ → xyz convention).
    const cx = -2500 * Math.cos(0.5);
    const cy = -2500 * Math.sin(0.5);
    const d = Math.hypot(tgt.x - cx, tgt.y - cy, tgt.z - 0);
    expect(d).toBeLessThan(600);
  });

  it('confines the camera to the slicer arc (pendulum across the opening)', () => {
    const center = 1.0;
    const halfWidth = 0.6;
    const path = bakeTourPath(ZIGZAG_POIS, { arc: { center, halfWidth }, dive: false });
    for (let i = 0; i < path.n; i++) {
      const a = Math.atan2(path.py[i], path.px[i]);
      expect(wrapAbs(a - center)).toBeLessThanOrEqual(halfWidth + 1e-3);
    }
  });

  it('soft-clamps the camera height into the slicer z window in arc mode', () => {
    // Forward POIs pull hard toward +z; the window must win.
    const pois = [{ eta: 2.5, phi: 1.0, energyMev: 100000 }];
    const zWindow = { min: -2000, max: 2000 };
    const path = bakeTourPath(pois, {
      arc: { center: 1.0, halfWidth: 0.6 },
      zWindow,
      dive: false,
    });
    for (let i = 0; i < path.n; i++) {
      expect(path.pz[i]).toBeGreaterThanOrEqual(zWindow.min);
      expect(path.pz[i]).toBeLessThanOrEqual(zWindow.max);
    }
  });
});

describe('samplePathPoint / nearestPathU', () => {
  it('wraps the loop parameter and interpolates between samples', () => {
    const path = bakeTourPath([]);
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    samplePathPoint(path, 0.25, a);
    samplePathPoint(path, 1.25, b);
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.y).toBeCloseTo(a.y, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
  });

  it('nearestPathU returns the parameter of the closest sample', () => {
    const path = bakeTourPath([]);
    const p = { x: 0, y: 0, z: 0 };
    samplePathPoint(path, 0.4, p);
    const u = nearestPathU(path, p.x, p.y, p.z);
    expect(Math.abs(u - 0.4)).toBeLessThan(2 / path.n);
  });
});

describe('extractPOIs', () => {
  it('clusters nearby cells and keeps energy ordering', () => {
    const cells = [
      { eta: 0.5, phi: 1.0, energyMev: 50000 },
      { eta: 0.55, phi: 1.05, energyMev: 30000 }, // folds into the first
      { eta: -2.0, phi: -2.5, energyMev: 40000 },
    ];
    const pois = extractPOIs(cells);
    expect(pois.length).toBe(2);
    expect(pois[0].energyMev).toBeGreaterThan(pois[1].energyMev);
  });

  it('drops non-finite and zero-energy entries', () => {
    const pois = extractPOIs([
      { eta: NaN, phi: 0, energyMev: 100 },
      { eta: 0, phi: 0, energyMev: 0 },
    ]);
    expect(pois.length).toBe(0);
  });
});

describe('filterPOIsByMinimap', () => {
  it('keeps POIs inside a wrapping φ arc', () => {
    const pois = [
      { eta: 0, phi: 3.0, energyMev: 1 },
      { eta: 0, phi: 0.0, energyMev: 1 },
    ];
    // Arc from φ=2.5 wrapping past π to −2.5 (width ≈ 1.3 rad).
    const rects = [{ etaMin: -1, etaMax: 1, phiMin: 2.5, phiMax: 2.5 + 1.3 }];
    const kept = filterPOIsByMinimap(pois, rects);
    expect(kept.length).toBe(1);
    expect(kept[0].phi).toBe(3.0);
  });
});
