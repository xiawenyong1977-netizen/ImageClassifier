# Android Release版本日志查看指南

## 📋 概述

本指南介绍如何查看Android Release版本的日志。Release版本默认会移除大部分日志输出，但通过正确配置和工具，仍然可以查看应用运行时的日志信息。

---

## 🔧 前置条件

### 1. 设备连接
- ✅ 手机已开启USB调试（参考：[华为手机调试配置指南](./华为手机调试配置指南.md)）
- ✅ 设备已通过USB连接到电脑
- ✅ 已授权此电脑进行USB调试

### 2. 验证连接
```powershell
# 检查设备连接状态
adb devices
```

**期望输出**：
```
List of devices attached
ABC123456789    device
```

### 3. 确认应用包名
本项目的应用包名：`com.imageclassifier.v2`

---

## 📱 方法一：使用adb logcat查看实时日志（推荐）

### 1.1 查看应用所有日志
```powershell
# 过滤本应用的日志（使用包名）
adb logcat | Select-String "com.imageclassifier.v2"

# 或者使用PID过滤（更精确）
adb logcat --pid=$(adb shell pidof -s com.imageclassifier.v2)
```

### 1.2 查看特定标签的日志
```powershell
# 查看React Native相关日志
adb logcat | Select-String "ReactNativeJS"

# 查看原生模块日志（如MediaStoreModule、ScanServiceModule等）
adb logcat | Select-String "MediaStoreModule|ScanServiceModule|WakeLockModule"

# 查看所有错误日志
adb logcat *:E | Select-String "com.imageclassifier.v2"
```

### 1.3 使用标签过滤（更高效）
```powershell
# 查看特定标签的日志
adb logcat -s MediaStoreModule:D ScanServiceModule:D WakeLockModule:D ReactNativeJS:*

# 查看所有级别的日志
adb logcat -s MediaStoreModule:* ScanServiceModule:* WakeLockModule:*
```

### 1.4 清除旧日志后查看
```powershell
# 清除所有日志缓存
adb logcat -c

# 然后开始查看新日志
adb logcat | Select-String "com.imageclassifier.v2"
```

---

## 💾 方法二：保存日志到文件

### 2.1 保存所有日志
```powershell
# 保存到当前目录
adb logcat > app_logs.txt

# 保存并同时显示在控制台（PowerShell）
adb logcat | Tee-Object -FilePath app_logs.txt
```

### 2.2 保存过滤后的日志
```powershell
# 只保存本应用的日志
adb logcat | Select-String "com.imageclassifier.v2" | Out-File -FilePath app_logs_filtered.txt

# 保存错误和警告日志
adb logcat *:E *:W | Select-String "com.imageclassifier.v2" | Out-File -FilePath app_errors.txt
```

### 2.3 带时间戳保存
```powershell
# 保存带时间戳的日志
adb logcat -v time | Select-String "com.imageclassifier.v2" | Out-File -FilePath app_logs_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt
```

---

## 🎯 方法三：查看特定功能模块的日志

### 3.1 查看MediaStore相关日志
```powershell
adb logcat -s MediaStoreModule:* | Select-String "MediaStore"
```

### 3.2 查看扫描服务日志
```powershell
adb logcat -s ScanServiceModule:* | Select-String "ScanService"
```

### 3.3 查看唤醒锁日志
```powershell
adb logcat -s WakeLockModule:* | Select-String "WakeLock"
```

### 3.4 查看React Native JavaScript日志
```powershell
adb logcat -s ReactNativeJS:* | Select-String "ReactNative"
```

---

## 🔍 方法四：按日志级别查看

### 4.1 日志级别说明
- **V** - Verbose（详细，最低级别）
- **D** - Debug（调试）
- **I** - Info（信息）
- **W** - Warning（警告）
- **E** - Error（错误，最高级别）

### 4.2 查看不同级别的日志
```powershell
# 只查看错误日志
adb logcat *:E | Select-String "com.imageclassifier.v2"

# 查看错误和警告
adb logcat *:E *:W | Select-String "com.imageclassifier.v2"

# 查看所有级别（Verbose及以上）
adb logcat *:V | Select-String "com.imageclassifier.v2"
```

---

## 🛠️ 方法五：使用logcat高级选项

### 5.1 带时间戳和进程ID
```powershell
# 显示时间戳、进程ID、线程ID
adb logcat -v time -v pid -v tid | Select-String "com.imageclassifier.v2"
```

### 5.2 限制日志数量
```powershell
# 只显示最后1000行日志
adb logcat -t 1000 | Select-String "com.imageclassifier.v2"

# 显示最后100行并持续监控
adb logcat -t 100 | Select-String "com.imageclassifier.v2"
```

### 5.3 查看特定时间段的日志
```powershell
# 查看最近10分钟的日志
adb logcat -t "$(Get-Date -Format 'MM-dd HH:mm:ss.000')" | Select-String "com.imageclassifier.v2"
```

