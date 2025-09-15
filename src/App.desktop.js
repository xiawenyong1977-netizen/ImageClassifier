import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';

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

// Direct React hooks import to avoid version conflicts
const { useEffect, useRef, useState } = React;

import { NavigationContainer, createStackNavigator } from './adapters/WebAdapters';
import { Icon } from './adapters/WebAdapters';

// Import desktop screens
import HomeScreen from './screens/desktop/HomeScreen.desktop';
import UnifiedDataService from './services/UnifiedDataService';

const Stack = createStackNavigator();

export default function App() {
  console.log('🚀 App.desktop.js 开始渲染');
  
  const navigationRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appData, setAppData] = useState({
    recentImages: [],
    categoryCounts: {},
    cityCounts: {},
    categoryRecentImages: {},
    cityRecentImages: {},
    hideEmptyCategories: false
  });

  useEffect(() => {
    // 初始化应用数据
    const initApp = async () => {
      try {
        console.log('🔄 App.desktop.js 开始初始化应用...');
        setIsLoading(true);
        
        // 初始化统一数据服务
        console.log('🔄 App.desktop.js 开始初始化统一数据服务...');
        await UnifiedDataService.initialize();
        
        // 加载设置
        const settings = await UnifiedDataService.readSettings();
        const shouldHideEmpty = settings.hideEmptyCategories === true;
        console.log('🔧 加载设置 - hideEmptyCategories:', shouldHideEmpty);
        
        // 从统一数据服务获取数据
        const [recentImagesData, categoryCountsData, cityCountsData] = await Promise.all([
          UnifiedDataService.readRecentImages(20),
          UnifiedDataService.readCategoryCounts(),
          UnifiedDataService.readCityCounts()
        ]);
        
        // 加载各分类的最近图片
        const categoryIds = ['wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'];
        const categoryImagesPromises = categoryIds.map(async (categoryId) => {
          try {
            const images = await UnifiedDataService.readRecentImagesByCategory(categoryId, 1);
            return { categoryId, images };
          } catch (error) {
            console.error(`❌ 加载分类 ${categoryId} 最近图片失败:`, error);
            return { categoryId, images: [] };
          }
        });
        
        const categoryImagesResults = await Promise.all(categoryImagesPromises);
        const categoryImagesMap = {};
        categoryImagesResults.forEach(({ categoryId, images }) => {
          categoryImagesMap[categoryId] = images;
        });
        
        // 加载各城市的最近图片
        const cityNames = Object.keys(cityCountsData);
        const cityImagesPromises = cityNames.map(async (cityName) => {
          try {
            const images = await UnifiedDataService.readRecentImagesByCity(cityName, 1);
            return { cityName, images };
          } catch (error) {
            console.error(`❌ 加载城市 ${cityName} 最近图片失败:`, error);
            return { cityName, images: [] };
          }
        });
        
        const cityImagesResults = await Promise.all(cityImagesPromises);
        const cityImagesMap = {};
        cityImagesResults.forEach(({ cityName, images }) => {
          cityImagesMap[cityName] = images;
        });
        
        // 设置应用数据
        setAppData({
          recentImages: recentImagesData,
          categoryCounts: categoryCountsData,
          cityCounts: cityCountsData,
          categoryRecentImages: categoryImagesMap,
          cityRecentImages: cityImagesMap,
          hideEmptyCategories: shouldHideEmpty
        });
        
        console.log('✅ App.desktop.js 应用数据加载完成');
      } catch (error) {
        console.error('❌ App.desktop.js 应用初始化失败:', error);
        // 即使失败也要设置一个空的数据，避免应用卡住
        setAppData({
          recentImages: [],
          categoryCounts: {},
          cityCounts: {},
          categoryRecentImages: {},
          cityRecentImages: {},
          hideEmptyCategories: false
        });
      } finally {
        setIsLoading(false);
      }
    };

    initApp();
  }, []);

  console.log('🚀 App.desktop.js 准备渲染 HomeScreen');

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在加载图片数据...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <HomeScreen 
        appData={appData}
        onRefreshCache={() => window.location.reload()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
});