// Platform detection for web and mobile
let Platform;
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Web environment
    Platform = { OS: 'web' };
  } else {
    // Mobile environment
    Platform = eval('require("react-native").Platform');
  }
} catch (error) {
  // If detection fails, default to web environment
  Platform = { OS: 'web' };
}

// NativeModules for mobile only
let NativeModules;
if (typeof window !== 'undefined') {
  // Web environment - no native modules
  NativeModules = {};
} else {
  // Mobile environment
  NativeModules = eval('require("react-native").NativeModules');
}

const { MediaStoreModule } = NativeModules;

class MediaStoreService {
  constructor() {
    this.isAvailable = Platform.OS === 'android' && MediaStoreModule;
    
    if (this.isAvailable) {
      console.log('✅ MediaStore module available');
    } else if (Platform.OS === 'web') {
      // In web environment, MediaStore is not available but this is expected
      console.log('ℹ️ MediaStore module not available (web environment)');
    } else {
      console.log('❌ MediaStore module not available');
    }
  }

  // Delete file
  async deleteFile(filePath) {
    if (!this.isAvailable) {
      if (Platform.OS === 'web') {
        console.log('ℹ️ MediaStore not available in web environment, using alternative method');
      } else {
        console.log('⚠️ MediaStore module not available');
      }
      return false;
    }

    try {
      console.log(`🗑️ Using MediaStore to delete file: ${filePath}`);
      
      // Remove file:// prefix
      const cleanPath = filePath.replace('file://', '');
      
      const result = await MediaStoreModule.deleteFile(cleanPath);
      console.log(`✅ MediaStore delete result: ${result}`);
      
      return result;
    } catch (error) {
      console.error(`❌ MediaStore delete failed: ${error.message}`);
      // Silently handle error, don't throw exception, return false to indicate delete failed
      return false;
    }
  }

  // Get file info
  async getFileInfo(filePath) {
    if (!this.isAvailable) {
      if (Platform.OS === 'web') {
        console.log('ℹ️ MediaStore not available in web environment, using alternative method');
      } else {
        console.log('⚠️ MediaStore module not available');
      }
      return { exists: false, error: 'MediaStore module not available' };
    }

    try {
      console.log(`🔍 Getting file info: ${filePath}`);
      
      // Remove file:// prefix
      const cleanPath = filePath.replace('file://', '');
      
      const fileInfo = await MediaStoreModule.getFileInfo(cleanPath);
      console.log(`📋 File info:`, fileInfo);
      
      return fileInfo;
    } catch (error) {
      console.error(`❌ Failed to get file info: ${error.message}`);
      // Silently handle error, return basic error info
      return { exists: false, error: error.message };
    }
  }

  // Check if module is available
  isModuleAvailable() {
    return this.isAvailable;
  }
}

export default new MediaStoreService();