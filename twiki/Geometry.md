# Geometry

The calorimeter geometry is pre-baked from ATLAS's official `CaloGeometry.root`
into a single `CaloGeometry.glb` (~50 MB, gzipped to ~8 MB on the wire). The
viewer loads this once on start-up and keeps every mesh hidden until an event
lights it.

Build pipeline: see the project [README](../README.md#full-build-pipeline-regenerate-geometry--parser).

---

## Detector layers

![Detector layers popover](images/layers-panel.png)

The **Layers** popover (toolbar → layers icon) toggles entire sub-detectors.
Switching a layer off hides every cell in that category — independent of the
[energy threshold](EnergyThresholds.md).

| Layer  | Covers                                           | Default |
|--------|---------------------------------------------------|---------|
| **TILE**   | Long Barrel + Extended Barrel (\|η\| < 1.7)     | on |
| **LAr**    | EM barrel + end-cap (\|η\| < 3.2)               | on |
| **HEC**    | Hadronic end-cap (1.5 < \|η\| < 3.2)            | on |

FCAL cells are drawn as instanced tubes and share the TILE/LAr/HEC
visibility flag via their own tab on the threshold panel.

---

## Ghost envelopes

![Ghost popover](images/ghost-panel.png)

Translucent grey outlines of the calorimeter hull. They provide a structural
frame without competing visually with the energy-coloured cells.

Nine per-mesh switches:

| Switch            | GLB mesh                             |
|-------------------|--------------------------------------|
| LB Tile           | `Calorimeter→LBTile_0`               |
| LB Tile·LAr       | `Calorimeter→LBTileLArg_0`           |
| LB LAr            | `Calorimeter→LBLArg_0`               |
| EB Tile +         | `Calorimeter→EBTilep_0`              |
| EB Tile −         | `Calorimeter→EBTilen_0`              |
| EB Tile·HEC +     | `Calorimeter→EBTileHECp_0`           |
| EB Tile·HEC −     | `Calorimeter→EBTileHECn_0`           |
| EB HEC +          | `Calorimeter→EBHECp_0`               |
| EB HEC −          | `Calorimeter→EBHECn_0`               |

All envelopes share a single material (colour `#5C5F66`, ~1 % opacity) so
the hull looks uniform regardless of what the GLB exporter assigned. The
TileCal **φ segmentation** lines (64 azimuthal planes) are drawn on top
when any ghost is visible.

**Keyboard:** **G** flips all ghosts at once. If any ghost is on, **G**
turns everything off; otherwise it restores the default TileCal envelope set.

---

## Beam axis

Toggle **B** or the toolbar beam icon. Shows:

- A blue line along the Z axis (beam direction).
- A red torus at the **N** side (ATLAS A-side, z > 0).
- A green torus at the **S** side (C-side, z < 0).

Useful as a spatial anchor when rotating the view.

---

## Cell colouring

Every cell is drawn with a `MeshBasicMaterial` coloured from a per-detector
palette (see [Energy Thresholds](EnergyThresholds.md)). FCAL tubes get
their colour per-instance from a copper palette.

The viewer does **not** repaint cells while you drag the camera — that
would cost GPU time for no visual change. Repaints happen only when the
event, threshold, or layer visibility changes (`dirty = true`).

---

*See also:* [Energy Thresholds](EnergyThresholds.md) ·
[Event Data](EventData.md) · [References](References.md)
