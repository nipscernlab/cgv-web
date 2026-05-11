# CGV Web — Linux build & deploy reference

Every command needed to take a clean Alma/Rocky/RHEL **9** machine from zero
to a tested `cgv-web` RPM ready to ship to ATLAS P1.

The fully automated equivalent of this whole document is `build-rpm.sh` at
the repository root. This file is the **manual fallback** — copy/paste each
block if anything in the script breaks.

---

## 0. What you need

* Alma/Rocky/RHEL 9.x box (the project targets `el9`).
* A user with `sudo` rights.
* Network access (the build pulls from GitHub Releases and `crates.io`).
* For the upload step: a CERN computing account (lxplus access).

> **Where to run this:** anywhere on disk where you have ~5 GB free
> (npm + cargo caches + rpmbuild tree).

---

## 1. System packages (RPM build chain + basic tools)

```bash
sudo dnf install -y \
  rpm-build rpmdevtools systemd-rpm-macros \
  tar gawk sed gcc make curl which git
```

---

## 2. Node.js ≥ 18

Node 20 is shipped as a `dnf` module on Alma 9:

```bash
sudo dnf module reset  -y nodejs
sudo dnf module enable -y nodejs:20
sudo dnf install      -y nodejs
node --version   # should print v20.x.x
npm  --version
```

---

## 3. Rust toolchain + wasm-pack

```bash
# Rust (rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
  | sh -s -- -y --default-toolchain stable
. "$HOME/.cargo/env"

# WASM target
rustup target add wasm32-unknown-unknown

# wasm-pack (drives wasm-opt + bundler glue)
cargo install wasm-pack

# Verify
rustc      --version
wasm-pack  --version
```

---

## 4. Clone the project

```bash
cd ~/work          # or wherever you keep repos
git clone https://github.com/nipscernlab/cgv-web.git
cd cgv-web
```

> **Note:** the `.glb`, `.glb.gz`, `.root` and `default_xml/*.xml` files are
> **NOT in git** — they live on the GitHub Release `geometry-v4` and are
> pulled by the npm fetch scripts below. See `.gitignore` and
> `tools/scripts/fetch-geometry.mjs` for the full manifest + SHA-256.

---

## 5. Install npm dependencies

```bash
npm install --ignore-scripts
```

`--ignore-scripts` skips `postinstall` hooks from third-party packages
(unused here, faster, safer).

---

## 6. Download the geometry assets

Two flavours:

```bash
# (A) Runtime-only -- enough to run the viewer (~5 MB)
node tools/scripts/fetch-geometry.mjs

# (B) Runtime + sources -- also pulls the .root inputs needed to rebuild
#     the .glb from scratch (~24 MB). Use this if you may want to
#     regenerate the geometry.
node tools/scripts/fetch-geometry.mjs --with-source
```

Both are idempotent (skip files whose SHA-256 already matches the manifest).

---

## 7. Download the JiveXML samples

These power the **SAMPLE** sub-mode of the sidebar
(`public/default_xml/index.json` + a few `.xml` files):

```bash
node tools/scripts/fetch-samples.mjs
```

---

## 8. Build the Rust → WASM ATLAS-ID parser

The runtime needs `public/parser/pkg/atlas_id_parser{.js,_bg.wasm}` —
generated from `parser/src/`:

```bash
# Patch jsroot vendored copy (one-off)
node tools/setup/setup.mjs

# Compile the WASM parser
( cd parser && wasm-pack build --target web --release --out-dir ../public/parser/pkg )
rm -f public/parser/pkg/.gitignore
```

---

## 9. (Optional) Rebuild the merged GLB from .root

Only needed if you changed the geometry inputs. Step 6 with `--with-source`
already gives you a pre-built `CaloGeometry.glb.gz`; this step regenerates it.

