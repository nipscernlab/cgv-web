// Hover-driven inner-detector hit overlay.
//
// When the user mouses over a track line, this module looks up that track's
// pixel hits (via line.userData.hitIds) in the positions map populated by
// hitsParser, and renders one small marker sphere at each hit's position.
// Markers vanish as soon as the cursor leaves the track or the canvas.
//
// Costs are bounded — a CombinedInDetTracks line carries ~6 pixel hits in
// typical events, so we just rebuild a fresh small Group per hover. No need
// for InstancedMesh.

import * as THREE from 'three';
import { scene, markDirty } from './renderer.js';

// Solid white sphere — bright enough to read against any palette colour the
// underlying track might be painted with (yellow / orange / red / green).
// Per-frame onBeforeRender rescales the geometry so each hit has a constant
// HIT_TARGET_PX radius on screen regardless of camera distance — no growing
// blobs up close, no vanishing dots in long shots.
const HIT_BASE_RADIUS_MM = 8;
const HIT_TARGET_PX = 2;
const _HIT_GEO = new THREE.SphereGeometry(HIT_BASE_RADIUS_MM, 8, 6);
const _HIT_MAT = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.95,
  depthTest: false,
  depthWrite: false,
});

const _tmpVec2 = new THREE.Vector2();
function _hitOnBeforeRender(renderer, _scene, camera) {
  renderer.getSize(_tmpVec2);
  const viewportH = _tmpVec2.y || 1;
  let worldUnitsPerPx;
  if (camera.isPerspectiveCamera) {
    const dist = Math.max(0.001, camera.position.distanceTo(this.position));
    worldUnitsPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / viewportH;
  } else {
    const visH = Math.max(0.001, (camera.top - camera.bottom) / (camera.zoom || 1));
    worldUnitsPerPx = visH / viewportH;
  }
  const targetWorldRadius = HIT_TARGET_PX * worldUnitsPerPx;
  this.scale.setScalar(targetWorldRadius / HIT_BASE_RADIUS_MM);
  // matrixAutoUpdate is off, so push the new scale into the local matrix.
  this.updateMatrix();
  // scene.updateMatrixWorld() already ran for this frame using the previous
  // scale — re-derive matrixWorld here so the actual draw call (which reads
  // matrixWorld, not matrix) picks up the size we just set, instead of one
  // frame later. Without this, the first hover frame pops in at the geometry's
  // natural 8 mm and then resizes on the next tick.
  if (this.parent) {
    this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
  } else {
    this.matrixWorld.copy(this.matrix);
  }
}

let _positionsById = new Map();
let _hitsGroup = null;
let _currentTrackLine = null;

// Called once per event by processXml after parseHits().
export function setHitPositions(map) {
  _positionsById = map instanceof Map ? map : new Map();
}

// Drops any rendered markers AND the cached positions map. Used by resetScene
// before a new XML loads.
export function clearHitsState() {
  hideTrackHits();
  _positionsById = new Map();
}

export function hideTrackHits() {
  if (_hitsGroup) {
    _hitsGroup.traverse((o) => {
      if (o.geometry && o.geometry !== _HIT_GEO) o.geometry.dispose();
    });
    scene.remove(_hitsGroup);
    _hitsGroup = null;
    markDirty();
  }
  _currentTrackLine = null;
}

// Renders a sphere for each pixel hit attached to `trackLine`. Re-uses the
// existing group when the same line is hovered again (no churn during
// raycast-driven re-fires). Falls back to a no-op when the track has no hits
// or none of them resolve to known pixel positions in the current event.
export function showTrackHits(trackLine) {
  if (!trackLine) return;
  if (trackLine === _currentTrackLine) return;
  hideTrackHits();
  const ids = trackLine.userData?.hitIds;
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (_positionsById.size === 0) return;

  const g = new THREE.Group();
  g.renderOrder = 30;
  let added = 0;
  for (const id of ids) {
    const p = _positionsById.get(id);
    if (!p) continue; // not a pixel hit (likely SCT or TRT — not yet supported)
    const m = new THREE.Mesh(_HIT_GEO, _HIT_MAT);
    m.position.copy(p);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.onBeforeRender = _hitOnBeforeRender;
    g.add(m);
    added++;
  }
  if (!added) return;
  scene.add(g);
  _hitsGroup = g;
  _currentTrackLine = trackLine;
  markDirty();
}
