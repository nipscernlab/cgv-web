# run-server.ps1 -- Zero-dependency static server for CGV Web.
#
# Invoked by run.bat on double-click. Uses the built-in .NET HttpListener,
# so no Python / Node / npm is required on the end-user's machine.
#
# Critical MIME rules for this project:
#   * .wasm must be served as application/wasm (WebAssembly streaming).
#   * .glb.gz must be served as application/gzip WITHOUT a
#     Content-Encoding: gzip header -- the app decompresses manually via
#     DecompressionStream. If we tagged it Content-Encoding: gzip the
#     browser would auto-decompress and the DecompressionStream would get
#     already-inflated bytes.

param(
  [string]$Root = (Get-Location).Path,
  [int]   $Port = 8080
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path

# ── XML folder state (used by the SERVER sub-mode of the sidebar) ─────────
# Configured via XML_FOLDER env var; mutable at runtime via
# POST /api/xml/set-folder. No auth -- intended for trusted networks.
$script:XmlFolder = $null
if ($env:XML_FOLDER) {
  try   { $script:XmlFolder = (Resolve-Path -LiteralPath $env:XML_FOLDER).Path }
  catch { Write-Host "  WARN: XML_FOLDER invalid -- continuing without folder" }
}

function Send-Json($res, $code, $obj) {
  $json  = $obj | ConvertTo-Json -Compress -Depth 10
  if ($null -eq $json) { $json = 'null' }
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $res.StatusCode      = $code
  $res.ContentType     = 'application/json; charset=utf-8'
  $res.ContentLength64 = $bytes.Length
  $res.Headers.Add('Cache-Control', 'no-store')
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Get-XmlList {
  if (-not $script:XmlFolder) { return $null }
  if (-not (Test-Path -LiteralPath $script:XmlFolder -PathType Container)) { return @() }
  $items = Get-ChildItem -LiteralPath $script:XmlFolder -File -Filter '*.xml' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 100
  $out = New-Object System.Collections.ArrayList
  foreach ($f in $items) {
    [void]$out.Add(@{
      name  = $f.Name
      size  = [int64]$f.Length
      mtime = [int64]([Math]::Round((($f.LastWriteTimeUtc - [DateTime]'1970-01-01').TotalMilliseconds)))
    })
  }
  return ,$out.ToArray()
}

function Set-XmlFolder([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) { throw 'path is required' }
  $resolved = (Resolve-Path -LiteralPath $path -ErrorAction Stop).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
    throw 'not a directory'
  }
  # Probe readability with one cheap operation
  Get-ChildItem -LiteralPath $resolved -ErrorAction Stop -Force | Select-Object -First 1 | Out-Null
  $script:XmlFolder = $resolved
}

$Mime = @{
  '.html'  = 'text/html; charset=utf-8'
  '.htm'   = 'text/html; charset=utf-8'
  '.js'    = 'text/javascript; charset=utf-8'
  '.mjs'   = 'text/javascript; charset=utf-8'
  '.css'   = 'text/css; charset=utf-8'
  '.json'  = 'application/json; charset=utf-8'
  '.xml'   = 'application/xml; charset=utf-8'
  '.svg'   = 'image/svg+xml'
  '.png'   = 'image/png'
  '.jpg'   = 'image/jpeg'
  '.jpeg'  = 'image/jpeg'
  '.gif'   = 'image/gif'
  '.webp'  = 'image/webp'
  '.ico'   = 'image/x-icon'
  '.wasm'  = 'application/wasm'
  '.glb'   = 'model/gltf-binary'
  '.gltf'  = 'model/gltf+json'
  '.gz'    = 'application/gzip'
  '.woff'  = 'font/woff'
  '.woff2' = 'font/woff2'
  '.ttf'   = 'font/ttf'
  '.otf'   = 'font/otf'
  '.txt'   = 'text/plain; charset=utf-8'
  '.map'   = 'application/json; charset=utf-8'
}

function Get-Mime([string]$path) {
  $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($Mime.ContainsKey($ext)) { return $Mime[$ext] }
  return 'application/octet-stream'
}

$prefix   = "http://localhost:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "  ERROR: could not bind to $prefix"
  Write-Host "  Port $Port may be in use. Try another, e.g.:"
  Write-Host "      run.bat 9090"
  Write-Host ""
  exit 1
}

$xmlBanner = if ($script:XmlFolder) { $script:XmlFolder } else { "<not set>  (set XML_FOLDER env var or POST /api/xml/set-folder)" }

Write-Host ""
Write-Host "  Serving  $Root"
Write-Host "  at       $prefix"
Write-Host "  XML dir  $xmlBanner"
Write-Host ""
Write-Host "  Opening browser..."
Write-Host "  Press Ctrl+C (or close this window) to stop."
Write-Host ""

try { Start-Process $prefix | Out-Null } catch {}

