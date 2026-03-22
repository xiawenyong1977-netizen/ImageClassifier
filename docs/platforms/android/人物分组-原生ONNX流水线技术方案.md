# Android 人物分组：原生 ONNX 流水线技术方案

**版本**：v1.3  
**日期**：2026-03-22  
**状态**：待评审；**MVP 已落代码（Android）** — 见文末「实现记录」  
**关联文档**：[按具体人物分类-技术设计文档](../../features/person-classification/按具体人物分类-技术设计文档.md)、[后台扫描实现方案](./后台扫描实现方案.md)、[android-native-scanning-architecture.md](../../android-native-scanning-architecture.md)

---

## 1. 背景与结论

### 1.1 问题

当前 Android 端人物分组（`PersonIndexingService` + `FaceDetectionService` / `FaceEmbeddingService`）在 **JS 线程** 上执行：

- 使用 **onnxruntime-react-native**，推理多在 **CPU**；单张人脸检测可达 **数百 ms 级**，叠加 Embedding 与串行调度，**百张量级即分钟级**。
- 用户切到后台后 **JS 线程不可靠**（挂起/限频/进程回收），**无法作为真正的后台长任务**依赖。
- 产品结论：**不将检测 + 推理迁出 JS、不配套前台保活，人物分组在移动端基本不可用**（不仅是“慢”，而是“不能等 + 不能后台跑完”）。

### 1.2 目标结论

在 Android 上采用与 **基础扫描** 同构的工程范式：

- **原生长任务**（解码、预处理、ONNX 推理、可选聚类）在 **Native 专用后台线程串行**执行（默认 **不做多路推理并发**，见 §5.2.1）；
- **前台服务**（可复用或扩展现有 `ScanForegroundService` / `ScanServiceModule`）保障 **可后台完成**；
- **JS 主要负责**：发起任务、展示进度；**持久化（人物字段 / 聚类结果）优先在 Native 完成**（见 §3.3），避免推理之外的「长尾」仍绑死在 JS 上。

---

## 2. 设计目标与非目标

### 2.1 目标（Must）

| 编号 | 目标 |
|------|------|
| G1 | 人物索引主路径在 **无用户盯屏** 情况下仍可完成（前台服务 + 原生执行） |
| G2 | 与现网 **同一套 ONNX 模型文件**（`face_detector.onnx`、`face_embedding.onnx`）语义对齐，或明确等价替换方案 |
| G3 | 输出与现 JS 层消费格式兼容：**原图坐标 bbox、关键点、512 维 embedding**（或与现 `PersonIndexingService` 约定一致） |
| G4 | 进度可观测：与 `GalleryScanModule` 类似 **DeviceEventEmitter** 或统一事件总线 |
| G5 | 失败可降级：人物流程失败 **不破坏** 内容分类与相册主数据 |

### 2.2 非目标（阶段内不做或可选）

- 不强制第一期就上 **iOS / 鸿蒙** 同源实现（可单列子项目）。
- 不强制第一期把 **聚类逻辑** 全部迁 Native（可先 Native 出 embedding，JS 聚类；见 §6）。
- 不强制替换为 **ML Kit**；若后续验证 ORT+NNAPI 仍不足，再以独立 ADR 引入第二检测后端。

---

## 3. 总体架构

### 3.1 与基础扫描对齐

```text
┌─────────────────────────────────────────────────────────────┐
│  React Native (JS)                                           │
│  - 调用 PersonIndexModule.startPersonIndex(options)          │
│  - 监听 PersonIndexProgress / PersonIndexCompleted（薄 UI）   │
│  - 可选：仅收「任务结束」一次回调刷新缓存（不写每张明细）     │
└───────────────────────────┬─────────────────────────────────┘
                            │ JNI / ReactMethod
┌───────────────────────────▼─────────────────────────────────┐
│  Native                                                      │
│  - ScanForegroundService（START / UPDATE / STOP，可复用）    │
│  - PersonIndexOrchestrator（Kotlin/Java）                    │
│      - 单工作线程：逐张串行（检测→Embedding→写库）             │
│      - Image decode + letterbox/cover 与现网一致             │
│      - ONNX Runtime Mobile：Session Run                       │
│      - **写库：ImageDataService / SQLite（人物字段，推荐）**   │
│      - 进度 → DeviceEventEmitter（节流，如每 N 张）            │
└─────────────────────────────────────────────────────────────┘
```

