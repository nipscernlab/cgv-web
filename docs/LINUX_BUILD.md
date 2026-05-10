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
sed -i -E 's/^Version:[[:space:]]+.*$/Version:        1.0.4/' cgv-web.spec
```

### 11b. Stage a *clean* source tree

The .spec does `cp -r * /var/www/cgv-web/`, so anything in the tarball
ends up served by Apache. We must NOT ship: `node_modules/`, `parser/target/`,
`tools/`, `tests/`, `docs/`, `package*.json`, `.git/`, the unzipped `.glb`,
the `.root` build inputs, the `nipscern/` baker, etc.

```bash
VER=1.0.4         # match Version: in the spec
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
RPM=~/rpmbuild/RPMS/noarch/cgv-web-1.0.4-1.el9.noarch.rpm

# Wipe any old install (avoids the obsolete 1.0.3 httpd snippet leaking in)
rpm -q cgv-web && sudo dnf remove -y cgv-web

# Install
sudo dnf install -y "$RPM"

# Service should be enabled + active
systemctl status cgv-web

# v1.0.4 must NOT have shipped /etc/httpd/conf.d/cgv-web.conf:
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

## 13. Upload to CERN

CERN account: **`camaroaf`**. You have write access on Luciano's AFS
public folder, which is the path Luciano was already using on the ticket
(notes #28 and #36) — drop the RPM straight there:

```bash
RPM=~/rpmbuild/RPMS/noarch/cgv-web-1.0.4-1.el9.noarch.rpm

# Make sure the target folder exists (idempotent):
ssh camaroaf@lxplus.cern.ch 'mkdir -p /afs/cern.ch/user/l/lucianom/public/CGV-Web/1.0.4'

# Upload
scp "$RPM" camaroaf@lxplus.cern.ch:/afs/cern.ch/user/l/lucianom/public/CGV-Web/1.0.4/

# Verify it landed
ssh camaroaf@lxplus.cern.ch 'ls -lh /afs/cern.ch/user/l/lucianom/public/CGV-Web/1.0.4/'
```

The full path to give Fabio is then:

```
/afs/cern.ch/user/l/lucianom/public/CGV-Web/1.0.4/cgv-web-1.0.4-1.el9.noarch.rpm
```

> Fabio originally asked for `/atlas-home/0/lucianom/` (note #37), which is
> a Point-1-only mount and not reachable from lxplus/AFS. The AFS path
> above is what he installed from in note #27 (1.0.2) and note #36 (1.0.3),
> so it's already part of his workflow.

### Fallback — your own AFS public folder

If for any reason the write to `lucianom/public/` fails (quota, ACL drift),
upload to your own home and tell Fabio that path instead:

```bash
ssh camaroaf@lxplus.cern.ch 'mkdir -p ~/public/cgv-web'
scp "$RPM" camaroaf@lxplus.cern.ch:~/public/cgv-web/
ssh camaroaf@lxplus.cern.ch 'fs setacl -dir ~/public -acl system:anyuser rl'

# Sysadmins can then read from:
#   /afs/cern.ch/user/c/camaroaf/public/cgv-web/cgv-web-1.0.4-1.el9.noarch.rpm
```

---

## 14. Message to post on ticket #14110

Replace the path on the message below if you used the fallback in step 13.

> Hi Fabio,
>
> My name is Kristoffer (Chrysthofer Afonso) — I work with Luciano on the
> CGV Web project at NIPSCERN/UFJF, and I'll be following up on this
> ticket together with him from now on.
>
> I've prepared `cgv-web-1.0.4-1.el9.noarch.rpm`, which addresses the
> regression you reported in note #37 and follows the plan we outlined in
> note #38:
>
> - `/etc/httpd/conf.d/cgv-web.conf` is no longer shipped, and `%post` no
>   longer reloads `httpd`. Apache configuration is now left entirely to
>   the host (Puppet at P1) — this was the cause of the regression after
>   the upgrade to 1.0.3.
> - `httpd` is dropped from `Requires`.
> - The Apache directives are still available as a reference-only example
>   at `/var/www/cgv-web/examples/apache-cgv-web.conf.example`, in case it
>   helps when comparing with the Puppet-managed configuration.
> - No changes to the Python backend, the static site, or the systemd
>   unit; the backend still binds to `127.0.0.1:8080` via
>   `/etc/sysconfig/cgv-web`.
> - The package supports rolling upgrades (no need to remove the previous
>   version first).
>
> The RPM is available at:
> `/afs/cern.ch/user/l/lucianom/public/CGV-Web/1.0.4/cgv-web-1.0.4-1.el9.noarch.rpm`
>
> Please let us know how the installation goes — happy to debug or follow
> up on anything that regresses.
>
> Best regards,
> Kristoffer

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
| 404 from `https://pc-atlas-www.cern.ch/cgv-web/api/...` | host's Apache is missing the `ProxyPass` lines — give Fabio `/var/www/cgv-web/examples/apache-cgv-web.conf.example` |
| `dnf install` complains about old `cgv-web-04.28.26-1.el9` | `sudo dnf remove cgv-web` first; the new versioning (`1.0.x`) is not seen as an upgrade of the date-based one |
