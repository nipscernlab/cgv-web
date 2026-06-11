// @ts-check
// Event-driven tour path for the cinema mode.
//
// Design: the camera lives on a smooth closed orbit around the beam axis on
// the "safe envelope" cylinder (R_SAFE_MM ≈ 14 m, outside the muon system),
// and the event *steers* that orbit instead of defining it point-by-point:
//
//   · azimuth sweeps 0→2π exactly once per loop — by construction the path
//     can never zig-zag or fold back on itself, so there are no cusps for
//     the camera to lurch through (the root cause of the old "solavancos":
//     POIs adjacent in φ but with opposite η pulled the Catmull-Rom control
//     points from z = −15 m to +15 m, creating hairpins in the closed curve);
//   · height z(φ) is a kernel-smoothed blend of POI pseudorapidities, so the
//     orbital plane tilts gradually toward forward activity;
//   · radius dips toward hotspots (a gentle dolly-in) and recovers in gaps;
//   · the look target glides between energy-weighted POI centres — the
//     camera is always framing the nearest occupied region, never staring
//     at empty space;
//   · speed slows near hotspots and cruises through gaps, giving natural
//     ease-in/ease-out. Every quantity is a C∞ function of the loop
//     parameter (Gaussian kernels + smooth saturations only).
//
// Everything is baked once per rebuild into Float32Array lookup tables
// (LUT_N samples around the loop). The per-frame cost in cinema.js is a
// handful of array lerps — no spline evaluation, no allocations.
//
// Slicer / minimap filters: POIs whose 3D centre falls inside the slicer
// wedge (hidden by the user) are dropped; POIs outside the active minimap
// rectangles (user-defined area of interest) are dropped. Both produce an
// event-aware path that excludes regions the user explicitly removed.

// ── Clustering / POI extraction ───────────────────────────────────────────────
// ATLAS jet cones are typically ΔR=0.4, so 0.5 keeps the POI set coarse
// enough that small fluctuations don't spawn duplicate waypoints.
const POI_DR = 0.5;
// Cap on POIs steering the path. More than ~8 and the kernels overlap into
// a near-uniform field, which defeats the dwell/cruise speed contrast.
const MAX_POIS = 8;
// Floor below which a POI is dropped (fraction of the peak POI energy).
const MIN_POI_ENERGY_FRAC = 0.02;

// ── Safe-envelope cylinder ────────────────────────────────────────────────────
// Muon outer shell is at r ≈ 11–12 m / |z| ≤ 22 m. R_SAFE_MM at 14 m clears
// the muon outer with ~2 m of margin; the hotspot dolly-in below dips at
// most CAM_DIP_MM, still leaving ~0.9 m of clearance.
const R_SAFE_MM = 14000;
// Z amplitude of the camera path. Forward POIs (|η| ≳ 2) lift the camera
// toward ±Z_AXIAL_MAX, where it still sits outside the muon endcap.
const Z_AXIAL_MAX = 15000;
// |η| at which the camera approaches the |z| cap; tanh-shaped so the
// response is smooth all the way out.
const Z_ETA_SCALE = 2.0;
// Look-at: inner-calo radius — places the look-at point at the cluster /
// jet origin band, the most visually informative depth.
const TGT_R_MM = 2500;

// ── Bake parameters ───────────────────────────────────────────────────────────
// Samples around the loop. 720 = 0.5° steps; linear interpolation between
// neighbours is far below perceptual thresholds at this density.
const LUT_N = 720;
// How far the camera dollies in toward a full-strength hotspot.
const CAM_DIP_MM = 1100;
// Kernel widths (radians of azimuth). Interest is the sharpest so the
// dwell/dolly reaction is localised; z is the widest so the orbital plane
// changes lazily; the target sits in between so the gaze leads smoothly
// from one hotspot to the next.
const SIG_INTEREST = 0.45;
const SIG_Z = 1.1;
const SIG_TGT = 0.8;
// Speed profile endpoints (multiples of the mean loop speed, before the
// normalisation that pins the total loop duration).
const SPEED_CRUISE = 1.4;
const SPEED_DWELL = 0.55;
// Fallback z-wave (no event / POI-free stretch): two gentle cycles per loop.
const Z_DEFAULT_FRAC = 0.35;

