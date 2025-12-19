# 图标文件移动记录

## 文件移动记录

| 原位置 | 现位置 | 状态 | 说明 |
|--------|--------|------|------|
| | | | |

## 必需文件（保留在原位置）

### APPX 图标文件（images/ 目录）
- `images/Square150x150Logo.png` - APPX 磁贴图标（必需）
- `images/Square150x150Logo.scale-100.png` - APPX 磁贴图标 scale-100（必需）
- `images/Square150x150Logo.scale-200.png` - APPX 磁贴图标 scale-200（必需）
- `images/Square310x310Logo.png` - APPX 大磁贴图标（必需）
- `images/Square310x310Logo.scale-100.png` - APPX 大磁贴图标 scale-100（必需）
- `images/Square310x310Logo.scale-200.png` - APPX 大磁贴图标 scale-200（必需）
- `images/Wide310x150Logo.png` - APPX 宽磁贴图标（必需）
- `images/Wide310x150Logo.scale-100.png` - APPX 宽磁贴图标 scale-100（必需）
- `images/Wide310x150Logo.scale-200.png` - APPX 宽磁贴图标 scale-200（必需）

**缺失的必需文件：**
- `images/StoreLogo.png` - APPX 商店图标（缺失）
- `images/Square44x44Logo.png` - APPX 小图标（缺失）

### Electron 应用图标（public/ 和 build/ 目录）
- `public/icon.ico` - Windows 应用图标（必需）
- `public/icon.icns` - macOS 应用图标（必需）
- `public/icon.png` - Linux/通用应用图标（必需）
- `build/icon.ico` - 构建后的 Windows 图标（必需）
- `build/icon.icns` - 构建后的 macOS 图标（必需）
- `build/icon.png` - 构建后的通用图标（必需）

### 应用运行时图标（已移动到备份）
- ~~`build/icons/icon_150x150.png`~~ → 已移动到 `icon-files-backup/build-icons/icons/`
- ~~`build/icons/icon_300x300.png`~~ → 已移动到 `icon-files-backup/build-icons/icons/`
- ~~`build/icons/icon_71x71.png`~~ → 已移动到 `icon-files-backup/build-icons/icons/`

## 已移动到备份目录的文件

| 原位置 | 现位置 | 移动时间 | 说明 |
|--------|--------|----------|------|
| `build/icons/` | `icon-files-backup/build-icons/icons/` | 2025-12-18 | 应用运行时图标文件，可能不再需要 |

### 详细说明

#### build/icons/ 目录
这些文件是应用运行时使用的图标文件，但可能不再被应用代码引用。已移动到备份目录：
- `icon-files-backup/build-icons/icons/icon_150x150.png` - 150x150 像素图标
- `icon-files-backup/build-icons/icons/icon_300x300.png` - 300x300 像素图标  
- `icon-files-backup/build-icons/icons/icon_71x71.png` - 71x71 像素图标

**注意：** 如果应用代码中引用了这些文件，需要更新路径或恢复这些文件。

**恢复方法：**
```powershell
# 恢复 build/icons/ 目录
Move-Item -Path "icon-files-backup\build-icons\icons" -Destination "build\icons"
```

## 文件分类说明

### 必需保留的文件

1. **APPX 图标文件** (`images/` 目录)
   - 用于 Windows APPX 包的磁贴图标
   - 必须保留在原位置

2. **Electron 应用图标** (`public/` 目录)
   - 源文件，electron-builder 会使用这些文件
   - 必须保留在原位置

3. **构建产物** (`build/` 目录)
   - 构建时自动生成，不需要手动管理
   - 每次构建都会重新生成

### 已备份的文件

1. **build/icons/ 目录**
   - 应用运行时图标，可能不再需要
   - 已移动到 `icon-files-backup/build-icons/`

