import { NativeModules, Platform } from 'react-native';

const { MediaStoreModule } = NativeModules;

class MediaStoreService {
  constructor() {
    this.isAvailable = Platform.OS === 'android' && MediaStoreModule;
    
    if (this.isAvailable) {
      console.log('✅ MediaStore模块可用');
    } else {
      console.log('❌ MediaStore模块不可用');
    }
  }

  // 删除文件
  async deleteFile(filePath) {
    if (!this.isAvailable) {
      console.log('⚠️ MediaStore模块不可用');
      return false;
    }

    try {
      console.log(`🗑️ 使用MediaStore删除文件: ${filePath}`);
      
      // 移除file://前缀
      const cleanPath = filePath.replace('file://', '');
      
      const result = await MediaStoreModule.deleteFile(cleanPath);
      console.log(`✅ MediaStore删除结果: ${result}`);
      
      return result;
    } catch (error) {
      console.error(`❌ MediaStore删除失败: ${error.message}`);
      // 静默处理错误，不抛出异常，返回false表示删除失败
      return false;
    }
  }

  // 获取文件信息
  async getFileInfo(filePath) {
    if (!this.isAvailable) {
      console.log('⚠️ MediaStore模块不可用');
      return { exists: false, error: 'MediaStore模块不可用' };
    }

    try {
      console.log(`🔍 获取文件信息: ${filePath}`);
      
      // 移除file://前缀
      const cleanPath = filePath.replace('file://', '');
      
      const fileInfo = await MediaStoreModule.getFileInfo(cleanPath);
      console.log(`📋 文件信息:`, fileInfo);
      
      return fileInfo;
    } catch (error) {
      console.error(`❌ 获取文件信息失败: ${error.message}`);
      // 静默处理错误，返回基本的错误信息
      return { exists: false, error: error.message };
    }
  }

  // 检查模块是否可用
  isModuleAvailable() {
    return this.isAvailable;
  }
}

export default new MediaStoreService();