// ── Beam-line dive — the set piece of the tour ───────────────────────────────
// Once per loop the camera leaves the envelope, spirals onto the beam axis
// and flies straight through the detector bore — then spirals back out and
// resumes the orbit. The bore is the one corridor guaranteed free of cells:
// calo cells live at r ≳ 1.1 m and even the FCAL (which hugs the beam at
// |z| ≈ 4.7–6.3 m) keeps r ≳ 70 mm, well outside the camera's 10 mm near
// plane.
//
// The dive is event-driven:
//   · it enters from the end OPPOSITE the event's energy centroid, so the
//     hot region glows at the far end of the tunnel for the whole approach
//     instead of sitting behind the camera;
//   · the gaze locks onto a fixed "landmark" — the energy-weighted centroid
//     of the POI centres (pushed off-axis so it is never flown through).
//     Flying past a fixed landmark produces the classic fly-by: the view
//     sweeps across it at closest approach and the camera exits looking
//     back at the heart of the event — no snap, the rotation falls out of
//     the geometry;
//   · speed dwells (Gaussian in z) around the landmark and rushes through
//     the empty stretches;
//   · a single full barrel roll plays out across the inner plateau, and the
//     baked dive gate is exposed (path.dg) so the renderer can add a gentle
//     FOV push inside the tunnel.
const DIVE_U0 = 0.7;
const DIVE_U1 = 0.95;
// Entry/exit z of the dive — past the calo (|z| ≤ 6.3 m) so the camera
// lines up with the bore before anything interesting is nearby.
const DIVE_Z_MM = 9000;
// Fraction of the dive window spent ramping in/out (smootherstep). Wide
// ramps keep the spiral gentle (no sharp radial collapse).
const DIVE_RAMP_FRAC = 0.35;
// |energy-centroid z| beyond which the dive picks an entry end (below it
// the event is balanced and the default +z entry is used).
const DIVE_END_BIAS_MM = 800;
// Landmark placement: clamp along z (stay inside the calo so the fly-by
// happens within the geometry) and minimum lateral offset (bounds the peak
// pan rate at closest approach — the camera never flies through its own
// look target).
const DIVE_LM_ZMAX_MM = 4500;
const DIVE_LM_MIN_R_MM = 1100;
// Dive speed profile: rush the empty bore, dwell at the landmark.
const DIVE_SPEED_FAST = 1.6;
const DIVE_SPEED_SLOW = 0.5;
const DIVE_DWELL_SIGMA_MM = 2800;
// Barrel roll: one full turn across the middle of the plateau.
const DIVE_ROLL_T0 = 0.2;
const DIVE_ROLL_T1 = 0.8;

// ── Up field: parallel transport + rate-limited anchoring ────────────────────
// lookAt degenerates when the line of sight aligns with the up vector: the
// internal cross product flips sign and the frame snap-rolls 180° for a few
// frames — the "scene flips and comes back" glitch. With a y-up orbit
// around the beam axis this is guaranteed twice per loop (the camera
// passes over/under the detector while looking at the centre: view ≈ ±y),
// and no fixed blend target can fix it — any world-anchored up reverses
// across a pole crossing (that reversal IS the flip).
//
// The bake therefore builds the up as a FIELD along the loop:
//   1. parallel transport: each sample re-projects the previous up
//      perpendicular to the new view direction. The up is ⊥ view at every
//      sample BY CONSTRUCTION, so the lookAt degeneracy cannot occur, ever;
//   2. anchoring: the transported up is pulled toward the reference up
//      (world vertical, or the barrel-roll frame inside the dive) by at
//      most MAX_ROLL_STEP per sample. Across a pole pass — where the
//      reference reverses — this turns the would-be instant flip into a
//      banked roll spread over ~2 s, and everywhere else it keeps the
//      horizon level. Where the reference itself is momentarily parallel
//      to the view (the exact crossing), anchoring is skipped and pure
//      transport carries the frame through.
const MAX_ROLL_STEP = 0.13; // rad per LUT sample (~7.5°: 180° in ≈ 2 s)

/** C2 ease used for the dive blend gate. @param {number} t */
function _sstep01(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * t * (t * (6 * t - 15) + 10);
}

