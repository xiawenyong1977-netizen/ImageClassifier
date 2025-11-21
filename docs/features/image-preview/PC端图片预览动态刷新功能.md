# PC端图片预览动态刷新功能

## 📋 功能概述

在PC端图片预览页面（`ImagePreviewScreen.desktop.js`）中，实现与移动端一致的动态刷新功能：
- 暂存照片后自动重新加载图片列表
- 修改分类后自动重新加载图片列表
- 自动更新序号（如：第3张/共20张 → 第3张/共19张）
- 自动显示下一张照片
- 不返回到分类列表页

---

## 🎯 功能特性

### 1. 图标动态显示

**右上角按钮图标**根据当前分类显示：

| 分类 | 图标 | 颜色 | 操作 |
|------|------|------|------|
| **tobecleaned（暂存箱）** | 🗑️ | 红色 #ff4444 | 永久删除 |
| **其他所有分类** | 📌 | 蓝色 #007AFF | 标记为待处置 |

```javascript
{currentImage?.category === 'tobecleaned' ? '🗑️' : '📌'}
```

---

### 2. 动态刷新逻辑

#### 暂存操作流程
```
查看第3张/共20张（风景分类）
    ↓
点击 📌 暂存按钮
    ↓
确认"标记为待处置"
    ↓
✅ 自动重新加载数据
    ↓
显示第3张/共19张（原第4张）
    ↓
继续浏览，无需返回列表
```

#### 修改分类流程
```
查看第5张/共30张（风景分类）
    ↓
点击分类选择器，选择"人物"
    ↓
✅ 自动重新加载数据
    ↓
显示第5张/共29张（原第6张）
    ↓
继续浏览，无需返回列表
```

---

## 🔧 技术实现

### 1. 重新加载函数

新增 `reloadImageList()` 函数，根据不同来源重新加载数据：

```javascript
const reloadImageList = async () => {
  try {
    let updatedImages = [];
    
    // 根据来源重新加载
    if (fromScreen === 'Home') {
      // 从首页最近照片
      updatedImages = await UnifiedDataService.readRecentImages(50);
    } 
    else if (similarityGroupId) {
      // 从相似组
      const groupData = await UnifiedDataService.getSimilarityGroupImages(similarityGroupId);
      const groupImages = groupData.images || [];
      updatedImages = groupImages.filter(img => img.category !== 'tobecleaned');
    } 
    else if (city) {
      // 从城市
      const cityImages = await UnifiedDataService.readImagesByLocation(city);
      updatedImages = cityImages.filter(img => img.category !== 'tobecleaned');
    } 
    else if (category) {
      // 从分类
      updatedImages = await UnifiedDataService.readImagesByCategory(category);
    }
    
    // 如果列表为空，返回上一页
    if (updatedImages.length === 0) {
      Alert.alert('提示', '当前分类已无图片', [
        { text: '确定', onPress: handleBack }
      ]);
      return false;
    }
    
    // 更新图片列表
    setCategoryImages(updatedImages);
    
    // 调整当前索引，显示下一张
    let newIndex = currentImageIndex;
    if (currentImageIndex >= updatedImages.length) {
      newIndex = updatedImages.length - 1;
    }
    
    // 加载新的图片详情
    setCurrentImageIndex(newIndex);
    const nextImage = updatedImages[newIndex];
    if (nextImage) {
      const fullDetails = await UnifiedDataService.readImageDetailsById(nextImage.id);
      if (fullDetails) {
        setCurrentImage(fullDetails);
      }
    }
    
    return true;
  } catch (error) {
    logger.error('重新加载失败:', error);
    return false;
  }
};
```

---

### 2. 暂存操作集成

在 `handleDelete()` 中，标记为待处置后调用重新加载：

```javascript
const handleDelete = () => {
  Alert.alert(
    '标记为待处置',
    '确定要将这张图片标记为待处置吗？',
    [
      { text: '取消', style: 'cancel' },
      {
        text: '标记',
        onPress: async () => {
          // 1. 更新分类
          await UnifiedDataService.updateImageCategory(
            currentImage.id, 
            'tobecleaned', 
            'manual'
          );
          
          // 2. 重新加载图片列表 ✅
          await reloadImageList();
          
          // 3. 通知父组件
          if (onDataChange) {
            onDataChange();
          }
        }
      }
    ]
  );
};
```

**移除的弹窗**：
- ❌ `Alert.alert('操作完成', '图片已标记为待处置')`

---

### 3. 分类修改集成

在 `handleCategoryChange()` 中，修改分类后调用重新加载：