```bash
node tools/setup/root2scene.mjs \
  public/geometry_data/CaloGeometry.root \
  --atlas             public/geometry_data/atlas.root \
  --atlas-subtree-node MUCH_1,MUC1_2 \
  --out               public/geometry_data

# gzip the merged glb (the browser fetches the .gz only)
node -e "const fs=require('fs'),z=require('zlib'); \
  fs.createReadStream('public/geometry_data/CaloGeometry.glb') \
    .pipe(z.createGzip({level:9})) \
    .pipe(fs.createWriteStream('public/geometry_data/CaloGeometry.glb.gz'));"
```

---

## 10. Smoke-test the dev server (sanity check before packaging)

```bash
# Point the backend at the bundled samples and run it
XML_FOLDER="$PWD/public/default_xml" python3 serve.py
```

Open `http://localhost:8080/` in a browser. You should see:

- the calorimeter loading
- the **SERVER** sub-mode auto-detecting the backend
- the file list populating from `default_xml/`
- the pencil icon next to the folder path opening the edit input
- changing the path → list reloads (POST `/api/xml/set-folder`)

Stop with `Ctrl+C`.

---

## 11. Build the RPM

### 11a. Bump the version (only if you're cutting a new release)

```bash
sed -i -E 's/^Version:[[:space:]]+.*$/Version:        1.0.5/' cgv-web.spec
# Keep `Epoch: 1` in the spec and keep the version monotonically increasing
# (1.0.5 -> 1.0.6 -> ...) -- never go back to date-based versions.
```

### 11b. Stage a *clean* source tree

The .spec does `cp -r * /var/www/cgv-web/`, so anything in the tarball
ends up served by Apache. We must NOT ship: `node_modules/`, `parser/target/`,
`tools/`, `tests/`, `docs/`, `package*.json`, `.git/`, the unzipped `.glb`,
the `.root` build inputs, the `nipscern/` baker, etc.

```bash
VER=1.0.5         # match Version: in the spec
mkdir -p ~/rpmbuild/{SOURCES,SPECS,BUILD,BUILDROOT,RPMS,SRPMS}

STAGE=$(mktemp -d)
PKG="$STAGE/cgv-web-$VER"
mkdir -p "$PKG/public/parser/pkg" "$PKG/public/geometry_data"

# Top-level files
cp server.py serve.py LICENSE README.md "$PKG/" 2>/dev/null || true

# Static site (whole-folder copies of what's safe)
cp    public/index.html "$PKG/public/"
cp -r public/css         "$PKG/public/"
cp -r public/assets      "$PKG/public/"
cp -r public/js          "$PKG/public/"
cp -r public/vendor      "$PKG/public/"
cp -r public/default_xml "$PKG/public/"
cp -r public/live_atlas  "$PKG/public/"

# Parser: only runtime files
cp public/parser/pkg/atlas_id_parser.js      "$PKG/public/parser/pkg/"
cp public/parser/pkg/atlas_id_parser_bg.wasm "$PKG/public/parser/pkg/"

# Geometry: only the gzipped GLB
cp public/geometry_data/CaloGeometry.glb.gz  "$PKG/public/geometry_data/"
cp public/geometry_data/atlas.glb.gz         "$PKG/public/geometry_data/" 2>/dev/null || true

# Strip dev READMEs in js/
find "$PKG/public/js" -maxdepth 2 -iname 'README.md' -delete

# Tarball + spec
tar -C "$STAGE" -czf ~/rpmbuild/SOURCES/cgv-web-$VER.tar.gz cgv-web-$VER
cp cgv-web.spec ~/rpmbuild/SPECS/
```

### 11c. rpmbuild

```bash
rpmbuild -ba ~/rpmbuild/SPECS/cgv-web.spec
ls -lh ~/rpmbuild/RPMS/noarch/cgv-web-$VER-1.el9.noarch.rpm
```

---

## 12. Test the RPM on this machine

