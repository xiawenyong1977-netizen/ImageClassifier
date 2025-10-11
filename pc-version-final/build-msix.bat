@echo off
chcp 65001 >nul
echo ========================================
echo MSIX 打包和签名工具
echo ========================================
echo.

REM 检查是否存在测试证书
if not exist "%~dp0test-certificate.pfx" (
    echo [警告] 未找到测试证书！
    echo 请先运行: powershell -ExecutionPolicy Bypass -File create-test-certificate.ps1
    echo.
    pause
    exit /b 1
)

echo [步骤 1/3] 清理旧的构建文件...
if exist "%~dp0dist" (
    rmdir /s /q "%~dp0dist"
)

echo [步骤 2/3] 开始构建应用...
echo 这可能需要几分钟时间...
call npm run electron-pack

if %errorLevel% neq 0 (
    echo.
    echo [失败] 构建失败！
    pause
    exit /b 1
)

echo.
echo [步骤 3/3] 查找生成的 APPX 文件...
for /r "%~dp0dist" %%f in (*.appx) do (
    echo 找到: %%f
    set "appxFile=%%f"
)

if not defined appxFile (
    echo [警告] 未找到 APPX 文件
    echo 可能 electron-builder 已经自动签名了
    echo 请检查 dist 目录
) else (
    echo.
    echo [成功] APPX 包已生成！
    echo 文件位置: %appxFile%
)

echo.
echo ========================================
echo 构建完成！
echo ========================================
echo.
echo 下一步操作:
echo 1. 如果尚未安装测试证书，请以管理员身份运行: install-test-certificate.bat
echo 2. 双击生成的 .appx 文件进行安装测试
echo 3. 或使用 PowerShell 命令安装: Add-AppxPackage -Path "路径\到\文件.appx"
echo.
pause


