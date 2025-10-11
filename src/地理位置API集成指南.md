# 地理位置API集成指南

## 📍 概述

本文档提供全球城市地理位置查询API的集成说明，支持根据经纬度查询最近的城市或附近城市列表。

**基础信息：**
- **服务地址**: `http://123.57.68.4:8000`
- **API版本**: v1
- **数据来源**: GeoNames 全球地理数据库
- **数据范围**: 中国地区约3400+个城市（人口 > 0）
- **响应格式**: JSON
- **字符编码**: UTF-8

---

## 🔌 API接口列表

### 1. 查询最近的城市

根据给定的经纬度坐标，返回最近的一个城市信息。

#### **接口地址**
```
GET /api/v1/location/nearest-city
```

#### **请求参数**

| 参数名 | 类型 | 必填 | 范围 | 说明 |
|--------|------|------|------|------|
| latitude | float | 是 | -90 ~ 90 | 纬度 |
| longitude | float | 是 | -180 ~ 180 | 经度 |

#### **响应格式**

**成功响应 (200)**
```json
{
  "id": 1780,
  "geoname_id": 1816670,
  "name": "Beijing",
  "ascii_name": "Beijing",
  "latitude": 39.9075,
  "longitude": 116.39723,
  "country_code": "CN",
  "population": 18960744,
  "distance_km": 0.9418911361326326
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int | 数据库ID |
| geoname_id | int | GeoNames官方ID |
| name | string | 城市名称（英文或中文） |
| ascii_name | string | ASCII名称 |
| latitude | float | 城市纬度 |
| longitude | float | 城市经度 |
| country_code | string | 国家代码（CN=中国） |
| population | int | 人口数量 |
| distance_km | float | 距离查询点的距离（公里） |

#### **错误响应**

**参数错误 (422)**
```json
{
  "detail": [
    {
      "type": "less_than_equal",
      "loc": ["query", "latitude"],
      "msg": "Input should be less than or equal to 90",
      "input": "100"
    }
  ]
}
```

**未找到数据 (404)**
```json
{
  "detail": "未找到任何城市数据"
}
```

**服务器错误 (500)**
```json
{
  "detail": "查询失败: [错误信息]"
}
```

#### **请求示例**

**cURL**
```bash
curl "http://123.57.68.4:8000/api/v1/location/nearest-city?latitude=39.9042&longitude=116.4074"
```

**JavaScript/TypeScript**
```javascript
async function getNearestCity(latitude, longitude) {
  const url = `http://123.57.68.4:8000/api/v1/location/nearest-city?latitude=${latitude}&longitude=${longitude}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const city = await response.json();
    console.log(`最近的城市: ${city.name}, 距离: ${city.distance_km.toFixed(2)} 公里`);
    return city;
  } catch (error) {
    console.error('查询失败:', error);
    throw error;
  }
}

// 使用示例
getNearestCity(39.9042, 116.4074)
  .then(city => {
    console.log('城市信息:', city);
  });
```

**Swift (iOS)**
```swift
import Foundation

struct CityInfo: Codable {
    let id: Int
    let geoname_id: Int
    let name: String
    let ascii_name: String?
    let latitude: Double
    let longitude: Double
    let country_code: String
    let population: Int
    let distance_km: Double
}

func getNearestCity(latitude: Double, longitude: Double, completion: @escaping (Result<CityInfo, Error>) -> Void) {
    let urlString = "http://123.57.68.4:8000/api/v1/location/nearest-city?latitude=\(latitude)&longitude=\(longitude)"
    
    guard let url = URL(string: urlString) else {
        completion(.failure(NSError(domain: "Invalid URL", code: -1)))
        return
    }
    
    let task = URLSession.shared.dataTask(with: url) { data, response, error in
        if let error = error {
            completion(.failure(error))
            return
        }
        
        guard let data = data else {
            completion(.failure(NSError(domain: "No data", code: -1)))
            return
        }
        
        do {
            let decoder = JSONDecoder()
            let city = try decoder.decode(CityInfo.self, from: data)
            completion(.success(city))
        } catch {
            completion(.failure(error))
        }
    }
    
    task.resume()
}

// 使用示例
getNearestCity(latitude: 39.9042, longitude: 116.4074) { result in
    switch result {
    case .success(let city):
        print("最近的城市: \(city.name), 距离: \(String(format: "%.2f", city.distance_km)) 公里")
    case .failure(let error):
        print("查询失败: \(error)")
    }
}
```

**Kotlin (Android)**
```kotlin
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URL

data class CityInfo(
    val id: Int,
    val geoname_id: Int,
    val name: String,
    val ascii_name: String?,
    val latitude: Double,
    val longitude: Double,
    val country_code: String,
    val population: Int,
    val distance_km: Double
)

suspend fun getNearestCity(latitude: Double, longitude: Double): CityInfo = withContext(Dispatchers.IO) {
    val urlString = "http://123.57.68.4:8000/api/v1/location/nearest-city?latitude=$latitude&longitude=$longitude"
    val response = URL(urlString).readText()
    val json = JSONObject(response)
    
    CityInfo(
        id = json.getInt("id"),
        geoname_id = json.getInt("geoname_id"),
        name = json.getString("name"),
        ascii_name = json.optString("ascii_name"),
        latitude = json.getDouble("latitude"),
        longitude = json.getDouble("longitude"),
        country_code = json.getString("country_code"),
        population = json.getInt("population"),
        distance_km = json.getDouble("distance_km")
    )
}

// 使用示例
GlobalScope.launch(Dispatchers.Main) {
    try {
        val city = getNearestCity(39.9042, 116.4074)
        println("最近的城市: ${city.name}, 距离: ${"%.2f".format(city.distance_km)} 公里")
    } catch (e: Exception) {
        println("查询失败: ${e.message}")
    }
}
```

---

### 2. 查询附近城市列表

根据给定的经纬度坐标，返回附近的城市列表，按距离排序。

#### **接口地址**
```
GET /api/v1/location/nearby-cities
```

#### **请求参数**

| 参数名 | 类型 | 必填 | 范围/默认值 | 说明 |
|--------|------|------|-------------|------|
| latitude | float | 是 | -90 ~ 90 | 纬度 |
| longitude | float | 是 | -180 ~ 180 | 经度 |
| limit | int | 否 | 1 ~ 100，默认10 | 返回结果数量 |
| max_distance_km | float | 否 | >= 0，默认不限制 | 最大距离（公里） |

#### **响应格式**

**成功响应 (200)**
```json
[
  {
    "id": 1780,
    "geoname_id": 1816670,
    "name": "Beijing",
    "ascii_name": "Beijing",
    "latitude": 39.9075,
    "longitude": 116.39723,
    "country_code": "CN",
    "population": 18960744,
    "distance_km": 0.9418911361326326
  },
  {
    "id": 1356,
    "geoname_id": 1807544,
    "name": "Daxing",
    "ascii_name": "Daxing",
    "latitude": 39.74025,
    "longitude": 116.32693,
    "country_code": "CN",
    "population": 104904,
    "distance_km": 19.48266098603126
  }
]
```

**空结果**：返回空数组 `[]`

#### **请求示例**

**cURL**
```bash
# 查询附近5个城市
curl "http://123.57.68.4:8000/api/v1/location/nearby-cities?latitude=39.9042&longitude=116.4074&limit=5"

# 查询50公里内的城市
curl "http://123.57.68.4:8000/api/v1/location/nearby-cities?latitude=39.9042&longitude=116.4074&limit=10&max_distance_km=50"
```

**JavaScript/TypeScript**
```javascript
async function getNearbyCities(latitude, longitude, limit = 10, maxDistanceKm = null) {
  let url = `http://123.57.68.4:8000/api/v1/location/nearby-cities?latitude=${latitude}&longitude=${longitude}&limit=${limit}`;
  
  if (maxDistanceKm !== null) {
    url += `&max_distance_km=${maxDistanceKm}`;
  }
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const cities = await response.json();
    console.log(`找到 ${cities.length} 个城市`);
    return cities;
  } catch (error) {
    console.error('查询失败:', error);
    throw error;
  }
}

