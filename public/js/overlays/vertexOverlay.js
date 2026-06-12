// @ts-check
// Vertex marker overlay.
//
// Renders the primary, pile-up and secondary (b-tag) vertices as small
// spheres. Each marker has a per-frame onBeforeRender that keeps it at a
// fixed pixel size on screen — vertices live ~mm from the origin and would
// otherwise be invisible from any reasonable camera distance.
//
// Physics made visible (docs/VISUAL_PLAN.md, item B3):
//   - b-tag flight line: primary → secondary vertex segment. The measurable
//     flight distance of the B hadron (L_xy ~ mm) IS the b-tag signature —
//     drawing it links the green dot to the collision it came from.
//   - beamline segment: a faint axis through the pile-up vertices' z-spread;
//     the z distribution of pile-up is literally the luminous region of the
//     bunch crossing.
//   - primary flare: a soft additive glow on the hardest vertex, so the eye
//     finds the collision point first.

import * as THREE from 'three';
import { scene, markDirty } from '../renderer.js';
import { makeFatLineMaterial, makeFatLine } from '../fatLines.js';
import { getVertexGroup, setVertexGroup } from '../visibility.js';

// Three vertex flavours, three styles. Sizes in target screen pixels.
const VERTEX_STYLES = {
  primary: { color: 0xffffff, sizePx: 8, opacity: 0.95 },
  pileup: { color: 0x88aaff, sizePx: 4, opacity: 0.55 },
  secondary: { color: 0x00ff88, sizePx: 6, opacity: 0.95 },
};

// Base radius in scene mm — onBeforeRender rescales each frame so the marker
// keeps `sizePx` pixels of apparent radius up to a world-size cap. Without
// that cap, zooming out past the detector envelope makes the marker grow to
// many centimetres and overwhelm the geometry; once we hit the cap, the
// marker shrinks naturally with distance like the rest of the scene.
const VERTEX_BASE_RADIUS_MM = 8;
const VERTEX_MAX_WORLD_RADIUS_MM = 30;
const _GEO = new THREE.SphereGeometry(VERTEX_BASE_RADIUS_MM, 12, 8);
const _MATS = {
  primary: new THREE.MeshBasicMaterial({
    color: VERTEX_STYLES.primary.color,
    transparent: true,
    opacity: VERTEX_STYLES.primary.opacity,
    depthTest: false,
    depthWrite: false,
  }),
  pileup: new THREE.MeshBasicMaterial({
    color: VERTEX_STYLES.pileup.color,
    transparent: true,
    opacity: VERTEX_STYLES.pileup.opacity,
    depthTest: false,
    depthWrite: false,
  }),
  secondary: new THREE.MeshBasicMaterial({
    color: VERTEX_STYLES.secondary.color,
    transparent: true,
    opacity: VERTEX_STYLES.secondary.opacity,
    depthTest: false,
    depthWrite: false,
  }),
};

// ── B3 singletons ────────────────────────────────────────────────────────────
// Flight line: same green as the secondary-vertex marker. Beam segment: same
// pale blue as pile-up. Both depth-test-free like the markers (they live
// inside the beampipe geometry).
const _FLIGHT_MAT = makeFatLineMaterial({
  color: 0x00ff88,
  widthPx: 1.5,
  transparent: true,
  opacity: 0.85,
  depthTest: false,
  depthWrite: false,
});
const _BEAM_MAT = makeFatLineMaterial({
  color: 0x88aaff,
  widthPx: 1.5,
  transparent: true,
  opacity: 0.28,
  depthTest: false,
  depthWrite: false,
});

// Soft radial flare for the primary vertex — additive sprite, sized per frame
// like the markers (FLARE px target, world cap so it shrinks when zoomed out).
const FLARE_SIZE_PX = 26;
const FLARE_MAX_WORLD_MM = 90;
/** @type {THREE.SpriteMaterial | null} */
let _flareMat = null;
function _getFlareMat() {
  if (_flareMat) return _flareMat;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(170,210,255,0.45)');
  grad.addColorStop(1, 'rgba(170,210,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  _flareMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    opacity: 0.9,
  });
  return _flareMat;
}

const _tmpVec2 = new THREE.Vector2();
/** @param {number} sizePx */
function _makeOnBeforeRender(sizePx) {
  /**
   * @this {any}  the vertex-marker Mesh
   * @param {any} renderer
   * @param {any} _scene
   * @param {any} camera
   */
  return function (renderer, _scene, camera) {
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
    // min(pixel-driven, world-cap): up close we want the marker readable
    // (pixel size dominates), far out we want it to shrink with the scene
    // so it doesn't dwarf the detector (the cap dominates).
    const targetWorldRadius = Math.min(VERTEX_MAX_WORLD_RADIUS_MM, sizePx * worldUnitsPerPx);
    this.scale.setScalar(targetWorldRadius / VERTEX_BASE_RADIUS_MM);
    this.updateMatrix();
    if (this.parent) {
      this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    } else {
      this.matrixWorld.copy(this.matrix);
    }
  };
}

