# CGV Web — User TWiki

**Calorimeter Geometry Viewer (CGV) — Web Edition**
NIPSCERN · UFJF · ATLAS Experiment at CERN

A browser-based 3-D viewer for the ATLAS calorimeter. Loads a pre-baked
geometry (`CaloGeometry.glb`) and overlays per-event energy deposits from
**JiveXML** files — either live from [ATLAS Live / ATLANTIS](https://atlas-live.cern.ch),
or uploaded from disk.

![Viewer overview](images/viewer-overview.png)
<!-- Drop a full-viewer screenshot into twiki/images/viewer-overview.png -->

---

## Topics

| Page | What it covers |
|------|----------------|
| [Overview](Overview.md)                     | What CGV is, who it is for, how it fits into ATLAS tooling |
| [Getting Started](GettingStarted.md)        | Open the viewer, load your first event |
| [User Interface](UserInterface.md)          | Every button in the sidebar, toolbar, and side panels |
| [Data Modes](DataModes.md)                  | Live · Local · Samples — where events come from |
| [Energy Thresholds](EnergyThresholds.md)    | TILE / LAr / FCAL / HEC / Track / Cluster threshold panels |
| [Geometry](Geometry.md)                     | Detector layers, ghost envelopes, beam axis |
| [Event Data](EventData.md)                  | JiveXML format, cell IDs, energies, tracks, clusters |
| [Keyboard Shortcuts](KeyboardShortcuts.md)  | All hotkeys |
| [Troubleshooting](Troubleshooting.md)       | Common issues and fixes |
| [Glossary](Glossary.md)                     | ATLAS / calorimeter / web-3D vocabulary |
| [References](References.md)                 | External links — ATLAS, CERN, TileCal, TWiki |

---

## Quick facts

- **Runs entirely in the browser.** No backend — WebGL + WebAssembly.
- **Data source:** JiveXML events with `<TILE>`, `<LAr>`, `<HEC>`, `<FCAL>`,
  `<Track>`, and `<Cluster>` blocks produced by the ATLAS ATHENA framework.
- **Geometry source:** `CaloGeometry.root` → compiled to `CaloGeometry.glb`
  (see the project [README](../README.md) for the build pipeline).
- **Language:** English, Français, Norsk, Português (switch via the globe button).

---

## External links

- [ATLAS Experiment — CERN](https://atlas.cern)
- [ATLAS Live (ATLANTIS)](https://atlas-live.cern.ch)
- [CERN home](https://home.cern)
- [NIPSCERN Laboratory — UFJF](https://nipscern.com)

---

*Last updated: 2026-04-16. Maintained by the CGV development team.*
