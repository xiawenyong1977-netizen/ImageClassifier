@echo off
echo 芯图管家 - 智能分类，便捷管理，仅你可见
echo ========================================
echo.

echo 正在检查系统兼容性...
systeminfo | findstr "System Type"

echo.
echo 正在安装Visual C++运行库...
if exist "vc_redist.x64.exe" (
    echo 找到运行库安装程序，正在安装...
    start /wait vc_redist.x64.exe /quiet /norestart
    echo 运行库安装完成！
) else (
    echo 警告：未找到Visual C++运行库安装程序
)

echo.
echo 正在启动应用程序...
if exist "dist\芯图管家-智能分类，便捷管理，仅你可见 1.0.0.exe" (
    start "" "dist\芯图管家-智能分类，便捷管理，仅你可见 1.0.0.exe"
) else if exist "芯图管家-智能分类，便捷管理，仅你可见 1.0.0.exe" (
    start "" "芯图管家-智能分类，便捷管理，仅你可见 1.0.0.exe"
) else (
    echo 错误：找不到应用程序文件！
    echo 请确保EXE文件在正确的位置
)

echo.
echo 如果应用程序无法启动，请：
echo 1. 右键以管理员身份运行此批处理文件
echo 2. 检查Windows Defender是否阻止了应用程序
echo 3. 确保系统架构匹配（x64系统需要x64版本）
echo.
pause
