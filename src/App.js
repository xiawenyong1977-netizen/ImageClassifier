import React, { useEffect } from 'react';
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
import { NavigationContainer } from './adapters/WebAdapters';
import { createStackNavigator } from './adapters/WebAdapters';
import { createBottomTabNavigator } from './adapters/WebAdapters';
import { Icon } from './adapters/WebAdapters';
import { PermissionsAndroid } from './adapters/WebAdapters';

// 导入所有屏�?
import HomeScreen from './screens/mobile/HomeScreen.mobile';
import CategoryScreen from './screens/mobile/CategoryScreen.mobile';
import ImagePreviewScreen from './screens/mobile/ImagePreviewScreen.mobile';
import BatchOperationScreen from './screens/mobile/BatchOperationScreen.mobile';
import ImageUploadScreen from './screens/mobile/ImageUploadScreen.mobile';
import SettingsScreen from './screens/mobile/SettingsScreen.mobile';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 主标签导航器
const MainTabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName;

        if (route.name === 'Home') {
          iconName = '🏠';
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
      tabBarShowLabel: false,
      headerShown: false,
    })}
  >
    <Tab.Screen 
      name="Home" 
      component={HomeScreen} 
      options={{ 
        title: '首页'
      }} 
    />
    <Tab.Screen 
      name="Settings" 
      component={SettingsScreen} 
      options={{ 
        title: '设置'
      }} 
    />
  </Tab.Navigator>
);

// 权限状态检查函�?
const checkAppPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      console.log('🚀 应用启动 - 权限状态检查开�?);
      console.log('📱 平台信息:', Platform.OS, 'API级别:', Platform.Version);
      
      // 检查所有相关权�?
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ];
      
      // Android 13+ 添加媒体权限
      if (Platform.Version >= 33) {
        permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      }
      
      console.log('📋 检查以下权�?');
      for (const permission of permissions) {
        const granted = await PermissionsAndroid.check(permission);
        const permissionName = permission.split('.').pop();
        console.log(`   ${granted ? '�? : '�?} ${permissionName}: ${granted ? '已授�? : '未授�?}`);
      }
      
      console.log('📋 权限状态检查完成\n');
      
    } catch (error) {
      console.error('�?权限检查失�?', error);
    }
  }
};

export default function App() {
  useEffect(() => {
    // 应用启动时检查权限状�?
    checkAppPermissions();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={MainTabNavigator} />
          <Stack.Screen name="Category" component={CategoryScreen} />
          <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
});

