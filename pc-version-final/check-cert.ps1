# 检查证书状态

Write-Host "=== 检查证书状态 ===" -ForegroundColor Cyan
Write-Host ""

# 检查 CurrentUser\My
Write-Host "1. 检查当前用户个人证书存储 (CurrentUser\My):" -ForegroundColor Yellow
$userCerts = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -match "ImageClassifier" }
if ($userCerts) {
    $userCerts | Format-Table Subject, Thumbprint, NotAfter
} else {
    Write-Host "   未找到证书" -ForegroundColor Red
}

Write-Host ""

# 检查 LocalMachine\Root
Write-Host "2. 检查本地计算机受信任根证书存储 (LocalMachine\Root):" -ForegroundColor Yellow
$rootCerts = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "ImageClassifier" }
if ($rootCerts) {
    $rootCerts | Format-Table Subject, Thumbprint, NotAfter
} else {
    Write-Host "   未找到证书 (需要安装)" -ForegroundColor Red
}

Write-Host ""

# 检查文件
Write-Host "3. 检查证书文件:" -ForegroundColor Yellow
if (Test-Path "test-certificate.pfx") {
    Write-Host "   ✓ test-certificate.pfx 存在" -ForegroundColor Green
} else {
    Write-Host "   ✗ test-certificate.pfx 不存在" -ForegroundColor Red
}

if (Test-Path "test-certificate.cer") {
    Write-Host "   ✓ test-certificate.cer 存在" -ForegroundColor Green
} else {
    Write-Host "   ✗ test-certificate.cer 不存在" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")


