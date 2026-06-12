// Track-vs-muon-chamber geometric intersection pass.
//
// Walks every visible (or particle-hidden — see below) track polyline and
// raycasts each segment against the muon-chamber meshes (subtree roots
// MUC1_2 / MUCH_1). Chambers a track passes through become visible; the
// rest stay hidden so the muon spectrometer reads as "lit by physics" not
// "every chamber on stage".
//
// This file ALSO houses the chamber-hover outline API (showChamberHover-
// Outline / clearChamberHoverOutline) because the per-chamber outline
// LineSegments it creates are reused by the hover handler.
//
// Material assignment (which colour each track line takes) lives in
// trackMaterials.js. The recompute*Match passes (jet / τ / electron /
// muon → track) live in trackMatch.js. Both are invoked from this file
// after the chamber-hit set updates each line's `isHitTrack` flag.

import * as THREE from 'three';
import { scene, markDirty } from './renderer.js';
import { applyTrackMaterials } from './trackMaterials.js';
import { polylineAttr } from './fatLines.js';
import { initTrackMatch } from './trackMatch.js';
import { applyWedgeClipWorld, WEDGE_GLSL, WEDGE_UNIFORMS } from './wedgeClip.js';
import { CGV_WAVE_UNIFORM, CGV_WAVE_FADE } from './collisionReplay.js';

// Raycast-only layer for the individual chamber body meshes. Their RENDERING
// is owned by the merged chamber mega mesh below (one draw call for all
// ~thousands of chambers); the individual meshes stay in the scene, visible-
// flagged exactly as before, so hover picking, per-station outlines and the
// layers-panel toggles keep their per-mesh granularity. The camera renders
// layer 0 only, so layer 1 objects are raycastable but never drawn.
export const CHAMBER_RAYCAST_LAYER = 1;

// Chamber materials (only used here — not exported). Both carry the slicer
// wedge as a per-fragment GPU clip (wedgeClip.js): the cut carves through the
// chamber bodies and their outlines in real time during a slicer drag, with
// zero per-chamber CPU work.
// Dimmed twice in the 2026-06-12 review rounds — the chamber wireframe kept
// reading too bright against the event. Now 0.02 faces / 0.05 lines, with a
// darker line blue so what remains recedes instead of glowing.
const atlasTrackHitMat = new THREE.MeshBasicMaterial({
  color: 0x4a90d9,
  transparent: true,
  opacity: 0.02,
  depthWrite: false,
  side: THREE.DoubleSide,
});
applyWedgeClipWorld(atlasTrackHitMat);
const trackAtlasOutlineMat = new THREE.LineBasicMaterial({
  color: 0x3a72ab,
  transparent: true,
  opacity: 0.05,
  depthWrite: false,
});
applyWedgeClipWorld(trackAtlasOutlineMat);

// Atlas subtree names whose descendants are the chamber meshes we test.
const TRACK_ATLAS_TARGET_NODE_NAMES = ['MUCH_1', 'MUC1_2'];

// Reusable scratch objects for the per-segment raycast — avoids allocating
// inside the per-track loop (called every time a track-affecting state
// changes, can happen many times per second during slider drags).
const _trackAtlasRay = new THREE.Raycaster();
_trackAtlasRay.layers.enable(CHAMBER_RAYCAST_LAYER);
const _trackAtlasSegA = new THREE.Vector3();
const _trackAtlasSegB = new THREE.Vector3();
const _trackAtlasDir = new THREE.Vector3();
const _trackAtlasTrackBox = new THREE.Box3();
const _trackAtlasEdgeGeoCache = new Map();
// Shared sentinel for tracks that touch zero chambers — lets the per-track
// `if (cached.size === 0) continue;` short-circuit work without each empty
// track allocating its own Set.
const _EMPTY_CHAMBER_SET = new Set();

let atlasRoot = null;
let _trackAtlasNodes = null;
let _trackAtlasMeshes = null;
let _trackAtlasOutlineMeshes = null;
/** @type {Set<any> | null} */
let _trackAtlasOutlineMeshSet = null;
let _trackAtlasMeshBoxes = null;

let _getTrackGroup = () => null;
/** @type {() => any} */
let _getSlicer = () => null;

/** @param {{ getTrackGroup: () => any, getSlicer?: () => any }} deps */
export function initTrackAtlasIntersections({ getTrackGroup, getSlicer }) {
  _getTrackGroup = getTrackGroup;
  if (getSlicer) _getSlicer = getSlicer;
  // Cascade init to the sibling track-match module so consumers only call
  // one init at startup (see main.js).
  initTrackMatch({ getTrackGroup });
}

