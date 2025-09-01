import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import MediaStoreService from './MediaStoreService';

class ImageStorageService {
  constructor() {
    this.storageKeys = {
      images: 'classified_images',
      stats: 'image_stats',
      settings: 'app_settings',
    };
    this.isInitialized = false;
  }

  // 初始化检查
  async ensureInitialized() {
    if (this.isInitialized) return;
    
    try {
      // 尝试一个简单的AsyncStorage操作来验证是否可用
      await AsyncStorage.getItem('test');
      this.isInitialized = true;
    } catch (error) {
      console.warn('AsyncStorage not ready yet:', error);
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        await AsyncStorage.getItem('test');
        this.isInitialized = true;
      } catch (retryError) {
        console.error('AsyncStorage initialization failed:', retryError);
        throw new Error('AsyncStorage not available');
      }
    }
  }

  // 保存图片分类结果
  async saveImageClassification(imageData) {
    try {
      await this.ensureInitialized();
      
      const { uri, category, confidence, timestamp, fileName, size } = imageData;
      console.log(`正在保存图片分类: ${fileName}, 分类: ${category}, 置信度: ${confidence}`);
      
      // 相册扫描只生成本地文件，无需验证
      
      // 获取现有图片数据
      const existingImages = await this.getImages();
      console.log(`现有图片数量: ${existingImages.length}`);
      
      // 检查是否已存在
      const existingIndex = existingImages.findIndex(img => img.uri === uri);
      
      if (existingIndex >= 0) {
        console.log(`更新现有图片: ${fileName}`);
        // 更新现有记录
        existingImages[existingIndex] = {
          ...existingImages[existingIndex],
          category,
          confidence,
          lastUpdated: timestamp || Date.now(),
          fileName: fileName || existingImages[existingIndex].fileName,
          // 保持原有的拍摄时间，如果新数据中有则更新
          // 注意：如果新数据中 takenAt 是 null，说明无法读取EXIF，应该保持为 null
          takenAt: imageData.takenAt !== undefined ? imageData.takenAt : existingImages[existingIndex].takenAt,
        };
      } else {
        console.log(`添加新图片: ${fileName}`);
        // 添加新记录
        const newImage = {
          id: this.generateId(),
          uri,
          category,
          confidence,
          timestamp: timestamp || Date.now(),
          takenAt: imageData.takenAt, // 拍摄时间，只使用EXIF数据，不设置回退值
          lastUpdated: Date.now(),
          fileName: fileName || uri.split('/').pop() || 'unknown.jpg',
          size: size || 0, // 实际应用中应该获取真实文件大小
          dimensions: { width: 0, height: 0 }, // 实际应用中应该获取真实尺寸
        };
        existingImages.push(newImage);
      }
      
      console.log(`保存后图片总数: ${existingImages.length}`);
      
      // 保存到存储
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(existingImages));
      
      // 更新统计信息
      await this.updateStats();
      
      return true;
    } catch (error) {
      console.error('保存图片分类失败:', error);
      throw error;
    }
  }

  // 获取所有图片
  async getImages() {
    try {
      await this.ensureInitialized();
      
      const data = await AsyncStorage.getItem(this.storageKeys.images);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('获取图片数据失败:', error);
      return [];
    }
  }

  // 根据分类获取图片
  async getImagesByCategory(category, limit = null) {
    try {
      console.log(`正在获取分类 ${category} 的图片...`);
      const allImages = await this.getImages();
      console.log(`总共有 ${allImages.length} 张图片`);
      
      // 显示所有图片的分类信息
      const categoryCounts = {};
      allImages.forEach(img => {
        categoryCounts[img.category] = (categoryCounts[img.category] || 0) + 1;
      });
      console.log('各分类图片数量:', categoryCounts);
      
      const filteredImages = allImages.filter(img => img.category === category);
      console.log(`分类 ${category} 过滤后找到 ${filteredImages.length} 张图片`);
      
      // 如果指定了limit，按拍摄时间排序并限制数量
      // 如果没有拍摄时间，则按文件时间排序
      if (limit) {
        return filteredImages
          .sort((a, b) => {
            const timeA = a.takenAt || a.timestamp;
            const timeB = b.takenAt || b.timestamp;
            return timeB - timeA;
          })
          .slice(0, limit);
      }
      
      return filteredImages;
    } catch (error) {
      console.error('根据分类获取图片失败:', error);
      return [];
    }
  }

  // 获取最近图片
  async getRecentImages(limit = 12) {
    try {
      const allImages = await this.getImages();
      return allImages
        .sort((a, b) => {
          const timeA = a.takenAt || a.timestamp;
          const timeB = b.takenAt || b.timestamp;
          return timeB - timeA;
        })
        .slice(0, limit);
    } catch (error) {
      console.error('获取最近图片失败:', error);
      return [];
    }
  }

  // 删除图片
  async deleteImage(imageId) {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      const imageToDelete = allImages.find(img => img.id === imageId);
      
      if (!imageToDelete) {
        console.warn('图片不存在，无法删除:', imageId);
        return false;
      }

      // 删除文件
      if (imageToDelete.uri) {
        try {
          // 检查文件是否存在
          const exists = await RNFS.exists(imageToDelete.uri);
          if (exists) {
            await RNFS.unlink(imageToDelete.uri);
            console.log(`文件 ${imageToDelete.uri} 已删除`);
          } else {
            console.log(`文件 ${imageToDelete.uri} 不存在，跳过删除`);
          }
        } catch (fsError) {
          console.error(`删除文件 ${imageToDelete.uri} 失败:`, fsError);
          // 如果文件删除失败，可能是因为权限问题
          // 继续删除存储中的记录，但保留文件
        }
      }

      const filteredImages = allImages.filter(img => img.id !== imageId);
      
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(filteredImages));
      await this.updateStats();
      
      return true;
    } catch (error) {
      console.error('删除图片失败:', error);
      throw error;
    }
  }

  // 批量删除图片
  async deleteImages(imageIds, onProgress) {
    try {
      await this.ensureInitialized();
      const allImages = await this.getImages();
      const imagesToDelete = allImages.filter(img => imageIds.includes(img.id));
      let filesDeleted = 0;
      let filesFailed = 0;
      let filesSkipped = 0;
      const total = imagesToDelete.length;

      console.log(`🚨 开始批量删除 ${total} 张图片...`);
      
      // 检查MediaStore模块是否可用
      const mediaStoreAvailable = MediaStoreService.isModuleAvailable();
      console.log(`🔍 MediaStore模块状态: ${mediaStoreAvailable ? '可用' : '不可用'}`);

      for (const image of imagesToDelete) {
        if (image.uri) {
          try {
            console.log(`🔍 检查文件: ${image.fileName || image.uri.split('/').pop()}`);
            console.log(`📍 文件路径: ${image.uri}`);
            
            if (!image.uri.startsWith('file://')) {
              console.error(`❌ 无效的文件URI格式: ${image.uri}`);
              filesFailed++;
              continue;
            }

            const exists = await RNFS.exists(image.uri);
            console.log(`📁 文件存在状态: ${exists}`);

            if (exists) {
              try {
                const stat = await RNFS.stat(image.uri);
                console.log(`📊 文件信息: 大小=${stat.size}, 权限=${stat.mode}`);
              } catch (statError) {
                console.log(`⚠️ 无法获取文件信息: ${statError.message}`);
              }

              let deleteSuccess = false;

              // 方法1: 优先使用MediaStore删除（如果可用）
              if (mediaStoreAvailable) {
                try {
                  console.log(`🗑️ 方法1: 使用MediaStore删除文件: ${image.fileName || image.uri.split('/').pop()}`);
                  const mediaStoreResult = await MediaStoreService.deleteFile(image.uri);
                  if (mediaStoreResult) {
                    console.log(`✅ MediaStore删除成功: ${image.fileName || image.uri.split('/').pop()}`);
                    deleteSuccess = true;
                  } else {
                    console.log(`⚠️ MediaStore删除失败，尝试备用方法`);
                  }
                } catch (mediaStoreError) {
                  console.log(`⚠️ MediaStore删除出错: ${mediaStoreError.message}`);
                }
              }

              // 方法2: RNFS.unlink（备用方法）
              if (!deleteSuccess) {
                try {
                  console.log(`🗑️ 方法2: 使用RNFS.unlink删除文件: ${image.fileName || image.uri.split('/').pop()}`);
                  await RNFS.unlink(image.uri);
                  const stillExists = await RNFS.exists(image.uri);
                  if (!stillExists) {
                    console.log(`✅ 方法2成功: 文件已删除`);
                    deleteSuccess = true;
                  } else {
                    console.log(`⚠️ 方法2失败: 文件仍然存在，尝试方法3`);
                  }
                } catch (unlinkError) {
                  console.log(`⚠️ 方法2失败: ${unlinkError.message}`);
                }
              }

              // 方法3: Copy to temp then delete（最后的备用方法）
              if (!deleteSuccess) {
                try {
                  console.log(`🗑️ 方法3: 移动文件到临时目录然后删除`);
                  const tempPath = `${RNFS.TemporaryDirectoryPath}/temp_delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
                  await RNFS.copyFile(image.uri, tempPath);
                  console.log(`📋 文件已复制到临时目录: ${tempPath}`);
                  await RNFS.unlink(image.uri);
                  console.log(`🗑️ 原文件已删除`);
                  await RNFS.unlink(tempPath);
                  console.log(`🗑️ 临时文件已删除`);
                  const finalCheck = await RNFS.exists(image.uri);
                  if (!finalCheck) {
                    console.log(`✅ 方法3成功: 文件已删除`);
                    deleteSuccess = true;
                  } else {
                    console.log(`❌ 方法3失败: 文件仍然存在`);
                  }
                } catch (moveError) {
                  console.log(`⚠️ 方法3失败: ${moveError.message}`);
                }
              }

              if (deleteSuccess) {
                filesDeleted++;
                console.log(`✅ 文件删除成功，将从分类中移除: ${image.fileName || image.uri.split('/').pop()}`);
              } else {
                console.log(`⚠️ 文件删除失败，保留在分类中: ${image.fileName || image.uri.split('/').pop()}`);
                filesFailed++;
              }
            } else {
              console.log(`⚠️ 文件不存在，跳过删除: ${image.fileName || image.uri.split('/').pop()}`);
              filesSkipped++;
            }
          } catch (fsError) {
            console.error(`❌ 删除文件失败: ${image.fileName || image.uri.split('/').pop()}`, fsError.message);
            console.error(`🔍 错误详情:`, fsError);
            filesFailed++;
          }
          
          if (onProgress) {
            onProgress({ filesDeleted, filesFailed, filesSkipped, total });
          }
        } else {
          console.log(`⚠️ 图片没有URI，跳过: ${image.id}`);
          filesSkipped++;
        }
      }

      console.log(`📊 批量删除完成统计:`);
      console.log(`   ✅ 成功删除: ${filesDeleted} 张`);
      console.log(`   ❌ 删除失败: ${filesFailed} 张`);
      console.log(`   ⚠️ 跳过删除: ${filesSkipped} 张`);

      // 只从数据库中移除成功删除的图片记录
      if (filesDeleted > 0) {
        const successfullyDeletedIds = [];
        for (const image of imagesToDelete) {
          if (image.uri) {
            const exists = await RNFS.exists(image.uri);
            if (!exists) {
              successfullyDeletedIds.push(image.id);
            }
          }
        }
        
        if (successfullyDeletedIds.length > 0) {
          const filteredImages = allImages.filter(img => !successfullyDeletedIds.includes(img.id));
          await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(filteredImages));
          await this.updateStats();
          console.log(`✅ 已从分类中移除 ${successfullyDeletedIds.length} 张成功删除的图片`);
        }
      }

      if (filesFailed > 0) {
        console.warn(`⚠️ 有 ${filesFailed} 张图片删除失败，保留在分类中`);
      }
      
      return { filesDeleted, filesFailed, filesSkipped, total };
    } catch (error) {
      console.error('批量删除图片失败:', error);
      throw error;
    }
  }

  // 更新图片分类
  async updateImageCategory(imageId, newCategory) {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      const imageIndex = allImages.findIndex(img => img.id === imageId);
      
      if (imageIndex >= 0) {
        allImages[imageIndex].category = newCategory;
        allImages[imageIndex].confidence = 'manual'; // 设置为人工分类
        allImages[imageIndex].lastUpdated = Date.now();
        
        await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(allImages));
        await this.updateStats();
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('更新图片分类失败:', error);
      throw error;
    }
  }

  // 获取统计信息
  async getStats() {
    try {
      await this.ensureInitialized();
      
      const data = await AsyncStorage.getItem(this.storageKeys.stats);
      if (data) {
        return JSON.parse(data);
      }
      
      // 如果没有统计数据，重新计算
      return await this.calculateStats();
    } catch (error) {
      console.error('获取统计信息失败:', error);
      return { classified: 0, pending: 0, totalSize: 0 };
    }
  }

  // 获取分类图片数量
  async getCategoryCounts() {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      const counts = {};
      
      // 初始化所有分类的计数为0 - 与ImageClassifierService保持一致
      const allCategories = ['wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'];
      allCategories.forEach(category => {
        counts[category] = 0;
      });
      
      // 统计每个分类的图片数量
      allImages.forEach(img => {
        if (counts.hasOwnProperty(img.category)) {
          counts[img.category]++;
        } else {
          counts['other']++; // 未知分类归入other
        }
      });
      
      return counts;
    } catch (error) {
      console.error('获取分类数量失败:', error);
      return {
        wechat: 0,
        meeting: 0,
        document: 0,
        people: 0,
        life: 0,
        game: 0,
        food: 0,
        travel: 0,
        pet: 0,
        other: 0
      };
    }
  }

  // 计算统计信息
  async calculateStats() {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      
      const stats = {
        classified: allImages.length,
        pending: 0, // 实际应用中应该计算待处理的图片数量
        totalSize: allImages.reduce((sum, img) => sum + (img.size || 0), 0),
        byCategory: {},
      };
      
      // 按分类统计
      allImages.forEach(img => {
        if (!stats.byCategory[img.category]) {
          stats.byCategory[img.category] = 0;
        }
        stats.byCategory[img.category]++;
      });
      
      // 保存统计信息
      await AsyncStorage.setItem(this.storageKeys.stats, JSON.stringify(stats));
      
      return stats;
    } catch (error) {
      console.error('计算统计信息失败:', error);
      return { classified: 0, pending: 0, totalSize: 0 };
    }
  }

  // 更新统计信息
  async updateStats() {
    return await this.calculateStats();
  }

  // 清空所有数据
  async clearAllData(onProgress) {
    try {
      // 通知进度：开始清空数据
      if (onProgress) {
        onProgress({
          current: 0,
          total: 3,
          message: '正在清空数据...',
          step: 'clearing'
        });
      }
      
      await this.ensureInitialized();
      
      // 通知进度：正在删除存储数据
      if (onProgress) {
        onProgress({
          current: 1,
          total: 3,
          message: '正在删除存储数据...',
          step: 'deleting'
        });
      }
      
      await AsyncStorage.multiRemove([
        this.storageKeys.images,
        this.storageKeys.stats,
      ]);
      
      // 重置初始化状态
      this.isInitialized = false;
      
      console.log('所有数据已清空');
      
      // 通知进度：开始重新扫描
      if (onProgress) {
        onProgress({
          current: 2,
          total: 3,
          message: '正在重新扫描相册...',
          step: 'scanning'
        });
      }
      
      // 清空数据后，触发重新扫描
      try {
        const GalleryScannerService = require('./GalleryScannerService').default;
        const galleryScanner = new GalleryScannerService();
        await galleryScanner.manualRescanGallery(); // 创建实例后调用方法
        console.log('清空数据后重新扫描完成');
      } catch (scanError) {
        console.error('清空数据后重新扫描失败:', scanError);
      }
      
      // 通知进度：完成
      if (onProgress) {
        onProgress({
          current: 3,
          total: 3,
          message: '操作完成！',
          step: 'completed'
        });
      }
      
      return true;
    } catch (error) {
      console.error('清空数据失败:', error);
      throw error;
    }
  }

  // 清理网络图片数据
  async cleanNetworkImages() {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      const localImages = allImages.filter(img => 
        img.uri && (img.uri.startsWith('file://') || img.uri.startsWith('content://'))
      );
      
      if (localImages.length !== allImages.length) {
        console.log(`清理了 ${allImages.length - localImages.length} 张网络图片`);
        await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(localImages));
        await this.updateStats();
      }
      
      return localImages;
    } catch (error) {
      console.error('清理网络图片失败:', error);
      throw error;
    }
  }

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 获取应用设置
  async getSettings() {
    try {
      await this.ensureInitialized();
      
      const data = await AsyncStorage.getItem(this.storageKeys.settings);
      return data ? JSON.parse(data) : this.getDefaultSettings();
    } catch (error) {
      console.error('获取设置失败:', error);
      return this.getDefaultSettings();
    }
  }

  // 保存应用设置
  async saveSettings(settings) {
    try {
      await this.ensureInitialized();
      
      await AsyncStorage.setItem(this.storageKeys.settings, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.error('保存设置失败:', error);
      throw error;
    }
  }

  // 获取默认设置
  getDefaultSettings() {
    return {
      hideEmptyCategories: true, // 默认隐藏无数据分类（开关为开）
      thumbnailQuality: 'medium',
      maxCacheSize: 100, // MB
    };
  }
}

export default new ImageStorageService();

