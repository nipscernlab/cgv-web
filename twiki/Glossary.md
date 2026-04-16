# Glossary

Short definitions for the terms used across this TWiki.

| Term | Meaning |
|------|---------|
| **A-side / C-side** | ATLAS halves along the beam. A-side = positive z, C-side = negative z. |
| **ATLAS**           | A Toroidal LHC ApparatuS. One of the four main LHC detectors at CERN. |
| **ATHENA**          | ATLAS offline software framework (simulation, reconstruction, analysis). |
| **ATLANTIS**        | Java event-display for ATLAS; produces JiveXML. See [ATLAS Live](https://atlas-live.cern.ch). |
| **Cell**            | One readout element of the calorimeter (one ID). |
| **Cinema mode**     | UI-hidden, auto-rotating view (shortcut **C**). |
| **Cluster**         | Group of cells reconstructed as a single energy object. |
| **EB**              | Extended Barrel (TileCal / outer envelope). |
| **EM**              | Electromagnetic (part of LAr). |
| **η (eta)**         | Pseudorapidity. η = −ln tan(θ/2). TileCal covers \|η\| < 1.7. |
| **FCAL**            | Forward Calorimeter (\|η\| > 3.2). |
| **Ghost**           | Translucent detector-envelope outline — see [Geometry](Geometry.md#ghost-envelopes). |
| **GLB**             | glTF binary — packed 3-D geometry file served to the browser. |
| **HEC**             | Hadronic End-Cap Calorimeter (LAr, 1.5 < \|η\| < 3.2). |
| **Hit**             | An energy deposit in a cell for one event. |
| **ID (compact)**    | 64-bit ATLAS identifier for a cell (decoded by the WASM parser). |
| **JiveXML**         | XML event format produced by ATHENA / ATLANTIS. See [Event Data](EventData.md). |
| **LAr**             | Liquid Argon calorimeter. |
| **LB**              | Long Barrel (TileCal / outer envelope). |
| **LHC**             | Large Hadron Collider — CERN. |
| **MBTS**            | Minimum-Bias Trigger Scintillators (labels appear in cluster lists). |
| **Mesh**            | A 3-D object inside the GLB (one per cell or envelope). |
| **MeV / GeV**       | Mega / Giga electron-volts. 1 GeV = 1000 MeV. |
| **Module**          | TileCal phi sector (0–63). |
| **N / S (cones)**   | Visual markers on the [beam axis](Geometry.md#beam-axis) — N = A-side, S = C-side. |
| **φ (phi)**         | Azimuthal angle in the transverse plane (−π … π). |
| **pT**              | Transverse momentum. |
| **ROOT**            | CERN data format and framework. Source of `CaloGeometry.root`. |
| **Sampling**        | Calorimeter layer depth index (TileCal: 0=A, 1=BC, 2=D, 3=E/gap). |
| **Section**         | TileCal region: 1 = Long Barrel, 2 = Extended Barrel, 3 = ITC/gap. |
| **Side**            | Detector half. WASM: −1 = C, +1 = A. |
| **Threshold**       | Minimum energy or pT below which objects are hidden. See [Energy Thresholds](EnergyThresholds.md). |
| **TileCal**         | Tile Calorimeter — scintillating tiles in the central region. |
| **Tower**           | TileCal eta index within a section. |
| **Track**           | Reconstructed charged-particle trajectory. |
| **WASM**            | WebAssembly — binary format used for the [ID parser](EventData.md#cell-ids). |

---

*See also:* [References](References.md)
