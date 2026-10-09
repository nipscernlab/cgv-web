# The full ATLAS geometry is public (GeoModel SQLite)

The GeoModel project publishes the ATLAS detector geometry as SQLite files, with no login:

- https://geomodel.web.cern.ch/atlas-geometry-data/ : `geometry_atlas.db` (2024)
- https://geomodel.web.cern.ch/atlas-geometry-data/old/ : one file per geometry tag, including
  `geometry-ATLAS-R2-2016-01-00-01.db`, `geometry-ATLAS-R2-2016-01-02-01.db`,
  `geometry-ATLAS-R3S-2021-02-00-00.db` and `geometry-ATLAS-R3S-2021-03-00-00.db` (52 MB)

The R3S-2021-03-00-00 file holds the whole detector (pixel, SCT, LAr, Tile, muon spectrometer, BCM): 58 807 logical
volumes with their shapes, placements, the volume tree, and the materials with their element composition and density.

## Tables

| Table | Content |
|---|---|
| `LogVols` | `id, name, shape, material` |
| `PhysVols`, `FullPhysVols` | physical volumes (point to a logical volume) |
| `Shapes` | `id, type, parameters` (GeoTubs, GeoPcon, GeoTrd, ...) |
| `Transforms`, `AlignableTransforms`, `SerialTransformers`, `Functions` | placements |
| `ChildrenPositions` | the volume tree |
| `Materials` | `id, name, density, elements` |
| `Elements` | `id, name, symbol, Z, A` |
| `NameTags`, `IdentifierTags`, `SerialIdentifiers` | names and identifiers of placed volumes |

Units: the density in `Materials` is in GeoModel internal units; divide by 6.2415e18 to get g/cm3 (`std::Aluminium` gives
2.70). The `elements` column is `element_id:mass_fraction;...`.

## Reading it

```python
import sqlite3
c = sqlite3.connect("geometry-ATLAS-R3S-2021-03-00-00.db")
for name, shape, material in c.execute(
        "select l.name, s.type, m.name from LogVols l join Shapes s on l.shape = s.id "
        "join Materials m on l.material = m.id where l.name like 'LAr::Barrel::Presampler%'"):
    print(name, shape, material)
```

## Why it matters here

It is an official, public and versioned source for geometry numbers that are otherwise read from figures, TDRs or the
geometry database on CVMFS (which needs an ATLAS account). Before using a geometry value that is not in the JINST paper
or the open Athena code, check whether it is in this file, and cite the file and its tag.

Not checked yet: whether the values that this repository says came "from the DB" (for example `LaBa_eta`, `LaEb_eta`)
appear in it, and whether a Run 4 (ITk) geometry is published.
