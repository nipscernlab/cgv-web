#!/usr/bin/env python3
"""
generate_test_xml.py
====================
Generates a full-coverage ATLAS calorimeter test XML file for CGV-WEB.

Covers all 26 layers (l=0..25) with:
  • Both Z-sides  → eta  > 0  (Side A) and  eta < 0  (Side C)
  • All valid phi  → 0..phi_seg-1
  • All valid eta  → 0..N-1 (and mirrored as negatives for Side C)
  • Energy ranging  LINEARLY from near-zero → max_energy_MeV

The energy assignment sweeps through the entire cell population
so that every colour in the gradient bar is represented and the
threshold slider is fully exercisable.

Usage
-----
    python generate_test_xml.py [--out atlas_test.xml] [--emax 500000] [--seed 42]

Output
------
    atlas_test.xml   (~few MB, valid CGV XML)
"""

import argparse
import math
import xml.etree.ElementTree as ET
import random
import sys

# ── Layer configuration (mirrors lib.rs build_layer_table) ──────────────────
#
#   (phi_seg, eta_count_A, eta_count_C)
#   eta_count_A  = number of positive eta indices  (0 .. N-1)
#   eta_count_C  = same, but rendered at -idx  (Side C)
#   Both sides share the same phi_seg.
#
LAYERS = [
    #  l   phi  etaA  etaC
    (  0,  64,   10,   10 ),   # Tile row 0
    (  1,  64,   10,   10 ),   # Tile rows 1+2 merged
    (  2,  64,    4,    4 ),   # Tile row 3
    (  3,  64,    5,    5 ),   # Tile row 4
    (  4,  64,    5,    5 ),   # Tile row 5
    (  5,  64,    2,    2 ),   # Tile row 6
    (  6,  64,    1,    1 ),   # Tile row 7
    (  7,  64,    1,    1 ),   # Tile row 8
    (  8,  64,    1,    1 ),   # Tile row 9
    (  9,  64,    1,    1 ),   # Tile row 10
    ( 10,  64,    1,    1 ),   # Tile row 11
    ( 11,  64,    1,    1 ),   # Tile row 12
    ( 12,   8,    1,    1 ),   # Tile row 13
    ( 13,   8,    1,    1 ),   # Tile row 14
    ( 14,  64,   14,   14 ),   # HEC rows 0-1
    ( 15,  64,   14,   14 ),   # HEC rows 1-2
    ( 16,  64,   12,   12 ),   # HEC rows 3-4
    ( 17,  64,   11,   11 ),   # HEC rows 5-6
    ( 18,  64,   61,   61 ),   # LAr Barrel layer 0
    ( 19,  64,  451,  451 ),   # LAr Barrel layer 1  (fine-grained strip)
    ( 20, 256,   57,   57 ),   # LAr Barrel layer 2
    ( 21, 256,   27,   27 ),   # LAr Barrel layer 3
    ( 22,  64,   12,   12 ),   # LAr EndCap layer 0
    ( 23,  64,  216,  216 ),   # LAr EndCap layer 1
    ( 24, 256,   51,   51 ),   # LAr EndCap layer 2
    ( 25, 256,   34,   34 ),   # LAr EndCap layer 3
]

def parse_args():
    p = argparse.ArgumentParser(description="Generate CGV-WEB test XML")
    p.add_argument("--out",   default="atlas_test.xml", help="Output file path")
    p.add_argument("--emax",  type=float, default=500_000.0,
                   help="Maximum cell energy in MeV (default 500 GeV)")
    p.add_argument("--emin",  type=float, default=10.0,
                   help="Minimum cell energy in MeV (default 10 MeV)")
    p.add_argument("--seed",  type=int,   default=None,
                   help="Random seed for energy jitter (optional)")
    p.add_argument("--jitter",type=float, default=0.08,
                   help="Fractional random jitter on energy [0..1], default 0.08")
    p.add_argument("--count", action="store_true",
                   help="Just print estimated cell count and exit")
    return p.parse_args()


def cell_count_estimate():
    total = 0
    for l, phi, etaA, etaC in LAYERS:
        total += phi * etaA   # Side A
        total += phi * etaC   # Side C
    return total


def generate(args):
    rng = random.Random(args.seed)

    total_cells = cell_count_estimate()
    print(f"Estimated cells: {total_cells:,}")

    # Build a flat list of (l, eta, phi) — both sides
    cells = []
    for l, phi_seg, etaA, etaC in LAYERS:
        # Side A  → positive eta
        for eta in range(etaA):
            for phi in range(phi_seg):
                cells.append((l, eta, phi))
        # Side C  → negative eta  (eta_idx < 0 triggers z_sign = -1 in lib.rs)
        for eta in range(1, etaC + 1):          # skip eta=0 to avoid duplicating midplane
            for phi in range(phi_seg):
                cells.append((l, -eta, phi))

    N = len(cells)
    print(f"Actual cells generated: {N:,}")

    emin, emax = args.emin, args.emax

    # Energy sweep: linearly from emin → emax across ALL cells (sorted by index)
    # so the gradient covers the full range continuously.
    root = ET.Element("cells")
    root.set("source", "CGV-WEB synthetic test")
    root.set("generator", "generate_test_xml.py")
    root.set("cell_count", str(N))
    root.set("emin_MeV",  f"{emin:.1f}")
    root.set("emax_MeV",  f"{emax:.1f}")

    # Shuffle for a realistic, scattered look across the detector
    rng.shuffle(cells)

    for i, (l, eta, phi) in enumerate(cells):
        # Linear ramp 0→1 over all cells
        t = i / (N - 1) if N > 1 else 1.0

        # Perceptually uniform energy in log-space (looks better on slider)
        log_e = math.log(emin) + t * (math.log(emax) - math.log(emin))
        energy = math.exp(log_e)

        # Add small fractional jitter so adjacent cells look distinct
        if args.jitter > 0:
            energy *= (1.0 + rng.uniform(-args.jitter, args.jitter))
        energy = max(emin * 0.1, energy)

        cell = ET.SubElement(root, "cell")
        cell.set("l",   str(l))
        cell.set("eta", str(eta))
        cell.set("phi", str(phi))
        cell.set("e",   f"{energy:.3f}")

    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ", level=0)

    out_path = args.out
    with open(out_path, "wb") as f:
        tree.write(f, encoding="utf-8", xml_declaration=True)

    import os
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"Written: {out_path}  ({size_mb:.1f} MB)")
    print(f"Energy range: {emin:.1f} MeV → {emax/1000:.1f} GeV  (log-space sweep)")
    print(f"Layers covered: {len(LAYERS)}  (l=0..25)")
    print(f"Both Z-sides (Side A η>0 and Side C η<0) included ✓")


def main():
    args = parse_args()
    if args.count:
        print(f"Estimated cell count: {cell_count_estimate():,}")
        sys.exit(0)
    generate(args)


if __name__ == "__main__":
    main()