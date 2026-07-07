# ============================================================================
# CGV-Web - Logger de temperatura/clock/potencia da GPU NVIDIA (durante o bench).
# ----------------------------------------------------------------------------
# O bench roda no NAVEGADOR e JavaScript NAO le sensor de GPU. Entao a
# temperatura e gravada POR FORA, aqui, com nvidia-smi, carimbando o horario em
# EPOCH UTC (ms) - o mesmo relogio (Date.now()) que o bench.js grava em
# startedMs/endedMs de cada cenario. Assim o merge-temps.mjs casa os dois SEM
# ambiguidade de fuso.
#
# USO: abra ESTE terminal ANTES de rodar a suite e deixe rodando durante TODOS
# os testes daquela maquina (nao precisa 1 CSV por teste - 1 CSV cobre a sessao
# inteira; o merge fatia por cenario). Ctrl-C para parar.
#
#   powershell -ExecutionPolicy Bypass -File bench\log-gpu.ps1
#   powershell -ExecutionPolicy Bypass -File bench\log-gpu.ps1 -IntervalMs 500   # mais fino
#
# Depois:  node bench\merge-temps.mjs <suite.json> bench\dados\temps\gpu-<...>.csv
# ============================================================================
param([int]$IntervalMs = 1000, [int]$Gpu = 0)

$dir = Join-Path $PSScriptRoot "dados\temps"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = (Get-Date).ToString("yyyy-MM-ddTHH-mm-ss")
$file = Join-Path $dir "gpu-$stamp.csv"
"epochMs,tempC,clockSMMHz,utilPct,powerW" | Out-File -FilePath $file -Encoding ascii

Write-Host "Gravando temperatura da GPU $Gpu em:" -ForegroundColor Cyan
Write-Host "  $file"
Write-Host "Deixe rodando durante os testes. Ctrl-C para parar." -ForegroundColor Yellow

while ($true) {
  $ms = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $q = & nvidia-smi -i $Gpu --query-gpu=temperature.gpu,clocks.sm,utilization.gpu,power.draw --format=csv,noheader,nounits 2>$null
  if ($LASTEXITCODE -eq 0 -and $q) {
    $row = ($q -split "`n")[0].Trim() -replace '\s*,\s*', ','
    "$ms,$row" | Add-Content -Path $file -Encoding ascii
  }
  Start-Sleep -Milliseconds $IntervalMs
}
