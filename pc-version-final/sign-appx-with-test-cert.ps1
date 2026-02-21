# Sign APPX with test certificate
# Usage: .\sign-appx-with-test-cert.ps1 [appx-path]

param(
    [string]$AppxPath = "",
    [string]$CertPath = "",
    [string]$CertPassword = "test123456"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "APPX test certificate signing" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($AppxPath)) {
    Write-Host "Finding latest unsigned APPX..." -ForegroundColor Yellow

    $appxFiles = Get-ChildItem -Path "$PSScriptRoot\dist" -Filter "*.appx" -ErrorAction SilentlyContinue |
                 Where-Object { $_.Name -notlike "*-signed.appx" } |
                 Sort-Object LastWriteTime -Descending

    if ($appxFiles -and $appxFiles.Count -gt 0) {
        $AppxPath = $appxFiles[0].FullName
        Write-Host "Found APPX: $AppxPath" -ForegroundColor Green
    } else {
        Write-Host "Error: No unsigned APPX found. Run: npm run electron-pack-appx" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $AppxPath)) {
    Write-Host "Error: APPX file does not exist: $AppxPath" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrEmpty($CertPath)) {
    $CertPath = Join-Path $PSScriptRoot "test-certificate.pfx"
}

if (-not (Test-Path $CertPath)) {
    Write-Host "Error: Certificate not found: $CertPath" -ForegroundColor Red
    Write-Host "Create one: .\create-test-certificate.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Certificate: $CertPath" -ForegroundColor Gray

Write-Host "`nChecking SignTool..." -ForegroundColor Yellow
try {
    $signTool = (Get-Command signtool.exe -ErrorAction Stop).Source
    Write-Host "[OK] SignTool: $signTool" -ForegroundColor Green
} catch {
    Write-Host "[X] SignTool.exe not found" -ForegroundColor Red
    Write-Host "Add to PATH or install Windows SDK: https://developer.microsoft.com/windows/downloads/windows-sdk/" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nChecking certificate in trusted root..." -ForegroundColor Yellow

$certInstalled = $false
try {
    $rootCerts = Get-ChildItem -Path "Cert:\LocalMachine\Root" -ErrorAction SilentlyContinue
    $pfxCert = Get-PfxData -FilePath $CertPath -Password (ConvertTo-SecureString -String $CertPassword -Force -AsPlainText) -ErrorAction SilentlyContinue

    if ($pfxCert) {
        $certThumbprint = $pfxCert.EndEntityCertificates[0].Thumbprint
        foreach ($rootCert in $rootCerts) {
            if ($rootCert.Thumbprint -eq $certThumbprint) {
                $certInstalled = $true
                break
            }
        }
    }
} catch {
    # ignore
}

if (-not $certInstalled) {
    Write-Host "Warning: Certificate may not be in trusted root. If install fails, run: .\install-test-certificate.bat (as Admin)" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "`nVerifying certificate file..." -ForegroundColor Yellow
try {
    $securePassword = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
    $pfxCert = Get-PfxData -FilePath $CertPath -Password $securePassword -ErrorAction Stop
    Write-Host "[OK] Certificate valid" -ForegroundColor Green
    Write-Host "  Subject: $($pfxCert.EndEntityCertificates[0].Subject)" -ForegroundColor Gray
    Write-Host "  Thumbprint: $($pfxCert.EndEntityCertificates[0].Thumbprint)" -ForegroundColor Gray
} catch {
    Write-Host "[X] Certificate verification failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Check path and password" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nSigning APPX..." -ForegroundColor Yellow

$AppxPath = (Resolve-Path $AppxPath -ErrorAction Stop).Path
$CertPath = (Resolve-Path $CertPath -ErrorAction Stop).Path

$signedAppxPath = $AppxPath -replace '\.appx$', '-signed.appx'

Write-Host "Unsigned: $AppxPath" -ForegroundColor Gray
Write-Host "Signed:   $signedAppxPath" -ForegroundColor Gray
Write-Host "Cert:     $CertPath" -ForegroundColor Gray

if (-not (Test-Path $AppxPath)) {
    Write-Host "[X] APPX not found: $AppxPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $CertPath)) {
    Write-Host "[X] Certificate not found: $CertPath" -ForegroundColor Red
    exit 1
}

try {
    Write-Host "`nSigning (no timestamp)..." -ForegroundColor Gray

    Write-Host "`nCopying to signed path..." -ForegroundColor Gray
    Copy-Item -Path $AppxPath -Destination $signedAppxPath -Force
    Write-Host "[OK] Copy created" -ForegroundColor Green

    $signArgs1 = @(
        "sign",
        "/fd", "sha256",
        "/f", $CertPath,
        "/p", $CertPassword,
        "/v",
        $signedAppxPath
    )

    Write-Host "Running: signtool sign /fd sha256 /f cert /p *** /v signed.appx" -ForegroundColor Gray
    Write-Host ""

    & $signTool $signArgs1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[OK] APPX signed successfully" -ForegroundColor Green
        Write-Host "  Unsigned: $AppxPath" -ForegroundColor Gray
        Write-Host "  Signed:   $signedAppxPath" -ForegroundColor Green

        Write-Host "`nVerifying signature..." -ForegroundColor Yellow
        $verifyArgs = @(
            "verify",
            "/pa",
            "/v",
            $signedAppxPath
        )

        & $signTool $verifyArgs

        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n[OK] Signature verified" -ForegroundColor Green
        } else {
            Write-Host "`n[!] Verify failed but file is signed" -ForegroundColor Yellow
        }

    } else {
        Write-Host "`nTrying with timestamp server..." -ForegroundColor Yellow

        if (-not (Test-Path $signedAppxPath)) {
            Write-Host "`nCopying to signed path..." -ForegroundColor Gray
            Copy-Item -Path $AppxPath -Destination $signedAppxPath -Force
            Write-Host "[OK] Copy created" -ForegroundColor Green
        }

        $signArgs2 = @(
            "sign",
            "/fd", "sha256",
            "/f", $CertPath,
            "/p", $CertPassword,
            "/tr", "http://timestamp.digicert.com",
            "/td", "sha256",
            "/v",
            $signedAppxPath
        )

        Write-Host "Running: signtool sign ... /tr timestamp ..." -ForegroundColor Gray
        Write-Host ""

        & $signTool $signArgs2

        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n[OK] APPX signed (with timestamp)" -ForegroundColor Green
            Write-Host "  Unsigned: $AppxPath" -ForegroundColor Gray
            Write-Host "  Signed:   $signedAppxPath" -ForegroundColor Green

            Write-Host "`nVerifying signature..." -ForegroundColor Yellow
            $verifyArgs = @(
                "verify",
                "/pa",
                "/v",
                $signedAppxPath
            )

            & $signTool $verifyArgs

            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n[OK] Signature verified" -ForegroundColor Green
            } else {
                Write-Host "`n[!] Verify failed but file is signed" -ForegroundColor Yellow
            }
        } else {
            Write-Host "`n[X] Sign failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "`nTry: 1) Check password (default test123456) 2) Recreate cert: .\create-test-certificate.ps1 3) Check cert file" -ForegroundColor Yellow
            if (Test-Path $signedAppxPath) {
                Remove-Item $signedAppxPath -Force -ErrorAction SilentlyContinue
            }
            exit 1
        }
    }

} catch {
    Write-Host "`n[X] Sign error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Details: $($_.Exception)" -ForegroundColor Gray
    if (Test-Path $signedAppxPath) {
        Remove-Item $signedAppxPath -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "[OK] Signing complete" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "Files:" -ForegroundColor Cyan
Write-Host "  Unsigned: $AppxPath" -ForegroundColor Gray
Write-Host "    Use for: Microsoft Store / Partner Center upload" -ForegroundColor DarkGray
Write-Host "  Signed:   $signedAppxPath" -ForegroundColor Green
Write-Host "    Use for: Local test install" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next: Add-AppxPackage `"$signedAppxPath`" or .\install-and-test-appx.ps1 `"$signedAppxPath`"" -ForegroundColor Cyan
Write-Host "Store upload: use unsigned file $AppxPath" -ForegroundColor Gray
