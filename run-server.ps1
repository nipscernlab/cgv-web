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

Write-Host ""
Write-Host "  Serving $Root"
Write-Host "  at       $prefix"
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