/**
 * @typedef {{eta:number, phi:number, energyMev:number}} HeatEntry
 * @typedef {{eta:number, phi:number, energyMev:number}} POI
 * @typedef {{etaMin:number, etaMax:number, phiMin:number, phiMax:number}} Rect
 * @typedef {{n:number,
 *            px:Float32Array, py:Float32Array, pz:Float32Array,
 *            tx:Float32Array, ty:Float32Array, tz:Float32Array,
 *            speed:Float32Array, roll:Float32Array, dg:Float32Array,
 *            upx:Float32Array, upy:Float32Array, upz:Float32Array}} TourPath
 */

/** @param {number} d */
function _wrapDPhi(d) {
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * 3D centre of a POI on the inner-calo radius. Convention matches the rest
 * of the codebase (track parser et al.):
 *   θ = 2·atan(exp(-η))
 *   inward direction: (-sin θ·cos φ, -sin θ·sin φ, cos θ)
 *
 * @param {POI} poi
 */
function _poiToWorldCentre(poi) {
  const theta = 2 * Math.atan(Math.exp(-poi.eta));
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  return {
    x: -TGT_R_MM * sinT * Math.cos(poi.phi),
    y: -TGT_R_MM * sinT * Math.sin(poi.phi),
    z: TGT_R_MM * cosT,
  };
}

/**
 * Greedy clustering of heat entries into POIs. Highest-energy cells seed
 * POIs; subsequent cells within ΔR ≤ POI_DR fold into the nearest seed
 * with an energy-weighted centroid (linear average for η, unit-vector
 * average for φ to handle wrap at ±π).
 *
 * @param {HeatEntry[]} cellEntries
 * @param {HeatEntry[]} fcalEntries
 * @returns {POI[]}
 */
export function extractPOIs(cellEntries, fcalEntries = []) {
  /** @type {HeatEntry[]} */
  const merged = [];
  const push = (/** @type {HeatEntry[]} */ src) => {
    for (const e of src || []) {
      if (!e || !Number.isFinite(e.eta) || !Number.isFinite(e.phi)) continue;
      const en = Math.abs(e.energyMev || 0);
      if (en <= 0) continue;
      merged.push({ eta: e.eta, phi: e.phi, energyMev: en });
    }
  };
  push(cellEntries);
  push(fcalEntries);
  if (!merged.length) return [];

  merged.sort((a, b) => b.energyMev - a.energyMev);

  /** @type {POI[]} */
  const pois = [];
  for (const e of merged) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < pois.length; i++) {
      const p = pois[i];
      const dEta = e.eta - p.eta;
      const dPhi = _wrapDPhi(e.phi - p.phi);
      const dR = Math.sqrt(dEta * dEta + dPhi * dPhi);
      if (dR < bestD) {
        bestD = dR;
        best = i;
      }
    }
    if (best >= 0 && bestD <= POI_DR) {
      const p = pois[best];
      const totE = p.energyMev + e.energyMev;
      p.eta = (p.eta * p.energyMev + e.eta * e.energyMev) / totE;
      const px = Math.cos(p.phi) * p.energyMev + Math.cos(e.phi) * e.energyMev;
      const py = Math.sin(p.phi) * p.energyMev + Math.sin(e.phi) * e.energyMev;
      p.phi = Math.atan2(py, px);
      p.energyMev = totE;
    } else {
      pois.push({ eta: e.eta, phi: e.phi, energyMev: e.energyMev });
    }
  }

  if (!pois.length) return pois;
  const maxE = pois.reduce((m, p) => Math.max(m, p.energyMev), 0);
  const thr = maxE * MIN_POI_ENERGY_FRAC;
  return pois
    .filter((p) => p.energyMev >= thr)
    .sort((a, b) => b.energyMev - a.energyMev)
    .slice(0, MAX_POIS);
}

/**
 * Drop POIs whose 3D centre falls inside the slicer wedge — they've been
 * cut out of the 3D scene so the tour shouldn't visit them. slicerMask
 * is the object returned by slicer.getMaskState(); when null / inactive
 * the input is returned unchanged.
 *
 * @param {POI[]} pois
 * @param {any} slicerMask
 * @param {(x:number, y:number, z:number, mask:any)=>boolean} isPointInsideWedge
 */
export function filterPOIsBySlicer(pois, slicerMask, isPointInsideWedge) {
  if (!slicerMask || !slicerMask.active || slicerMask.emptyTh) return pois;
  if (typeof isPointInsideWedge !== 'function') return pois;
  return pois.filter((p) => {
    const c = _poiToWorldCentre(p);
    return !isPointInsideWedge(c.x, c.y, c.z, slicerMask);
  });
}

