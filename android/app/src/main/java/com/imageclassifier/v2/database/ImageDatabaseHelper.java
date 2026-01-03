package com.imageclassifier.v2.database;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.util.Log;

/**
 * 图片数据库操作助手类
 * 对应JS层的ImageStorageService SQLite部分
 * 负责数据库的创建、升级和连接管理
 */
public class ImageDatabaseHelper extends SQLiteOpenHelper {
    private static final String TAG = "ImageDatabaseHelper";
    private static final String DATABASE_NAME = "ImageClassifier.db";
    private static final int DATABASE_VERSION = 2; // 🔥 升级版本号，添加拍摄参数字段
    
    private static ImageDatabaseHelper instance;
    private SQLiteDatabase database;
    
    /**
     * 单例模式获取实例
     */
    public static synchronized ImageDatabaseHelper getInstance(Context context) {
        if (instance == null) {
            instance = new ImageDatabaseHelper(context.getApplicationContext());
        }
        return instance;
    }
    
    private ImageDatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
    }
    
    @Override
    public void onCreate(SQLiteDatabase db) {
        createTables(db);
        Log.d(TAG, "数据库表创建完成");
    }
    
    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // 数据库升级逻辑
        Log.d(TAG, "数据库升级: " + oldVersion + " -> " + newVersion);
        
        // 版本2：添加拍摄参数字段
        if (oldVersion < 2) {
            try {
                db.execSQL("ALTER TABLE images ADD COLUMN cameraSettings TEXT");
                db.execSQL("ALTER TABLE images ADD COLUMN isoCategory TEXT");
                db.execSQL("ALTER TABLE images ADD COLUMN apertureCategory TEXT");
                db.execSQL("ALTER TABLE images ADD COLUMN shutterCategory TEXT");
                db.execSQL("ALTER TABLE images ADD COLUMN focalLengthCategory TEXT");
                Log.d(TAG, "数据库升级完成：添加拍摄参数字段");
            } catch (Exception e) {
                Log.e(TAG, "数据库升级失败", e);
            }
        }
    }
    
    /**
     * 创建表结构
     */
    private void createTables(SQLiteDatabase db) {
        // 图片表
        db.execSQL("CREATE TABLE IF NOT EXISTS images (" +
            "id TEXT PRIMARY KEY, " +
            "uri TEXT NOT NULL UNIQUE, " +
            "fileName TEXT NOT NULL, " +
            "category TEXT, " +
            "confidence REAL, " +
            "timestamp INTEGER, " +
            "takenAt INTEGER, " +
            "size INTEGER, " +
            "mimeType TEXT, " +
            "width INTEGER, " +
            "height INTEGER, " +
            "createdAt TEXT, " +
            "updatedAt TEXT, " +
            "latitude REAL, " +
            "longitude REAL, " +
            "altitude REAL, " +
            "accuracy REAL, " +
            "address TEXT, " +
            "city TEXT, " +
            "country TEXT, " +
            "province TEXT, " +
            "district TEXT, " +
            "street TEXT, " +
            "locationSource TEXT, " +
            "cityDistance REAL, " +
            "idCardDetections TEXT, " +
            "generalDetections TEXT, " +
            "mobileNetV3Detections TEXT, " +
            "imageDimensions TEXT, " +
            "message TEXT, " +
            "cameraSettings TEXT, " +
            "isoCategory TEXT, " +
            "apertureCategory TEXT, " +
            "shutterCategory TEXT, " +
            "focalLengthCategory TEXT" +
            ")");
        
        // 索引
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_category ON images(category)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_city ON images(city)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_timestamp ON images(timestamp DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_takenAt ON images(takenAt DESC)");
        
        // 设置表
        db.execSQL("CREATE TABLE IF NOT EXISTS settings (" +
            "key TEXT PRIMARY KEY, " +
            "value TEXT" +
            ")");
        
        // 相似度数据表
        db.execSQL("CREATE TABLE IF NOT EXISTS similarity_data (" +
            "imageId TEXT PRIMARY KEY, " +
            "similarity_group_id TEXT, " +
            "similarity_group_type TEXT, " +
            "similarity_score REAL, " +
            "is_similarity_processed INTEGER DEFAULT 0, " +
            "updatedAt TEXT, " +
            "FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE" +
            ")");
        
        // 相似组索引表
        db.execSQL("CREATE TABLE IF NOT EXISTS similarity_group_index (" +
            "groupId TEXT PRIMARY KEY, " +
            "imageIds TEXT, " +
            "created_at TEXT" +
            ")");
    }
    
    /**
     * 获取数据库实例（线程安全）
     * 启用WAL模式支持并发读取
     */
    public synchronized SQLiteDatabase getDatabase() {
        if (database == null || !database.isOpen()) {
            database = getWritableDatabase();
            // 启用WAL模式，支持并发读取
            database.enableWriteAheadLogging();
        }
        return database;
    }
    
    /**
     * 关闭数据库连接
     */
    public synchronized void closeDatabase() {
        if (database != null && database.isOpen()) {
            database.close();
            database = null;
        }
    }
}




