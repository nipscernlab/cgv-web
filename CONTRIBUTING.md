# Contributing to CGV Web

Short guide for day-to-day work on the viewer and its build pipeline. For
geometry / WASM rebuilds, see the
[full build pipeline](README.md#full-build-pipeline-regenerate-geometry--parser)
in the README.

## Dev setup

Requirements: **Node.js ≥ 18**. Only needed for the linter, formatter,
type-checker, and test runner — the viewer itself runs on any static HTTP
server.

```bash
npm install --ignore-scripts
```

`--ignore-scripts` avoids `jsroot`'s postinstall hooks, which aren't needed
for our usage.

## Running locally

```bash
npm run dev            # python serve.py on :8080 (+ /api/xml/* folder API)
```

Windows without Python: `npm run start:win` (uses the bundled PowerShell
static server).

For the bare static viewer (no XML folder API), any static server works:
`python -m http.server 8080`, `npx serve .`, etc.

## Before you commit

All four of these should pass:

```bash
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit (covers files with // @ts-check)
npm run format:check   # Prettier verify
npm test               # Vitest
```

The same four gates run in CI on every push and PR — see
[.github/workflows/ci.yml](.github/workflows/ci.yml). If `format:check`
fails, run `npm run format` to auto-fix. If `lint` fails,
`npm run lint:fix` handles most of it.

## Code style

Prettier-enforced: 2-space indent, single quotes, trailing commas, 100-column
print width. **Don't hand-align assignment columns** — Prettier collapses
them.

JSDoc `// @ts-check` is opt-in per file. Annotated so far:
[js/utils.js](js/utils.js), [js/palette.js](js/palette.js),
[js/state.js](js/state.js). New frontend modules are encouraged (but not
required) to add `// @ts-check` + JSDoc for exports.

## Adding tests

Unit tests live in `tests/` as `*.test.mjs`. Good candidates: pure functions
([js/utils.js](js/utils.js)), bit-level encoders
([js/state.js](js/state.js)), XML parsers, anything without DOM / WebGL
dependencies.

```bash
npm run test:watch     # iterate on a failing test
```

## Commit messages

One-line subject in the style of recent history — lowercase area prefix,
concise description, no period at the end:

```
outlines: uniform black @ 50% opacity for every cell
visibility(fcal): fade the permanent cell outline
cleanup: drop dead xml helpers + unused imports
```

Body only when the *why* isn't obvious from the diff.

## Layout reminders

- Frontend code: `js/` (ES modules, loaded by `index.html` via importmap)
- Build pipeline: `setup/` (Node, ES modules; `setup/lib/` is vendored
  jsroot — don't reformat or lint it)
- Rust WASM parser: `parser/src/lib.rs` (`wasm-pack build --target web
  --release` regenerates `parser/pkg/`)
- Tests: `tests/`
- Styles: `css/style.css` (single file)

## Questions / bugs

File an issue: <https://github.com/nipscernlab/cgv-web/issues>
