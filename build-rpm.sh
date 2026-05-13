#!/usr/bin/env bash
# build-rpm.sh -- one-stop CGV Web RPM build for Alma/Rocky/RHEL 9.
#
# From a fresh checkout (or even a fresh box) this script will:
#   1. install system packages (rpm-build, gcc, ...)
#   2. install Node.js (via dnf module) if missing
#   3. install Rust + wasm-pack if missing
#   4. install npm dependencies
#   5. download the geometry assets (.root + .glb.gz) from the GitHub Release
#   6. download the JiveXML samples (default_xml/)
#   7. build the Rust/WASM ATLAS-ID parser
#   8. ask for the new version, update Version: in cgv-web.spec
#   9. stage a clean tree containing ONLY the runtime files (no .root, no
#      nipscern/, no devtool leftovers)
#  10. build the RPM
#  11. (optional, --install) uninstall any existing cgv-web and install the new one
#  12. (optional, --install) curl the API to verify the service answers
#
# Usage:
#    chmod +x build-rpm.sh
#   ./build-rpm.sh                       # interactive
#   ./build-rpm.sh 1.0.4                 # non-interactive, version pinned
#   ./build-rpm.sh 1.0.4 --install       # also install the result locally
#   ./build-rpm.sh --install             # interactive version + install
#   cp /root/rpmbuild/RPMS/noarch/cgv-web-2.0.1-1.el9.noarch.rpm .
#   chown nipscern-linux:nipscern-linux cgv-web-2.0.1-1.el9.noarch.rpm
#
# Re-runs are safe -- every step is idempotent.
set -euo pipefail

# ── Paths & constants ─────────────────────────────────────────────────
PROJECT_NAME="cgv-web"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
SPEC_FILE="$SCRIPT_DIR/cgv-web.spec"
RPMTOP="$HOME/rpmbuild"

# Argument parsing -- accepts "<version> [--install]" or "[--install]" or empty
ARG_VERSION=""
DO_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) DO_INSTALL=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) ARG_VERSION="$arg" ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────
say()  { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$SPEC_FILE" ]] || die "$SPEC_FILE not found. Run from the project root."

# ── 1. System packages ────────────────────────────────────────────────
say "1/12  System packages"
NEEDED=(rpm-build rpmdevtools systemd-rpm-macros tar gawk sed gcc make curl which)
MISSING=()
for pkg in "${NEEDED[@]}"; do
  rpm -q "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg")