/**
 * Drop POIs whose (η, φ) is outside every minimap rect — the user has
 * narrowed the view to specific regions, so the tour should follow suit.
 * No rects ⇒ no filter.
 *
 * @param {POI[]} pois
 * @param {Rect[] | null} rects
 */
export function filterPOIsByMinimap(pois, rects) {
  if (!rects || !rects.length) return pois;
  // phiMin/phiMax form a continuous arc that may wrap past ±π (rotated seam /
  // panning) — test φ modulo 2π, matching visibility.js's region gate.
  const TWO_PI = Math.PI * 2;
  return pois.filter((p) =>
    rects.some((r) => {
      if (p.eta < r.etaMin || p.eta > r.etaMax) return false;
      const w = r.phiMax - r.phiMin;
      if (w >= TWO_PI - 1e-9) return true;
      const d = (((p.phi - r.phiMin) % TWO_PI) + TWO_PI) % TWO_PI;
      return d <= w;
    }),
  );
}

/**
 * Bake the tour into lookup tables. Handles any POI count — an empty list
 * produces the default orbit (gentle z-wave, gaze toward the interaction
 * point), a single POI produces an orbit that dwells on it once per loop,
 * and so on. Cost is O(LUT_N · |pois|), a fraction of a millisecond, and
 * it only runs inside the debounced rebuild.
 *
 * Options:
 *   rotZ     World-frame scene rotation (scene.rotation.z). The slicer
 *            rotates the whole scene so its wedge opening faces +X; POI
 *            azimuths arrive in scene/ATLAS coordinates, so every world
 *            quantity baked here must be offset by this angle or the tour
 *            stares at the wrong side of the detector.
 *   arc      {center, halfWidth} in WORLD azimuth — confines the camera to
 *            a pendulum sweep across the slicer's wedge opening instead of
 *            a full orbit, so the tour looks into the cut and never parks
 *            in front of the solid (TILE-only) outer wall. α(u) =
 *            center + sin(2πu)·halfWidth is C∞ and closed in u.
 *   zWindow  {min, max} — the slicer's z extent. In arc mode the camera
 *            height is soft-clamped (tanh) into this window so it stays
 *            level with the opening.
 *   dive     Enable the once-per-loop beam-line flythrough (default true).
 *
 * @param {POI[]} pois
 * @param {{rotZ?: number,
 *          arc?: {center:number, halfWidth:number} | null,
 *          zWindow?: {min:number, max:number} | null,
 *          dive?: boolean}} [opts]
 * @returns {TourPath}
 */
