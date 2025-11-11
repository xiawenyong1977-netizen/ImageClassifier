import React, { useState, memo, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, Image, StyleSheet, Text } from 'react-native';
import UnifiedDataService from '../../services/UnifiedDataService';
import { logger, getUri } from '../../adapters/WebAdapters';

// 优化的图片组件，避免不必要的重新渲染
const MemoizedImage = memo(({ uri, imageId, onError, onLoad }) => {
  const imageSource = useMemo(() => ({ uri }), [uri]);
  
  return (
    <Image
      source={imageSource}
      style={styles.image}
      onError={onError}
      onLoad={onLoad}
      resizeMode="cover"
    />
  );
});

const RecentImagesGrid = memo(({ images, onImagePress }) => {
  const [imageErrors, setImageErrors] = useState({});

  const handleImageError = useCallback((imageId) => {
    setImageErrors(prev => {
      // 只有在状态真正变化时才更新，避免无限循环
      if (prev[imageId] === true) {
        return prev;
      }
      return { ...prev, [imageId]: true };
    });
  }, []);

  const handleImageLoad = useCallback((imageId) => {
    setImageErrors(prev => {
      // 只有在状态真正变化时才更新，避免无限循环
      if (prev[imageId] === false) {
        return prev;
      }
      return { ...prev, [imageId]: false };
    });
  }, []);

  if (!images || images.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>暂无照片</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {images.map((image, index) => {
        const imageId = image.id || index;
        const hasError = imageErrors[imageId];
        
        return (
          <TouchableOpacity
            key={imageId}
            style={[
              styles.imageContainer,
              (index + 1) % 3 === 0 && styles.lastInRow
            ]}
            onPress={() => onImagePress(image, 'Home', {
              category: image.category,
              city: image.city,
              similarityGroupId: image.similarityGroupId
            })}
            activeOpacity={0.8}>
            
            {/* 尝试显示实际图片 */}
            {(() => {
              const imageUri = getUri(image);
              if (!hasError && imageUri) {
                return (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.image}
                    onError={() => {
                      logger.error(`Image load error for: ${imageUri}`);
                      handleImageError(imageId);
                    }}
                    onLoad={() => {
                      handleImageLoad(imageId);
                    }}
                    resizeMode="cover"
                  />
                );
              }
              return null;
            })()}
            
            {/* 如果图片加载失败或没有URI，显示占位符 */}
            {(() => {
              const imageUri = getUri(image);
              if (hasError || !imageUri) {
                return (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.placeholderText}>📷</Text>
                    <Text style={styles.placeholderFileName} numberOfLines={1}>
                      {image.fileName || '图片'}
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
            
            {/* 分类标签 - 显示中文名称 */}
            {image.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>
                  {UnifiedDataService.getCategoryDisplayName(image.category)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12, // 使用gap统一间距
  },
  imageContainer: {
    width: 120, // 固定宽度
    height: 120, // 固定高度，正方形
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0', // Placeholder background
  },
  placeholderText: {
    fontSize: 40,
    color: '#ccc',
  },
  placeholderFileName: {
    marginTop: 5,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  lastInRow: {
    marginRight: 0, // Remove margin for the last item in the row
  },
});

export default RecentImagesGrid;

