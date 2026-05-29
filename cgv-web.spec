Name:           cgv-web
Epoch:          1
Version:        2.3.0
Release:        1%{?dist}
Summary:        CGV Web -- 3D Calorimeter Event Display for ATLAS
License:        NIPSCERN License
BuildArch:      noarch
Source0:        %{name}-%{version}.tar.gz
Requires:       python3, systemd
BuildRequires:  systemd

%description
CGV Web is a 3D ATLAS calorimeter event display, packaged as a small
systemd service for use at P1.

The package ships:
  - the static site under /var/www/cgv-web/public/
  - a Python backend (cgv-web.service) bound to 127.0.0.1:8080 that
    exposes /api/xml/* used by the LIVE -> SERVER mode of the UI to
    list and stream JiveXML files from a configured directory
    (e.g. /atlas/EventDisplayEvents at P1)
  - the Technical TWiki bundle under /var/www/cgv-web/public/twiki/,
    served alongside the viewer so the "Technical TWiki" sidebar link
    works inside P1 with no external network access
  - an example Apache snippet under /var/www/cgv-web/examples/ -- this
    file is NOT loaded automatically. Apache configuration is left
    entirely to the host's administrator (Puppet at P1).

%prep
%setup -q -n %{name}-%{version}

%install
mkdir -p %{buildroot}/var/www/cgv-web
cp -r * %{buildroot}/var/www/cgv-web/
mkdir -p %{buildroot}/usr/lib/systemd/system
mkdir -p %{buildroot}/etc/sysconfig
mkdir -p %{buildroot}/var/www/cgv-web/examples

cat <<SERVICE > %{buildroot}/usr/lib/systemd/system/cgv-web.service
[Unit]
Description=CGV Web ATLAS Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/cgv-web
EnvironmentFile=-/etc/sysconfig/cgv-web
ExecStart=/usr/bin/python3 /var/www/cgv-web/server.py
StandardOutput=append:/var/log/cgv-web.log
StandardError=append:/var/log/cgv-web.log
Restart=always

[Install]
WantedBy=multi-user.target
SERVICE

cat <<SYSCONFIG > %{buildroot}/etc/sysconfig/cgv-web
# CGV Web -- runtime config for the Python backend.
# Edit this file then: systemctl restart cgv-web
PORT=8080
BIND=127.0.0.1
# Default JiveXML stream surfaced by GET /api/xml/default. This only seeds
# the folder bar on a client's first visit: every browser/tab keeps its own
# choice in localStorage and can switch streams from the UI pencil at
# runtime, independently of other clients. The backend itself is stateless.
XML_FOLDER=/atlas/EventDisplayEvents/physics_Main
SYSCONFIG

cat <<APACHE > %{buildroot}/var/www/cgv-web/examples/apache-cgv-web.conf.example
# Example Apache snippet for CGV Web -- NOT loaded automatically.
# Copy the relevant directives into the host's Apache configuration if
# you want to expose the application through the host's Apache (this is
# the recommended setup at P1, where Apache is managed by Puppet).
#
# Two parts:
#   1. Alias for the static site (HTML/JS/CSS/binaries under public/)
#   2. ProxyPass for /api/xml/* -> local Python backend on 127.0.0.1:8080
Alias /cgv-web/ /var/www/cgv-web/public/
<Directory /var/www/cgv-web/public/>
    Require all granted
</Directory>

<IfModule mod_proxy.c>
    ProxyRequests Off
    ProxyPreserveHost On
    ProxyPass        /cgv-web/api/xml/  http://127.0.0.1:8080/api/xml/
    ProxyPassReverse /cgv-web/api/xml/  http://127.0.0.1:8080/api/xml/
</IfModule>
APACHE

%files
/var/www/cgv-web/
/usr/lib/systemd/system/cgv-web.service
%config(noreplace) /etc/sysconfig/cgv-web

%post
%systemd_post cgv-web.service
systemctl enable --now cgv-web.service >/dev/null 2>&1 || :
echo "------------------------------------------------------"
echo "  CGV Web %{version} installed."
echo "  Backend systemd unit: cgv-web.service (127.0.0.1:8080)"
echo "  Apache configuration is owned by the host (not this RPM)."
echo "  Reference snippet:"
echo "    /var/www/cgv-web/examples/apache-cgv-web.conf.example"
echo "------------------------------------------------------"

%preun
%systemd_preun cgv-web.service

%postun
%systemd_postun_with_restart cgv-web.service

%changelog
* Thu May 28 2026 Chrysthofer - 1:2.3.0-1
- Ship the Technical TWiki bundle under /var/www/cgv-web/public/twiki/, so
  the "Technical TWiki" link in the sidebar resolves to a local URL
  (https://pc-atlas-www.cern.ch/cgv-web/twiki/) and works inside P1 with no
  external network access. Apache configuration is unchanged: the existing
  Alias /cgv-web/ already serves any subdirectory of public/, no proxy or
  vhost edit is required from the host's side.
- The TWiki source lives in this repository at public/twiki/ (HTML, CSS,
  JS, .twiki sources). The build copies it verbatim into the RPM. The
  project's deploy.mjs exports the same folder to nipscernweb for the
  public site, but the source of truth is here.
- index.html: the sidebar "Technical TWiki" link now points at the
  relative path "twiki/" instead of https://nipscern.com/library/cgvweb/twiki.
* Thu May 28 2026 Chrysthofer - 1:2.2.0-1
- Backend is now stateless: /api/xml/list and /api/xml/file take the
  watched folder as a `?path=` query parameter on each request, so multiple
  clients/tabs/PCs can browse different streams independently. Removes the
  process-wide XmlState that, in 2.1.x, made the last POST set-folder win
  for everyone.
- New endpoint: GET /api/xml/default returns {"path": <XML_FOLDER>} from
  /etc/sysconfig/cgv-web. The UI uses it only to prefill the folder bar on
  a first visit; each client persists its own choice in localStorage.
- POST /api/xml/set-folder is removed. The reverse proxy no longer needs to
  forward POST for the SERVER feature; only GET is used.
- /etc/sysconfig/cgv-web ships
    XML_FOLDER=/atlas/EventDisplayEvents/physics_Main
  as the default seed at P1 (was commented out in 2.1.x). The file remains
  %config(noreplace): on upgrade an existing file is kept and a .rpmnew is
  written alongside if it was locally modified.
- Frontend SERVER mode stores the chosen folder per origin in localStorage
  and sends it on every list/file call; switching folders no longer affects
  other clients.
* Fri May 22 2026 Chrysthofer - 1:2.1.0-1
- Frontend only; no change to the backend, the systemd unit or packaging.
- LIVE > SERVER: when the /api/xml backend cannot be reached on a host where
  one is expected (localhost or a *.cern.ch deployment), show a subtle,
  non-blocking hint in the SERVER panel instead of silently hiding the folder
  pencil. The public static demo stays silent (no backend there by design).
- LIVE > SERVER: re-probe /api/xml when the SERVER sub-tab is opened, not only
  once at page load, so the folder pencil appears without a page reload as
  soon as the reverse proxy starts routing /api/xml to the backend.
* Mon May 11 2026 Chrysthofer - 1:1.0.5-1
- Add `Epoch: 1`. The package currently installed at P1 is versioned by
  date (cgv-web-04.28.26), which RPM considers *newer* than 1.0.x, so a
  plain `dnf update` / Puppet run would not move off it. With the epoch,
  1:1.0.5 cleanly supersedes 0:04.28.26. From here on the version number is
  monotonic (1.0.5 -> 1.0.6 -> ...), no more date-based versions, and
  upgrades stay in-place (no remove/reinstall).
- Frontend: resolve the /api/xml endpoint relative to this module's own URL
  instead of the page URL, so the LIVE -> SERVER (live-folder) feature --
  including the "pick the folder" action -- works regardless of the mount
  prefix and is robust to a missing trailing-slash redirect on the
  front-end host (the 404 on /api/xml/folder reported in note #36).
- server.py: fix a stale docstring (the backend binds to 127.0.0.1 by
  default, not 0.0.0.0).
- Supersedes the 1.0.4 build posted in note #40 -- same fixes there (no
  httpd conf shipped, no `httpd` reload in %%post, `httpd` dropped from
  Requires) plus the above. The RPM still ships only files + the
  cgv-web.service systemd unit; Apache configuration stays entirely with
  the host (Puppet at P1).
* Sun May 10 2026 Chrysthofer - 1.0.4-1
- Stop shipping /etc/httpd/conf.d/cgv-web.conf and stop reloading httpd in
  %%post. The host's Apache configuration is owned by Puppet at P1, and
  the bundled snippet conflicted with the existing setup, leaving
  https://pc-atlas-www.cern.ch/cgv-web/ unreachable after upgrading to
  1.0.3 (see ticket #14110, note #37).
- Ship the Apache directives as a reference example under
  /var/www/cgv-web/examples/apache-cgv-web.conf.example -- documentation
  only, never loaded by Apache.
- Drop httpd from Requires (no longer touched by this package).
- No changes to the Python backend, the static site, or the systemd unit.
* Mon May 04 2026 Chrysthofer - 1.0.3-1
- Auto-enable and start cgv-web.service on install (was registered but
  never started, leaving the /api/xml backend dormant in P1).
- Bind backend to 127.0.0.1 by default; expose via Apache reverse-proxy
  at /cgv-web/api/xml/ so the live-folder feature works through the same
  URL that already serves the site.
- Add /etc/sysconfig/cgv-web for runtime overrides (PORT, BIND, XML_FOLDER).
- Add /etc/httpd/conf.d/cgv-web.conf with the proxy snippet.
* Mon May 20 2024 Luciano - 1.0
- Added preun and postun scripts to handle service lifecycle
