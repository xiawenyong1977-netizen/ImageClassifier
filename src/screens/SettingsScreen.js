import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '../adapters/WebAdapters';
import ImageStorageService from '../services/ImageStorageService';
import ImageClassifierService from '../services/ImageClassifierService';

const SettingsScreen = ({ navigation }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [clearDataProgress, setClearDataProgress] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await ImageStorageService.getSettings();
      setSettings(savedSettings);
    } catch (error) {
      console.error('加载设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      const newSettings = { ...settings, [key]: value };
      await ImageStorageService.saveSettings(newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('保存设置失败:', error);
      Alert.alert('错误', '保存设置失败');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      '重新智能扫描',
      '确定要重新扫描相册并进行智能分类吗？此操作可能需要较长时间�?,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '重新扫描',
          style: 'default',
          onPress: async () => {
            try {
              // 显示进度提示�?              setShowProgressModal(true);
              setClearDataProgress({
                current: 0,
                total: 3,
                message: '准备开�?..',
                step: 'preparing'
              });
              
              // 调用清空数据方法，传入进度回�?              await ImageStorageService.clearAllData((progress) => {
                setClearDataProgress(progress);
              });
              
              // 操作完成后，停留1秒自动关�?              setTimeout(() => {
                setShowProgressModal(false);
                setClearDataProgress(null);
                // 重新加载设置
                loadSettings();
              }, 1000);
              
            } catch (error) {
              console.error('清空数据失败:', error);
              // 出错时也自动关闭进度�?              setTimeout(() => {
                setShowProgressModal(false);
                setClearDataProgress(null);
              }, 1000);
            }
          },
        },
      ]
    );
  };

  const renderSettingItem = (title, description, type, key, value) => {
    if (type === 'switch') {
      return (
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>{title}</Text>
            <Text style={styles.settingDescription}>{description}</Text>
          </View>
          <Switch
            value={value}
            onValueChange={(newValue) => updateSetting(key, newValue)}
            trackColor={{ false: '#e0e0e0', true: '#2196F3' }}
            thumbColor={value ? '#fff' : '#f4f3f4'}
          />
        </View>
      );
    }

    if (type === 'button') {
      return (
        <TouchableOpacity
          style={styles.settingItem}
          onPress={value}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingTitle}>{title}</Text>
            <Text style={styles.settingDescription}>{description}</Text>
          </View>
          <Text style={styles.settingArrow}>�?/Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>加载�?..</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部标题 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>设置</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 分类设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>分类设置</Text>
          
          {renderSettingItem(
            '自动隐藏无数据分�?,
            '开启后，首页只显示有图片的分类卡片',
            'switch',
            'hideEmptyCategories',
            settings.hideEmptyCategories
          )}
        </View>

        {/* 性能设置 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>性能设置</Text>
          
          {renderSettingItem(
            '缩略图质�?,
            '选择缩略图的压缩质量',
            'button',
            'thumbnailQuality',
            () => Alert.alert('缩略图质�?, '当前: ' + settings.thumbnailQuality)
          )}
          
          {renderSettingItem(
            '最大缓存大�?,
            `${settings.maxCacheSize} MB`,
            'button',
            'maxCacheSize',
            () => Alert.alert('缓存大小', '当前: ' + settings.maxCacheSize + ' MB')
          )}
        </View>

        {/* 数据管理 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>数据管理</Text>
          
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleClearData}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingTitle, styles.dangerText]}>
                重新智能分类
              </Text>
              <Text style={styles.settingDescription}>
                清空当前数据，开始智能分�?              </Text>
            </View>
            <Text style={styles.settingArrow}>�?/Text>
          </TouchableOpacity>
        </View>

        {/* 关于应用 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于应用</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>版本</Text>
              <Text style={styles.settingDescription}>1.0.0</Text>
            </View>
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>开发�?/Text>
              <Text style={styles.settingDescription}>深圳市智语未来软件有限公�?/Text>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* 进度提示�?*/}
      {showProgressModal && (
        <View style={styles.progressModal}>
          <View style={styles.progressContent}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.progressTitle}>正在处理...</Text>
            <Text style={styles.progressMessage}>
              {clearDataProgress?.message || '准备开�?..'}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    width: `${(clearDataProgress?.current || 0) / (clearDataProgress?.total || 1) * 100}%` 
                  }
                ]} 
              />
            </View>
            <Text style={styles.progressStep}>
              {clearDataProgress?.current || 0} / {clearDataProgress?.total || 1}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#f9f9f9',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  settingArrow: {
    fontSize: 18,
    color: '#ccc',
  },
  dangerText: {
    color: '#ff4444',
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
  // 进度提示窗样�?  progressModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  progressContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  progressMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 3,
  },
  progressStep: {
    fontSize: 12,
    color: '#999',
  },
});

export default SettingsScreen;