**原则**：与 `GalleryScanService` + `GalleryScanModule` 一样 —— **重活与持久化关键路径在下，通知保活，JS 薄编排**。

### 3.3 写库放在 JS 会不会再被「卡住」？

**和推理比**：单条 SQLite 写入通常是 **亚毫秒～毫秒级**，远比 **数百 ms/张** 的 ONNX 小；若采用 **批量事务**（如每 20～50 张 `BEGIN…COMMIT` 一次），JS 侧总占用时间往往仍 **远小于** 原 JS 推理阶段。

**但仍有问题**（因此文档将默认推荐改为 Native 写库）：

| 情况 | 说明 |
|------|------|
| **逐张桥接** | Native 每处理完一张就 `DeviceEventEmitter` → JS `await` 写一条，会把 **成百上千次** 序列化 + 桥 + 写库堆在 JS 线程上，**尾部仍长**，且切后台后 JS **不可靠**。 |
| **切后台** | 前台服务保的是 **进程与 Native 线程**；若强依赖 JS 写库才能完成整 job，**任务后半段仍可能被系统拖死**。 |
| **聚类在 JS** | 若聚类算法仍在 JS，整批 embedding 需经桥传到 JS 再算 —— **大数据量浮点数组** 过桥成本高，同样吃 JS 与内存峰值。 |

**推荐顺序**（由强到弱）：

1. **Native 内写 SQLite**（复用现有 `ImageDataService` 等路径），JS 仅在 `Completed` 时 **刷新缓存/UI**（与基础扫描完成后 JS 刷新类似）。  
2. 若首期必须复用 `UnifiedDataService`：**Native 批量回调**（如每批 30 条 embedding + 元数据），JS **单批一次事务写入**，禁止「每张一事件」。  
3. 聚类：首期可仍在 JS 但应 **整 job 只传一次大数组** 或 **迁 Native**（§6），避免与逐张写库叠加。

因此：**「写库全放 JS」不是会像 ONNX 一样慢一个数量级，但在「必须后台跑完」目标下不够稳；方案图已改为默认 Native 写库。**

### 3.2 与现有文档的关系

《按具体人物分类-技术设计文档》§3 已提出 **Android: NativePersonIndexPipeline (Foreground Service)**。本方案将其 **落地为可实施包结构与接口清单**，并明确 **ONNX 在 Native 的集成方式**。

---

## 4. 技术选型

### 4.1 主选：ONNX Runtime Mobile（Android AAR + JNI）

| 维度 | 说明 |
|------|------|
| 模型 | 继续加载 `assets` 或应用私有目录下与现网一致的 `.onnx` |
| EP | 优先评估 **NNAPI**（若设备/算子支持），否则 **CPU + XNNPACK** |
| 优势 | 与现 **SCRFD 解码、ArcFace 对齐、阈值** 可逐行对照 JS 实现，减少“换引擎换语义” |
| 成本 | JNI 封装、预处理浮点一致性、包体增加（需与 `onnxruntime-react-native` **合并或二选一**策略，见 §8） |

### 4.2 备选：检测用 ML Kit / 推理仍 ONNX

- 若 NNAPI 下 SCRFD 仍慢或兼容差，**仅检测**换 ML Kit，**Embedding 仍 ONNX Native**；需 **五点对齐** 与现 `_alignFaceByKeypoints` 一致，并做 **AB 回归**。

### 4.3 不推荐作为第一期

- 纯 JS 加并发、仅 WakeLock：**不能解决后台 JS 挂起**。
- 仅换更小模型但仍在 JS：**根因未除**。

---

## 5. 模块与接口设计（草案）

### 5.1 新建 `PersonIndexModule`（名称可调整）

建议与 `GalleryScanModule` 并列，职责清晰。

**ReactMethod（示例）**

| 方法 | 说明 |
|------|------|
| `startPersonIndex(ReadableMap options, Promise promise)` | `options`: 如 `imageIds[]` / `uris[]`、`mode: full|incremental`、`modelVersion`；立即返回 `jobId`（**不设默认可并发的 maxConcurrency**：推理以单线程串行为主，见 §5.2.1） |
| `cancelPersonIndex(String jobId)` | 用户取消 |
| `getPersonIndexState()` | 是否运行中（与 `ScanService.isRunning` 协调，避免双任务冲突） |

**事件（示例）**

