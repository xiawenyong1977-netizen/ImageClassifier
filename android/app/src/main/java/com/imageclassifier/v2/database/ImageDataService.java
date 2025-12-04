package com.imageclassifier.v2.database;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * 图片数据服务
 * 提供与JS层ImageStorageService对应的数据库操作方法
 * 对应JS层的ImageStorageService SQLite部分
 */
public class ImageDataService {
    private static final String TAG = "ImageDataService";
    private ImageDatabaseHelper dbHelper;
    private SimpleDateFormat dateFormat;
    
    public ImageDataService(Context context) {
        this.dbHelper = ImageDatabaseHelper.getInstance(context);
        // ISO 8601日期格式
        this.dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        this.dateFormat.setTimeZone(TimeZone.getTimeZone("UTC"));
    }
    
    // ==================== 写入操作 ====================
    
    /**
     * 批量写入/更新图片详细信息
     * 对应JS层的 writeImageDetailedInfo
     * 
     * @param imageDataList 图片数据列表
     * @return 写入结果 { success: boolean, insertedCount: int, updatedCount: int }
     */
    public Map<String, Object> writeImageDetailedInfo(List<Map<String, Object>> imageDataList) {
        if (imageDataList == null || imageDataList.isEmpty()) {
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("insertedCount", 0);
            result.put("updatedCount", 0);
            return result;
        }
        
        // 添加重试机制，处理数据库锁定问题
        int maxRetries = 3;
        int retryDelay = 200; // 毫秒（增加延迟，给其他连接更多时间释放）
        
        SQLiteDatabase db = null;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            // 每次重试都获取新的数据库连接，确保连接状态正确
            db = dbHelper.getDatabase();
            int insertedCount = 0;
            int updatedCount = 0;
            
            try {
                db.beginTransaction();
                
                for (Map<String, Object> imageData : imageDataList) {
                    try {
                        ContentValues values = new ContentValues();
                        
                        // 生成ID
                        String id = (String) imageData.get("id");
                        if (id == null || id.isEmpty()) {
                            String uri = (String) imageData.get("uri");
                            if (uri == null || uri.isEmpty()) {
                                Log.w(TAG, "跳过无效数据：缺少uri");
                                continue;
                            }
                            id = generateStableId(uri);
                        }
                        values.put("id", id);
                        
                        // 必需字段
                        String uri = (String) imageData.get("uri");
                        if (uri == null || uri.isEmpty()) {
                            Log.w(TAG, "跳过无效数据：uri为空, id=" + id);
                            continue;
                        }
                        values.put("uri", uri);
                        values.put("fileName", getStringValue(imageData, "fileName", ""));
                        
                        // 基础字段
                        putStringIfNotNull(values, "category", imageData.get("category"));
                        putDoubleIfNotNull(values, "confidence", imageData.get("confidence"));
                        putLongIfNotNull(values, "timestamp", imageData.get("timestamp"));
                        putLongIfNotNull(values, "takenAt", imageData.get("takenAt"));
                        putLongIfNotNull(values, "size", imageData.get("size"));
                        putStringIfNotNull(values, "mimeType", imageData.get("mimeType"));
                        putIntIfNotNull(values, "width", imageData.get("width"));
                        putIntIfNotNull(values, "height", imageData.get("height"));
                        
                        // GPS信息
                        putDoubleIfNotNull(values, "latitude", imageData.get("latitude"));
                        putDoubleIfNotNull(values, "longitude", imageData.get("longitude"));
                        putDoubleIfNotNull(values, "altitude", imageData.get("altitude"));
                        putDoubleIfNotNull(values, "accuracy", imageData.get("accuracy"));
                        
                        // 地址信息
                        putStringIfNotNull(values, "address", imageData.get("address"));
                        putStringIfNotNull(values, "city", imageData.get("city"));
                        putStringIfNotNull(values, "country", imageData.get("country"));
                        putStringIfNotNull(values, "province", imageData.get("province"));
                        putStringIfNotNull(values, "district", imageData.get("district"));
                        putStringIfNotNull(values, "street", imageData.get("street"));
                        putStringIfNotNull(values, "locationSource", imageData.get("locationSource"));
                        putDoubleIfNotNull(values, "cityDistance", imageData.get("cityDistance"));
                        
                        // JSON字段（序列化）
                        if (imageData.get("idCardDetections") != null) {
                            values.put("idCardDetections", jsonToString(imageData.get("idCardDetections")));
                        }
                        if (imageData.get("generalDetections") != null) {
                            values.put("generalDetections", jsonToString(imageData.get("generalDetections")));
                        }
                        if (imageData.get("mobileNetV3Detections") != null) {
                            values.put("mobileNetV3Detections", jsonToString(imageData.get("mobileNetV3Detections")));
                        }
                        if (imageData.get("imageDimensions") != null) {
                            values.put("imageDimensions", jsonToString(imageData.get("imageDimensions")));
                        }
                        putStringIfNotNull(values, "message", imageData.get("message"));
                        
                        // 时间戳
                        String now = dateFormat.format(new Date());
                        String createdAt = getStringValue(imageData, "createdAt", null);
                        boolean exists = false;
                        
                        if (createdAt == null) {
                            // 检查是否已存在（合并查询，减少事务内的查询次数）
                            Cursor cursor = db.query("images", new String[]{"createdAt"}, 
                                "id = ?", new String[]{id}, null, null, null);
                            if (cursor.moveToFirst()) {
                                exists = true;
                                createdAt = cursor.getString(0);
                            } else {
                                exists = false;
                                createdAt = now;
                            }
                            cursor.close();
                        } else {
                            // 如果提供了 createdAt，仍然需要检查是否存在（用于统计）
                            Cursor checkCursor = db.query("images", new String[]{"createdAt"}, 
                                "id = ?", new String[]{id}, null, null, null);
                            exists = checkCursor.moveToFirst();
                            checkCursor.close();
                        }
                        
                        values.put("createdAt", createdAt);
                        values.put("updatedAt", now);
                        
                        // INSERT OR REPLACE
                        long result = db.insertWithOnConflict("images", null, values, 
                            SQLiteDatabase.CONFLICT_REPLACE);
                        
                        if (result == -1) {
                            Log.w(TAG, "插入失败: " + id);
                        } else {
                            if (exists) {
                                updatedCount++;
                            } else {
                                insertedCount++;
                            }
                        }
                        
                    } catch (Exception e) {
                        Log.e(TAG, "处理单条数据失败: " + imageData.get("uri"), e);
                    }
                }
                
                db.setTransactionSuccessful();
                db.endTransaction();
                
                // 成功，返回结果
                Map<String, Object> result = new HashMap<>();
                result.put("success", true);
                result.put("insertedCount", insertedCount);
                result.put("updatedCount", updatedCount);
                return result;
                
            } catch (android.database.sqlite.SQLiteDatabaseLockedException e) {
                // 数据库锁定，需要重试
                try {
                    if (db != null && db.inTransaction()) {
                        db.endTransaction();
                    }
                } catch (Exception ex) {
                    Log.e(TAG, "结束事务失败", ex);
                }
                
                // 释放数据库连接，让其他操作有机会获取
                db = null;
                
                if (attempt < maxRetries - 1) {
                    try {
                        // 递增延迟：200ms, 400ms, 600ms
                        int delay = retryDelay * (attempt + 1);
                        Log.w(TAG, "批量写入失败（数据库锁定），等待 " + delay + "ms 后重试 " + (attempt + 2) + "/" + maxRetries);
                        Thread.sleep(delay);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        Log.e(TAG, "批量写入重试被中断", ie);
                        Map<String, Object> result = new HashMap<>();
                        result.put("success", false);
                        result.put("insertedCount", 0);
                        result.put("updatedCount", 0);
                        result.put("error", "重试被中断");
                        return result;
                    }
                } else {
                    Log.e(TAG, "批量写入失败（数据库锁定，已重试" + maxRetries + "次）", e);
                    Map<String, Object> result = new HashMap<>();
                    result.put("success", false);
                    result.put("insertedCount", 0);
                    result.put("updatedCount", 0);
                    result.put("error", "数据库锁定，重试失败: " + e.getMessage());
                    return result;
                }
            } catch (Exception e) {
                // 其他异常，不重试
                try {
                    if (db.inTransaction()) {
                        db.endTransaction();
                    }
                } catch (Exception ex) {
                    Log.e(TAG, "结束事务失败", ex);
                }
                Log.e(TAG, "批量写入失败", e);
                Map<String, Object> result = new HashMap<>();
                result.put("success", false);
                result.put("insertedCount", 0);
                result.put("updatedCount", 0);
                result.put("error", e.getMessage());
                return result;
            }
        }
        