// 使用示例1：查询附近5个城市
getNearbyCities(39.9042, 116.4074, 5)
  .then(cities => {
    cities.forEach((city, index) => {
      console.log(`${index + 1}. ${city.name} - ${city.distance_km.toFixed(2)} km`);
    });
  });

// 使用示例2：查询50公里内的城市
getNearbyCities(39.9042, 116.4074, 20, 50)
  .then(cities => {
    console.log('50公里内的城市:', cities);
  });
```

**Swift (iOS)**
```swift
func getNearbyCities(
    latitude: Double,
    longitude: Double,
    limit: Int = 10,
    maxDistanceKm: Double? = nil,
    completion: @escaping (Result<[CityInfo], Error>) -> Void
) {
    var urlString = "http://123.57.68.4:8000/api/v1/location/nearby-cities?latitude=\(latitude)&longitude=\(longitude)&limit=\(limit)"
    
    if let maxDistance = maxDistanceKm {
        urlString += "&max_distance_km=\(maxDistance)"
    }
    
    guard let url = URL(string: urlString) else {
        completion(.failure(NSError(domain: "Invalid URL", code: -1)))
        return
    }
    
    let task = URLSession.shared.dataTask(with: url) { data, response, error in
        if let error = error {
            completion(.failure(error))
            return
        }
        
        guard let data = data else {
            completion(.failure(NSError(domain: "No data", code: -1)))
            return
        }
        
        do {
            let decoder = JSONDecoder()
            let cities = try decoder.decode([CityInfo].self, from: data)
            completion(.success(cities))
        } catch {
            completion(.failure(error))
        }
    }
    
    task.resume()
}

