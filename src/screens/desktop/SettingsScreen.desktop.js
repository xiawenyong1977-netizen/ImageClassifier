import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView, Alert, AsyncStorage, logger } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageStorageService from '../../services/ImageStorageService';

const SettingsScreen = ({ navigation, onRescanGallery, onScanProgress, isScanning }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [galleryPaths, setGalleryPaths] = useState([]); // 默认路径，将在loadSettings中设置
  const [newPath, setNewPath] = useState(''); // 新路径输入
  const [originalPaths, setOriginalPaths] = useState([]); // 原始路径，用于比较变更
  const [storageType, setStorageType] = useState('检测中...'); // 存储类型
  const [storageSize, setStorageSize] = useState('计算中...'); // 存储大小


  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await UnifiedDataService.readSettings();
      
      // 从统一设置中加载照片目录配置
      if (savedSettings.scanPaths && savedSettings.scanPaths.length > 0) {
        setGalleryPaths(savedSettings.scanPaths);
        setOriginalPaths([...savedSettings.scanPaths]); // 记录原始路径用于比较变更
      } else {
        // 如果没有保存的路径，使用默认路径
        const imageStorageService = new ImageStorageService();
        const defaultPaths = imageStorageService.getDefaultScanPaths();
        setGalleryPaths(defaultPaths);
        setOriginalPaths([...defaultPaths]);
      }
      
      
      // 设置其他设置项
      setSettings(savedSettings);
      
      // 检测存储类型
      await detectStorageType();
    } catch (error) {
      logger.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // 检测存储类型和大小
  const detectStorageType = async () => {
    try {
      // 检测平台
      let Platform;
      try {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          Platform = { OS: 'web' };
        } else {
          Platform = eval('require("react-native").Platform');
        }
      } catch (error) {
        Platform = { OS: 'web' };
      }

      if (Platform.OS === 'web') {
        // Web环境检测IndexedDB和localStorage
        const indexedDBSize = await getIndexedDBSize();
        const localStorageSize = getLocalStorageSize();
        
        if (indexedDBSize > 0) {
          setStorageType('IndexedDB');
          setStorageSize(formatBytes(indexedDBSize));
        } else if (localStorageSize > 0) {
          setStorageType('localStorage (降级)');
          setStorageSize(formatBytes(localStorageSize));
        } else {
          setStorageType('IndexedDB');
          setStorageSize('0 B');
        }
      } else {
        // 移动端使用AsyncStorage
        setStorageType('AsyncStorage');
        const asyncStorageSize = await getAsyncStorageSize();
        setStorageSize(formatBytes(asyncStorageSize));
      }
    } catch (error) {
      logger.error('检测存储类型失败:', error);
      setStorageType('未知');
      setStorageSize('无法计算');
    }
  };

  // 获取IndexedDB存储大小
  const getIndexedDBSize = async () => {
    try {
      if ('indexedDB' in window) {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('ImageClassifierDB', 3); // 使用当前版本号
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        // 获取所有对象存储的大小
        let totalSize = 0;
        const transaction = db.transaction(['images', 'stats', 'settings'], 'readonly');
        
        for (const storeName of ['images', 'stats', 'settings']) {
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          await new Promise((resolve, reject) => {
            request.onsuccess = () => {
              const data = request.result;
              totalSize += JSON.stringify(data).length;
              resolve();
            };
            request.onerror = () => reject(request.error);
          });
        }
        
        return totalSize;
      }
      return 0;
    } catch (error) {
      logger.error('获取IndexedDB大小失败:', error);
      return 0;
    }
  };

  // 获取localStorage存储大小
  const getLocalStorageSize = () => {
    try {
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length;
        }
      }
      return totalSize;
    } catch (error) {
      logger.error('获取localStorage大小失败:', error);
      return 0;
    }
  };

  // 获取AsyncStorage存储大小
  const getAsyncStorageSize = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      let totalSize = 0;
      
      for (const key of keys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
      
      return totalSize;
    } catch (error) {
      logger.error('获取AsyncStorage大小失败:', error);
      return 0;
    }
  };

  // 格式化字节大小
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  // 加载分类规则

  const updateSetting = async (key, value) => {
    try {
      const newSettings = { ...settings, [key]: value };
      await UnifiedDataService.writeSettings(newSettings);
      // 重新加载设置以保持数据一致性
      await loadSettings();
      
      // 通知首页设置已更新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { 
          detail: { key, value, settings: newSettings } 
        }));
      }
    } catch (error) {
      logger.error('Failed to save settings:', error);
      Alert.alert('错误', '保存设置失败');
    }
  };


  // 保存照片目录配置
  const saveGalleryPaths = async (paths) => {
    try {
      logger.debug('正在保存目录配置到统一设置:', paths);
      
      // 验证路径不能为空数组
      if (!paths || paths.length === 0) {
        Alert.alert('错误', '扫描路径不能为空，请至少添加一个目录。');
        return;
      }
      
      // 通过UnifiedDataService保存到统一设置中
      const newSettings = { ...settings, scanPaths: paths };
      await UnifiedDataService.writeSettings(newSettings);
      logger.debug('目录配置已保存到统一设置');
      
      setGalleryPaths(paths);
      

    } catch (error) {
      logger.error('Failed to save gallery paths:', error);
      Alert.alert('错误', error.message || '保存照片目录失败');
    }
  };

 


  // 选择文件夹
  const selectFolder = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('select-folder');
      
      if (result.success) {
        setNewPath(result.path);
      } else {
        logger.debug('文件夹选择取消或失败:', result.message);
      }
    } catch (error) {
      logger.error('文件夹选择失败:', error);
      Alert.alert('错误', '文件夹选择失败，请手动输入路径');
    }
  };

  // 添加新目录
  const addGalleryPath = () => {
    if (newPath.trim() && !galleryPaths.includes(newPath.trim())) {
      const updatedPaths = [...galleryPaths, newPath.trim()];
      saveGalleryPaths(updatedPaths);
      setNewPath('');
    } else if (galleryPaths.includes(newPath.trim())) {
      Alert.alert('提示', '该目录已存在');
    } else {
      Alert.alert('提示', '请输入有效的目录路径');
    }
  };

  // 删除目录
  const removeGalleryPath = (pathToRemove) => {
    if (galleryPaths.length <= 1) {
      Alert.alert('提示', '至少需要保留一个目录');
      return;
    }
    
    Alert.alert(
      '确认删除',
      `确定要删除目录 "${pathToRemove}" 吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            const updatedPaths = galleryPaths.filter(path => path !== pathToRemove);
            saveGalleryPaths(updatedPaths);
          }
        }
      ]
    );
  };


  const handleClearData = async () => {
    // 先检查是否正在扫描（使用全局变量）
    if (typeof window !== 'undefined' && window.isScanning) {
      Alert.alert(
        '操作提示',
        '扫描正在进行中，请等待扫描完成后再清空数据。',
        [{ text: '确定', style: 'default' }]
      );
      return;
    }

    Alert.alert(
      '清空照片信息',
      '确定要清空所有照片的分类和位置信息吗？此操作不可撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定清空',
          style: 'destructive',
          onPress: async () => {
            try {
              // 调用UnifiedDataService清空数据
              await UnifiedDataService.clearAllData();
              
              // 发送数据清空事件，通知HomeScreen刷新数据
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('dataCleared'));
              }
              
              // 重新加载设置以反映清空后的状态
              await loadSettings();
              Alert.alert('成功', '照片信息已清空！');
            } catch (error) {
              logger.error('清空数据失败:', error);
              Alert.alert('错误', '清空数据失败，请重试');
            }
          }
        }
      ]
    );
  };


  



  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>设置</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>分类操作</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearData}>
            <Text style={styles.actionButtonTextRed}>🗑️ 清空相册信息</Text>
            <Text style={styles.actionButtonDescription}>
              清空所有照片的分类和位置信息
            </Text>
          </TouchableOpacity>

        </View>

        {/* Gallery Paths Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>照片目录</Text>
          
          {/* 添加新目录 */}
          <View style={styles.addPathContainer}>
            <TextInput
              style={styles.pathInput}
              placeholder="输入目录路径（例如：D:\Photos）"
              value={newPath}
              onChangeText={setNewPath}
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={styles.selectButton}
              onPress={selectFolder}>
              <Text style={styles.selectButtonText}>📁</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={addGalleryPath}>
              <Text style={styles.addButtonText}>+ 添加</Text>
            </TouchableOpacity>
          </View>

          {/* 目录列表 */}
          <View style={styles.pathsList}>
            {galleryPaths.map((path, index) => (
              <View key={index} style={styles.pathItem}>
                <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="middle">
                  {path}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.removeButton,
                    galleryPaths.length <= 1 && styles.removeButtonDisabled
                  ]}
                  onPress={() => removeGalleryPath(path)}
                  disabled={galleryPaths.length <= 1}>
                  <Text style={[
                    styles.removeButtonText,
                    galleryPaths.length <= 1 && styles.removeButtonTextDisabled
                  ]}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>


        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>应用信息</Text>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>版本</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>构建版本</Text>
            <Text style={styles.infoValue}>2024.01.01</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>平台</Text>
            <Text style={styles.infoValue}>桌面版</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>存储类型</Text>
            <Text style={styles.infoValue}>{storageType}</Text>
          </View>
          
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>存储大小</Text>
            <Text style={styles.infoValue}>{storageSize}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 40,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    padding: 16,
    paddingBottom: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  sliderContainer: {
    alignItems: 'center',
  },
  sliderValue: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '600',
  },
  actionButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  actionButtonTextRed: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF4444', // 红色文字
    marginBottom: 4,
  },
  actionButtonDescription: {
    fontSize: 14,
    color: '#666',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#333',
  },
  infoValue: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  // 照片目录配置样式
  addPathContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pathInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  selectButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  addButton: {
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pathsList: {
    backgroundColor: '#fff',
  },
  pathItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pathText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    fontFamily: 'monospace',
  },
  removeButton: {
    marginLeft: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ff4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  removeButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  removeButtonTextDisabled: {
    color: '#999',
  },
});

export default SettingsScreen;