        // 理论上不会到达这里
        Map<String, Object> result = new HashMap<>();
        result.put("success", false);
        result.put("insertedCount", 0);
        result.put("updatedCount", 0);
        result.put("error", "未知错误");
        return result;
    }
    
    /**
     * 批量更新分类信息（只更新分类相关字段）
     * 对应JS层的 batchUpdateClassification
     * 
     * @param classificationDataList 分类数据列表
     * @return 更新结果 { success: boolean, updatedCount: int, failedCount: int }
     */
    public Map<String, Object> batchUpdateClassification(
            List<Map<String, Object>> classificationDataList) {
        if (classificationDataList == null || classificationDataList.isEmpty()) {
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("updatedCount", 0);
            result.put("failedCount", 0);
            return result;
        }
        
        SQLiteDatabase db = dbHelper.getDatabase();
        int updatedCount = 0;
        int failedCount = 0;
        
        // 重试机制：最多重试3次，处理数据库锁定
        int maxRetries = 3;
        int retryDelayMs = 50; // 每次重试延迟50ms
        
        for (int retry = 0; retry < maxRetries; retry++) {
            boolean transactionStarted = false;
            
            try {
                // 尝试开始事务
                db.beginTransaction();
                transactionStarted = true;
                
                for (Map<String, Object> classificationData : classificationDataList) {
                    try {
                        String uri = (String) classificationData.get("uri");
                        if (uri == null || uri.isEmpty()) {
                            failedCount++;
                            continue;
                        }
                        
                        String id = (String) classificationData.get("id");
                        // 如果ID为空，或者是MediaStore ID（纯数字），则使用URI生成正确的ID
                        if (id == null || id.isEmpty() || id.matches("^\\d+$")) {
                            // MediaStore ID是纯数字，但数据库使用基于URI的哈希ID
                            // 所以忽略MediaStore ID，使用URI生成正确的ID
                            id = generateStableId(uri);
                        }
                        
                        ContentValues values = new ContentValues();
                        
                        // 分类字段（必需）
                        String category = (String) classificationData.get("category");
                        if (category == null || category.isEmpty()) {
                            failedCount++;
                            continue;
                        }
                        values.put("category", category);
                        
                        // 可选字段
                        if (classificationData.get("confidence") != null) {
                            values.put("confidence", getDoubleValue(classificationData.get("confidence")));
                        }
                        if (classificationData.get("idCardDetections") != null) {
                            values.put("idCardDetections", jsonToString(classificationData.get("idCardDetections")));
                        }
                        if (classificationData.get("generalDetections") != null) {
                            values.put("generalDetections", jsonToString(classificationData.get("generalDetections")));
                        }
                        if (classificationData.get("mobileNetV3Detections") != null) {
                            values.put("mobileNetV3Detections", jsonToString(classificationData.get("mobileNetV3Detections")));
                        }
                        if (classificationData.get("message") != null) {
                            values.put("message", classificationData.get("message").toString());
                        }
                        // 保存背景颜色字段（跳过 null 和 "null" 字符串）
                        Object backgroundColorObj = classificationData.get("background_color");
                        if (backgroundColorObj != null) {
                            String backgroundColor = backgroundColorObj.toString();
                            // 只有当背景颜色不为空且不是 "null" 字符串时才保存
                            if (backgroundColor != null && !backgroundColor.isEmpty() && !backgroundColor.equals("null")) {
                                values.put("background_color", backgroundColor);
                            }
                            // 如果为 null 或 "null"，不更新数据库，保持原有值
                        }
                        
                        values.put("updatedAt", dateFormat.format(new Date()));
                        
                        int rowsAffected = db.update("images", values, "id = ?", new String[]{id});
                        
                        if (rowsAffected > 0) {
                            updatedCount++;
                        } else {
                            failedCount++;
                            Log.e(TAG, "更新失败，未找到图片: id=" + id + ", uri=" + uri);
                            // 不降级，直接报错，避免在其他地方出错
                        }
                        
                    } catch (Exception e) {
                        Log.e(TAG, "更新单条分类数据失败", e);
                        failedCount++;
                    }
                }
                
                // 标记事务成功
                db.setTransactionSuccessful();
                
                // 成功执行，退出重试循环
                break;
                
            } catch (android.database.sqlite.SQLiteDatabaseLockedException e) {
                // 数据库锁定异常，需要重试
                Log.w(TAG, "数据库锁定，重试 " + (retry + 1) + "/" + maxRetries + ": " + e.getMessage());
                
                // 确保在重试前结束事务（如果已开始）
                if (transactionStarted) {
                    try {
                        if (db.inTransaction()) {
                            db.endTransaction();
                        }
                    } catch (Exception ex) {
                        // 忽略结束事务时的异常
                        Log.w(TAG, "结束事务时出错（可忽略）: " + ex.getMessage());
                    }
                    transactionStarted = false;
                }
                
                // 如果不是最后一次重试，等待后继续
                if (retry < maxRetries - 1) {
                    try {
                        Thread.sleep(retryDelayMs * (retry + 1)); // 递增延迟
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                } else {
                    // 最后一次重试失败
                    Log.e(TAG, "批量更新分类失败：数据库锁定，已重试 " + maxRetries + " 次", e);
                    Map<String, Object> result = new HashMap<>();
                    result.put("success", false);
                    result.put("updatedCount", 0);
                    result.put("failedCount", classificationDataList.size());
                    result.put("error", "数据库锁定，重试失败: " + e.getMessage());
                    return result;
                }
                
            } catch (Exception e) {
                // 其他异常，不重试
                Log.e(TAG, "批量更新分类失败", e);
                
                // 确保结束事务（如果已开始）
                if (transactionStarted) {
                    try {
                        if (db.inTransaction()) {
                            db.endTransaction();
                        }
                    } catch (Exception ex) {
                        // 忽略结束事务时的异常
                        Log.w(TAG, "结束事务时出错（可忽略）: " + ex.getMessage());
                    }
                }
                
                Map<String, Object> result = new HashMap<>();
                result.put("success", false);
                result.put("updatedCount", 0);
                result.put("failedCount", classificationDataList.size());
                result.put("error", e.getMessage());
                return result;
            } finally {
                // 确保结束事务（如果已开始且未在catch中处理）
                if (transactionStarted) {
                    try {
                        if (db.inTransaction()) {
                            db.endTransaction();
                        }
                    } catch (Exception e) {
                        // 忽略结束事务时的异常（可能已经在catch中处理过）
                        Log.w(TAG, "结束事务时出错（可忽略）: " + e.getMessage());
                    }
                }
            }
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("updatedCount", updatedCount);
        result.put("failedCount", failedCount);
        return result;
    }
    
    /**
     * 根据URI删除图片
     * 对应JS层的 removeImagesByUris
     * 
     * @param uris URI列表
     * @return 删除结果 { success: boolean, deletedCount: int }
     */
    public Map<String, Object> removeImagesByUris(List<String> uris) {
        if (uris == null || uris.isEmpty()) {
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("deletedCount", 0);
            return result;
        }
        
        SQLiteDatabase db = dbHelper.getDatabase();
        int deletedCount = 0;
        
        try {
            db.beginTransaction();
            
            for (String uri : uris) {
                if (uri == null || uri.isEmpty()) {
                    continue;
                }
                
                String id = generateStableId(uri);
                int rowsAffected = db.delete("images", "id = ?", new String[]{id});
                if (rowsAffected > 0) {
                    deletedCount++;
                }
            }
            
            db.setTransactionSuccessful();
            
        } catch (Exception e) {
            Log.e(TAG, "批量删除失败", e);
            Map<String, Object> result = new HashMap<>();
            result.put("success", false);
            result.put("deletedCount", 0);
            result.put("error", e.getMessage());
            return result;
        } finally {
            db.endTransaction();
        }
        
        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("deletedCount", deletedCount);
        return result;
    }
    
    // ==================== 读取操作 ====================
    
    /**
     * 获取所有图片
     * 对应JS层的 getImages
     * 
     * @return 图片列表
     */
    public List<Map<String, Object>> getImages() {
        SQLiteDatabase db = dbHelper.getDatabase();
        List<Map<String, Object>> images = new ArrayList<>();
        
        Cursor cursor = db.query("images", null, null, null, null, null, 
            "timestamp DESC");
        
        try {
            while (cursor.moveToNext()) {
                Map<String, Object> image = cursorToImageMap(cursor);
                images.add(image);
            }
        } finally {
            cursor.close();
        }
        
        return images;
    }
    
    /**
     * 根据ID列表获取图片
     * 对应JS层的 getImagesByIds
     * 
     * @param imageIds ID列表
     * @return Map<id, imageData>
     */
    public Map<String, Map<String, Object>> getImagesByIds(List<String> imageIds) {
        SQLiteDatabase db = dbHelper.getDatabase();
        Map<String, Map<String, Object>> resultMap = new HashMap<>();
        
        if (imageIds == null || imageIds.isEmpty()) {
            return resultMap;
        }
        
        // 构建IN查询
        StringBuilder placeholders = new StringBuilder();
        for (int i = 0; i < imageIds.size(); i++) {
            if (i > 0) placeholders.append(",");
            placeholders.append("?");
        }
        
        String sql = "SELECT * FROM images WHERE id IN (" + placeholders.toString() + ")";
        Cursor cursor = db.rawQuery(sql, imageIds.toArray(new String[0]));
        
        try {
            while (cursor.moveToNext()) {
                Map<String, Object> image = cursorToImageMap(cursor);
                resultMap.put((String) image.get("id"), image);
            }
        } finally {
            cursor.close();
        }
        
        return resultMap;
    }
    
    /**
     * 根据分类获取图片
     * 对应JS层的 getImagesByCategory
     * 
     * @param category 分类ID
     * @return 图片列表
     */
    public List<Map<String, Object>> getImagesByCategory(String category) {
        SQLiteDatabase db = dbHelper.getDatabase();
        List<Map<String, Object>> images = new ArrayList<>();
        
        if (category == null || category.isEmpty()) {
            return images;
        }
        
        Cursor cursor = db.query("images", null, "category = ?", 
            new String[]{category}, null, null, "timestamp DESC");
        
        try {
            while (cursor.moveToNext()) {
                Map<String, Object> image = cursorToImageMap(cursor);
                images.add(image);
            }
        } finally {
            cursor.close();
        }
        
        return images;
    }
    
    /**
     * 获取所有图片URI
     * 对应JS层的 getImageUris
     * 
     * @return URI列表
     */
    public List<String> getImageUris() {
        SQLiteDatabase db = dbHelper.getDatabase();
        List<String> uris = new ArrayList<>();
        
        Cursor cursor = db.query("images", new String[]{"uri"}, null, null, null, null, null);
        
        try {
            while (cursor.moveToNext()) {
                uris.add(cursor.getString(0));
            }
        } finally {
            cursor.close();
        }
        
        return uris;
    }
    
    /**
     * 获取设置值
     * 对应JS层的 getSetting
     * 
     * @param key 设置键
     * @return 设置值（如果不存在返回null）
     */
    public String getSetting(String key) {
        if (key == null || key.isEmpty()) {
            return null;
        }
        
        SQLiteDatabase db = dbHelper.getDatabase();
        Cursor cursor = db.query("settings", new String[]{"value"}, "key = ?", 
            new String[]{key}, null, null, null);
        
        try {
            if (cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } finally {
            cursor.close();
        }
        
        return null;
    }
    
    /**
     * 更新设置值
     * 对应JS层的 updateSetting
     * 
     * @param key 设置键
     * @param value 设置值
     */
    public void updateSetting(String key, String value) {
        if (key == null || key.isEmpty()) {
            return;
        }
        
        SQLiteDatabase db = dbHelper.getDatabase();
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("value", value != null ? value : "");
        
        // 添加重试机制，处理数据库锁定问题
        int maxRetries = 3;
        int retryDelay = 100; // 毫秒
        
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                db.beginTransaction();
                
                int rowsAffected = db.update("settings", values, "key = ?", new String[]{key});
                
                if (rowsAffected == 0) {
                    // 如果不存在，则插入
                    db.insert("settings", null, values);
                }
                
                db.setTransactionSuccessful();
                db.endTransaction();
                return; // 成功，退出重试循环
                
            } catch (android.database.sqlite.SQLiteDatabaseLockedException e) {
                // 数据库锁定，需要重试
                try {
                    if (db.inTransaction()) {
                        db.endTransaction();
                    }
                } catch (Exception ex) {
                    // 忽略结束事务的异常
                }
                
                if (attempt < maxRetries - 1) {
                    try {
                        Thread.sleep(retryDelay * (attempt + 1)); // 递增延迟
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        Log.e(TAG, "更新设置重试被中断: " + key, ie);
                        return;
                    }
                    Log.w(TAG, "更新设置失败（数据库锁定），重试 " + (attempt + 1) + "/" + maxRetries + ": " + key);
                } else {
                    Log.e(TAG, "更新设置失败（数据库锁定，已重试" + maxRetries + "次）: " + key, e);
                }
            } catch (Exception e) {
                try {
                    if (db.inTransaction()) {
                        db.endTransaction();
                    }
                } catch (Exception ex) {
                    // 忽略结束事务的异常
                }
                Log.e(TAG, "更新设置失败: " + key, e);
                return; // 其他异常不重试
            }
        }
    }
    
    // ==================== 辅助方法 ====================
    
    /**
     * 将Cursor转换为Image Map
     */
    private Map<String, Object> cursorToImageMap(Cursor cursor) {
        Map<String, Object> image = new HashMap<>();
        
        // 基础字段
        int idIndex = cursor.getColumnIndex("id");
        int uriIndex = cursor.getColumnIndex("uri");
        int fileNameIndex = cursor.getColumnIndex("fileName");
        
        if (idIndex >= 0) {
            image.put("id", cursor.getString(idIndex));
        }
        if (uriIndex >= 0) {
            image.put("uri", cursor.getString(uriIndex));
        }
        if (fileNameIndex >= 0) {
            image.put("fileName", cursor.getString(fileNameIndex));
        }
        
        int categoryIndex = cursor.getColumnIndex("category");
        if (!cursor.isNull(categoryIndex)) {
            image.put("category", cursor.getString(categoryIndex));
        }
        
        // 数值字段
        putDoubleIfNotNull(image, "confidence", cursor, "confidence");
        putLongIfNotNull(image, "timestamp", cursor, "timestamp");
        putLongIfNotNull(image, "takenAt", cursor, "takenAt");
        putLongIfNotNull(image, "size", cursor, "size");
        putStringIfNotNull(image, "mimeType", cursor, "mimeType");
        putIntIfNotNull(image, "width", cursor, "width");
        putIntIfNotNull(image, "height", cursor, "height");
        putStringIfNotNull(image, "createdAt", cursor, "createdAt");
        putStringIfNotNull(image, "updatedAt", cursor, "updatedAt");
        
        // GPS信息
        putDoubleIfNotNull(image, "latitude", cursor, "latitude");
        putDoubleIfNotNull(image, "longitude", cursor, "longitude");
        putDoubleIfNotNull(image, "altitude", cursor, "altitude");
        putDoubleIfNotNull(image, "accuracy", cursor, "accuracy");
        
        // 地址信息
        putStringIfNotNull(image, "address", cursor, "address");
        putStringIfNotNull(image, "city", cursor, "city");
        putStringIfNotNull(image, "country", cursor, "country");
        putStringIfNotNull(image, "province", cursor, "province");
        putStringIfNotNull(image, "district", cursor, "district");
        putStringIfNotNull(image, "street", cursor, "street");
        putStringIfNotNull(image, "locationSource", cursor, "locationSource");
        putDoubleIfNotNull(image, "cityDistance", cursor, "cityDistance");
        
        // JSON字段（反序列化）
        int idCardIndex = cursor.getColumnIndex("idCardDetections");
        if (!cursor.isNull(idCardIndex)) {
            String idCardStr = cursor.getString(idCardIndex);
            if (idCardStr != null && !idCardStr.isEmpty()) {
                image.put("idCardDetections", stringToJson(idCardStr));
            }
        }
        
        int generalIndex = cursor.getColumnIndex("generalDetections");
        if (!cursor.isNull(generalIndex)) {
            String generalStr = cursor.getString(generalIndex);
            if (generalStr != null && !generalStr.isEmpty()) {
                image.put("generalDetections", stringToJson(generalStr));
            }
        }
        
        int mobileNetIndex = cursor.getColumnIndex("mobileNetV3Detections");
        if (!cursor.isNull(mobileNetIndex)) {
            String mobileNetStr = cursor.getString(mobileNetIndex);
            if (mobileNetStr != null && !mobileNetStr.isEmpty()) {
                image.put("mobileNetV3Detections", stringToJson(mobileNetStr));
            }
        }
        
        int dimensionsIndex = cursor.getColumnIndex("imageDimensions");
        if (!cursor.isNull(dimensionsIndex)) {
            String dimensionsStr = cursor.getString(dimensionsIndex);
            if (dimensionsStr != null && !dimensionsStr.isEmpty()) {
                image.put("imageDimensions", stringToJson(dimensionsStr));
            }
        }
        
        putStringIfNotNull(image, "message", cursor, "message");
        
        return image;
    }
    
    /**
     * 生成稳定的ID（基于URI的SHA-256哈希）
     * 与JS层保持一致
     */
    private String generateStableId(String uri) {
        if (uri == null || uri.isEmpty()) {
            return "";
        }
        
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(uri.getBytes("UTF-8"));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            Log.e(TAG, "生成ID失败", e);
            return String.valueOf(uri.hashCode());
        }
    }
    
    /**
     * JSON序列化
     */
    private String jsonToString(Object obj) {
        if (obj == null) return null;
        try {
            if (obj instanceof JSONArray || obj instanceof JSONObject) {
                return obj.toString();
            } else if (obj instanceof List) {
                return new JSONArray((List) obj).toString();
            } else if (obj instanceof Map) {
                return new JSONObject((Map) obj).toString();
            } else {
                return obj.toString();
            }
        } catch (Exception e) {
            Log.e(TAG, "JSON序列化失败", e);
            return null;
        }
    }
    
    /**
     * JSON反序列化
     */
    private Object stringToJson(String str) {
        if (str == null || str.isEmpty()) return null;
        try {
            String trimmed = str.trim();
            if (trimmed.startsWith("[")) {
                return new JSONArray(trimmed);
            } else if (trimmed.startsWith("{")) {
                return new JSONObject(trimmed);
            } else {
                return str;
            }
        } catch (Exception e) {
            Log.e(TAG, "JSON反序列化失败: " + str, e);
            return null;
        }
    }
    
    // ==================== 类型转换辅助方法 ====================
    
    private void putStringIfNotNull(ContentValues values, String key, Object value) {
        if (value != null) {
            values.put(key, value.toString());
        }
    }
    
    private void putStringIfNotNull(Map<String, Object> map, String key, Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index >= 0 && !cursor.isNull(index)) {
            map.put(key, cursor.getString(index));
        }
    }
    
    private void putIntIfNotNull(ContentValues values, String key, Object value) {
        if (value != null) {
            if (value instanceof Number) {
                values.put(key, ((Number) value).intValue());
            }
        }
    }
    
    private void putIntIfNotNull(Map<String, Object> map, String key, Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index >= 0 && !cursor.isNull(index)) {
            map.put(key, cursor.getInt(index));
        }
    }
    
    private void putLongIfNotNull(ContentValues values, String key, Object value) {
        if (value != null) {
            if (value instanceof Number) {
                values.put(key, ((Number) value).longValue());
            }
        }
    }
    
    private void putLongIfNotNull(Map<String, Object> map, String key, Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index >= 0 && !cursor.isNull(index)) {
            map.put(key, cursor.getLong(index));
        }
    }
    
    private void putDoubleIfNotNull(ContentValues values, String key, Object value) {
        if (value != null) {
            if (value instanceof Number) {
                values.put(key, ((Number) value).doubleValue());
            }
        }
    }
    
    private void putDoubleIfNotNull(Map<String, Object> map, String key, Cursor cursor, String columnName) {
        int index = cursor.getColumnIndex(columnName);
        if (index >= 0 && !cursor.isNull(index)) {
            map.put(key, cursor.getDouble(index));
        }
    }
    
    private String getStringValue(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        if (value == null) {
            return defaultValue;
        }
        return value.toString();
    }
    
    private double getDoubleValue(Object value) {
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return 0.0;
    }
}