```javascript
const handleCategoryChange = async (newCategory) => {
  // 1. 更新分类
  await UnifiedDataService.updateImageCategory(
    currentImage.id, 
    newCategory, 
    'manual'
  );
  
  // 2. 更新本地状态
  setCurrentImage(prev => ({ 
    ...prev, 
    category: newCategory,
    confidence: 'manual'
  }));
  
  // 3. 重新加载图片列表（如果从分类页进入） ✅
  if (category && category !== newCategory) {
    await reloadImageList();
  }
  
  // 4. 通知父组件
  if (onDataChange) {
    onDataChange();
  }
};
```

---

## 📊 用户体验对比

### 修改前

```
查看第3张/共20张 
    ↓
标记为待处置 
    ↓
弹窗："操作完成"
    ↓
返回分类列表
    ↓
需要重新进入预览
    ↓
从第1张开始浏览

❌ 打断浏览流程
❌ 需要多步操作
❌ 需要重新定位
```

### 修改后

```
查看第3张/共20张
    ↓
标记为待处置
    ↓
自动显示第3张/共19张（原第4张）
    ↓
继续浏览

✅ 流畅连贯
✅ 保持浏览位置
✅ 一气呵成
```

---

## 🔍 边界处理

### 1. 删除最后一张
```javascript
if (currentImageIndex >= updatedImages.length) {
  newIndex = updatedImages.length - 1;
}
```
**效果**：自动跳到新的最后一张

### 2. 删除唯一一张
```javascript
if (updatedImages.length === 0) {
  Alert.alert('提示', '当前分类已无图片', [
    { text: '确定', onPress: handleBack }
  ]);
  return false;
}
```
**效果**：提示并返回列表页

### 3. 不同来源处理
- ✅ 最近照片：重新加载最近50张
- ✅ 相似组：重新加载相似组（过滤tobecleaned）
- ✅ 城市：重新加载城市（过滤tobecleaned）
- ✅ 分类：重新加载分类（不过滤）

---

## 📝 修改的文件

### PC端
- `src/screens/desktop/ImagePreviewScreen.desktop.js`
  - 新增 `reloadImageList()` 函数
  - 修改 `handleDelete()` - 移除成功弹窗，添加重新加载
  - 修改 `handleCategoryChange()` - 添加重新加载
  - 修改按钮图标显示逻辑（📌 vs 🗑️）
  - 新增颜色样式（蓝色 vs 红色）

---

## 🎯 与移动端保持一致

| 功能 | PC端 | 移动端 | 状态 |
|------|------|--------|------|
| **动态刷新** | ✅ | ✅ | 一致 |
| **自动切换** | ✅ | ✅ | 一致 |
| **过滤逻辑** | ✅ | ✅ | 一致 |
| **边界处理** | ✅ | ✅ | 一致 |
| **图标显示** | 📌/🗑️ | 📦/🗑️ | 略有不同 |

**图标差异说明**：
- PC端：📌（图钉）更符合"收藏/暂存"的语义
- 移动端：📦（盒子）更符合移动端简洁风格

---

## ✅ 测试要点

### 必测场景

1. ✅ **暂存照片**
   - 在分类页浏览照片
   - 点击 📌 暂存
   - 确认操作
   - 检查：序号更新、自动显示下一张、无成功弹窗

2. ✅ **修改分类**
   - 在分类页浏览照片
   - 修改分类
   - 检查：序号更新、自动显示下一张

3. ✅ **暂存最后一张**
   - 暂存当前分类的最后一张照片
   - 检查：是否正确跳到新的最后一张

4. ✅ **暂存唯一一张**
   - 暂存分类中唯一的照片
   - 检查：提示"已无图片"并返回列表

5. ✅ **不同来源**
   - 从首页、城市页、相似组进入
   - 测试暂存操作是否正常

6. ✅ **暂存箱中删除**
   - 在暂存箱浏览
   - 看到 🗑️ 红色图标
   - 点击删除
   - 确认永久删除

---

## 📅 更新日志

### 2025-10-22
- ✅ 实现PC端图片列表动态刷新
- ✅ 支持暂存后自动加载
- ✅ 支持修改分类后自动加载
- ✅ 添加图标动态显示（📌 vs 🗑️）
- ✅ 优化颜色方案（蓝色 vs 红色）
- ✅ 移除暂存成功弹窗
- ✅ 处理各种边界情况
- ✅ 与移动端保持一致

---

**总结**：PC端现在与移动端功能完全一致，提供了流畅的连续浏览体验。用户在暂存或修改分类后，无需返回列表页，可以直接继续浏览下一张照片。


