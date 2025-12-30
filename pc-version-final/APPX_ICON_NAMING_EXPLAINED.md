# Windows APPX 磁贴图标命名规则说明

## 两种命名方式

### 方式1：基础文件名 + Scale 后缀文件（推荐）

**文件结构：**
```
images/
  ├── Wide310x150Logo.png          (基础文件，可选)
  ├── Wide310x150Logo.scale-100.png
  ├── Wide310x150Logo.scale-200.png
  ├── Square150x150Logo.png        (基础文件，可选)
  ├── Square150x150Logo.scale-100.png
  └── Square150x150Logo.scale-200.png
```

**Manifest 中引用：**
```xml
<uap:DefaultTile Wide310x150Logo="images/Wide310x150Logo.png" />
```

**工作原理：**
- Manifest 中引用不带 scale 的文件名：`Wide310x150Logo.png`
- Windows 会根据设备的 DPI 缩放比例，自动查找并选择：
  - 100% DPI → `Wide310x150Logo.scale-100.png`
  - 200% DPI → `Wide310x150Logo.scale-200.png`
- 如果找不到对应的 scale 文件，会使用基础文件 `Wide310x150Logo.png`（如果存在）

### 方式2：只有 Scale 后缀文件（当前方式）

**文件结构：**
```
images/
  ├── Wide310x150Logo.scale-100.png
  └── Wide310x150Logo.scale-200.png
```

**问题：**
- 如果 Manifest 中引用 `Wide310x150Logo.png`，Windows 找不到这个文件（因为只有 scale 版本）
- 如果 Manifest 中引用 `Wide310x150Logo.scale-100.png`，Windows 只会使用这个文件，不会根据 DPI 自动切换

## 解决方案

### 方案1：创建基础文件（推荐）

为每个图标创建一个基础文件（通常是 scale-100 的副本）：

```powershell
# 复制 scale-100 文件作为基础文件
Copy-Item "Wide310x150Logo.scale-100.png" "Wide310x150Logo.png"
Copy-Item "Square150x150Logo.scale-100.png" "Square150x150Logo.png"
Copy-Item "Square310x310Logo.scale-100.png" "Square310x310Logo.png"
```

这样：
- Manifest 引用：`Wide310x150Logo.png`
- Windows 自动选择：`Wide310x150Logo.scale-100.png` 或 `Wide310x150Logo.scale-200.png`
- 如果找不到 scale 文件，使用基础文件作为后备

### 方案2：使用目录结构（更标准）

将文件放在 scale 子目录中：

```
images/
  ├── scale-100/
  │   ├── Wide310x150Logo.png
  │   ├── Square150x150Logo.png
  │   └── Square310x310Logo.png
  └── scale-200/
      ├── Wide310x150Logo.png
      ├── Square150x150Logo.png
      └── Square310x310Logo.png
```

Manifest 中引用：`images/Wide310x150Logo.png`，Windows 会自动从对应的 scale 目录中选择。

## 当前情况

我们当前只有带 scale 后缀的文件，没有基础文件。所以：

1. **选项A**：创建基础文件（最简单）
   - 复制 `scale-100` 文件作为基础文件
   - Manifest 引用基础文件名
   - Windows 会自动选择 scale 版本

2. **选项B**：保持当前结构，但需要确保所有 scale 文件都存在
   - Manifest 仍然引用基础文件名
   - Windows 会查找 scale 版本
   - 如果找不到，可能显示默认图标

## 推荐做法

使用**方案1**：创建基础文件，这样最兼容，也符合 Windows 的标准做法。




