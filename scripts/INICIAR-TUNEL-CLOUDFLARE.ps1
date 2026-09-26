$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STREAMBRIDGE - HTTPS CON CLOUDFLARE TUNNEL" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "No encuentro cloudflared." -ForegroundColor Yellow
    Write-Host "Instálalo una vez con:" -ForegroundColor Yellow
    Write-Host "winget install --id Cloudflare.cloudflared" -ForegroundColor White
    throw "Instala cloudflared y vuelve a ejecutar este script."
}

if (-not (Test-Path "$Root\node_modules")) {
    npm install
}

$server = Start-Process powershell -PassThru -ArgumentList "-NoExit", "-Command", "Set-Location '$Root'; npm start"
Start-Sleep -Seconds 2

Write-Host "Servidor local PID: $($server.Id)" -ForegroundColor Green
Write-Host "Cloudflare mostrará una URL https://...trycloudflare.com" -ForegroundColor Green
Write-Host "ABRE ESA URL EN LA PC y crea la sesión desde allí para que el QR también sea HTTPS." -ForegroundColor Yellow
Write-Host ""

cloudflared tunnel --url http://localhost:3000
