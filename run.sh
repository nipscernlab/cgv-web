#!/usr/bin/env bash
# run.sh -- Zero-dependency static server for CGV Web (Linux / macOS).
#
# Uses python3's built-in http.server (ships with every modern distro).
# Double-click or run:
#     ./run.sh           # port 8080
#     ./run.sh 9090      # custom port
#
# If python3 is not installed:  sudo apt install python3
set -eu

cd "$(dirname "$0")"

PORT="${1:-8080}"
URL="http://localhost:${PORT}/"

echo
echo "  CGV Web -- Local Launcher"
echo "  -------------------------"
echo "  Serving $(pwd)"
echo "  at       ${URL}"
echo "  Press Ctrl+C to stop."
echo

# Open the default browser shortly after the server is up. Runs in a
# subshell so failures here never kill the server.
(
  sleep 1
  if   command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open     >/dev/null 2>&1; then open     "$URL" >/dev/null 2>&1 || true
  elif command -v wslview  >/dev/null 2>&1; then wslview  "$URL" >/dev/null 2>&1 || true
  fi
) &

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi

if command -v python >/dev/null 2>&1; then
  PYV=$(python -c 'import sys; print(sys.version_info[0])' 2>/dev/null || echo 0)
  if [ "$PYV" = "3" ]; then
    exec python -m http.server "$PORT" --bind 127.0.0.1
  fi
fi

echo "ERROR: python3 not found." >&2
echo "Install it with your package manager, e.g.:" >&2
echo "    sudo apt install python3        # Debian / Ubuntu" >&2
echo "    sudo dnf install python3        # Fedora / RHEL" >&2
echo "    sudo pacman -S python           # Arch" >&2
exit 1