export function bakeTourPath(pois, opts = {}) {
  const rotZ = Number.isFinite(opts.rotZ) ? /** @type {number} */ (opts.rotZ) : 0;
  const arc = opts.arc || null;
  const zWindow = opts.zWindow || null;
  const dive = opts.dive !== false;

  const n = LUT_N;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const tz = new Float32Array(n);
  const speed = new Float32Array(n);
  const roll = new Float32Array(n);
  const dg = new Float32Array(n);
  const upx = new Float32Array(n);
  const upy = new Float32Array(n);
  const upz = new Float32Array(n);

  // Per-POI precomputation: relative energy weight, the camera height its η
  // asks for, its WORLD azimuth (scene angle φ+π, then the scene rotation),
  // and its world centre (the gaze attractor, rotated the same way).
  const m = pois ? pois.length : 0;
  const pA = new Float64Array(m);
  const pW = new Float64Array(m);
  const pZ = new Float64Array(m);
  const pCx = new Float64Array(m);
  const pCy = new Float64Array(m);
  const pCz = new Float64Array(m);
  const cosR = Math.cos(rotZ);
  const sinR = Math.sin(rotZ);
  let maxE = 0;
  for (let i = 0; i < m; i++) maxE = Math.max(maxE, pois[i].energyMev);
  for (let i = 0; i < m; i++) {
    const p = pois[i];
    pA[i] = p.phi + Math.PI + rotZ;
    pW[i] = maxE > 0 ? p.energyMev / maxE : 0;
    pZ[i] = Math.tanh(p.eta / Z_ETA_SCALE) * Z_AXIAL_MAX * 0.8;
    const c = _poiToWorldCentre(p);
    pCx[i] = c.x * cosR - c.y * sinR;
    pCy[i] = c.x * sinR + c.y * cosR;
    pCz[i] = c.z;
  }

  const inv2sI = 1 / (2 * SIG_INTEREST * SIG_INTEREST);
  const inv2sZ = 1 / (2 * SIG_Z * SIG_Z);
  const inv2sT = 1 / (2 * SIG_TGT * SIG_TGT);

  // ── Dive choreography (event-driven) ────────────────────────────────────
  // Energy centroid of the POI centres (world frame). Decides which end the
  // dive enters from and where the fly-by landmark sits.
  let cw = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  let czAcc = 0;
  for (let i = 0; i < m; i++) {
    cw += pW[i];
    cxAcc += pW[i] * pCx[i];
    cyAcc += pW[i] * pCy[i];
    czAcc += pW[i] * pCz[i];
  }
  const zHot = cw > 0 ? czAcc / cw : 0;
  // Enter from the end OPPOSITE the energy concentration so the hot region
  // is ahead of the camera for the whole approach. Balanced events keep the
  // default +z entry.
  const entrySign = zHot > DIVE_END_BIAS_MM ? -1 : 1;
  // Fly-by landmark: the hot centroid, kept inside the calo along z and
  // pushed off the flight line laterally (the camera must pass it, never
  // pierce it — the pass-by is what swings the gaze around).
  let lmX = cw > 0 ? cxAcc / cw : 0;
  let lmY = cw > 0 ? cyAcc / cw : 0;
  const lmZ = Math.max(-DIVE_LM_ZMAX_MM, Math.min(DIVE_LM_ZMAX_MM, zHot));
  const lmR = Math.hypot(lmX, lmY);
  if (lmR < DIVE_LM_MIN_R_MM) {
    if (lmR > 1e-6) {
      lmX *= DIVE_LM_MIN_R_MM / lmR;
      lmY *= DIVE_LM_MIN_R_MM / lmR;
    } else {
      lmX = 0;
      lmY = DIVE_LM_MIN_R_MM;
    }
  }
  const inv2sDive = 1 / (2 * DIVE_DWELL_SIGMA_MM * DIVE_DWELL_SIGMA_MM);

  // Z placement: free-roaming by default; pinned to the wedge's z window in
  // arc mode (soft tanh limit — C∞, no clamp kinks).
  const zMid = zWindow ? (zWindow.min + zWindow.max) / 2 : 0;
  const zHalf = zWindow ? Math.max(500, (zWindow.max - zWindow.min) / 2) : Z_AXIAL_MAX;
  const zAmpDef = arc
    ? Math.min(Z_AXIAL_MAX * Z_DEFAULT_FRAC, zHalf * 0.55)
    : Z_AXIAL_MAX * Z_DEFAULT_FRAC;
  const zSoftL = zHalf * 0.8;

  const diveW = DIVE_U1 - DIVE_U0;

  let invSpeedSum = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    // Camera azimuth in WORLD coordinates: full sweep, or pendulum across
    // the wedge opening when the slicer is active.
    const alpha = arc
      ? arc.center + Math.sin(u * 2 * Math.PI) * arc.halfWidth
      : u * 2 * Math.PI - Math.PI;

    let interest = 0;
    let wzSum = 0;
    let zAcc = 0;
    let wtSum = 0;
    let txAcc = 0;
    let tyAcc = 0;
    let tzAcc = 0;
    for (let i = 0; i < m; i++) {
      const d = _wrapDPhi(alpha - pA[i]);
      const d2 = d * d;
      interest += pW[i] * Math.exp(-d2 * inv2sI);
      const wz = pW[i] * Math.exp(-d2 * inv2sZ);
      wzSum += wz;
      zAcc += wz * pZ[i];
      const wt = pW[i] * Math.exp(-d2 * inv2sT);
      wtSum += wt;
      txAcc += wt * pCx[i];
      tyAcc += wt * pCy[i];
      tzAcc += wt * pCz[i];
    }

    // Smooth saturation into [0,1): overlapping POIs can push raw interest
    // past 1, and min() would put a kink in the speed/radius profiles.
    const dwell = 1 - Math.exp(-1.4 * interest);

    // Camera height: kernel-weighted POI height, relaxing to the default
    // z-wave wherever no POI exerts meaningful pull. The blend gate is a
    // smooth rational in the total weight, so entering/leaving a POI's
    // sphere of influence never kinks the path.
    const zDefault = zMid + Math.sin(u * 4 * Math.PI) * zAmpDef;
    const gz = wzSum / (wzSum + 0.12);
    const zRaw = zDefault * (1 - gz) + (wzSum > 0 ? zAcc / wzSum : zMid) * gz;
    const z = zWindow ? zMid + zSoftL * Math.tanh((zRaw - zMid) / zSoftL) : zRaw;

    const r = R_SAFE_MM - CAM_DIP_MM * dwell;
    let posX = r * Math.cos(alpha);
    let posY = r * Math.sin(alpha);
    let posZ = z;

    // Gaze: glides between the energy-weighted centres of nearby hotspots;
    // relaxes toward the interaction point when nothing is close, which
    // keeps the whole detector in frame rather than empty space. In arc
    // mode the same machinery naturally favours the cut faces: POIs just
    // past the wedge walls are the closest in azimuth, and the fallback
    // (origin) looks straight through the opening into the interior.
    const gt = wtSum / (wtSum + 0.08);
    const tDefZ = z * 0.35;
    let tgtX = (wtSum > 0 ? txAcc / wtSum : 0) * gt;
    let tgtY = (wtSum > 0 ? tyAcc / wtSum : 0) * gt;
    let tgtZ = tDefZ * (1 - gt) + (wtSum > 0 ? tzAcc / wtSum : 0) * gt;

    let s = SPEED_CRUISE - (SPEED_CRUISE - SPEED_DWELL) * dwell;
    let rollK = 0;
    let dgK = 0;

    // Beam-line dive: blend the orbit toward the axis and back with a C2
    // gate. While inside, position tracks the bore (x=y=0, z sweeping from
    // the entry end through to the other side) and the gaze locks onto the
    // fly-by landmark; speed rushes the empty bore and dwells (Gaussian in
    // z) around the landmark. A single barrel roll spins across the inner
    // plateau (it returns to exactly 2π ≡ 0, so the up-vector is continuous
    // where the gate releases it).
    if (dive && u > DIVE_U0 && u < DIVE_U1) {
      const tw = (u - DIVE_U0) / diveW;
      const g = _sstep01(Math.min(tw, 1 - tw) / DIVE_RAMP_FRAC);
      const zd = entrySign * Math.cos(tw * Math.PI) * DIVE_Z_MM;
      posX *= 1 - g;
      posY *= 1 - g;
      posZ = posZ * (1 - g) + zd * g;
      tgtX = tgtX * (1 - g) + lmX * g;
      tgtY = tgtY * (1 - g) + lmY * g;
      tgtZ = tgtZ * (1 - g) + lmZ * g;
      const dz = zd - lmZ;
      const sDive =
        DIVE_SPEED_FAST - (DIVE_SPEED_FAST - DIVE_SPEED_SLOW) * Math.exp(-dz * dz * inv2sDive);
      s = s * (1 - g) + sDive * g;
      rollK = 2 * Math.PI * _sstep01((tw - DIVE_ROLL_T0) / (DIVE_ROLL_T1 - DIVE_ROLL_T0));
      dgK = g;
    }

    px[k] = posX;
    py[k] = posY;
    pz[k] = posZ;
    tx[k] = tgtX;
    ty[k] = tgtY;
    tz[k] = tgtZ;
    speed[k] = s;
    roll[k] = rollK;
    dg[k] = dgK;
    invSpeedSum += 1 / s;
  }

  // ── Up-field pass (see MAX_ROLL_STEP block above) ─────────────────────────
  // Two laps: the first lets the anchored transport converge from its seed,
  // the second writes the tables — so the wrap seam (sample n−1 → 0) carries
  // no start-up transient and the loop closes cleanly.
  {
    let ux = 0;
    let uy = 1;
    let uz = 0;
    for (let lap = 0; lap < 2; lap++) {
      for (let k = 0; k < n; k++) {
        // View direction of this sample.
        let vx = tx[k] - px[k];
        let vy = ty[k] - py[k];
        let vz = tz[k] - pz[k];
        const vl = Math.hypot(vx, vy, vz) || 1;
        vx /= vl;
        vy /= vl;
        vz /= vl;

        // 1. Transport: strip the view component from the running up.
        let d = ux * vx + uy * vy + uz * vz;
        ux -= vx * d;
        uy -= vy * d;
        uz -= vz * d;
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul;
        uy /= ul;
        uz /= ul;

        // 2. Anchor: reference up (world vertical / dive roll frame),
        // projected ⊥ view. Skipped when the projection vanishes (the
        // reference is parallel to the view — the exact pole crossing).
        let cx = Math.sin(roll[k]);
        let cy = Math.cos(roll[k]);
        let cz = 0.32 * dg[k];
        d = cx * vx + cy * vy + cz * vz;
        cx -= vx * d;
        cy -= vy * d;
        cz -= vz * d;
        const cl = Math.hypot(cx, cy, cz);
        if (cl > 1e-4) {
          cx /= cl;
          cy /= cl;
          cz /= cl;
          // Signed angle from û to ĉ around v̂, clamped to the roll-rate
          // budget, applied as a rotation of û about v̂ (both ⊥ v̂, so the
          // rotation stays in their shared plane).
          const sinA =
            (uy * cz - uz * cy) * vx + (uz * cx - ux * cz) * vy + (ux * cy - uy * cx) * vz;
          const cosA = ux * cx + uy * cy + uz * cz;
          let a = Math.atan2(sinA, cosA);
          if (a > MAX_ROLL_STEP) a = MAX_ROLL_STEP;
          else if (a < -MAX_ROLL_STEP) a = -MAX_ROLL_STEP;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const wx = vy * uz - vz * uy;
          const wy = vz * ux - vx * uz;
          const wz = vx * uy - vy * ux;
          ux = ux * ca + wx * sa;
          uy = uy * ca + wy * sa;
          uz = uz * ca + wz * sa;
        }

        if (lap === 1) {
          upx[k] = ux;
          upy[k] = uy;
          upz[k] = uz;
        }
      }
    }
  }

  // Normalise so one loop always takes TOUR_LOOP_MS regardless of how much
  // of it is dwell vs cruise: loop time = Σ (du / speed), so scaling speed
  // by the mean inverse pins the integral to 1.
  const scale = invSpeedSum / n;
  for (let k = 0; k < n; k++) speed[k] *= scale;

  return { n, px, py, pz, tx, ty, tz, speed, roll, dg, upx, upy, upz };
}

