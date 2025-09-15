# Electron + React Native Web 页面导航方案

## 项目概述

本项目采用 **Electron + React Native Web** 技术栈，实现跨平台的照片分类应用。导航系统设计为PC端和移动端提供统一的开发体验，同时针对不同平台进行优化。

## 技术架构

### 核心技术栈
- **Electron**: 桌面应用框架
- **React Native Web**: 将React Native组件转换为Web组件
- **React Navigation**: 移动端导航库（通过适配层）
- **自定义导航系统**: PC端简化的导航实现

### 平台适配策略
通过 `WebAdapters.js` 实现平台检测和API适配：

```javascript
// 平台检测
let Platform;
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    Platform = { OS: 'web' };  // Web/Electron环境
  } else {
    Platform = eval('require("react-native").Platform');  // 移动端环境
  }
} catch (error) {
  Platform = { OS: 'web' };  // 默认Web环境
}
```

## 导航系统设计

### 1. 移动端导航 (React Navigation)

**文件**: `src/App.js`

```javascript
import { NavigationContainer } from './adapters/WebAdapters';
import { createStackNavigator } from './adapters/WebAdapters';
import { createBottomTabNavigator } from './adapters/WebAdapters';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 主标签导航器
const MainTabNavigator = () => (
  <Tab.Navigator screenOptions={{...}}>
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);

// 主应用导航
<NavigationContainer>
  <Stack.Navigator>
    <Stack.Screen name="Main" component={MainTabNavigator} />
    <Stack.Screen name="Category" component={CategoryScreen} />
    <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} />
  </Stack.Navigator>
</NavigationContainer>
```

**特点**:
- 使用React Navigation原生API
- 支持标签导航和堆栈导航
- 完整的导航历史和状态管理

### 2. PC端导航 (自定义简化系统)

**文件**: `pc-version-final/src/App.desktop.js`

```javascript
import { NavigationContainer, createStackNavigator } from './adapters/WebAdapters';

const Stack = createStackNavigator();

export default function App() {
  const navigationRef = useRef(null);

  // Electron IPC监听
  useEffect(() => {
    if (typeof window !== 'undefined' && window.require) {
      const { ipcRenderer } = window.require('electron');
      
      // 监听菜单导航事件
      ipcRenderer.on('navigate-to-settings', (event, section) => {
        if (navigationRef.current) {
          navigationRef.current.navigate('Settings');
        }
      });
    }
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

**特点**:
- 简化的导航实现，只注册HomeScreen
- 通过IPC与Electron主进程通信
- 动态加载其他屏幕组件

## 导航适配层实现

### WebAdapters.js 导航适配

```javascript
// 导航容器适配
export const NavigationContainer = ({ children }) => {
  if (Platform.OS === 'web') {
    // Web环境：使用简单的View容器
    return React.createElement(View, { style: { flex: 1 } }, children);
  } else {
    // 移动端使用原生API
    const { NavigationContainer: RNNavigationContainer } = eval('require("@react-navigation/native")');
    return <RNNavigationContainer>{children}</RNNavigationContainer>;
  }
};

// 堆栈导航器适配
export const createStackNavigator = () => {
  if (Platform.OS === 'web') {
    return {
      Navigator: ({ children }) => {
        return React.createElement(View, { style: { flex: 1 } }, children);
      },
      Screen: ({ component: Component, ...props }) => {
        return <Component {...props} />;
      },
    };
  } else {
    // 移动端使用原生API
    const { createStackNavigator: RNCreateStackNavigator } = eval('require("@react-navigation/stack")');
    return RNCreateStackNavigator();
  }
};
```

## 页面间导航实现

### 1. 动态屏幕加载

**文件**: `pc-version-final/src/screens/desktop/HomeScreen.desktop.js`

```javascript
const HomeScreen = ({ navigation }) => {
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [screenProps, setScreenProps] = useState({});
  const [loadedScreens, setLoadedScreens] = useState({});

  // 动态加载屏幕组件
  const loadScreen = async (screenName) => {
    if (loadedScreens[screenName]) return;

    try {
      let ScreenComponent;
      switch (screenName) {
        case 'Category':
          const CategoryModule = await import('./CategoryScreen.desktop');
          ScreenComponent = CategoryModule.default;
          break;
        case 'ImagePreview':
          const ImagePreviewModule = await import('./ImagePreviewScreen.desktop');
          ScreenComponent = ImagePreviewModule.default;
          break;
        case 'Settings':
          const SettingsModule = await import('./SettingsScreen.desktop');
          ScreenComponent = SettingsModule.default;
          break;
      }
      
      setLoadedScreens(prev => ({
        ...prev,
        [screenName]: ScreenComponent
      }));
    } catch (error) {
      console.error(`Failed to load screen ${screenName}:`, error);
    }
  };

  // 导航到指定屏幕
  const navigateToScreen = (screenName, props = {}) => {
    loadScreen(screenName);
    setCurrentScreen(screenName);
    setScreenProps(props);
  };
};
```

### 2. 屏幕间通信

**导航参数传递**:
```javascript
// 从HomeScreen导航到CategoryScreen
const handleCategoryPress = (category) => {
  navigateToScreen('Category', { 
    category: category.name,
    onBack: () => setCurrentScreen('Home')
  });
};

