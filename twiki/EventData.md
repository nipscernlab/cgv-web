# Event Data

CGV Web reads **JiveXML** — the event-display output of ATLAS's ATHENA
framework, also consumed by [ATLANTIS](https://atlas-live.cern.ch).
An event is a single `<Event>` element holding one block per sub-system.

---

## JiveXML at a glance

```xml
<Event RunNumber="516390" EventNumber="410843827" DateTime="...">
  <TILE count="5182" storeGateKey="AllCalo">
    <id>4899916394579099648 4899916463298576384 ...</id>
    <energy>-0.0052 0.0719 0.109 ...</energy>
  </TILE>
  <LAr count="..."> ... </LAr>
  <HEC count="..."> ... </HEC>
  <FCAL count="..."> ... </FCAL>
  <Track count="...">
    <pt>...</pt>
    <numPolyline>...</numPolyline>
    <polylineX>...</polylineX>
    <polylineY>...</polylineY>
    <polylineZ>...</polylineZ>
  </Track>
  <Cluster count="...">
    <eta>...</eta>
    <phi>...</phi>
    <et>...</et>
    <cells>...</cells>
  </Cluster>
</Event>
```

Parallel-array format: one number per object, one space per separator.
`<id>[i]` corresponds to `<energy>[i]` and so on.

---

## Cell IDs

Each cell is identified by a **64-bit compact ID** defined by the ATLAS
identifier dictionary. CGV decodes these through a Rust → WebAssembly
module ([`parser/src/lib.rs`](../parser/src/lib.rs)) exposing:

```js
parse_atlas_id("4899916394579099648")
// → { valid, subsystem: "TILECAL", fields: [...], cell_name: "LBC01 A1", eta, phi, ... }
```

The decoded fields are used to build the **mesh name** inside the GLB:

```
Calorimeter→Tile{X}{Y}_0→Tile{X}{Y}{K}_{K}→cell_{module}
```

where `X`, `Y`, `K` encode layer-group / side / eta-index. Full algorithm
in the project [README](../README.md) and in the mapping source.

Energies arrive in **GeV** in the XML; the viewer converts to MeV for
thresholds but shows GeV in the tooltip.

---

## Tracks

- `pt` — signed p<sub>T</sub> in GeV (sign is the charge).
- `numPolyline[i]` — number of 3-D points for track `i`.
- `polylineX/Y/Z` — flattened points, ATLAS coordinates in cm.

CGV converts to viewer coordinates (mm, X and Y negated) and renders each
track as a yellow `LineBasicMaterial`. Threshold = minimum |pT|.

---

## Clusters

- `eta`, `phi` — cluster direction.
- `et` — transverse energy in GeV.
- `cells` — list of cell IDs in the cluster (for the cluster-filter switch,
  see [Energy Thresholds](EnergyThresholds.md#cluster-filter)).

Each cluster is drawn as a red dashed line from an inner cylinder (r = 1.4 m,
half-h = 3.2 m) to an outer one (r = 4.25 m, half-h = 6 m) along the (η, φ)
direction.

---

## What the viewer ignores

Anything outside the blocks above — muons, jets, MET, vertices — is parsed
but not rendered. Extending support is mostly a matter of writing a new
per-block parser and a draw routine.

---

*See also:* [Geometry](Geometry.md) · [Data Modes](DataModes.md) ·
[References](References.md)
