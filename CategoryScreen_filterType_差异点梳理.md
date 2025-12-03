# CategoryScreen.desktop.js 对不同 filterType 的处理差异梳理

## 支持的 filterType
- `stagingBox` - 暂存箱
- `category` - 内容分类
- `city` - 城市分类
- `color` - 颜色分类
- `directory` - 存储目录分类
- `similarityGroup` - 相似组分类

---

## 1. 数据加载差异 (`loadImages`)

### 1.1 图片数据获取
**所有 filterType 统一使用：**
```javascript
const images = await UnifiedDataService.readImagesByFilter(filterType, filterValue);
```

### 1.2 选中状态获取
**所有 filterType 统一使用：**
```javascript
const selectedImages = await UnifiedDataService.getSelectedImagesByFilter(filterType, filterValue);
```

### 1.3 暂存箱图片ID获取（特殊处理）
**差异点：只有非暂存箱分类才需要获取暂存箱图片ID**
```javascript
let stagingBoxIds = new Set();
if (filterType !== 'stagingBox') {
  // 只有非暂存箱分类才需要检查哪些图片在暂存箱中
  const stagingBoxImages = await UnifiedDataService.getStagingBoxImages();
  stagingBoxIds = new Set(stagingBoxImages.map(img => img.id));
}
```

**原因：**
- 暂存箱本身不需要显示"在暂存箱中"的标识
- 其他分类需要显示哪些图片已经在暂存箱中

---

## 2. 标题显示差异 (`HeaderComponent`)

### 2.1 标题文本格式
```javascript
{!filterType || !filterValue
  ? '图片列表'
  : filterType === 'similarityGroup'
  ? `相似照片组 (${allImages.length}张)`
  : filterType === 'directory'
  ? `📁 ${truncateText(filterValue.split('/').pop() || filterValue, 20)} (${allImages.length}张)`
  : filterType === 'city'
  ? `${filterValue} (${allImages.length}张)`
  : filterType === 'color'
  ? `🎨 ${filterValue} (${allImages.length}张)`
  : filterType === 'stagingBox'
  ? `🗑️ 暂存箱 (${allImages.length}张)`
  : filterType === 'category'
  ? `${UnifiedDataService.getCategoryDisplayName(filterValue)} (${allImages.length}张)`
  : '图片列表'
}
```

**差异点：**
- `similarityGroup`: 固定文本 "相似照片组"
- `directory`: 显示目录名（取最后一段路径），带 📁 图标，文本截断（最多20字符）
- `city`: 直接显示城市名
- `color`: 显示颜色值，带 🎨 图标
- `stagingBox`: 固定文本 "暂存箱"，带 🗑️ 图标
- `category`: 通过 `getCategoryDisplayName` 获取分类显示名称

---

## 3. 空状态显示差异 (`renderEmpty`)

### 3.1 空状态提示文本
```javascript
{!filterType || !filterValue
  ? '暂无图片'
  : filterType === 'similarityGroup'
  ? '该相似组暂无图片'
  : filterType === 'directory'
  ? '该目录暂无图片'
  : filterType === 'city'
  ? `${filterValue} 暂无图片`
  : filterType === 'color'
  ? `该颜色暂无图片`
  : filterType === 'stagingBox'
  ? '暂存箱暂无图片'
  : '该分类暂无图片'
}
```

**差异点：**
- `similarityGroup`: "该相似组暂无图片"
- `directory`: "该目录暂无图片"
- `city`: 动态显示城市名，如 "北京 暂无图片"
- `color`: "该颜色暂无图片"
- `stagingBox`: "暂存箱暂无图片"
- `category`: "该分类暂无图片"

---

## 4. 暂存箱相关逻辑差异

### 4.1 `isStagingBox` 判断
```javascript
const isStagingBox = filterType === 'stagingBox';
```

**用途：**
- 在 `HeaderComponent` 中用于判断是否为暂存箱
- 可能影响某些UI元素的显示/隐藏（需要进一步检查）

