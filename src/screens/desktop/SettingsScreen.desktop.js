import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView, Alert, AsyncStorage } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageClassifierService from '../../services/ImageClassifierService';
import GalleryScannerService from '../../services/GalleryScannerService';

// Create service instances
const imageClassifierService = new ImageClassifierService();

const SettingsScreen = ({ navigation, onRescanGallery, onScanProgress, startSmartScan }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [galleryPaths, setGalleryPaths] = useState(['D:\\Pictures']); // 默认路径
  const [newPath, setNewPath] = useState(''); // 新路径输入
  const [originalPaths, setOriginalPaths] = useState(['D:\\Pictures']); // 原始路径，用于比较变更
  const [scanInterval, setScanInterval] = useState(5); // 扫描间隔（分钟）

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await UnifiedDataService.readSettings();
      
      // 从统一设置中加载照片目录配置
      if (savedSettings.scanPaths) {
        setGalleryPaths(savedSettings.scanPaths);
        setOriginalPaths([...savedSettings.scanPaths]); // 记录原始路径用于比较变更
      }
      
      // 加载扫描间隔配置
      if (savedSettings.scanInterval) {
        setScanInterval(savedSettings.scanInterval);
      }
      
      // 设置其他设置项
      setSettings(savedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      const newSettings = { ...settings, [key]: value };
      await UnifiedDataService.writeSettings(newSettings);
      setSettings(newSettings);
      
      // 通知首页设置已更新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { 
          detail: { key, value, settings: newSettings } 
        }));
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    }
  };

  // 保存扫描间隔配置
  const saveScanInterval = async (interval) => {
    try {
      // 验证输入值
      const minutes = parseInt(interval, 10);
      if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
        Alert.alert('Invalid Input', 'Please enter a number between 1 and 1440 minutes');
        return;
      }
      
      // 通过UnifiedDataService保存到统一设置中
      const newSettings = { ...settings, scanInterval: minutes };
      await UnifiedDataService.writeSettings(newSettings);
      setSettings(newSettings);
      setScanInterval(minutes);
      
      // 通知首页设置已更新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { 
          detail: { key: 'scanInterval', value: minutes, settings: newSettings } 
        }));
      }
      
      Alert.alert('Success', `Scan interval updated to ${minutes} minutes`);
    } catch (error) {
      console.error('Failed to save scan interval:', error);
      Alert.alert('Error', 'Failed to save scan interval');
    }
  };

  // 保存照片目录配置
  const saveGalleryPaths = async (paths) => {
    try {
      console.log('💾 正在保存目录配置到统一设置:', paths);
      
      // 验证路径不能为空数组
      if (!paths || paths.length === 0) {
        Alert.alert('Error', 'Scan paths cannot be empty. Please add at least one directory.');
        return;
      }
      
      // 通过UnifiedDataService保存到统一设置中
      const newSettings = { ...settings, scanPaths: paths };
      await UnifiedDataService.writeSettings(newSettings);
      console.log('✅ 目录配置已保存到统一设置');
      
      setGalleryPaths(paths);
      
      // 检测目录变更
      const changes = detectPathChanges(originalPaths, paths);
      if (changes.hasChanges) {
        console.log('📁 检测到目录变更:', changes);
        // 更新原始路径记录
        setOriginalPaths([...paths]);
      }
    } catch (error) {
      console.error('Failed to save gallery paths:', error);
      Alert.alert('Error', error.message || 'Failed to save gallery paths');
    }
  };

  // 检测路径变更
  const detectPathChanges = (original, current) => {
    const originalSet = new Set(original);
    const currentSet = new Set(current);
    
    const added = current.filter(path => !originalSet.has(path));
    const removed = original.filter(path => !currentSet.has(path));
    
    return {
      hasChanges: added.length > 0 || removed.length > 0,
      added,
      removed,
      addedCount: added.length,
      removedCount: removed.length
    };
  };


  // 选择文件夹
  const selectFolder = async () => {
    try {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('select-folder');
      
      if (result.success) {
        setNewPath(result.path);
      } else {
        console.log('文件夹选择取消或失败:', result.message);
      }
    } catch (error) {
      console.error('文件夹选择失败:', error);
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

  // 触发重新扫描，直接保存AsyncStorage状态
  const triggerRescan = async () => {
    try {
      // 直接保存到AsyncStorage，让HomeScreen检查
      await AsyncStorage.setItem('pending_rescan', 'true');
      
      // 关闭设置页面，返回首页
      navigation.goBack();
      
    } catch (error) {
      console.error('保存重新扫描请求失败:', error);
      Alert.alert('错误', '无法启动重新扫描，请重试');
    }
  };


  const handleClearData = async () => {
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
              Alert.alert('成功', '照片信息已清空！');
              // 关闭设置页面，返回首页
              navigation.goBack();
            } catch (error) {
              console.error('清空数据失败:', error);
              Alert.alert('错误', '清空数据失败，请重试');
            }
          }
        }
      ]
    );
  };

  // 智能扫描
  const handleSmartScan = async () => {
    try {
      Alert.alert(
        '智能扫描',
        '确定要开始智能扫描吗？这将扫描配置的目录并自动分类图片。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定',
            onPress: async () => {
              try {
                // 调用从HomeScreen传递过来的扫描函数
                await startSmartScan();
                Alert.alert('成功', '智能扫描完成！');
              } catch (error) {
                console.error('智能扫描失败:', error);
                Alert.alert('错误', '智能扫描失败，请重试');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('启动智能扫描失败:', error);
      Alert.alert('错误', '启动智能扫描失败，请重试');
    }
  };

  const handleUpdateCityInfo = async () => {
    try {
      Alert.alert(
        '更新城市信息',
        '确定要为现有图片更新城市信息吗？此操作会为有GPS坐标的图片添加城市信息。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '更新',
            style: 'default',
            onPress: async () => {
              try {
                const GalleryScannerService = (await import('../../services/GalleryScannerService')).default;
                const scanner = new GalleryScannerService();
                
                const result = await scanner.updateExistingImagesWithCityInfo();
                
                Alert.alert(
                  '更新完成',
                  `成功更新 ${result.updated} 张图片的城市信息，跳过 ${result.skipped} 张图片。`,
                  [{ text: '确定' }]
                );
              } catch (error) {
                console.error('更新城市信息失败:', error);
                Alert.alert('错误', '更新城市信息失败，请重试');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('启动城市信息更新失败:', error);
      Alert.alert('错误', '无法启动城市信息更新，请重试');
    }
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

        {/* General Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>常规设置</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>隐藏空分类</Text>
              <Text style={styles.settingDescription}>
                在首页隐藏没有图片的分类
              </Text>
            </View>
            <Switch
              value={settings.hideEmptyCategories === true}
              onValueChange={(value) => updateSetting('hideEmptyCategories', value)}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>扫描间隔</Text>
              <Text style={styles.settingDescription}>
                自动扫描新图片的间隔时间（分钟）
              </Text>
            </View>
            <View style={styles.intervalContainer}>
              <TextInput
                style={styles.intervalInput}
                value={scanInterval.toString()}
                onChangeText={(text) => setScanInterval(parseInt(text, 10) || 5)}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor="#999"
              />
              <Text style={styles.intervalUnit}>min</Text>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => saveScanInterval(scanInterval)}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
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
                  style={styles.removeButton}
                  onPress={() => removeGalleryPath(path)}>
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>



        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>操作</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSmartScan}>
            <Text style={styles.actionButtonText}>🤖 智能扫描</Text>
            <Text style={styles.actionButtonDescription}>
              扫描配置的目录并自动分类图片
            </Text>
          </TouchableOpacity>
          

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearData}>
            <Text style={styles.actionButtonText}>🗑️ 清空照片信息</Text>
            <Text style={styles.actionButtonDescription}>
              清空所有照片的分类和位置信息
            </Text>
          </TouchableOpacity>

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
    fontSize: 16,
    color: '#333',
  },
  infoValue: {
    fontSize: 16,
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
  // 扫描间隔配置样式
  intervalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  intervalInput: {
    width: 80,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
    textAlign: 'center',
  },
  intervalUnit: {
    marginLeft: 8,
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  saveButton: {
    marginLeft: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default SettingsScreen;