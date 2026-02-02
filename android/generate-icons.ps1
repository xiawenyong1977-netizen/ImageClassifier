# Android 图标生成脚本 (PowerShell)
# 
# 使用方法：
# 1. 准备一个 1024x1024 的源图标文件（如 public/icon.png）
# 2. 运行: .\android\generate-icons.ps1 [源图标路径]
# 
# 示例: .\android\generate-icons.ps1 public\icon.png

param(
    [string]$SourceIcon = "public\icons\icon_300x300.png"
)

$ErrorActionPreference = "Stop"

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$SourcePath = Join-Path $ProjectRoot $SourceIcon

# 检查源文件是否存在
if (-not (Test-Path $SourcePath)) {
    Write-Host "❌ 源图标文件不存在: $SourcePath" -ForegroundColor Red
    Write-Host "💡 请提供图标文件路径，例如: .\android\generate-icons.ps1 public\icon.png" -ForegroundColor Yellow
    exit 1
}

Write-Host "📦 开始生成 Android 图标..." -ForegroundColor Green
Write-Host "📁 源文件: $SourcePath" -ForegroundColor Cyan

# 图标尺寸配置
$IconSizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$ResPath = Join-Path $ScriptDir "app\src\main\res"

# 检查 ImageMagick 是否可用
$ImageMagickAvailable = $false
try {
    $null = Get-Command magick -ErrorAction Stop
    $ImageMagickAvailable = $true
    Write-Host "✅ 检测到 ImageMagick" -ForegroundColor Green
} catch {
    Write-Host "⚠️  未检测到 ImageMagick" -ForegroundColor Yellow
    Write-Host "💡 可以使用在线工具: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html" -ForegroundColor Yellow
    Write-Host "   或者安装 ImageMagick: https://imagemagick.org/script/download.php" -ForegroundColor Yellow
}

if ($ImageMagickAvailable) {
    # 生成不同尺寸的图标
    Write-Host "`n🔄 生成传统图标..." -ForegroundColor Cyan
    foreach ($entry in $IconSizes.GetEnumerator()) {
        $folder = $entry.Key
        $size = $entry.Value
        $folderPath = Join-Path $ResPath $folder
        $outputPath = Join-Path $folderPath "ic_launcher.png"
        
        # 确保文件夹存在
        if (-not (Test-Path $folderPath)) {
            New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
        }
        
        # 使用 ImageMagick 调整大小
        try {
            & magick $SourcePath -resize "${size}x${size}" $outputPath
            Write-Host "  ✅ $folder\ic_launcher.png ($size x $size)" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ 生成 $folder\ic_launcher.png 失败: $_" -ForegroundColor Red
        }
    }
    
    Write-Host "`n✅ 图标生成完成！" -ForegroundColor Green
} else {
    Write-Host "`n📝 手动生成步骤：" -ForegroundColor Cyan
    Write-Host "1. 访问 https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html" -ForegroundColor White
    Write-Host "2. 上传你的图标文件: $SourcePath" -ForegroundColor White
    Write-Host "3. 配置背景色（可选）" -ForegroundColor White
    Write-Host "4. 下载生成的图标包" -ForegroundColor White
    Write-Host "5. 解压并替换 android\app\src\main\res\ 下的对应文件" -ForegroundColor White
}

Write-Host "`n📝 下一步：" -ForegroundColor Cyan
Write-Host "  1. 检查生成的图标文件" -ForegroundColor White
Write-Host "  2. 如果需要，手动调整 drawable\ic_launcher_background.xml 的背景色" -ForegroundColor White
Write-Host "  3. 重新编译应用: cd android; .\gradlew assembleRelease" -ForegroundColor White
Write-Host "  4. 安装并测试图标显示" -ForegroundColor White