### 4.2 暂存箱图片ID集合
```javascript
// 在 loadImages 中
if (filterType !== 'stagingBox') {
  // 获取暂存箱图片ID，用于在图片上显示"已在暂存箱"标识
  const stagingBoxImages = await UnifiedDataService.getStagingBoxImages();
  stagingBoxIds = new Set(stagingBoxImages.map(img => img.id));
}
```

**差异点：**
- 暂存箱分类：不需要获取暂存箱图片ID（因为所有图片都在暂存箱中）
- 其他分类：需要获取暂存箱图片ID，用于在图片缩略图上显示"已在暂存箱"的标识

---

## 5. 图片导航差异 (`handleImagePress`)

### 5.1 参数传递
**所有 filterType 统一处理：**
```javascript
const contextProps = {
  filterType,
  filterValue,
  currentPage
};
navigation.onImagePress(image, null, contextProps);
```

**说明：**
- 统一传递 `filterType` 和 `filterValue`
- `fromScreen` 传 `null`，由接收方（`ImagePreviewScreen`）根据 `filterType` 推导

---

## 6. 批量操作差异

### 6.1 选中图片获取
**所有 filterType 统一使用：**
```javascript
const getCurrentSelectedImages = useCallback(async () => {
  return await UnifiedDataService.getSelectedImagesByFilter(filterType, filterValue);
}, [filterType, filterValue]);
```

**说明：**
- 所有批量操作（复制、删除、分类修改、暂存箱操作等）都使用统一的 `getSelectedImagesByFilter`
- 数据服务层会根据 `filterType` 自动处理不同的过滤逻辑

---

## 7. 批量操作按钮显示差异 (`HeaderComponent`)

### 7.1 暂存箱相关按钮
**差异点：根据 `isStagingBox` 条件显示不同的按钮**

```javascript
// 暂存 - 只有非暂存箱显示
{!isStagingBox && (
  <TouchableOpacity onPress={handleBatchAddToStagingBox}>
    <Text>📦 暂存</Text>
  </TouchableOpacity>
)}

// 从暂存箱移除 - 只有暂存箱显示
{isStagingBox && (
  <TouchableOpacity onPress={handleBatchRemoveFromStagingBox}>
    <Text>➡️ 移出</Text>
  </TouchableOpacity>
)}
```

**说明：**
- `filterType === 'stagingBox'`：显示"移出"按钮（从暂存箱移除）
- 其他 filterType：显示"暂存"按钮（添加到暂存箱）

### 7.2 其他批量操作按钮
**所有 filterType 统一显示：**
- ✅ 全选 / 取消选择
- ✅ 分类（设置分类）
- ✅ 创玩（AI增强）
- ✅ 内容复制
- ✅ 文件复制
- ✅ 删除

---

## 8. 总结

### 8.1 统一的处理
✅ **数据获取**：所有 filterType 都使用 `readImagesByFilter` 和 `getSelectedImagesByFilter`
✅ **选中状态管理**：统一使用 `getSelectedImagesByFilter`
✅ **图片导航**：统一传递 `filterType` 和 `filterValue`
✅ **批量操作逻辑**：统一使用 `getCurrentSelectedImages`
✅ **大部分批量操作按钮**：所有 filterType 都显示相同的操作按钮

### 8.2 差异化的处理
⚠️ **标题显示**：不同 filterType 有不同的显示格式和图标
⚠️ **空状态提示**：不同 filterType 有不同的提示文本
⚠️ **暂存箱标识**：只有非暂存箱分类才需要获取暂存箱图片ID集合
⚠️ **暂存箱操作按钮**：
   - 暂存箱：显示"移出"按钮
   - 其他分类：显示"暂存"按钮

### 8.3 潜在优化点
1. **标题显示逻辑**：可以提取为一个统一的函数，根据 `filterType` 返回对应的标题格式
2. **空状态提示**：可以提取为一个统一的函数，根据 `filterType` 返回对应的提示文本
3. **暂存箱逻辑**：`isStagingBox` 判断已经用于控制按钮显示，逻辑清晰

