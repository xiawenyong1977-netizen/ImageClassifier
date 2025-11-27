# Android原生数据库服务使用指南

## 一、概述

已创建两个核心类：
1. **ImageDatabaseHelper.java** - 数据库管理类（SQLiteOpenHelper）
2. **ImageDataService.java** - 数据服务类（提供CRUD操作）

## 二、类说明

### 2.1 ImageDatabaseHelper

**职责**：
- 数据库连接管理（单例模式）
- 表结构创建和升级
- WAL模式支持（并发读取）

**主要方法**：
- `getInstance(Context)` - 获取单例实例
- `getDatabase()` - 获取数据库实例（线程安全）
- `closeDatabase()` - 关闭数据库连接

### 2.2 ImageDataService

**职责**：
- 提供与JS层ImageStorageService对应的数据库操作方法
- 数据序列化/反序列化（JSON字段）
- 批量操作优化（事务管理）

**主要方法**：

#### 写入操作
- `writeImageDetailedInfo(List<Map<String, Object>>)` - 批量写入/更新图片详细信息
- `batchUpdateClassification(List<Map<String, Object>>)` - 批量更新分类信息
- `removeImagesByUris(List<String>)` - 根据URI删除图片

#### 读取操作
- `getImages()` - 获取所有图片
- `getImagesByIds(List<String>)` - 根据ID列表获取图片（返回Map）
- `getImagesByCategory(String)` - 根据分类获取图片
- `getImageUris()` - 获取所有图片URI

## 三、使用示例

### 3.1 初始化

```java
import com.imageclassifier.v2.database.ImageDataService;
import android.content.Context;

public class GalleryScanService {
    private ImageDataService dataService;
    
    public GalleryScanService(Context context) {
        // 初始化数据服务
        this.dataService = new ImageDataService(context);
    }
}
```

### 3.2 写入图片数据

```java
// 准备图片数据
List<Map<String, Object>> imageDataList = new ArrayList<>();

Map<String, Object> imageData = new HashMap<>();
imageData.put("uri", "content://media/external/images/media/12345||DCIM/Camera/IMG_001.jpg");
imageData.put("fileName", "IMG_001.jpg");
imageData.put("category", "NA");
imageData.put("confidence", 0.0);
imageData.put("timestamp", System.currentTimeMillis());
imageData.put("size", 1024000L);
imageData.put("width", 1920);
imageData.put("height", 1080);

// GPS信息
imageData.put("latitude", 39.9042);
imageData.put("longitude", 116.4074);
imageData.put("city", "北京");

// 检测结果（JSON对象）
Map<String, Object> detections = new HashMap<>();
detections.put("class", "person");
detections.put("confidence", 0.95);
List<Map<String, Object>> generalDetections = new ArrayList<>();
generalDetections.add(detections);
imageData.put("generalDetections", generalDetections);

imageDataList.add(imageData);

// 批量写入
Map<String, Object> result = dataService.writeImageDetailedInfo(imageDataList);
if ((Boolean) result.get("success")) {
    int inserted = (Integer) result.get("insertedCount");
    int updated = (Integer) result.get("updatedCount");
    Log.d(TAG, "写入成功: 插入" + inserted + "条, 更新" + updated + "条");
}
```

### 3.3 更新分类信息

```java
// 准备分类数据
List<Map<String, Object>> classificationDataList = new ArrayList<>();

Map<String, Object> classificationData = new HashMap<>();
classificationData.put("uri", "content://media/external/images/media/12345||DCIM/Camera/IMG_001.jpg");
classificationData.put("category", "single_person");
classificationData.put("confidence", 0.95);
classificationData.put("message", "这是一张单人照片");

classificationDataList.add(classificationData);

// 批量更新
Map<String, Object> result = dataService.batchUpdateClassification(classificationDataList);
if ((Boolean) result.get("success")) {
    int updated = (Integer) result.get("updatedCount");
    int failed = (Integer) result.get("failedCount");
    Log.d(TAG, "更新成功: " + updated + "条, 失败: " + failed + "条");
}
```

### 3.4 读取图片数据

```java
// 获取所有图片
List<Map<String, Object>> allImages = dataService.getImages();
Log.d(TAG, "总图片数: " + allImages.size());

// 根据分类获取
List<Map<String, Object>> naImages = dataService.getImagesByCategory("NA");
Log.d(TAG, "NA分类图片数: " + naImages.size());

// 根据ID列表获取
List<String> imageIds = Arrays.asList("id1", "id2", "id3");
Map<String, Map<String, Object>> imagesMap = dataService.getImagesByIds(imageIds);
for (Map.Entry<String, Map<String, Object>> entry : imagesMap.entrySet()) {
    String id = entry.getKey();
    Map<String, Object> image = entry.getValue();
    Log.d(TAG, "图片ID: " + id + ", 文件名: " + image.get("fileName"));
}

// 获取所有URI（用于文件比对）
List<String> uris = dataService.getImageUris();
Log.d(TAG, "URI总数: " + uris.size());
```