export function setAtlasRoot(tree) {
  atlasRoot = tree;
  _trackAtlasNodes = null;
  _trackAtlasMeshes = null;
  _trackAtlasOutlineMeshes = null;
  _trackAtlasOutlineMeshSet = null;
  _trackAtlasMeshBoxes = null;
  if (_chamberMega) {
    scene.remove(_chamberMega.mesh);
    _chamberMega.mesh.geometry.dispose();
    _chamberMega = null;
  }
  // Chamber meshes change with a new atlas tree → per-track chamber caches
  // are stale. Lines stay between events; explicit reset here. (Fresh-event
  // path goes through clearTracks → new line objects → no cache to drop.)
  const tg = _getTrackGroup?.();
  if (tg) for (const line of tg.children) line.userData._atlasChambers = null;
}

/**
 * Returns the muon-chamber meshes that the track-vs-chamber intersection
 * test runs against — the same set hover-raycast wants for tooltip lookup.
 * Lazily resolves on the first call after setAtlasRoot. Returns an empty
 * array when atlas isn't loaded yet.
 * @returns {ReadonlyArray<any>}
 */
export function getMuonChamberMeshes() {
  if (!atlasRoot) return [];
  return _resolveTrackAtlasTargets().meshes;
}

// Hover outline for muon chambers — piggy-backs on the per-mesh
// trackAtlasOutline LineSegments already created by _ensureTrackAtlasOutline.
// Stores each forced mesh's prior outline.visible so we can restore it on
// hover-out (the next updateTrackAtlasIntersections will recompute the
// track-driven state authoritatively, but until then we leave it as we
// found it).
/** @type {Map<any, boolean>} */
const _hoverOutlinePrev = new Map();

/**
 * Forces the per-mesh outline on every chamber in `meshes` to visible —
 * typically every mesh of one station, fed in by the hover handler via
 * getStationMeshes(). Replaces any previous hover set.
 * @param {ReadonlyArray<any>} meshes
 */
export function showChamberHoverOutline(meshes) {
  clearChamberHoverOutline();
  for (const m of meshes) {
    const out = m.userData?.trackAtlasOutline;
    if (!out) continue;
    _hoverOutlinePrev.set(m, out.visible);
    out.visible = true;
  }
  if (_hoverOutlinePrev.size) markDirty();
}

/** Restores every outline forced visible by the last showChamberHoverOutline. */
export function clearChamberHoverOutline() {
  if (_hoverOutlinePrev.size === 0) return;
  for (const [m, prev] of _hoverOutlinePrev) {
    const out = m.userData?.trackAtlasOutline;
    if (out) out.visible = prev;
  }
  _hoverOutlinePrev.clear();
  markDirty();
}

function _findAtlasNodesByName(root, name, out = []) {
  if (!root) return out;
  if (root.name === name) out.push(root);
  for (const child of root.children.values()) _findAtlasNodesByName(child, name, out);
  return out;
}

function _maxAtlasSubtreeDepth(node) {
  if (!node.children.size) return 0;
  let maxDepth = 0;
  for (const child of node.children.values())
    maxDepth = Math.max(maxDepth, 1 + _maxAtlasSubtreeDepth(child));
  return maxDepth;
}

function _collectAtlasNodesAtDepth(node, depth, out = []) {
  if (depth === 0) {
    out.push(node);
    return out;
  }
  for (const child of node.children.values()) _collectAtlasNodesAtDepth(child, depth - 1, out);
  return out;
}

// ── Merged chamber mega mesh ─────────────────────────────────────────────────
// All chamber bodies baked (scene-local, ×10 atlas scale included) into ONE
// BufferGeometry with a per-vertex chamber slot. Per-chamber visibility lives
// in a 1-texel-per-chamber DataTexture mirrored from mesh.visible inside
// updateTrackAtlasIntersections — pixel-identical to drawing the individual
// translucent boxes, at 1 draw call instead of ~3.5k in slicer show-all.
// The slicer wedge cuts per fragment (baked positions are scene-local, so
// no counter-rotation is needed).
const CHAMBER_TEX_W = 2048;
/** @type {{ mesh: THREE.Mesh, tex: THREE.DataTexture, data: Uint8Array,
 *           slotOf: Map<any, number> } | null} */
let _chamberMega = null;

