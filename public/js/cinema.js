import * as THREE from 'three';
import {
  extractPOIs,
  buildTourCurves,
  buildFallbackCurves,
  filterPOIsBySlicer,
  filterPOIsByMinimap,
  pathFingerprint,
} from './cinema/tourPath.js';

export function setupCinemaControls({
  camera,
  canvas,
  controls,
  markDirty,
  clearOutline,
  hideTooltip,
  updateCollisionHud,
}) {
  let cinemaMode = false;
  let tourMode = localStorage.getItem('cgv-tour-mode') !== '0';

  // Safe-envelope fallback orbit: lives on r = 14 m at all azimuths, gentle
  // z-wave so the camera doesn't sit on the equator forever. Used until an
  // event is loaded and whenever the current event has too few POIs to drive
  // an adaptive path. Like the adaptive curves, it never crosses cells.
  const _fallback = buildFallbackCurves();
  const fallbackPosCurve = _fallback.posCurve;
  const fallbackTgtCurve = _fallback.tgtCurve;
  let tourPosCurve = fallbackPosCurve;
  let tourTgtCurve = fallbackTgtCurve;
  let _lastFingerprint = '';

  // Cached inputs that drive curve rebuilds. Each notifier slots its own
  // input into the cache and triggers the debounced recompute. The
  // fingerprint inside _rebuildNow then decides whether the curves actually
  // need to change. Slicer / minimap filters are read here (not by visibility
  // pipeline) because their effect on the tour is independent of how they
  // affect cell visibility.
  let _lastCells = /** @type {any[]} */ ([]);
  let _lastFcal = /** @type {any[]} */ ([]);
  let _lastSlicerMask = /** @type {any} */ (null);
  let _lastIsInsideWedge = /** @type {((x:number,y:number,z:number,m:any)=>boolean) | null} */ (
    null
  );
  let _lastMinimapRects = /** @type {any[] | null} */ (null);
  // View level (1=hits, 2=clusters, 3=particles). Always part of the
  // fingerprint so L2↔L3 transitions trigger a rebuild even when the
  // visible cell set happens to be identical between the two levels.
  let _lastViewLevel = 1;

  // Coalesce repeated notifications to a single rebuild ~250 ms after the
  // last call. The heatmap listener fires once per visibility pass, and an
  // event load triggers TILE/LAr/HEC/FCAL passes back-to-back. The
  // fingerprint check inside the timer skips redundant rebuilds when the
  // accumulated state ends up the same.
  const PATH_DEBOUNCE_MS = 250;
  let _pathDebounceTimer = null;

  // ── Continuous camera follower ─────────────────────────────────────────────
  // The whole point of the rewrite: there are NO discrete blends or state
  // machines any more. A critically-damped follower (Unity-style SmoothDamp)
  // chases a "lead point" that advances along the active curves at constant
  // arc-length speed. Because SmoothDamp is C1-continuous (position AND
  // velocity), every change — entering cinema, a new XML, a 1/2/3 mode switch,
  // Et↔Energy, a slider drag, slicer/minimap edits — is handled by simply
  // re-aiming the lead point. The camera eases to the new path from wherever
  // it currently is, at whatever velocity it currently has, so there is never
  // a jump or a velocity discontinuity (the old "solavanco").
  //
  // TOUR_LOOP_MS is how long one full loop of the curve takes; the lead point
  // is sampled by arc length (getPointAt) so the speed is uniform regardless
  // of how the control points are spaced. FOLLOW_SMOOTH is the follower's
  // time constant: larger = smoother / more cinematic lag, smaller = tighter
  // tracking. ~0.8 s gives a luxurious but responsive feel.
  const TOUR_LOOP_MS = 60_000;
  const FOLLOW_SMOOTH = 0.8;
  const TOUR_EXIT_DURATION = 1400;
  // Clamp per-frame dt so a long stall (hidden tab, GC pause) can't teleport
  // the lead point or blow up the follower on the first frame back.
  const MAX_DT = 0.05;

  let _phase = 0; // lead-point parameter u ∈ [0,1) along the active curves
  let _lastTickT = 0;
  const _camPos = new THREE.Vector3(); // smoothed camera position
  const _camVel = new THREE.Vector3(); // its velocity (units / s)
  const _tgtPos = new THREE.Vector3(); // smoothed look-at target
  const _tgtVel = new THREE.Vector3();
  const _spPos = new THREE.Vector3(); // current lead point (position curve)
  const _spTgt = new THREE.Vector3(); // current lead point (target curve)

  let tourExiting = false;
  let tourExitT0 = 0;

  // Critically-damped smoothing toward a (possibly moving) target. Mutates
  // `current` and `vel` in place; C1 across target changes. Per-component so
  // there are no per-frame Vector3 allocations.
  function _smoothDamp(current, target, vel, smoothTime, dt) {
    const st = Math.max(1e-4, smoothTime);
    const omega = 2 / st;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    for (const k of ['x', 'y', 'z']) {
      const change = current[k] - target[k];
      const temp = (vel[k] + omega * change) * dt;
      vel[k] = (vel[k] - omega * temp) * exp;
      current[k] = target[k] + (change + temp) * exp;
    }
  }

  // Arc-length nearest-U: scans the active position curve at uniform
  // ARC-LENGTH positions and returns the u of the closest sample to `v`. Used
  // to seed the lead point near the current camera on entry and on every curve
  // swap, so the lead point never jumps far from where the camera already is.
  function _nearestU(v) {
    const samples = 240;
    let bestU = 0;
    let bestD = Infinity;
    for (let i = 0; i < samples; i++) {
      const u = i / samples;
      tourPosCurve.getPointAt(u, _spPos);
      const d = _spPos.distanceToSquared(v);
      if (d < bestD) {
        bestD = d;
        bestU = u;
      }
    }
    return bestU;
  }

  // ── Inner-detector look overrides (kept from the original design) ───────────
  // When a curve dips into the on-axis corridor (camera x/y near the beam
  // line) the look direction is forced parallel to ±Z and the screen rolls 90°
  // around the beam axis, so traversing the calo reads as "flying down the
  // beam pipe" rather than staring at the inner wall. The safe-envelope curves
  // normally stay on the r = 14 m cylinder where these gates evaluate to 0, so
  // this is inert for the default tour — it only kicks in if a future curve
  // actually approaches the axis. All gates are smoothstep (C1), so even then
  // there is no discontinuity.
  const TRAVERSAL_X_FULL = 100;
  const TRAVERSAL_X_OFF = 800;
  const TRAVERSAL_Y_FULL = 50;
  const TRAVERSAL_Y_OFF = 400;
  const TRAVERSAL_TARGET_FAR = 10000;
  const ROLL_CYL_HALF_LEN_MM = 6000;
  const ROLL_RAMP_MM = 1500;
  const _tourOverrideTgt = new THREE.Vector3();
  const _UP_OUTSIDE = new THREE.Vector3(0, 1, 0);
  const _UP_INSIDE = new THREE.Vector3(1, 0, 0);
  function _smoothBlend01(v, fullBelow, offAbove) {
    if (v <= fullBelow) return 1;
    if (v >= offAbove) return 0;
    const t = (v - fullBelow) / (offAbove - fullBelow);
    return 1 - t * t * (3 - 2 * t);
  }
  function _zRollBlend(z) {
    const az = Math.abs(z);
    if (az >= ROLL_CYL_HALF_LEN_MM) return 0;
    if (az <= ROLL_CYL_HALF_LEN_MM - ROLL_RAMP_MM) return 1;
    const t = (ROLL_CYL_HALF_LEN_MM - az) / ROLL_RAMP_MM;
    return t * t * (3 - 2 * t);
  }
  // Gates are evaluated on the SMOOTHED camera position (posVec) so they stay
  // continuous across curve swaps; the (possibly overridden) look target is
  // written into tgtVec, which the follower then eases toward.
  function _applyTraversalOverride(posVec, tgtVec) {
    const xBlend = _smoothBlend01(Math.abs(posVec.x), TRAVERSAL_X_FULL, TRAVERSAL_X_OFF);
    const yBlend = _smoothBlend01(posVec.y, TRAVERSAL_Y_FULL, TRAVERSAL_Y_OFF);
    const onAxisBlend = xBlend * yBlend;

    const rollBlend = _zRollBlend(posVec.z) * onAxisBlend;
    camera.up.lerpVectors(_UP_OUTSIDE, _UP_INSIDE, rollBlend).normalize();

    if (onAxisBlend <= 0) return;
    const sign = posVec.z >= 0 ? -1 : 1;
    _tourOverrideTgt.set(0, 0, sign * TRAVERSAL_TARGET_FAR);
    tgtVec.lerp(_tourOverrideTgt, onAxisBlend);
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(MAX_DT, Math.max(1e-4, (now - _lastTickT) / 1000));
    _lastTickT = now;

    // Exit: let the camera coast on its last follower velocity, decaying to a
    // stop, then hand control back to OrbitControls. Continuous with the tour
    // motion because _camVel/_tgtVel carry the live velocity at exit time.
    if (tourExiting) {
      const et = now - tourExitT0;
      if (et >= TOUR_EXIT_DURATION) {
        tourExiting = false;
        return;
      }
      const decay = Math.pow(1 - et / TOUR_EXIT_DURATION, 2);
      camera.position.addScaledVector(_camVel, decay * dt);
      controls.target.addScaledVector(_tgtVel, decay * dt);
      controls.update();
      markDirty();
      return;
    }

    if (!cinemaMode || !tourMode) return;

    // Advance the lead point by arc length at constant speed.
    _phase = (_phase + (dt * 1000) / TOUR_LOOP_MS) % 1;
    tourPosCurve.getPointAt(_phase, _spPos);
    tourTgtCurve.getPointAt(_phase, _spTgt);

    // Follow position, then gate the look-target override on the smoothed
    // position, then follow the target. This ordering keeps the up-vector and
    // target override continuous even across a curve swap.
    _smoothDamp(_camPos, _spPos, _camVel, FOLLOW_SMOOTH, dt);
    _applyTraversalOverride(_camPos, _spTgt);
    _smoothDamp(_tgtPos, _spTgt, _tgtVel, FOLLOW_SMOOTH, dt);

    camera.position.copy(_camPos);
    controls.target.copy(_tgtPos);
    controls.update();
    markDirty();
  }

  // Seed the follower from the camera's current pose and aim the lead point at
  // the nearest point on the active curve. The follower then eases in from
  // exactly where the user left the camera — no jump on entry, and the same
  // routine re-seeds after a curve swap so live path changes are seamless too.
  function _seedFollower() {
    _camPos.copy(camera.position);
    _tgtPos.copy(controls.target);
    _camVel.set(0, 0, 0);
    _tgtVel.set(0, 0, 0);
    _phase = _nearestU(camera.position);
    _lastTickT = performance.now();
    tourExiting = false;
  }

  // Curve swap: keep the follower's live position/velocity, just re-aim the
  // lead point at the nearest point on the NEW curve. Because nearest-U is, by
  // definition, close to where the camera already is, the lead point barely
  // moves and the follower carries on smoothly — no blend needed.
  function _applyNewCurves(newPosCurve, newTgtCurve) {
    tourPosCurve = newPosCurve;
    tourTgtCurve = newTgtCurve;
    if (cinemaMode && tourMode) {
      _phase = _nearestU(_camPos.lengthSq() > 0 ? _camPos : camera.position);
    }
  }

  function _scheduleRebuild() {
    if (_pathDebounceTimer) clearTimeout(_pathDebounceTimer);
    _pathDebounceTimer = setTimeout(_rebuildNow, PATH_DEBOUNCE_MS);
  }

  function _rebuildNow() {
    _pathDebounceTimer = null;
    const fp = pathFingerprint(
      _lastCells,
      _lastFcal,
      _lastSlicerMask,
      _lastMinimapRects,
      _lastViewLevel,
    );
    if (fp === _lastFingerprint) return;
    _lastFingerprint = fp;

    let pois = extractPOIs(_lastCells, _lastFcal);
    // POI filters: slicer drops POIs whose 3D centre is in the hidden
    // wedge; minimap drops POIs outside the user-defined rects. Either
    // can leave fewer than 2 POIs, which falls back to the safe orbit.
    if (_lastSlicerMask && _lastIsInsideWedge) {
      pois = filterPOIsBySlicer(pois, _lastSlicerMask, _lastIsInsideWedge);
    }
    if (_lastMinimapRects) {
      pois = filterPOIsByMinimap(pois, _lastMinimapRects);
    }

    const built = pois.length >= 2 ? buildTourCurves(pois) : null;
    if (built) {
      _applyNewCurves(built.posCurve, built.tgtCurve);
    } else {
      // No usable POIs — use the safe-envelope fallback so the tour keeps
      // moving (and so a freshly-entered cinema on an empty scene still orbits).
      _applyNewCurves(fallbackPosCurve, fallbackTgtCurve);
    }
  }

  // Force the curves to reflect the current inputs RIGHT NOW (used on entry so
  // we never start on the fallback and swap a frame later). Cancels any pending
  // debounce and rebuilds synchronously; a no-op if the fingerprint is current.
  function _rebuildSyncForEntry() {
    if (_pathDebounceTimer) {
      clearTimeout(_pathDebounceTimer);
      _pathDebounceTimer = null;
    }
    _rebuildNow();
  }

  /**
   * Heatmap-listener entry point. The visibility pipeline pushes its
   * pre-region cell set here after every refresh. Stored cells/fcal feed
   * the next rebuild; the rebuild itself is debounced + fingerprinted to
   * avoid 60-Hz churn during slider drags.
   *
   * @param {{cells?: any[], fcal?: any[]}} data
   */
  function updateTourFromEvent({ cells, fcal } = {}) {
    _lastCells = cells || [];
    _lastFcal = fcal || [];
    _scheduleRebuild();
  }

  /**
   * Called when the slicer is enabled, disabled, or its mask moves.
   * mask is the live state object from slicer.getMaskState(); isInside is
   * the slicer.isPointInsideWedge function (a free fn that takes (x,y,z,mask)).
   * Passing both keeps the cinema decoupled from the slicer module.
   *
   * @param {any} mask
   * @param {((x:number,y:number,z:number,m:any)=>boolean) | null} isInside
   */
  function notifySlicerChanged(mask, isInside) {
    _lastSlicerMask = mask || null;
    _lastIsInsideWedge = typeof isInside === 'function' ? isInside : null;
    _scheduleRebuild();
  }

  /**
   * Called when the minimap rectangles change. regions is the array of
   * {etaMin,etaMax,phiMin,phiMax} rects returned by getMinimapRegion(),
   * or null when no rects are active.
   *
   * @param {any[] | null} regions
   */
  function notifyMinimapChanged(regions) {
    _lastMinimapRects = Array.isArray(regions) && regions.length ? regions : null;
    _scheduleRebuild();
  }

  /**
   * Called when the view level switches between 1 / 2 / 3. The level itself
   * doesn't change POI positions but is folded into the fingerprint so
   * L2↔L3 transitions force a rebuild even when the cell set is identical
   * between the two — keeps rule "recompute on every mode change" honest.
   *
   * @param {number} level
   */
  function notifyViewLevelChanged(level) {
    if (!Number.isFinite(level)) return;
    _lastViewLevel = level | 0;
    _scheduleRebuild();
  }

  function startTour() {
    _rebuildSyncForEntry();
    controls.autoRotate = false;
    _seedFollower();
  }

  function enterCinema() {
    cinemaMode = true;
    document.body.classList.add('cinema');
    document.getElementById('btn-cinema').classList.add('on');
    clearOutline();
    hideTooltip();
    tourExiting = false;
    updateCollisionHud();
    if (tourMode) {
      startTour();
    } else {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
    }
  }

  function exitCinema() {
    const wasTour = cinemaMode && tourMode;
    cinemaMode = false;
    document.body.classList.remove('cinema');
    controls.autoRotate = false;
    document.getElementById('btn-cinema').classList.remove('on');
    updateCollisionHud();
    // The traversal override may have rolled camera.up around the beam
    // axis; restore the project-default world-up so post-cinema navigation
    // doesn't carry the roll over.
    camera.up.set(0, 1, 0);
    if (wasTour) {
      tourExiting = true;
      tourExitT0 = performance.now();
      _lastTickT = tourExitT0;
    }
  }

  function resetCamera() {
    camera.position.set(0, 0, 12_000);
    controls.target.set(0, 0, 0);
    controls.update();
    markDirty();
  }

  function disableTourMode() {
    tourMode = false;
    if (cinemaMode) {
      tourExiting = false;
      camera.up.set(0, 1, 0);
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
    }
  }

  function enableTourMode() {
    tourMode = true;
    if (cinemaMode) startTour();
  }

  document.getElementById('btn-cinema').addEventListener('click', () => {
    if (cinemaMode) exitCinema();
    else enterCinema();
  });
  document.getElementById('cinema-exit').addEventListener('click', exitCinema);

  let dragged = false;
  canvas.addEventListener('mousedown', () => {
    dragged = false;
  });
  canvas.addEventListener('mousemove', () => {
    dragged = true;
  });
  canvas.addEventListener('mouseup', () => {
    if (cinemaMode && !dragged) exitCinema();
  });

  return {
    tick,
    enterCinema,
    exitCinema,
    resetCamera,
    isAnimating: () => cinemaMode || tourExiting,
    isCinemaMode: () => cinemaMode,
    isTourMode: () => tourMode,
    disableTourMode,
    enableTourMode,
    updateTourFromEvent,
    notifySlicerChanged,
    notifyMinimapChanged,
    notifyViewLevelChanged,
  };
}
