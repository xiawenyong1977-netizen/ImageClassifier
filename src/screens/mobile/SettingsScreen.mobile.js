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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import GalleryScannerService from '../../services/GalleryScannerService';
import ImageStorageService from '../../services/ImageStorageService';
import { logger } from '../../adapters/WebAdapters';

const SettingsScreen = ({ navigation, startSmartScan, onScanProgress }) => {
  // ==================== 状态管理 ====================
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [storageType, setStorageType] = useState('检测中...');
  const [storageSize, setStorageSize] = useState('计算中...');

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
      const loadedSettings = await UnifiedDataService.readSettings();
      setSettings(loadedSettings || {});
      logger.debug('设置加载完成:', loadedSettings);
    } catch (error) {
      logger.error('❌ 加载设置失败:', error);
      Alert.alert('错误', '加载设置失败');
    } finally {
      setLoading(false);
    }
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
        {renderSectionTitle('分类操作')}
        <View style={styles.section}>
          {renderActionButton(
            '🗑️',
            '清空相册信息',
            '清空所有照片的分类和位置信息',
            handleClearData,
            true
          )}
        </View>

        {/* 应用信息 */}
        {renderSectionTitle('应用信息')}
        <View style={styles.section}>
          {renderInfoItem('版本', '1.0.0')}
          {renderInfoItem('构建版本', '2025.01.20')}
          {renderInfoItem('平台', '移动端 (React Native)')}
          {renderInfoItem('存储类型', storageType)}
          {renderInfoItem('存储大小', storageSize)}
        </View>

        {/* 底部空白 */}
        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
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
