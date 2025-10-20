/**
 * 芯图相册 - 移动端设置页
 * 
 * 功能：
 * 1. 扫描设置
 * 2. 存储管理
 * 3. 显示设置
 * 4. 关于信息
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
} from 'react-native';
import { SafeAreaView } from '../../adapters/WebAdapters';
import ImageStorageService from '../../services/ImageStorageService';
import { logger } from '../../adapters/WebAdapters';

const SettingsScreen = ({ navigation }) => {
  // ==================== 状态管理 ====================
  const [autoScan, setAutoScan] = useState(false);
  const [cacheSize, setCacheSize] = useState('0 MB');
  const [theme, setTheme] = useState('auto');

  // ==================== 初始化 ====================
  useEffect(() => {
    loadSettings();
    calculateCacheSize();
  }, []);

  /**
   * 加载设置
   */
  const loadSettings = async () => {
    try {
      const imageStorageService = new ImageStorageService();
      // TODO: 从存储加载设置
      setAutoScan(false);
      setTheme('auto');
    } catch (error) {
      logger.error('❌ 加载设置失败:', error);
    }
  };

  /**
   * 计算缓存大小
   */
  const calculateCacheSize = async () => {
    try {
      // TODO: 实际计算缓存大小
      setCacheSize('0 MB');
    } catch (error) {
      logger.error('❌ 计算缓存大小失败:', error);
    }
  };

  // ==================== 设置操作 ====================

  /**
   * 切换自动扫描
   */
  const toggleAutoScan = async (value) => {
    try {
      setAutoScan(value);
      // TODO: 保存设置
      logger.debug(`自动扫描: ${value ? '开启' : '关闭'}`);
    } catch (error) {
      logger.error('❌ 切换自动扫描失败:', error);
    }
  };

  /**
   * 清理缓存
   */
  const handleClearCache = () => {
    Alert.alert(
      '清理缓存',
      '确定要清理缓存吗？这不会删除图片数据。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              // TODO: 实际清理缓存
              Alert.alert('成功', '缓存已清理');
              calculateCacheSize();
            } catch (error) {
              logger.error('❌ 清理缓存失败:', error);
              Alert.alert('失败', error.message);
            }
          },
        },
      ]
    );
  };

  /**
   * 数据备份
   */
  const handleBackup = () => {
    Alert.alert('提示', '备份功能开发中');
  };

  /**
   * 数据恢复
   */
  const handleRestore = () => {
    Alert.alert('提示', '恢复功能开发中');
  };

  /**
   * 切换主题
   */
  const handleThemeChange = () => {
    const themes = [
      { value: 'light', label: '浅色' },
      { value: 'dark', label: '深色' },
      { value: 'auto', label: '跟随系统' },
    ];

    Alert.alert(
      '选择主题',
      '',
      [
        ...themes.map(t => ({
          text: t.label + (theme === t.value ? ' ✓' : ''),
          onPress: () => setTheme(t.value),
        })),
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  /**
   * 显示关于信息
   */
  const handleAbout = () => {
    Alert.alert(
      '关于芯图相册',
      '版本: 1.0.0\n\n基于AI的智能图片分类和管理应用\n\n© 2025 芯图相册团队',
      [{ text: '确定' }]
    );
  };

  // ==================== 渲染函数 ====================

  /**
   * 渲染设置项
   */
  const renderSettingItem = (title, value, onPress, showArrow = true) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.settingTitle}>{title}</Text>
      <View style={styles.settingRight}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        {showArrow && <Text style={styles.settingArrow}>›</Text>}
      </View>
    </TouchableOpacity>
  );

  /**
   * 渲染开关项
   */
  const renderSwitchItem = (title, value, onValueChange) => (
    <View style={styles.settingItem}>
      <Text style={styles.settingTitle}>{title}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#767577', true: '#81b0ff' }}
        thumbColor={value ? '#007AFF' : '#f4f3f4'}
      />
    </View>
  );

  /**
   * 渲染分组标题
   */
  const renderSectionTitle = (title) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  // ==================== 主渲染 ====================

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>

      {/* 设置列表 */}
      <ScrollView style={styles.scrollView}>
        {/* 扫描设置 */}
        {renderSectionTitle('📁 扫描设置')}
        <View style={styles.section}>
          {renderSettingItem('扫描路径', '相册', () => Alert.alert('提示', '功能开发中'))}
          {renderSwitchItem('自动扫描', autoScan, toggleAutoScan)}
        </View>

        {/* 存储管理 */}
        {renderSectionTitle('💾 存储管理')}
        <View style={styles.section}>
          {renderSettingItem('缓存大小', cacheSize, handleClearCache)}
          {renderSettingItem('清理缓存', '', handleClearCache)}
          {renderSettingItem('数据备份', '', handleBackup)}
          {renderSettingItem('数据恢复', '', handleRestore)}
        </View>

        {/* 显示设置 */}
        {renderSectionTitle('🎨 显示设置')}
        <View style={styles.section}>
          {renderSettingItem('主题模式', getThemeLabel(theme), handleThemeChange)}
          {renderSettingItem('图片质量', '高', () => Alert.alert('提示', '功能开发中'))}
        </View>

        {/* 关于 */}
        {renderSectionTitle('ℹ️ 关于')}
        <View style={styles.section}>
          {renderSettingItem('版本信息', 'v1.0.0', handleAbout)}
          {renderSettingItem('使用帮助', '', () => Alert.alert('提示', '功能开发中'))}
          {renderSettingItem('隐私政策', '', () => Alert.alert('提示', '功能开发中'))}
        </View>

        {/* 底部空白 */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ==================== 工具函数 ====================

/**
 * 获取主题标签
 */
const getThemeLabel = (theme) => {
  const labels = {
    light: '浅色',
    dark: '深色',
    auto: '跟随系统',
  };
  return labels[theme] || '跟随系统';
};

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
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
  
  // 设置项
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  settingTitle: {
    fontSize: 16,
    color: '#000000',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: '#8E8E93',
    marginRight: 8,
  },
  settingArrow: {
    fontSize: 18,
    color: '#8E8E93',
  },
});

export default SettingsScreen;
