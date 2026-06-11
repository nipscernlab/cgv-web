import * as THREE from 'three';
import {
  extractPOIs,
  bakeTourPath,
  samplePathPoint,
  samplePathSpeed,
  samplePathRollSC,
  samplePathDiveGate,
  nearestPathU,
  filterPOIsBySlicer,
  filterPOIsByMinimap,
  pathFingerprint,
  DIVE_U0,
  DIVE_U1,
  DIVE_UP_LIFT,
} from './cinema/tourPath.js';

export function setupCinemaControls({
  camera,
  canvas,
  controls,
  markDirty,
  clearOutline,
  hideTooltip,
  updateCollisionHud,
  // Reads scene.rotation.z at rebuild time. The slicer rotates the whole
  // scene so its wedge opening faces +X; the tour path lives in world
  // coordinates, so every bake must fold this angle in or the camera stares
  // at the wrong side of the detector. A getter (not a value) because the
  // rotation is applied after the mask notification that schedules the
  // rebuild — by the time the debounce fires, the getter sees the final
  // rotation.
  getSceneRotationZ,
}) {
  let cinemaMode = false;
  let tourMode = true; // defaults ON; overridden by the saved preference below
  try {
    tourMode = localStorage.getItem('cgv-tour-mode') !== '0';
  } catch (_) {}

  // Active baked path (Float32Array LUTs from tourPath.js). Starts as the
  // empty-event default orbit; every rebuild swaps in a fresh bake. See
  // _applyNewPath for how swaps stay perfectly smooth.
  let tourPath = bakeTourPath([]);
  let _lastFingerprint = '';

  // Cached inputs that drive path rebuilds. Each notifier slots its own
  // input into the cache and triggers the debounced recompute. The
  // fingerprint inside _rebuildNow then decides whether the path actually
  // needs to change. Slicer / minimap filters are read here (not by the
  // visibility pipeline) because their effect on the tour is independent of
  // how they affect cell visibility.
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
  // No discrete blends or state machines. A critically-damped follower
  // (Unity-style SmoothDamp) chases a lead point that advances along the
  // baked path; the path's own speed profile supplies the dwell/cruise
  // dynamics. Path swaps (new XML, 1/2/3 switch, Et↔Energy, slicer/minimap
  // edits) are absorbed by a C2 "swap offset": at swap time the lead point's
  // displacement from the new path is captured and decayed to zero with a
  // smootherstep — the lead the follower sees is continuous through every
  // swap, so the camera never jumps and never whips.
  //
  // TOUR_LOOP_MS is the duration of one full loop (the bake normalises its
  // speed profile so this holds whatever the dwell/cruise mix). FOLLOW_SMOOTH
  // is the follower's time constant: larger = smoother, more cinematic lag.
  // 72 s per loop: the dive runs deliberately slow (its speed profile sits
  // well below the orbit cruise — the bore passage is the set piece), and
  // the loop-time normalisation would otherwise push the outer orbit
  // noticeably faster — the extra seconds keep the orbit unhurried.
  const TOUR_LOOP_MS = 72_000;
  const FOLLOW_SMOOTH = 0.8;
  // Exit recentering: the camera is left exactly where the tour put it, and
  // only the orbit target glides to the detector centre (scene origin) so
  // post-cinema navigation pivots around the geometry — unlike the reset
  // button, which also repositions the camera.
  const EXIT_RECENTER_MS = 900;
  const SWAP_BLEND_MS = 2200;
  // Clamp per-frame dt so a long stall (hidden tab, GC pause) can't teleport
  // the lead point or blow up the follower on the first frame back.
  const MAX_DT = 0.05;

  let _phase = 0; // lead-point parameter u ∈ [0,1) along the active path
  let _lastTickT = 0;
  const _camPos = new THREE.Vector3(); // smoothed camera position
  const _camVel = new THREE.Vector3(); // its velocity (units / s)
  const _tgtPos = new THREE.Vector3(); // smoothed look-at target
  const _tgtVel = new THREE.Vector3();
  const _leadPos = new THREE.Vector3(); // current lead point (camera table)
  const _leadTgt = new THREE.Vector3(); // current lead point (target table)
  const _tmpPos = new THREE.Vector3();
  const _tmpTgt = new THREE.Vector3();

  // Swap-offset state: lead = path(u) + offset · (1 − smootherstep(t)).
  const _ofsPos = new THREE.Vector3();
  const _ofsTgt = new THREE.Vector3();
  let _ofsT0 = 0;
  let _ofsActive = false;

  let exitRecentering = false;
  let exitT0 = 0;
  const _exitTgtFrom = new THREE.Vector3();

  // ── Runtime view guard ─────────────────────────────────────────────────────
  // The baked path keeps every SAMPLE's line of sight clear of the up axis,
  // but the follower's smoothing lag mixes nearby samples — most visibly on
  // the dive's entry/exit spirals, where the smoothed camera cuts the
  // corner and the actual view can sweep right past ±up (the lookAt flip).
  // This guard watches the REAL smoothed view every frame: as its alignment
  // with the current up approaches 1, a vertical offset is added to the
  // rendered camera position (never to the follower state), restoring the
  // camera↔target z-separation that keeps lookAt stable. The offset target
  // is an open-loop function of the unlifted geometry (no feedback hunting)
  // and the offset itself is critically damped, so the correction is as
  // glassy as the rest of the motion. The push direction is latched per
  // engagement so it can't dither mid-correction.
  const VIEW_GUARD_ON = 0.86;
  const VIEW_GUARD_FULL = 0.96;
  const VIEW_GUARD_LIFT_MM = 6000;
  const VIEW_GUARD_SMOOTH = 0.4;
  const _rollSC = { s: 0, c: 1 };
  let _guardLift = 0;
  let _guardLiftVel = 0;
  let _guardSign = 0;
  function _resetViewGuard() {
    _guardLift = 0;
    _guardLiftVel = 0;
    _guardSign = 0;
  }

  // Beam-dive presentation state. The path bakes a barrel-roll angle and a
  // dive gate per sample; the tick applies them as the camera up-vector and
  // a gentle FOV push (speed sensation inside the bore). Both are exact
  // functions of the loop parameter — identical across path swaps — so they
  // need no smoothing of their own. Up stays world-vertical outside the
  // dive; the lookAt pole degeneracy is avoided geometrically by the gaze
  // pole clearance baked into the path (tourPath.js), not by steering the
  // up. The base FOV is captured once so exit always restores the default.
  const _fovBase = camera.fov;
  const FOV_DIVE_BOOST = 12;
  function _resetDivePresentation() {
    camera.up.set(0, 1, 0);
    if (camera.fov !== _fovBase) {
      camera.fov = _fovBase;
      camera.updateProjectionMatrix();
    }
  }

  // OrbitControls input is suspended while the tour drives the camera —
  // otherwise a stray drag fights the follower frame-by-frame and judders.
  // Tracked with a flag so we never clobber another module's (slicer's)
  // own enable/disable cycle.
  let _inputSuspendedByTour = false;
  function _suspendUserInput() {
    if (controls.enabled && !_inputSuspendedByTour) {
      controls.enabled = false;
      _inputSuspendedByTour = true;
    }
  }
  function _restoreUserInput() {
    if (_inputSuspendedByTour) {
      controls.enabled = true;
      _inputSuspendedByTour = false;
    }
  }

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

  // C2 ease (zero first AND second derivative at both ends) used for the
  // swap-offset decay, so even the acceleration is continuous through swaps.
  function _smootherstep01(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return t * t * t * (t * (6 * t - 15) + 10);
  }

  // Remaining fraction of the swap offset at `now` (1 → just swapped,
  // 0 → fully on the new path). Deactivates itself when done.
  function _ofsScale(now) {
    if (!_ofsActive) return 0;
    const bt = (now - _ofsT0) / SWAP_BLEND_MS;
    if (bt >= 1) {
      _ofsActive = false;
      return 0;
    }
    return 1 - _smootherstep01(bt);
  }

  // Evaluate the effective lead (path sample + decaying swap offset) at the
  // current phase into _leadPos/_leadTgt.
  function _sampleLead(now) {
    samplePathPoint(tourPath, _phase, _leadPos, _leadTgt);
    const s = _ofsScale(now);
    if (s > 0) {
      _leadPos.addScaledVector(_ofsPos, s);
      _leadTgt.addScaledVector(_ofsTgt, s);
    }
  }

  function tick() {
    const now = performance.now();
    const dt = Math.min(MAX_DT, Math.max(1e-4, (now - _lastTickT) / 1000));
    _lastTickT = now;

    // Exit: hold the camera exactly where it is and glide the orbit target
    // to the scene origin (smootherstep — starts and ends at rest), so the
    // geometry pans to the centre of the view and post-cinema orbiting
    // pivots around it. Then hand control back to OrbitControls.
    if (exitRecentering) {
      const et = (now - exitT0) / EXIT_RECENTER_MS;
      if (et >= 1) {
        exitRecentering = false;
        controls.target.set(0, 0, 0);
      } else {
        controls.target.copy(_exitTgtFrom).multiplyScalar(1 - _smootherstep01(et));
      }
      controls.update();
      markDirty();
      return;
    }

    if (!cinemaMode || !tourMode) return;

    // The slicer's gizmo drags toggle controls.enabled on their own; if one
    // re-enabled input behind our back mid-tour, re-suspend it so a stray
    // wheel/drag can't fight the follower.
    if (_inputSuspendedByTour && controls.enabled) controls.enabled = false;

    // Apply a parked dive-reversing swap once the camera is back on the
    // envelope (see _requestPathSwap).
    if (_pendingPath && (_phase <= _SWAP_DEFER_LO || _phase >= _SWAP_DEFER_HI)) {
      _applyNewPath(_pendingPath);
      _pendingPath = null;
    }

    // Advance the lead point. The baked speed profile slows it near hotspots
    // and cruises it through gaps; the profile is C∞ in u so the resulting
    // acceleration/deceleration is glassy by construction.
    _phase = (_phase + (dt * 1000 * samplePathSpeed(tourPath, _phase)) / TOUR_LOOP_MS) % 1;
    _sampleLead(now);

    _smoothDamp(_camPos, _leadPos, _camVel, FOLLOW_SMOOTH, dt);
    _smoothDamp(_tgtPos, _leadTgt, _tgtVel, FOLLOW_SMOOTH, dt);

    // Up vector + dive gate for this frame (also feeds the view guard).
    // Roll comes as a lerped (sin, cos) pair — see samplePathRollSC.
    samplePathRollSC(tourPath, _phase, _rollSC);
    const diveG = samplePathDiveGate(tourPath, _phase);
    let upX = _rollSC.s;
    let upY = _rollSC.c;
    let upZ = DIVE_UP_LIFT * diveG;
    const upL = Math.hypot(upX, upY, upZ) || 1;
    upX /= upL;
    upY /= upL;
    upZ /= upL;

    // Runtime view guard (see VIEW_GUARD_* above): alignment of the actual
    // smoothed view with the up, mapped to a vertical camera offset. The
    // push side is latched on engagement (full force even when camera and
    // target sit at the same height — the worst spot) and re-latched
    // whenever the geometry has clearly picked a side, so it can't go
    // stale across a mid-engagement crossing.
    const vgx = _tgtPos.x - _camPos.x;
    const vgy = _tgtPos.y - _camPos.y;
    const vgz = _tgtPos.z - _camPos.z;
    const vgl = Math.hypot(vgx, vgy, vgz) || 1;
    const aView = Math.abs((vgx * upX + vgy * upY + vgz * upZ) / vgl);
    let liftTarget = 0;
    if (aView > VIEW_GUARD_ON) {
      const dzNow = _camPos.z - _tgtPos.z;
      if (_guardSign === 0) _guardSign = dzNow >= 0 ? 1 : -1;
      else if (Math.abs(dzNow) > 1500) _guardSign = dzNow > 0 ? 1 : -1;
      // Masked by RADIUS: full strength on the envelope (any z is safe out
      // there) and on the beam axis (a z-shift stays inside the free bore
      // corridor) — but zero through the dive's approach radii, where a
      // vertical shove is exactly how a path ends up inside calo cells.
      const rr = Math.hypot(_camPos.x, _camPos.y);
      const boreW = 1 - _smootherstep01((rr - 300) / 1200);
      const envW = _smootherstep01((rr - 9500) / 2500);
      liftTarget =
        _guardSign *
        VIEW_GUARD_LIFT_MM *
        Math.min(1, boreW + envW) *
        _smootherstep01((aView - VIEW_GUARD_ON) / (VIEW_GUARD_FULL - VIEW_GUARD_ON));
    } else if (Math.abs(_guardLift) < 1) {
      _guardSign = 0;
    }
    {
      // Asymmetric damping: when the wanted lift has flipped sides (the
      // camera crossed its target's z mid-engagement — routine on reversed
      // dive entries), a stale same-side lift would PUSH the view INTO the
      // pole. Cross through zero quickly; settle gently otherwise.
      const crossing = liftTarget * _guardLift < 0;
      const omega = 2 / (crossing ? 0.12 : VIEW_GUARD_SMOOTH);
      const x = omega * dt;
      const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const change = _guardLift - liftTarget;
      const temp = (_guardLiftVel + omega * change) * dt;
      _guardLiftVel = (_guardLiftVel - omega * temp) * exp;
      const prevLift = _guardLift;
      _guardLift = liftTarget + (change + temp) * exp;
      // Hard rate cap on the rendered offset itself — the correction must
      // read as a gentle drift, never a dart, fast zero-crossings included.
      const maxStep = 5000 * dt;
      if (_guardLift > prevLift + maxStep) _guardLift = prevLift + maxStep;
      else if (_guardLift < prevLift - maxStep) _guardLift = prevLift - maxStep;
      if (_guardLiftVel > 5000) _guardLiftVel = 5000;
      else if (_guardLiftVel < -5000) _guardLiftVel = -5000;
    }

    camera.position.set(_camPos.x, _camPos.y, _camPos.z + _guardLift);
    controls.target.copy(_tgtPos);
    camera.up.set(upX, upY, upZ);
    const fov = _fovBase + FOV_DIVE_BOOST * diveG;
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    controls.update();
    markDirty();
  }

  // Seed the follower from the camera's current pose and aim the lead point at
  // the nearest point on the active path. The follower then eases in from
  // exactly where the user left the camera — starting from zero velocity, so
  // entry is a gentle pull onto the orbit, never a jump.
  function _seedFollower() {
    _camPos.copy(camera.position);
    _tgtPos.copy(controls.target);
    _camVel.set(0, 0, 0);
    _tgtVel.set(0, 0, 0);
    _phase = nearestPathU(tourPath, camera.position.x, camera.position.y, camera.position.z);
    _ofsActive = false;
    _lastTickT = performance.now();
    exitRecentering = false;
    _resetViewGuard();
  }

  // Path swap. The phase is left UNTOUCHED: the new path is sampled at the
  // same u, and whatever displacement that introduces is captured in the
  // swap offset and decayed over SWAP_BLEND_MS with a C2 ease. The effective
  // lead is therefore bit-identical at the swap instant and morphs onto the
  // new path over the blend — the camera never stalls and never jumps.
  // (Re-aiming the phase at the camera here was the cause of the recurring
  // hiccup: it dropped the lead point onto the camera, zeroing the follower
  // error, so the camera braked and re-accelerated on every rebuild — once
  // per XML load, slider pause, or slicer edit.) Repeated swaps are safe:
  // the offset is recomputed from the current effective lead each time.
  function _applyNewPath(newPath) {
    const now = performance.now();
    if (cinemaMode && tourMode && !exitRecentering) {
      _sampleLead(now); // effective lead on the OLD path, into _leadPos/_leadTgt
      samplePathPoint(newPath, _phase, _tmpPos, _tmpTgt);
      _ofsPos.subVectors(_leadPos, _tmpPos);
      _ofsTgt.subVectors(_leadTgt, _tmpTgt);
      _ofsT0 = now;
      _ofsActive = _ofsPos.lengthSq() + _ofsTgt.lengthSq() > 1;
    } else {
      _ofsActive = false;
    }
    tourPath = newPath;
  }

  // A swap that REVERSES the dive direction while the camera is inside (or
  // entering) the dive window would morph it from one end of the bore to
  // the other — a violent multi-metre glide. Such swaps are parked here and
  // applied by tick() the moment the camera is back on the envelope; all
  // other swaps go through immediately.
  let _pendingPath = null;
  const _SWAP_DEFER_LO = DIVE_U0 - 0.04;
  const _SWAP_DEFER_HI = DIVE_U1 + 0.02;
  function _requestPathSwap(newPath) {
    const touring = cinemaMode && tourMode && !exitRecentering;
    const inDiveZone = touring && _phase > _SWAP_DEFER_LO && _phase < _SWAP_DEFER_HI;
    if (inDiveZone && newPath.diveSign !== tourPath.diveSign) {
      _pendingPath = newPath;
      return;
    }
    _pendingPath = null;
    _applyNewPath(newPath);
  }

  function _scheduleRebuild() {
    if (_pathDebounceTimer) clearTimeout(_pathDebounceTimer);
    _pathDebounceTimer = setTimeout(_rebuildNow, PATH_DEBOUNCE_MS);
  }

  // Openings wider than this leave too little outer wall to matter — the
  // full orbit is better than an enormous pendulum.
  const ARC_FULL_ORBIT_THETA = 4.6;

  function _rebuildNow() {
    _pathDebounceTimer = null;
    const rotZ = (typeof getSceneRotationZ === 'function' && getSceneRotationZ()) || 0;
    const fp = pathFingerprint(
      _lastCells,
      _lastFcal,
      _lastSlicerMask,
      _lastMinimapRects,
      _lastViewLevel,
      rotZ,
    );
    if (fp === _lastFingerprint) return;
    _lastFingerprint = fp;

    let pois = extractPOIs(_lastCells, _lastFcal);
    // POI filters: slicer drops POIs whose 3D centre is in the hidden
    // wedge; minimap drops POIs outside the user-defined rects. The bake
    // handles any remaining count, down to zero (default orbit).
    if (_lastSlicerMask && _lastIsInsideWedge) {
      pois = filterPOIsBySlicer(pois, _lastSlicerMask, _lastIsInsideWedge);
    }
    if (_lastMinimapRects) {
      pois = filterPOIsByMinimap(pois, _lastMinimapRects);
    }

    // Slicer-aware tour: confine the camera to a pendulum sweep across the
    // wedge OPENING (the cut region — its cells are hidden, so the camera
    // looks through it into the interior and at the cut faces) instead of
    // orbiting past the solid TILE-only outer wall. The wedge angles are
    // scene-frame; adding rotZ lands them in world azimuth wherever the
    // user has rotated the cut. The z window keeps the camera level with
    // the opening's extent.
    const m = _lastSlicerMask;
    let arc = null;
    let zWindow = null;
    if (m && m.active && !m.emptyTh && !m.fullTh && m.thetaLen <= ARC_FULL_ORBIT_THETA) {
      const halfRaw = m.thetaLen / 2;
      const margin = Math.max(0.08, halfRaw * 0.18);
      arc = {
        center: m.phi + halfRaw + rotZ,
        halfWidth: Math.max(0.12, halfRaw - margin),
      };
      zWindow = { min: m.zMin, max: m.zMax };
    }

    _requestPathSwap(bakeTourPath(pois, { rotZ, arc, zWindow, prevDiveSign: tourPath.diveSign }));
  }

  // Force the path to reflect the current inputs RIGHT NOW (used on entry so
  // we never start on a stale orbit and swap a frame later). Cancels any
  // pending debounce and rebuilds synchronously; a no-op if the fingerprint
  // is current.
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
    // A swap parked by the dive-reversal deferral must not survive entry —
    // the follower is being re-seeded anyway, so apply it outright.
    if (_pendingPath) {
      _applyNewPath(_pendingPath);
      _pendingPath = null;
    }
    controls.autoRotate = false;
    _seedFollower();
    _suspendUserInput();
  }

  function enterCinema() {
    cinemaMode = true;
    document.body.classList.add('cinema');
    document.getElementById('btn-cinema').classList.add('on');
    clearOutline();
    hideTooltip();
    exitRecentering = false;
    updateCollisionHud();
    if (tourMode) {
      startTour();
    } else {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.55;
    }
  }

  function exitCinema() {
    cinemaMode = false;
    document.body.classList.remove('cinema');
    controls.autoRotate = false;
    document.getElementById('btn-cinema').classList.remove('on');
    _restoreUserInput();
    // Exiting mid-dive must not leave a rolled horizon or a pushed FOV.
    // The view-guard lift stays baked into the rendered camera position
    // (no pop); only its state is cleared.
    _resetDivePresentation();
    _resetViewGuard();
    updateCollisionHud();
    // Always recenter on exit: keep the camera exactly where it is and bring
    // the orbit target (scene centre) back onto the geometry centre. Skipped
    // when the target is already there (nothing to animate).
    if (controls.target.lengthSq() > 1) {
      _exitTgtFrom.copy(controls.target);
      exitRecentering = true;
      exitT0 = performance.now();
      _lastTickT = exitT0;
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
      exitRecentering = false;
      _restoreUserInput();
      _resetDivePresentation();
      _resetViewGuard();
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
    // A new interaction takes over immediately — don't fight the user for
    // the orbit target if they grab the scene mid-recenter.
    exitRecentering = false;
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
    isAnimating: () => cinemaMode || exitRecentering,
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
