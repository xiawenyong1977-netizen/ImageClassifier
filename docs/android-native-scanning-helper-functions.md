# Android原生扫描服务 - 辅助函数设计

## 一、概述

本文档设计原生扫描服务（`GalleryScanService.java`）所需的所有辅助函数，按照功能模块分类。

---

## 二、辅助函数分类

### 2.1 目录扫描模块（DirectoryScanHelper）

#### 2.1.1 MediaStore查询相关

**已有实现**：`MediaStoreModule.getAllImages()`

**需要封装**：
```java
/**
 * 扫描指定路径的图片
 * @param scanPaths 扫描路径列表（相对路径，如 "DCIM/Camera"）
 * @param limit 限制数量（0表示不限制，用于测试）
 * @return 图片列表
 */
public List<ImageInfo> scanImagesByPaths(List<String> scanPaths, int limit);

/**
 * 扫描所有图片（不限制路径）
 * @param limit 限制数量（0表示不限制）
 * @return 图片列表
 */
public List<ImageInfo> scanAllImages(int limit);

/**
 * 图片信息数据类
 */
public class ImageInfo {
    public String id;              // MediaStore ID
    public String uri;             // Content URI
    public String fileName;        // 文件名
    public String path;            // 路径（绝对或相对）
    public String relativePath;    // 相对路径（Android 10+）
    public long size;              // 文件大小
    public long dateTaken;         // 拍摄时间
    public long dateModified;      // 修改时间
    public long dateAdded;         // 添加时间
    public int width;              // 宽度
    public int height;             // 高度
    public String mimeType;        // MIME类型
}
```

---

### 2.2 EXIF提取模块（ExifExtractionHelper）

#### 2.2.1 EXIF数据提取

**已有实现**：`MediaStoreModule.getImageExif()`, `MediaStoreModule.batchGetImageExif()`

**需要封装**：
```java
/**
 * 提取单张图片的EXIF数据
 * @param uri Content URI
 * @return EXIF数据
 */
public ExifData extractExifData(String uri);

/**
 * 批量提取EXIF数据（性能优化）
 * @param uris URI列表
 * @return EXIF数据列表
 */
public List<ExifData> batchExtractExif(List<String> uris);

/**
 * EXIF数据类
 */
public class ExifData {
    public String uri;                    // 图片URI
    public Long takenTime;                // 拍摄时间（时间戳，毫秒）
    public GpsInfo gps;                   // GPS信息
    public ImageDimensions dimensions;     // 图片尺寸
    public boolean hasGPS;                 // 是否有GPS
    public boolean hasTakenTime;           // 是否有拍摄时间
}

/**
 * GPS信息类
 */
public class GpsInfo {
    public double latitude;                // 纬度
    public double longitude;               // 经度
    public Double altitude;                // 海拔（可选）
    public Double accuracy;                // 精度（可选）
}

/**
 * 图片尺寸类
 */
public class ImageDimensions {
    public int width;                      // 宽度
    public int height;                     // 高度
}
```

---

### 2.3 文件比对模块（FileComparisonHelper）

#### 2.3.1 数据库比对

**需要实现**：
```java
/**
 * 从数据库读取所有现有图片URI
 * @return URI集合
 */
public Set<String> getExistingImageUris();

/**
 * 比对扫描结果与数据库，识别新增和删除的图片
 * @param scannedImages 扫描到的图片列表
 * @return 比对结果
 */
public ComparisonResult compareWithDatabase(List<ImageInfo> scannedImages);

/**
 * 比对结果类
 */
public class ComparisonResult {
    public List<ImageInfo> newImages;      // 新增图片
    public List<String> deletedUris;      // 删除的URI列表
    public int newCount;                  // 新增数量
    public int deletedCount;              // 删除数量
}
```

---

### 2.4 截图检测模块（ScreenshotDetectionHelper）

#### 2.4.1 截图检测逻辑

**需要实现**：
```java
/**
 * 检测图片是否为截图
 * @param fileName 文件名
 * @param width 宽度
 * @param height 高度
 * @param path 文件路径（相对或绝对）
 * @param hasGPS 是否有GPS信息（有GPS肯定不是截图）
 * @return 是否为截图
 */
public boolean isScreenshot(String fileName, int width, int height, String path, boolean hasGPS);

/**
 * 批量检测截图
 * @param images 图片列表（包含fileName, width, height, path, hasGPS）
 * @return 检测结果（Map<uri, isScreenshot>）
 */
public Map<String, Boolean> batchDetectScreenshots(List<ImageInfo> images);
```

**检测规则**（参考JS层逻辑）：
1. **有GPS信息** → 直接判断不是截图
2. **文件名规则**：包含 "screenshot", "截图", "Screen" 等关键词
3. **尺寸规则**：宽高比 <= 0.5（手机竖屏比例，包括滚动截图）
4. **路径规则**：路径包含截图相关关键词

