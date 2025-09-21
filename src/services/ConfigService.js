/**
 * ConfigService - 配置管理服务
 * 负责读取和管理 initialSettings.json 配置文件
 */

class ConfigService {
  constructor() {
    this.config = null;
    this.isLoaded = false;
  }

  /**
   * 初始化配置服务
   * @returns {Promise<boolean>} 是否成功加载配置
   */
  async initialize() {
    try {
      console.log('🔧 开始加载配置文件...');
      
      // 根据环境选择配置文件路径
      const configPath = this.getConfigPath();
      console.log('🔧 配置文件路径:', configPath);
      console.log('🔧 环境信息:', {
        hasWindow: typeof window !== 'undefined',
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
        origin: typeof window !== 'undefined' ? window.location.origin : 'N/A'
      });
      
      // 加载配置文件
      const response = await fetch(configPath);
      console.log('🔧 响应状态:', response.status, response.statusText);
      console.log('🔧 响应头 Content-Type:', response.headers.get('content-type'));
      
      if (!response.ok) {
        throw new Error(`配置文件加载失败: ${response.status} ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log('🔧 响应内容前200字符:', responseText.substring(0, 200));
      
      // 检查是否是HTML内容
      if (responseText.trim().startsWith('<!DOCTYPE')) {
        throw new Error('获取到HTML内容而不是JSON文件，可能是路径错误或服务器配置问题');
      }
      
      this.config = JSON.parse(responseText);
      this.isLoaded = true;
      
      console.log('✅ 配置文件加载成功');
      console.log(`📊 配置统计:`, {
        models: Object.keys(this.config.models || {}).length,
        categories: Object.keys(this.config.categoryNameMap || {}).length,
        yoloObjects: Object.keys(this.config.yoloObjectNameMap || {}).length,
        imagenetClasses: Object.keys(this.config.mobilenetv3Classes || {}).length
      });
      
      return true;
    } catch (error) {
      console.error('❌ 配置文件加载失败:', error);
      this.isLoaded = false;
      return false;
    }
  }

  /**
   * 获取配置文件路径
   * @returns {string} 配置文件路径
   */
  getConfigPath() {
    // 在浏览器环境和Electron开发环境中都使用HTTP方式访问
    if (typeof window !== 'undefined') {
      console.log('🔧 window.location:', {
        hostname: window.location.hostname,
        origin: window.location.origin,
        href: window.location.href
      });
      
      // 直接使用 localhost:3000，因为我们已经验证这个路径可以工作
      return 'http://localhost:3000/initialSettings.json';
    }
    // 在纯Node.js环境中使用public目录下的文件
    return './public/initialSettings.json';
  }

  /**
   * 获取模型配置
   * @param {string} modelName - 模型名称
   * @returns {Object|null} 模型配置
   */
  getModelConfig(modelName) {
    if (!this.isLoaded || !this.config?.models) {
      console.warn('⚠️ 配置未加载或模型配置不存在');
      return null;
    }
    return this.config.models[modelName] || null;
  }

  /**
   * 获取所有模型配置
   * @returns {Object} 所有模型配置
   */
  getAllModelConfigs() {
    if (!this.isLoaded || !this.config?.models) {
      console.warn('⚠️ 配置未加载或模型配置不存在');
      return {};
    }
    return this.config.models;
  }

  /**
   * 获取分类名称映射
   * @returns {Object} 分类名称映射
   */
  getCategoryNameMap() {
    if (!this.isLoaded || !this.config?.categoryNameMap) {
      console.warn('⚠️ 配置未加载或分类名称映射不存在');
      return {};
    }
    return this.config.categoryNameMap;
  }

  /**
   * 获取YOLO物体名称映射
   * @returns {Object} YOLO物体名称映射
   */
  getYoloObjectNameMap() {
    if (!this.isLoaded || !this.config?.yoloObjectNameMap) {
      console.warn('⚠️ 配置未加载或YOLO物体名称映射不存在');
      return {};
    }
    return this.config.yoloObjectNameMap;
  }

  /**
   * 获取MobileNetV3类别映射
   * @returns {Object} MobileNetV3类别映射
   */
  getMobileNetV3Classes() {
    if (!this.isLoaded || !this.config?.mobilenetv3Classes) {
      console.warn('⚠️ 配置未加载或MobileNetV3类别映射不存在');
      return {};
    }
    return this.config.mobilenetv3Classes;
  }

  /**
   * 获取分类显示顺序
   * @returns {Array} 分类显示顺序数组
   */
  getCategoryDisplayOrder() {
    if (!this.isLoaded || !this.config?.categoryDisplayOrder) {
      console.warn('⚠️ 配置未加载或分类显示顺序不存在');
      return [];
    }
    return this.config.categoryDisplayOrder;
  }

  /**
   * 获取所有分类信息（按显示顺序排序）
   * @returns {Array} 分类信息数组，按categoryDisplayOrder排序
   */
  getAllCategoriesWithUI() {
    const categoryMap = this.getCategoryNameMap();
    const displayOrder = this.getCategoryDisplayOrder();
    
    // 按显示顺序返回分类信息
    return displayOrder
      .filter(categoryId => categoryMap[categoryId]) // 确保分类存在
      .map(categoryId => ({
        id: categoryId,
        ...categoryMap[categoryId]
      }));
  }

  /**
   * 获取分类的完整信息
   * @param {string} categoryId - 分类ID
   * @returns {Object|null} 分类完整信息
   */
  getCategoryWithUI(categoryId) {
    const categoryMap = this.getCategoryNameMap();
    const category = categoryMap[categoryId];
    
    if (!category) return null;
    
    return {
      id: categoryId,
      ...category
    };
  }

  /**
   * 根据ID获取分类信息
   * @param {string} categoryId - 分类ID
   * @returns {Object|null} 分类信息
   */
  getCategoryById(categoryId) {
    const categoryMap = this.getCategoryNameMap();
    return Object.values(categoryMap).find(category => category.id === categoryId) || null;
  }

  /**
   * 根据分类键名获取分类信息
   * @param {string} categoryKey - 分类键名（如 'people', 'pet' 等）
   * @returns {Object|null} 分类信息
   */
  getCategoryByKey(categoryKey) {
    const categoryMap = this.getCategoryNameMap();
    return categoryMap[categoryKey] || null;
  }

  /**
   * 获取分类显示名称
   * @param {string} categoryId - 分类ID
   * @param {string} language - 语言类型 ('chinese' 或 'english')
   * @returns {string} 显示名称
   */
  getCategoryDisplayName(categoryId, language = 'chinese') {
    const category = this.getCategoryById(categoryId);
    if (!category) return categoryId;
    
    return category[language] || category.chinese || category.english || categoryId;
  }

  /**
   * 获取所有分类ID列表（按显示顺序）
   * @returns {Array} 分类ID数组
   */
  getAllCategoryIds() {
    return this.getAllCategoriesWithUI().map(category => category.id);
  }

  /**
   * 根据ID获取YOLO物体信息
   * @param {number} objectId - 物体ID
   * @returns {Object|null} 物体信息
   */
  getYoloObjectById(objectId) {
    const objectMap = this.getYoloObjectNameMap();
    return Object.values(objectMap).find(obj => obj.id === objectId) || null;
  }

  /**
   * 根据英文名称获取MobileNetV3类别信息
   * @param {string} englishName - 英文名称
   * @returns {Object|null} 类别信息
   */
  getMobileNetV3ClassByEnglishName(englishName) {
    const classes = this.getMobileNetV3Classes();
    return classes[englishName] || null;
  }

  /**
   * 根据ID获取MobileNetV3类别信息
   * @param {number} classId - 类别ID
   * @returns {Object|null} 类别信息
   */
  getMobileNetV3ClassById(classId) {
    const classes = this.getMobileNetV3Classes();
    return Object.values(classes).find(cls => cls.id === classId) || null;
  }

  /**
   * 获取配置是否已加载
   * @returns {boolean} 是否已加载
   */
  isConfigLoaded() {
    // 如果配置未加载，返回false
    // 让调用方处理初始化逻辑
    return this.isLoaded;
  }

  /**
   * 获取完整配置对象
   * @returns {Object|null} 完整配置对象
   */
  getFullConfig() {
    if (!this.isLoaded) {
      console.warn('⚠️ 配置未加载');
      return null;
    }
    return this.config;
  }

  /**
   * 重新加载配置
   * @returns {Promise<boolean>} 是否成功重新加载
   */
  async reload() {
    console.log('🔄 重新加载配置文件...');
    this.isLoaded = false;
    this.config = null;
    return await this.initialize();
  }
}

// 创建单例实例
const configService = new ConfigService();

// 导出类和实例
export default configService;
export { ConfigService };
