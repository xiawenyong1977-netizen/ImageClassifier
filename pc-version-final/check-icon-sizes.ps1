# 检查图标文件的分辨率
# 用法: .\check-icon-sizes.ps1

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "检查图标文件分辨率" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 加载 System.Drawing 程序集
Add-Type -AssemblyName System.Drawing

$imagesDir = Join-Path $PSScriptRoot "images"

if (-not (Test-Path $imagesDir)) {
    Write-Host "错误: 图标目录不存在: $imagesDir" -ForegroundColor Red
    exit 1
}

Write-Host "图标目录: $imagesDir`n" -ForegroundColor Gray

# Windows APPX 图标要求
$requiredSizes = @{
    "StoreLogo.png" = @{ Width = 50; Height = 50 }
    "StoreLogo.scale-100.png" = @{ Width = 50; Height = 50 }
    "StoreLogo.scale-200.png" = @{ Width = 100; Height = 100 }
    "Square44x44Logo.png" = @{ Width = 44; Height = 44 }
    "Square44x44Logo.scale-100.png" = @{ Width = 44; Height = 44 }
    "Square44x44Logo.scale-200.png" = @{ Width = 88; Height = 88 }
    "Square150x150Logo.png" = @{ Width = 150; Height = 150 }
    "Square150x150Logo.scale-100.png" = @{ Width = 150; Height = 150 }
    "Square150x150Logo.scale-200.png" = @{ Width = 300; Height = 300 }
    "Square310x310Logo.png" = @{ Width = 310; Height = 310 }
    "Square310x310Logo.scale-100.png" = @{ Width = 310; Height = 310 }
    "Square310x310Logo.scale-200.png" = @{ Width = 620; Height = 620 }
    "Wide310x150Logo.png" = @{ Width = 310; Height = 150 }
    "Wide310x150Logo.scale-100.png" = @{ Width = 310; Height = 150 }
    "Wide310x150Logo.scale-200.png" = @{ Width = 620; Height = 300 }
}

$allCorrect = $true

Get-ChildItem -Path $imagesDir -Filter "*.png" | ForEach-Object {
    $fileName = $_.Name
    $filePath = $_.FullName
    
    try {
        $img = [System.Drawing.Image]::FromFile($filePath)
        $width = $img.Width
        $height = $img.Height
        
        if ($requiredSizes.ContainsKey($fileName)) {
            $required = $requiredSizes[$fileName]
            $isCorrect = ($width -eq $required.Width) -and ($height -eq $required.Height)
            
            if ($isCorrect) {
                Write-Host "✓ $fileName" -ForegroundColor Green
                Write-Host "  实际: ${width}x${height} 像素 (正确)" -ForegroundColor Gray
            } else {
                Write-Host "✗ $fileName" -ForegroundColor Red
                Write-Host "  实际: ${width}x${height} 像素" -ForegroundColor Yellow
                Write-Host "  要求: $($required.Width)x$($required.Height) 像素" -ForegroundColor Yellow
                $allCorrect = $false
            }
        } else {
            Write-Host "? $fileName" -ForegroundColor Yellow
            Write-Host "  实际: ${width}x${height} 像素 (未在要求列表中)" -ForegroundColor Gray
        }
        
        $img.Dispose()
    } catch {
        Write-Host "✗ $fileName - 无法读取: $($_.Exception.Message)" -ForegroundColor Red
        $allCorrect = $false
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Windows APPX 磁贴图标要求:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Square150x150Logo.scale-100.png: 150x150 像素" -ForegroundColor White
Write-Host "Square150x150Logo.scale-200.png: 300x300 像素" -ForegroundColor White
Write-Host "Square310x310Logo.scale-100.png: 310x310 像素" -ForegroundColor White
Write-Host "Square310x310Logo.scale-200.png: 620x620 像素" -ForegroundColor White
Write-Host "Wide310x150Logo.scale-100.png:   310x150 像素" -ForegroundColor White
Write-Host "Wide310x150Logo.scale-200.png:   620x300 像素" -ForegroundColor White

if ($allCorrect) {
    Write-Host "`n✓ 所有图标分辨率都正确！" -ForegroundColor Green
} else {
    Write-Host "`n✗ 部分图标分辨率不正确，需要调整" -ForegroundColor Red
    Write-Host "`n提示: 可以使用图像编辑软件（如 Photoshop、GIMP）或在线工具调整图标大小" -ForegroundColor Yellow
}