// 从CategoryScreen导航到ImagePreviewScreen
const handleImagePress = (image) => {
  navigateToScreen('ImagePreview', {
    image: image,
    fromScreen: 'Category',
    onBack: () => setCurrentScreen('Category')
  });
};
```

**回调函数传递**:
```javascript
// 在CategoryScreen中
const CategoryScreen = ({ route = {}, navigation = {}, category: propCategory, onBack }) => {
  const category = propCategory || route.params?.category;
  
  const handleImagePress = (image) => {
    if (navigation.onImagePress) {
      navigation.onImagePress(image);
    }
  };
};
```

## Electron集成

### 1. IPC通信导航

**主进程** (`public/electron.js`):
```javascript
const { ipcMain, Menu } = require('electron');

// 创建菜单
const createMenu = () => {
  const template = [
    {
      label: 'View',
      submenu: [
        {
          label: 'Settings',
          click: () => {
            mainWindow.webContents.send('navigate-to-settings');
          }
        },
        {
          label: 'Rescan Gallery',
          click: () => {
            mainWindow.webContents.send('rescan-gallery');
          }
        }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};
```

**渲染进程** (`App.desktop.js`):
```javascript
useEffect(() => {
  if (typeof window !== 'undefined' && window.require) {
    const { ipcRenderer } = window.require('electron');
    
    // 监听菜单导航事件
    ipcRenderer.on('navigate-to-settings', (event, section) => {
      if (navigationRef.current) {
        navigationRef.current.navigate('Settings');
      }
    });
  }
}, []);
```

### 2. 标题栏集成

**动态更新标题栏**:
```javascript
// 在HomeScreen中更新标题栏统计信息
const updateTitleBarStats = (stats) => {
  if (typeof window !== 'undefined' && window.require) {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('update-titlebar-stats', stats);
  }
};
```

## 屏幕组件设计模式

### 1. 屏幕组件接口

```javascript
const ScreenComponent = ({ 
  route = {}, 
  navigation = {}, 
  // 直接props（优先级更高）
  prop1, 
  prop2,
  // 回调函数
  onBack,
  onAction
}) => {
  // 优先使用直接props，然后是route.params
  const param1 = prop1 || route.params?.param1;
  
  return (
    <View>
      {/* 屏幕内容 */}
    </View>
  );
};
```

### 2. 导航状态管理

```javascript
// 在HomeScreen中管理当前屏幕状态
const [currentScreen, setCurrentScreen] = useState('Home');
const [screenProps, setScreenProps] = useState({});

const renderCurrentScreen = () => {
  switch (currentScreen) {
    case 'Category':
      const CategoryScreen = loadedScreens.Category;
      return CategoryScreen ? (
        <CategoryScreen 
          {...screenProps} 
          navigation={{
            onImagePress: (image) => navigateToScreen('ImagePreview', { image })
          }}
        />
      ) : <LoadingScreen />;
    
    case 'ImagePreview':
      const ImagePreviewScreen = loadedScreens.ImagePreview;
      return ImagePreviewScreen ? (
        <ImagePreviewScreen 
          {...screenProps}
          navigation={{
            goBack: () => setCurrentScreen('Home')
          }}
        />
      ) : <LoadingScreen />;
    
    default:
      return <HomeContent />;
  }
};
```

## 性能优化策略

### 1. 懒加载
- 屏幕组件按需加载，减少初始包大小
- 使用动态import()实现代码分割

### 2. 内存管理
- 屏幕切换时清理不必要的状态
- 使用useRef避免不必要的重渲染

### 3. 状态同步
- 通过回调函数实现屏幕间数据同步
- 使用useFocusEffect监听屏幕焦点变化

## 错误处理

### 1. 导航错误处理
```javascript
const navigateToScreen = async (screenName, props = {}) => {
  try {
    await loadScreen(screenName);
    setCurrentScreen(screenName);
    setScreenProps(props);
  } catch (error) {
    console.error(`Navigation failed: ${screenName}`, error);
    // 显示错误提示
  }
};
```

### 2. 组件加载错误
```javascript
const loadScreen = async (screenName) => {
  try {
    // 动态加载逻辑
  } catch (error) {
    console.error(`Failed to load screen ${screenName}:`, error);
    // 可以显示错误页面或回退到默认屏幕
  }
};
```

## 开发调试

### 1. 导航日志
```javascript
// 在关键导航点添加日志
console.log('Navigating to:', screenName, 'with props:', props);
console.log('Current screen state:', currentScreen);
```

### 2. 状态检查
```javascript
// 检查导航状态
const checkNavigationState = () => {
  console.log('Current screen:', currentScreen);
  console.log('Loaded screens:', Object.keys(loadedScreens));
  console.log('Screen props:', screenProps);
};
```

## 总结

### 优势
1. **跨平台一致性**: 移动端和PC端使用相同的组件和逻辑
2. **性能优化**: 懒加载和按需渲染
3. **灵活扩展**: 易于添加新屏幕和导航逻辑
4. **Electron集成**: 充分利用桌面应用特性

### 挑战
1. **复杂性**: 需要维护两套导航系统
2. **调试困难**: 动态加载增加了调试复杂度
3. **状态管理**: 屏幕间状态同步需要仔细设计

### 最佳实践
1. **统一接口**: 保持屏幕组件接口一致性
2. **错误处理**: 完善的错误处理和回退机制
3. **性能监控**: 监控导航性能和内存使用
4. **文档维护**: 保持导航文档的更新

---

**文档版本**: v1.0  
**创建日期**: 2025年9月11日  
**适用项目**: 照片分类APP (Electron + React Native Web)
