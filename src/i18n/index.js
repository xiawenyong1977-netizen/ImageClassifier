import i18n from 'i18next';
import zh from './locales/zh/common.json';
import en from './locales/en/common.json';

// 检测平台（用于判断是否是 React Native 环境）
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// 延迟导入 ImageStorageService，避免循环依赖
// ImageStorageService 导入了 getDefaultPresets from this file
let ImageStorageServiceInstance = null;
let ImageStorageServicePromise = null;

const getImageStorageService = async () => {
  if (!ImageStorageServiceInstance) {
    if (!ImageStorageServicePromise) {
      // 使用动态 import 避免循环依赖和 Metro bundler 静态分析
      // 在 React Native 中，eval('require') 不可用，必须使用动态 import
      // 注意：路径是相对于当前文件（src/i18n/index.js）的，所以需要 ../services/
      ImageStorageServicePromise = import('../services/ImageStorageService.js').then(module => {
        const ImageStorageService = module.default;
        ImageStorageServiceInstance = new ImageStorageService();
        return ImageStorageServiceInstance;
      });
    }
    await ImageStorageServicePromise;
  }
  return ImageStorageServiceInstance;
};

// 安全导入 initReactI18next
// 使用标准的 ES6 import 语法（React Native 支持）
import { initReactI18next } from 'react-i18next';

// 验证 initReactI18next 是否正确导入
if (typeof initReactI18next === 'undefined') {
  console.error('❌ initReactI18next 未找到，请检查 react-i18next 是否正确安装');
  console.error('尝试检查 node_modules/react-i18next 是否存在');
  throw new Error('initReactI18next is undefined. Please check if react-i18next is properly installed.');
}

// 语言资源
const resources = {
  zh: {
    common: zh,
  },
  en: {
    common: en,
  },
};

/**
 * 检测系统语言环境
 * @returns {string} 检测到的语言代码 ('zh' 或 'en')，如果无法检测则返回 'zh'
 */
const detectSystemLanguage = () => {
  try {
    // Web/Desktop 环境：使用 navigator.language
    if (typeof navigator !== 'undefined' && navigator.language) {
      const systemLang = navigator.language.toLowerCase();
      // 检查是否是中文（包括 zh-CN, zh-TW, zh-HK 等）
      if (systemLang.startsWith('zh')) {
        return 'zh';
      }
      // 检查是否是英文（包括 en-US, en-GB, en-AU 等）
      if (systemLang.startsWith('en')) {
        return 'en';
      }
    }
    
    // React Native 环境：react-native-localize 需要异步导入
    // 这里先返回默认值，在异步函数中再尝试检测
    // 避免在同步初始化时使用动态 require 导致 release 构建失败
    
    // 默认返回中文
    return 'zh';
  } catch (error) {
    console.warn('⚠️ 检测系统语言失败，使用默认中文:', error);
    return 'zh';
  }
};

/**
 * 异步检测系统语言环境（使用 react-native-localize）
 * @returns {Promise<string>} 检测到的语言代码
 */
const detectSystemLanguageAsync = async () => {
  if (isReactNative) {
    try {
      // 使用动态 import 避免 release 构建时的 require undefined 问题
      const localizeModule = await import('react-native-localize').catch(() => null);
      if (localizeModule && localizeModule.getLocales) {
        const locales = localizeModule.getLocales();
        if (locales && locales.length > 0) {
          const systemLang = locales[0].languageCode.toLowerCase();
          if (systemLang === 'zh') {
            return 'zh';
          }
          if (systemLang === 'en') {
            return 'en';
          }
        }
      }
    } catch (e) {
      // react-native-localize 未安装，忽略
    }
  }
  return 'zh';
};

// 从AsyncStorage读取保存的语言设置（同步版本，用于初始化）
const getSavedLanguageSync = () => {
  try {
    // React Native AsyncStorage是异步的，但初始化需要同步
    // 先使用系统语言（同步检测），然后在App启动后异步更新
    return detectSystemLanguage();
  } catch (error) {
    console.error('读取语言设置失败:', error);
    return 'zh';
  }
};

// 初始化i18n（同步初始化）
i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguageSync(),
    fallbackLng: 'zh',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React已经转义了
    },
    compatibilityJSON: 'v3', // 兼容React Native
  });

