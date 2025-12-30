# 设置系统临时目录为短路径（最简单的方法）

## 步骤

### 1. 打开系统环境变量设置
- 右键"此电脑"（或"我的电脑"）
- 选择"属性"
- 点击"高级系统设置"
- 点击"环境变量"按钮

### 2. 修改用户变量（推荐）或系统变量

**用户变量**（只影响当前用户）：
- 找到 `TEMP` 变量，点击"编辑"
- 修改值为：`C:\T`
- 找到 `TMP` 变量，点击"编辑"
- 修改值为：`C:\T`

**系统变量**（影响所有用户，需要管理员权限）：
- 在"系统变量"部分找到 `TEMP` 和 `TMP`
- 修改为：`C:\T`

### 3. 创建目录
在 PowerShell 或命令提示符中运行：
```powershell
New-Item -ItemType Directory -Path "C:\T" -Force
```

### 4. 重启计算机
修改系统环境变量后需要重启才能生效。

### 5. 验证
重启后，打开 PowerShell 运行：
```powershell
echo $env:TEMP
echo $env:TMP
```
应该显示 `C:\T`

## 完成！

之后直接运行 Windows App Certification Kit 即可，不需要任何脚本。

## 恢复原值

如果想恢复原来的临时目录：
- 将 `TEMP` 和 `TMP` 改回原来的值（通常是 `%USERPROFILE%\AppData\Local\Temp`）
- 重启计算机





