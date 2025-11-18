# 鸿蒙开发环境检查脚本
# 用于检查开发环境是否已正确安装和配置

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  鸿蒙开发环境检查" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

# 检查 Node.js
Write-Host "1. 检查 Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   ✅ Node.js: $nodeVersion" -ForegroundColor Green
    
    # 检查版本是否 >= 16
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 16) {
        Write-Host "   ⚠️  警告: Node.js 版本应 >= 16.0.0" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Node.js 未安装或未添加到 PATH" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# 检查 npm
Write-Host "2. 检查 npm..." -ForegroundColor Yellow
try {
    $npmVersion = npm --version
    Write-Host "   ✅ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ npm 未安装或未添加到 PATH" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# 检查 Java
Write-Host "3. 检查 Java JDK..." -ForegroundColor Yellow
try {
    $javaVersion = java -version 2>&1 | Select-Object -First 1
    Write-Host "   ✅ Java: $javaVersion" -ForegroundColor Green
    
    # 检查版本
    if ($javaVersion -match 'version "(\d+)') {
        $javaMajorVersion = [int]$matches[1]
        if ($javaMajorVersion -lt 17) {
            Write-Host "   ⚠️  警告: Java 版本应 >= 17" -ForegroundColor Yellow
        }
    }
    
    # 检查 JAVA_HOME
    $javaHome = $env:JAVA_HOME
    if ($javaHome) {
        Write-Host "   ✅ JAVA_HOME: $javaHome" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  警告: JAVA_HOME 环境变量未设置" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Java 未安装或未添加到 PATH" -ForegroundColor Red
    Write-Host "   请安装 OpenJDK 17 或更高版本" -ForegroundColor Yellow
    $allPassed = $false
}
Write-Host ""

# 检查 ohpm
Write-Host "4. 检查 ohpm (鸿蒙包管理器)..." -ForegroundColor Yellow
try {
    $ohpmVersion = ohpm --version 2>&1
    Write-Host "   ✅ ohpm: $ohpmVersion" -ForegroundColor Green
    
    # 检查 ohpm 镜像源
    $registry = ohpm config get registry 2>&1
    if ($registry -match 'harmonyos|huawei') {
        Write-Host "   ✅ 镜像源: $registry" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  镜像源: $registry" -ForegroundColor Yellow
        Write-Host "   建议使用华为镜像源加速下载" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ ohpm 未安装或未添加到 PATH" -ForegroundColor Red
    Write-Host "   请安装 DevEco Studio 或手动安装 ohpm" -ForegroundColor Yellow
    $allPassed = $false
}
Write-Host ""

# 检查 DevEco Studio（可选）
Write-Host "5. 检查 DevEco Studio..." -ForegroundColor Yellow
$devecoPaths = @(
    "$env:LOCALAPPDATA\Programs\Huawei\DevEco Studio",
    "$env:ProgramFiles\Huawei\DevEco Studio",
    "$env:ProgramFiles(x86)\Huawei\DevEco Studio"
)

$devecoFound = $false
foreach ($path in $devecoPaths) {
    if (Test-Path $path) {
        Write-Host "   ✅ DevEco Studio: $path" -ForegroundColor Green
        $devecoFound = $true
        break
    }
}

if (-not $devecoFound) {
    Write-Host "   ⚠️  DevEco Studio 未找到（可选，但推荐安装）" -ForegroundColor Yellow
}
Write-Host ""

# 检查项目结构
Write-Host "6. 检查项目结构..." -ForegroundColor Yellow
if (Test-Path "harmonyos") {
    Write-Host "   ✅ harmonyos/ 目录已存在" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  harmonyos/ 目录不存在，需要初始化" -ForegroundColor Yellow
}
Write-Host ""

# 总结
Write-Host "========================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "✅ 环境检查通过！" -ForegroundColor Green
    Write-Host ""
    Write-Host "下一步：" -ForegroundColor Cyan
    Write-Host "1. 如果 harmonyos/ 目录不存在，运行: npm run harmonyos:init" -ForegroundColor Yellow
    Write-Host "2. 进入 harmonyos 目录: cd harmonyos" -ForegroundColor Yellow
    Write-Host "3. 安装依赖: ohpm install" -ForegroundColor Yellow
} else {
    Write-Host "❌ 环境检查未通过，请先安装缺失的组件" -ForegroundColor Red
    Write-Host ""
    Write-Host "请参考: docs/鸿蒙开发环境安装指南.md" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan

if ($allPassed) {
    exit 0
} else {
    exit 1
}