// 在App启动后异步加载保存的语言设置
export const loadSavedLanguage = async () => {
  try {
    const storageService = await getImageStorageService();
    const settings = await storageService.getSettings();
    const savedLanguage = settings?.app_language;
    
    console.log('🌐 加载保存的语言设置:', savedLanguage);
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
      console.log('🌐 切换到保存的语言:', savedLanguage);
      await i18n.changeLanguage(savedLanguage);
      console.log('🌐 当前i18n语言:', i18n.language);
    } else {
      // 首次安装：如果 settings 中没有语言设置，根据系统语言初始化
      // 使用异步检测以支持 react-native-localize
      const defaultLanguage = await detectSystemLanguageAsync();
      console.log('🌐 未找到保存的语言设置，检测到系统语言:', defaultLanguage);
      // 确保 i18n.language 与检测到的系统语言一致
      if (i18n.language !== defaultLanguage) {
        await i18n.changeLanguage(defaultLanguage);
      }
      // 首次安装时，将系统语言保存到 settings，确保后续扫描时能正确读取
      try {
        await storageService.saveSettings({ ...settings, app_language: defaultLanguage }, true);
        console.log('🌐 已初始化系统语言设置到 settings:', defaultLanguage);
      } catch (error) {
        console.warn('⚠️ 保存系统语言设置失败（不影响使用）:', error);
      }
    }
  } catch (error) {
    console.error('❌ 加载保存的语言设置失败:', error);
    // 出错时使用默认语言
    const defaultLanguage = detectSystemLanguage();
    if (i18n.language !== defaultLanguage) {
      await i18n.changeLanguage(defaultLanguage);
    }
  }
};

// 导出切换语言的函数
export const changeLanguage = async (lng) => {
  try {
    console.log('🌐 切换语言到:', lng);
    
    // 验证语言代码
    if (lng !== 'zh' && lng !== 'en') {
      throw new Error(`不支持的语言代码: ${lng}`);
    }
    
    const storageService = await getImageStorageService();
    const settings = await storageService.getSettings();
    
    // 保存语言设置
    await storageService.saveSettings({ ...settings, app_language: lng });
    
    // 验证保存是否成功
    const updatedSettings = await storageService.getSettings();
    console.log('🌐 验证保存的语言值:', updatedSettings?.app_language);
    
    if (updatedSettings?.app_language !== lng) {
      throw new Error(`语言设置保存失败，期望: ${lng}, 实际: ${updatedSettings?.app_language}`);
    }
    
    // 切换 i18n 语言
    await i18n.changeLanguage(lng);
    console.log('🌐 i18n语言已切换为:', i18n.language);
    
    // 验证 i18n 语言是否切换成功
    if (i18n.language !== lng) {
      console.warn('⚠️ i18n语言切换后不一致，期望:', lng, '实际:', i18n.language);
    }
  } catch (error) {
    console.error('❌ 切换语言失败:', error);
    // 重新抛出错误，让调用者知道失败
    throw error;
  }
};

// 导出获取当前语言的函数（同步版本，优先使用 i18n.language）
export const getCurrentLanguage = () => {
  return i18n.language || 'zh';
};

// 导出异步获取当前语言的函数（从 settings 读取，更可靠）
export const getCurrentLanguageAsync = async () => {
  try {
    const storageService = await getImageStorageService();
    const settings = await storageService.getSettings();
    const savedLanguage = settings?.app_language;
    
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
      // 同时更新 i18n.language 以保持同步
      if (i18n.language !== savedLanguage) {
        await i18n.changeLanguage(savedLanguage);
      }
      return savedLanguage;
    }
    // 如果没有保存的语言设置（首次安装），使用系统语言并初始化 settings
    // 使用异步检测以支持 react-native-localize
    const defaultLanguage = await detectSystemLanguageAsync();
    console.log('🌐 首次使用，检测到系统语言:', defaultLanguage);
    try {
      // 确保 settings 中有语言设置，方便后续读取
      await storageService.saveSettings({ ...settings, app_language: defaultLanguage }, true);
      // 同时更新 i18n.language
      if (i18n.language !== defaultLanguage) {
        await i18n.changeLanguage(defaultLanguage);
      }
    } catch (error) {
      console.warn('⚠️ 初始化语言设置失败（使用内存中的值）:', error);
    }
    return i18n.language || defaultLanguage;
  } catch (error) {
    console.error('❌ 读取语言设置失败:', error);
    // 出错时返回默认值
    return i18n.language || 'zh';
  }
};