---

### 2.5 哈希计算模块（HashCalculationHelper）

#### 2.5.1 文件哈希计算

**已有实现**：`MediaStoreModule.batchCalculateFileHash()`

**需要封装**：
```java
/**
 * 计算单张图片的SHA-256哈希
 * @param uri Content URI
 * @return 哈希值
 */
public String calculateFileHash(String uri);

/**
 * 批量计算文件哈希（多线程并行）
 * @param uris URI列表
 * @return 哈希结果（Map<uri, hash>）
 */
public Map<String, String> batchCalculateHashes(List<String> uris);
```

---

### 2.6 远程推理模块（RemoteInferenceHelper）

#### 2.6.1 远程API调用

**需要实现**：
```java
/**
 * 调用远程推理API
 * @param imageUri Content URI
 * @param imageHash 图片哈希值（用于缓存查询）
 * @param apiUrl API地址
 * @param apiKey API密钥（可选）
 * @return 推理结果
 */
public RemoteInferenceResult callRemoteInference(String imageUri, String imageHash, String apiUrl, String apiKey);

/**
 * 批量调用远程推理API
 * @param images 图片列表（包含uri和hash）
 * @param apiUrl API地址
 * @param apiKey API密钥（可选）
 * @param batchSize 批次大小
 * @return 推理结果列表
 */
public List<RemoteInferenceResult> batchCallRemoteInference(List<ImageWithHash> images, String apiUrl, String apiKey, int batchSize);

/**
 * 远程推理结果类
 */
public class RemoteInferenceResult {
    public String uri;                    // 图片URI
    public boolean success;                // 是否成功
    public String category;                // 分类结果
    public Double confidence;              // 置信度
    public String error;                  // 错误信息（如果失败）
    public Map<String, Object> detections; // 检测结果（JSON）
    public String message;                 // 大模型推理描述（可选）
}

/**
 * 带哈希的图片信息
 */
public class ImageWithHash {
    public String uri;
    public String hash;
}
```

**实现要点**：
- 使用 `OkHttp` 进行HTTP请求
- 支持FormData上传图片
- 支持超时、重试机制
- 支持JSON解析（使用`Gson`或`org.json`）

---

### 2.7 远端缓存查询模块（RemoteCacheHelper）

#### 2.7.1 缓存查询

**需要实现**：
```java
/**
 * 查询远端缓存（基于哈希值）
 * @param imageHash 图片哈希值
 * @param cacheApiUrl 缓存API地址
 * @return 缓存结果（如果命中）
 */
public CacheResult queryRemoteCache(String imageHash, String cacheApiUrl);

/**
 * 批量查询远端缓存
 * @param hashes 哈希值列表
 * @param cacheApiUrl 缓存API地址
 * @return 缓存结果（Map<hash, CacheResult>）
 */
public Map<String, CacheResult> batchQueryRemoteCache(List<String> hashes, String cacheApiUrl);

/**
 * 缓存结果类
 */
public class CacheResult {
    public boolean hit;                   // 是否命中
    public String category;               // 分类结果（如果命中）
    public Double confidence;             // 置信度（如果命中）
    public Map<String, Object> detections; // 检测结果（如果命中）
}
```

---

### 2.8 数据库操作模块（DatabaseHelper）

#### 2.8.1 数据库写入

**已有实现**：`ImageDataService.writeImageDetailedInfo()`

**需要封装**：
```java
/**
 * 批量保存图片数据到数据库
 * @param imageDataList 图片数据列表
 * @return 保存结果
 */
public SaveResult batchSaveImages(List<ImageData> imageDataList);

/**
 * 更新图片分类结果
 * @param uri 图片URI
 * @param category 分类
 * @param confidence 置信度
 * @param detections 检测结果
 * @return 是否成功
 */
public boolean updateImageClassification(String uri, String category, Double confidence, Map<String, Object> detections);

/**
 * 批量更新分类结果
 * @param classifications 分类结果列表
 * @return 更新结果
 */
public UpdateResult batchUpdateClassifications(List<ClassificationData> classifications);

/**
 * 图片数据类（用于数据库写入）
 */
public class ImageData {
    public String id;                     // 图片ID（自动生成）
    public String uri;                    // Content URI
    public String fileName;               // 文件名
    public String category;               // 分类
    public Double confidence;             // 置信度
    public Long timestamp;                // 时间戳
    public Long takenAt;                  // 拍摄时间
    public Long size;                     // 文件大小
    public String mimeType;               // MIME类型
    public Integer width;                  // 宽度
    public Integer height;                 // 高度
    public GpsInfo gps;                   // GPS信息
    public Map<String, Object> detections; // 检测结果（JSON）
    public String message;                 // 大模型推理描述
}

/**
 * 分类数据类
 */
public class ClassificationData {
    public String uri;
    public String category;
    public Double confidence;
    public Map<String, Object> detections;
    public String message;
}

/**
 * 保存结果类
 */
public class SaveResult {
    public boolean success;
    public int insertedCount;
    public int updatedCount;
    public int failedCount;
}

/**
 * 更新结果类
 */
public class UpdateResult {
    public boolean success;
    public int updatedCount;
    public int failedCount;
}
```

