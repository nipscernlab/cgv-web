// JS-side parser for inner-detector hits keyed by ATLAS Identifier.
//
// The Rust WASM parser doesn't extract hit positions today, so we do a light
// second pass over the same XML text after the worker returns. Cost is
// modest: one regex match per collection, then a string-split for the value
// arrays. Keys returned are the same 64-bit-integer-as-string format that
// <Track><hits> uses, which means tracks → hits matching is a straight Map
// lookup with zero conversions.
//
// Covers Pixel (point per cluster) and SCT (midpoint of each strip). TRT
// hits aren't decoded yet — their format is (rhoz, phi, driftR), which needs
// geometry lookup that we don't carry here.

import * as THREE from 'three';

// Convert XML coordinate (cm in ATLAS convention) to a THREE.Vector3 in the
// scene's coords (mm, with x and y negated to match the existing track
// rendering). Same transform applied to track polylines in the Rust parser.
function _toScene(xCm, yCm, zCm) {
  return new THREE.Vector3(-xCm * 10, -yCm * 10, zCm * 10);
}

function _readStrings(body, tag) {
  const re = new RegExp(`<${tag}(?:\\s+multiple="[^"]+")?>([\\s\\S]*?)</${tag}>`);
  const m = body.match(re);
  if (!m) return null;
  const trimmed = m[1].trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}
function _readNums(body, tag) {
  const s = _readStrings(body, tag);
  return s ? s.map(Number) : null;
}

// Returns Map<idString, THREE.Vector3>. Empty map if parsing fails or no
// pixel hits are in the event.
export function parseHits(xmlText) {
  const positionsById = new Map();
  if (!xmlText) return positionsById;

  // Pixel clusters — one position per hit (cluster centroid stored as x0/y0/z0).
  const pix = xmlText.match(/<PixCluster\s+count="\d+"[^>]*>([\s\S]*?)<\/PixCluster>/);
  if (pix) {
    const body = pix[1];
    const ids = _readStrings(body, 'id');
    const xs = _readNums(body, 'x0');
    const ys = _readNums(body, 'y0');
    const zs = _readNums(body, 'z0');
    if (ids && xs && ys && zs) {
      const n = Math.min(ids.length, xs.length, ys.length, zs.length);
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i]) || !Number.isFinite(zs[i])) continue;
        positionsById.set(ids[i], _toScene(xs[i], ys[i], zs[i]));
      }
    }
  }

  // SCT — each hit is a strip with two endpoints (x0/y0/z0) and (x1/y1/z1).
  // We render the strip as a single point at its midpoint; the strip is only
  // ~6 cm long, the marker is just a few pixels, so showing it as a segment
  // wouldn't add visual information at this scale.
  const sct = xmlText.match(/<SCTRDO\s+count="\d+"[^>]*>([\s\S]*?)<\/SCTRDO>/);
  if (sct) {
    const body = sct[1];
    const ids = _readStrings(body, 'id');
    const x0 = _readNums(body, 'x0');
    const y0 = _readNums(body, 'y0');
    const z0 = _readNums(body, 'z0');
    const x1 = _readNums(body, 'x1');
    const y1 = _readNums(body, 'y1');
    const z1 = _readNums(body, 'z1');
    if (ids && x0 && y0 && z0 && x1 && y1 && z1) {
      const n = Math.min(
        ids.length,
        x0.length,
        y0.length,
        z0.length,
        x1.length,
        y1.length,
        z1.length,
      );
      for (let i = 0; i < n; i++) {
        const ax = x0[i],
          ay = y0[i],
          az = z0[i];
        const bx = x1[i],
          by = y1[i],
          bz = z1[i];
        if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) continue;
        if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) continue;
        positionsById.set(ids[i], _toScene((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5));
      }
    }
  }

  return positionsById;
}
