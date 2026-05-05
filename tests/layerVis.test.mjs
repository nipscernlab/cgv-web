// Tests for js/layerVis.js — the pure layers-panel state tree and its
// set/any helpers. Pure module: no DOM, no Three.js, no scene. Each test
// snapshots the tree before mutating and restores it after, so order doesn't
// matter and tests stay independent.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  layerVis,
  setLayerLeaf,
  setLayerSubtree,
  anyLayerLeafOn,
  replaceMuonState,
} from '../public/js/visibility/layerVis.js';

// Deep clone via JSON — layerVis is plain booleans + objects, no functions.
const _snapshot = JSON.parse(JSON.stringify(layerVis));
function resetLayerVis() {
  for (const k of Object.keys(layerVis)) delete layerVis[k];
  Object.assign(layerVis, JSON.parse(JSON.stringify(_snapshot)));
}

beforeEach(resetLayerVis);

describe('layerVis default tree', () => {
  it('starts with every TILE sampling enabled', () => {
    expect(layerVis.tile.barrel).toEqual({ A: true, BC: true, D: true });
    expect(layerVis.tile.extended).toEqual({ A: true, B: true, D: true });
    expect(layerVis.tile.itc).toEqual({ E: true });
  });

  it('starts with both MBTS rings enabled', () => {
    expect(layerVis.mbts).toEqual({ inner: true, outer: true });
  });

  it('starts with all four LAr samplings on for both regions', () => {
    expect(layerVis.lar.barrel).toEqual({ 0: true, 1: true, 2: true, 3: true });
    expect(layerVis.lar.ec).toEqual({ 0: true, 1: true, 2: true, 3: true });
  });

  it('starts with all HEC samplings on', () => {
    expect(layerVis.hec).toEqual({ 0: true, 1: true, 2: true, 3: true });
  });

  it('starts with all FCAL modules on', () => {
    expect(layerVis.fcal).toEqual({ 1: true, 2: true, 3: true });
  });

  it('starts with both muon sides on (default ON; AND-with-track gates real visibility)', () => {
    expect(layerVis.muon).toEqual({ aSide: true, cSide: true });
  });
});

describe('setLayerLeaf', () => {
  it('flips a single leaf without touching siblings', () => {
    setLayerLeaf(['tile', 'barrel', 'A'], false);
    expect(layerVis.tile.barrel.A).toBe(false);
    expect(layerVis.tile.barrel.BC).toBe(true);
    expect(layerVis.tile.barrel.D).toBe(true);
  });

  it('coerces truthy / falsy values to booleans', () => {
    setLayerLeaf(['tile', 'barrel', 'A'], 0);
    expect(layerVis.tile.barrel.A).toBe(false);
    setLayerLeaf(['tile', 'barrel', 'A'], 'yes');
    expect(layerVis.tile.barrel.A).toBe(true);
    setLayerLeaf(['tile', 'barrel', 'A'], null);
    expect(layerVis.tile.barrel.A).toBe(false);
  });

  it('handles numeric leaf keys (LAr / HEC samplings stored as 0/1/2/3)', () => {
    setLayerLeaf(['lar', 'barrel', 2], false);
    expect(layerVis.lar.barrel[2]).toBe(false);
    expect(layerVis.lar.barrel[0]).toBe(true);
    setLayerLeaf(['hec', 0], false);
    expect(layerVis.hec[0]).toBe(false);
    expect(layerVis.hec[3]).toBe(true);
  });

  it('handles a single-segment path (top-level boolean)', () => {
    setLayerLeaf(['mbts'], false);
    expect(layerVis.mbts).toBe(false);
  });

  it('does not affect other top-level detectors', () => {
    setLayerLeaf(['tile', 'barrel', 'A'], false);
    expect(layerVis.lar.barrel[0]).toBe(true);
    expect(layerVis.hec[0]).toBe(true);
    expect(layerVis.fcal[1]).toBe(true);
    expect(layerVis.mbts.inner).toBe(true);
  });
});

describe('setLayerSubtree', () => {
  it('cascades to every leaf under the given path', () => {
    setLayerSubtree(['tile'], false);
    expect(layerVis.tile.barrel.A).toBe(false);
    expect(layerVis.tile.barrel.BC).toBe(false);
    expect(layerVis.tile.barrel.D).toBe(false);
    expect(layerVis.tile.extended.A).toBe(false);
    expect(layerVis.tile.itc.E).toBe(false);
  });

  it('cascades to a single sub-region without touching siblings', () => {
    setLayerSubtree(['tile', 'barrel'], false);
    expect(layerVis.tile.barrel.A).toBe(false);
    expect(layerVis.tile.barrel.BC).toBe(false);
    expect(layerVis.tile.barrel.D).toBe(false);
    expect(layerVis.tile.extended.A).toBe(true);
    expect(layerVis.tile.itc.E).toBe(true);
  });

  it('handles numeric leaf keys (LAr samplings stored as 0/1/2/3)', () => {
    setLayerSubtree(['lar', 'barrel'], false);
    expect(layerVis.lar.barrel[0]).toBe(false);
    expect(layerVis.lar.barrel[3]).toBe(false);
    expect(layerVis.lar.ec[0]).toBe(true);
  });

  it('flips back on after being set off', () => {
    setLayerSubtree(['tile'], false);
    setLayerSubtree(['tile'], true);
    expect(layerVis.tile.barrel.A).toBe(true);
    expect(layerVis.tile.itc.E).toBe(true);
  });

  it('cascades the entire tree from the root', () => {
    // Walking layerVis itself isn't a valid path; instead loop top-level keys
    // — this is what the "All / None" buttons in the panel do.
    for (const k of Object.keys(layerVis)) setLayerSubtree([k], false);
    expect(anyLayerLeafOn(['tile'])).toBe(false);
    expect(anyLayerLeafOn(['lar'])).toBe(false);
    expect(anyLayerLeafOn(['hec'])).toBe(false);
    expect(anyLayerLeafOn(['fcal'])).toBe(false);
    expect(anyLayerLeafOn(['mbts'])).toBe(false);
    expect(anyLayerLeafOn(['muon'])).toBe(false);
  });

  it('falling on a leaf path behaves like setLayerLeaf', () => {
    setLayerSubtree(['tile', 'barrel', 'A'], false);
    expect(layerVis.tile.barrel.A).toBe(false);
    expect(layerVis.tile.barrel.BC).toBe(true);
  });
});

