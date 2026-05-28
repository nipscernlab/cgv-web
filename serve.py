#!/usr/bin/env python3
"""
serve.py -- Static file server + XML folder API for CGV Web.

This is the implementation file. Two entry points use it:
  - `npm run dev` / `npm run start` -> `python serve.py` (developer path)
  - `server.py`                      -> production wrapper invoked by the
                                        cgv-web.service systemd unit at
                                        ATLAS P1; it sets a couple of env
                                        vars and calls serve.main().

Replaces `python3 -m http.server`. Serves the project root and exposes a
small JSON API used by the SERVER sub-mode of the sidebar.

The API is stateless: each list/file request carries the folder it wants
to read as a ?path= query parameter, so multiple clients/tabs can watch
different streams independently. The XML_FOLDER env var only seeds the
default returned by /api/xml/default; it is no longer a process-wide
"current folder" mutated by clients.

  GET  /api/xml/default                         { "path": "<XML_FOLDER>" | null }
  GET  /api/xml/list?path=<dir>                 list of .xml in <dir>
                                                (top 100 by mtime, newest first)
  GET  /api/xml/file?path=<dir>&name=<name>     raw bytes of one xml

There is no auth -- this is meant for trusted networks (VM at P1, dev
laptop on localhost).
"""
import json, mimetypes, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT        = Path(__file__).resolve().parent / 'public'
MAX_ENTRIES = 100
DEFAULT_FOLDER = (os.environ.get('XML_FOLDER') or '').strip() or None

mimetypes.add_type('application/wasm',  '.wasm')
mimetypes.add_type('application/gzip',  '.gz')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('text/javascript',   '.mjs')


def _resolved_dir(path):
    """Resolve `path` to an absolute directory readable by this process.
    Returns (resolved_path, None) on success or (None, (status, payload))
    on failure, ready to feed straight into _json().
    """
    if not path:
        return None, (400, {'error': 'path is required'})
    try:
        p = Path(path).expanduser().resolve()
    except (OSError, RuntimeError):
        return None, (400, {'error': 'invalid path'})
    if not p.is_dir():
        return None, (404, {'error': 'folder not found'})
    if not os.access(p, os.R_OK):
        return None, (403, {'error': 'cannot read folder'})
    return p, None


def _list_xml(folder):
    out = []
    try:
        with os.scandir(folder) as it:
            for e in it:
                try:
                    if not e.is_file() or not e.name.lower().endswith('.xml'):
                        continue
                    st = e.stat()
                    out.append({
                        'name':  e.name,
                        'size':  st.st_size,
                        'mtime': int(st.st_mtime * 1000),
                    })
                except OSError:
                    pass
    except OSError:
        return []
    out.sort(key=lambda x: x['mtime'], reverse=True)
    return out[:MAX_ENTRIES]


def _read_xml(folder, name):
    # Reject anything that isn't a bare basename ending in .xml.
    if '/' in name or '\\' in name or name in ('', '.', '..'):
        return None
    if not name.lower().endswith('.xml'):
        return None
    p = folder / name
    if not p.is_file():
        return None
    try:    return p.read_bytes()
    except OSError: return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stdout.write('  ' + (fmt % args) + '\n')

    def end_headers(self):
        # Disable caching for everything (static files included). The /api
        # responses set their own Cache-Control via send_header before this
        # is reached, so we only inject for non-api requests.
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def _json(self, code, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type',  'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/'):
            return self._api_get()
        return super().do_GET()

    def do_HEAD(self):
        if self.path.startswith('/api/'):
            return self._api_get()
        return super().do_HEAD()

    def do_OPTIONS(self):
        # CORS preflight for cross-origin pages hitting the API.
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age',       '86400')
        self.end_headers()

    # API handlers

    def _api_get(self):
        parts = urlsplit(self.path)
        route = parts.path
        qs    = parse_qs(parts.query)

        if route == '/api/xml/default':
            return self._json(200, {'path': DEFAULT_FOLDER})

        if route == '/api/xml/list':
            folder, err = _resolved_dir((qs.get('path') or [''])[0])
            if err:
                return self._json(*err)
            return self._json(200, _list_xml(folder))

        if route == '/api/xml/file':
            folder, err = _resolved_dir((qs.get('path') or [''])[0])
            if err:
                return self._json(*err)
            name = (qs.get('name') or [''])[0]
            data = _read_xml(folder, name)
            if data is None:
                return self._json(404, {'error': 'file not found'})
            self.send_response(200)
            self.send_header('Content-Type',  'application/xml; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(data)
            return

        return self._json(404, {'error': 'not found'})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8080))
    bind = os.environ.get('BIND', '127.0.0.1')
    httpd = ThreadingHTTPServer((bind, port), Handler)
    print()
    print('  CGV Web -- Local Launcher')
    print('  -------------------------')
    print(f'  Serving  {ROOT}')
    print(f'  at       http://{bind}:{port}/')
    if DEFAULT_FOLDER:
        print(f'  Default XML folder (seed for /api/xml/default): {DEFAULT_FOLDER}')
    else:
        print('  Default XML folder: <not set>  (set XML_FOLDER env to seed /api/xml/default)')
    print('  Press Ctrl+C to stop.')
    print()
    try:                      httpd.serve_forever()
    except KeyboardInterrupt: pass


if __name__ == '__main__':
    main()
