// Tests for js/cellClassifier.js — turns a GLB mesh `name` into the
// {det, subDet, sampling} routing tags consumed by the layers panel + the
// per-handle visibility dispatcher (isLayerOn). Pure module, so each spec
// just constructs a representative mesh path string.
//
// Mesh name format: parts joined by "→". The classifier looks at every
// segment and matches against detector-specific prefixes.

import { describe, it, expect } from 'vitest';
import { classifyCellName, _classifyTile } from '../public/js/cellClassifier.js';

// Convenience: build a 3-segment mesh name with the given middle segment.
// Segment must be the exact prefix the regex expects — the Tile regex is
// anchored with `$`, so trailing junk would break it.
const mk = (segment) => `top→${segment}→leaf`;

describe('classifyCellName — guards', () => {
  it('returns null for non-string input', () => {
    expect(classifyCellName(null)).toBeNull();
    expect(classifyCellName(undefined)).toBeNull();
    expect(classifyCellName(42)).toBeNull();
  });

  it('returns null for paths with fewer than 3 segments', () => {
    expect(classifyCellName('')).toBeNull();
    expect(classifyCellName('one')).toBeNull();
    expect(classifyCellName('one→two')).toBeNull();
  });

  it('returns null when no segment matches a detector prefix', () => {
    expect(classifyCellName('top→nothing→leaf')).toBeNull();
    expect(classifyCellName('atlas→Foo→Bar→Baz')).toBeNull();
  });
});

describe('classifyCellName — LAr EM (current naming)', () => {
  it('EB_{samp}_… → barrel with that sampling', () => {
    expect(classifyCellName(mk('EB_0_0_p_0_0'))).toEqual({
      det: 'LAR',
      subDet: 'barrel',
      sampling: 0,
    });
    expect(classifyCellName(mk('EB_3_0_p_0_0'))).toEqual({
      det: 'LAR',
      subDet: 'barrel',
      sampling: 3,
    });
  });

  it('EE_{samp}_… → ec with that sampling', () => {
    expect(classifyCellName(mk('EE_2_2_p_0_0'))).toEqual({
      det: 'LAR',
      subDet: 'ec',
      sampling: 2,
    });
  });

  it('multi-digit sampling parses correctly', () => {
    expect(classifyCellName(mk('EB_12_0_p_0_0')).sampling).toBe(12);
  });
});

describe('classifyCellName — LAr EM (legacy naming)', () => {
  it('EMBarrel_{samp}_… → barrel', () => {
    expect(classifyCellName(mk('EMBarrel_2_0_p_0'))).toEqual({
      det: 'LAR',
      subDet: 'barrel',
      sampling: 2,
    });
  });

  it('EMEndCap_{samp}_… → ec', () => {
    expect(classifyCellName(mk('EMEndCap_3_2_p_0'))).toEqual({
      det: 'LAR',
      subDet: 'ec',
      sampling: 3,
    });
  });
});

describe('classifyCellName — HEC', () => {
  it('H_1_… → sampling 0 (HEC_NAMES[0])', () => {
    expect(classifyCellName(mk('H_1_0_p_0_0'))).toEqual({
      det: 'HEC',
      subDet: 'ec',
      sampling: 0,
    });
  });

  it('H_23_… → sampling 1 (the merged HEC2-3 layer)', () => {
    expect(classifyCellName(mk('H_23_0_p_0_0'))).toEqual({
      det: 'HEC',
      subDet: 'ec',
      sampling: 1,
    });
  });

  it('H_45_… → sampling 2', () => {
    expect(classifyCellName(mk('H_45_0_p_0_0')).sampling).toBe(2);
  });

  it('H_67_… → sampling 3', () => {
    expect(classifyCellName(mk('H_67_0_p_0_0')).sampling).toBe(3);
  });

  it('H_99_… → null (not a known HEC group)', () => {
    expect(classifyCellName(mk('H_99_0_p_0_0'))).toBeNull();
  });

  it('legacy HEC_{name}_… resolves the same as H_{name}_…', () => {
    expect(classifyCellName(mk('HEC_23_0_p_0'))).toEqual({
      det: 'HEC',
      subDet: 'ec',
      sampling: 1,
    });
  });
});

