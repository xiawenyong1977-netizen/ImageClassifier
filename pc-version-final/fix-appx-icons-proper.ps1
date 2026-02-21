# 使用 MakeAppx.exe 正确修复 APPX 文件中的图标
# 这个方法不会破坏 APPX 文件结构，可以重新签名
# 用法: .\fix-appx-icons-proper.ps1 [appx文件路径]

param(
    [string]$AppxPath = ""
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "使用 MakeAppx.exe 修复 APPX 图标" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 如果没有指定路径，自动查找最新的APPX文件
if ([string]::IsNullOrEmpty($AppxPath)) {
    $appxFiles = Get-ChildItem -Path "$PSScriptRoot\dist" -Filter "*.appx" -ErrorAction SilentlyContinue | 
                 Sort-Object LastWriteTime -Descending
    
    $fileList = @($appxFiles)
    if ($fileList.Count -gt 0) {
        $AppxPath = $fileList[0].FullName
        Write-Host "找到 APPX 文件: $AppxPath" -ForegroundColor Green
    } else {
        Write-Host "错误: 未找到 APPX 文件！" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $AppxPath)) {
    Write-Host "错误: APPX 文件不存在: $AppxPath" -ForegroundColor Red
    exit 1
}

# 查找 MakeAppx.exe
$makeAppxPaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe",
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.0.22621.0\x64\makeappx.exe",
    "${env:ProgramFiles}\Windows Kits\10\bin\10.0.26100.0\x64\makeappx.exe"
)

$makeAppx = $null
foreach ($path in $makeAppxPaths) {
    if (Test-Path $path) {
        $makeAppx = $path
        break
    }
}

if (-not $makeAppx) {
    Write-Host "错误: 未找到 MakeAppx.exe！" -ForegroundColor Red
    Write-Host "请安装 Windows SDK" -ForegroundColor Yellow
    exit 1
}

Write-Host "找到 MakeAppx.exe: $makeAppx" -ForegroundColor Green

# 备份原文件
$backupPath = $AppxPath + ".backup"
if (-not (Test-Path $backupPath)) {
    Copy-Item $AppxPath $backupPath -Force
    Write-Host "已创建备份: $backupPath" -ForegroundColor Gray
}

# 创建临时目录
$tempDir = Join-Path $env:TEMP "fix-appx-proper-$(Get-Date -Format 'yyyyMMddHHmmss')"
$unpackDir = Join-Path $tempDir "unpack"
$repackDir = Join-Path $tempDir "repack"

New-Item -ItemType Directory -Path $unpackDir -Force | Out-Null
New-Item -ItemType Directory -Path $repackDir -Force | Out-Null

