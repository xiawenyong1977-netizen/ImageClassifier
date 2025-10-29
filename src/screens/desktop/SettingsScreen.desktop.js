import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, TextInput, Image } from 'react-native';
import { SafeAreaView, Alert, AsyncStorage, logger } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageStorageService from '../../services/ImageStorageService';
import WeChatAuthService from '../../services/WeChatAuthService';

const SettingsScreen = ({ navigation, onRescanGallery, onScanProgress, isScanning }) => {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [galleryPaths, setGalleryPaths] = useState([]); // 默认路径，将在loadSettings中设置
  const [newPath, setNewPath] = useState(''); // 新路径输入
  const [originalPaths, setOriginalPaths] = useState([]); // 原始路径，用于比较变更
  const [storageType, setStorageType] = useState('检测中...'); // 存储类型
  const [storageSize, setStorageSize] = useState('计算中...'); // 存储大小
  
  // AI增强预设相关状态
  const [aiEnhancePresets, setAiEnhancePresets] = useState({});
  const [editingPreset, setEditingPreset] = useState(null); // 当前编辑的预设 {id, name, icon, prompt, description}
  const [showEditModal, setShowEditModal] = useState(false);

  // 微信授权相关状态
  const [wechatStatus, setWechatStatus] = useState('checking'); // checking, not_followed, followed
  const [qrCode, setQrCode] = useState('');
  const [credits, setCredits] = useState({ total: 0, used: 0, remaining: 0 });
  const [checkingFollow, setCheckingFollow] = useState(false);


  useEffect(() => {
    loadSettings();
    checkMembershipStatus();
  }, []);

  // 检查会员状态（替代关注状态）
  const checkMembershipStatus = async () => {
    try {
      logger.debug('🔍 开始检查会员状态...');
      const { isMember } = await WeChatAuthService.getMembershipStatus();
      if (isMember) {
        logger.debug('✅ 用户为会员');
        setWechatStatus('member'); // 复用现有UI分支但用更语义的值
        await loadCredits();
      } else {
        logger.debug('❌ 用户非会员');
        setWechatStatus('not_member');
        await generateQrCode();
      }
    } catch (error) {
      logger.error('检查会员状态失败:', error);
      setWechatStatus('not_member');
      await generateQrCode();
    }
  };

  // 生成二维码
  const generateQrCode = async () => {
    try {
      setCheckingFollow(true);
      const { qrcode } = await WeChatAuthService.generateQrCode();
      setQrCode(qrcode);
      
      // 轮询会员状态
      const poll = setInterval(async () => {
        try {
          const { isMember } = await WeChatAuthService.getMembershipStatus();
          if (isMember) {
            setWechatStatus('member');
            await loadCredits();
            Alert.alert('成功', '会员已激活！');
            clearInterval(poll);
            setCheckingFollow(false);
          }
        } catch (e) {
          logger.debug('⏳ 轮询会员状态中...');
        }
      }, 2000);
    } catch (error) {
      logger.error('生成二维码失败:', error);
      Alert.alert('错误', '生成二维码失败，请重试');
      setCheckingFollow(false);
    }
  };

  // 加载额度信息
  const loadCredits = async () => {
    try {
      const creditsData = await WeChatAuthService.getCredits();
      setCredits(creditsData);
    } catch (error) {
      logger.error('加载额度失败:', error);
    }
  };

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
      
      // 加载AI增强预设
      if (savedSettings.aiEnhancePresets) {
        setAiEnhancePresets(savedSettings.aiEnhancePresets);
      }
      
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

  // ========== AI增强预设管理 ==========
  
  // 打开编辑预设模态框
  const openEditPreset = (presetId) => {
    const preset = aiEnhancePresets[presetId];
    if (preset) {
      setEditingPreset({
        id: presetId,
        name: preset.name,
        icon: preset.icon,
        prompt: preset.prompt,
        description: preset.description,
        enabled: preset.enabled,
        sortOrder: preset.sortOrder
      });
      setShowEditModal(true);
    }
  };

  // 保存编辑的预设
  const saveEditedPreset = async () => {
    if (!editingPreset) return;
    
    try {
      const updatedPresets = {
        ...aiEnhancePresets,
        [editingPreset.id]: {
          name: editingPreset.name,
          icon: editingPreset.icon,
          prompt: editingPreset.prompt,
          description: editingPreset.description,
          enabled: editingPreset.enabled,
          sortOrder: editingPreset.sortOrder
        }
      };
      
      const newSettings = { ...settings, aiEnhancePresets: updatedPresets };
      await UnifiedDataService.writeSettings(newSettings);
      
      setAiEnhancePresets(updatedPresets);
      setSettings(newSettings);
      setShowEditModal(false);
      setEditingPreset(null);
      
      // 通知其他页面设置已更新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { 
          detail: { key: 'aiEnhancePresets', value: updatedPresets, settings: newSettings } 
        }));
      }
      
      Alert.alert('成功', '预设已保存');
    } catch (error) {
      logger.error('保存AI增强预设失败:', error);
      Alert.alert('错误', '保存预设失败，请重试');
    }
  };

  // 切换预设启用状态
  const togglePresetEnabled = async (presetId) => {
    try {
      const updatedPresets = {
        ...aiEnhancePresets,
        [presetId]: {
          ...aiEnhancePresets[presetId],
          enabled: !aiEnhancePresets[presetId].enabled
        }
      };
      
      const newSettings = { ...settings, aiEnhancePresets: updatedPresets };
      await UnifiedDataService.writeSettings(newSettings);
      
      setAiEnhancePresets(updatedPresets);
      setSettings(newSettings);
      
      // 通知其他页面设置已更新
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { 
          detail: { key: 'aiEnhancePresets', value: updatedPresets, settings: newSettings } 
        }));
      }
    } catch (error) {
      logger.error('切换预设状态失败:', error);
      Alert.alert('错误', '操作失败，请重试');
    }
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

        {/* 智能分类 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>智能分类</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearData}>
            <Text style={styles.actionButtonTextRed}>🗑️ 清空相册信息</Text>
            <Text style={styles.actionButtonDescription}>
              清空所有照片的分类和位置信息
            </Text>
          </TouchableOpacity>

          {/* 目录设置 - 作为智能分类的子区域 */}
          <View style={styles.subSection}>
            <Text style={styles.subSectionTitle}>目录设置</Text>
            
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
        </View>

        {/* AI Image Enhancement Presets */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✨ 照片创玩</Text>
          
          <Text style={styles.sectionDescription}>
            配置照片创玩的预设方案，可自定义提示词
          </Text>
          
          {Object.entries(aiEnhancePresets)
            .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
            .map(([presetId, preset]) => (
              <View key={presetId} style={styles.presetItem}>
                <View style={styles.presetLeft}>
                  <Text style={styles.presetIcon}>{preset.icon}</Text>
                  <View style={styles.presetInfo}>
                    <Text style={styles.presetName}>{preset.name}</Text>
                    <Text style={styles.presetPrompt} numberOfLines={2}>
                      {preset.prompt || '（未设置提示词）'}
                    </Text>
                  </View>
                </View>
                <View style={styles.presetRight}>
                  <TouchableOpacity
                    style={styles.editPresetButton}
                    onPress={() => openEditPreset(presetId)}>
                    <Text style={styles.editPresetButtonText}>✏️ 编辑</Text>
                  </TouchableOpacity>
                  <Switch
                    value={preset.enabled}
                    onValueChange={() => togglePresetEnabled(presetId)}
                    trackColor={{ false: '#ccc', true: '#4CAF50' }}
                  />
                </View>
              </View>
            ))}
          
          {/* 如果已关注，显示额度 */}
          {wechatStatus === 'member' && (
            <View style={styles.creditsContainer}>
              <Text style={styles.creditsTitle}>💰 使用额度</Text>
              <View style={styles.creditsInfo}>
                <Text style={styles.creditsLabel}>剩余额度：</Text>
                <Text style={styles.creditsValue}>
                  {credits.remaining} / {credits.total}
                </Text>
              </View>
              <Text style={styles.creditsDescription}>
                已使用 {credits.used} 次，建议合理使用额度
              </Text>
            </View>
          )}
        </View>

        {/* 会员服务 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>会员服务</Text>
          
          {/* 免费会员 */}
          <View style={styles.membershipCard}>
            <View style={styles.membershipHeader}>
              <Text style={styles.membershipIcon}>🆓</Text>
              <View>
                <Text style={styles.membershipName}>免费会员</Text>
                <Text style={styles.membershipTag}>当前状态</Text>
              </View>
            </View>
            <View style={styles.membershipFeatures}>
              <View style={styles.membershipFeatureItem}>
                <Text style={styles.membershipFeatureIcon}>✓</Text>
                <Text style={styles.membershipFeatureText}>智能分类：100张照片</Text>
              </View>
              <View style={styles.membershipFeatureItem}>
                <Text style={styles.membershipFeatureIcon}>✗</Text>
                <Text style={styles.membershipFeatureText}>照片创玩：0张</Text>
              </View>
            </View>
          </View>

          {/* 付费会员 */}
          <View style={styles.membershipCardPremium}>
            {/* 标题栏和内容在同一水平行 */}
            <View style={styles.membershipRow}>
              {/* 左侧：标题和权益 */}
              <View style={styles.membershipLeft}>
                <View style={styles.membershipHeader}>
                  <Text style={styles.membershipIcon}>💎</Text>
                  <View>
                    <Text style={styles.membershipName}>终身会员</Text>
                    <Text style={styles.membershipTagPremium}>
                      {wechatStatus === 'member' ? '已激活' : '未激活'}
                    </Text>
                  </View>
                </View>
                
                {/* 权益列表 */}
                <View style={styles.membershipFeaturesColumn}>
                  <View style={styles.membershipFeatureItem}>
                    <Text style={styles.membershipFeatureIcon}>✓</Text>
                    <Text style={styles.membershipFeatureText}>智能分类：照片数不限</Text>
                  </View>
                  <View style={styles.membershipFeatureItem}>
                    <Text style={styles.membershipFeatureIcon}>✓</Text>
                    <Text style={styles.membershipFeatureText}>照片创玩：免费10张</Text>
                  </View>
                  <View style={styles.membershipFeatureItem}>
                    <Text style={styles.membershipFeatureIcon}>✓</Text>
                    <Text style={styles.membershipFeatureText}>更多配额需购买算力</Text>
                  </View>
                </View>
              </View>

              {/* 右侧：二维码区域（未关注时显示） */}
              {wechatStatus !== 'member' && (
                <View style={styles.membershipQrColumn}>
                  {qrCode ? (
                    <Image
                      source={{ uri: qrCode }}
                      style={styles.membershipQrCode}
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.membershipQrButton}
                      onPress={generateQrCode}>
                      <Text style={styles.membershipQrButtonText}>
                        {checkingFollow ? '生成中...' : '🔲 生成二维码'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.membershipQrHint}>
                    微信扫码关注"芯图相册"，开通会员
                  </Text>
                </View>
              )}
            </View>
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

      {/* Edit Preset Modal */}
      {showEditModal && editingPreset && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingPreset.name}</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowEditModal(false);
                  setEditingPreset(null);
                }}>
                <Text style={styles.modalCloseButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.presetInfoDisplay}>
                <Text style={styles.presetIconLarge}>{editingPreset.icon}</Text>
                <View>
                  <Text style={styles.presetNameLarge}>{editingPreset.name}</Text>
                  <Text style={styles.presetDescriptionSmall}>{editingPreset.description}</Text>
                </View>
              </View>

              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>提示词</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  value={editingPreset.prompt}
                  onChangeText={(text) => setEditingPreset({ ...editingPreset, prompt: text })}
                  placeholder="输入AI增强的提示词，例如：修复面部瑕疵和皱纹，提亮肤色，保持人物原貌不变"
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
                
                {/* 证件类型快捷按钮（仅限证件处理预设） */}
                {editingPreset.id === 'document' && (
                  <View style={styles.documentButtonsContainer}>
                    <TouchableOpacity
                      style={styles.documentButton}
                      onPress={() => {
                        const idCardPrompt = '增强身份证照片清晰度，确保人脸五官清晰可见，头发不遮挡眉毛和耳朵，正面免冠，适合做身份证证件照，白色背景，深色有领上衣，面部光线均匀';
                        setEditingPreset({ ...editingPreset, prompt: idCardPrompt });
                      }}>
                      <Text style={styles.documentButtonText}>🆔 身份证</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.documentButton}
                      onPress={() => {
                        const passportPrompt = '增强护照照片清晰度，确保人脸五官清晰可见，头发不遮挡眉毛和耳朵，正面免冠，适合做护照证件照，白色背景，深色有领上衣，面部光线均匀，眼神平视前方';
                        setEditingPreset({ ...editingPreset, prompt: passportPrompt });
                      }}>
                      <Text style={styles.documentButtonText}>📘 护照</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.documentButton}
                      onPress={() => {
                        const hkMacauPrompt = '增强港澳通行证照片清晰度，确保人脸五官清晰可见，头发不遮挡眉毛和耳朵，正面免冠，适合做港澳通行证证件照，白色或淡蓝色背景，深色有领上衣，面部光线均匀';
                        setEditingPreset({ ...editingPreset, prompt: hkMacauPrompt });
                      }}>
                      <Text style={styles.documentButtonText}>🏝️ 港澳通行证</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowEditModal(false);
                  setEditingPreset(null);
                }}>
                <Text style={styles.modalCancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={saveEditedPreset}>
                <Text style={styles.modalSaveButtonText}>保存</Text>
              </TouchableOpacity>
            </View>
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
  subSection: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
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
  // AI增强预设样式
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  presetLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 12,
  },
  presetIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  presetPrompt: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  presetRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editPresetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  editPresetButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // 模态框样式
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    width: '90%',
    maxWidth: 600,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    padding: 4,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseButtonText: {
    fontSize: 24,
    color: '#666',
    lineHeight: 24,
  },
  modalBody: {
    padding: 20,
  },
  presetInfoDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 20,
  },
  presetIconLarge: {
    fontSize: 36,
  },
  presetNameLarge: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  presetDescriptionSmall: {
    fontSize: 13,
    color: '#666',
  },
  modalField: {
    marginBottom: 0,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  modalTextArea: {
    height: 150,
    paddingTop: 10,
  },
  documentButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  documentButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  modalSaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // 微信授权样式
  wechatAuthContainer: {
    padding: 16,
    alignItems: 'center',
  },
  wechatAuthTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  wechatAuthDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  wechatAuthText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  qrCodeContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  qrCodeImage: {
    width: 200,
    height: 200,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 8,
  },
  qrCodeHint: {
    fontSize: 13,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
  },
  generateQrButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  generateQrButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // 额度显示样式
  creditsContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  creditsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  creditsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  creditsLabel: {
    fontSize: 14,
    color: '#666',
  },
  creditsValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    marginLeft: 8,
  },
  creditsDescription: {
    fontSize: 13,
    color: '#999',
  },
  // 会员服务样式
  membershipCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  membershipCardPremium: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff7e6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  membershipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  membershipIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  membershipName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  membershipTag: {
    fontSize: 13,
    color: '#4CAF50',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  membershipTagPremium: {
    fontSize: 13,
    color: '#ff9800',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  membershipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  membershipLeft: {
    flex: 1,
  },
  membershipBody: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  membershipFeaturesColumn: {
    flex: 1,
    gap: 8,
  },
  membershipFeatures: {
    gap: 8,
  },
  membershipQrColumn: {
    width: 200,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  membershipLeft: {
    width: 320,
  },
  membershipFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membershipFeatureIcon: {
    fontSize: 16,
    color: '#4CAF50',
    minWidth: 20,
  },
  membershipFeatureText: {
    fontSize: 14,
    color: '#666',
  },
  membershipQrTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  membershipQrCode: {
    width: 150,
    height: 150,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  membershipQrHint: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  membershipQrButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  membershipQrButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

export default SettingsScreen;