export function clearVertices() {
  const g = /** @type {any} */ (getVertexGroup());
  if (!g) return;
  // Marker geometry and all materials are shared singletons; only the
  // per-event flight/beam line geometries (tagged disposeGeo) are freed.
  g.traverse((/** @type {any} */ o) => {
    if (o.userData?.disposeGeo && o.geometry) o.geometry.dispose();
  });
  scene.remove(g);
  setVertexGroup(null);
}

// vertices: { primary, pileup, secondary } — empty arrays are OK.
/** @param {any} vertices  { primary, pileup, secondary } from vertexParser, or null. */
export function drawVertices(vertices) {
  clearVertices();
  if (!vertices) return;
  const all = [
    ...(vertices.primary ?? []).map((/** @type {any} */ v) => ({ ...v, kind: 'primary' })),
    ...(vertices.pileup ?? []).map((/** @type {any} */ v) => ({ ...v, kind: 'pileup' })),
    ...(vertices.secondary ?? []).map((/** @type {any} */ v) => ({ ...v, kind: 'secondary' })),
  ];
  if (!all.length) return;

  const g = new THREE.Group();
  g.renderOrder = 31; // above hit markers (renderOrder 30)
  for (const v of all) {
    const kind = /** @type {keyof typeof VERTEX_STYLES} */ (v.kind);
    const style = VERTEX_STYLES[kind];
    const m = new THREE.Mesh(_GEO, _MATS[kind]);
    m.position.copy(v.position);
    m.onBeforeRender = _makeOnBeforeRender(style.sizePx);
    m.userData.vertexKind = v.kind;
    m.userData.numTracks = v.numTracks;
    m.userData.vertexKey = v.key;
    m.userData.position = v.position;
    g.add(m);
  }

  // ── B3: flight lines, beamline segment, primary flare ──────────────────────
  // None of these are hover targets — the raycast no-ops keep the vertex
  // tooltip pinned to the sphere markers.
  const primaries = vertices.primary ?? [];
  const primPos = primaries[0]?.position ?? null;

  // b-tag flight line: primary (or origin when no primary survived) → SV.
  for (const sv of vertices.secondary ?? []) {
    const from = primPos ?? { x: 0, y: 0, z: 0 };
    const fl = makeFatLine(
      [from.x, from.y, from.z, sv.position.x, sv.position.y, sv.position.z],
      _FLIGHT_MAT,
    );
    fl.raycast = () => {};
    fl.renderOrder = 31;
    fl.userData.disposeGeo = true;
    g.add(fl);
  }

  // Beamline segment through the luminous region: spans the z-range of the
  // primary + pile-up vertices (15 % pad), at their mean transverse position
  // (the beam spot is offset ~fractions of a mm from x = y = 0).
  const beamVerts = all.filter((v) => v.kind !== 'secondary');
  if (beamVerts.length >= 2) {
    let zMin = Infinity,
      zMax = -Infinity,
      mx = 0,
      my = 0;
    for (const v of beamVerts) {
      zMin = Math.min(zMin, v.position.z);
      zMax = Math.max(zMax, v.position.z);
      mx += v.position.x;
      my += v.position.y;
    }
    mx /= beamVerts.length;
    my /= beamVerts.length;
    const pad = Math.max(20, (zMax - zMin) * 0.15);
    const beam = makeFatLine([mx, my, zMin - pad, mx, my, zMax + pad], _BEAM_MAT);
    beam.raycast = () => {};
    beam.renderOrder = 31;
    beam.userData.disposeGeo = true;
    g.add(beam);
  }

  // Flare on the primary vertices (additive glow; screen-sized like markers).
  for (const pv of primaries) {
    const flare = new THREE.Sprite(_getFlareMat());
    flare.position.copy(pv.position);
    flare.raycast = () => {};
    flare.renderOrder = 31;
    const baseScale = FLARE_SIZE_PX;
    flare.onBeforeRender = function (/** @type {any} */ renderer, _s, /** @type {any} */ camera) {
      renderer.getSize(_tmpVec2);
      const viewportH = _tmpVec2.y || 1;
      let worldPerPx;
      if (camera.isPerspectiveCamera) {
        const dist = Math.max(0.001, camera.position.distanceTo(flare.position));
        worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / viewportH;
      } else {
        const visH = Math.max(0.001, (camera.top - camera.bottom) / (camera.zoom || 1));
        worldPerPx = visH / viewportH;
      }
      const d = Math.min(FLARE_MAX_WORLD_MM, baseScale * worldPerPx);
      flare.scale.set(d, d, 1);
    };
    g.add(flare);
  }

  scene.add(g);
  setVertexGroup(g);
  markDirty();
}