// 使用示例
getNearbyCities(latitude: 39.9042, longitude: 116.4074, limit: 5) { result in
    switch result {
    case .success(let cities):
        print("找到 \(cities.count) 个城市:")
        for (index, city) in cities.enumerated() {
            print("\(index + 1). \(city.name) - \(String(format: "%.2f", city.distance_km)) km")
        }
    case .failure(let error):
        print("查询失败: \(error)")
    }
}
```

**Kotlin (Android)**
```kotlin
suspend fun getNearbyCities(
    latitude: Double,
    longitude: Double,
    limit: Int = 10,
    maxDistanceKm: Double? = null
): List<CityInfo> = withContext(Dispatchers.IO) {
    var urlString = "http://123.57.68.4:8000/api/v1/location/nearby-cities?latitude=$latitude&longitude=$longitude&limit=$limit"
    
    if (maxDistanceKm != null) {
        urlString += "&max_distance_km=$maxDistanceKm"
    }
    
    val response = URL(urlString).readText()
    val jsonArray = org.json.JSONArray(response)
    
    val cities = mutableListOf<CityInfo>()
    for (i in 0 until jsonArray.length()) {
        val json = jsonArray.getJSONObject(i)
        cities.add(
            CityInfo(
                id = json.getInt("id"),
                geoname_id = json.getInt("geoname_id"),
                name = json.getString("name"),
                ascii_name = json.optString("ascii_name"),
                latitude = json.getDouble("latitude"),
                longitude = json.getDouble("longitude"),
                country_code = json.getString("country_code"),
                population = json.getInt("population"),
                distance_km = json.getDouble("distance_km")
            )
        )
    }
    
    cities
}

// 使用示例
GlobalScope.launch(Dispatchers.Main) {
    try {
        val cities = getNearbyCities(39.9042, 116.4074, limit = 5)
        println("找到 ${cities.size} 个城市:")
        cities.forEachIndexed { index, city ->
            println("${index + 1}. ${city.name} - ${"%.2f".format(city.distance_km)} km")
        }
    } catch (e: Exception) {
        println("查询失败: ${e.message}")
    }
}
```

---

## 🌍 常用城市坐标参考

| 城市 | 纬度 (Latitude) | 经度 (Longitude) |
|------|----------------|------------------|
| 北京 | 39.9042 | 116.4074 |
| 上海 | 31.2304 | 121.4737 |
| 广州 | 23.1291 | 113.2644 |
| 深圳 | 22.5431 | 114.0579 |
| 成都 | 30.5728 | 104.0668 |
| 武汉 | 30.5872 | 114.2881 |
| 杭州 | 30.2741 | 120.1551 |
| 西安 | 34.3416 | 108.9398 |
| 重庆 | 29.5630 | 106.5516 |
| 南京 | 32.0603 | 118.7969 |

---

## 🎯 使用场景

### 1. 照片地理标记
根据照片的GPS信息，自动标注拍摄城市：
```javascript
// 从照片EXIF信息获取经纬度
const photoLatitude = 39.9042;
const photoLongitude = 116.4074;

