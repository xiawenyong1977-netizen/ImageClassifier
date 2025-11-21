// 🔧 确保 polyfill 已加载
import './polyfills';

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, Platform } from 'react-native';

console.log('📦 App.js: 开始导入模块...');

import { NavigationContainer } from './adapters/WebAdapters';
import { createStackNavigator } from './adapters/WebAdapters';
import { createBottomTabNavigator } from './adapters/WebAdapters';
import { Icon } from './adapters/WebAdapters';
import { PermissionsAndroid } from './adapters/WebAdapters';
import { logger } from './adapters/WebAdapters';

console.log('📦 App.js: WebAdapters 导入成功');

// 导入所有屏�?
import HomeScreen from './screens/mobile/HomeScreen.mobile';
console.log('📦 App.js: HomeScreen 导入成功');
import CategoryScreen from './screens/mobile/CategoryScreen.mobile';
console.log('📦 App.js: CategoryScreen 导入成功');
import ImagePreviewScreen from './screens/mobile/ImagePreviewScreen.mobile';
console.log('📦 App.js: ImagePreviewScreen 导入成功');
import SettingsScreen from './screens/mobile/SettingsScreen.mobile';
console.log('📦 App.js: SettingsScreen 导入成功');
import EnhanceResultScreen from './screens/mobile/EnhanceResultScreen.mobile';

console.log('📦 App.js: 创建 Navigator...');
const Stack = createStackNavigator();
console.log('📦 App.js: Stack Navigator 创建成功');
const Tab = createBottomTabNavigator();
console.log('📦 App.js: Tab Navigator 创建成功');

// 主标签导航器
const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;

        if (route.name === 'Home') {
          iconName = '🏠';
        } else if (route.name === 'StagingBox') {
          iconName = '📦';
        } else if (route.name === 'Settings') {
          iconName = '⚙️';
        }

        return <Text style={{ fontSize: 24, color: color }}>{iconName}</Text>;
      },
      tabBarActiveTintColor: '#007AFF',
      tabBarInactiveTintColor: '#8E8E93',
      tabBarStyle: {
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E5EA',
        height: 60,
        paddingBottom: 8,
        paddingTop: 8,
      },
      tabBarShowLabel: true,
      tabBarLabelStyle: {
        fontSize: 12,
        marginTop: -4,
      },
      headerShown: false,
    })}
  >
    <Tab.Screen 
      name="Home" 
      component={HomeScreen}
      options={{ 
        title: '首页',
        tabBarLabel: '首页',
      }}
    />
    <Tab.Screen 
      name="StagingBox" 
      options={{ 
        title: '暂存箱',
        tabBarLabel: '暂存箱',
        tabBarStyle: { display: 'none' }, // 隐藏底部导航栏
      }}
    >
      {({ navigation }) => (
        <CategoryScreen 
          navigation={navigation}
          route={{ 
            params: { 
              category: 'tobecleaned',
              fromScreen: 'StagingBox' 
            } 
          }} 
        />
      )}
    </Tab.Screen>
    <Tab.Screen 
      name="Settings" 
      component={SettingsScreen}
      options={{ 
        title: '设置',
        tabBarLabel: '设置',
      }}
    />
  </Tab.Navigator>
);

// 权限状态检查函数
const checkAppPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      console.log('🚀 应用启动 - 权限状态检查开始');
      console.log('📱 平台信息:', Platform.OS, 'API级别:', Platform.Version);
      
      // 检查所有相关权限
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ];
      
      // Android 13+ 添加媒体权限
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      }
      
      console.log('📋 检查以下权限:');
      for (const permission of permissions) {
        const granted = await PermissionsAndroid.check(permission);
        const permissionName = permission.split('.').pop();
        console.log(`   ${granted ? '✓' : '✗'} ${permissionName}: ${granted ? '已授权' : '未授权'}`);
      }
      
      console.log('📋 权限状态检查完成\n');
      
    } catch (error) {
      console.error('❌ 权限检查失败:', error);
    }
  }
};

console.log('📦 App.js: 定义 App 组件...');

export default function App() {
  console.log('📦 App.js: App 组件开始渲染');
  
  const [isServiceReady, setIsServiceReady] = React.useState(false);
  
  useEffect(() => {
    console.log('📦 App.js: App useEffect 运行');
    initializeApp();
  }, []);
  
  const initializeApp = async () => {
    try {
      console.log('🚀 开始初始化应用核心服务...');
      
      // 1. 首先初始化 ConfigService（最重要，其他服务依赖它）
      console.log('📋 [1/3] 初始化 ConfigService...');
      const configService = require('./services/ConfigService.js').default;
      await configService.initialize();
      console.log('✅ ConfigService 初始化完成');
      
      // 2. 初始化 UnifiedDataService（数据存储服务）
      console.log('📋 [2/3] 初始化 UnifiedDataService...');
      const UnifiedDataService = require('./services/UnifiedDataService.js').default;
      await UnifiedDataService.initialize();
      console.log('✅ UnifiedDataService 初始化完成');
      
      // 3. 后台复制模型文件（移动端）
      console.log('📋 [3/3] 复制模型文件...');
      const { ModelPathAdapter } = require('./adapters/WebAdapters');
      if (ModelPathAdapter && ModelPathAdapter.ensureModelExists) {
        const models = ['id_card_detection.onnx', 'yolov8s.onnx', 'mobilenetv3_rw_Opset17.onnx'];
        for (const model of models) {
          await ModelPathAdapter.ensureModelExists(model);
        }
        console.log('✅ 模型文件初始化完成');
      }
      
      console.log('🎉 应用核心服务初始化完成！');
      setIsServiceReady(true);
    } catch (error) {
      console.error('❌ 应用初始化失败:', error);
      // 即使失败也允许进入应用，避免白屏
      setIsServiceReady(true);
    }
  };

  console.log('📦 App.js: 返回 JSX');
  
  // 如果服务还未就绪，显示加载界面
  if (!isServiceReady) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>🚀 正在初始化...</Text>
          <Text style={styles.loadingSubText}>加载配置和数据服务</Text>
        </View>
      </View>
    );
  }
  
  // 服务就绪后，渲染主界面
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="Category" component={CategoryScreen} />
          <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} />
          <Stack.Screen name="EnhanceResult" component={EnhanceResultScreen} options={{ presentation: 'modal' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

console.log('📦 App.js: App 组件定义完成');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingSubText: {
    fontSize: 14,
    color: '#666',
  },
});