done
if (( ${#MISSING[@]} > 0 )); then
  warn "Installing: ${MISSING[*]}"
  sudo dnf install -y "${MISSING[@]}"
else
  ok "All system packages already installed."
fi

# ── 2. Node.js ────────────────────────────────────────────────────────
say "2/12  Node.js (>= 18)"
if command -v node >/dev/null 2>&1 && node --version | grep -qE '^v(1[89]|[2-9][0-9])\.'; then
  ok "node $(node --version) already installed."
else
  warn "Installing nodejs:20 from dnf module..."
  sudo dnf module reset  -y nodejs
  sudo dnf module enable -y nodejs:20
  sudo dnf install      -y nodejs
  ok "node $(node --version) installed."
fi

# ── 3. Rust + wasm-pack ───────────────────────────────────────────────
say "3/12  Rust toolchain + wasm-pack"
if ! command -v cargo >/dev/null 2>&1; then
  warn "Installing Rust via rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi
[[ -f "$HOME/.cargo/env" ]] && . "$HOME/.cargo/env"
ok "rustc $(rustc --version | awk '{print $2}')"

if ! rustup target list --installed | grep -q '^wasm32-unknown-unknown$'; then
  warn "Adding wasm32-unknown-unknown target..."
  rustup target add wasm32-unknown-unknown
fi
ok "wasm32-unknown-unknown target ready."

if ! command -v wasm-pack >/dev/null 2>&1; then
  warn "Installing wasm-pack via cargo..."
  cargo install wasm-pack
fi
ok "wasm-pack $(wasm-pack --version | awk '{print $2}')"

# ── 4. npm install ────────────────────────────────────────────────────
say "4/12  npm install"
cd "$SCRIPT_DIR"
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  npm install --ignore-scripts
else
  ok "node_modules up-to-date."
fi

# ── 5. Geometry assets ────────────────────────────────────────────────
say "5/12  Geometry assets (.root + .glb.gz)"
# fetch-geometry.mjs is idempotent (skips files whose SHA-256 already matches).
node tools/scripts/fetch-geometry.mjs --with-source

# ── 6. JiveXML samples ────────────────────────────────────────────────
say "6/12  JiveXML samples (public/default_xml/)"
node tools/scripts/fetch-samples.mjs

# ── 7. Patch jsroot + build WASM parser ───────────────────────────────
say "7/12  Patch jsroot + build WASM parser"
node tools/setup/setup.mjs
( cd parser && wasm-pack build --target web --release --out-dir ../public/parser/pkg )
rm -f public/parser/pkg/.gitignore
ok "atlas_id_parser_bg.wasm built."

# ── 8. Resolve version & update spec ──────────────────────────────────
say "8/12  Version"
CURRENT_VERSION="$(awk '/^Version:/ {print $2; exit}' "$SPEC_FILE")"
if [[ -n "$ARG_VERSION" ]]; then
  NEW_VERSION="$ARG_VERSION"
else
  echo "      Current Version in spec: $CURRENT_VERSION"
  read -rp "      Enter new version (default: $CURRENT_VERSION): " NEW_VERSION
  NEW_VERSION="${NEW_VERSION:-$CURRENT_VERSION}"
fi
[[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || die "version must be X.Y or X.Y.Z (got '$NEW_VERSION')"
sed -i -E "s/^Version:[[:space:]]+.*$/Version:        $NEW_VERSION/" "$SPEC_FILE"
ok "Version set to $NEW_VERSION."

# ── 9. Stage clean source tree ────────────────────────────────────────
say "9/12  Stage clean source tree (runtime files only)"
mkdir -p "$RPMTOP"/{SOURCES,SPECS,BUILD,BUILDROOT,RPMS,SRPMS}
STAGE="$(mktemp -d -t cgv-web-stage-XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
PKGDIR="$STAGE/$PROJECT_NAME-$NEW_VERSION"
mkdir -p "$PKGDIR/public/parser/pkg" "$PKGDIR/public/geometry_data"

# Files at the root of /var/www/cgv-web/
cp "$SCRIPT_DIR/server.py"  "$PKGDIR/"
cp "$SCRIPT_DIR/serve.py"   "$PKGDIR/"
[[ -f "$SCRIPT_DIR/LICENSE"   ]] && cp "$SCRIPT_DIR/LICENSE"   "$PKGDIR/"
[[ -f "$SCRIPT_DIR/README.md" ]] && cp "$SCRIPT_DIR/README.md" "$PKGDIR/"

# Static site -- whole-folder copies for simplicity, then prune.
cp    "$SCRIPT_DIR/public/index.html"   "$PKGDIR/public/"
cp -r "$SCRIPT_DIR/public/css"          "$PKGDIR/public/"
cp -r "$SCRIPT_DIR/public/assets"       "$PKGDIR/public/"
cp -r "$SCRIPT_DIR/public/js"           "$PKGDIR/public/"
cp -r "$SCRIPT_DIR/public/vendor"       "$PKGDIR/public/"
cp -r "$SCRIPT_DIR/public/default_xml"  "$PKGDIR/public/"   # sidebar SAMPLE mode
cp -r "$SCRIPT_DIR/public/live_atlas"   "$PKGDIR/public/"   # main.js imports live_poller.js

# parser/pkg: only the two runtime files (drop .d.ts and package.json -- dev only)
cp "$SCRIPT_DIR/public/parser/pkg/atlas_id_parser.js"      "$PKGDIR/public/parser/pkg/"
cp "$SCRIPT_DIR/public/parser/pkg/atlas_id_parser_bg.wasm" "$PKGDIR/public/parser/pkg/"

# geometry_data: only the runtime gzipped GLB (the browser fetches *.glb.gz only).
# .root files and the uncompressed .glb are 60+ MB of build inputs we don't need
# at runtime. atlas.glb.gz is kept (176K, harmless) in case any branch references it.
cp "$SCRIPT_DIR/public/geometry_data/CaloGeometry.glb.gz" "$PKGDIR/public/geometry_data/"
[[ -f "$SCRIPT_DIR/public/geometry_data/atlas.glb.gz" ]] && \
  cp "$SCRIPT_DIR/public/geometry_data/atlas.glb.gz" "$PKGDIR/public/geometry_data/"

# Strip dev READMEs that snuck into js/ (kept in source, not needed in the RPM).
find "$PKGDIR/public/js" -maxdepth 2 -iname 'README.md' -delete

# IMPORTANT: do NOT copy public/nipscern/  -- it is a separate offline "baker"
# tool, not loaded by the app at runtime. ~3.5 MB saved.

STAGED_SIZE=$(du -sh "$PKGDIR" | awk '{print $1}')
ok "Staged $STAGED_SIZE in $PKGDIR"

# ── 10. Build the RPM ─────────────────────────────────────────────────
say "10/12  Build RPM"
tar -C "$STAGE" -czf "$RPMTOP/SOURCES/$PROJECT_NAME-$NEW_VERSION.tar.gz" "$PROJECT_NAME-$NEW_VERSION"
cp "$SPEC_FILE" "$RPMTOP/SPECS/cgv-web.spec"
rpmbuild -ba "$RPMTOP/SPECS/cgv-web.spec"

RPM_OUT="$RPMTOP/RPMS/noarch/$PROJECT_NAME-$NEW_VERSION-1.el9.noarch.rpm"
SRPM_OUT="$RPMTOP/SRPMS/$PROJECT_NAME-$NEW_VERSION-1.el9.src.rpm"
[[ -f "$RPM_OUT" ]] || die "rpmbuild finished but $RPM_OUT is missing."
ok "Binary RPM: $RPM_OUT  ($(du -h "$RPM_OUT" | awk '{print $1}'))"
[[ -f "$SRPM_OUT" ]] && ok "Source RPM: $SRPM_OUT"

# ── 11. (optional) install locally ────────────────────────────────────
if (( DO_INSTALL )); then
  say "11/12  Install locally"
  if rpm -q cgv-web >/dev/null 2>&1; then
    INSTALLED="$(rpm -q cgv-web)"
    warn "Removing previously installed $INSTALLED ..."
    sudo dnf remove -y cgv-web
  else
    ok "No previous cgv-web installed."
  fi
  sudo dnf install -y "$RPM_OUT"
  ok "Installed: $(rpm -q cgv-web)"

  # ── 12. Quick smoke test ────────────────────────────────────────────
  say "12/12  Smoke test"
  sleep 1
  systemctl is-active --quiet cgv-web && ok "cgv-web.service is active." \
    || warn "cgv-web.service not active -- check 'journalctl -u cgv-web'."

  for url in /api/xml/folder /api/xml/list ; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8080$url" || echo 000)
    case "$code" in
      200) ok "GET $url -> 200" ;;
      503) ok "GET $url -> 503 (no folder configured -- expected)" ;;
      *)   warn "GET $url -> $code  (unexpected)" ;;
    esac
  done

  if ls /etc/httpd/conf.d/cgv-web.conf 2>/dev/null; then
    warn "/etc/httpd/conf.d/cgv-web.conf is present -- v1.0.4 should NOT ship this!"
  else
    ok "No /etc/httpd/conf.d/cgv-web.conf shipped (correct for v1.0.4+)."
  fi
  [[ -f /var/www/cgv-web/examples/apache-cgv-web.conf.example ]] \
    && ok "Apache example snippet present at /var/www/cgv-web/examples/."
fi

echo
echo "============================================"
echo "  Done -- $PROJECT_NAME-$NEW_VERSION"
echo "============================================"
echo "  RPM: $RPM_OUT"
echo
echo "  Next steps:"
echo "    1. Hand the RPM to Luciano so he can place it inside Point 1 (the"
echo "       sysadmins asked for the RPM in P1, not on AFS):"
echo "         /atlas-home/0/lucianom/cgv-web-$NEW_VERSION-1.el9.noarch.rpm"
echo "       (AFS -- /afs/cern.ch/user/l/lucianom/public/CGV-Web/$NEW_VERSION/ -- only as a fallback.)"
echo "    2. Post on ticket #14110 -- message template in docs/LINUX_BUILD.md (step 14)."
echo
