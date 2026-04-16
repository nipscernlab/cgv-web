# Troubleshooting

## Loading never finishes

The status shows *Initializing…* forever.

- Check the browser console (F12). The viewer needs **two** assets:
  - `geometry_data/CaloGeometry.glb.gz` (must be gzipped).
  - `parser/pkg/atlas_id_parser_bg.wasm`.
- Make sure you are serving over HTTP, not `file://`. WebAssembly and
  streaming gzip decompression both require a real origin.
- If the GLB is missing the viewer prints *"CaloGeometry.glb.gz not found"*
  in the status bar and stays blank — see the build pipeline in the project
  [README](../README.md).

## Geometry loads but no cells appear after uploading an event

- Confirm the XML is **JiveXML** (`<Event>` root with a `<TILE>` / `<LAr>`
  child). Non-JiveXML formats are not parsed.
- The status bar shows how many cells were *lit*, *unmapped*, and *skipped*.
  A large *unmapped* count usually means a sub-detector without an ID → mesh
  mapping (only TileCal is currently mapped for IDs not in the dictionary).

## "WASM error" in the status bar

The ATLAS-ID parser failed to initialise. Most common cause: the
`.wasm` file is served with the wrong MIME type. Your static server must
send `Content-Type: application/wasm`. Modern servers (`python -m http.server`,
`npx serve`, nginx with `mime.types`) do this by default.

## The Live tab never shows events

- Live pulls from `atlas-live.cern.ch`. The `live_atlas/` bridge may be
  disabled in your deployment.
- Check the request counter badge in the status bar — if it climbs but no
  events arrive, ATLANTIS is idle or filtering them out.

## Ghost switches don't do anything

Open the browser console. If you see *"meshByName.get(…) undefined"*, the
GLB was rebuilt without the envelope meshes (e.g. `--tilecal-only`). The
nine ghost names are listed in [Geometry](Geometry.md#ghost-envelopes).

## Screenshots come out black

Chrome and some ad-blockers strip `preserveDrawingBuffer` from the WebGL
context. The viewer explicitly sets it to `true`, so the fix is usually to
disable the extension for `localhost`.

## Performance is poor on a low-end laptop

- Turn off detector layers you don't need (**T / L / H**).
- Raise the [energy threshold](EnergyThresholds.md) — fewer visible cells
  means fewer draw calls.
- Cinema mode keeps rotating even when idle; press **C** to exit.

---

*See also:* [Getting Started](GettingStarted.md) ·
[User Interface](UserInterface.md)