describe('anyLayerLeafOn', () => {
  it('returns true when every leaf is on (default state)', () => {
    expect(anyLayerLeafOn(['tile'])).toBe(true);
    expect(anyLayerLeafOn(['lar', 'ec'])).toBe(true);
    expect(anyLayerLeafOn(['hec'])).toBe(true);
  });

  it('returns false only when every nested leaf is off', () => {
    setLayerSubtree(['tile'], false);
    expect(anyLayerLeafOn(['tile'])).toBe(false);
    expect(anyLayerLeafOn(['tile', 'barrel'])).toBe(false);
    expect(anyLayerLeafOn(['tile', 'extended'])).toBe(false);
  });

  it('returns true when a single deep leaf is on inside an otherwise-off subtree', () => {
    setLayerSubtree(['tile'], false);
    setLayerLeaf(['tile', 'extended', 'B'], true);
    expect(anyLayerLeafOn(['tile'])).toBe(true);
    expect(anyLayerLeafOn(['tile', 'extended'])).toBe(true);
    expect(anyLayerLeafOn(['tile', 'barrel'])).toBe(false);
    expect(anyLayerLeafOn(['tile', 'itc'])).toBe(false);
  });

  it('returns the leaf value when given a direct leaf path', () => {
    expect(anyLayerLeafOn(['tile', 'barrel', 'A'])).toBe(true);
    setLayerLeaf(['tile', 'barrel', 'A'], false);
    expect(anyLayerLeafOn(['tile', 'barrel', 'A'])).toBe(false);
  });

  it('respects numeric leaf keys', () => {
    setLayerSubtree(['hec'], false);
    setLayerLeaf(['hec', 2], true);
    expect(anyLayerLeafOn(['hec'])).toBe(true);
    setLayerLeaf(['hec', 2], false);
    expect(anyLayerLeafOn(['hec'])).toBe(false);
  });
});

describe('parent toggle semantics — what the layers panel does on click', () => {
  // Reproduces the click handler in layersPanel.js: `setLayerSubtree(path,
  // !anyLayerLeafOn(path))`. These tests pin the contract so future tweaks
  // don't silently change panel behaviour.
  function clickParent(path) {
    setLayerSubtree(path, !anyLayerLeafOn(path));
  }

  it('all-on parent → click → all-off', () => {
    clickParent(['tile']);
    expect(anyLayerLeafOn(['tile'])).toBe(false);
  });

  it('mixed parent (some on, some off) → click → all-off', () => {
    setLayerSubtree(['tile', 'barrel'], false); // mixed
    expect(anyLayerLeafOn(['tile'])).toBe(true);
    clickParent(['tile']);
    expect(anyLayerLeafOn(['tile'])).toBe(false);
  });

  it('all-off parent → click → all-on', () => {
    setLayerSubtree(['tile'], false);
    clickParent(['tile']);
    expect(anyLayerLeafOn(['tile'])).toBe(true);
    expect(layerVis.tile.barrel.A).toBe(true);
    expect(layerVis.tile.itc.E).toBe(true);
  });

  it('toggling a leaf flips the parent reading without leaking to other parents', () => {
    setLayerLeaf(['tile', 'barrel', 'A'], false);
    expect(anyLayerLeafOn(['tile', 'barrel'])).toBe(true); // BC, D still on
    expect(anyLayerLeafOn(['lar'])).toBe(true); // unrelated detector
  });
});

describe('replaceMuonState', () => {
  it('overwrites layerVis.muon wholesale (loader hooks this after atlas-tree mirror)', () => {
    replaceMuonState({
      aSide: { BARI_1: { ch1: true, ch2: false } },
      cSide: { BARh_1: { ch1: true } },
    });
    expect(layerVis.muon.aSide.BARI_1.ch1).toBe(true);
    expect(layerVis.muon.aSide.BARI_1.ch2).toBe(false);
    expect(layerVis.muon.cSide.BARh_1.ch1).toBe(true);
  });

  it('the new shape works with setLayerSubtree / anyLayerLeafOn', () => {
    replaceMuonState({
      aSide: { BARI_1: { ch1: true, ch2: true } },
      cSide: true,
    });
    expect(anyLayerLeafOn(['muon'])).toBe(true);
    setLayerSubtree(['muon', 'aSide'], false);
    expect(layerVis.muon.aSide.BARI_1.ch1).toBe(false);
    expect(layerVis.muon.aSide.BARI_1.ch2).toBe(false);
    expect(anyLayerLeafOn(['muon'])).toBe(true); // cSide still on
    setLayerLeaf(['muon', 'cSide'], false);
    expect(anyLayerLeafOn(['muon'])).toBe(false);
  });
});
