# 检查安装状态

Write-Host "`n=== 检查证书 ===" -ForegroundColor Cyan
$certs = Get-ChildItem -Path Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*ImageClassifier*" }
if ($certs) {
    Write-Host "找到证书:" -ForegroundColor Green
    $certs | Format-Table Subject, Thumbprint, NotAfter
} else {
    Write-Host "未找到 ImageClassifier 证书！" -ForegroundColor Red
}

Write-Host "`n=== 检查已安装的应用 ===" -ForegroundColor Cyan
$app = Get-AppxPackage | Where-Object { $_.Name -like "*ImageClassifier*" }
if ($app) {
    Write-Host "应用已安装:" -ForegroundColor Green
    $app | Format-List Name, PackageFullName, InstallLocation, Status
} else {
    Write-Host "应用未安装" -ForegroundColor Yellow
    
    Write-Host "`n=== 尝试安装应用 ===" -ForegroundColor Cyan
    $appxPath = "dist\芯图相册-智能分类，便捷管理，仅你可见 1.0.0.appx"
    
    if (Test-Path $appxPath) {
        Write-Host "找到 APPX 包: $appxPath" -ForegroundColor Green
        Write-Host "正在安装..." -ForegroundColor Yellow
        
        try {
            Add-AppxPackage -Path $appxPath -ErrorAction Stop
            Write-Host "安装成功！" -ForegroundColor Green
        } catch {
            Write-Host "安装失败！" -ForegroundColor Red
            Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "未找到 APPX 包: $appxPath" -ForegroundColor Red
    }
}


