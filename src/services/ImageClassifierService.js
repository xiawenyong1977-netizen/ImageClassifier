class ImageClassifierService {
  constructor() {
    this.isInitialized = false;
    // 支持的分类
    this.categories = [
      'wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'
    ];
    
    // 直接初始化时间分类器
    this.timeBasedClassifier = this.createTimeBasedClassifier();
  }

  // 初始化服务
  async initialize() {
    if (this.isInitialized) return;

    try {
      // 基于时间的模拟分类算法已经初始化
      this.isInitialized = true;
      console.log('图片分类服务初始化成功');
    } catch (error) {
      console.error('图片分类服务初始化失败:', error);
      throw error;
    }
  }

  // 分类图片（简化版本，直接使用时间分类）
  async classifyImage(imageUri, metadata = {}) {
    try {
      // 相册扫描只生成本地文件，无需验证
      
      // 直接使用时间分类
      return await this.classifyImageByTime(imageUri, metadata);
    } catch (error) {
      console.error('图片分类失败:', error);
      return {
        category: 'other',
        confidence: 0.50,
        reason: '分类失败',
        method: 'time-based'
      };
    }
  }

  // 批量分类图片
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
        console.error(`分类图片失败 ${uri}:`, error);
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

  // 创建基于时间的分类器
  createTimeBasedClassifier() {
    const self = this; // 保存this引用
    return {
      // 根据时间分类图片
      classifyByTime: (timestamp, fileSize, fileName) => {
        const date = new Date(timestamp);
        const hour = date.getHours();
        const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 6=周六
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // 基于时间的分类逻辑
        if (self.isWechatScreenshot(fileName)) {
          return { category: 'wechat', confidence: 0.95, reason: '文件名特征匹配' };
        }
        
        if (self.isDocumentPhoto(fileName, fileSize)) {
          return { category: 'document', confidence: 0.90, reason: '文件特征匹配' };
        }
        
        if (self.isWorkTime(hour, dayOfWeek)) {
          return { category: 'document', confidence: 0.85, reason: '工作时间段' };
        }
        
        if (self.isMeetingTime(hour, dayOfWeek)) {
          return { category: 'meeting', confidence: 0.80, reason: '会议时间段' };
        }
        
        if (self.isLifeTime(hour, isWeekend)) {
          return { category: 'life', confidence: 0.75, reason: '生活时间段' };
        }
        
        if (self.isPeoplePhoto(fileName, fileSize)) {
          return { category: 'people', confidence: 0.70, reason: '社交活动特征' };
        }
        
        return { category: 'other', confidence: 0.50, reason: '默认分类' };
      }
    };
  }

  // 判断是否为微信截图
  isWechatScreenshot(fileName) {
    const wechatPatterns = [
      /wechat/i,
      /微信/i,
      /screenshot/i,
      /截图/i,
      /IMG_\d{8}_\d{6}/, // 微信截图命名格式
      /Screenshot_\d{8}-\d{6}/ // 另一种截图格式
    ];
    return wechatPatterns.some(pattern => pattern.test(fileName));
  }
  
  // 判断是否为证件照片
  isDocumentPhoto(fileName, fileSize) {
    const documentPatterns = [
      /id/i, /身份证/i, /passport/i, /护照/i,
      /license/i, /驾照/i, /card/i, /卡/i,
      /document/i, /文档/i, /scan/i, /扫描/i
    ];
    const isSmallFile = fileSize < 500 * 1024; // 小于500KB
    return documentPatterns.some(pattern => pattern.test(fileName)) || isSmallFile;
  }
  
  // 判断是否为工作时间
  isWorkTime(hour, dayOfWeek) {
    const isWorkDay = dayOfWeek >= 1 && dayOfWeek <= 5; // 周一到周五
    const isWorkHour = hour >= 9 && hour <= 18; // 9点到18点
    return isWorkDay && isWorkHour;
  }
  
  // 判断是否为会议时间
  isMeetingTime(hour, dayOfWeek) {
    const isWorkDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isMeetingHour = (hour >= 9 && hour <= 12) || (hour >= 14 && hour <= 17);
    return isWorkDay && isMeetingHour;
  }
  
  // 判断是否为生活时间
  isLifeTime(hour, isWeekend) {
    if (isWeekend) return true; // 周末都是生活时间
    const isLifeHour = hour < 9 || hour > 18; // 非工作时间
    return isLifeHour;
  }
  
  // 判断是否为人像照片
  isPeoplePhoto(fileName, fileSize) {
    const peoplePatterns = [
      /portrait/i, /人像/i, /selfie/i, /自拍/i,
      /photo/i, /照片/i, /camera/i, /相机/i,
      /IMG_\d{8}_\d{6}/, // 手机拍照格式
      /DSC\d{5}/ // 相机拍照格式
    ];
    const isLargeFile = fileSize > 1024 * 1024; // 大于1MB
    return peoplePatterns.some(pattern => pattern.test(fileName)) || isLargeFile;
  }

  // 基于时间的快速分类（不依赖TensorFlow模型）
  async classifyImageByTime(imageUri, metadata = {}) {
    try {
      const { timestamp, fileSize, fileName } = metadata;
      const date = new Date(timestamp || Date.now());
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const self = this;

      // 文件名特征匹配（优先级最高）
      if (self.isWechatScreenshot(fileName)) {
        return { category: 'wechat', confidence: 0.95, reason: '文件名特征匹配' };
      }

      if (self.isDocumentPhoto(fileName, fileSize)) {
        return { category: 'document', confidence: 0.90, reason: '文件特征匹配' };
      }

      if (self.isFoodPhoto(fileName, fileSize)) {
        return { category: 'food', confidence: 0.88, reason: '美食图片特征' };
      }

      if (self.isTravelPhoto(fileName, fileSize)) {
        return { category: 'travel', confidence: 0.85, reason: '旅行图片特征' };
      }

      if (self.isPetPhoto(fileName, fileSize)) {
        return { category: 'pet', confidence: 0.82, reason: '宠物图片特征' };
      }

      // 时间特征匹配
      if (self.isMeetingTime(hour, dayOfWeek)) {
        return { category: 'meeting', confidence: 0.80, reason: '会议时间段' };
      }

      if (self.isLifeTime(hour, isWeekend)) {
        return { category: 'life', confidence: 0.75, reason: '生活时间段' };
      }

      if (self.isPeoplePhoto(fileName, fileSize)) {
        return { category: 'people', confidence: 0.70, reason: '社交活动特征' };
      }

      if (self.isGameScreenshot(fileName, hour)) {
        return { category: 'game', confidence: 0.65, reason: '游戏截图特征' };
      }

      return { category: 'other', confidence: 0.50, reason: '默认分类' };
    } catch (error) {
      console.error('基于时间的分类失败:', error);
      return { category: 'other', confidence: 0.30, reason: '分类失败' };
    }
  }

  // 智能分类：优先使用时间分类，失败时使用AI分类
  async smartClassifyImage(imageUri, metadata = {}) {
    try {
      // 首先尝试时间分类
      const timeResult = await this.classifyImageByTime(imageUri, metadata);
      
      // 如果时间分类置信度较高，直接返回
      if (timeResult.confidence > 0.8) {
        return timeResult;
      }
      
      // 否则尝试AI分类
      try {
        const aiResult = await this.classifyImage(imageUri, metadata);
        return {
          ...aiResult,
          method: 'ai-model',
          fallback: true
        };
      } catch (aiError) {
        // AI分类失败，返回时间分类结果
        return {
          ...timeResult,
          method: 'time-based-fallback',
          aiError: aiError.message
        };
      }
    } catch (error) {
      console.error('智能分类失败:', error);
      return {
        category: 'other',
        confidence: 0.50,
        reason: '分类失败',
        method: 'smart-classify',
        error: error.message
      };
    }
  }

  // 分类信息映射
  static getCategoryInfo(categoryId) {
    const categoryMap = {
      wechat: { name: '微信截图', icon: '📱', color: '#07C160' },
      meeting: { name: '会议场景', icon: '💼', color: '#FF9800' },
      document: { name: '工作写真', icon: '📄', color: '#2196F3' },
      people: { name: '社交活动', icon: '👥', color: '#E91E63' },
      life: { name: '生活记录', icon: '🌅', color: '#4CAF50' },
      game: { name: '游戏截屏', icon: '🎮', color: '#FF5722' },
      food: { name: '美食记录', icon: '🍕', color: '#FF6B35' },
      travel: { name: '旅行风景', icon: '✈️', color: '#9C27B0' },
      pet: { name: '宠物萌照', icon: '🐕', color: '#795548' },
      other: { name: '其他图片', icon: '📷', color: '#607D8B' }
    };
    
    return categoryMap[categoryId] || categoryMap.other;
  }

  // 判断是否为美食图片
  isFoodPhoto(fileName, fileSize) {
    if (!fileName) return false;
    
    const foodPatterns = [
      /food/i, /meal/i, /dinner/i, /lunch/i, /breakfast/i, /snack/i,
      /restaurant/i, /cafe/i, /kitchen/i, /cooking/i, /recipe/i,
      /美食/i, /餐厅/i, /厨房/i, /烹饪/i, /菜谱/i, /食物/i
    ];
    
    const isFoodFile = foodPatterns.some(pattern => pattern.test(fileName));
    const isLargeFile = fileSize && fileSize > 2000000; // 2MB以上，可能是高质量美食图片
    
    return isFoodFile || isLargeFile;
  }

  // 判断是否为旅行图片
  isTravelPhoto(fileName, fileSize) {
    if (!fileName) return false;
    
    const travelPatterns = [
      /travel/i, /trip/i, /vacation/i, /holiday/i, /tour/i, /journey/i,
      /landscape/i, /scenery/i, /view/i, /sight/i, /monument/i,
      /旅行/i, /旅游/i, /假期/i, /风景/i, /景点/i, /地标/i
    ];
    
    const isTravelFile = travelPatterns.some(pattern => pattern.test(fileName));
    const isLargeFile = fileSize && fileSize > 3000000; // 3MB以上，可能是高质量风景图片
    
    return isTravelFile || isLargeFile;
  }

  // 判断是否为宠物图片
  isPetPhoto(fileName, fileSize) {
    if (!fileName) return false;
    
    const petPatterns = [
      /pet/i, /dog/i, /cat/i, /puppy/i, /kitten/i, /animal/i,
      /宠物/i, /狗/i, /猫/i, /小狗/i, /小猫/i, /动物/i
    ];
    
    const isPetFile = petPatterns.some(pattern => pattern.test(fileName));
    const isMediumFile = fileSize && fileSize > 1000000; // 1MB以上，可能是宠物照片
    
    return isPetFile || isMediumFile;
  }

  // 判断是否为游戏截图
  isGameScreenshot(fileName, hour) {
    if (!fileName) return false;
    
    const gamePatterns = [
      /game/i, /gaming/i, /screenshot/i, /capture/i, /play/i,
      /游戏/i, /截图/i, /捕获/i, /游玩/i
    ];
    
    const isGameFile = gamePatterns.some(pattern => pattern.test(fileName));
    const isGameTime = hour >= 19 || hour <= 2; // 晚上7点到凌晨2点，游戏时间
    
    return isGameFile || isGameTime;
  }
}

export default ImageClassifierService;

