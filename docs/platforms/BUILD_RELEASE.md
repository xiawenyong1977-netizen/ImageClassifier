# 芯图相册 - 发布版本构建指南

## 一、构建目录说明

- **根目录**（`ImageClassifier/`）：React Native 主项目，包含 `public/`、`src/` 等，你平时改的 Electron 和桌面端代码在这里。
- **PC 构建目录**（`pc-version-final/`）：用 Craco + Electron Builder 打 Windows/macOS 安装包，**构建时必须在这里执行**。

若你一直在根目录改 `public/electron.js` 和 `src/`，构建前需保证 **pc-version-final 用到的 `public/`、`src/` 与根目录一致**（例如通过复制、符号链接或统一源码位置）。

---

## 二、macOS 发布版（DMG）

### 方式 1：在项目根目录一键构建（推荐）

```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier
chmod +x build-macos.sh
./build-macos.sh
```

脚本会：进入 `pc-version-final` → `npm install` → `npm run build` → `npm run electron:build-mac`。

### 方式 2：在 pc-version-final 里手动构建

```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final

# 1. 安装依赖（首次或 package.json 变更后）
npm install

# 2. 打 React 生产包（生成 build/）
npm run build

# 3. 打 macOS 安装包（生成 dist/ 里的 .dmg）
npm run electron:build-mac
```

**产物位置**：`pc-version-final/dist/`  
- `XinTuAlbum-1.1.2-x64.dmg`（Intel）  
- `XinTuAlbum-1.1.2-arm64.dmg`（Apple Silicon）

需要 DMG + ZIP 时：

```bash
npm run electron:build-mac-zip
```

---

## 三、Windows 发布版

在 **Windows 电脑**上，在 `pc-version-final` 里执行：

```bash
cd pc-version-final
npm install
npm run electron:build
```

**产物位置**：`pc-version-final/dist/`  
- `XinTuAlbum-Setup-1.1.2.exe`（NSIS 安装版，推荐）

仅便携版：

```bash
npm run electron:build-portable
```

安装版 + 便携版一起打：

```bash
npm run electron:build-all
```

---

## 四、构建前检查

1. **版本号**：在 `pc-version-final/package.json` 里改 `version`（如 `1.1.2`），再构建。
2. **图标**：  
   - macOS：`public/icon.icns`（或 pc-version-final 内对应路径）  
   - Windows：`public/icon.ico`
3. **代码同步**：若桌面功能是在**根目录**的 `public/`、`src/` 开发的，确保 **pc-version-final** 使用的同一份代码（复制或链接），否则打出来的包会缺少你最近的修改。

---

## 五、常见问题

- **“public/electron.js 或 build 找不到”**  
  在 **pc-version-final** 下先执行 `npm run build`，再执行 `electron:build-mac` 或 `electron:build`。

- **macOS 上 DMG 打不开 / 提示未签名**  
  未签名的包首次打开需：右键应用 → “打开” → 确认。要正式分发可考虑 Apple 开发者账号 + 签名与公证（见 `pc-version-final/BUILD_GUIDE_MAC.md`）。

- **在 Windows 上打 macOS 包**  
  可以在 Windows 上执行 `npm run electron:build-mac`，会生成 DMG，但无法签名；适合内测或自用。

---

## 六、日志位置（排查问题时）

打包后主进程日志写入应用标准目录，不再放在桌面：

- **主日志**：`app.getPath('logs')/main.log`  
  - macOS：`~/Library/Logs/XinTuAlbum/main.log`  
  - Windows：`%USERPROFILE%\AppData\Roaming\XinTuAlbum\logs\main.log`  
- **若上述不可写**：回退到 `/tmp/xintualbum-main.log`（macOS）或系统临时目录下同名文件。
- **启动确认**：脚本一加载即写 `/tmp/xintualbum-bootstrap.log`，可确认主进程是否启动。

---

## 七、快速对照

| 目标           | 在哪个目录执行        | 命令 |
|----------------|-----------------------|------|
| macOS DMG      | 项目根目录            | `./build-macos.sh` |
| macOS DMG      | pc-version-final      | `npm run electron:build-mac` |
| Windows 安装版 | pc-version-final      | `npm run electron:build` |
| Windows 便携版 | pc-version-final      | `npm run electron:build-portable` |

输出均在 **pc-version-final/dist/** 下。