```bash
RPM=~/rpmbuild/RPMS/noarch/cgv-web-1.0.5-1.el9.noarch.rpm

# Clean local test: wipe any old install first
rpm -q cgv-web && sudo dnf remove -y cgv-web

# Install
sudo dnf install -y "$RPM"

# Service should be enabled + active
systemctl status cgv-web

# v1.0.4 and later must NOT ship /etc/httpd/conf.d/cgv-web.conf:
ls /etc/httpd/conf.d/cgv-web.conf 2>/dev/null && echo 'BUG -- file should not exist'

# Reference snippet should be in examples/:
ls /var/www/cgv-web/examples/

# Backend should answer:
curl -s http://127.0.0.1:8080/api/xml/folder        # {"path":null}
echo '{"path":"/var/www/cgv-web/public/default_xml"}' \
  | curl -s -X POST http://127.0.0.1:8080/api/xml/set-folder \
         -H 'Content-Type: application/json' --data-binary @-
curl -s http://127.0.0.1:8080/api/xml/list | head -c 400
echo

# Logs (the systemd unit appends to /var/log/cgv-web.log too)
sudo journalctl -u cgv-web -n 50 --no-pager

# Optional: confirm an upgrade path works without removing first
RPM_NEW=~/rpmbuild/RPMS/noarch/cgv-web-1.0.5-1.el9.noarch.rpm   # if you bumped
[[ -f "$RPM_NEW" ]] && sudo dnf upgrade -y "$RPM_NEW"

# Cleanup
sudo dnf remove -y cgv-web
```

---

## 13. Get the RPM to Point 1

