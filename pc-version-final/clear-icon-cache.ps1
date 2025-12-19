# 清除 Windows 图标缓存，强制重新加载应用图标
# 用法: .\clear-icon-cache.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "清除 Windows 图标缓存" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "警告: 需要管理员权限来清除图标缓存" -ForegroundColor Yellow
    Write-Host "请以管理员身份运行 PowerShell，然后重新运行此脚本" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] 停止 Windows Explorer..." -ForegroundColor Yellow
Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "  ✓ Explorer 已停止" -ForegroundColor Green

Write-Host "`n[2/3] 清除图标缓存..." -ForegroundColor Yellow

# 图标缓存位置
$iconCachePaths = @(
    "$env:LOCALAPPDATA\IconCache.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*.db",
    "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\thumbcache*.db"
)

$cleared = $false
foreach ($path in $iconCachePaths) {
    $files = Get-ChildItem -Path $path -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        try {
            Remove-Item $file.FullName -Force -ErrorAction Stop
            Write-Host "  ✓ 已删除: $($file.Name)" -ForegroundColor Green
            $cleared = $true
        } catch {
            Write-Host "  ⚠ 无法删除: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

if (-not $cleared) {
    Write-Host "  ⚠ 未找到图标缓存文件（可能已经清除或不存在）" -ForegroundColor Yellow
}

Write-Host "`n[3/3] 重启 Windows Explorer..." -ForegroundColor Yellow
Start-Process "explorer.exe"
Start-Sleep -Seconds 2
Write-Host "  ✓ Explorer 已重启" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "✓ 图标缓存已清除" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "下一步:" -ForegroundColor Cyan
Write-Host "1. 卸载应用（如果已安装）" -ForegroundColor Gray
Write-Host "2. 重新安装 APPX 文件" -ForegroundColor Gray
Write-Host "3. 检查磁贴图标是否正确显示" -ForegroundColor Gray
Write-Host "`n如果图标仍然不正确，可能需要:" -ForegroundColor Yellow
Write-Host "- 重启计算机" -ForegroundColor Gray
Write-Host "- 检查 manifest 中的图标路径是否正确" -ForegroundColor Gray
Write-Host "- 验证图标文件格式和尺寸" -ForegroundColor Gray

