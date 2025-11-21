import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { logger, getUri } from '../../adapters/WebAdapters';

/**
 * EnhanceResultScreen - 照片创玩结果展示屏幕（桌面端）
 * 基于 CategoryScreen.desktop.js 中的 EnhanceModal 实现
 * 
 * Props:
 * - visible: boolean - 是否显示
 * - onClose: function - 关闭回调
 * - preset: string - 预设方案ID
 * - availablePresets: Array<{id: string, name: string}> | Object - 可用预设列表
 * - progress: {current: number, total: number, status: string, imageStatuses: Array} - 进度信息
 * - selectedImages: Array<{id: string, uri: string, fileName: string}> - 选中的图片
 * - results: Array<{status: string, enhancedUri?: string, saved?: boolean}> - 处理结果
 * - currentIndex: number - 当前图片索引
 * - isProcessing: boolean - 是否正在处理
 * - onIndexChange: function - 索引变化回调
 * - onSave: function - 保存回调
 */
const EnhanceResultScreen = ({
  visible,
  onClose,
  preset,
  availablePresets = [],
  progress,
  selectedImages = [],
  results = [],
  currentIndex,
  isProcessing,
  onIndexChange,
  onSave
}) => {
  // 获取当前图片的信息
  const currentImage = selectedImages[currentIndex] || selectedImages[0] || {};
  const currentResult = results[currentIndex] || {};
  const isFailed = currentResult.status === 'failed';
  const isSaved = currentResult.saved === true;
  
  // 调试日志
  logger.debug(`🔍 EnhanceResultScreen当前图片: index=${currentIndex}, results.length=${results.length}, currentResult=`, {
    status: currentResult.status,
    hasEnhancedUri: !!currentResult.enhancedUri,
    enhancedUri: currentResult.enhancedUri || 'N/A'
  });
  
  // 获取当前预设名称（从可用预设列表中查找）
  const getPresetName = () => {
    // 支持数组或对象格式
    if (Array.isArray(availablePresets)) {
      const found = availablePresets.find(p => p.id === preset);
      return found ? found.name : 'AI增强';
    } else if (availablePresets && typeof availablePresets === 'object') {
      const found = availablePresets[preset];
      return found ? found.name : 'AI增强';
    }
    return 'AI增强';
  };

  const presetDisplayName = getPresetName();
  
  // 获取图片状态（从后端实时返回或results）
  const getImageStatus = (index) => {
    // 优先使用results（处理完成后的最终结果）
    if (results.length > 0 && results[index]) {
      return results[index].status === 'failed' ? 'failed' : 'completed';
    }
    
    // 其次使用后端实时状态
    if (progress.imageStatuses && progress.imageStatuses.length > 0) {
      const imageStatus = progress.imageStatuses.find(img => img.index === index);
      if (imageStatus) {
        return imageStatus.status;
      }
    }
    
    // 如果正在处理，根据进度估算
    if (isProcessing) {
      if (index < progress.current) return 'completed';
      if (index === progress.current) return 'processing';
      return 'pending';
    }
    
    return 'pending';
  };

  // 导航按钮处理
  const goToPrevious = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < selectedImages.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  };

  // 大图对比视图
  const renderComparisonView = () => {
    const status = getImageStatus(currentIndex);
    
    // 显示原图
    const renderOriginalImage = () => {
      // 使用 getUri 获取正确的 URI（PC端：file://，移动端：content://）
      const imageUri = getUri(currentImage);
      if (!imageUri) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>原图</Text>
              {selectedImages.length > 1 && (
                <Text style={styles.enhanceComparisonImageCounter}>
                  {currentIndex + 1}/{selectedImages.length}
                </Text>
              )}
            </View>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              <Text style={styles.enhanceComparisonPlaceholderIcon}>📷</Text>
              <Text style={styles.enhanceComparisonPlaceholderText}>无法加载图片</Text>
            </View>
          </View>
        );
      }
      
      return (
        <View style={styles.enhanceComparisonImageContainer}>
          <View style={styles.enhanceComparisonImageLabelContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>原图</Text>
            {selectedImages.length > 1 && (
              <Text style={styles.enhanceComparisonImageCounter}>
                {currentIndex + 1}/{selectedImages.length}
              </Text>
            )}
          </View>
          <Image
            source={{ uri: imageUri }}
            style={styles.enhanceComparisonImage}
            resizeMode="contain"
            onError={(error) => logger.error('❌ 原图加载失败:', imageUri, error)}
            onLoad={() => logger.debug('✅ 原图加载成功:', imageUri)}
          />
        </View>
      );
    };

    // 显示增强图或状态
    const renderEnhancedImage = () => {
      // 未开始处理
      if (!isProcessing && results.length === 0) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>{presetDisplayName}</Text>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              <Text style={styles.enhanceComparisonPlaceholderIcon}>🎨</Text>
              <Text style={styles.enhanceComparisonPlaceholderText}>选择方案开始处理</Text>
            </View>
          </View>
        );
      }

      // 处理中 - 显示状态
      if (status === 'pending' || status === 'processing') {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>
              {status === 'processing' ? '处理中' : '等待处理'}
            </Text>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              {status === 'processing' ? (
                <>
                  <ActivityIndicator size="large" color="#2196F3" />
                  <Text style={styles.enhanceComparisonPlaceholderText}>{`${presetDisplayName}处理中...`}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.enhanceComparisonPlaceholderIcon}>⏳</Text>
                  <Text style={styles.enhanceComparisonPlaceholderText}>等待处理</Text>
                </>
              )}
            </View>
          </View>
        );
      }

      // 处理失败
      if (status === 'failed' || isFailed) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>处理失败</Text>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonFailedContainer]}>
              <Text style={styles.enhanceComparisonFailedIcon}>⚠️</Text>
              <Text style={styles.enhanceComparisonFailedTitle}>{`${presetDisplayName}失败`}</Text>
              <Text style={styles.enhanceComparisonFailedMessage}>
                {currentResult.errorMessage || '未知错误'}
              </Text>
              <Text style={styles.enhanceComparisonFailedHint}>
                请尝试单独处理此图片，或稍后重试
              </Text>
            </View>
          </View>
        );
      }

      // 处理成功 - 显示增强后的图片
      if (status === 'completed' && currentResult.enhancedUri) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>{presetDisplayName}</Text>
            <Image
              source={{ uri: currentResult.enhancedUri }}
              style={styles.enhanceComparisonImage}
              resizeMode="contain"
              onError={(error) => logger.error('❌ Image加载失败:', currentResult.enhancedUri, error)}
              onLoad={() => logger.debug('✅ Image加载成功:', currentResult.enhancedUri)}
            />
          </View>
        );
      }

      // 状态为 completed 但还没有 enhancedUri，可能是正在加载
      if (status === 'completed' && !currentResult.enhancedUri) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>加载中</Text>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.enhanceComparisonPlaceholderText}>{`正在加载${presetDisplayName}结果...`}</Text>
            </View>
          </View>
        );
      }

      // 默认占位（其他未知状态）
      return (
        <View style={styles.enhanceComparisonImageContainer}>
          <Text style={styles.enhanceComparisonImageLabel}>{presetDisplayName}</Text>
          <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
            <Text style={styles.enhanceComparisonPlaceholderText}>{`暂无${presetDisplayName}结果`}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.enhanceComparisonSection}>
        <View style={styles.enhanceComparisonContainer}>
          {/* 左侧：原图和增强图 */}
          <View style={styles.enhanceComparisonImages}>
            {renderOriginalImage()}
            {renderEnhancedImage()}
          </View>

          {/* 右侧：操作按钮区 */}
          <View style={styles.enhanceComparisonRightButtons}>
            {/* 导航按钮：只在有多张图片时显示 */}
            {selectedImages.length > 1 && (
              <>
                {/* 上一张按钮 */}
                <TouchableOpacity
                  style={[
                    styles.enhanceComparisonNavButtonVertical,
                    currentIndex === 0 && styles.enhanceComparisonNavButtonDisabled
                  ]}
                  onPress={goToPrevious}
                  disabled={currentIndex === 0}
                >
                  <Text style={styles.enhanceComparisonNavButtonText}>↑</Text>
                </TouchableOpacity>

                {/* 下一张按钮 */}
                <TouchableOpacity
                  style={[
                    styles.enhanceComparisonNavButtonVertical,
                    currentIndex === selectedImages.length - 1 && styles.enhanceComparisonNavButtonDisabled
                  ]}
                  onPress={goToNext}
                  disabled={currentIndex === selectedImages.length - 1}
                >
                  <Text style={styles.enhanceComparisonNavButtonText}>↓</Text>
                </TouchableOpacity>
              </>
            )}

            {/* 保存按钮：始终显示 */}
            <TouchableOpacity
              style={[
                styles.enhanceComparisonSaveButtonVertical,
                (status !== 'completed' || !currentResult.enhancedUri || isSaved) && styles.enhanceComparisonSaveButtonDisabled
              ]}
              onPress={onSave}
              disabled={status !== 'completed' || !currentResult.enhancedUri || isSaved}
            >
              <Text style={[
                styles.enhanceComparisonSaveButtonText,
                (status !== 'completed' || !currentResult.enhancedUri || isSaved) && styles.enhanceComparisonSaveButtonTextDisabled
              ]}>
                {isSaved ? '✅' : '💾'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.enhanceModalOverlay}>
        <View style={styles.enhanceModalContent}>
          {/* 标题栏 */}
          <View style={styles.enhanceModalHeader}>
            <View style={styles.enhanceModalTitleContainer}>
              <Text style={styles.enhanceModalTitle}>{getPresetName()}</Text>
              <Text style={styles.enhanceModalCounter}>
                {results.filter(r => r.status === 'success' && r.enhancedUri).length}/{progress.total || results.length || selectedImages.length}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.enhanceModalCloseButton}>
              <Text style={styles.enhanceModalCloseButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 大图对比视图 */}
          {renderComparisonView()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  enhanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '95%',
    maxWidth: 1200,
    maxHeight: '90%',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'column',
  },
  enhanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  enhanceModalTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  enhanceModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 12,
  },
  enhanceModalCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  enhanceModalCloseButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  enhanceModalCloseButtonText: {
    fontSize: 18,
    color: '#666',
    lineHeight: 18,
    fontWeight: 'bold',
  },
  enhanceComparisonSection: {
    flex: 1,
    minHeight: 480,
  },
  enhanceComparisonContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    height: '100%',
  },
  enhanceComparisonImages: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  enhanceComparisonRightButtons: {
    width: 80,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceComparisonImageContainer: {
    flex: 1,
    maxWidth: 500,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  enhanceComparisonImageLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  enhanceComparisonImageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  enhanceComparisonImageCounter: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  enhanceComparisonImage: {
    width: '100%',
    height: 480,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  enhanceComparisonPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  enhanceComparisonPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceComparisonPlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  enhanceComparisonFailedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  enhanceComparisonFailedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceComparisonFailedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
    marginBottom: 8,
  },
  enhanceComparisonFailedMessage: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  enhanceComparisonFailedHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  enhanceComparisonNavButtonVertical: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  enhanceComparisonNavButtonDisabled: {
    opacity: 0.3,
  },
  enhanceComparisonNavButtonText: {
    fontSize: 24,
    color: '#333',
    lineHeight: 24,
  },
  enhanceComparisonSaveButtonVertical: {
    width: 60,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceComparisonSaveButtonDisabled: {
    backgroundColor: '#e0e0e0',
    shadowOpacity: 0,
    elevation: 0,
  },
  enhanceComparisonSaveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  enhanceComparisonSaveButtonTextDisabled: {
    color: '#999',
  },
});

export default EnhanceResultScreen;