// 查询拍摄城市
const city = await getNearestCity(photoLatitude, photoLongitude);
console.log(`拍摄地点: ${city.name}`);
```

### 2. 附近城市推荐
根据用户当前位置，推荐附近的旅游城市：
```javascript
// 获取用户位置
navigator.geolocation.getCurrentPosition(async (position) => {
  const { latitude, longitude } = position.coords;
  
  // 查询100公里内的城市
  const cities = await getNearbyCities(latitude, longitude, 10, 100);
  
  cities.forEach(city => {
    console.log(`${city.name} - ${city.distance_km.toFixed(0)}公里`);
  });
});
```

### 3. 位置验证
验证用户填写的城市与GPS位置是否匹配：
```javascript
async function validateLocation(userInputCity, latitude, longitude) {
  const nearestCity = await getNearestCity(latitude, longitude);
  
  if (nearestCity.name.includes(userInputCity) || nearestCity.ascii_name.includes(userInputCity)) {
    return { valid: true, distance: nearestCity.distance_km };
  } else {
    return { 
      valid: false, 
      actualCity: nearestCity.name,
      distance: nearestCity.distance_km 
    };
  }
}
```

---

## ⚡ 性能与限制

### 性能特点
- **响应时间**: 通常 < 100ms
- **并发支持**: 支持高并发查询
- **数据缓存**: 城市数据在内存中，查询速度快

### 距离计算
- 使用 MySQL 的 `ST_Distance_Sphere()` 函数
- 基于球面距离公式（Haversine）
- 精度：米级

### 使用限制
- 当前仅包含中国地区数据（约3400+城市）
- 仅返回人口 > 0 的城市
- 单次查询最多返回100个结果

---

## 🔐 安全建议

### 1. HTTPS 部署
生产环境建议使用 HTTPS：
```javascript
const API_BASE_URL = 'https://your-domain.com';
```

### 2. 错误处理
始终处理网络错误和异常：
```javascript
async function safeGetNearestCity(lat, lng) {
  try {
    return await getNearestCity(lat, lng);
  } catch (error) {
    console.error('查询失败:', error);
    // 返回默认值或缓存数据
    return null;
  }
}
```

### 3. 超时控制
设置合理的超时时间：
```javascript
async function getNearestCityWithTimeout(lat, lng, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
```

---

## 📊 数据格式说明

### 城市名称
- **name**: 可能是中文或英文，取决于GeoNames数据库
- **ascii_name**: ASCII格式的名称，通常是拼音或英文

### 坐标精度
- 纬度/经度保留到小数点后7位
- 距离保留到米级精度

### 人口数据
- 来源于GeoNames数据库
- 可能不是最新数据，仅供参考

---

## 🐛 常见问题

### Q1: 返回的城市名称是英文的？
**A**: GeoNames数据库中部分城市使用英文或拼音。如需中文名称，可建立一个映射表。

### Q2: 查询不到我的位置？
**A**: 可能原因：
- 该位置没有人口数据的城市
- 坐标参数超出范围（-90~90, -180~180）
- 当前仅支持中国地区数据

### Q3: 距离计算准确吗？
**A**: 使用球面距离公式，精度在米级。对于超远距离可能有误差，但对于城市级别查询足够准确。

### Q4: 如何获取照片的GPS信息？
**A**: 移动端示例：

**iOS (Swift)**
```swift
import Photos

func getPhotoLocation(asset: PHAsset) -> CLLocationCoordinate2D? {
    return asset.location?.coordinate
}
```

**Android (Kotlin)**
```kotlin
import androidx.exifinterface.media.ExifInterface

fun getPhotoLocation(imagePath: String): Pair<Double, Double>? {
    val exif = ExifInterface(imagePath)
    val latLong = exif.latLong
    return latLong?.let { Pair(it[0], it[1]) }
}
```

---

## 📞 技术支持

如有问题，请联系技术团队或查看：
- API在线文档: http://123.57.68.4:8000/docs
- 管理后台: http://123.57.68.4:8000

---

**最后更新**: 2025-10-10
**文档版本**: v1.0

