# Build and sign Release APK
# Usage: .\build-and-sign-release.ps1
# CI build only (no sign): .\build-and-sign-release.ps1 -SkipSign

param(
    [switch]$SkipSign
)

Write-Host "[*] Build and sign Release APK..." -ForegroundColor Green

# Step 1: clean and build
Write-Host "`n[1] Building Release..." -ForegroundColor Yellow
.\gradlew clean
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Clean failed" -ForegroundColor Red
    exit 1
}

.\gradlew assembleRelease
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Release build done" -ForegroundColor Green

if ($SkipSign) {
    Write-Host "`n[>>] Skip sign (CI mode)" -ForegroundColor Yellow
    Write-Host "Unsigned APK: app\build\outputs\apk\release\app-release-unsigned.apk" -ForegroundColor Cyan
    exit 0
}

# Step 2: sign
Write-Host "`n[2] Signing..." -ForegroundColor Yellow
.\sign-release-apk.ps1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Sign failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n[OK] Done" -ForegroundColor Green
Write-Host "Signed APK: app\build\outputs\apk\release\app-release-signed.apk" -ForegroundColor Cyan
