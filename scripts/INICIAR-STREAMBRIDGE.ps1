$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " STREAMBRIDGE STUDIO - INICIO LOCAL" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js no está instalado o no está en PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm no está instalado o no está en PATH."
}

Write-Host "Node: $(node -v)" -ForegroundColor Green
Write-Host "npm : $(npm -v)" -ForegroundColor Green

if (-not (Test-Path "$Root\node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "Abre en la PC: http://localhost:3000" -ForegroundColor Green
Write-Host "IMPORTANTE: para abrir la cámara desde iPhone/Android usa HTTPS." -ForegroundColor Yellow
Write-Host "Puedes desplegar el proyecto o ejecutar scripts\INICIAR-TUNEL-CLOUDFLARE.ps1." -ForegroundColor Yellow
Write-Host ""

npm start