| 事件名 | 载荷 |
|--------|------|
| `PersonIndexProgress` | `jobId, processed, total, stage, message` |
| `PersonIndexCompleted` | `jobId, summary{assigned, skipped, failed}` |
| `PersonIndexError` | `jobId, code, message` |

### 5.2 单张流水线（Native 内部）

1. 解析 `content://` / `file` → `Bitmap` 或 `ByteBuffer`（与 `MediaStore`/现有扫描一致）。
2. **Cover 缩放至 320×320**（与 `FaceDetectionService` + `ImageProcessor` 公式一致，避免框漂移）。
3. **SCRFD** 推理 + 与 `FaceDetectionService._decodeScrfd` 等价的后处理 → 主脸 bbox + 5 关键点（原图坐标）。
4. **裁剪/仿射对齐** → 112×112（与 `PersonIndexingService` / `FaceEmbeddingService` 一致）。
5. **ArcFace 类模型** → `float[512]`。
6. **持久化**：默认 **Native 直接写 SQLite**（人物相关列 / 侧表，与现网 schema 一致）；JS 仅收进度与完成事件。若一期必须走 JS 存储 API，则采用 **批量事务写库**（§3.3），避免每张一桥接。

### 5.2.1 执行模型：默认串行，慎做多路推理并发

人物流水线为 **计算密集**（连续两次 ONNX `Run` + 前后处理），与「扫盘 IO 密集」不同：

| 结论 | 说明 |
|------|------|
| **默认单工作线程、逐张串行** | 同一张图内 **检测 Session → Embedding Session** 顺序执行；全 job 内 **不推荐** 多线程同时对 **同一 `InferenceSession` 调用 `Run`**（ORT 文档对 Session 并发有约束，易踩线程安全问题）。 |
| **多 Session 多线程提速往往不明显** | 移动端 CPU 核虽多，**推理常打满算力/内存带宽**，并发易导致 **争用、发热降频、内存峰值**，实测 **墙钟时间未必近似线性缩短**。 |
| **可选优化：I/O 与计算流水线** | 若需重叠，可考虑 **单独线程仅做下一张解码/缩放**，**推理仍在单线程** 消费队列；与「双路并发 Run」区分，风险与收益需 **Profile 后再定**，不作为默认方案。 |

因此架构图与模块参数 **不预设「有限并发（如 2）」**；若未来在特定机型 + NNAPI 上验证 **多 Session 隔离** 确有收益，再以独立实验与 ADR 引入。

### 5.3 与 `ScanService` / 前台服务

- **启动人物任务时**：与全库扫描互斥（沿用或扩展 `ScanService.isRunning` / 独立 `personIndexRunning` 标志），避免双前台逻辑打架。
- **通知**：复用 `ScanForegroundService` 的 **CHANNEL / 更新协议**，仅 **标题/文案** 区分「相册扫描」与「人物分组」；或 **第二 NotificationId** 同 Channel（产品定）。

---

## 6. 聚类与写库策略（分期）

### 阶段 A（推荐首发）

- Native：**检测 + Embedding**；**人物明细字段写入 SQLite**（与基础扫描写库方式一致，不依赖 JS 逐张写）。
- JS：**仅进度与完成刷新**（`GlobalImageCache.buildCache` 等）；聚类若短期仍在 JS，则 **Native 在完成检测+Embedding 后一次性传入批量结果**（或 Native 先写 `embedding` 临时列再由 JS 拉取聚类），避免「每张一事件」写库。

### 阶段 A'（折中，若必须复用 JS 聚类实现）

- Native：检测 + Embedding，**每批（如 30 条）** 发一次事件；JS：对该批执行 **单次事务** 更新存储，再跑增量聚类；**禁止** 每张 `DeviceEventEmitter` + `await` 写库。

### 阶段 B（可选）

- 将 **centroid 聚类、小组合并** 迁 Kotlin（需完整单元测试与现网结果对齐）；写库与聚类均在 Native，JS 最薄。

---

## 7. 与 JS 现有实现对齐清单（验收必测）

| 项 | 参照实现 |
|----|-----------|
| Cover 映射 | `FaceDetectionService._mapCoverBoxToOriginal` / `ImageProcessor` cover |
| SCRFD 解码 | `FaceDetectionService._decodeScrfd`、阈值 `score > threshold` |
| 对齐模板 | `PersonIndexingService` 中 `ARCFACE_TEMPLATE_112` |
| Embedding 输入归一化 | `FaceEmbeddingService` 张量布局与均值方差（若有） |
| 存储字段 | 与《按具体人物分类》数据模型一致 |

