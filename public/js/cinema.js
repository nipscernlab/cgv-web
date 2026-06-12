import * as THREE from 'three';
import {
  extractPOIs,
  bakeTourPath,
  samplePathPoint,
  samplePathSpeed,
  samplePathUp,
  samplePathDiveGate,
  nearestPathU,
  filterPOIsBySlicer,
  filterPOIsByMinimap,
  pathFingerprint,
} from './cinema/tourPath.js';
import { replayCollision, cancelReplay } from './collisionReplay.js';

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

  // Coalesce repeated notifications: the first call arms a timer and later
  // calls ride on it (throttle, NOT a trailing debounce). Under a sustained
  // stream — a slicer-ball drag emits one notification per pointermove — a
  // trailing debounce never fires until the stream stops, so the whole
  // accumulated path change used to land as ONE big morph on release. The
  // throttle rebuilds every PATH_REBUILD_MS during the drag instead: a
  // chain of small C2 nudges that track the moving cut live. Burst sources
  // (an event load fires TILE/LAr/HEC/FCAL passes back-to-back) still
  // coalesce into a single rebuild, and the fingerprint check inside the
  // timer skips redundant rebuilds when the accumulated state is unchanged.
  const PATH_REBUILD_MS = 250;
  let _pathDebounceTimer = null;

  // ── Continuous camera follower ─────────────────────────────────────────────
  // No discrete blends or state machines. A critically-damped follower
  // (Unity-style SmoothDamp) chases a lead point that advances along the
  // baked path; the path's own speed profile supplies the dwell/cruise
  // dynamics. Path swaps (new XML, 1/2/3 switch, Et↔Energy, slicer/minimap
  // edits) are absorbed by a C2 "swap offset": at swap time the lead point's
  // displacement from the new path is captured and decayed to zero with a
  // smootherstep — the lead the follower sees is continuous through every
  // swap, so the camera never jumps and never whips. The camera part of the
  // offset lives in CYLINDRICAL coordinates around the beam axis (see the
  // swap-offset state below), so the morph orbits around the detector
  // instead of chording through it.
  //
  // TOUR_LOOP_MS is the duration of one full loop (the bake normalises its
  // speed profile so this holds whatever the dwell/cruise mix). 75 s pairs
  // with the slowed-down dive profile in tourPath.js: the dive takes the
  // extra time, leaving the outer orbit at roughly its old pace instead of
  // rushing to pay for it. FOLLOW_SMOOTH is the follower's time constant:
  // larger = smoother, more cinematic lag.
  const TOUR_LOOP_MS = 75_000;
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

  // Swap-offset state: lead = path(u) ⊕ offset · (1 − smootherstep(t)).
  // The camera offset is CYLINDRICAL around the beam axis (Δazimuth,
  // Δradius, Δz), applied by rotating/expanding the freshly sampled path
  // point — so when a slicer drag moves the arc to the other side of the
  // detector, the morph sweeps AROUND the envelope. The previous Cartesian
  // decay cut a straight chord through the calorimeter: a sudden direction
  // reversal plus a fly-through of solid cells. The look-target offset
  // stays Cartesian — it only steers the gaze, never the camera body.
  let _ofsPhi = 0;
  let _ofsRad = 0;
  let _ofsZ = 0;
  const _ofsTgt = new THREE.Vector3();
  let _ofsT0 = 0;
  let _ofsActive = false;
  // Below this radius the azimuth is numerically meaningless (deep in the
  // beam bore) — the residual collapses to radius/z there. Both paths sit
  // within ~1 m of the axis at such samples, so the xy mismatch this drops
  // is small and the follower absorbs it.
  const OFS_AXIS_R_MM = 1000;

  let exitRecentering = false;
  let exitT0 = 0;
  const _exitTgtFrom = new THREE.Vector3();

  // Beam-dive presentation state. The path bakes a per-sample up-vector
  // (world vertical + dive barrel roll + fly-by lift + pole guard — see
  // tourPath.js) and a dive gate; the tick applies them as camera.up and a
  // FOV push (speed sensation inside the bore). The gate is a pure function
  // of the loop parameter — identical across path swaps — but the up field
  // is NOT: parallel transport is a whole-loop solution, so every rebake
  // re-solves it and the new field at the same u can differ by a finite
  // roll. Feeding it straight to camera.up snap-rolled the entire scene on
  // every slicer-drag rebuild — the camera position glided through the
  // swap while the horizon teleported. camera.up therefore CHASES the
  // baked up with a bounded angular rate: a swap lands as a short banked
  // roll over a few hundred ms, while the dive's own slow barrel roll
  // (~0.3 rad/s) and the pole-guard bank pass through untouched, far below
  // the cap. The base FOV is captured once so exit always restores the
  // project default.
  const _fovBase = camera.fov;
  const FOV_DIVE_BOOST = 12;
  const UP_SLEW_RAD_S = 1.5;
  const _upCur = new THREE.Vector3(0, 1, 0);
  const _upTgt = new THREE.Vector3();
  const _upAxis = new THREE.Vector3();
  function _applyDivePresentation(u, dt) {
    samplePathUp(tourPath, u, _upTgt);
    const ang = _upCur.angleTo(_upTgt);
    const maxStep = UP_SLEW_RAD_S * dt;
    if (ang <= maxStep) {
      _upCur.copy(_upTgt);
    } else {
      _upAxis.crossVectors(_upCur, _upTgt);
      if (_upAxis.lengthSq() < 1e-12) {
        // Antiparallel ups (a true 180° disagreement): rotate around the
        // line of sight — a pure screen-space roll, the least jarring path.
        _upAxis.subVectors(_tgtPos, _camPos);
      }
      if (_upAxis.lengthSq() < 1e-12) {
        _upCur.copy(_upTgt); // degenerate geometry — just take the target
      } else {
        _upAxis.normalize();
        _upCur.applyAxisAngle(_upAxis, maxStep).normalize();
      }
    }
    camera.up.copy(_upCur);
    const g = samplePathDiveGate(tourPath, u);
    const fov = _fovBase + FOV_DIVE_BOOST * g;
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
  function _resetDivePresentation() {
    camera.up.set(0, 1, 0);
    _upCur.set(0, 1, 0);
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

  // Smallest signed angle equivalent of a (radians).
  function _wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  // Evaluate the effective lead (path sample ⊕ decaying swap offset) at the
  // current phase into _leadPos/_leadTgt. The cylindrical camera offset is
  // exact at s=1 (the lead is bit-identical at the swap instant) and zero at
  // s=0 (fully on the new path); in between the morph stays on a cylinder
  // surface that interpolates the two radii — never through the detector.
  function _sampleLead(now) {
    samplePathPoint(tourPath, _phase, _leadPos, _leadTgt);
    const s = _ofsScale(now);
    if (s > 0) {
      const r = Math.hypot(_leadPos.x, _leadPos.y);
      const a = Math.atan2(_leadPos.y, _leadPos.x) + _ofsPhi * s;
      const r2 = Math.max(0, r + _ofsRad * s);
      _leadPos.x = r2 * Math.cos(a);
      _leadPos.y = r2 * Math.sin(a);
      _leadPos.z += _ofsZ * s;
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

    // Advance the lead point. The baked speed profile slows it near hotspots
    // and cruises it through gaps; the profile is C∞ in u so the resulting
    // acceleration/deceleration is glassy by construction.
    _phase = (_phase + (dt * 1000 * samplePathSpeed(tourPath, _phase)) / TOUR_LOOP_MS) % 1;
    _sampleLead(now);

    _smoothDamp(_camPos, _leadPos, _camVel, FOLLOW_SMOOTH, dt);
    _smoothDamp(_tgtPos, _leadTgt, _tgtVel, FOLLOW_SMOOTH, dt);

    camera.position.copy(_camPos);
    controls.target.copy(_tgtPos);
    _applyDivePresentation(_phase, dt);
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
    // The up slew starts from wherever the camera's up is now, so entry
    // banks gently onto the path's up field instead of snapping to it.
    _upCur.copy(camera.up).normalize();
    _phase = nearestPathU(tourPath, camera.position.x, camera.position.y, camera.position.z);
    _ofsActive = false;
    _lastTickT = performance.now();
    exitRecentering = false;
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
      const r0 = Math.hypot(_leadPos.x, _leadPos.y);
      const r1 = Math.hypot(_tmpPos.x, _tmpPos.y);
      // Δazimuth always takes the short way around — consecutive small
      // drags accumulate in the drag's own direction, so the camera never
      // counter-swings. Skipped when either end is in the bore (azimuth
      // undefined there; see OFS_AXIS_R_MM).
      _ofsPhi =
        r0 > OFS_AXIS_R_MM && r1 > OFS_AXIS_R_MM
          ? _wrapAngle(Math.atan2(_leadPos.y, _leadPos.x) - Math.atan2(_tmpPos.y, _tmpPos.x))
          : 0;
      _ofsRad = r0 - r1;
      _ofsZ = _leadPos.z - _tmpPos.z;
      _ofsTgt.subVectors(_leadTgt, _tmpTgt);
      _ofsT0 = now;
      _ofsActive =
        Math.abs(_ofsPhi) * Math.max(r0, r1) +
          Math.abs(_ofsRad) +
          Math.abs(_ofsZ) +
          _ofsTgt.length() >
        1;
    } else {
      _ofsActive = false;
    }
    tourPath = newPath;
  }

  function _scheduleRebuild() {
    if (_pathDebounceTimer) return; // one already armed — coalesce
    _pathDebounceTimer = setTimeout(_rebuildNow, PATH_REBUILD_MS);
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

    _applyNewPath(bakeTourPath(pois, { rotZ, arc, zWindow }));
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
    // B2: open the show with the collision replay — a light front expands
    // from the vertex and the cells ignite as it crosses them.
    replayCollision();
  }

  function exitCinema() {
    cinemaMode = false;
    document.body.classList.remove('cinema');
    controls.autoRotate = false;
    document.getElementById('btn-cinema').classList.remove('on');
    cancelReplay();
    _restoreUserInput();
    // Exiting mid-dive must not leave a rolled horizon or a pushed FOV.
    _resetDivePresentation();
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
