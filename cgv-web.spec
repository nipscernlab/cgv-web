Name:           cgv-web
Version:        1.0.3
Release:        1%{?dist}
Summary:        Static Web Server for ATLAS Control Room
License:        NIPSCERN License
BuildArch:      noarch
Source0:        %{name}-%{version}.tar.gz
Requires:       python3, systemd, httpd
BuildRequires:  systemd

%description
CGV Web static project packaged as a systemd service for CERN P1.

The package ships:
  - the static site under /var/www/cgv-web
  - a systemd unit running the Python backend on 127.0.0.1:8080
    (serves /api/xml/* used by the LIVE -> SERVER mode of the UI)
  - an Apache snippet that reverse-proxies /cgv-web/api/xml/* to the
    local backend, so the same URL that already serves the site
    (e.g. http://pc-atlas-www.cern.ch/cgv-web/) can also reach the API.

%prep
%setup -q -n %{name}-%{version}

%install
mkdir -p %{buildroot}/var/www/cgv-web
cp -r * %{buildroot}/var/www/cgv-web/
mkdir -p %{buildroot}/usr/lib/systemd/system
mkdir -p %{buildroot}/etc/httpd/conf.d
mkdir -p %{buildroot}/etc/sysconfig

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
# XML_FOLDER can also be set at runtime from the UI (pencil icon).
# Uncomment to set a default folder watched at boot:
# XML_FOLDER=/atlas/EventDisplayEvents
SYSCONFIG

cat <<HTTPD > %{buildroot}/etc/httpd/conf.d/cgv-web.conf
# CGV Web -- bridge from Apache to the local Python backend.
# Apache keeps serving the static site (HTML/JS/CSS) directly from disk;
# only the /api/xml/* paths are forwarded to the backend.
#
# Assumes Apache and the backend run on the SAME host. If you ever split
# them, change 127.0.0.1:8080 below to <backend-host>:<port> AND change
# BIND in /etc/sysconfig/cgv-web accordingly (and open the firewall).
<IfModule mod_proxy.c>
  ProxyRequests Off
  ProxyPreserveHost On
  ProxyPass        /cgv-web/api/xml/  http://127.0.0.1:8080/api/xml/
  ProxyPassReverse /cgv-web/api/xml/  http://127.0.0.1:8080/api/xml/
</IfModule>
HTTPD

%files
/var/www/cgv-web/
/usr/lib/systemd/system/cgv-web.service
%config(noreplace) /etc/sysconfig/cgv-web
%config(noreplace) /etc/httpd/conf.d/cgv-web.conf

%post
%systemd_post cgv-web.service
systemctl enable --now cgv-web.service >/dev/null 2>&1 || :
systemctl is-active --quiet httpd && systemctl reload httpd >/dev/null 2>&1 || :
IP_ADDR=$(hostname -I | awk '{print $1}')
echo "------------------------------------------------------"
echo "  SUCCESS: CGV Web has been installed."
echo "  Site:    http://${IP_ADDR}/cgv-web/   (via Apache)"
echo "  Backend: http://127.0.0.1:8080/       (local only)"
echo "------------------------------------------------------"

%preun
%systemd_preun cgv-web.service

%postun
%systemd_postun_with_restart cgv-web.service
systemctl is-active --quiet httpd && systemctl reload httpd >/dev/null 2>&1 || :

%changelog
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
