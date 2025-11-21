# 鸿蒙开发环境安装助手
# 帮助用户安装和配置鸿蒙开发环境

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  鸿蒙开发环境安装助手" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  某些操作需要管理员权限" -ForegroundColor Yellow
    Write-Host "   建议以管理员身份运行此脚本" -ForegroundColor Yellow
    Write-Host ""
}

# 步骤1: 设置 JAVA_HOME
Write-Host "步骤1: 配置 JAVA_HOME..." -ForegroundColor Yellow
Write-Host ""

$javaPath = $null

# 尝试从 where java 获取路径
try {
    $javaExe = (Get-Command java -ErrorAction SilentlyContinue).Source
    if ($javaExe) {
        $javaPath = Split-Path (Split-Path $javaExe -Parent) -Parent
        Write-Host "   找到 Java: $javaPath" -ForegroundColor Green
    }
} catch {
    Write-Host "   无法自动找到 Java 路径" -ForegroundColor Yellow
}

# 尝试从常见路径查找
if (-not $javaPath) {
    $commonPaths = @(
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\Java\jdk-17.0.16",
        "C:\Program Files\Java\jdk-21",
        "C:\Program Files\Eclipse Adoptium\jdk-17",
        "C:\Program Files\Eclipse Adoptium\jdk-21"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $javaPath = $path
            Write-Host "   找到 Java: $javaPath" -ForegroundColor Green
            break
        }
    }
}

