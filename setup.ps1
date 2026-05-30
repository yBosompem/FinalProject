# Secure Exam Monitor — Windows setup script
# Run from PowerShell:  .\setup.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Secure Exam Monitor Setup ===" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is not installed. Install from https://nodejs.org" -ForegroundColor Red
  exit 1
}

Write-Host "Node $(node -v) | npm $(npm -v)"

# Server
Write-Host "`n[1/4] Installing server..." -ForegroundColor Yellow
Set-Location "$root\server"
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install --no-audit --no-fund

# Client
Write-Host "`n[2/4] Installing client..." -ForegroundColor Yellow
Set-Location "$root\client"
npm install --no-audit --no-fund

# AI service (lite deps first; optional full TF install)
Write-Host "`n[3/4] Installing AI service (Python)..." -ForegroundColor Yellow
Set-Location "$root\ai-service"
if (-not (Test-Path venv)) { python -m venv venv }
& "$root\ai-service\venv\Scripts\pip.exe" install -r requirements-lite.txt

# Seed database
Write-Host "`n[4/4] Seeding database (requires MongoDB running)..." -ForegroundColor Yellow
Set-Location "$root\server"
npm run seed

Set-Location $root
Write-Host "`n=== Setup complete ===" -ForegroundColor Green
Write-Host "Start MongoDB, then open 3 terminals:"
Write-Host "  1. cd server   ; npm run dev"
Write-Host "  2. cd ai-service ; .\venv\Scripts\activate ; python -m uvicorn app:app --reload --port 8000"
Write-Host "  3. cd client   ; npm run dev"
Write-Host "`nApp: http://localhost:5173"
Write-Host "Admin: admin@university.edu / admin123"
Write-Host "Student: student@university.edu / student123"