#### 2.8.2 数据库查询

**已有实现**：`ImageDataService` 已有部分查询方法

**需要补充**：
```java
/**
 * 从数据库读取所有现有图片URI
 * @return URI集合
 */
public Set<String> getAllImageUris();

/**
 * 查询指定URI的图片是否存在
 * @param uri Content URI
 * @return 是否存在
 */
public boolean imageExists(String uri);

/**
 * 获取扫描状态设置
 * @param key 设置键
 * @return 设置值
 */
public String getSetting(String key);

/**
 * 更新扫描状态设置
 * @param key 设置键
 * @param value 设置值
 */
public void updateSetting(String key, String value);
```

---

### 2.9 路径处理模块（PathHelper）

#### 2.9.1 路径转换和规范化

**需要实现**：
```java
/**
 * 将绝对路径转换为相对路径（相对于外部存储根目录）
 * @param absolutePath 绝对路径
 * @param externalStoragePath 外部存储根目录
 * @return 相对路径（如 "DCIM/Camera"）
 */
public String convertToRelativePath(String absolutePath, String externalStoragePath);

/**
 * 规范化路径（统一格式）
 * @param path 路径（绝对或相对）
 * @return 规范化后的路径
 */
public String normalizePath(String path);

/**
 * 检查路径是否匹配扫描路径列表
 * @param imagePath 图片路径（绝对或相对）
 * @param scanPaths 扫描路径列表（相对路径）
 * @param externalStoragePath 外部存储根目录
 * @return 是否匹配
 */
public boolean isPathMatched(String imagePath, List<String> scanPaths, String externalStoragePath);

/**
 * 获取外部存储根目录
 * @return 外部存储根目录路径
 */
public String getExternalStoragePath();
```

---

### 2.10 URI处理模块（UriHelper）

#### 2.10.1 URI转换

**已有实现**：`MediaStoreModule.getUriByPath()`

**需要封装**：
```java
/**
 * 根据文件路径获取Content URI
 * @param filePath 文件路径
 * @return Content URI（如果找到）
 */
public String getUriByPath(String filePath);

/**
 * 验证URI是否为有效的Content URI
 * @param uri URI字符串
 * @return 是否有效
 */
public boolean isValidContentUri(String uri);

/**
 * 从Content URI提取MediaStore ID
 * @param uri Content URI
 * @return MediaStore ID
 */
public Long extractMediaStoreId(String uri);
```

---

### 2.11 数据转换模块（DataConversionHelper）

#### 2.11.1 数据格式转换

**需要实现**：
```java
/**
 * 将ImageInfo转换为ImageData（用于数据库写入）
 * @param imageInfo 图片信息
 * @param exifData EXIF数据
 * @param classification 分类结果
 * @return 图片数据
 */
public ImageData convertToImageData(ImageInfo imageInfo, ExifData exifData, ClassificationResult classification);

/**
 * 将检测结果转换为JSON字符串（用于数据库存储）
 * @param detections 检测结果Map
 * @return JSON字符串
 */
public String detectionsToJson(Map<String, Object> detections);

/**
 * 从JSON字符串解析检测结果
 * @param jsonString JSON字符串
 * @return 检测结果Map
 */
public Map<String, Object> detectionsFromJson(String jsonString);

/**
 * 分类结果类
 */
public class ClassificationResult {
    public String category;               // 分类
    public Double confidence;             // 置信度
    public Map<String, Object> detections; // 检测结果
    public String message;                 // 大模型推理描述
}
```

---

### 2.12 工具函数模块（UtilityHelper）

#### 2.12.1 通用工具函数