建议：**同一批固定测试图**，对比 JS 版与 Native 版 **bbox IoU、embedding 余弦相似度**（阈值内视为一致）。

---

## 8. 包体与依赖治理

- 现状：`onnxruntime-react-native` 已带入 ORT。
- Native 再引 **onnxruntime-android AAR** 可能导致 **双份 ORT**。
- **方向**（立项时二选一）：
  - **方案 1**：人物与检测 **全部迁 Native** 后，逐步 **移除 RN 内人脸相关 ORT 调用**，只保留其他模型所需（若可拆分）。
  - **方案 2**：短期接受包体增大，**里程碑上**合并为单一 ORT 依赖。

需在 `build.gradle` 与 ABI splits 上明确 **arm64-v8a** 优先策略。

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| NNAPI 算子不支持回退 CPU | 启动时探测 EP，失败记录日志并降级 CPU |
| 前后台切换进程被杀 | 前台服务 + 分段 checkpoint（`personIndexStatus` 已部分具备） |
| 与全量扫描同时触发 | 模块级互斥 + UI 禁用（与现 `isScanning` 一致） |
| 结果与旧版不一致 | 固定黄金集 + 自动化对比脚本（CI 可选） |
| JS 逐张写库导致长尾 / 后台不可靠 | 默认 Native 写库；若走 JS 则必须批量事务（§3.3、§6） |

---

## 10. 实施里程碑（建议）

| 阶段 | 内容 | 产出 |
|------|------|------|
| M1 | Native 加载 `face_detector.onnx`，单 URI 跑通 + 与 JS bbox 对比 | Demo + 对齐报告 |
| M2 | 接入 `face_embedding.onnx`，输出 512 维 | Demo |
| M3 | `PersonIndexModule` + **单后台线程串行推理** + 事件 + 复用 Foreground Service | 可集成 RN |
| M4 | Native 写人物字段 + JS 薄层刷新；关闭人物路径上的 JS ORT 调用（Android）；若暂用 JS 写库则仅批量路径 | 发版候选 |
| M5 | 可选：聚类 Native 化、iOS/鸿蒙方案 | 另案 |

---

## 11. 文档维护

- 评审通过后：在 [按具体人物分类-技术设计文档](../../features/person-classification/按具体人物分类-技术设计文档.md) §3 增加指向本文的 **「Android 实施见 xxx」** 链接。
- 接口冻结后：补充 **Sequence 图** 与 **错误码表**（可放在本文附录或 `docs/api/`）。

---

**本方案结论**：在 Android 上采用 **与基础扫描同构的「前台服务 + 原生长任务 + Native 持久化（推荐）+ JS 薄编排」**，并将 **ONNX 推理下沉到 Native**，是人物分组在移动端 **可用且可后台完成** 的必要条件；**写库不宜默认逐张放 JS**（否则仍有长尾与切后台风险），首期优先 **Native 写 SQLite** 或 **JS 批量事务**；聚类可短期留在 JS 但需控制过桥与批次策略。

---

## 12. 实现记录（MVP，2026-03-22）

已落地内容（与 §6「聚类留在 JS」一致）：

| 项 | 说明 |
|----|------|
| 原生包 | `com.imageclassifier.v2.face.*`：`FaceCoverResize`、`ScrfdDecoder`、`FaceAlignArcFace`、`PersonFaceOnnxPipeline` |
| RN 模块 | `PersonFaceNativeModule`（`initialize` / `detectAndEmbed` / `release`），`PersonFacePackage` 已在 `MainApplication` 注册 |
| 依赖 | `app/build.gradle` 增加 `implementation 'com.microsoft.onnxruntime:onnxruntime-android:1.24.3'`（与 onnxruntime-react-native 对齐） |
| JS | `PersonIndexingService.indexSinglePersonImages`：Android 上优先 `PersonFaceNative.initialize` + 每张 `detectAndEmbed`；**聚类、小组合并、写库** 仍为原 JS 逻辑；`ScanService.start/stop` 包裹人物任务 |
| 未做 | Native 直写 SQLite、人物任务独立 Foreground 通知文案、iOS |

后续可按 §3.3 将写库迁入 `ImageDataService`，并独立人物扫描通知渠道。
