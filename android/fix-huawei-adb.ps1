# 修复华为手机 ADB 连接问题脚本
# 使用方法: .\fix-huawei-adb.ps1

Write-Host "🔧 华为手机 ADB 连接修复工具" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# 检查 adb 是否可用
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ 错误: 未找到 adb 命令" -ForegroundColor Red
    Write-Host "   请确保 Android SDK Platform Tools 已添加到 PATH" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n步骤 1: 重启 ADB 服务..." -ForegroundColor Yellow
adb kill-server
Start-Sleep -Seconds 2
adb start-server
Start-Sleep -Seconds 2

Write-Host "`n步骤 2: 检查设备连接..." -ForegroundColor Yellow
$devices = adb devices
Write-Host $devices

$deviceCount = ($devices | Select-String -Pattern "device$").Count

if ($deviceCount -eq 0) {
    Write-Host "`n❌ 未检测到设备" -ForegroundColor Red
    Write-Host "`n请按照以下步骤操作:" -ForegroundColor Yellow
    Write-Host "1. 确保手机已启用 USB 调试" -ForegroundColor White
    Write-Host "2. 在开发者选项中启用 '仅充电模式下允许 ADB 调试'" -ForegroundColor White
    Write-Host "3. 连接时选择 '传输文件' 或 'MTP' 模式" -ForegroundColor White
    Write-Host "4. 首次连接时，在手机上点击 '允许 USB 调试' 并勾选 '始终允许'" -ForegroundColor White
    Write-Host "5. 如果仍无法连接，尝试安装华为 HiSuite 或 USB 驱动" -ForegroundColor White
    
    Write-Host "`n正在检查设备管理器中的设备..." -ForegroundColor Cyan
    $usbDevices = Get-PnpDevice | Where-Object { $_.FriendlyName -like "*Android*" -or $_.FriendlyName -like "*ADB*" -or $_.FriendlyName -like "*Huawei*" }
    if ($usbDevices) {
        Write-Host "找到以下可能的设备:" -ForegroundColor Yellow
        $usbDevices | ForEach-Object {
            Write-Host "  - $($_.FriendlyName) (状态: $($_.Status))" -ForegroundColor Gray
        }
    } else {
        Write-Host "未在设备管理器中找到 Android 设备" -ForegroundColor Gray
    }
    
    Write-Host "`n尝试重新连接..." -ForegroundColor Cyan
    Write-Host "请拔掉 USB 线，等待 3 秒后重新插入" -ForegroundColor Yellow
    $countdown = 5
    while ($countdown -gt 0) {
        Write-Host "等待 $countdown 秒..." -ForegroundColor Gray
        Start-Sleep -Seconds 1
        $countdown--
    }
    
    Write-Host "`n重新检查设备..." -ForegroundColor Cyan
    adb kill-server
    Start-Sleep -Seconds 1
    adb start-server
    Start-Sleep -Seconds 2
    $devices = adb devices
    Write-Host $devices
    
    $deviceCount = ($devices | Select-String -Pattern "device$").Count
    if ($deviceCount -eq 0) {
        Write-Host "`n❌ 仍然无法检测到设备" -ForegroundColor Red
        Write-Host "`n建议:" -ForegroundColor Yellow
        Write-Host "1. 安装华为 HiSuite: https://consumer.huawei.com/cn/support/hisuite/" -ForegroundColor White
        Write-Host "2. 或下载华为 USB 驱动并手动安装" -ForegroundColor White
        Write-Host "3. 尝试使用不同的 USB 端口（优先使用 USB 2.0）" -ForegroundColor White
        Write-Host "4. 尝试使用原装数据线" -ForegroundColor White
        exit 1
    }
}

Write-Host "`n✅ 成功检测到 $deviceCount 个设备" -ForegroundColor Green

Write-Host "`n步骤 3: 获取设备信息..." -ForegroundColor Yellow
adb devices -l

Write-Host "`n步骤 4: 测试连接..." -ForegroundColor Yellow
$model = adb shell getprop ro.product.model 2>$null
$version = adb shell getprop ro.build.version.release 2>$null

if ($model) {
    Write-Host "设备型号: $model" -ForegroundColor Green
    Write-Host "Android 版本: $version" -ForegroundColor Green
    Write-Host "`n✅ ADB 连接正常！" -ForegroundColor Green
} else {
    Write-Host "⚠️  警告: 无法获取设备信息，但设备已连接" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "现在可以使用以下命令查看日志:" -ForegroundColor Cyan
Write-Host "  adb logcat -s GalleryScanService" -ForegroundColor White
Write-Host "  或运行: .\view-release-logs.ps1" -ForegroundColor White


