package com.imageclassifier.v2;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 与 JS 端 {@code ImageClassifier.db} / {@code person_data}、{@code person_group_index} 表结构一致，
 * 批量应用人物分组增量更新（避免整表 DELETE + 全量写回）。
 */
public final class PersonGroupingSqliteWriter {

    private static final String TAG = "PersonGroupingSqlite";
    private static final String DB_NAME = "ImageClassifier.db";

    private PersonGroupingSqliteWriter() {
    }

    private static String isoNowUtc() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(new Date());
    }

    private static SQLiteDatabase openDb(Context context) {
        File dbFile = context.getDatabasePath(DB_NAME);
        File parent = dbFile.getParentFile();
        if (parent != null && !parent.exists()) {
            //noinspection ResultOfMethodCallIgnored
            parent.mkdirs();
        }
        return SQLiteDatabase.openDatabase(
            dbFile.getAbsolutePath(),
            null,
            SQLiteDatabase.OPEN_READWRITE | SQLiteDatabase.CREATE_IF_NECESSARY
        );
    }

    public static void applyUpdates(Context context, ReadableArray items) throws Exception {
        if (items == null || items.size() == 0) {
            return;
        }
        SQLiteDatabase db = openDb(context);
        try {
            db.beginTransaction();
            for (int i = 0; i < items.size(); i++) {
                ReadableMap m = items.getMap(i);
                if (m == null) {
                    continue;
                }
                String imageId = readString(m, "imageId", "id");
                if (imageId == null || imageId.isEmpty()) {
                    continue;
                }
                String newGid = readString(m, "personGroupId", "person_group_id");
                double score = 0;
                if (m.hasKey("personScore") && !m.isNull("personScore")) {
                    score = m.getDouble("personScore");
                } else if (m.hasKey("person_score") && !m.isNull("person_score")) {
                    score = m.getDouble("person_score");
                }
                String source = readString(m, "personSource", "person_source");
                if (source == null || source.isEmpty()) {
                    source = "unknown";
                }
                applyOne(db, imageId, newGid, score, source);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
            db.close();
        }
    }

    private static String readString(ReadableMap m, String camel, String snake) {
        if (m.hasKey(camel) && !m.isNull(camel)) {
            return m.getString(camel);
        }
        if (snake != null && m.hasKey(snake) && !m.isNull(snake)) {
            return m.getString(snake);
        }
        return null;
    }

    private static void applyOne(SQLiteDatabase db, String imageId, String newGid, double personScore, String personSource) {
        String oldGid = null;
        Cursor c = db.rawQuery("SELECT person_group_id FROM person_data WHERE imageId=?", new String[]{imageId});
        try {
            if (c.moveToFirst() && !c.isNull(0)) {
                oldGid = c.getString(0);
            }
        } finally {
            c.close();
        }

        boolean clear = newGid == null || newGid.isEmpty();
        if (clear) {
            if (oldGid != null) {
                removeFromGroupIndex(db, oldGid, imageId);
            }
            db.delete("person_data", "imageId=?", new String[]{imageId});
            return;
        }

        if (oldGid != null && !oldGid.equals(newGid)) {
            removeFromGroupIndex(db, oldGid, imageId);
        }

        ContentValues cv = new ContentValues();
        cv.put("imageId", imageId);
        cv.put("person_group_id", newGid);
        cv.put("person_score", personScore);
        cv.put("person_source", personSource);
        cv.put("updatedAt", isoNowUtc());
        db.insertWithOnConflict("person_data", null, cv, SQLiteDatabase.CONFLICT_REPLACE);

        addToGroupIndex(db, newGid, imageId);
    }

    private static void removeFromGroupIndex(SQLiteDatabase db, String groupId, String imageId) {
        if (groupId == null || imageId == null) {
            return;
        }
        Cursor c = db.rawQuery("SELECT imageIds FROM person_group_index WHERE groupId=?", new String[]{groupId});
        try {
            if (!c.moveToFirst()) {
                return;
            }
            String json = c.getString(0);
            JSONArray arr;
            try {
                arr = new JSONArray(json);
            } catch (JSONException e) {
                Log.w(TAG, "removeFromGroupIndex bad json groupId=" + groupId, e);
                return;
            }
            JSONArray next = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                String id = arr.optString(i, null);
                if (id != null && !id.equals(imageId)) {
                    next.put(id);
                }
            }
            if (next.length() == 0) {
                db.delete("person_group_index", "groupId=?", new String[]{groupId});
            } else {
                ContentValues cv = new ContentValues();
                cv.put("imageIds", next.toString());
                db.update("person_group_index", cv, "groupId=?", new String[]{groupId});
            }
        } finally {
            c.close();
        }
    }

    private static void addToGroupIndex(SQLiteDatabase db, String groupId, String imageId) {
        JSONArray arr;
        Cursor c = db.rawQuery("SELECT imageIds FROM person_group_index WHERE groupId=?", new String[]{groupId});
        try {
            if (c.moveToFirst() && !c.isNull(0)) {
                try {
                    arr = new JSONArray(c.getString(0));
                } catch (JSONException e) {
                    Log.w(TAG, "addToGroupIndex reset bad json groupId=" + groupId, e);
                    arr = new JSONArray();
                }
            } else {
                arr = new JSONArray();
            }
        } finally {
            c.close();
        }
        boolean has = false;
        for (int i = 0; i < arr.length(); i++) {
            if (imageId.equals(arr.optString(i))) {
                has = true;
                break;
            }
        }
        if (!has) {
            arr.put(imageId);
        }
        ContentValues cv = new ContentValues();
        cv.put("groupId", groupId);
        cv.put("imageIds", arr.toString());
        cv.put("created_at", isoNowUtc());
        db.insertWithOnConflict("person_group_index", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }
}