---

## 📊 方法六：使用Android Studio Logcat

### 6.1 在Android Studio中查看
1. 打开Android Studio
2. 连接设备
3. 打开 **View → Tool Windows → Logcat**
4. 在过滤器中输入：`package:com.imageclassifier.v2`
5. 选择日志级别（Verbose/Debug/Info/Warning/Error）

### 6.2 保存Logcat日志
1. 在Logcat窗口中点击 **Export Logcat to File**
2. 选择保存位置和文件名
3. 选择要保存的日志级别

---

## ⚙️ 确保Release版本保留日志

### 检查build.gradle配置

默认情况下，Release版本可能会移除日志。如果需要保留日志，需要检查以下配置：

#### 1. 检查ProGuard配置
文件位置：`android/app/proguard-rules.pro`

确保没有移除日志相关的规则：
```proguard
# 保留日志相关代码（如果需要）
-keepclassmembers class * {
    public static void d(...);
    public static void e(...);
    public static void i(...);
    public static void w(...);
}
```

#### 2. 检查build.gradle
文件位置：`android/app/build.gradle`

确认Release构建类型配置：
```gradle
buildTypes {
    release {
        minifyEnabled false  // 如果为true，需要配置ProGuard规则
        // ... 其他配置
    }
}
```

---

## 🚀 快速命令参考

### 最常用的命令组合

```powershell
# 1. 清除旧日志并开始监控（推荐）
adb logcat -c
adb logcat | Select-String "com.imageclassifier.v2"

# 2. 查看错误日志并保存到文件
adb logcat *:E | Select-String "com.imageclassifier.v2" | Tee-Object -FilePath errors_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt

# 3. 查看所有模块日志（带时间戳）
adb logcat -v time -s MediaStoreModule:* ScanServiceModule:* WakeLockModule:* ReactNativeJS:*

# 4. 实时监控并保存
adb logcat -v time | Select-String "com.imageclassifier.v2" | Tee-Object -FilePath logs_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt
```

---

## 📝 日志标签说明

本项目使用的日志标签：

| 标签 | 说明 | 位置 |
|------|------|------|
| `MediaStoreModule` | MediaStore相关操作 | `android/app/src/main/java/com/imageclassifier/v2/MediaStoreModule.java` |
| `ScanServiceModule` | 扫描服务相关 | `android/app/src/main/java/com/imageclassifier/v2/ScanServiceModule.java` |
| `WakeLockModule` | 唤醒锁相关 | `android/app/src/main/java/com/imageclassifier/v2/WakeLockModule.java` |
| `ReactNativeJS` | React Native JavaScript日志 | React Native框架自动生成 |

---

## 🐛 常见问题

### 问题1：看不到任何日志
**可能原因**：
- Release版本移除了日志
- 应用未运行
- 日志级别过滤太严格

**解决方法**：
```powershell
# 检查应用是否运行
adb shell ps | Select-String "com.imageclassifier.v2"

# 查看所有日志（不过滤）
adb logcat

# 检查日志级别
adb logcat *:V
```

### 问题2：日志太多，难以查找
**解决方法**：
```powershell
# 使用更精确的过滤
adb logcat -s MediaStoreModule:E ScanServiceModule:E WakeLockModule:E

# 只查看错误
adb logcat *:E | Select-String "com.imageclassifier.v2"
```

### 问题3：日志文件太大
**解决方法**：
```powershell
# 限制日志数量
adb logcat -t 1000 | Select-String "com.imageclassifier.v2" | Out-File app_logs.txt

# 只保存错误和警告
adb logcat *:E *:W | Select-String "com.imageclassifier.v2" | Out-File app_errors.txt
```

### 问题4：设备断开连接
**解决方法**：
```powershell
# 重新连接
adb kill-server
adb start-server
adb devices
```

---

## 📚 相关文档

- [华为手机调试配置指南](./华为手机调试配置指南.md)
- [后台扫描实现方案](./后台扫描实现方案.md)
- [Android官方Logcat文档](https://developer.android.com/studio/command-line/logcat)

---

## ✅ 检查清单

查看Release版本日志前，确认：

- [ ] 设备已通过USB连接
- [ ] USB调试已开启并授权
- [ ] `adb devices` 显示设备为 `device` 状态
- [ ] 应用已安装并可以运行
- [ ] 已选择正确的日志查看方法
- [ ] 已设置合适的日志过滤条件

---

## 💡 提示

1. **实时监控**：使用 `adb logcat` 可以实时查看日志，适合调试
2. **保存日志**：使用 `Out-File` 或 `Tee-Object` 保存日志，方便后续分析
3. **过滤优化**：使用标签过滤（`-s`）比管道过滤（`Select-String`）更高效
4. **日志级别**：Release版本建议至少保留Error级别日志，便于问题排查
5. **时间戳**：使用 `-v time` 添加时间戳，方便定位问题发生时间

---

**最后更新**：2025-01-XX


