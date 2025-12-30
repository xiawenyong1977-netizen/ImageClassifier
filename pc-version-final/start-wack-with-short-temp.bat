@echo off
REM 使用短临时目录启动 Windows App Certification Kit
REM 这个批处理文件会设置环境变量并启动 WACK

echo ========================================
echo 使用短临时目录启动 Windows App Certification Kit
echo ========================================
echo.

REM 设置临时目录为短路径
set TEMP=C:\T
set TMP=C:\T

REM 创建临时目录（如果不存在）
if not exist C:\T mkdir C:\T

echo 临时目录已设置为: C:\T
echo.
echo 正在启动 Windows App Certification Kit...
echo.

REM 启动 WACK
start WinAppCertKit.exe

echo.
echo WACK 已启动，环境变量已设置
echo 关闭此窗口后，环境变量会恢复原值
echo.
pause





