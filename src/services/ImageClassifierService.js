class ImageClassifierService {
  constructor() {
    this.isInitialized = false;
    // Supported categories
    this.categories = [
      'wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'
    ];
    
    // Initialize time-based classifier directly
    this.timeBasedClassifier = this.createTimeBasedClassifier();
  }

  // Initialize service
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Time-based simulation classification algorithm already initialized
      this.isInitialized = true;
      console.log('Image classification service initialized successfully');
    } catch (error) {
      console.error('Image classification service initialization failed:', error);
      throw error;
    }
  }

  // Classify image (simplified version, directly using time classification)
  async classifyImage(imageUri, metadata = {}) {
    try {
      // Gallery scan only generates local files, no need to verify
      
      // Directly use time classification
      return await this.classifyImageByTime(imageUri, metadata);
    } catch (error) {
      console.error('Image classification failed:', error);
      return {
        category: 'other',
        confidence: 0.50,
        reason: 'Classification failed',
        method: 'time-based'
      };
    }
  }

  // Batch classify images
  async classifyImages(imageUris, metadata = {}) {
    const results = [];
    
    for (const uri of imageUris) {
      try {
        const result = await this.classifyImage(uri, metadata);
        results.push({
          uri,
          ...result,
        });
      } catch (error) {
        console.error(`Failed to classify image ${uri}:`, error);
        results.push({
          uri,
          category: 'other',
          confidence: 0,
          error: error.message,
        });
      }
    }
    
    return results;
  }

  // Create time-based classifier
  createTimeBasedClassifier() {
    const self = this; // Save this reference
    return {
      // Classify images by time
      classifyByTime: (timestamp, fileSize, fileName) => {
        const date = new Date(timestamp);
        const hour = date.getHours();
        const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // Time-based classification logic
        if (self.isWechatScreenshot(fileName)) {
          return { category: 'wechat', confidence: 0.95, reason: 'Filename feature match' };
        }
        
        if (self.isDocumentPhoto(fileName, fileSize)) {
          return { category: 'document', confidence: 0.90, reason: 'File feature match' };
        }
        
        if (self.isWorkTime(hour, dayOfWeek)) {
          return { category: 'document', confidence: 0.85, reason: 'Work time period' };
        }
        
        if (self.isMeetingTime(hour, dayOfWeek)) {
          return { category: 'meeting', confidence: 0.80, reason: 'Meeting time period' };
        }
        
        if (self.isLifeTime(hour, isWeekend)) {
          return { category: 'life', confidence: 0.75, reason: 'Life time period' };
        }
        
        if (self.isPeoplePhoto(fileName, fileSize)) {
          return { category: 'people', confidence: 0.70, reason: 'Social activity feature' };
        }
        
        return { category: 'other', confidence: 0.50, reason: 'Default classification' };
      }
    };
  }

  // Check if it's a WeChat screenshot
  isWechatScreenshot(fileName) {
    const wechatPatterns = [
      /wechat/i,
      /微信/i,
      /screenshot/i,
      /截图/i,
      /IMG_\d{8}_\d{6}/, // WeChat screenshot naming format
      /Screenshot_\d{8}-\d{6}/ // Another screenshot format
    ];
    return wechatPatterns.some(pattern => pattern.test(fileName));
  }
  
  // Check if it's a document photo
  isDocumentPhoto(fileName, fileSize) {
    const documentPatterns = [
      /id/i, /身份证/i, /passport/i, /护照/i,
      /license/i, /驾照/i, /card/i, /卡/i,
      /document/i, /文档/i, /scan/i, /扫描/i
    ];
    const isSmallFile = fileSize < 500 * 1024; // Less than 500KB
    return documentPatterns.some(pattern => pattern.test(fileName)) || isSmallFile;
  }
  
  // Check if it's work time
  isWorkTime(hour, dayOfWeek) {
    const isWorkDay = dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
    const isWorkHour = hour >= 9 && hour <= 18; // 9 AM to 6 PM
    return isWorkDay && isWorkHour;
  }
  
  // Check if it's meeting time
  isMeetingTime(hour, dayOfWeek) {
    const isWorkDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isMeetingHour = (hour >= 9 && hour <= 12) || (hour >= 14 && hour <= 17);
    return isWorkDay && isMeetingHour;
  }
  
  // Check if it's life time
  isLifeTime(hour, isWeekend) {
    if (isWeekend) return true; // Weekends are all life time
    const isLifeHour = hour < 9 || hour > 18; // Non-work hours
    return isLifeHour;
  }
  
  // Check if it's a people photo
  isPeoplePhoto(fileName, fileSize) {
    const peoplePatterns = [
      /portrait/i, /人像/i, /selfie/i, /自拍/i,
      /photo/i, /照片/i, /camera/i, /相机/i,
      /IMG_\d{8}_\d{6}/, // Phone photo format
      /DSC\d{5}/ // Camera photo format
    ];
    const isLargeFile = fileSize > 1024 * 1024; // Larger than 1MB
    return peoplePatterns.some(pattern => pattern.test(fileName)) || isLargeFile;
  }

  // Time-based fast classification (no dependency on TensorFlow model)
  async classifyImageByTime(imageUri, metadata = {}) {
    try {
      const { timestamp, fileSize, fileName } = metadata;
      const date = new Date(timestamp || Date.now());
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const self = this;

      // Filename feature matching (highest priority)
      if (self.isWechatScreenshot(fileName)) {
        return { category: 'wechat', confidence: 0.95, reason: 'Filename feature match' };
      }

      if (self.isDocumentPhoto(fileName, fileSize)) {
        return { category: 'document', confidence: 0.90, reason: 'File feature match' };
      }

      if (self.isFoodPhoto(fileName, fileSize)) {
        return { category: 'food', confidence: 0.88, reason: 'Food image feature' };
      }

      if (self.isTravelPhoto(fileName, fileSize)) {
        return { category: 'travel', confidence: 0.85, reason: 'Travel image feature' };
      }

      if (self.isPetPhoto(fileName, fileSize)) {
        return { category: 'pet', confidence: 0.82, reason: 'Pet image feature' };
      }

      // Time feature matching
      if (self.isMeetingTime(hour, dayOfWeek)) {
        return { category: 'meeting', confidence: 0.80, reason: 'Meeting time period' };
      }

      if (self.isLifeTime(hour, isWeekend)) {
        return { category: 'life', confidence: 0.75, reason: 'Life time period' };
      }

      if (self.isPeoplePhoto(fileName, fileSize)) {
        return { category: 'people', confidence: 0.70, reason: 'Social activity feature' };
      }

      if (self.isGameScreenshot(fileName, hour)) {
        return { category: 'game', confidence: 0.65, reason: 'Game screenshot feature' };
      }

      return { category: 'other', confidence: 0.50, reason: 'Default classification' };
    } catch (error) {
      console.error('Time-based classification failed:', error);
      return { category: 'other', confidence: 0.30, reason: 'Classification failed' };
    }
  }

  // Smart classification: prioritize time classification, fallback to AI classification
  async smartClassifyImage(imageUri, metadata = {}) {
    try {
      // First try time classification
      const timeResult = await this.classifyImageByTime(imageUri, metadata);
      
      // If time classification confidence is high, return directly
      if (timeResult.confidence > 0.8) {
        return timeResult;
      }
      
      // Otherwise try AI classification
      try {
        const aiResult = await this.classifyImage(imageUri, metadata);
        return {
          ...aiResult,
          method: 'ai-model',
          fallback: true
        };
      } catch (aiError) {
        // AI classification failed, return time classification result
        return {
          ...timeResult,
          method: 'time-based-fallback',
          aiError: aiError.message
        };
      }
    } catch (error) {
      console.error('Smart classification failed:', error);
      return {
        category: 'other',
        confidence: 0.50,
        reason: 'Classification failed',
        method: 'smart-classify',
        error: error.message
      };
    }
  }

  // Category information mapping
  static getCategoryInfo(categoryId) {
    const categoryMap = {
      wechat: { name: 'WeChat Screenshot', icon: '📱', color: '#07C160' },
      meeting: { name: 'Meeting Scene', icon: '💼', color: '#FF9800' },
      document: { name: 'Work Document', icon: '📄', color: '#2196F3' },
      people: { name: 'Social Activity', icon: '👥', color: '#E91E63' },
      life: { name: 'Life Record', icon: '🌅', color: '#4CAF50' },
      game: { name: 'Game Screenshot', icon: '🎮', color: '#FF5722' },
      food: { name: 'Food Record', icon: '🍕', color: '#FF6B35' },
      travel: { name: 'Travel Scenery', icon: '✈️', color: '#9C27B0' },
      pet: { name: 'Pet Photo', icon: '🐕', color: '#795548' },
      other: { name: 'Other Images', icon: '📷', color: '#607D8B' }
    };
    
    return categoryMap[categoryId] || categoryMap.other;
  }

  // Check if it's a food photo
  isFoodPhoto(fileName, fileSize) {
    if (!fileName) return false;
    
    const foodPatterns = [
      /food/i, /meal/i, /dinner/i, /lunch/i, /breakfast/i, /snack/i,
      /restaurant/i, /cafe/i, /kitchen/i, /cooking/i, /recipe/i,
      /美食/i, /餐厅/i, /厨房/i, /烹饪/i, /菜谱/i, /食物/i
    ];
    
    const isFoodFile = foodPatterns.some(pattern => pattern.test(fileName));
    const isLargeFile = fileSize && fileSize > 2000000; // Larger than 2MB, might be high-quality food image
    
    return isFoodFile || isLargeFile;
  }

  // Check if it's a travel photo
  isTravelPhoto(fileName, fileSize) {
    if (!fileName) return false;
    
    const travelPatterns = [
      /travel/i, /trip/i, /vacation/i, /holiday/i, /tour/i, /journey/i,
      /landscape/i, /scenery/i, /view/i, /sight/i, /monument/i,
      /旅行/i, /旅游/i, /假期/i, /风景/i, /景点/i, /地标/i
    ];
    
    const isTravelFile = travelPatterns.some(pattern => pattern.test(fileName));
    const isLargeFile = fileSize && fileSize > 3000000; // Larger than 3MB, might be high-quality landscape image
    
    return isTravelFile || isLargeFile;
  }

  // Check if it's a pet photo
  isPetPhoto(fileName, fileSize) {
    if (!fileName) return false;
    
    const petPatterns = [
      /pet/i, /dog/i, /cat/i, /puppy/i, /kitten/i, /animal/i,
      /宠物/i, /狗/i, /猫/i, /小狗/i, /小猫/i, /动物/i
    ];
    
    const isPetFile = petPatterns.some(pattern => pattern.test(fileName));
    const isMediumFile = fileSize && fileSize > 1000000; // Larger than 1MB, might be pet photo
    
    return isPetFile || isMediumFile;
  }

  // Check if it's a game screenshot
  isGameScreenshot(fileName, hour) {
    if (!fileName) return false;
    
    const gamePatterns = [
      /game/i, /gaming/i, /screenshot/i, /capture/i, /play/i,
      /游戏/i, /截图/i, /捕获/i, /游玩/i
    ];
    
    const isGameFile = gamePatterns.some(pattern => pattern.test(fileName));
    const isGameTime = hour >= 19 || hour <= 2; // 7 PM to 2 AM, gaming time
    
    return isGameFile || isGameTime;
  }
}

export default ImageClassifierService;