/** @param {any[]} meshes */
function _buildChamberMega(meshes) {
  if (_chamberMega || !meshes.length) return;
  scene.updateMatrixWorld(true);
  let nVerts = 0;
  let nIdx = 0;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    nVerts += pos.count;
    nIdx += m.geometry.index ? m.geometry.index.count : pos.count;
  }
  const posArr = new Float32Array(nVerts * 3);
  const slotArr = new Float32Array(nVerts);
  const idxArr = nVerts > 65535 ? new Uint32Array(nIdx) : new Uint16Array(nIdx);
  const texH = Math.max(1, Math.ceil(meshes.length / CHAMBER_TEX_W));
  const data = new Uint8Array(CHAMBER_TEX_W * texH * 4);
  const slotOf = new Map();
  let vOff = 0;
  let iOff = 0;
  for (let slot = 0; slot < meshes.length; slot++) {
    const m = meshes[slot];
    slotOf.set(m, slot);
    const pos = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const e = m.matrixWorld.elements;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      const o = (vOff + i) * 3;
      posArr[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      posArr[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      posArr[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      slotArr[vOff + i] = slot;
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) idxArr[iOff + i] = vOff + idx.getX(i);
      iOff += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) idxArr[iOff + i] = vOff + i;
      iOff += pos.count;
    }
    vOff += pos.count;
    // Render ownership moves to the mega mesh; the individual mesh becomes a
    // raycast-only proxy (hover, track-hit tests) on the non-rendered layer.
    m.layers.set(CHAMBER_RAYCAST_LAYER);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute('aSlot', new THREE.BufferAttribute(slotArr, 1));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  const tex = new THREE.DataTexture(data, CHAMBER_TEX_W, texH, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      ...WEDGE_UNIFORMS,
      uChamberTex: { value: tex },
      uColor: { value: new THREE.Color(0x4a90d9) },
      uOpacity: { value: 0.035 },
      // Shared by reference with the calorimeter wave — same front, so the
      // replay ignites the hit chambers as one continuum with the cells.
      uCgvWaveR: CGV_WAVE_UNIFORM,
      uCgvWaveFade: CGV_WAVE_FADE,
    },
    defines: { CGV_TEXW: CHAMBER_TEX_W },
    vertexShader:
      WEDGE_GLSL +
      /* glsl */ `
attribute float aSlot;
uniform sampler2D uChamberTex;
varying vec3 vScenePos;
void main() {
  int s = int(aSlot + 0.5);
  float vis = texelFetch(uChamberTex, ivec2(s % CGV_TEXW, s / CGV_TEXW), 0).a;
  vScenePos = position;
  gl_Position = vis < 0.5
    ? vec4(2.0, 2.0, 2.0, 1.0)
    : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader:
      WEDGE_GLSL +
      /* glsl */ `
varying vec3 vScenePos;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCgvWaveR;
uniform float uCgvWaveFade;
void main() {
  if (cgvInsideWedge(vScenePos)) discard;
  float opa = uOpacity;
  vec3 col = uColor;
  // B2 collision replay: the light front (r = uCgvWaveR mm from the vertex)
  // sweeps past the calorimeter and ignites each hit chamber as it crosses —
  // dimmed ahead of the front, a bright whitened ridge on it, base glow behind.
  // Mirrors the calorimeter cell modulation. uCgvWaveR < 0 → effect off; the
  // tail fade lerps it back to the chamber's resting look so it dissolves.
  if (uCgvWaveR >= 0.0) {
    float wd = length(vScenePos) - uCgvWaveR;
    float lit = 1.0 - smoothstep(0.0, 400.0, wd);
    float band = exp(-abs(wd) / 300.0);
    float opaRaw = uOpacity * mix(0.15, 1.0, lit) + band * 0.4;
    opa = mix(uOpacity, opaRaw, uCgvWaveFade);
    col = mix(uColor, vec3(0.82, 0.92, 1.0), band * 0.7 * uCgvWaveFade);
  }
  gl_FragColor = vec4(col, opa);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const mega = new THREE.Mesh(geo, mat);
  mega.name = 'muon-chambers-merged';
  mega.frustumCulled = false;
  scene.add(mega);
  _chamberMega = { mesh: mega, tex, data, slotOf };
}

function _ensureTrackAtlasOutline(mesh) {
  mesh.material = atlasTrackHitMat;
  if (mesh.userData.trackAtlasOutline) return mesh.userData.trackAtlasOutline;
  const uid = mesh.geometry.uuid;
  if (!_trackAtlasEdgeGeoCache.has(uid))
    _trackAtlasEdgeGeoCache.set(uid, new THREE.EdgesGeometry(mesh.geometry, 30));
  const outline = new THREE.LineSegments(_trackAtlasEdgeGeoCache.get(uid), trackAtlasOutlineMat);
  outline.name = `${mesh.name}__track_outline`;
  outline.renderOrder = 8;
  outline.visible = false;
  mesh.add(outline);
  mesh.userData.trackAtlasOutline = outline;
  return outline;
}

function _resolveTrackAtlasTargets() {
  if (!atlasRoot) return { nodes: [], meshes: [], outlineMeshes: [] };
  if (_trackAtlasNodes && _trackAtlasMeshes && _trackAtlasOutlineMeshes)
    return {
      nodes: _trackAtlasNodes,
      meshes: _trackAtlasMeshes,
      outlineMeshes: _trackAtlasOutlineMeshes,
    };
  const sourceNodes = [];
  const seen = new Set();
  for (const name of TRACK_ATLAS_TARGET_NODE_NAMES) {
    for (const node of _findAtlasNodesByName(atlasRoot, name)) {
      if (seen.has(node)) continue;
      seen.add(node);
      sourceNodes.push(node);
    }
  }
  const nodes = [];
  const nodeSeen = new Set();
  const outlineNodes = [];
  const outlineNodeSeen = new Set();
  for (const node of sourceNodes) {
    const maxDepth = _maxAtlasSubtreeDepth(node);
    for (const depth of [maxDepth - 1, maxDepth]) {
      if (depth < 0) continue;
      for (const match of _collectAtlasNodesAtDepth(node, depth)) {
        if (nodeSeen.has(match)) continue;
        nodeSeen.add(match);
        nodes.push(match);
      }
    }
    const outlineDepth = maxDepth - 1;
    if (outlineDepth >= 0) {
      for (const match of _collectAtlasNodesAtDepth(node, outlineDepth)) {
        if (outlineNodeSeen.has(match)) continue;
        outlineNodeSeen.add(match);
        outlineNodes.push(match);
      }
    }
  }
  const meshes = [];
  const meshSeen = new Set();
  for (const node of nodes) {
    for (const mesh of node.meshes) {
      if (meshSeen.has(mesh)) continue;
      meshSeen.add(mesh);
      _ensureTrackAtlasOutline(mesh);
      meshes.push(mesh);
    }
  }
  const outlineMeshes = [];
  const outlineMeshSeen = new Set();
  for (const node of outlineNodes) {
    for (const mesh of node.meshes) {
      if (outlineMeshSeen.has(mesh)) continue;
      outlineMeshSeen.add(mesh);
      outlineMeshes.push(mesh);
    }
  }
  _trackAtlasNodes = nodes;
  _trackAtlasMeshes = meshes;
  _trackAtlasOutlineMeshes = outlineMeshes;
  // O(1) membership lookup for the show-all visibility loop below — used to
  // restrict slicer-mode rendering to outer chamber boxes only (skip the
  // inner-leaf hierarchy that would otherwise show through the cut faces).
  _trackAtlasOutlineMeshSet = new Set(outlineMeshes);
  _buildChamberMega(meshes);
  return { nodes, meshes, outlineMeshes };
}

export function updateTrackAtlasIntersections() {
  if (!atlasRoot) return;
  const { meshes, outlineMeshes } = _resolveTrackAtlasTargets();
  if (!meshes.length) return;

  const trackGroup = _getTrackGroup();
  // Two questions, two answers:
  //   isHitTrack — purely geometric: does THIS track's polyline pass
  //                through any chamber? Computed for every track in the
  //                group, regardless of visibility. The Particles-panel
  //                filters in detectorGroups.js use this flag to decide
  //                whether a track is "muon-like" (real μ vs unmatched μ),
  //                so resetting it on hidden tracks would break the cycle:
  //                hide → reset isHitTrack → next filter pass can't fire →
  //                track comes back visible.
  //   hitMeshes  — actually-lit chambers: only tracks whose .visible=true
  //                or particleHidden=true (the J-button / "Muon Tracks
  //                off" / etc cases that hide the LINE but keep the
  //                physics) contribute. Unmatched-μ tracks set
  //                particleHidden=false so their chambers go dark too.
  const allTracks = trackGroup ? trackGroup.children : [];
  const hitMeshes = new Set();
  const hitTracks = new Set();

  // Slicer state — when active in show-all mode, every chamber the panel
  // allows is shown (no track-hit gate). The wedge cut itself is a GPU
  // fragment clip on the chamber materials (see top of file), so no per-mesh
  // wedge test is needed here.
  const slicer = _getSlicer();
  const showAllChambers = !!slicer?.isShowAllCells();

  if (allTracks.length) {
    scene.updateMatrixWorld(true);

    // Cache world-space AABBs for all target meshes once (static geometry) —
    // used by the per-track raycast AABB pre-filter.
    if (!_trackAtlasMeshBoxes) {
      _trackAtlasMeshBoxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
    }
  }

  if (allTracks.length) {
    for (const line of allTracks) {
      // Per-track chamber-hit cache. The geometric question "which chambers
      // does this polyline pass through?" is fully determined by the line's
      // (immutable) vertex buffer and the chamber meshes' (also static)
      // world transforms — neither changes between slider ticks. Compute
      // once on first encounter, reuse forever. Drops the dominant cost of
      // applyTrackThreshold from ~150 ms to <1 ms per call on busy events
      // (979 tracks × ray-vs-mesh-triangles → cached Set lookup).
      let cached = line.userData._atlasChambers;
      if (!cached) {
        const pos = polylineAttr(line);
        if (!pos || pos.count < 2) {
          line.userData._atlasChambers = _EMPTY_CHAMBER_SET;
          continue;
        }
        cached = new Set();

        // Compute track world-space AABB to pre-filter candidate meshes.
        _trackAtlasTrackBox.makeEmpty();
        for (let i = 0; i < pos.count; i++) {
          _trackAtlasSegA.fromBufferAttribute(pos, i).applyMatrix4(line.matrixWorld);
          _trackAtlasTrackBox.expandByPoint(_trackAtlasSegA);
        }

        // Only test meshes whose AABB overlaps this track's AABB.
        const nearMeshes = [];
        for (let mi = 0; mi < meshes.length; mi++) {
          if (_trackAtlasMeshBoxes[mi].intersectsBox(_trackAtlasTrackBox))
            nearMeshes.push(meshes[mi]);
        }

        if (nearMeshes.length) {
          for (let i = 0; i < pos.count - 1; i++) {
            _trackAtlasSegA.fromBufferAttribute(pos, i).applyMatrix4(line.matrixWorld);
            _trackAtlasSegB.fromBufferAttribute(pos, i + 1).applyMatrix4(line.matrixWorld);
            _trackAtlasDir.subVectors(_trackAtlasSegB, _trackAtlasSegA);
            const len = _trackAtlasDir.length();
            if (len <= 1e-6) continue;
            _trackAtlasDir.multiplyScalar(1 / len);
            _trackAtlasRay.set(_trackAtlasSegA, _trackAtlasDir);
            _trackAtlasRay.far = len;
            for (const hit of _trackAtlasRay.intersectObjects(nearMeshes, false))
              cached.add(hit.object);
          }
        }
        line.userData._atlasChambers = cached.size === 0 ? _EMPTY_CHAMBER_SET : cached;
      }

      if (cached.size === 0) continue;

      // Track contributes to chamber lighting iff its line is rendered
      // (or in the "hide line, keep physics" mode). Geometric isHitTrack
      // is recorded for every track regardless.
      const lightsChambers = line.visible || line.userData.particleHidden;
      if (lightsChambers) for (const m of cached) hitMeshes.add(m);
      hitTracks.add(line);
    }
  }

  // Per-chamber visibility rule:
  //   - Default: shown when a track passes through it AND the layers-panel
  //     toggle for its station is on (mesh.userData.muonForceVisible).
  //   - Show-all (slicer active): track-hit gate is dropped — every OUTER
  //     chamber the panel allows shows up. Inner-leaf meshes (the deeper
  //     hierarchy) stay hidden because they'd render as overlapping shapes
  //     inside the outer box. The wedge carve is the materials' GPU clip.
  let changed = false;
  const megaData = _chamberMega?.data ?? null;
  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi];
    const baseShow = showAllChambers
      ? (_trackAtlasOutlineMeshSet?.has(mesh) ?? false)
      : hitMeshes.has(mesh);
    const next = baseShow && !!mesh.userData.muonForceVisible;
    if (mesh.visible !== next) {
      mesh.visible = next;
      // Mirror into the merged-chamber visibility texture — the mega mesh is
      // what actually renders the body; mesh.visible keeps driving raycast
      // filters and the per-mesh outline children.
      if (megaData) megaData[mi * 4 + 3] = next ? 255 : 0;
      changed = true;
    }
  }
  if (changed && _chamberMega) _chamberMega.tex.needsUpdate = true;
  for (const mesh of meshes) {
    if (mesh.userData.trackAtlasOutline)
      mesh.userData.trackAtlasOutline.visible = hitMeshes.has(mesh) && outlineMeshes.includes(mesh);
  }
  if (trackGroup) {
    // Persist the muon-hit verdict on the line itself so the material logic
    // can be re-run later by recomputeJetTrackMatch without needing access to
    // the local `hitTracks` set.
    for (const line of trackGroup.children) {
      line.userData.isHitTrack = hitTracks.has(line);
    }
    applyTrackMaterials(trackGroup);
  }
  if (!changed) return;
  markDirty();
}