/**
 * Sample the camera-position and look-target tables at loop parameter u
 * (wrapped into [0,1)), writing into the provided vectors. Linear
 * interpolation between adjacent samples; no allocations.
 *
 * @param {TourPath} path
 * @param {number} u
 * @param {{x:number,y:number,z:number}} outPos
 * @param {{x:number,y:number,z:number}} [outTgt]
 */
export function samplePathPoint(path, u, outPos, outTgt) {
  const n = path.n;
  let f = (u % 1) * n;
  if (f < 0) f += n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const t = f - Math.floor(f);
  outPos.x = path.px[i0] + (path.px[i1] - path.px[i0]) * t;
  outPos.y = path.py[i0] + (path.py[i1] - path.py[i0]) * t;
  outPos.z = path.pz[i0] + (path.pz[i1] - path.pz[i0]) * t;
  if (outTgt) {
    outTgt.x = path.tx[i0] + (path.tx[i1] - path.tx[i0]) * t;
    outTgt.y = path.ty[i0] + (path.ty[i1] - path.ty[i0]) * t;
    outTgt.z = path.tz[i0] + (path.tz[i1] - path.tz[i0]) * t;
  }
}

/**
 * Wrap-aware linear sample of one scalar table at loop parameter u.
 *
 * @param {Float32Array} arr
 * @param {number} n
 * @param {number} u
 */