// 获取缺省预设配置（根据语言）
export const getDefaultPresets = (lang = null) => {
  const currentLang = lang || getCurrentLanguage();
  const presets = {
    portrait: {
      name: i18n.t('settings.defaultPresets.portrait.name', { lng: currentLang }),
      icon: '👤',
      prompt: i18n.t('settings.defaultPresets.portrait.prompt', { lng: currentLang }),
      description: i18n.t('settings.defaultPresets.portrait.description', { lng: currentLang }),
      enabled: true,
      sortOrder: 1
    },
    enhance: {
      name: i18n.t('settings.defaultPresets.enhance.name', { lng: currentLang }),
      icon: '✨',
      prompt: i18n.t('settings.defaultPresets.enhance.prompt', { lng: currentLang }),
      description: i18n.t('settings.defaultPresets.enhance.description', { lng: currentLang }),
      enabled: true,
      sortOrder: 2
    },
    color: {
      name: i18n.t('settings.defaultPresets.color.name', { lng: currentLang }),
      icon: '🎨',
      prompt: i18n.t('settings.defaultPresets.color.prompt', { lng: currentLang }),
      description: i18n.t('settings.defaultPresets.color.description', { lng: currentLang }),
      enabled: true,
      sortOrder: 3
    },
    document: {
      name: i18n.t('settings.defaultPresets.document.name', { lng: currentLang }),
      icon: '🪪',
      prompt: i18n.t('settings.defaultPresets.document.prompt', { lng: currentLang }),
      description: i18n.t('settings.defaultPresets.document.description', { lng: currentLang }),
      enabled: true,
      sortOrder: 4
    },
    custom: {
      name: i18n.t('settings.defaultPresets.custom.name', { lng: currentLang }),
      icon: '⚙️',
      prompt: i18n.t('settings.defaultPresets.custom.prompt', { lng: currentLang }),
      description: i18n.t('settings.defaultPresets.custom.description', { lng: currentLang }),
      enabled: true,
      sortOrder: 5
    }
  };
  return presets;
};

// 颜色名称映射表（服务器返回的颜色名称 -> 中英文对应）
const COLOR_NAME_MAP = {
  // 中文 -> 英文
  '橙色': 'Orange',
  '蓝色': 'Blue',
  '红色': 'Red',
  '绿色': 'Green',
  '紫色': 'Purple',
  '粉色': 'Pink',
  '黄色': 'Yellow',
  '灰色': 'Gray',
  '黑色': 'Black',
  '白色': 'White',
  // 英文 -> 中文
  'Orange': '橙色',
  'Blue': '蓝色',
  'Red': '红色',
  'Green': '绿色',
  'Purple': '紫色',
  'Pink': '粉色',
  'Yellow': '黄色',
  'Gray': '灰色',
  'Grey': '灰色', // 兼容 Grey 拼写
  'Black': '黑色',
  'White': '白色',
  // 小写英文 -> 中文
  'orange': '橙色',
  'blue': '蓝色',
  'red': '红色',
  'green': '绿色',
  'purple': '紫色',
  'pink': '粉色',
  'yellow': '黄色',
  'gray': '灰色',
  'grey': '灰色',
  'black': '黑色',
  'white': '白色',
};

/**
 * 获取颜色名称的翻译（根据当前语言）
 * @param {string} colorName - 服务器返回的颜色名称
 * @param {string} language - 目标语言 ('zh' 或 'en')，默认为当前语言
 * @returns {string} 翻译后的颜色名称，如果找不到映射则返回原始值
 */
export const getColorNameTranslation = (colorName, language = null) => {
  if (!colorName || typeof colorName !== 'string') {
    return colorName;
  }

  const targetLang = language || getCurrentLanguage();
  const normalizedColorName = colorName.trim();

  // 如果已经是目标语言，直接返回
  if (targetLang === 'zh') {
    // 目标语言是中文
    // 检查是否是中文颜色名称
    if (COLOR_NAME_MAP[normalizedColorName] && 
        ['橙色', '蓝色', '红色', '绿色', '紫色', '粉色', '黄色', '灰色', '黑色', '白色'].includes(normalizedColorName)) {
      return normalizedColorName; // 已经是中文，直接返回
    }
    // 尝试从英文映射到中文
    const chineseName = COLOR_NAME_MAP[normalizedColorName];
    if (chineseName && ['橙色', '蓝色', '红色', '绿色', '紫色', '粉色', '黄色', '灰色', '黑色', '白色'].includes(chineseName)) {
      return chineseName;
    }
  } else {
    // 目标语言是英文
    // 检查是否是英文颜色名称
    const englishNames = ['Orange', 'Blue', 'Red', 'Green', 'Purple', 'Pink', 'Yellow', 'Gray', 'Grey', 'Black', 'White'];
    if (englishNames.includes(normalizedColorName) || englishNames.map(n => n.toLowerCase()).includes(normalizedColorName.toLowerCase())) {
      // 首字母大写
      return normalizedColorName.charAt(0).toUpperCase() + normalizedColorName.slice(1).toLowerCase();
    }
    // 尝试从中文映射到英文
    const englishName = COLOR_NAME_MAP[normalizedColorName];
    if (englishName && englishNames.includes(englishName)) {
      return englishName;
    }
  }

  // 如果找不到映射，返回原始值
  return colorName;
};

