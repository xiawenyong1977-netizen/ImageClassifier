import i18n from 'i18next';
import zh from './locales/zh/common.json';
import en from './locales/en/common.json';

// 安全导入 AsyncStorage（支持 Web 和移动端）
// 使用动态导入避免 Metro bundler 的模块解析问题
let AsyncStorage;

// 检测平台
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

if (isReactNative) {
  // 移动端：直接使用原生模块
  try {
    const AsyncStorageNative = require('@react-native-async-storage/async-storage').default;
    AsyncStorage = {
      getItem: async (key) => {
        const value = await AsyncStorageNative.getItem(key);
        try {
          return value ? JSON.parse(value) : null;
        } catch {
          return value;
        }
      },
      setItem: async (key, value) => {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        return await AsyncStorageNative.setItem(key, stringValue);
      },
      removeItem: async (key) => {
        return await AsyncStorageNative.removeItem(key);
      },
      clear: async () => {
        return await AsyncStorageNative.clear();
      },
      getAllKeys: async () => {
        return await AsyncStorageNative.getAllKeys();
      }
    };
    console.log('✅ AsyncStorage 已从原生模块导入（移动端）');
  } catch (error) {
    console.error('❌ 移动端导入 AsyncStorage 失败:', error);
    // 尝试从 WebAdapters 导入作为降级
    try {
      const WebAdapters = require('../adapters/WebAdapters');
      AsyncStorage = WebAdapters.AsyncStorage;
      console.log('✅ AsyncStorage 已从 WebAdapters 导入（降级方案）');
    } catch (fallbackError) {
      console.error('❌ 降级导入也失败:', fallbackError);
      throw new Error('Failed to import AsyncStorage: ' + error.message);
    }
  }
} else {
  // Web/Desktop：从 WebAdapters 导入
  try {
    const WebAdapters = require('../adapters/WebAdapters');
    AsyncStorage = WebAdapters.AsyncStorage;
    if (!AsyncStorage) {
      throw new Error('AsyncStorage not found in WebAdapters');
    }
    console.log('✅ AsyncStorage 已从 WebAdapters 导入（Web/Desktop）');
  } catch (error) {
    console.error('❌ Web/Desktop 导入 AsyncStorage 失败:', error);
    throw new Error('Failed to import AsyncStorage: ' + error.message);
  }
}

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
    
    // React Native 环境：尝试使用 react-native-localize（如果已安装）
    // 使用动态 require 避免 webpack 静态分析警告
    if (typeof require !== 'undefined') {
      try {
        // 使用动态 require，webpack 不会静态分析
        const localizeModule = require('react-native-localize');
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
    
    // 默认返回中文
    return 'zh';
  } catch (error) {
    console.warn('⚠️ 检测系统语言失败，使用默认中文:', error);
    return 'zh';
  }
};

// 从AsyncStorage读取保存的语言设置（同步版本，用于初始化）
const getSavedLanguageSync = () => {
  try {
    // React Native AsyncStorage是异步的，但初始化需要同步
    // 先使用系统语言，然后在App启动后异步更新
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
    const savedLanguage = await AsyncStorage.getItem('app_language');
    console.log('🌐 加载保存的语言设置:', savedLanguage);
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
      console.log('🌐 切换到保存的语言:', savedLanguage);
      await i18n.changeLanguage(savedLanguage);
      console.log('🌐 当前i18n语言:', i18n.language);
    } else {
      // 首次安装：如果 AsyncStorage 中没有语言设置，根据系统语言初始化
      const defaultLanguage = detectSystemLanguage();
      console.log('🌐 未找到保存的语言设置，检测到系统语言:', defaultLanguage);
      // 确保 i18n.language 与检测到的系统语言一致
      if (i18n.language !== defaultLanguage) {
        await i18n.changeLanguage(defaultLanguage);
      }
      // 首次安装时，将系统语言保存到 AsyncStorage，确保后续扫描时能正确读取
      try {
        await AsyncStorage.setItem('app_language', defaultLanguage);
        console.log('🌐 已初始化系统语言设置到 AsyncStorage:', defaultLanguage);
      } catch (error) {
        console.warn('⚠️ 保存系统语言设置失败（不影响使用）:', error);
      }
    }
  } catch (error) {
    console.error('❌ 加载保存的语言设置失败:', error);
    // 出错时使用系统语言
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
    await AsyncStorage.setItem('app_language', lng);
    const savedValue = await AsyncStorage.getItem('app_language');
    console.log('🌐 验证保存的语言值:', savedValue);
    await i18n.changeLanguage(lng);
    console.log('🌐 i18n语言已切换为:', i18n.language);
  } catch (error) {
    console.error('❌ 切换语言失败:', error);
  }
};

// 导出获取当前语言的函数（同步版本，优先使用 i18n.language）
export const getCurrentLanguage = () => {
  return i18n.language || 'zh';
};

// 导出异步获取当前语言的函数（从 AsyncStorage 读取，更可靠）
export const getCurrentLanguageAsync = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('app_language');
    if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
      // 同时更新 i18n.language 以保持同步
      if (i18n.language !== savedLanguage) {
        await i18n.changeLanguage(savedLanguage);
      }
      return savedLanguage;
    }
    // 如果没有保存的语言设置（首次安装），使用系统语言并初始化 AsyncStorage
    const defaultLanguage = detectSystemLanguage();
    console.log('🌐 首次使用，检测到系统语言:', defaultLanguage);
    try {
      // 确保 AsyncStorage 中有语言设置，方便后续读取
      await AsyncStorage.setItem('app_language', defaultLanguage);
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

export default i18n;
