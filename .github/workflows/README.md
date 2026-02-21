# GitHub Actions 工作流

## 手动触发（Run workflow）

**「Run workflow」按钮只会在「默认分支」上有对应 workflow 文件时出现。**

- 若当前改动的 workflow 只在 `macos-support` 等分支，需要**先合并到默认分支（如 `main` 或 `master`）**，再到 Actions 里点对应 workflow 名称，右侧才会出现 **Run workflow**。
- 推荐使用 **「Manual Build (Run workflow)」**：仅用于手动触发，合并到默认分支后一定会有 Run workflow 按钮。

## 工作流说明

| 文件 | 说明 |
|------|------|
| `main-build.yml` | 主流程：push/PR 触发 + 可手动；多平台构建，main 上 push 会发 Release |
| `manual-build.yml` | 仅手动触发，跑全平台构建（macOS / Windows / Android） |
| `build-platform.yml` | 被上面两者调用，按 platform 分发到各平台 workflow |
| `macos-build.yml` / `windows-build.yml` / `android-build.yml` | 各平台具体构建 |