// 方向名称映射表（中文 -> 英文）
const ORIENTATION_NAME_MAP = {
  // 中文 -> 英文
  '横屏': 'Landscape',
  '竖屏': 'Portrait',
  '正方形': 'Square',
  '全景': 'Panorama',
  // 英文 -> 中文
  'Landscape': '横屏',
  'Portrait': '竖屏',
  'Square': '正方形',
  'Panorama': '全景',
  // 小写英文 -> 中文
  'landscape': '横屏',
  'portrait': '竖屏',
  'square': '正方形',
  'panorama': '全景',
};

/**
 * 获取方向名称的翻译（根据当前语言）
 * @param {string} orientationName - 方向名称（如 '横屏', '竖屏', '正方形', '全景'）
 * @param {string} language - 目标语言 ('zh' 或 'en')，默认为当前语言
 * @returns {string} 翻译后的方向名称，如果找不到映射则返回原始值
 */
export const getOrientationNameTranslation = (orientationName, language = null) => {
  if (!orientationName || typeof orientationName !== 'string') {
    return orientationName;
  }

  const targetLang = language || getCurrentLanguage();
  const normalizedOrientationName = orientationName.trim();

  // 如果已经是目标语言，直接返回
  if (targetLang === 'zh') {
    // 目标语言是中文
    // 检查是否是中文方向名称（支持多种表达）
    const chineseNames = ['横屏', '横向', '竖屏', '纵向', '正方形', '全景'];
    if (chineseNames.includes(normalizedOrientationName)) {
      // 使用 i18n 翻译键获取标准显示名称
      try {
        if (normalizedOrientationName === '横屏' || normalizedOrientationName === '横向') {
          return i18n.t('home.orientation.landscape', { lng: 'zh' });
        }
        if (normalizedOrientationName === '竖屏' || normalizedOrientationName === '纵向') {
          return i18n.t('home.orientation.portrait', { lng: 'zh' });
        }
        if (normalizedOrientationName === '正方形') {
          return i18n.t('home.orientation.square', { lng: 'zh' });
        }
        if (normalizedOrientationName === '全景') {
          return i18n.t('home.orientation.panorama', { lng: 'zh' });
        }
      } catch (e) {
        // 翻译失败，使用原始值
      }
      return normalizedOrientationName;
    }
    // 尝试从英文映射到中文
    const englishName = ORIENTATION_NAME_MAP[normalizedOrientationName];
    if (englishName) {
      // 使用 i18n 翻译键获取标准显示名称
      try {
        if (englishName === 'Landscape') {
          return i18n.t('home.orientation.landscape', { lng: 'zh' });
        }
        if (englishName === 'Portrait') {
          return i18n.t('home.orientation.portrait', { lng: 'zh' });
        }
        if (englishName === 'Square') {
          return i18n.t('home.orientation.square', { lng: 'zh' });
        }
        if (englishName === 'Panorama') {
          return i18n.t('home.orientation.panorama', { lng: 'zh' });
        }
      } catch (e) {
        // 翻译失败，使用映射值
        return englishName === 'Landscape' ? '横屏' : 
               englishName === 'Portrait' ? '竖屏' : 
               englishName === 'Square' ? '正方形' : 
               englishName === 'Panorama' ? '全景' : normalizedOrientationName;
      }
    }
  } else {
    // 目标语言是英文
    // 检查是否是英文方向名称（支持 Landscape/Portrait 和 Horizontal/Vertical）
    const englishNames = ['Landscape', 'Portrait', 'Horizontal', 'Vertical', 'Square', 'Panorama'];
    const lowerEnglishNames = ['landscape', 'portrait', 'horizontal', 'vertical', 'square', 'panorama'];
    if (englishNames.includes(normalizedOrientationName) || 
        lowerEnglishNames.includes(normalizedOrientationName.toLowerCase())) {
      // 使用 i18n 翻译键获取标准显示名称（统一使用 horizontal/vertical）
      try {
        let lowerName = normalizedOrientationName.toLowerCase();
        // 兼容旧的 landscape/portrait，映射到 horizontal/vertical
        if (lowerName === 'landscape') lowerName = 'horizontal';
        if (lowerName === 'portrait') lowerName = 'vertical';
        return i18n.t(`home.orientation.${lowerName}`, { lng: 'en' });
      } catch (e) {
        // 翻译失败，使用 Horizontal/Vertical 作为标准
        const lowerName = normalizedOrientationName.toLowerCase();
        if (lowerName === 'landscape' || lowerName === 'horizontal') return 'Horizontal';
        if (lowerName === 'portrait' || lowerName === 'vertical') return 'Vertical';
        // 首字母大写返回
        return normalizedOrientationName.charAt(0).toUpperCase() + normalizedOrientationName.slice(1).toLowerCase();
      }
    }
    // 尝试从中文映射到英文
    const englishName = ORIENTATION_NAME_MAP[normalizedOrientationName];
    if (englishName && ['Landscape', 'Portrait', 'Horizontal', 'Vertical', 'Square', 'Panorama'].includes(englishName)) {
      // 使用 i18n 翻译键获取标准显示名称（统一使用 horizontal/vertical）
      try {
        let lowerName = englishName.toLowerCase();
        // 兼容旧的 landscape/portrait，映射到 horizontal/vertical
        if (lowerName === 'landscape') lowerName = 'horizontal';
        if (lowerName === 'portrait') lowerName = 'vertical';
        return i18n.t(`home.orientation.${lowerName}`, { lng: 'en' });
      } catch (e) {
        // 翻译失败，使用 Horizontal/Vertical 作为标准
        if (englishName === 'Landscape' || englishName === 'Horizontal') return 'Horizontal';
        if (englishName === 'Portrait' || englishName === 'Vertical') return 'Vertical';
        return englishName;
      }
    }
  }

  // 如果找不到映射，返回原始值
  return orientationName;
};

