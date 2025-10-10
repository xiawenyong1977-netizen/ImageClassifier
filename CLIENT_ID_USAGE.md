# 客户端唯一ID功能说明

## 功能概述

系统会在首次初始化数据库时自动生成一个唯一的客户端ID（UUID格式），并将其保存到数据库中。这个ID作为客户端的唯一标识，除非用户手动清空，否则会一直保留。

## 自动生成

- **时机**：数据库首次初始化时（`ImageStorageService.initializeClientId()`）
- **格式**：UUID v4 格式，例如：`a1b2c3d4-e5f6-4g7h-i8j9-k0l1m2n3o4p5`
- **存储位置**：保存在 settings 中的 `clientId` 字段
- **创建时间**：保存在 settings 中的 `clientIdCreatedAt` 字段

## API 使用方法

### 获取客户端ID

```javascript
import UnifiedDataService from './services/UnifiedDataService';

// 获取当前客户端ID
const clientId = await UnifiedDataService.getClientId();
console.log('客户端ID:', clientId);
```

**注意：客户端ID一旦生成就不会改变，除非清空整个数据库。**

## 数据结构

### Settings 对象中的相关字段

```javascript
{
  clientId: "a1b2c3d4-e5f6-4g7h-i8j9-k0l1m2n3o4p5",  // 当前客户端ID（永久不变）
  clientIdCreatedAt: "2025-10-10T12:34:56.789Z",      // 创建时间
  // ... 其他设置字段
}
```

## 使用场景

1. **用户唯一标识**：用于区分不同的客户端/设备
2. **数据统计**：匿名统计不同客户端的使用情况
3. **数据同步**：作为客户端的唯一标识进行数据同步
4. **隐私保护**：无需登录账号即可有唯一标识

## 控制台测试

在浏览器开发者工具的控制台中测试：

```javascript
// 1. 获取客户端ID
const { default: UnifiedDataService } = await import('./services/UnifiedDataService');
const service = new UnifiedDataService();

// 查看当前ID
const id = await service.getClientId();
console.log('当前客户端ID:', id);

// 查看完整settings
const settings = await service.readSettings();
console.log('完整设置:', settings);
console.log('客户端ID:', settings.clientId);
console.log('创建时间:', settings.clientIdCreatedAt);
```

## 注意事项

1. **首次生成**：首次启动应用时会自动生成
2. **持久保存**：保存在数据库中，不会因为刷新页面而改变
3. **永久不变**：一旦生成就永远不会改变，确保唯一性和稳定性
4. **隐私保护**：ID是本地生成的，不会自动上传到服务器
5. **完全本地**：只存储在本地数据库中，不依赖任何服务器
6. **清空方式**：只能通过清空整个数据库来重置（不提供单独清空方法）

## 日志输出

系统会在控制台输出相关日志：

```
🆔 新客户端ID: a1b2c3d4-e5f6-4g7h-i8j9-k0l1m2n3o4p5  （首次生成时）
🆔 客户端ID已存在: a1b2c3d4-e5f6-4g7h-i8j9-k0l1m2n3o4p5  （后续启动时）
```