try {
  while ($listener.IsListening) {
    $ctx = $null
    try { $ctx = $listener.GetContext() } catch { break }
    if ($null -eq $ctx) { continue }

    $req = $ctx.Request
    $res = $ctx.Response
    $urlPath = '/'

    try {
      $urlPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

      # ── XML API routes ──────────────────────────────────────────────
      if ($urlPath.StartsWith('/api/')) {
        $method = $req.HttpMethod.ToUpperInvariant()

        if ($method -eq 'OPTIONS') {
          $res.StatusCode = 204
          $res.Headers.Add('Access-Control-Allow-Origin',  '*')
          $res.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          $res.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
          $res.Headers.Add('Access-Control-Max-Age',       '86400')
          Write-Host ("  204 {0}" -f $urlPath)
          continue
        }

        if ($method -eq 'GET' -and $urlPath -eq '/api/xml/list') {
          $list = Get-XmlList
          if ($null -eq $list) { Send-Json $res 503 @{ error = 'no folder configured' } }
          else                 { Send-Json $res 200 $list }
          Write-Host ("  {0,3} {1}" -f $res.StatusCode, $urlPath)
          continue
        }

        if ($method -eq 'GET' -and $urlPath -eq '/api/xml/folder') {
          Send-Json $res 200 @{ path = $script:XmlFolder }
          Write-Host ("  200 {0}" -f $urlPath)
          continue
        }

        if ($method -eq 'GET' -and $urlPath.StartsWith('/api/xml/file/')) {
          $name = $urlPath.Substring('/api/xml/file/'.Length)
          if ($name.Contains('/') -or $name.Contains('\') -or $name -eq '..' -or $name -eq '.' -or -not $name.ToLower().EndsWith('.xml')) {
            Send-Json $res 400 @{ error = 'invalid name' }
          }
          elseif (-not $script:XmlFolder) {
            Send-Json $res 503 @{ error = 'no folder configured' }
          }
          else {
            $fp = Join-Path $script:XmlFolder $name
            if (-not (Test-Path -LiteralPath $fp -PathType Leaf)) {
              Send-Json $res 404 @{ error = 'file not found' }
            } else {
              try {
                $bytes = [IO.File]::ReadAllBytes($fp)
                $res.StatusCode      = 200
                $res.ContentType     = 'application/xml; charset=utf-8'
                $res.ContentLength64 = $bytes.Length
                $res.Headers.Add('Cache-Control', 'no-store')
                $res.Headers.Add('Access-Control-Allow-Origin', '*')
                if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
              } catch {
                Send-Json $res 500 @{ error = $_.Exception.Message }
              }
            }
          }
          Write-Host ("  {0,3} {1}" -f $res.StatusCode, $urlPath)
          continue
        }

        if ($method -eq 'POST' -and $urlPath -eq '/api/xml/set-folder') {
          try {
            $reader = New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)
            $body   = $reader.ReadToEnd()
            $reader.Close()
            $payload = $body | ConvertFrom-Json
            $newPath = if ($payload -and $payload.PSObject.Properties.Match('path').Count) { [string]$payload.path } else { '' }
            Set-XmlFolder $newPath
            Write-Host ("  XML folder set to: {0}" -f $script:XmlFolder)
            Send-Json $res 200 @{ path = $script:XmlFolder }
          } catch [System.Management.Automation.ItemNotFoundException] {
            Send-Json $res 404 @{ error = 'folder not found' }
          } catch [System.UnauthorizedAccessException] {
            Send-Json $res 403 @{ error = 'cannot read folder' }
          } catch {
            Send-Json $res 400 @{ error = $_.Exception.Message }
          }
          Write-Host ("  {0,3} {1}" -f $res.StatusCode, $urlPath)
          continue
        }

        Send-Json $res 404 @{ error = 'not found' }
        Write-Host ("  404 {0}" -f $urlPath)
        continue
      }

      if ($urlPath -eq '/') { $urlPath = '/index.html' }

      $rel = $urlPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
      $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))

      # Directory-traversal guard
      if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        continue
      }

      if (Test-Path -LiteralPath $full -PathType Container) {
        $idx = Join-Path $full 'index.html'
        if (Test-Path -LiteralPath $idx -PathType Leaf) { $full = $idx }
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $res.StatusCode = 404
        $body = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
        $res.ContentType = 'text/plain; charset=utf-8'
        $res.ContentLength64 = $body.Length
        if ($req.HttpMethod -ne 'HEAD') {
          $res.OutputStream.Write($body, 0, $body.Length)
        }
        Write-Host ("  404 {0}" -f $urlPath)
        continue
      }

      $bytes = [IO.File]::ReadAllBytes($full)
      $res.StatusCode      = 200
      $res.ContentType     = Get-Mime $full
      $res.ContentLength64 = $bytes.Length
      # Disable caching so reloads always pick up edits.
      $res.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')

      if ($req.HttpMethod -ne 'HEAD') {
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      Write-Host ("  {0,3} {1}" -f $res.StatusCode, $urlPath)
    } catch {
      try {
        $res.StatusCode = 500
        $msg = [Text.Encoding]::UTF8.GetBytes("500: $($_.Exception.Message)")
        $res.ContentType = 'text/plain; charset=utf-8'
        $res.ContentLength64 = $msg.Length
        $res.OutputStream.Write($msg, 0, $msg.Length)
      } catch {}
      Write-Host ("  500 $urlPath  ->  $($_.Exception.Message)")
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  try { $listener.Stop();  $listener.Close() } catch {}
}
