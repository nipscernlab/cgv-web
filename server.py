#!/usr/bin/env python3
"""
server.py -- Entry point for the CGV Web service at ATLAS P1.

The RPM's systemd unit (cgv-web.service) invokes this file. To avoid
duplicating code, it is a thin wrapper that defers to serve.py, which
contains the real HTTP server + /api/xml/* folder API used by the site.

Env vars honoured (set via /etc/sysconfig/cgv-web; the systemd unit reads it):
  PORT        listening port       (default 8080)
  BIND        bind address         (default 127.0.0.1 -- localhost only;
                                    the host's reverse proxy exposes it)
  XML_FOLDER  default XML dir       (optional; the watched folder is normally
                                    chosen at runtime from the UI)
"""
import os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

os.environ.setdefault('PORT', '8080')
os.environ.setdefault('BIND', '127.0.0.1')

import serve
serve.main()
