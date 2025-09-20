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
  const [storageType, setStorageType] = useState('检测中...'); // 存储类型
  const [storageSize, setStorageSize] = useState('计算中...'); // 存储大小
  const [classificationRules, setClassificationRules] = useState({}); // 分类规则
  const [editingRules, setEditingRules] = useState({}); // 编辑中的规则
  const [isEditing, setIsEditing] = useState(false); // 是否正在编辑
  const [availableObjects, setAvailableObjects] = useState([]); // 可用的物体类别
  const [categoryPriorities, setCategoryPriorities] = useState({}); // 分类优先级

  // 分类名称中英对照表（与HomeScreen保持一致）
  const categoryNameMap = {
    'people': '社交活动',
    'pet': '宠物照片',
    'life': '生活记录',
    'food': '美食记录',
    'document': '工作照片',
    'travel': '旅行风景',
    'game': '运动娱乐',
    'screenshot': '手机截图',
    'meeting': '会议场景',
    'other': '其他图片',
    'idcard': '身份证'
  };

  // 物体名称中英对照表
  const objectNameMap = {
    // 人物
    'person': '人',
    
    // 宠物
    'cat': '猫',
    'dog': '狗',
    'bird': '鸟',
    'horse': '马',
    'sheep': '羊',
    'cow': '牛',
    'elephant': '大象',
    'bear': '熊',
    'zebra': '斑马',
    'giraffe': '长颈鹿',
    
    // 生活用品
    'bottle': '瓶子',
    'wine glass': '酒杯',
    'cup': '杯子',
    'fork': '叉子',
    'knife': '刀',
    'spoon': '勺子',
    'bowl': '碗',
    'tv': '电视',
    'couch': '沙发',
    'bed': '床',
    'dining table': '餐桌',
    'toilet': '马桶',
    'microwave': '微波炉',
    'oven': '烤箱',
    'toaster': '烤面包机',
    'sink': '水槽',
    'refrigerator': '冰箱',
    'clock': '时钟',
    'vase': '花瓶',
    'scissors': '剪刀',
    'teddy bear': '泰迪熊',
    'hair drier': '吹风机',
    'toothbrush': '牙刷',
    
    // 食物
    'banana': '香蕉',
    'apple': '苹果',
    'sandwich': '三明治',
    'orange': '橙子',
    'broccoli': '西兰花',
    'carrot': '胡萝卜',
    'hot dog': '热狗',
    'pizza': '披萨',
    'donut': '甜甜圈',
    'cake': '蛋糕',
    
    // 工作文档
    'laptop': '笔记本电脑',
    'mouse': '鼠标',
    'keyboard': '键盘',
    'cell phone': '手机',
    'book': '书',
    'remote': '遥控器',
    
    // 交通工具
    'car': '汽车',
    'motorcycle': '摩托车',
    'airplane': '飞机',
    'bus': '公交车',
    'train': '火车',
    'truck': '卡车',
    'boat': '船',
    'bicycle': '自行车',
    
    // 运动娱乐
    'sports ball': '球类',
    'frisbee': '飞盘',
    'skis': '滑雪板',
    'snowboard': '滑雪板',
    'kite': '风筝',
    'baseball bat': '棒球棒',
    'baseball glove': '棒球手套',
    'skateboard': '滑板',
    'surfboard': '冲浪板',
    'tennis racket': '网球拍',
    
    // 其他
    'traffic light': '红绿灯',
    'fire hydrant': '消防栓',
    'stop sign': '停车标志',
    'parking meter': '停车计时器',
    'bench': '长椅',
    'backpack': '背包',
    'umbrella': '雨伞',
    'handbag': '手提包',
    'tie': '领带',
    'suitcase': '行李箱',
    'potted plant': '盆栽',
    'chair': '椅子',
    
    // 身份证
    'id_card_front': '身份证正面',
    'id_card_back': '身份证背面'
  };

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
      
      
      // 设置其他设置项
      setSettings(savedSettings);
      
      // 检测存储类型
      await detectStorageType();
      
      // 加载分类规则
      await loadClassificationRules();
    } catch (error) {
      console.error('Failed to load settings:', error);
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
      console.error('检测存储类型失败:', error);
      setStorageType('未知');
      setStorageSize('无法计算');
    }
  };

  // 获取IndexedDB存储大小
  const getIndexedDBSize = async () => {
    try {
      if ('indexedDB' in window) {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open('ImageClassifierDB', 2);
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
      console.error('获取IndexedDB大小失败:', error);
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
      console.error('获取localStorage大小失败:', error);
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
      console.error('获取AsyncStorage大小失败:', error);
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
  const loadClassificationRules = async () => {
    try {
      // 加载带优先级的规则
      const rulesWithPriority = await UnifiedDataService.imageStorageService.getClassificationRulesWithPriority();
      
      if (rulesWithPriority.categoryPriorities && rulesWithPriority.objectMappings) {
        // 新格式：带优先级
        setClassificationRules(rulesWithPriority.objectMappings);
        setEditingRules({...rulesWithPriority.objectMappings});
        setCategoryPriorities(rulesWithPriority.categoryPriorities);
      } else {
        // 旧格式：只有映射规则
        const rules = await UnifiedDataService.getClassificationRules();
        setClassificationRules(rules);
        setEditingRules({...rules});
        setCategoryPriorities({});
      }
      
      // 获取所有可能的物体类别（从默认规则中获取）
      const defaultRules = await UnifiedDataService.imageStorageService.getDefaultClassificationRules();
      const allObjects = Object.keys(defaultRules);
      setAvailableObjects(allObjects);
    } catch (error) {
      console.error('加载分类规则失败:', error);
    }
  };

  // 重置分类规则为默认值
  const handleResetClassificationRules = async () => {
    try {
      Alert.alert(
        '重置分类规则',
        '确定要重置分类规则为默认值吗？这将覆盖所有自定义规则。',
        [
          {
            text: '取消',
            style: 'cancel'
          },
          {
            text: '确定',
            style: 'destructive',
            onPress: async () => {
              try {
                await UnifiedDataService.resetClassificationRules();
                await loadClassificationRules();
                Alert.alert('成功', '分类规则已重置为默认值');
              } catch (error) {
                console.error('重置分类规则失败:', error);
                Alert.alert('错误', '重置分类规则失败: ' + error.message);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('重置分类规则失败:', error);
      Alert.alert('错误', '重置分类规则失败: ' + error.message);
    }
  };

  // 开始编辑规则
  const handleStartEdit = () => {
    setIsEditing(true);
    setEditingRules({ ...classificationRules });
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingRules({ ...classificationRules });
  };

  // 保存编辑的规则
  const handleSaveRules = async () => {
    try {
      await UnifiedDataService.saveClassificationRules(editingRules);
      setClassificationRules({ ...editingRules });
      setIsEditing(false);
      Alert.alert('保存成功', '分类规则保存成功');
    } catch (error) {
      console.error('保存分类规则失败:', error);
      Alert.alert('错误', '保存分类规则失败: ' + error.message);
    }
  };

  // 更新编辑中的规则
  const updateEditingRule = (objectClass, newCategory) => {
    setEditingRules(prev => ({
      ...prev,
      [objectClass]: newCategory
    }));
  };

  // 从分类中移除物体
  const removeObjectFromCategory = (category, objectClass) => {
    setEditingRules(prev => {
      const newRules = { ...prev };
      // 找到该物体当前所属的分类
      const currentCategory = Object.keys(newRules).find(cat => 
        newRules[cat] === category && cat === objectClass
      );
      if (currentCategory) {
        delete newRules[currentCategory];
      }
      return newRules;
    });
  };

  // 添加物体到分类
  const addObjectToCategory = (category, objectClass) => {
    setEditingRules(prev => ({
      ...prev,
      [objectClass]: category
    }));
  };

  // 获取分类下未分配的物体
  const getUnassignedObjects = (category) => {
    const assignedObjects = Object.keys(editingRules).filter(obj => editingRules[obj] === category);
    return availableObjects.filter(obj => 
      !assignedObjects.includes(obj) && 
      obj !== 'id_card_front' && 
      obj !== 'id_card_back' // 过滤掉身份证相关物体
    );
  };

  // 检查是否可以向上移动
  const canMoveUp = (category) => {
    // 从物体映射中获取所有分类，然后过滤
    const allCategories = [...new Set(Object.values(classificationRules))];
    const adjustableCategories = allCategories
      .filter(cat => cat !== 'idcard')
      .map(cat => ({ cat, priority: categoryPriorities[cat] || 999 }))
      .sort((a, b) => a.priority - b.priority)
      .map(item => item.cat);
    
    const currentIndex = adjustableCategories.indexOf(category);
    return currentIndex > 0;
  };

  // 检查是否可以向下移动
  const canMoveDown = (category) => {
    // 从物体映射中获取所有分类，然后过滤
    const allCategories = [...new Set(Object.values(classificationRules))];
    const adjustableCategories = allCategories
      .filter(cat => cat !== 'idcard')
      .map(cat => ({ cat, priority: categoryPriorities[cat] || 999 }))
      .sort((a, b) => a.priority - b.priority)
      .map(item => item.cat);
    
    const currentIndex = adjustableCategories.indexOf(category);
    return currentIndex < adjustableCategories.length - 1;
  };

  // 向上移动分类优先级
  const moveCategoryUp = async (category) => {
    try {
      // 从物体映射中获取所有分类，然后过滤
      const allCategories = [...new Set(Object.values(classificationRules))];
      const adjustableCategories = allCategories
        .filter(cat => cat !== 'idcard')
        .map(cat => ({ cat, priority: categoryPriorities[cat] || 999 }))
        .sort((a, b) => a.priority - b.priority)
        .map(item => item.cat);
      
      const currentIndex = adjustableCategories.indexOf(category);
      if (currentIndex > 0) {
        const newPriorities = { ...categoryPriorities };
        const prevCategory = adjustableCategories[currentIndex - 1];
        
        // 交换优先级
        const temp = newPriorities[category];
        newPriorities[category] = newPriorities[prevCategory];
        newPriorities[prevCategory] = temp;
        
        console.log(`🔄 交换优先级: ${category}(${temp}) ↔ ${prevCategory}(${newPriorities[category]})`);
        
        // 更新状态
        setCategoryPriorities(newPriorities);
        
        // 保存到数据库
        await UnifiedDataService.imageStorageService.saveClassificationRulesWithPriority({
          categoryPriorities: newPriorities,
          objectMappings: classificationRules
        });
        
        console.log(`✅ 分类 ${category} 优先级已提升`);
      }
    } catch (error) {
      console.error('调整优先级失败:', error);
      Alert.alert('错误', '调整优先级失败: ' + error.message);
    }
  };

  // 向下移动分类优先级
  const moveCategoryDown = async (category) => {
    try {
      // 从物体映射中获取所有分类，然后过滤
      const allCategories = [...new Set(Object.values(classificationRules))];
      const adjustableCategories = allCategories
        .filter(cat => cat !== 'idcard')
        .map(cat => ({ cat, priority: categoryPriorities[cat] || 999 }))
        .sort((a, b) => a.priority - b.priority)
        .map(item => item.cat);
      
      const currentIndex = adjustableCategories.indexOf(category);
      if (currentIndex < adjustableCategories.length - 1) {
        const newPriorities = { ...categoryPriorities };
        const nextCategory = adjustableCategories[currentIndex + 1];
        
        // 交换优先级
        const temp = newPriorities[category];
        newPriorities[category] = newPriorities[nextCategory];
        newPriorities[nextCategory] = temp;
        
        console.log(`🔄 交换优先级: ${category}(${temp}) ↔ ${nextCategory}(${newPriorities[category]})`);
        
        // 更新状态
        setCategoryPriorities(newPriorities);
        
        // 保存到数据库
        await UnifiedDataService.imageStorageService.saveClassificationRulesWithPriority({
          categoryPriorities: newPriorities,
          objectMappings: classificationRules
        });
        
        console.log(`✅ 分类 ${category} 优先级已降低`);
      }
    } catch (error) {
      console.error('调整优先级失败:', error);
      Alert.alert('错误', '调整优先级失败: ' + error.message);
    }
  };

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
      console.error('Failed to save settings:', error);
      Alert.alert('错误', '保存设置失败');
    }
  };


  // 保存照片目录配置
  const saveGalleryPaths = async (paths) => {
    try {
      console.log('💾 正在保存目录配置到统一设置:', paths);
      
      // 验证路径不能为空数组
      if (!paths || paths.length === 0) {
        Alert.alert('错误', '扫描路径不能为空，请至少添加一个目录。');
        return;
      }
      
      // 通过UnifiedDataService保存到统一设置中
      const newSettings = { ...settings, scanPaths: paths };
      await UnifiedDataService.writeSettings(newSettings);
      console.log('✅ 目录配置已保存到统一设置');
      
      setGalleryPaths(paths);
      

    } catch (error) {
      console.error('Failed to save gallery paths:', error);
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
              // 重新加载设置以反映清空后的状态
              await loadSettings();
              Alert.alert('成功', '照片信息已清空！');
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

        {/* Classification Rules Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>分类管理</Text>

          {/* 分类规则表格 */}
          <View style={styles.rulesTableContainer}>            
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderCell}>类别</Text>
              <Text style={styles.tableHeaderCellObjects}>包含物体</Text>
              <Text style={styles.tableHeaderCellPriority}>优先级</Text>
            </View>
            
            <View style={styles.tableBody}>
              {(() => {
                // 按分类分组
                const groupedRules = {};
                const rules = isEditing ? editingRules : classificationRules;
                
                Object.entries(rules).forEach(([objectClass, category]) => {
                  if (!groupedRules[category]) {
                    groupedRules[category] = [];
                  }
                  groupedRules[category].push(objectClass);
                });
                
                return Object.entries(groupedRules)
                  .filter(([category]) => category !== 'idcard') // 过滤掉身份证分类
                  .sort(([a], [b]) => {
                    // 按优先级排序（数字小的在前）
                    const priorityA = categoryPriorities[a] || 999;
                    const priorityB = categoryPriorities[b] || 999;
                    return priorityA - priorityB;
                  })
                  .map(([category, objectClasses]) => (
                  <View key={category} style={styles.tableRow}>
                    <View style={styles.categoryCell}>
                      <Text style={styles.categoryName}>
                        {categoryNameMap[category] || category}
                      </Text>
                    </View>
                    <View style={styles.objectsCell}>
                      {isEditing ? (
                        <View style={styles.objectsEditContainer}>
                          {objectClasses.map(objectClass => (
                            <View key={objectClass} style={styles.objectTag}>
                              <Text style={styles.objectTagText}>
                                {objectNameMap[objectClass] || objectClass}
                              </Text>
                              <TouchableOpacity
                                style={styles.removeObjectButton}
                                onPress={() => removeObjectFromCategory(category, objectClass)}>
                                <Text style={styles.removeObjectButtonText}>×</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                          <View style={styles.addObjectContainer}>
                            <select
                              style={styles.addObjectSelect}
                              onChange={(e) => {
                                if (e.target.value) {
                                  addObjectToCategory(category, e.target.value);
                                  e.target.value = ''; // 重置选择
                                }
                              }}
                              defaultValue="">
                              <option value="">+ 添加物体</option>
                              {getUnassignedObjects(category).map(objectClass => (
                                <option key={objectClass} value={objectClass}>
                                  {objectNameMap[objectClass] || objectClass}
                                </option>
                              ))}
                            </select>
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.objectsText}>
                          {objectClasses.map(obj => 
                            objectNameMap[obj] || obj
                          ).join(', ')}
                        </Text>
                      )}
                    </View>
                    <View style={styles.priorityCell}>
                      <View style={styles.priorityControls}>
                        <TouchableOpacity
                          style={[styles.priorityButton, styles.priorityButtonUp]}
                          onPress={() => moveCategoryUp(category)}
                          disabled={!canMoveUp(category)}>
                          <Text style={styles.priorityButtonText}>↑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.priorityButton, styles.priorityButtonDown]}
                          onPress={() => moveCategoryDown(category)}
                          disabled={!canMoveDown(category)}>
                          <Text style={styles.priorityButtonText}>↓</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ));
              })()}
            </View>
            
            {/* 编辑控制按钮 */}
            <View style={styles.editControls}>
              {!isEditing ? (
                <View style={styles.editButtonRow}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleStartEdit}>
                    <Text style={styles.editButtonText}>✏️ 编辑规则</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={handleResetClassificationRules}>
                    <Text style={styles.resetButtonText}>🔄 重置规则</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.editButtonRow}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelEdit}>
                    <Text style={styles.cancelButtonText}>❌ 取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveRules}>
                    <Text style={styles.saveButtonText}>💾 保存</Text>
                  </TouchableOpacity>
                </View>
              )}
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
          <Text style={styles.sectionTitle}>分类数据</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSmartScan}>
            <Text style={styles.actionButtonText}>🤖 开始智能分类</Text>
            <Text style={styles.actionButtonDescription}>
              扫描配置的目录并自动分类图片
            </Text>
          </TouchableOpacity>
          

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleClearData}>
            <Text style={styles.actionButtonText}>🗑️ 清空分类信息</Text>
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
  // 分类规则表格样式
  rulesTableContainer: {
    marginTop: 20,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 16,
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  tableHeaderCell: {
    flex: 0.6,
    color: '#616161',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableHeaderCellObjects: {
    flex: 2.0,
    color: '#616161',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableHeaderCellPriority: {
    flex: 0.4,
    color: '#616161',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableBody: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  categoryCell: {
    flex: 0.6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  priorityCell: {
    flex: 0.4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  priorityControls: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  priorityButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  priorityButtonUp: {
    backgroundColor: '#E8F5E8',
    borderColor: '#4CAF50',
  },
  priorityButtonDown: {
    backgroundColor: '#FFF3E0',
    borderColor: '#FF9800',
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  objectsCell: {
    flex: 2.0,
    paddingVertical: 8,
    paddingLeft: 16,
  },
  objectsEditContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  objectTag: {
    position: 'relative',
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    paddingRight: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 4,
    marginBottom: 4,
  },
  objectTagText: {
    fontSize: 10,
    color: '#616161',
    lineHeight: 12,
  },
  removeObjectButton: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#bdbdbd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeObjectButtonText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    lineHeight: 10,
  },
  addObjectContainer: {
    minWidth: 120,
  },
  addObjectSelect: {
    backgroundColor: '#f5f5f5',
    color: '#616161',
    border: '1px solid #e0e0e0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    paddingRight: 18,
    fontSize: 11,
    fontWeight: '500',
    cursor: 'pointer',
    outline: 'none',
    height: 26, // 与物体标签高度一致
    minHeight: 26,
  },
  objectsText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  categorySelector: {
    flex: 1,
    alignItems: 'center',
  },
  categorySelect: {
    width: '100%',
    height: 36,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#333',
  },
  editControls: {
    marginTop: 16,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  editButtonText: {
    color: '#424242',
    fontSize: 14,
    fontWeight: '500',
  },
  resetButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  resetButtonText: {
    color: '#424242',
    fontSize: 14,
    fontWeight: '500',
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cancelButtonText: {
    color: '#616161',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SettingsScreen;