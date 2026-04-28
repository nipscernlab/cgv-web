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
small JSON API used by the SERVER sub-mode of the sidebar:

  GET  /api/xml/list           list of .xml files in the watched folder
                               (top 100 by mtime, newest first)
  GET  /api/xml/file/<name>    raw bytes of one xml
  GET  /api/xml/folder         { "path": "..." }  current folder
  POST /api/xml/set-folder     { "path": "..." }  switch watched folder

The watched folder comes from the XML_FOLDER env var. It can be changed at
runtime via POST /api/xml/set-folder. There is no auth -- this is meant for
trusted networks (VM at P1, dev laptop on localhost).
"""
import json, mimetypes, os, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT        = Path(__file__).resolve().parent
MAX_ENTRIES = 100

mimetypes.add_type('application/wasm',  '.wasm')
mimetypes.add_type('application/gzip',  '.gz')
mimetypes.add_type('model/gltf-binary', '.glb')
mimetypes.add_type('text/javascript',   '.mjs')


class XmlState:
    def __init__(self, folder=None):
        self._lock   = threading.Lock()
        self._folder = None
        if folder:
            try: self.set_folder(folder)
            except Exception as e:
                print(f'  WARN: XML_FOLDER invalid ({e}) -- continuing without folder', flush=True)

    def set_folder(self, path):
        p = Path(path).expanduser().resolve()
        if not p.is_dir():            raise FileNotFoundError(path)
        if not os.access(p, os.R_OK): raise PermissionError(path)
        with self._lock:
            self._folder = p

    def folder(self):
        with self._lock:
            return self._folder

    def list_xml(self):
        f = self.folder()
        if f is None: return None
        out = []
        try:
            with os.scandir(f) as it:
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

    def read_file(self, name):
        f = self.folder()
        if f is None: return None
        # Reject anything that isn't a bare basename ending in .xml
        if '/' in name or '\\' in name or name in ('', '.', '..'):
            return None
        if not name.lower().endswith('.xml'):
            return None
        path = f / name
        if not path.is_file():
            return None
        try:    return path.read_bytes()
        except OSError: return None


state = XmlState(os.environ.get('XML_FOLDER'))


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

    def do_POST(self):
        if self.path == '/api/xml/set-folder':
            return self._api_set_folder()
        return self._json(404, {'error': 'not found'})

    def do_OPTIONS(self):
        # CORS preflight for set-folder POST when site is on another origin.
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age',       '86400')
        self.end_headers()

    # ── API handlers ──────────────────────────────────────────────────────

    def _api_get(self):
        path = self.path.split('?', 1)[0]

        if path == '/api/xml/list':
            data = state.list_xml()
            if data is None:
                return self._json(503, {'error': 'no folder configured'})
            return self._json(200, data)

        if path == '/api/xml/folder':
            f = state.folder()
            return self._json(200, {'path': str(f) if f else None})

        if path.startswith('/api/xml/file/'):
            name = unquote(path[len('/api/xml/file/'):])
            data = state.read_file(name)
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

    def _api_set_folder(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length).decode('utf-8') if length else '{}'
            req    = json.loads(body)
            path   = (req.get('path') or '').strip()
            if not path:
                return self._json(400, {'error': 'path is required'})
            state.set_folder(path)
            print(f'  XML folder set to: {state.folder()}', flush=True)
            return self._json(200, {'path': str(state.folder())})
        except FileNotFoundError:
            return self._json(404, {'error': 'folder not found'})
        except PermissionError:
            return self._json(403, {'error': 'cannot read folder'})
        except json.JSONDecodeError:
            return self._json(400, {'error': 'invalid JSON body'})
        except Exception as e:
            return self._json(400, {'error': str(e)})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT', 8080))
    bind = os.environ.get('BIND', '127.0.0.1')
    httpd = ThreadingHTTPServer((bind, port), Handler)
    f = state.folder()
    print()
    print('  CGV Web -- Local Launcher')
    print('  -------------------------')
    print(f'  Serving  {ROOT}')
    print(f'  at       http://{bind}:{port}/')
    print(f'  XML dir  {f if f else "<not set>  (set XML_FOLDER env var or POST /api/xml/set-folder)"}')
    print('  Press Ctrl+C to stop.')
    print()
    try:                    httpd.serve_forever()
    except KeyboardInterrupt: pass


if __name__ == '__main__':
    main()
