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

<p align="center">
  <a href="https://github.com/nipscernlab/cgv-web/actions/workflows/ci.yml"><img src="https://github.com/nipscernlab/cgv-web/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nipscernlab/cgv-web" alt="License"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2018-brightgreen" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/three.js-0.162-green" alt="Three.js 0.162">
  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4" alt="Code style: Prettier">
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

```bash
node scripts/fetch-geometry.mjs       # ~5 MB from the GitHub Release
python -m http.server 8080            # or: npx serve .
```

Then open <http://localhost:8080>.

The geometry asset (`geometry_data/CaloGeometry.glb.gz`, ~5 MB) is hosted on
[GitHub Releases](https://github.com/nipscernlab/cgv-web/releases) and fetched
on demand — no `npm install` or build pipeline required just to view the app.
The Rust ATLAS-ID parser (`parser/pkg/*.wasm`) is committed.

If you have npm installed, `npm run dev` does the fetch + serve in one step.

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

### 4. Fetch the `.root` inputs

```bash
npm run fetch:geometry:source
```

Downloads `CaloGeometry.root` and `atlas.root` (~24 MB) from the GitHub Release
into `geometry_data/`. Skip this step if you've placed your own `.root` files
there manually.

### 5. Compile `.root` → `.glb`

```bash
node setup/root2scene.mjs geometry_data/CaloGeometry.root \
                          --atlas geometry_data/atlas.root \
                          --atlas-subtree-node MUCH_1,MUC1_2 \
                          --out geometry_data
```

Outputs (in `geometry_data/`):

- `CaloGeometry.glb` — optimized glTF binary (~50 MB)
- `CaloGeometry.glb.gz` — gzip-compressed (~5 MB; this is what the viewer loads)

After regenerating, bump `GEO_CACHE_VER` in `index.html` to force a client
cache refresh.

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
├── geometry_data/              gitignored; populated by scripts/fetch-geometry.mjs
├── scripts/
│   └── fetch-geometry.mjs      downloads .glb.gz / .root from GitHub Releases
├── setup/                      build pipeline scripts
│   ├── setup.mjs               patches jsroot modules
│   ├── root2scene.mjs          .root → .glb compiler (also writes .glb.gz)
│   └── lib/                    patched jsroot modules
├── nipscern/                   lightweight standalone preview (pre-baked scene_data.bin)
├── twiki/                      ATLAS-style user documentation
├── atlantis/                   ATLANTIS bundled archive
├── live_atlas/                 live ATLANTIS bridge (optional)
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
[`twiki/WebHome.twiki`](twiki/WebHome.twiki).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev workflow — local setup,
tests, lint, type-check, and commit conventions.

## License

NIPSCERN Non-Commercial Source License — free for research and education;
commercial use requires written permission from contact@nipscern.com.
See [`LICENSE`](LICENSE) for full text.

## Links

- Repo: <https://github.com/nipscernlab/cgv-web>
- Issues: <https://github.com/nipscernlab/cgv-web/issues>
