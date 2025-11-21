@echo off
chcp 65001 >nul
echo ========================================
echo   鸿蒙开发环境检查
echo ========================================
echo.

set ALL_PASSED=1

REM 检查 Node.js
echo 1. 检查 Node.js...
node --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo    ✅ Node.js: %NODE_VERSION%
) else (
    echo    ❌ Node.js 未安装或未添加到 PATH
    set ALL_PASSED=0
)
echo.

REM 检查 npm
echo 2. 检查 npm...
npm --version >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
    echo    ✅ npm: %NPM_VERSION%
) else (
    echo    ❌ npm 未安装或未添加到 PATH
    set ALL_PASSED=0
)
echo.

REM 检查 Java
echo 3. 检查 Java JDK...
java -version >nul 2>&1
if %errorlevel% equ 0 (
    echo    ✅ Java 已安装
    if defined JAVA_HOME (
        echo    ✅ JAVA_HOME: %JAVA_HOME%
    ) else (
        echo    ⚠️  警告: JAVA_HOME 环境变量未设置
    )
) else (
    echo    ❌ Java 未安装或未添加到 PATH
    echo    请安装 OpenJDK 17 或更高版本
    set ALL_PASSED=0
)
echo.

REM 检查 ohpm
echo 4. 检查 ohpm (鸿蒙包管理器)...
ohpm --version >nul 2>&1
if %errorlevel% equ 0 (
    echo    ✅ ohpm 已安装
) else (
    echo    ❌ ohpm 未安装或未添加到 PATH
    echo    请安装 DevEco Studio 或手动安装 ohpm
    set ALL_PASSED=0
)
echo.

REM 检查项目结构
echo 5. 检查项目结构...
if exist "harmonyos" (
    echo    ✅ harmonyos/ 目录已存在
) else (
    echo    ⚠️  harmonyos/ 目录不存在，需要初始化
)
echo.

REM 总结
echo ========================================
if %ALL_PASSED% equ 1 (
    echo ✅ 环境检查通过！
    echo.
    echo 下一步：
    echo 1. 如果 harmonyos/ 目录不存在，运行: npm run harmonyos:init
    echo 2. 进入 harmonyos 目录: cd harmonyos
    echo 3. 安装依赖: ohpm install
) else (
    echo ❌ 环境检查未通过，请先安装缺失的组件
    echo.
    echo 请参考: docs/鸿蒙开发环境安装指南.md
)
echo ========================================

exit /b %ALL_PASSED%

