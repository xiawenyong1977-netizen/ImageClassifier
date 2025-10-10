@echo off
echo 开始构建芯图相册PC版本...

echo.
echo 步骤1: 安装依赖
call npm install

echo.
echo 步骤2: 构建React应用
call npm run build

echo.
echo 步骤3: 打包Electron应用
call npx electron-builder --win --x64 --config.forceCodeSigning=false

echo.
echo 构建完成！输出文件位于 dist 目录中
pause