function _lerpWrap(arr, n, u) {
  let f = (u % 1) * n;
  if (f < 0) f += n;
  const i0 = Math.floor(f) % n;
  const i1 = (i0 + 1) % n;
  const t = f - Math.floor(f);
  return arr[i0] + (arr[i1] - arr[i0]) * t;
}

/**
 * Sample the speed profile at loop parameter u (multiples of mean speed).
 *
 * @param {TourPath} path
 * @param {number} u
 */
export function samplePathSpeed(path, u) {
  return _lerpWrap(path.speed, path.n, u);
}

/**
 * Sample the barrel-roll angle (radians; 0 outside the dive) at u.
 *
 * @param {TourPath} path
 * @param {number} u
 */
export function samplePathRoll(path, u) {
  return _lerpWrap(path.roll, path.n, u);
}

/**
 * Sample the dive gate (0 = on the orbit envelope, 1 = inside the bore).
 * Drives the renderer-side FOV push.
 *
 * @param {TourPath} path
 * @param {number} u
 */
export function samplePathDiveGate(path, u) {
  return _lerpWrap(path.dg, path.n, u);
}

/**
 * Sample the baked camera up-vector at loop parameter u (normalised on the
 * way out — adjacent samples are near-parallel so lerp + renormalise is
 * exact for all practical purposes). Carries the dive barrel roll, the
 * fly-by lift AND the pole guard, so feeding it straight to camera.up is
 * flip-proof by construction.
 *
 * @param {TourPath} path
 * @param {number} u
 * @param {{x:number,y:number,z:number}} out
 */
