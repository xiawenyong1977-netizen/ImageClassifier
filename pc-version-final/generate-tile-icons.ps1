# 从 1024x1024 原图生成所有 APPX 图标（包括磁贴图标和 StoreLogo）
# 用法: .\generate-tile-icons.ps1 [原图路径]

param(
    [string]$SourceImage = ""
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "生成 APPX 磁贴图标" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 加载 System.Drawing 程序集
Add-Type -AssemblyName System.Drawing

# 查找源图片
if ([string]::IsNullOrEmpty($SourceImage)) {
    # 在 public 目录下查找 1024x1024 的 PNG 文件
    $publicDir = Join-Path $PSScriptRoot "..\public"
    $pngFiles = Get-ChildItem -Path $publicDir -Filter "*.png" -ErrorAction SilentlyContinue
    
    foreach ($file in $pngFiles) {
        try {
            $img = [System.Drawing.Image]::FromFile($file.FullName)
            if ($img.Width -eq 1024 -and $img.Height -eq 1024) {
                $SourceImage = $file.FullName
                Write-Host "找到源图片: $SourceImage" -ForegroundColor Green
                Write-Host "尺寸: $($img.Width)x$($img.Height) 像素`n" -ForegroundColor Gray
                $img.Dispose()
                break
            }
            $img.Dispose()
        } catch {
            # 忽略错误，继续查找
        }
    }
}

if ([string]::IsNullOrEmpty($SourceImage) -or -not (Test-Path $SourceImage)) {
    Write-Host "错误: 未找到 1024x1024 的源图片！" -ForegroundColor Red
    Write-Host "`n请提供源图片路径:" -ForegroundColor Yellow
    Write-Host "  .\generate-tile-icons.ps1 -SourceImage `"路径\到\图片.png`"" -ForegroundColor Gray
    Write-Host "`n或者在 public 目录下放置一个 1024x1024 的 PNG 文件" -ForegroundColor Gray
    exit 1
}

# 验证源图片尺寸
try {
    $sourceImg = [System.Drawing.Image]::FromFile($SourceImage)
    if ($sourceImg.Width -ne 1024 -or $sourceImg.Height -ne 1024) {
        Write-Host "警告: 源图片尺寸不是 1024x1024，当前: $($sourceImg.Width)x$($sourceImg.Height)" -ForegroundColor Yellow
        Write-Host "继续处理..." -ForegroundColor Gray
    }
    $sourceImg.Dispose()
} catch {
    Write-Host "错误: 无法读取源图片: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 目标目录
$targetDir = Join-Path $PSScriptRoot "images"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Write-Host "创建目标目录: $targetDir" -ForegroundColor Gray
}

Write-Host "目标目录: $targetDir`n" -ForegroundColor Gray

# 定义需要生成的图标尺寸
$iconSizes = @(
    # StoreLogo (应用商店和应用列表显示)
    @{ Name = "StoreLogo.scale-100.png"; Width = 50; Height = 50 },
    @{ Name = "StoreLogo.scale-200.png"; Width = 100; Height = 100 },
    @{ Name = "StoreLogo.png"; Width = 50; Height = 50 },  # 基础文件
    # Square44x44Logo (小图标，必需)
    @{ Name = "Square44x44Logo.scale-100.png"; Width = 44; Height = 44 },
    @{ Name = "Square44x44Logo.scale-200.png"; Width = 88; Height = 88 },
    @{ Name = "Square44x44Logo.png"; Width = 44; Height = 44 },  # 基础文件
    # Square150x150Logo (中等磁贴)
    @{ Name = "Square150x150Logo.scale-100.png"; Width = 150; Height = 150 },
    @{ Name = "Square150x150Logo.scale-200.png"; Width = 300; Height = 300 },
    @{ Name = "Square150x150Logo.png"; Width = 150; Height = 150 },  # 基础文件
    # Square310x310Logo (大磁贴)
    @{ Name = "Square310x310Logo.scale-100.png"; Width = 310; Height = 310 },
    @{ Name = "Square310x310Logo.scale-200.png"; Width = 620; Height = 620 },
    @{ Name = "Square310x310Logo.png"; Width = 310; Height = 310 },  # 基础文件
    # Wide310x150Logo (宽磁贴)
    @{ Name = "Wide310x150Logo.scale-100.png"; Width = 310; Height = 150 },
    @{ Name = "Wide310x150Logo.scale-200.png"; Width = 620; Height = 300 },
    @{ Name = "Wide310x150Logo.png"; Width = 310; Height = 150 }  # 基础文件
)

# 加载源图片
$sourceBitmap = New-Object System.Drawing.Bitmap($SourceImage)

Write-Host "正在生成图标..." -ForegroundColor Yellow

foreach ($icon in $iconSizes) {
    $targetPath = Join-Path $targetDir $icon.Name
    
    try {
        # 创建新位图
        $newBitmap = New-Object System.Drawing.Bitmap($icon.Width, $icon.Height)
        $graphics = [System.Drawing.Graphics]::FromImage($newBitmap)
        
        # 设置高质量缩放
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        
        # 绘制缩放后的图片
        $graphics.DrawImage($sourceBitmap, 0, 0, $icon.Width, $icon.Height)
        
        # 保存为 PNG
        $newBitmap.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        Write-Host "✓ $($icon.Name) - $($icon.Width)x$($icon.Height)" -ForegroundColor Green
        
        # 清理资源
        $graphics.Dispose()
        $newBitmap.Dispose()
        
    } catch {
        Write-Host "✗ $($icon.Name) - 错误: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 清理源图片资源
$sourceBitmap.Dispose()

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "✓ 图标生成完成！" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "生成的图标文件:" -ForegroundColor Cyan
Get-ChildItem -Path $targetDir -Filter "*.png" | ForEach-Object {
    try {
        $img = [System.Drawing.Image]::FromFile($_.FullName)
        Write-Host "  $($_.Name) - $($img.Width)x$($img.Height) 像素" -ForegroundColor Gray
        $img.Dispose()
    } catch {
        Write-Host "  $($_.Name)" -ForegroundColor Gray
    }
}

Write-Host "`n下一步:" -ForegroundColor Cyan
Write-Host "1. 运行检查脚本验证: .\check-icon-sizes.ps1" -ForegroundColor Gray
Write-Host "2. 重新打包 APPX: npm run electron-pack-appx" -ForegroundColor Gray
Write-Host "3. 验证图标: .\verify-tile-icons.ps1" -ForegroundColor Gray