**需要实现**：
```java
/**
 * 生成稳定的图片ID（基于URI的SHA-256哈希）
 * @param uri Content URI
 * @return 图片ID
 */
public String generateStableId(String uri);

/**
 * 获取当前时间戳（毫秒）
 * @return 时间戳
 */
public long getCurrentTimestamp();

/**
 * 格式化日期时间（ISO 8601格式）
 * @param timestamp 时间戳（毫秒）
 * @return ISO 8601格式字符串
 */
public String formatDateTime(long timestamp);

/**
 * 解析ISO 8601格式日期时间
 * @param dateTimeString ISO 8601格式字符串
 * @return 时间戳（毫秒）
 */
public long parseDateTime(String dateTimeString);

/**
 * 安全获取字符串值（处理null）
 * @param value 值
 * @param defaultValue 默认值
 * @return 字符串值
 */
public String safeGetString(Object value, String defaultValue);

/**
 * 安全获取整数值（处理null）
 * @param value 值
 * @param defaultValue 默认值
 * @return 整数值
 */
public Integer safeGetInt(Object value, Integer defaultValue);

/**
 * 安全获取长整数值（处理null）
 * @param value 值
 * @param defaultValue 默认值
 * @return 长整数值
 */
public Long safeGetLong(Object value, Long defaultValue);

/**
 * 安全获取双精度值（处理null）
 * @param value 值
 * @param defaultValue 默认值
 * @return 双精度值
 */
public Double safeGetDouble(Object value, Double defaultValue);
```

---

## 三、辅助函数依赖关系

```
GalleryScanService (主服务)
    │
    ├─ DirectoryScanHelper (目录扫描)
    │   └─ MediaStoreModule (已有)
    │
    ├─ ExifExtractionHelper (EXIF提取)
    │   └─ MediaStoreModule (已有)
    │
    ├─ FileComparisonHelper (文件比对)
    │   └─ ImageDataService (已有)
    │
    ├─ ScreenshotDetectionHelper (截图检测)
    │   └─ (独立实现)
    │
    ├─ HashCalculationHelper (哈希计算)
    │   └─ MediaStoreModule (已有)
    │
    ├─ RemoteCacheHelper (远端缓存查询)
    │   └─ OkHttp (需要引入)
    │
    ├─ RemoteInferenceHelper (远程推理)
    │   └─ OkHttp (需要引入)
    │
    ├─ DatabaseHelper (数据库操作)
    │   └─ ImageDataService (已有)
    │
    ├─ PathHelper (路径处理)
    │   └─ (独立实现)
    │
    ├─ UriHelper (URI处理)
    │   └─ MediaStoreModule (已有)
    │
    ├─ DataConversionHelper (数据转换)
    │   └─ Gson (需要引入，用于JSON处理)
    │
    └─ UtilityHelper (工具函数)
        └─ (独立实现)
```

---

## 四、实现优先级

### 高优先级（核心功能）
1. ✅ **DatabaseHelper** - 数据库操作（已有`ImageDataService`）
2. ✅ **ExifExtractionHelper** - EXIF提取（已有`MediaStoreModule`）
3. ✅ **HashCalculationHelper** - 哈希计算（已有`MediaStoreModule`）
4. ⚠️ **DirectoryScanHelper** - 目录扫描（需要封装`MediaStoreModule`）
5. ⚠️ **FileComparisonHelper** - 文件比对（需要实现）
6. ⚠️ **ScreenshotDetectionHelper** - 截图检测（需要实现）

### 中优先级（网络功能）
7. ⚠️ **RemoteCacheHelper** - 远端缓存查询（需要实现）
8. ⚠️ **RemoteInferenceHelper** - 远程推理（需要实现）

### 低优先级（工具函数）
9. ⚠️ **PathHelper** - 路径处理（需要实现）
10. ⚠️ **UriHelper** - URI处理（需要封装`MediaStoreModule`）
11. ⚠️ **DataConversionHelper** - 数据转换（需要实现）
12. ⚠️ **UtilityHelper** - 工具函数（需要实现）

---

## 五、外部依赖

### 需要引入的库

1. **OkHttp**（网络请求）
   ```gradle
   implementation 'com.squareup.okhttp3:okhttp:4.12.0'
   ```

2. **Gson**（JSON处理）
   ```gradle
   implementation 'com.google.code.gson:gson:2.10.1'
   ```

3. **AndroidX ExifInterface**（EXIF提取，已有）
   ```gradle
   implementation 'androidx.exifinterface:exifinterface:1.3.6'
   ```

---

## 六、总结

### 已有实现
- ✅ MediaStoreModule（目录扫描、EXIF提取、哈希计算）
- ✅ ImageDataService（数据库操作）
- ✅ ImageDatabaseHelper（数据库管理）

### 需要实现
- ⚠️ 文件比对逻辑
- ⚠️ 截图检测逻辑
- ⚠️ 远端缓存查询
- ⚠️ 远程推理API调用
- ⚠️ 路径处理工具
- ⚠️ 数据转换工具
- ⚠️ 通用工具函数

### 建议实施顺序
1. **第一阶段**：实现核心辅助函数（文件比对、截图检测、路径处理）
2. **第二阶段**：实现网络相关辅助函数（远端缓存、远程推理）
3. **第三阶段**：完善工具函数和数据转换