export function samplePathUp(path, u, out) {
  out.x = _lerpWrap(path.upx, path.n, u);
  out.y = _lerpWrap(path.upy, path.n, u);
  out.z = _lerpWrap(path.upz, path.n, u);
  const l = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= l;
  out.y /= l;
  out.z /= l;
}

/**
 * Loop parameter of the path sample closest to the given world position.
 * Used to aim the lead point near the camera on entry and on path swaps.
 *
 * @param {TourPath} path
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function nearestPathU(path, x, y, z) {
  const n = path.n;
  let bestK = 0;
  let bestD = Infinity;
  for (let k = 0; k < n; k++) {
    const dx = path.px[k] - x;
    const dy = path.py[k] - y;
    const dz = path.pz[k] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      bestK = k;
    }
  }
  return bestK / n;
}

/**
 * Fingerprint that captures the inputs that should trigger a rebuild:
 * event data (cells + fcal), slicer state, minimap rects, view level.
 * Two calls that produce the same string skip the rebuild even if the
 * heatmap listener fires (e.g. slider drag that didn't actually change
 * the visible set).
 *
 * @param {HeatEntry[]} cellEntries
 * @param {HeatEntry[]} fcalEntries
 * @param {any} slicerMask
 * @param {Rect[] | null} minimapRects
 * @param {number} viewLevel
 * @param {number} [sceneRotZ]  World-frame scene rotation (slicer alignment).
 */
export function pathFingerprint(
  cellEntries,
  fcalEntries,
  slicerMask,
  minimapRects,
  viewLevel,
  sceneRotZ = 0,
) {
  let count = 0;
  let totalE = 0;
  let etaSum = 0;
  let phiCos = 0;
  let phiSin = 0;
  const accum = (/** @type {HeatEntry[]} */ src) => {
    for (const e of src || []) {
      if (!e) continue;
      const en = Math.abs(e.energyMev || 0);
      if (en <= 0) continue;
      if (!Number.isFinite(e.eta) || !Number.isFinite(e.phi)) continue;
      count++;
      totalE += en;
      etaSum += e.eta * en;
      phiCos += Math.cos(e.phi) * en;
      phiSin += Math.sin(e.phi) * en;
    }
  };
  accum(cellEntries);
  accum(fcalEntries);

  const evtPart =
    count === 0 || totalE === 0
      ? 'empty'
      : `${count}|${Math.round(Math.log10(totalE) * 20)}|` +
        `${(etaSum / totalE).toFixed(2)}|` +
        `${Math.atan2(phiSin / totalE, phiCos / totalE).toFixed(2)}`;

  const slicerPart =
    !slicerMask || !slicerMask.active
      ? 'none'
      : `${slicerMask.phi.toFixed(2)}|${slicerMask.thetaLen.toFixed(2)}|` +
        `${slicerMask.zMin | 0}|${slicerMask.zMax | 0}`;

  const minimapPart =
    !minimapRects || !minimapRects.length
      ? 'none'
      : minimapRects
          .map(
            (r) =>
              `${r.etaMin.toFixed(2)},${r.etaMax.toFixed(2)},` +
              `${r.phiMin.toFixed(2)},${r.phiMax.toFixed(2)}`,
          )
          .join(';');

  const levelPart = Number.isFinite(viewLevel) ? `L${viewLevel | 0}` : 'L?';
  const rotPart = Number.isFinite(sceneRotZ) ? sceneRotZ.toFixed(2) : '0';
  return `${evtPart}#${slicerPart}#${minimapPart}#${levelPart}#R${rotPart}`;
}