### 3.5 删除图片

```java
// 根据URI删除
List<String> urisToDelete = Arrays.asList(
    "content://media/external/images/media/12345||DCIM/Camera/IMG_001.jpg"
);

Map<String, Object> result = dataService.removeImagesByUris(urisToDelete);
if ((Boolean) result.get("success")) {
    int deleted = (Integer) result.get("deletedCount");
    Log.d(TAG, "删除成功: " + deleted + "条");
}
```

## 四、数据结构说明

### 4.1 图片数据Map结构

```java
Map<String, Object> imageData = {
    // 必需字段
    "id": String,              // 图片ID（自动生成，基于URI的SHA-256）
    "uri": String,             // 图片URI（必需）
    "fileName": String,        // 文件名（必需）
    
    // 分类字段
    "category": String,        // 分类ID（如：NA, single_person, screenshot等）
    "confidence": Double,      // 置信度
    
    // 时间字段
    "timestamp": Long,         // 文件修改时间（毫秒）
    "takenAt": Long,           // 拍摄时间（毫秒，从EXIF提取）
    "createdAt": String,       // 创建时间（ISO 8601格式）
    "updatedAt": String,       // 更新时间（ISO 8601格式）
    
    // 文件信息
    "size": Long,              // 文件大小（字节）
    "mimeType": String,        // MIME类型
    "width": Integer,          // 图片宽度
    "height": Integer,         // 图片高度
    
    // GPS信息
    "latitude": Double,        // 纬度
    "longitude": Double,       // 经度
    "altitude": Double,        // 海拔
    "accuracy": Double,        // 精度
    
    // 地址信息
    "address": String,         // 详细地址
    "city": String,            // 城市
    "country": String,         // 国家
    "province": String,        // 省份
    "district": String,        // 区县
    "street": String,          // 街道
    "locationSource": String,  // 位置来源
    "cityDistance": Double,   // 距离城市中心的距离
    
    // 检测结果（JSON对象/数组，会自动序列化）
    "idCardDetections": List/Map,      // 身份证检测结果
    "generalDetections": List/Map,     // 通用物体检测结果
    "mobileNetV3Detections": Map,      // MobileNetV3分类结果
    "imageDimensions": Map,            // 图像尺寸信息
    "message": String                  // 大模型推理描述
}
```

### 4.2 JSON字段格式

**generalDetections**（数组）：
```java
List<Map<String, Object>> detections = new ArrayList<>();
Map<String, Object> detection = new HashMap<>();
detection.put("class", "person");
detection.put("confidence", 0.95);
detection.put("x", 100);
detection.put("y", 200);
detection.put("width", 300);
detection.put("height", 400);
detections.add(detection);
```

**mobileNetV3Detections**（对象）：
```java
Map<String, Object> mobileNetV3 = new HashMap<>();
mobileNetV3.put("predictions", predictionsList);
mobileNetV3.put("topClass", "cat");
mobileNetV3.put("topConfidence", 0.98);
```

## 五、注意事项

### 5.1 线程安全
- `ImageDatabaseHelper`使用单例模式，线程安全
- `getDatabase()`方法已同步，支持并发访问
- 使用WAL模式，支持并发读取

### 5.2 事务管理
- 批量写入操作自动使用事务
- 确保数据一致性
- 失败时自动回滚

### 5.3 JSON字段处理
- 检测结果字段（idCardDetections、generalDetections等）会自动序列化/反序列化
- 支持List和Map类型
- 读取时自动转换为JSONArray或JSONObject

### 5.4 ID生成
- 使用URI的SHA-256哈希生成稳定ID
- 与JS层保持一致
- 确保相同URI生成相同ID

### 5.5 性能优化
- 批量操作使用事务，减少数据库访问次数
- 使用索引优化查询性能
- WAL模式支持并发读取，不影响写入性能

## 六、与JS层对应关系

| JS层方法 | 原生层方法 | 说明 |
|---------|-----------|------|
| `writeImageDetailedInfo()` | `writeImageDetailedInfo()` | 批量写入/更新图片 |
| `batchUpdateClassification()` | `batchUpdateClassification()` | 批量更新分类 |
| `removeImagesByUris()` | `removeImagesByUris()` | 删除图片 |
| `getImages()` | `getImages()` | 获取所有图片 |
| `getImagesByIds()` | `getImagesByIds()` | 根据ID获取图片 |
| `getImagesByCategory()` | `getImagesByCategory()` | 根据分类获取图片 |
| `getImageUris()` | `getImageUris()` | 获取所有URI |

## 七、错误处理

所有方法返回`Map<String, Object>`，包含：
- `success`: boolean - 是否成功
- `error`: String - 错误信息（失败时）
- 其他字段根据方法不同而不同

示例：
```java
Map<String, Object> result = dataService.writeImageDetailedInfo(imageDataList);
if (!(Boolean) result.get("success")) {
    String error = (String) result.get("error");
    Log.e(TAG, "写入失败: " + error);
}
```




