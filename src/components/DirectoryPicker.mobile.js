/**
 * 目录选择器组件 - 移动端目录浏览和选择
 * 
 * 功能：
 * 1. 浏览文件系统目录结构
 * 2. 选择目录作为扫描路径
 * 3. 显示目录中的文件和子目录
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { RNFS, logger } from '../adapters/WebAdapters';

const DirectoryPicker = ({ visible, onClose, onSelectDirectory, currentPath = null }) => {
  const [currentDirectory, setCurrentDirectory] = useState('/storage/emulated/0');
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pathHistory, setPathHistory] = useState(['/storage/emulated/0']);

  useEffect(() => {
    if (visible) {
      const initialPath = currentPath || '/storage/emulated/0';
      setCurrentDirectory(initialPath);
      setPathHistory([initialPath]);
      loadDirectoryContents(initialPath);
    }
  }, [visible, currentPath]);

  /**
   * 加载目录内容
   */
  const loadDirectoryContents = async (path) => {
    try {
      setLoading(true);
      
      // 检查路径是否存在
      const exists = await RNFS.exists(path);
      if (!exists) {
        Alert.alert('错误', '目录不存在');
        return;
      }

      // 读取目录内容
      const items = await RNFS.readDir(path);
      
      // 过滤出目录（排除文件）
      const dirs = items.filter(item => item.isDirectory());
      
      // 按名称排序
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      
      setDirectories(dirs);
      
    } catch (error) {
      logger.error('加载目录内容失败:', error);
      Alert.alert('错误', '无法读取目录内容');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 进入子目录
   */
  const enterDirectory = (directory) => {
    const newPath = `${currentDirectory}/${directory}`;
    setCurrentDirectory(newPath);
    setPathHistory([...pathHistory, newPath]);
    loadDirectoryContents(newPath);
  };

  /**
   * 返回上级目录
   */
  const goBack = () => {
    if (pathHistory.length > 1) {
      const newHistory = [...pathHistory];
      newHistory.pop();
      const parentPath = newHistory[newHistory.length - 1];
      
      setCurrentDirectory(parentPath);
      setPathHistory(newHistory);
      loadDirectoryContents(parentPath);
    } else {
      // 如果在根目录，关闭弹窗
      onClose();
    }
  };

  /**
   * 选择当前目录
   */
  const selectCurrentDirectory = () => {
    onSelectDirectory(currentDirectory);
    onClose();
  };

  /**
   * 选择指定目录
   */
  const selectDirectory = (directory) => {
    const fullPath = `${currentDirectory}/${directory}`;
    onSelectDirectory(fullPath);
    onClose();
  };

  /**
   * 渲染目录项
   */
  const renderDirectoryItem = ({ item }) => (
    <TouchableOpacity
      style={styles.directoryItem}
      onPress={() => enterDirectory(item.name)}
    >
      <Text style={styles.directoryIcon}>📁</Text>
      <View style={styles.directoryInfo}>
        <Text style={styles.directoryName}>{item.name}</Text>
        <Text style={styles.directoryPath}>{item.path}</Text>
      </View>
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => selectDirectory(item.name)}
      >
        <Text style={styles.selectButtonText}>选择</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  /**
   * 渲染路径导航
   */
  const renderPathNavigation = () => {
    const pathParts = currentDirectory.split('/').filter(part => part);
    const canGoBack = pathHistory.length > 1;

    return (
      <View style={styles.pathNavigation}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goBack}
        >
          <Text style={styles.navButtonText}>
            ← 返回
          </Text>
        </TouchableOpacity>
        
        <View style={styles.currentPath}>
          <Text style={styles.currentPathText} numberOfLines={1}>
            {currentDirectory}
          </Text>
        </View>
        
        <TouchableOpacity
          style={styles.selectCurrentButton}
          onPress={selectCurrentDirectory}
        >
          <Text style={styles.selectCurrentButtonText}>选择此目录</Text>
               </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* 标题栏 */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>选择扫描目录</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 路径导航 */}
        {renderPathNavigation()}

        {/* 目录列表 */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : (
          <FlatList
            data={directories}
            keyExtractor={(item) => item.path}
            renderItem={renderDirectoryItem}
            style={styles.directoryList}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* 底部提示 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            选择一个目录作为图片扫描路径
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  pathNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  navButtonDisabled: {
    backgroundColor: '#E5E5EA',
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: '#8E8E93',
  },
  currentPath: {
    flex: 1,
    marginHorizontal: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F2F2F7',
    borderRadius: 4,
  },
  currentPathText: {
    fontSize: 12,
    color: '#8E8E93',
    fontFamily: 'monospace',
  },
  selectCurrentButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#34C759',
    borderRadius: 6,
  },
  selectCurrentButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  directoryList: {
    flex: 1,
  },
  directoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  directoryIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  directoryInfo: {
    flex: 1,
  },
  directoryName: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  directoryPath: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  selectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  selectButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  footerText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
});

export default DirectoryPicker;
