import React, { useState } from 'react';
import { View, TouchableOpacity, Image, StyleSheet, Text } from 'react-native';
import UnifiedDataService from '../../services/UnifiedDataService';
import { logger } from '../../adapters/WebAdapters.js';

const RecentImagesGrid = ({ images, onImagePress }) => {
  const [imageErrors, setImageErrors] = useState({});
  
  if (!images || images.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>暂无照片</Text>
      </View>
    );
  }

  const handleImageError = (imageId) => {
    setImageErrors(prev => ({ ...prev, [imageId]: true }));
  };

  const handleImageLoad = (imageId) => {
    setImageErrors(prev => ({ ...prev, [imageId]: false }));
  };

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
            {!hasError && image.uri && (
              <Image
                source={{ uri: image.uri }}
                style={styles.image}
                onError={() => {
                  logger.error(`Image load error for: ${image.uri}`);
                  handleImageError(imageId);
                }}
                onLoad={() => {
                  handleImageLoad(imageId);
                }}
                resizeMode="cover"
              />
            )}
            
            {/* 如果图片加载失败或没有URI，显示占位符 */}
            {(hasError || !image.uri) && (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.placeholderText}>📷</Text>
                <Text style={styles.placeholderFileName} numberOfLines={1}>
                  {image.fileName || '图片'}
                </Text>
              </View>
            )}
            
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
};

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

