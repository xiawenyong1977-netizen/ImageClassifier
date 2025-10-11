# 对 APPX 包进行签名

$appxPath = "dist\芯图相册-智能分类，便捷管理，仅你可见 1.0.0.appx"
$pfxPath = "test-certificate.pfx"
$pfxPassword = "test123456"

Write-Host "=== 签名 APPX 包 ===" -ForegroundColor Cyan

# 检查文件是否存在
if (-not (Test-Path $appxPath)) {
    Write-Host "错误: 找不到 APPX 包: $appxPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pfxPath)) {
    Write-Host "错误: 找不到证书文件: $pfxPath" -ForegroundColor Red
    exit 1
}

# 查找 SignTool.exe
$signToolPaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22000.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.18362.0\x64\signtool.exe"
)

$signTool = $null
foreach ($path in $signToolPaths) {
    if (Test-Path $path) {
        $signTool = $path
        break
    }
}

if (-not $signTool) {
    # 尝试在 PATH 中查找
    $signTool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
}

if (-not $signTool) {
    Write-Host "错误: 找不到 SignTool.exe" -ForegroundColor Red
    Write-Host "请安装 Windows 10 SDK: https://developer.microsoft.com/windows/downloads/windows-sdk/" -ForegroundColor Yellow
    exit 1
}

Write-Host "找到 SignTool: $signTool" -ForegroundColor Green
Write-Host "正在签名 APPX 包..." -ForegroundColor Yellow

# 对 APPX 包进行签名
& $signTool sign `
    /fd SHA256 `
    /a `
    /f $pfxPath `
    /p $pfxPassword `
    $appxPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n签名成功！" -ForegroundColor Green
    Write-Host "现在可以尝试安装 APPX 包了" -ForegroundColor Green
} else {
    Write-Host "`n签名失败！退出代码: $LASTEXITCODE" -ForegroundColor Red
}


