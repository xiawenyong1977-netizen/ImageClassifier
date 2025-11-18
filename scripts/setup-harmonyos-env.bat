@echo off
chcp 65001 >nul
echo ========================================
echo   鸿蒙开发环境安装助手
echo ========================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  某些操作需要管理员权限
    echo    建议以管理员身份运行此脚本
    echo.
)

REM 步骤1: 设置 JAVA_HOME
echo 步骤1: 配置 JAVA_HOME...
echo.

REM 尝试查找 Java
where java >nul 2>&1
if %errorlevel% equ 0 (
    echo    ✅ Java 已安装
    if defined JAVA_HOME (
        echo    ✅ JAVA_HOME: %JAVA_HOME%
    ) else (
        echo    ⚠️  JAVA_HOME 未设置
        echo    请手动设置 JAVA_HOME 环境变量
        echo    通常路径: C:\Program Files\Java\jdk-17
    )
) else (
    echo    ❌ Java 未安装
    echo    请先安装 Java JDK 17 或更高版本
)
echo.

REM 步骤2: 检查 ohpm
echo 步骤2: 检查 ohpm...
echo.

where ohpm >nul 2>&1
if %errorlevel% equ 0 (
    echo    ✅ ohpm 已安装
    echo.
    echo    配置 ohpm 镜像源...
    ohpm config set registry https://repo.harmonyos.com/ohpm/
    echo    ✅ 镜像源已设置
) else (
    echo    ❌ ohpm 未安装
    echo.
    echo    安装方法：
    echo    1. 安装 DevEco Studio (推荐)
    echo       访问: https://developer.harmonyos.com/cn/develop/deveco-studio#download
    echo.
    echo    2. 手动安装 ohpm
    echo       访问: https://ohpm.openharmony.cn/
    echo.
    set /p OPEN_BROWSER="   是否打开下载页面? (Y/N): "
    if /i "%OPEN_BROWSER%"=="Y" (
        start https://developer.harmonyos.com/cn/develop/deveco-studio#download
    )
)
echo.

REM 步骤3: 检查项目结构
echo 步骤3: 检查项目结构...
echo.

if exist "harmonyos" (
    echo    ✅ harmonyos/ 目录已存在
) else (
    echo    ⚠️  harmonyos/ 目录不存在
    set /p INIT_PROJECT="   是否初始化项目结构? (Y/N): "
    if /i "%INIT_PROJECT%"=="Y" (
        node scripts/init-harmonyos-project.js
    )
)
echo.

REM 总结
echo ========================================
echo   安装助手完成
echo ========================================
echo.
echo 下一步：
echo 1. 如果 ohpm 已安装，运行: npm run harmonyos:check
echo 2. 如果项目已初始化，运行: npm run harmonyos:test-deps
echo 3. 安装依赖: npm run harmonyos:install
echo.

pause