/**
 * 获取拍摄参数分类值的翻译（根据当前语言）
 * @param {string} categoryType - 分类类型 ('iso', 'aperture', 'shutter', 'focalLength')
 * @param {string} categoryValue - 分类值（如 'low', 'medium', 'high', 'wide', 'narrow', 'fast', 'slow', 'standard', 'telephoto'）
 * @param {string} language - 目标语言 ('zh' 或 'en')，默认为当前语言
 * @returns {string} 翻译后的分类值，如果找不到映射则返回原始值
 */
export const getCameraSettingsCategoryTranslation = (categoryType, categoryValue, language = null) => {
  if (!categoryType || !categoryValue || typeof categoryValue !== 'string') {
    return categoryValue;
  }

  const targetLang = language || getCurrentLanguage();
  const normalizedValue = categoryValue.trim().toLowerCase();

  try {
    // 🔥 直接使用导入的翻译对象，而不是通过 getResourceBundle（可能缓存问题）
    const translationObj = targetLang === 'zh' ? zh : en;
    
    // 🔥 详细调试日志
    if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
      console.log(`📷 [调试开始] categoryType=${categoryType}, categoryValue=${categoryValue}, normalizedValue=${normalizedValue}, targetLang=${targetLang}`);
      console.log(`📷 [调试] translationObj存在=${!!translationObj}, settings存在=${!!translationObj?.settings}, cameraSettings存在=${!!translationObj?.settings?.cameraSettings}`);
      if (translationObj?.settings) {
        console.log(`📷 [调试] settings的所有键=${Object.keys(translationObj.settings).slice(0, 30).join(',')}`);
      }
      if (translationObj?.settings?.cameraSettings) {
        console.log(`📷 [调试] cameraSettings keys=${Object.keys(translationObj.settings.cameraSettings).join(',')}`);
        if (translationObj.settings.cameraSettings[categoryType]) {
          console.log(`📷 [调试] ${categoryType} keys=${Object.keys(translationObj.settings.cameraSettings[categoryType]).join(',')}`);
          console.log(`📷 [调试] ${categoryType}.${normalizedValue}=${translationObj.settings.cameraSettings[categoryType][normalizedValue]}`);
        }
      }
    }
    
    // 优先从 settings.cameraSettings 读取
    if (translationObj && translationObj.settings && translationObj.settings.cameraSettings && 
        translationObj.settings.cameraSettings[categoryType] && 
        translationObj.settings.cameraSettings[categoryType][normalizedValue]) {
      const translated = translationObj.settings.cameraSettings[categoryType][normalizedValue];
      
      // 🔥 调试日志（仅在开发环境）
      if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
        console.log(`📷 [翻译成功-直接访问] categoryType=${categoryType}, categoryValue=${categoryValue}, normalizedValue=${normalizedValue}, translated=${translated}, targetLang=${targetLang}`);
      }
      
      return translated;
    }
    
    // 如果 settings.cameraSettings 不存在，尝试从 category.cameraSettings 读取（向后兼容）
    if (translationObj && translationObj.category && translationObj.category.cameraSettings && 
        translationObj.category.cameraSettings[categoryType] && 
        translationObj.category.cameraSettings[categoryType][normalizedValue]) {
      const translated = translationObj.category.cameraSettings[categoryType][normalizedValue];
      
      // 🔥 调试日志（仅在开发环境）
      if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
        console.log(`📷 [翻译成功-向后兼容category] categoryType=${categoryType}, categoryValue=${categoryValue}, normalizedValue=${normalizedValue}, translated=${translated}, targetLang=${targetLang}`);
      }
      
      return translated;
    }
    
    // 如果直接访问失败，尝试使用 getResourceBundle
    const resources = i18n.getResourceBundle(targetLang, 'common');
    if (resources && resources.settings && resources.settings.cameraSettings && 
        resources.settings.cameraSettings[categoryType] && 
        resources.settings.cameraSettings[categoryType][normalizedValue]) {
      const translated = resources.settings.cameraSettings[categoryType][normalizedValue];
      return translated;
    }
    
    // 向后兼容：尝试从 category.cameraSettings 读取
    if (resources && resources.category && resources.category.cameraSettings && 
        resources.category.cameraSettings[categoryType] && 
        resources.category.cameraSettings[categoryType][normalizedValue]) {
      const translated = resources.category.cameraSettings[categoryType][normalizedValue];
      return translated;
    }
    
    // 如果直接访问失败，尝试使用 i18n.t
    const translationKey = `settings.cameraSettings.${categoryType}.${normalizedValue}`;
    const translated = i18n.t(translationKey, { 
      lng: targetLang,
      defaultValue: categoryValue // 如果翻译不存在，使用原始值
    });
    
    // 🔥 调试日志（仅在开发环境）
    if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
      console.log(`📷 [翻译-i18n.t] categoryType=${categoryType}, categoryValue=${categoryValue}, normalizedValue=${normalizedValue}, translationKey=${translationKey}, translated=${translated}, targetLang=${targetLang}`);
      console.log(`📷 [调试] translationObj存在=${!!translationObj}, settings存在=${!!translationObj?.settings}, cameraSettings存在=${!!translationObj?.settings?.cameraSettings}`);
      if (translationObj?.settings?.cameraSettings) {
        console.log(`📷 [调试] cameraSettings keys=${Object.keys(translationObj.settings.cameraSettings).join(',')}`);
      }
    }
    
    // 如果翻译成功（返回值不等于键名且不等于原始值），返回翻译
    if (translated && translated !== translationKey && translated !== categoryValue) {
      return translated;
    }
    
    // 向后兼容：尝试使用 category.cameraSettings 的翻译键
    const categoryTranslationKey = `category.cameraSettings.${categoryType}.${normalizedValue}`;
    const categoryTranslated = i18n.t(categoryTranslationKey, { 
      lng: targetLang,
      defaultValue: categoryValue
    });
    
    if (categoryTranslated && categoryTranslated !== categoryTranslationKey && categoryTranslated !== categoryValue) {
      return categoryTranslated;
    }
  } catch (e) {
    // 翻译失败，继续使用原始值
    if (process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost')) {
      console.error(`❌ [翻译失败] categoryType=${categoryType}, categoryValue=${categoryValue}:`, e);
    }
  }

  // 如果找不到映射，返回原始值（首字母大写）
  return categoryValue.charAt(0).toUpperCase() + categoryValue.slice(1).toLowerCase();
};

export default i18n;
