# Overview

CGV Web (Calorimeter Geometry Viewer) is a lightweight **event display** for
the ATLAS calorimeter. It runs in any modern browser and renders individual
LHC collision events on top of a pre-baked 3-D geometry of the detector.

## What it shows

| Layer           | Source                                   | Visual |
|-----------------|------------------------------------------|--------|
| Geometry        | `geometry_data/CaloGeometry.glb`         | Static mesh per cell |
| Cell energies   | JiveXML `<TILE>` / `<LAr>` / `<HEC>` / `<FCAL>` | Coloured cells (blue → red) |
| Tracks          | JiveXML `<Track>`                        | Yellow polylines |
| Clusters        | JiveXML `<Cluster>`                      | Red dashed η/φ lines |
| Ghost envelopes | GLB bounding volumes                     | Translucent grey outlines |
| Beam axis       | Procedural                               | Blue line with N/S cones |

## Who it is for

- **Physicists** inspecting single-event topology, noise, or calibration runs.
- **Students** in ATLAS Masterclass or particle-physics courses.
- **Developers** testing reconstruction, jet finding, or ID dictionaries.
- **Outreach** — the viewer is designed to look good on a projector.

## How it compares

| Tool              | Purpose                                    | Runs in browser? |
|-------------------|--------------------------------------------|------------------|
| **CGV Web**       | Calorimeter-centric, fast, live feed       | Yes |
| [ATLANTIS](https://atlas-live.cern.ch) | Full ATLAS event display (Java)      | No (desktop app) |
| [Atlantis Live](https://atlas-live.cern.ch) | Public live view                   | Yes (streamed) |

CGV Web is intentionally narrow — it focuses on the calorimeter cell-level
picture, with the best possible rendering performance for 193 k meshes.

## Next

→ [Getting Started](GettingStarted.md)
→ [User Interface](UserInterface.md)

*See also:* [References](References.md) · [Glossary](Glossary.md)