The sysadmins asked (notes #37 and #41) for the RPM to live **inside
Point 1**, not on AFS. Chrysthofer has no P1 account, so the flow is:
build here → hand the RPM to Luciano → Luciano drops it under his P1 home.

```bash
RPM=~/rpmbuild/RPMS/noarch/cgv-web-1.0.5-1.el9.noarch.rpm

# Give Luciano the file (e.g. via lxplus, then he copies it across to P1):
ssh camaroaf@lxplus.cern.ch 'mkdir -p ~/public/cgv-web/1.0.5'
scp "$RPM" camaroaf@lxplus.cern.ch:~/public/cgv-web/1.0.5/
ssh camaroaf@lxplus.cern.ch 'fs setacl -dir ~/public -acl system:anyuser rl'
```

Luciano (P1 account) then places it at:

```
/atlas-home/0/lucianom/cgv-web-1.0.5-1.el9.noarch.rpm
```

and posts that path on the ticket. AFS (`/afs/cern.ch/user/l/lucianom/public/`
or `/afs/cern.ch/user/c/camaroaf/public/cgv-web/`) is only a fallback if the
P1 home is not an option.

---

## 14. Message to post on ticket #14110

> Hi Diana, Fabio,
>
> Thanks for the feedback. Replying to note #41 point by point.
>
> RPM location: understood, it should be inside P1, not on AFS. Luciano
> will put the build under `/atlas-home/0/lucianom/` and post the exact
> path here. I (Chrysthofer) don't have a P1 account yet, so for now
> Luciano handles anything that touches the node or the web servers. If it
> would help for me to get a P1 account and the AM role for on-node
> debugging, just point me at the procedure; otherwise Luciano stays the
> P1-side contact. He will also request the AM role so he can log in to
> `vm-calo-web-01`.
>
> Versioning: good catch. The package versioned by date
> (`cgv-web-04.28.26`) counts as newer than `1.0.x` in RPM, so a plain
> `dnf update` / Puppet run won't move off it. The new build is
> `cgv-web-1.0.5-1.el9` with `Epoch: 1`, so `1:1.0.5` supersedes
> `0:04.28.26` cleanly. From now on the version only increases (1.0.5,
> 1.0.6, ...), no more dates, and upgrades are in-place (no
> remove/reinstall). 1.0.5 also supersedes the 1.0.4 from note #40: same
> fixes (no `httpd` conf shipped, no `httpd` reload in `%post`, `httpd`
> dropped from `Requires`) plus the epoch fix and a small frontend fix
> mentioned below.
>
> The example Apache snippet: just to be clear,
> `examples/apache-cgv-web.conf.example` is reference-only and is not
> loaded by anything. It's a minimal illustration, not a description of
> your setup, and the package makes no assumptions about how
> `pc-atlas-www` and `vm-calo-web-01` are wired together. All the
> application needs from the front-end host is: (1) the static files under
> `public/` served at some prefix, and (2) `<that prefix>/api/xml/`
> reverse-proxied to the backend on `127.0.0.1:8080` keeping the
> `/api/xml/` sub-path. The backend only listens on localhost. Everything
> else (Apache / Puppet) is yours. If at some point it helps to see the
> actual cgv-web vhost so we can match the example to it, just say so.
>
> Related fix in 1.0.5: the frontend now resolves the `/api/xml` endpoint
> from the module's own URL rather than the page URL, so the LIVE > SERVER
> (live-folder) feature works regardless of the mount prefix and even if
> the page is opened without the trailing slash. That was behind the 404
> on `/api/xml/folder` in note #36. The "pick the folder" action in the UI
> uses the same endpoint, so this fixes that too.
>
> XML folder: nothing to change on the package side. The watched folder is
> picked at runtime from the UI (pencil icon next to the folder path), so
> the operator points it at `/atlas/EventDisplayEvents` (or wherever)
> without editing config. `/etc/sysconfig/cgv-web` has an optional
> `XML_FOLDER` for a boot-time default, commented out by design.
>
> Authentication: the app is view-only. It reads and renders JiveXML,
> writes nothing, has no destructive action, so from our side it's fine
> for it to be reachable inside P1 without a login. If you'd rather
> restrict it, that can be done at the Apache layer (SSO/Shibboleth, or a
> role like the one used for the node login) with no change to the app.
>
> e-group: we'll create one for support and notifications and post the
> name here. For now: lucianom@cern.ch,
> chrysthofer.afonso@estudante.ufjf.br, contact@nipscern.com.
>
> Testing: once 1.0.5 is in place we're glad to set a date to check the
> live-folder mode against `/atlas/EventDisplayEvents` in the Control
> Room. Fabio's offer to come along works for us.
>
> Thanks again for the patience with this.
>
> Best regards,
> Chrysthofer

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `rpmbuild: command not found` | step 1 not run |
| `cargo: command not found` after install | new shell didn't source `~/.cargo/env` — `. $HOME/.cargo/env` |
| `wasm-pack` build fails on `wasm-opt` | rerun `cargo install wasm-pack`; clear `parser/target/` |
| `fetch-geometry.mjs` fails with 404 | the `geometry-v4` release tag was renamed — bump `TAG` in the script |
| Service starts but `curl /api/xml/folder` → connection refused | check `BIND` in `/etc/sysconfig/cgv-web` (default `127.0.0.1`) |
| Service running but `/api/xml/list` → 503 | no `XML_FOLDER` configured — set via UI pencil or in `/etc/sysconfig/cgv-web` |
| 404 from `https://pc-atlas-www.cern.ch/cgv-web/api/...` | host's Apache is missing the `<prefix>/api/xml/` → `127.0.0.1:8080/api/xml/` reverse-proxy (the `examples/` snippet shows a minimal version) |
| 404 from `https://pc-atlas-www.cern.ch/api/xml/...` (no `/cgv-web/`) | page was opened as `.../cgv-web` without the trailing slash and the host doesn't 301 to `.../cgv-web/`; fixed in 1.0.5 (API path resolved from the module URL), but the redirect is still good hygiene |
| `dnf update` doesn't move off `cgv-web-04.28.26-1.el9` | needs the `Epoch: 1` build (1:1.0.5 ≥ 0:04.28.26); with an older non-epoch RPM, `sudo dnf remove cgv-web` then install, or `dnf install --allowerasing` |
