# Energy Thresholds

Every object type has its own **threshold panel** on the right side of the
viewer. Open with **E** or the sliders button in the toolbar.

![TILE threshold panel](images/tile-threshold.png)

Tabs across the top: **TILE · LAr · FCAL · HEC · Track · Cluster**.
Each tab is independent — setting the TILE threshold to 500 MeV does not
affect LAr cells.

---

## How a threshold works

A threshold hides objects whose energy (or transverse momentum, for tracks)
falls below the set value. The object stays in memory — toggling the
threshold down restores it instantly without reparsing the event.

| Object   | Quantity compared | Hidden when… |
|----------|-------------------|--------------|
| TILE cell    | energy, MeV            | `E < threshold` |
| LAr cell     | energy, MeV            | `E < threshold` |
| FCAL cell    | energy, MeV            | `E < threshold` |
| HEC cell     | energy, MeV            | `E < threshold` |
| Track        | \|pT\|, GeV            | `pT < threshold` |
| Cluster      | ET, GeV                | `ET < threshold` |

## Slider

The vertical track runs from the event's **min** (bottom, dim colour) to
**max** (top, bright colour). Drag the thumb, or type a value in the input
below:

- `500`       → 500 MeV (bare numbers are MeV).
- `500 MeV`   → 500 MeV.
- `1.5 GeV`   → 1500 MeV.
- `1,5 GeV`   → 1500 MeV (comma accepted as decimal separator).

The slider uses a **log scale** so one pixel of travel covers a wider span
at high energy — this is what you want when events span 1 MeV → 10 GeV.

## Per-tab colour gradient

| Tab     | Min colour | Max colour |
|---------|------------|------------|
| TILE    | Yellow     | Dark red |
| LAr     | Green      | Violet |
| FCAL    | Light copper | Dark copper |
| HEC     | Cyan       | Dark blue |
| Track   | Dim yellow | Bright yellow |
| Cluster | Dark red   | Bright red |

## Cluster filter

The Cluster tab has an extra switch: **Cluster Threshold**. When **on**,
cells that do **not** belong to a cluster above the threshold are also
hidden — lets you highlight the cells that drove each cluster.
MBTS labels are matched at the same time.

---

*See also:* [Geometry](Geometry.md) · [Event Data](EventData.md)