try {
    Write-Host "`n[1/5] 使用 MakeAppx.exe 解压 APPX..." -ForegroundColor Yellow
    & $makeAppx unpack /l /p $AppxPath /d $unpackDir
    if ($LASTEXITCODE -ne 0) {
        throw "解压失败，退出代码: $LASTEXITCODE"
    }
    Write-Host "  ✓ 解压完成" -ForegroundColor Green
    
    Write-Host "`n[2/5] 复制图标文件到 Assets 目录..." -ForegroundColor Yellow
    $assetsDir = Join-Path $unpackDir "Assets"
    if (-not (Test-Path $assetsDir)) {
        New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
    }
    
    $imagesDir = Join-Path $PSScriptRoot "images"
    if (Test-Path $imagesDir) {
        # 只复制基础图标文件（不包含 scale 版本）
        # 并且验证尺寸是否正确
        $requiredIcons = @(
            @{ Name = "StoreLogo.png"; ExpectedSize = "50x50" },
            @{ Name = "Square44x44Logo.png"; ExpectedSize = "44x44" },
            @{ Name = "Square150x150Logo.png"; ExpectedSize = "150x150" },
            @{ Name = "Wide310x150Logo.png"; ExpectedSize = "310x150" },
            @{ Name = "Square310x310Logo.png"; ExpectedSize = "310x310" }
        )
        
        Add-Type -AssemblyName System.Drawing
        
        foreach ($iconInfo in $requiredIcons) {
            $iconName = $iconInfo.Name
            $sourcePath = Join-Path $imagesDir $iconName
            
            if (Test-Path $sourcePath) {
                # 验证图标尺寸
                try {
                    $img = [System.Drawing.Image]::FromFile($sourcePath)
                    $actualSize = "$($img.Width)x$($img.Height)"
                    $img.Dispose()
                    
                    if ($actualSize -eq $iconInfo.ExpectedSize) {
                        $destPath = Join-Path $assetsDir $iconName
                        Copy-Item $sourcePath $destPath -Force
                        Write-Host "  ✓ $iconName ($actualSize)" -ForegroundColor Green
                    } else {
                        Write-Host "  ⚠ $iconName 尺寸不正确: $actualSize (期望: $($iconInfo.ExpectedSize))" -ForegroundColor Yellow
                        # 仍然复制，但警告
                        $destPath = Join-Path $assetsDir $iconName
                        Copy-Item $sourcePath $destPath -Force
                    }
                } catch {
                    Write-Host "  ✗ $iconName 无法读取: $($_.Exception.Message)" -ForegroundColor Red
                }
            } else {
                Write-Host "  ✗ $iconName 不存在" -ForegroundColor Red
            }
        }
        Write-Host "  ✓ 图标文件复制完成" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ images 目录不存在，跳过图标复制" -ForegroundColor Yellow
    }
    
    Write-Host "`n[3/5] 修复 AppxManifest.xml..." -ForegroundColor Yellow
    $manifestPath = Join-Path $unpackDir "AppxManifest.xml"
    if (Test-Path $manifestPath) {
        $manifestContent = Get-Content $manifestPath -Raw
        
        # 修复路径大小写：assets -> Assets
        $originalContent = $manifestContent
        $manifestContent = $manifestContent -replace 'assets\\', 'Assets\'
        $manifestContent = $manifestContent -replace 'assets/', 'Assets/'
        
        if ($manifestContent -ne $originalContent) {
            Write-Host "  ✓ 已修复路径大小写 (assets -> Assets)" -ForegroundColor Green
        }
        
        # 检查并修复图标路径
        Write-Host "  检查图标引用..." -ForegroundColor Gray
        
        # 检查 StoreLogo
        if ($manifestContent -notmatch 'Logo="Assets\\StoreLogo\.png"') {
            $manifestContent = $manifestContent -replace 'Logo="[^"]*StoreLogo[^"]*"', 'Logo="Assets\StoreLogo.png"'
            if ($manifestContent -match 'Logo="Assets\\StoreLogo\.png"') {
                Write-Host "    ✓ 已修复 StoreLogo" -ForegroundColor Green
            }
        }
        
        # 检查 Square44x44Logo
        if ($manifestContent -notmatch 'Square44x44Logo="Assets\\Square44x44Logo\.png"') {
            $manifestContent = $manifestContent -replace 'Square44x44Logo="[^"]*"', 'Square44x44Logo="Assets\Square44x44Logo.png"'
            Write-Host "    ✓ 已修复 Square44x44Logo" -ForegroundColor Green
        }
        
        # 检查 Square150x150Logo
        if ($manifestContent -notmatch 'Square150x150Logo="Assets\\Square150x150Logo\.png"') {
            $manifestContent = $manifestContent -replace 'Square150x150Logo="[^"]*"', 'Square150x150Logo="Assets\Square150x150Logo.png"'
            Write-Host "    ✓ 已修复 Square150x150Logo" -ForegroundColor Green
        }
        
        # 检查并修复 DefaultTile 中的图标
        # 注意：DefaultTile 不能包含 Square150x150Logo，它应该在 VisualElements 中
        $defaultTilePattern = "<uap:DefaultTile[^>]*>"
        if ($manifestContent -match $defaultTilePattern) {
            # 获取当前的 DefaultTile 标签
            $defaultTileMatch = [regex]::Match($manifestContent, $defaultTilePattern)
            $currentTile = $defaultTileMatch.Value
            
            # 构建新的 DefaultTile 属性（只包含 Wide310x150Logo 和 Square310x310Logo）
            $newTileAttrs = @()
            
            # Wide310x150Logo
            $newTileAttrs += 'Wide310x150Logo="Assets\Wide310x150Logo.png"'
            
            # Square310x310Logo
            $newTileAttrs += 'Square310x310Logo="Assets\Square310x310Logo.png"'
            
            # 替换 DefaultTile 标签（移除 Square150x150Logo 如果存在）
            $newTileTag = "<uap:DefaultTile " + ($newTileAttrs -join " ") + ">"
            $manifestContent = $manifestContent -replace $defaultTilePattern, $newTileTag
            Write-Host "    ✓ 已更新 DefaultTile（Wide310x150Logo, Square310x310Logo）" -ForegroundColor Green
        }
        
        # 移除位置权限（如果存在）
        # PC版本只需要读取EXIF中的GPS信息，不需要位置权限
        $locationRemoved = $false
        $locationPatterns = @(
            '<Capability[^>]*Name="location"[^>]*/?>',
            '<uap:Capability[^>]*Name="location"[^>]*/?>',
            '<Capability[^>]*Name="location"[^>]*>[\s\S]*?</Capability>',
            '<uap:Capability[^>]*Name="location"[^>]*>[\s\S]*?</uap:Capability>'
        )
        
        foreach ($pattern in $locationPatterns) {
            if ($manifestContent -match $pattern) {
                $manifestContent = $manifestContent -replace $pattern, ''
                $locationRemoved = $true
            }
        }
        
        if ($locationRemoved) {
            Write-Host "    ✓ 已移除位置权限声明（PC版本不需要位置权限，只读取EXIF中的GPS信息）" -ForegroundColor Green
        } else {
            Write-Host "    ✓ 未发现位置权限声明（正常）" -ForegroundColor Gray
        }
        
        # 保存 manifest
        $manifestContent | Set-Content $manifestPath -Encoding UTF8 -NoNewline
        Write-Host "  ✓ AppxManifest.xml 已更新" -ForegroundColor Green
        
    } else {
        Write-Host "  ⚠ AppxManifest.xml 不存在！" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`n[4/5] 使用 MakeAppx.exe 重新打包..." -ForegroundColor Yellow
    $newAppxPath = Join-Path $repackDir "XinTuAlbum-1.0.0.appx"
    $output = & $makeAppx pack /l /d $unpackDir /p $newAppxPath /o 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ 重新打包失败，退出代码: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "  错误输出:" -ForegroundColor Yellow
        $output | Select-Object -Last 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        # 验证 manifest XML 格式
        Write-Host "`n  验证 manifest XML 格式..." -ForegroundColor Yellow
        try {
            [xml]$testXml = Get-Content $manifestPath
            Write-Host "    ✓ XML 格式正确" -ForegroundColor Green
        } catch {
            Write-Host "    ✗ XML 格式错误: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host "    DefaultTile 内容:" -ForegroundColor Yellow
            $defaultTileRegex = "<uap:DefaultTile[^>]*>"
            if ($manifestContent -match $defaultTileRegex) {
                $defaultTileVal = [regex]::Match($manifestContent, $defaultTileRegex).Value
                Write-Host "    $defaultTileVal" -ForegroundColor Gray
            }
        }
        throw "重新打包失败，退出代码: $LASTEXITCODE"
    }
    Write-Host "  ✓ 重新打包完成" -ForegroundColor Green
    
    Write-Host "`n[5/5] 替换原文件..." -ForegroundColor Yellow
    Copy-Item $newAppxPath $AppxPath -Force
    Write-Host "  ✓ 文件已替换" -ForegroundColor Green
    
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "✓ 修复完成！" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green
    
    Write-Host "修改内容:" -ForegroundColor Cyan
    Write-Host "  1. ✓ 修复了 manifest 中的路径大小写 (assets -> Assets)" -ForegroundColor Green
    Write-Host "  2. ✓ 移除了位置权限声明（PC版本不需要位置权限）" -ForegroundColor Green
    Write-Host "  3. ✓ 复制了图标文件到 Assets 目录" -ForegroundColor Green
    Write-Host "  4. ✓ 使用 MakeAppx.exe 重新打包（保持正确的文件结构）" -ForegroundColor Green
    Write-Host "`n现在可以重新签名了:" -ForegroundColor Cyan
    Write-Host "  .\sign-appx-with-test-cert.ps1" -ForegroundColor Gray
    Write-Host "`n备份文件: $backupPath" -ForegroundColor Gray
    
} catch {
    Write-Host "`n错误: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "正在恢复备份..." -ForegroundColor Yellow
    if (Test-Path $backupPath) {
        Copy-Item $backupPath $AppxPath -Force
        Write-Host "  ✓ 已恢复备份" -ForegroundColor Green
    }
    exit 1
} finally {
    # 清理临时目录
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

