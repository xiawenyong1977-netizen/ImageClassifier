/**
 * 芯图相册 - 移动端设置页
 * 
 * 功能（与PC端保持一致）：
 * 1. 分类操作（智能分类、清空相册信息）
 * 2. 应用信息（版本、构建版本、平台、存储类型、存储大小）
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  TextInput,
  Image,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView, Alert, RNFS } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import GalleryScannerService from '../../services/GalleryScannerService';
import ImageStorageService from '../../services/ImageStorageService';
import WeChatAuthService from '../../services/WeChatAuthService';
import DirectoryPicker from '../../components/DirectoryPicker.mobile';
import { logger } from '../../adapters/WebAdapters';
import { BUILD_DATE, BUILD_VERSION } from '../../config/BuildInfo';

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
  const [detectingDirectory, setDetectingDirectory] = useState(null);
  
  // AI增强预设相关状态
  const [aiEnhancePresets, setAiEnhancePresets] = useState({});
  const [editingPreset, setEditingPreset] = useState(null); // 当前编辑的预设
  const [showEditModal, setShowEditModal] = useState(false);
  
  // 微信授权相关状态
  const [wechatStatus, setWechatStatus] = useState('checking'); // checking, member, not_member
  const [qrCode, setQrCode] = useState('');
  const [qrContent, setQrContent] = useState(''); // 二维码内容（URL）
  const [credits, setCredits] = useState({ total: 0, used: 0, remaining: 0 });
  const [checkingFollow, setCheckingFollow] = useState(false);

  // ==================== 初始化 ====================
  useEffect(() => {
    loadSettings();
    detectStorageInfo();
    checkMembershipStatus();
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
        // 如果没有保存的路径，设置为空数组（移动端表示扫描整个设备）
        setGalleryPaths([]);
      }
      
      // 设置其他设置项
      setSettings(savedSettings);
      
      // 加载AI增强预设
      if (savedSettings.aiEnhancePresets) {
        setAiEnhancePresets(savedSettings.aiEnhancePresets);
      }
      
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
   * 获取目录类型
   */
  const getDirectoryType = (path) => {
    if (path.includes('WeiXin') || path.includes('WeChat')) return 'wechat';
    if (path.includes('QQ')) return 'qq';
    if (path.includes('DCIM/Camera')) return 'camera';
    if (path.includes('Screenshots')) return 'screenshots';
    return 'unknown';
  };

  /**
   * 智能检测目录（支持微信、QQ、相机、截图）
   */
  const smartDetectDirectory = async (type) => {
    // 定义多个可能的路径
    let candidatePaths = [];
    
    if (type === 'wechat') {
      candidatePaths = [
        '/storage/emulated/0/Tencent/MicroMsg',
        '/storage/emulated/0/Pictures/WeChat',
        '/storage/emulated/0/DCIM/WeChat'
      ];
    } else if (type === 'qq') {
      candidatePaths = [
        '/storage/emulated/0/Tencent/QQ_Images',
        '/storage/emulated/0/Tencent/QQ',
        '/storage/emulated/0/Tencent/MobileQQ/photo',
        '/storage/emulated/0/Tencent/MobileQQ/diskcache',
        '/storage/emulated/0/tencent/Tim_Images',
        '/storage/emulated/0/tencent/QQ_Images',
        '/storage/emulated/0/tencent/mobileqq/photo',
        '/storage/emulated/0/tencent/qq',
        '/storage/emulated/0/Android/data/com.tencent.mobileqq/files/Tencent/QQ_Images'
      ];
    } else if (type === 'camera') {
      candidatePaths = [
        '/storage/emulated/0/DCIM/Camera',
        '/storage/emulated/0/DCIM/100MEDIA',
        '/storage/emulated/0/Pictures'
      ];
    } else if (type === 'screenshots') {
      candidatePaths = [
        '/storage/emulated/0/DCIM/Screenshots',
        '/storage/emulated/0/Pictures/Screenshots',
        '/storage/emulated/0/Pictures/截图'
      ];
    }

    // 收集所有存在的路径
    const foundPaths = [];
    for (const basePath of candidatePaths) {
      try {
        logger.debug(`🔍 检测路径: ${basePath}`);
        const exists = await RNFS.exists(basePath);
        if (exists) {
          const typeName = type === 'wechat' ? '微信' : type === 'qq' ? 'QQ' : type === 'camera' ? '相册' : '截图';
          logger.debug(`✅ 检测到${typeName}目录: ${basePath}`);
          foundPaths.push(basePath);
        } else {
          logger.debug(`❌ 路径不存在: ${basePath}`);
        }
      } catch (error) {
        logger.error(`❌ 检测路径异常: ${basePath}`, error);
      }
    }
    
    const typeName = type === 'wechat' ? '微信' : type === 'qq' ? 'QQ' : type === 'camera' ? '相册' : '截图';
    if (foundPaths.length > 0) {
      logger.debug(`✅ 找到${foundPaths.length}个${typeName}目录: ${foundPaths.join(', ')}`);
    } else {
      logger.debug(`❌ 未找到${typeName}目录`);
    }
    return foundPaths;
  };

  /**
   * 检测并添加目录
   */
  const detectAndAddDirectory = async (pathOrType) => {
    try {
      // 判断是类型字符串还是路径字符串
      const dirType = pathOrType === 'wechat' || pathOrType === 'qq' || pathOrType === 'camera' || pathOrType === 'screenshots'
        ? pathOrType 
        : getDirectoryType(pathOrType);
      
      setDetectingDirectory(dirType);
      
      if (dirType === 'wechat' || dirType === 'qq' || dirType === 'camera' || dirType === 'screenshots') {
        // 使用智能检测，尝试多个路径
        const foundPaths = await smartDetectDirectory(dirType);
        
        if (foundPaths && foundPaths.length > 0) {
          // 过滤掉已存在的路径
          const newPaths = foundPaths.filter(path => !galleryPaths.includes(path));
          
          if (newPaths.length === 0) {
            Alert.alert('提示', '所有目录都已存在');
          } else {
            // 添加所有新路径
            const updatedPaths = [...galleryPaths, ...newPaths];
            await saveGalleryPaths(updatedPaths);
            
            const typeName = dirType === 'wechat' ? '微信' : dirType === 'qq' ? 'QQ' : dirType === 'camera' ? '相册' : '截图';
            if (foundPaths.length > newPaths.length) {
              Alert.alert('成功', `添加了${newPaths.length}个${typeName}目录\n共检测到${foundPaths.length}个目录，${foundPaths.length - newPaths.length}个已存在`);
            } else {
              Alert.alert('成功', `添加了${newPaths.length}个${typeName}目录`);
            }
          }
        } else {
          const typeName = dirType === 'wechat' ? '微信' : dirType === 'qq' ? 'QQ' : dirType === 'camera' ? '相册' : '截图';
          Alert.alert('未找到', `没有检测到${typeName}目录，可能该应用未安装或目录路径不同`);
        }
      } else {
        // 未知类型使用固定路径检测
        const exists = await RNFS.exists(pathOrType);
        
        if (exists) {
          if (galleryPaths.includes(pathOrType)) {
            Alert.alert('提示', '该目录已存在');
          } else {
            const updatedPaths = [...galleryPaths, pathOrType];
            await saveGalleryPaths(updatedPaths);
            Alert.alert('成功', '目录添加成功');
          }
        } else {
          Alert.alert('未找到', '没有检测到该目录');
        }
      }
    } catch (error) {
      logger.error('检测目录失败:', error);
      Alert.alert('错误', '检测失败，请重试');
    } finally {
      setDetectingDirectory(null);
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

  // ==================== 会员服务相关 ====================
  
  /**
   * 检查会员状态
   */
  const checkMembershipStatus = async () => {
    try {
      logger.debug('🔍 开始检查会员状态...');
      const { isMember } = await WeChatAuthService.getMembershipStatus();
      if (isMember) {
        logger.debug('✅ 用户为会员');
        setWechatStatus('member');
        await loadCredits();
      } else {
        logger.debug('🔍 用户非会员（正常情况）');
        setWechatStatus('not_member');
        await generateQrCode();
      }
    } catch (error) {
      // 查询会员状态失败，使用debug日志（不输出error）
      logger.debug('查询会员状态失败:', error);
      setWechatStatus('not_member');
      await generateQrCode();
    }
  };
  
  /**
   * 生成二维码
   */
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
            // 防止重复弹窗
            if (!activationAlertShownRef.current) {
              activationAlertShownRef.current = true;
              Alert.alert('成功', '会员已激活！');
            }
            clearInterval(poll);
            setCheckingFollow(false);
          }
        } catch (e) {
          logger.debug('⏳ 轮询会员状态中...');
        }
      }, 2000);
    } catch (error) {
      // 生成二维码失败，使用debug日志（不输出error和弹窗）
      logger.debug('生成二维码失败:', error);
      setCheckingFollow(false);
    }
  };
  
  const activationAlertShownRef = useRef(false);

  /**
   * 加载额度信息
   */
  const loadCredits = async () => {
    try {
      const creditsData = await WeChatAuthService.getCredits();
      setCredits(creditsData);
    } catch (error) {
      logger.error('加载额度失败:', error);
    }
  };
  
  /**
   * 点击二维码：保存到相册并调起微信
   */
  const openWeChatScan = async () => {
    if (!qrCode) {
      Alert.alert('提示', '二维码未生成，请先生成二维码');
      return;
    }

    try {
      logger.debug('🖼️ 开始保存二维码到相册...');
      
      // 使用 WebAdapters 封装的 RNFS 接口保存图片到相册
      let saveResult = null;
      if (RNFS && typeof RNFS.saveImageToGallery === 'function') {
        try {
          // 保存二维码图片到相册
          const fileName = `微信二维码_${Date.now()}.png`;
          saveResult = await RNFS.saveImageToGallery(qrCode, fileName);
          logger.debug('✅ 二维码已保存到相册:', saveResult);
        } catch (saveError) {
          logger.error('❌ 保存二维码到相册失败:', saveError);
          // 继续尝试调起微信
        }
      } else {
        logger.warn('⚠️ RNFS.saveImageToGallery 方法不可用');
      }

      // 先显示提示，用户确认后再调起微信
      if (saveResult) {
        Alert.alert(
          '保存成功',
          '二维码已保存到相册，现在打开微信扫一扫？',
          [
            { text: '取消', style: 'cancel' },
            { 
              text: '打开微信', 
              style: 'default',
              onPress: async () => {
                // 用户确认后调起微信（不传 saveResult，避免重复提示）
                await openWeChatDirectly();
              }
            }
          ]
        );
      } else {
        Alert.alert(
          '提示',
          '请手动打开微信，在右上角"+"菜单中选择"扫一扫"，然后扫描上方二维码',
          [
            { text: '知道了', style: 'default' },
            {
              text: '打开微信',
              style: 'default',
              onPress: async () => {
                await openWeChatDirectly();
              }
            }
          ]
        );
      }

    } catch (error) {
      logger.error('❌ 操作失败:', error);
      // 即使保存失败，也尝试调起微信
      await openWeChatDirectly();
      Alert.alert(
        '提示',
        '操作时出现问题，请手动打开微信扫描上方的二维码',
        [{ text: '知道了', style: 'default' }]
      );
    }
  };

  /**
   * 调起微信扫一扫
   */
  const openWeChatDirectly = async () => {
    try {
      logger.debug('📱 正在调起微信主界面...');
      const weixinMain = 'weixin://';
      const supportedMain = await Linking.canOpenURL(weixinMain);
      if (supportedMain) {
        await Linking.openURL(weixinMain);
        logger.debug('✅ 已调起微信主界面');
      } else {
        logger.warn('⚠️ 无法调起微信');
        Alert.alert(
          '提示',
          '无法自动打开微信，请手动打开微信，在"扫一扫"中扫描二维码',
          [{ text: '知道了', style: 'default' }]
        );
      }
    } catch (error) {
      logger.error('❌ 调起微信失败:', error);
      Alert.alert(
        '提示',
        '无法打开微信，请手动打开微信，在"扫一扫"中扫描二维码',
        [{ text: '知道了', style: 'default' }]
      );
    }
  };

  /**
   * 扫描二维码并打开链接（移动端暂不支持自动解析，直接使用保存和调起微信的方式）
   * 此函数保留用于兼容性，但移动端应该使用 openWeChatScan
   */
  const scanQrCodeAndOpen = async () => {
    // 移动端直接调用保存和调起微信的方法
    await openWeChatScan();
  };
  
  // ==================== AI增强预设管理 ====================
  
  /**
   * 打开编辑预设模态框
   */
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
  
  /**
   * 保存编辑的预设
   */
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
      
      // 通知其他页面设置已更新（仅在 Web 环境支持 CustomEvent 时）
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
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
  
  /**
   * 切换预设启用状态
   */
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
      
      // 通知其他页面设置已更新（仅在 Web 环境支持 CustomEvent 时）
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('settingsUpdated', { 
          detail: { key: 'aiEnhancePresets', value: updatedPresets, settings: newSettings } 
        }));
      }
    } catch (error) {
      logger.error('切换预设状态失败:', error);
      Alert.alert('错误', '操作失败，请重试');
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
        {/* 智能分类 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>🤖 智能分类</Text>
            </View>
          </View>
          
          {renderActionButton(
            '🗑️',
            '清空相册信息',
            '清空所有照片的分类和位置信息',
            handleClearData,
            true
          )}
          
          {/* 目录设置 - 与“清空相册信息”区域对齐 */}
          <View style={styles.actionButton}>
            <Text style={styles.actionButtonText}>目录设置</Text>
            <Text style={styles.actionButtonDescription}>
              设置后扫描指定目录照片，无指定目录则扫描设备所有照片
            </Text>
            
            {/* 目录选择器按钮 */}
            <TouchableOpacity
              style={styles.directoryPickerButton}
              onPress={openDirectoryPicker}
            >
              <Text style={styles.directoryPickerButtonText}>📁 浏览选择目录</Text>
            </TouchableOpacity>

            {/* 快捷目录按钮 */}
            <View style={styles.quickDirectoryContainer}>
              <Text style={styles.quickDirectoryTitle}>常用目录快速添加：</Text>
              <View style={styles.quickDirectoryRow}>
                <TouchableOpacity
                  style={[styles.quickDirectoryButton, detectingDirectory === 'wechat' && styles.quickDirectoryButtonDetecting]}
                  onPress={() => detectAndAddDirectory('wechat')}
                  disabled={!!detectingDirectory}
                >
                  <Text style={styles.quickDirectoryButtonText}>
                    {detectingDirectory === 'wechat' ? '🔍 检测中...' : '💬 微信目录'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickDirectoryButton, detectingDirectory === 'qq' && styles.quickDirectoryButtonDetecting]}
                  onPress={() => detectAndAddDirectory('qq')}
                  disabled={!!detectingDirectory}
                >
                  <Text style={styles.quickDirectoryButtonText}>
                    {detectingDirectory === 'qq' ? '🔍 检测中...' : '💬 QQ目录'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.quickDirectoryRow}>
                <TouchableOpacity
                  style={[styles.quickDirectoryButton, detectingDirectory === 'camera' && styles.quickDirectoryButtonDetecting]}
                  onPress={() => detectAndAddDirectory('camera')}
                  disabled={!!detectingDirectory}
                >
                  <Text style={styles.quickDirectoryButtonText}>
                    {detectingDirectory === 'camera' ? '🔍 检测中...' : '📷 相册目录'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickDirectoryButton, detectingDirectory === 'screenshots' && styles.quickDirectoryButtonDetecting]}
                  onPress={() => detectAndAddDirectory('screenshots')}
                  disabled={!!detectingDirectory}
                >
                  <Text style={styles.quickDirectoryButtonText}>
                    {detectingDirectory === 'screenshots' ? '🔍 检测中...' : '📸 截图目录'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 路径列表 */}
            {galleryPaths.map((path, index) => (
              <View key={index} style={styles.pathItem}>
                <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="middle">
                  {path}
                </Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeGalleryPath(path)}
                >
                  <Text style={styles.removeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

        {/* 照片创玩 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>✨ 照片创玩</Text>
            </View>
          </View>
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
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>💎 会员服务</Text>
            </View>
          </View>
          
          {/* 免费会员（仅在非会员时显示） */}
          {wechatStatus !== 'member' && (
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
          )}

          {/* 付费会员 */}
          <View style={styles.membershipCardPremium}>
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

            {/* 二维码区域（未关注时显示） */}
            {wechatStatus !== 'member' && (
              <View style={styles.membershipQrColumn}>
                {qrCode ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={openWeChatScan}>
                    <Image
                      source={{ uri: qrCode }}
                      style={styles.membershipQrCode}
                    />
                  </TouchableOpacity>
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
                  {qrCode ? '点击二维码打开微信扫一扫' : '微信扫码关注"芯图相册"，开通会员'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 应用信息 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>ℹ️ 应用信息</Text>
            </View>
          </View>
          {renderInfoItem('版本', BUILD_VERSION)}
          {renderInfoItem('构建版本', BUILD_DATE)}
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

      {/* 编辑预设模态框 */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowEditModal(false);
          setEditingPreset(null);
        }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingPreset?.name || '编辑预设'}</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowEditModal(false);
                  setEditingPreset(null);
                }}>
                <Text style={styles.modalCloseButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {editingPreset && (
                <>
                  <View style={styles.presetInfoDisplay}>
                    <Text style={styles.presetIconLarge}>{editingPreset.icon}</Text>
                    <View>
                      <Text style={styles.presetNameLarge}>{editingPreset.name}</Text>
                      <Text style={styles.presetDescriptionSmall}>
                        {editingPreset.description}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>提示词</Text>
                    <TextInput
                      style={[styles.modalInput, styles.modalTextArea]}
                      value={editingPreset.prompt}
                      onChangeText={(text) =>
                        setEditingPreset({ ...editingPreset, prompt: text })
                      }
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
                            const idCardPrompt =
                              '增强身份证照片清晰度，确保人脸五官清晰可见，头发不遮挡眉毛和耳朵，正面免冠，适合做身份证证件照，白色背景，深色有领上衣，面部光线均匀';
                            setEditingPreset({ ...editingPreset, prompt: idCardPrompt });
                          }}>
                          <Text style={styles.documentButtonText}>🆔 身份证</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.documentButton}
                          onPress={() => {
                            const passportPrompt =
                              '增强护照照片清晰度，确保人脸五官清晰可见，头发不遮挡眉毛和耳朵，正面免冠，适合做护照证件照，白色背景，深色有领上衣，面部光线均匀，眼神平视前方';
                            setEditingPreset({ ...editingPreset, prompt: passportPrompt });
                          }}>
                          <Text style={styles.documentButtonText}>📘 护照</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.documentButton}
                          onPress={() => {
                            const hkMacauPrompt =
                              '增强港澳通行证照片清晰度，确保人脸五官清晰可见，头发不遮挡眉毛和耳朵，正面免冠，适合做港澳通行证证件照，白色或淡蓝色背景，深色有领上衣，面部光线均匀';
                            setEditingPreset({ ...editingPreset, prompt: hkMacauPrompt });
                          }}>
                          <Text style={styles.documentButtonText}>🏝️ 港澳通行证</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowEditModal(false);
                  setEditingPreset(null);
                }}>
                <Text style={styles.modalCancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={saveEditedPreset}>
                <Text style={styles.modalSaveButtonText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 16,
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
  // 子区域样式
  subSection: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  subSectionDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  // AI增强预设样式
  sectionDescription: {
    fontSize: 14,
    color: '#8E8E93',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
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
    color: '#000000',
    marginBottom: 6,
  },
  presetPrompt: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  presetRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editPresetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    marginRight: 12,
  },
  editPresetButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  // 额度显示样式
  creditsContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  creditsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  creditsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  creditsLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  creditsValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
  creditsDescription: {
    fontSize: 13,
    color: '#8E8E93',
  },
  // 会员服务样式
  membershipCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  membershipCardPremium: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF7E6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
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
    color: '#000000',
    marginBottom: 4,
  },
  membershipTag: {
    fontSize: 13,
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  membershipTagPremium: {
    fontSize: 13,
    color: '#FF9800',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  membershipFeaturesColumn: {
    marginTop: 16,
  },
  membershipFeatures: {
    marginTop: 8,
  },
  membershipQrColumn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 16,
  },
  membershipFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  membershipFeatureIcon: {
    fontSize: 16,
    color: '#4CAF50',
    minWidth: 20,
    marginRight: 8,
  },
  membershipFeatureText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  membershipQrCode: {
    width: 200,
    height: 200,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  membershipQrHint: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
  },
  membershipQrButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    marginBottom: 12,
  },
  membershipQrButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
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
    color: '#8E8E93',
    lineHeight: 24,
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  presetInfoDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 20,
  },
  presetIconLarge: {
    fontSize: 36,
    marginRight: 12,
  },
  presetNameLarge: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  presetDescriptionSmall: {
    fontSize: 13,
    color: '#8E8E93',
  },
  modalField: {
    marginBottom: 0,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#F8F9FA',
  },
  modalTextArea: {
    height: 150,
    paddingTop: 10,
  },
  documentButtonsContainer: {
    flexDirection: 'row',
    marginTop: 12,
  },
  documentButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  documentButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginRight: 12,
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  modalSaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // 快捷目录按钮样式
  quickDirectoryContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  quickDirectoryTitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
    fontWeight: '500',
  },
  quickDirectoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  quickDirectoryButton: {
    flex: 1,
    padding: 10,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDirectoryButtonDetecting: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  quickDirectoryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#007AFF',
  },
});

export default SettingsScreen;
