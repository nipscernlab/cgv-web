// @ts-check
import * as THREE from 'three';
import { scene, markDirty } from './renderer.js';

// ── Ghost envelope mesh names ────────────────────────────────────────────────
// TileCal envelopes. All are visible by default on startup.
const GHOST_MESH_NAMES = ['C→LBTile_0', 'C→EBTilep_0', 'C→EBTilen_0'];

// Per-ghost visibility (name -> bool). All modules read this; mutation via .set().
export const ghostVisible = new Map();
export const ghostMeshByName = new Map();
for (const n of GHOST_MESH_NAMES) ghostVisible.set(n, true);

// ── Ghost materials ──────────────────────────────────────────────────────────
// RGB(92,95,102) = #5C5F66; very high transparency (99%) for a subtle outline.
const ghostSolidMat = new THREE.MeshBasicMaterial({
  color: 0x5c5f66,
  transparent: true,
  opacity: 0.01,
  depthWrite: false,
  side: THREE.DoubleSide,
});
// Phi lines: white + high transparency, so they stay subtle guides.
// Dimmed 0.06 → 0.04 in the 2026-06-12 review.
const ghostPhiMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.04,
  depthWrite: false,
});

// ── Phi-segmentation lines (TileCal) ─────────────────────────────────────────
// 64 radial planes in φ — each a rectangle from r_inner to r_outer spanning z.
//   LB  : r 2288→3835, z ±2820
//   EB± : r 2288→3835, z [3600,6050] / [-6050,-3600]
const TILE_PHI_SEGS = [
  { rIn: 2288, rOut: 3835, zMin: -2820, zMax: 2820 },
  { rIn: 2288, rOut: 3835, zMin: 3600, zMax: 6050 },
  { rIn: 2288, rOut: 3835, zMin: -6050, zMax: -3600 },
];
const N_PHI = 64;
/** @type {THREE.Group | null} */
let ghostPhiGroup = null;

function buildPhiLines() {
  if (ghostPhiGroup) {
    scene.remove(ghostPhiGroup);
    ghostPhiGroup.traverse((o) => {
      const m = /** @type {THREE.Mesh} */ (o);
      if (m.geometry) m.geometry.dispose();
    });
  }
  ghostPhiGroup = new THREE.Group();
  ghostPhiGroup.renderOrder = 6;
  ghostPhiGroup.visible = false;
  // All 64×3 rectangles merged into ONE LineSegments (4 segments each) — one
  // draw call instead of 192 Line objects, pixel-identical output.
  const segs = new Float32Array(N_PHI * TILE_PHI_SEGS.length * 4 * 2 * 3);
  let o = 0;
  /** @type {(x: number, y: number, z: number) => void} */
  const push = (x, y, z) => {
    segs[o++] = x;
    segs[o++] = y;
    segs[o++] = z;
  };
  for (let i = 0; i < N_PHI; i++) {
    const phi = (i / N_PHI) * Math.PI * 2;
    const cx = Math.cos(phi),
      cy = Math.sin(phi);
    for (const { rIn, rOut, zMin, zMax } of TILE_PHI_SEGS) {
      const ax = cx * rIn,
        ay = cy * rIn,
        bx = cx * rOut,
        by = cy * rOut;
      push(ax, ay, zMin);
      push(ax, ay, zMax); // inner edge
      push(ax, ay, zMax);
      push(bx, by, zMax); // far radial
      push(bx, by, zMax);
      push(bx, by, zMin); // outer edge
      push(bx, by, zMin);
      push(ax, ay, zMin); // near radial
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(segs, 3));
  ghostPhiGroup.add(new THREE.LineSegments(geo, ghostPhiMat));
  scene.add(ghostPhiGroup);
}

export function anyGhostOn() {
  for (const v of ghostVisible.values()) if (v) return true;
  return false;
}

/** @param {string} name @param {boolean} visible */
function applyGhostMeshOne(name, visible) {
  const mesh = ghostMeshByName.get(name);
  if (!mesh) return;
  if (visible) {
    mesh.material = ghostSolidMat;
    mesh.renderOrder = 5;
    mesh.visible = true;
  } else {
    mesh.renderOrder = 0;
    mesh.visible = false;
  }
}

// Re-apply every ghost's visibility from the map. Safe to call after resetScene.
export function applyAllGhostMeshes() {
  for (const [name, v] of ghostVisible) applyGhostMeshOne(name, v);
  if (ghostPhiGroup) ghostPhiGroup.visible = anyGhostOn();
  markDirty();
}

function syncGhostToggles() {
  // Helpers popover gswitch — see js/bootstrap/helpersPanel.js. The button
  // may not exist yet during enableDefaultGhosts() called from initial load
  // before the helpers panel is wired, so guard.
  document.getElementById('hbtn-ghost')?.classList.toggle('on', anyGhostOn());
}

/** @param {boolean} on */
function setAllGhosts(on) {
  for (const name of GHOST_MESH_NAMES) ghostVisible.set(name, on);
  if (on && !ghostPhiGroup) buildPhiLines();
  applyAllGhostMeshes();
  syncGhostToggles();
}

// Keyboard shortcut G: toggle all envelopes on/off.
export function toggleAllGhosts() {
  setAllGhosts(!anyGhostOn());
}

export function enableDefaultGhosts() {
  buildPhiLines();
  applyAllGhostMeshes();
  syncGhostToggles();
}