if ($javaPath) {
    $currentJavaHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "Machine")
    
    if ($currentJavaHome -eq $javaPath) {
        Write-Host "   ✅ JAVA_HOME 已正确设置: $javaPath" -ForegroundColor Green
    } else {
        Write-Host "   当前 JAVA_HOME: $currentJavaHome" -ForegroundColor Yellow
        Write-Host "   建议设置为: $javaPath" -ForegroundColor Yellow
        
        if ($isAdmin) {
            $confirm = Read-Host "   是否设置 JAVA_HOME? (Y/N)"
            if ($confirm -eq 'Y' -or $confirm -eq 'y') {
                [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, "Machine")
                $env:JAVA_HOME = $javaPath
                Write-Host "   ✅ JAVA_HOME 已设置" -ForegroundColor Green
            }
        } else {
            Write-Host "   ⚠️  需要管理员权限才能设置系统环境变量" -ForegroundColor Yellow
            Write-Host "   请手动设置: JAVA_HOME = $javaPath" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   ⚠️  无法自动找到 Java 安装路径" -ForegroundColor Yellow
    Write-Host "   请手动设置 JAVA_HOME 环境变量" -ForegroundColor Yellow
}

Write-Host ""

# 步骤2: 检查 ohpm
Write-Host "步骤2: 检查 ohpm..." -ForegroundColor Yellow
Write-Host ""

$ohpmPath = $null
$ohpmPaths = @(
    "$env:LOCALAPPDATA\Huawei\ohpm\bin\ohpm.exe",
    "$env:USERPROFILE\AppData\Local\Huawei\ohpm\bin\ohpm.exe",
    "C:\Program Files\Huawei\ohpm\bin\ohpm.exe"
)

foreach ($path in $ohpmPaths) {
    if (Test-Path $path) {
        $ohpmPath = $path
        Write-Host "   ✅ 找到 ohpm: $ohpmPath" -ForegroundColor Green
        break
    }
}

if (-not $ohpmPath) {
    try {
        $ohpmExe = (Get-Command ohpm -ErrorAction SilentlyContinue).Source
        if ($ohpmExe) {
            $ohpmPath = $ohpmExe
            Write-Host "   ✅ ohpm 已在 PATH 中: $ohpmPath" -ForegroundColor Green
        }
    } catch {
        # ohpm 未找到
    }
}

if (-not $ohpmPath) {
    Write-Host "   ❌ ohpm 未安装" -ForegroundColor Red
    Write-Host ""
    Write-Host "   安装方法：" -ForegroundColor Yellow
    Write-Host "   1. 安装 DevEco Studio (推荐)" -ForegroundColor Cyan
    Write-Host "      - 访问: https://developer.harmonyos.com/cn/develop/deveco-studio#download" -ForegroundColor Cyan
    Write-Host "      - 下载并安装，ohpm 会自动安装" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "   2. 手动安装 ohpm" -ForegroundColor Cyan
    Write-Host "      - 访问: https://ohpm.openharmony.cn/" -ForegroundColor Cyan
    Write-Host "      - 下载 Windows 版本并解压" -ForegroundColor Cyan
    Write-Host "      - 添加到 PATH 环境变量" -ForegroundColor Cyan
    Write-Host ""
    
    $openBrowser = Read-Host "   是否打开下载页面? (Y/N)"
    if ($openBrowser -eq 'Y' -or $openBrowser -eq 'y') {
        Start-Process "https://developer.harmonyos.com/cn/develop/deveco-studio#download"
    }
} else {
    # 检查 ohpm 是否在 PATH 中
    $ohpmInPath = $false
    try {
        $testOhpm = (Get-Command ohpm -ErrorAction SilentlyContinue).Source
        if ($testOhpm) {
            $ohpmInPath = $true
        }
    } catch {
        # 不在 PATH 中
    }
    
    if (-not $ohpmInPath) {
        Write-Host "   ⚠️  ohpm 未添加到 PATH" -ForegroundColor Yellow
        $ohpmDir = Split-Path $ohpmPath -Parent
        
        if ($isAdmin) {
            $confirm = Read-Host "   是否添加到 PATH? (Y/N)"
            if ($confirm -eq 'Y' -or $confirm -eq 'y') {
                $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
                if ($currentPath -notlike "*$ohpmDir*") {
                    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$ohpmDir", "Machine")
                    $env:Path += ";$ohpmDir"
                    Write-Host "   ✅ 已添加到 PATH" -ForegroundColor Green
                } else {
                    Write-Host "   ✅ 已在 PATH 中" -ForegroundColor Green
                }
            }
        } else {
            Write-Host "   ⚠️  需要管理员权限才能添加到 PATH" -ForegroundColor Yellow
            Write-Host "   请手动添加: $ohpmDir" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ✅ ohpm 已在 PATH 中" -ForegroundColor Green
    }
    
    # 配置镜像源
    Write-Host ""
    Write-Host "   配置 ohpm 镜像源..." -ForegroundColor Yellow
    try {
        $registry = ohpm config get registry 2>&1
        if ($registry -match 'harmonyos|huawei') {
            Write-Host "   ✅ 镜像源已配置: $registry" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  当前镜像源: $registry" -ForegroundColor Yellow
            $confirm = Read-Host "   是否设置为华为镜像源? (Y/N)"
            if ($confirm -eq 'Y' -or $confirm -eq 'y') {
                ohpm config set registry https://repo.harmonyos.com/ohpm/
                Write-Host "   ✅ 镜像源已设置" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "   ⚠️  无法配置镜像源: $_" -ForegroundColor Yellow
    }
}

Write-Host ""

# 步骤3: 初始化项目
Write-Host "步骤3: 检查项目结构..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path "harmonyos") {
    Write-Host "   ✅ harmonyos/ 目录已存在" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  harmonyos/ 目录不存在" -ForegroundColor Yellow
    $confirm = Read-Host "   是否初始化项目结构? (Y/N)"
    if ($confirm -eq 'Y' -or $confirm -eq 'y') {
        node scripts/init-harmonyos-project.js
    }
}

Write-Host ""

# 总结
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装助手完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "1. 如果 ohpm 已安装，运行: npm run harmonyos:check" -ForegroundColor Cyan
Write-Host "2. 如果项目已初始化，运行: npm run harmonyos:test-deps" -ForegroundColor Cyan
Write-Host "3. 安装依赖: npm run harmonyos:install" -ForegroundColor Cyan
Write-Host ""


