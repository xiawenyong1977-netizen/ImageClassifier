/**
 * 芯图相册 - 移动端设置页
 * 
 * 功能（与PC端保持一致）：
 * 1. 分类操作（智能分类、清空相册信息）
 * 2. 应用信息（版本、构建版本、平台、存储类型、存储大小）
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView, Alert } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import GalleryScannerService from '../../services/GalleryScannerService';
import ImageStorageService from '../../services/ImageStorageService';
import DirectoryPicker from '../../components/DirectoryPicker.mobile';
import { logger } from '../../adapters/WebAdapters';

const SettingsScreen = ({ navigation, startSmartScan, onScanProgress }) => {
  // ==================== 状态管理 ====================
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  
  const [storageType, setStorageType] = useState('检测中...');
  const [storageSize, setStorageSize] = useState('计算中...');
  
  // 扫描路径设置
  const [galleryPaths, setGalleryPaths] = useState([]);
  
  // 目录选择器状态
  const [showDirectoryPicker, setShowDirectoryPicker] = useState(false);

  // ==================== 初始化 ====================
  useEffect(() => {
    loadSettings();
    detectStorageInfo();
  }, []);

  /**
   * 加载设置
   */
  const loadSettings = async () => {
    try {
      setLoading(true);
      const savedSettings = await UnifiedDataService.readSettings();
      
      // 从统一设置中加载照片目录配置
      if (savedSettings.scanPaths && savedSettings.scanPaths.length > 0) {
        setGalleryPaths(savedSettings.scanPaths);
      } else {
        // 如果没有保存的路径，使用默认路径（移动端为空数组）
        const imageStorageService = new ImageStorageService();
        const defaultPaths = imageStorageService.getDefaultScanPaths();
        setGalleryPaths(defaultPaths);
      }
      
      // 设置其他设置项
      setSettings(savedSettings);
      
      logger.debug('设置加载完成:', savedSettings);
    } catch (error) {
      logger.error('❌ 加载设置失败:', error);
      Alert.alert('错误', '加载设置失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 保存照片目录配置
   */
  const saveGalleryPaths = async (paths) => {
    try {
      logger.debug('正在保存目录配置到统一设置:', paths);
      
      // 移动端允许空数组，表示扫描整个设备
      // 不需要验证路径不能为空数组
      
      // 通过UnifiedDataService保存到统一设置中
      const newSettings = { ...settings, scanPaths: paths };
      await UnifiedDataService.writeSettings(newSettings);
      logger.debug('目录配置已保存到统一设置');
      
      setGalleryPaths(paths);
      setSettings(newSettings);
      
    } catch (error) {
      logger.error('Failed to save gallery paths:', error);
      Alert.alert('错误', error.message || '保存照片目录失败');
    }
  };

  /**
   * 打开目录选择器
   */
  const openDirectoryPicker = () => {
    setShowDirectoryPicker(true);
  };

  /**
   * 关闭目录选择器
   */
  const closeDirectoryPicker = () => {
    setShowDirectoryPicker(false);
  };

  /**
   * 从目录选择器选择目录
   */
  const handleDirectorySelected = (selectedPath) => {
    if (selectedPath && !galleryPaths.includes(selectedPath)) {
      const updatedPaths = [...galleryPaths, selectedPath];
      saveGalleryPaths(updatedPaths);
    } else if (galleryPaths.includes(selectedPath)) {
      Alert.alert('提示', '该目录已存在');
    }
  };

  /**
   * 删除路径
   */
  const removeGalleryPath = (pathToRemove) => {
    Alert.alert(
      '确认删除',
      `确定要删除路径 "${pathToRemove}" 吗？`,
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

  /**
   * 检测存储信息
   */
  const detectStorageInfo = async () => {
    try {
      const imageStorageService = new ImageStorageService();
      
      // 检测存储类型
      let type = 'SQLite';
      if (typeof window !== 'undefined' && window.indexedDB) {
        type = 'IndexedDB';
      }
      setStorageType(type);
      
      // 计算存储大小
      const allImages = await UnifiedDataService.readAllImages();
      const sizeInMB = (allImages.length * 50) / 1024; // 估算，每张图片约50KB元数据
      setStorageSize(`${sizeInMB.toFixed(2)} MB (${allImages.length}张图片)`);
      
    } catch (error) {
      logger.error('❌ 检测存储信息失败:', error);
      setStorageType('未知');
      setStorageSize('未知');
    }
  };

  // ==================== 分类操作 ====================

  /**
   * 清空相册信息
   */
  const handleClearData = () => {
    // 先检查是否正在扫描（使用全局变量）
    if (window.isScanning) {
      Alert.alert(
        '操作提示',
        '扫描正在进行中，请等待扫描完成后再清空数据。',
        [{ text: '确定', style: 'default' }]
      );
      return;
    }

    // 扫描未进行时才显示确认对话框
    Alert.alert(
      '确认清空',
      '确定要清空所有照片的分类和位置信息吗？\n\n⚠️ 此操作不可恢复！',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: async () => {
            try {
              await UnifiedDataService.clearAllData();
              Alert.alert('成功', '相册信息已清空');
              // 重新加载设置和存储信息
              await loadSettings();
              await detectStorageInfo();
            } catch (error) {
              logger.error('❌ 清空数据失败:', error);
              Alert.alert('失败', error.message);
            }
          },
        },
      ]
    );
  };


  // ==================== 渲染函数 ====================

  /**
   * 渲染操作按钮
   */
  const renderActionButton = (icon, title, description, onPress, danger = false) => (
    <TouchableOpacity
      style={styles.actionButton}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.actionButtonText, danger && styles.dangerText]}>
        {icon} {title}
      </Text>
      <Text style={styles.actionButtonDescription}>{description}</Text>
    </TouchableOpacity>
  );

  /**
   * 渲染信息项
   */
  const renderInfoItem = (label, value) => (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );

  /**
   * 渲染分组标题
   */
  const renderSectionTitle = (title) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  // ==================== 主渲染 ====================

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>

      {/* 设置列表 */}
      <ScrollView style={styles.scrollView}>
        {/* 分类操作 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>分类操作</Text>
            </View>
          </View>
          {renderActionButton(
            '🗑️',
            '清空相册信息',
            '清空所有照片的分类和位置信息',
            handleClearData,
            true
          )}
        </View>

        {/* 目录设置 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>目录设置</Text>
              <Text style={styles.sectionSubtitle}>
                设置后扫描指定目录照片，无指定目录则扫描设备所有照片
              </Text>
            </View>
          </View>
          
          {/* 目录选择器按钮 */}
          <TouchableOpacity
            style={styles.directoryPickerButton}
            onPress={openDirectoryPicker}
          >
            <Text style={styles.directoryPickerButtonText}>📁 浏览选择目录</Text>
          </TouchableOpacity>

          {/* 路径列表 */}
          {galleryPaths.map((path, index) => (
            <View key={index} style={styles.pathItem}>
              <Text style={styles.pathText}>{path}</Text>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeGalleryPath(path)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* 应用信息 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>应用信息</Text>
            </View>
          </View>
          {renderInfoItem('版本', '1.0.0')}
          {renderInfoItem('构建版本', '2025.01.20')}
          {renderInfoItem('平台', '移动端 (React Native)')}
          {renderInfoItem('存储类型', storageType)}
          {renderInfoItem('存储大小', storageSize)}
        </View>

        {/* 底部空白 */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 目录选择器 */}
      <DirectoryPicker
        visible={showDirectoryPicker}
        onClose={closeDirectoryPicker}
        onSelectDirectory={handleDirectorySelected}
      />
    </SafeAreaView>
  );
};

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  
  // 扫描路径设置样式
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: 'normal',
    marginLeft: 8,
    flex: 1,
    textAlignVertical: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  directoryPickerButton: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  directoryPickerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  header: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  
  // 分组
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    width: 120,
    textAlignVertical: 'center',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  
  // 操作按钮
  actionButton: {
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  actionButtonDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  dangerText: {
    color: '#FF3B30',
  },
  
  // 信息项
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  infoLabel: {
    fontSize: 16,
    color: '#000000',
  },
  infoValue: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
});

export default SettingsScreen;
