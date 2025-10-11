# 在开发者模式下安装 APPX 应用

# 切换到脚本所在目录
Set-Location $PSScriptRoot

Write-Host "=== 芯图相册 APPX 安装脚本 ===" -ForegroundColor Cyan
Write-Host ""

# 检查是否以管理员权限运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "警告: 未以管理员权限运行" -ForegroundColor Yellow
    Write-Host "建议右键点击此脚本，选择'以管理员身份运行'" -ForegroundColor Yellow
    Write-Host ""
}

# 检查开发者模式
Write-Host "步骤 1: 检查开发者模式..." -ForegroundColor Cyan
$devModeKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
$devModeValue = "AllowDevelopmentWithoutDevLicense"

try {
    $devMode = Get-ItemProperty -Path $devModeKey -Name $devModeValue -ErrorAction SilentlyContinue
    
    if ($devMode.$devModeValue -eq 1) {
        Write-Host "✓ 开发者模式已启用" -ForegroundColor Green
    } else {
        Write-Host "✗ 开发者模式未启用" -ForegroundColor Red
        
        if ($isAdmin) {
            Write-Host "正在启用开发者模式..." -ForegroundColor Yellow
            try {
                if (-not (Test-Path $devModeKey)) {
                    New-Item -Path $devModeKey -Force | Out-Null
                }
                Set-ItemProperty -Path $devModeKey -Name $devModeValue -Value 1
                Write-Host "✓ 开发者模式已启用" -ForegroundColor Green
            } catch {
                Write-Host "✗ 无法启用开发者模式: $_" -ForegroundColor Red
                Write-Host "请手动启用：设置 > 隐私和安全性 > 开发者选项 > 开发人员模式" -ForegroundColor Yellow
                exit 1
            }
        } else {
            Write-Host "请以管理员权限运行此脚本以自动启用开发者模式" -ForegroundColor Yellow
            Write-Host "或手动启用：设置 > 隐私和安全性 > 开发者选项 > 开发人员模式" -ForegroundColor Yellow
            $continue = Read-Host "是否继续尝试安装？(y/n)"
            if ($continue -ne 'y') {
                exit 1
            }
        }
    }
} catch {
    Write-Host "✗ 无法检查开发者模式状态: $_" -ForegroundColor Red
}

Write-Host ""

# 查找 APPX 包
Write-Host "步骤 2: 查找 APPX 包..." -ForegroundColor Cyan
$appxPath = "dist\芯图相册-智能分类，便捷管理，仅你可见 1.0.0.appx"

if (-not (Test-Path $appxPath)) {
    Write-Host "✗ 找不到 APPX 包: $appxPath" -ForegroundColor Red
    exit 1
}

Write-Host "✓ 找到 APPX 包: $appxPath" -ForegroundColor Green
Write-Host ""

# 检查是否已安装
Write-Host "步骤 3: 检查已安装的应用..." -ForegroundColor Cyan
$existingApp = Get-AppxPackage | Where-Object { $_.Name -like "*ImageClassifier*" }

if ($existingApp) {
    Write-Host "! 发现已安装的版本:" -ForegroundColor Yellow
    Write-Host "  名称: $($existingApp.Name)"
    Write-Host "  版本: $($existingApp.Version)"
    
    $uninstall = Read-Host "是否先卸载旧版本？(y/n)"
    if ($uninstall -eq 'y') {
        Write-Host "正在卸载..." -ForegroundColor Yellow
        try {
            Remove-AppxPackage -Package $existingApp.PackageFullName
            Write-Host "✓ 卸载成功" -ForegroundColor Green
        } catch {
            Write-Host "✗ 卸载失败: $_" -ForegroundColor Red
        }
    }
}

Write-Host ""

# 安装应用
Write-Host "步骤 4: 安装应用..." -ForegroundColor Cyan
Write-Host "正在安装..." -ForegroundColor Yellow

try {
    Add-AppxPackage -Path $appxPath -ForceApplicationShutdown -ErrorAction Stop
    Write-Host "✓ 安装成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "应用已安装！可以从开始菜单搜索'芯图相册'启动" -ForegroundColor Green
    
} catch {
    Write-Host "✗ 安装失败！" -ForegroundColor Red
    Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Message -like "*0x800B0100*") {
        Write-Host "这是签名验证错误。可能的解决方案：" -ForegroundColor Yellow
        Write-Host "1. 确保开发者模式已启用" -ForegroundColor White
        Write-Host "2. 安装测试证书到'受信任的根证书颁发机构'" -ForegroundColor White
        Write-Host "   运行: .\install-test-certificate.bat (以管理员身份)" -ForegroundColor White
        Write-Host "3. 安装 Windows SDK 并手动签名 APPX 包" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "详细错误日志可查看 Windows 事件查看器" -ForegroundColor Yellow
    Write-Host "路径: 应用程序和服务日志 > Microsoft > Windows > AppxPackagingOM" -ForegroundColor Yellow
    
    exit 1
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

