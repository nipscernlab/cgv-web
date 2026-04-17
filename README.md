<p align="center">
  <a href="https://github.com/nipscernlab/cgv-web" target="_blank" style="text-decoration:none;">
    <img src="https://github.com/nipscernlab/nipscernweb/blob/main/assets/icons/icon_cgv.svg"
         alt="CGV-WEB"
         width="120"
         style="vertical-align:middle;margin:0 12px;border:none;">
  </a>
</p>

<h1 align="center">CGV Web — Calorimeter Geometry Viewer</h1>

<p align="center">
  A browser-based 3D viewer for the <b>ATLAS Tile Calorimeter (TileCal)</b> at the LHC.
</p>

---

CGV Web loads CERN `.root` geometry files, compiles them to a compact mesh
format, and renders them with **Three.js + WebGL**. It overlays live event
data (cells, clusters, particle tracks) parsed from **JiveXML** samples
produced by ATLANTIS.

This project is the web continuation of the PhD thesis of
**Prof. Dr. Luciano Manhães de Andrade Filho**, developed at
**NIPSCERN** (Núcleo de Instrumentação e Processamento de Sinais for CERN) —
**UFJF** (Universidade Federal de Juiz de Fora, Brazil), in partnership with
the CERN ATLAS Experiment. Undergraduate developer:
**Chrysthofer Arthur Amaro Afonso**.

---

## Quick start (just run the viewer)

You only need a static HTTP server at the project root:

```bash
# any of these works
python -m http.server 8080
npx serve .
```

Then open <http://localhost:8080>. All compiled assets
(`geometry_data/CaloGeometry.glb`, `parser/pkg/*.wasm`) are committed, so no
build step is required to view the app.

---

## Full build pipeline (regenerate geometry + parser)

The build pipeline is only needed if you want to:

- regenerate `CaloGeometry.glb` from a new `.root` file, or
- rebuild the Rust ATLAS-ID parser WASM module.

### 1. Required tools

| Tool         | Version    | Purpose                                  |
|--------------|------------|------------------------------------------|
| Node.js      | ≥ 18       | Runs the `.root` → `.glb` pipeline       |
| npm          | bundled    | Installs JS dependencies                 |
| Rust         | stable     | Compiles the ATLAS ID parser             |
| `wasm-pack`  | ≥ 0.12     | Builds the parser to WebAssembly         |

Install Rust + wasm-pack:

```bash
# Rust (rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Linux/macOS
# or on Windows: https://www.rust-lang.org/tools/install

# wasm-pack
cargo install wasm-pack
```

### 2. Install Node dependencies

From the project root:

```bash
npm install --ignore-scripts
```

`--ignore-scripts` is required because `jsroot` ships postinstall scripts that
aren't needed for our usage.

### 3. Prepare the patched jsroot modules

JSROOT's geometry modules use relative imports that don't resolve outside its
own tree. `setup/setup.mjs` copies and patches the two files we need
(`geobase.mjs`, `csg.mjs`) into `setup/lib/`:

```bash
cd setup
node setup.mjs
```

### 4. Compile `.root` → `.glb`

Place the source file at `geometry_data/CaloGeometry.root`, then run:

```bash
node setup/root2scene.mjs geometry_data/CaloGeometry.root --out geometry_data
```

Output:

- `geometry_data/CaloGeometry.glb` — glTF binary (optimized, ~50+ MB)

### 5. Optimize the GLB

The raw GLB carries dead vertex data (UVs, tangents, materials) that the viewer
does not use. Strip + quantize it:

```bash
node setup/optimize_glb.mjs --quantize
# writes geometry_data/CaloGeometry_opt.glb
```

Then replace the original:

```bash
mv geometry_data/CaloGeometry_opt.glb geometry_data/CaloGeometry.glb
```

Typical reduction: **~330 MB → ~70 MB** (−78%), visually identical.
After replacing, bump `GEO_CACHE_VER` in `index.html` to force client cache refresh.

### 6. Build the Rust ATLAS-ID parser (WASM)

```bash
cd parser
wasm-pack build --target web --release
```

Output: `parser/pkg/atlas_id_parser.js` + `atlas_id_parser_bg.wasm`, loaded
directly by [js/main.js](js/main.js).

---

## Directory structure

```
cgv-web/
├── index.html                  entry point (HTML only)
├── css/style.css               all styles
├── js/main.js                  viewer logic (Three.js, UI, networking)
├── assets/                     icons, fonts, images (incl. cgvweb_icon.svg)
├── const/                      CaloBuild.C, CaloGeoConst.h (ATLAS geometry constants)
├── default_xml/                bundled JiveXML samples + index.json
├── parser/                     Rust ATLAS-ID parser
│   ├── src/lib.rs              Rust source
│   ├── Cargo.toml
│   └── pkg/                    wasm-pack output (committed)
├── geometry_data/
│   ├── CaloGeometry.root       source geometry (input)
│   └── CaloGeometry.glb        optimized glTF binary
├── setup/                      build pipeline scripts
│   ├── setup.mjs               patches jsroot modules
│   ├── root2scene.mjs          .root → .glb compiler
│   ├── optimize_glb.mjs        GLB stripper / quantizer
│   └── lib/                    patched jsroot modules
├── nipscern/                   lightweight standalone preview (pre-baked scene_data.bin)
├── twiki/                      ATLAS-style user documentation (Markdown)
├── atlantis/                   ATLANTIS bundled archive
├── live_atlas/                 live ATLANTIS bridge (optional)
├── debug/                      debug scripts + dumps
└── docs/                       design notes & PDFs
```

---

## Keyboard shortcuts

| Key        | Action                                  |
|------------|-----------------------------------------|
| `G`        | Toggle ghost frame                      |
| `B`        | Toggle beam axis                        |
| `I`        | Toggle cell info (tooltip)              |
| `R`        | Reset camera                            |
| `C`        | Cinema mode                             |
| `M`        | Toggle left menu (sidebar)              |
| `E`        | Energy threshold panel                  |
| `P`        | Screenshot                              |
| `S`        | Settings                                |
| `T`        | Toggle TILE calorimeter                 |
| `L` / `A`  | Toggle LAr calorimeter                  |
| `H`        | Toggle HEC calorimeter                  |
| `J`        | Toggle particle tracks                  |
| `K`        | Toggle clusters (η/φ lines)             |
| `Esc`      | Close overlays / exit modes             |

---

## Documentation

User-facing documentation lives in [`twiki/`](twiki/) — start at
[`twiki/WebHome.md`](twiki/WebHome.md).

---

## License

ISC. See `package.json`.

## Links

- Repo: <https://github.com/nipscernlab/cgv-web>
- Issues: <https://github.com/nipscernlab/cgv-web/issues>