describe('classifyCellName — TILE', () => {
  // Mesh prefix is `T{x}{p|n}{y}_{y}` — `x` is the layer (1..15 or 23 for the
  // BC merged layer); the middle p/n is eta-side; the trailing two numbers
  // are eta indices that we don't care about here.
  const tile = (x, side = 'p', y = 0) => mk(`T${x}${side}${y}_${y}`);

  it('x=1 → barrel/A', () => {
    expect(classifyCellName(tile(1))).toEqual({ det: 'TILE', subDet: 'barrel', sampling: 'A' });
  });

  it('x=23 (BC merged) → barrel/BC — regression for x=23 falling into mbts', () => {
    expect(classifyCellName(tile(23))).toEqual({ det: 'TILE', subDet: 'barrel', sampling: 'BC' });
  });

  it('x=4 → barrel/D', () => {
    expect(classifyCellName(tile(4))).toEqual({ det: 'TILE', subDet: 'barrel', sampling: 'D' });
  });

  it('x=5 → extended/A', () => {
    expect(classifyCellName(tile(5))).toEqual({ det: 'TILE', subDet: 'extended', sampling: 'A' });
  });

  it('x=6 → extended/B', () => {
    expect(classifyCellName(tile(6))).toEqual({ det: 'TILE', subDet: 'extended', sampling: 'B' });
  });

  it('x=7 → extended/D', () => {
    expect(classifyCellName(tile(7))).toEqual({ det: 'TILE', subDet: 'extended', sampling: 'D' });
  });

  it('x=8 (D4) → extended/D — kept under EB-D bucket', () => {
    expect(classifyCellName(tile(8))).toEqual({ det: 'TILE', subDet: 'extended', sampling: 'D' });
  });

  it('x=9 (C10) → extended/B — kept under EB-B per user request', () => {
    expect(classifyCellName(tile(9))).toEqual({ det: 'TILE', subDet: 'extended', sampling: 'B' });
  });

  it('x=10..13 → itc/E (E1-E4 collapsed)', () => {
    for (const x of [10, 11, 12, 13]) {
      expect(classifyCellName(tile(x))).toEqual({ det: 'TILE', subDet: 'itc', sampling: 'E' });
    }
  });

  it('x=14 → mbts/outer', () => {
    expect(classifyCellName(tile(14))).toEqual({ det: 'TILE', subDet: 'mbts', sampling: 'outer' });
  });

  it('x=15 → mbts/inner', () => {
    expect(classifyCellName(tile(15))).toEqual({ det: 'TILE', subDet: 'mbts', sampling: 'inner' });
  });

  it('unknown x → falls back to extended/D', () => {
    expect(classifyCellName(tile(99))).toEqual({ det: 'TILE', subDet: 'extended', sampling: 'D' });
  });

  it('case sensitivity: lowercase t does not match (regression for BARh_1 vs BARH_1)', () => {
    // The Tile regex requires capital T. Lowercase prefix should not match.
    expect(classifyCellName(mk('t1p0_0'))).toBeNull();
  });

  it('eta side n is also accepted', () => {
    expect(classifyCellName(tile(1, 'n'))).toEqual({
      det: 'TILE',
      subDet: 'barrel',
      sampling: 'A',
    });
  });
});

describe('classifyCellName — match-order priority', () => {
  // The classifier scans every segment and returns the first detector match.
  // Order matters when a path contains multiple recognisable prefixes.
  it('first matching segment wins', () => {
    // EB segment appears first → LAr barrel, even though a Tile prefix follows.
    expect(classifyCellName('top→EB_2_0_p_0_0→T1p0_0').det).toBe('LAR');
  });

  it('only the prefix shape matters, not its position in the path', () => {
    // Tile prefix in segment 2 matches even with junk in segment 1.
    expect(classifyCellName('top→junk→T1p0_0→leaf').subDet).toBe('barrel');
  });
});

describe('_classifyTile — exhaustive layer table', () => {
  // Direct unit tests for the pure layer→sampling table, decoupled from the
  // mesh-name regex. Useful to catch off-by-one when the build sequence in
  // tools/const/CaloBuild.C changes.
  const cases = [
    [1, 'barrel', 'A'],
    [23, 'barrel', 'BC'],
    [4, 'barrel', 'D'],
    [5, 'extended', 'A'],
    [6, 'extended', 'B'],
    [7, 'extended', 'D'],
    [8, 'extended', 'D'],
    [9, 'extended', 'B'],
    [10, 'itc', 'E'],
    [11, 'itc', 'E'],
    [12, 'itc', 'E'],
    [13, 'itc', 'E'],
    [14, 'mbts', 'outer'],
    [15, 'mbts', 'inner'],
  ];
  for (const [x, subDet, sampling] of cases) {
    it(`x=${x} → ${subDet}/${sampling}`, () => {
      expect(_classifyTile(x)).toEqual({ det: 'TILE', subDet, sampling });
    });
  }
});
