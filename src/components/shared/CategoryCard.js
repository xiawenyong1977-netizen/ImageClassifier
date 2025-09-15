import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Image } from 'react-native';

const CategoryCard = ({ category, count, recentImages, onPress }) => {
  // 获取最近的一张图片
  const recentImage = recentImages && recentImages.length > 0 ? recentImages[0] : null;
  
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}>
      {recentImage ? (
        // 有照片时，用照片作为背景
        <Image 
          source={{ uri: recentImage.uri }} 
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      ) : (
        // 没有照片时，使用颜色背景
        <View style={[styles.placeholderBackground, { backgroundColor: category.color + '20' }]} />
      )}
      
      {/* 半透明遮罩层，确保文字可读性 */}
      <View style={styles.overlay}>
        <Text style={styles.name}>{category.name}</Text>
        <View style={[styles.countContainer, { backgroundColor: category.color + 'CC' }]}>
          <Text style={[styles.count, { color: '#fff' }]}>
            {count} 张
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 120, // 固定宽度
    height: 120, // 固定高度，正方形
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden', // 确保圆角效果
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  placeholderBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 8, // 减少内边距以适应更小的卡片
    backgroundColor: 'rgba(0,0,0,0.3)', // 半透明黑色遮罩
  },
  name: {
    fontSize: 12, // 减小字体以适应更小的卡片
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    marginBottom: 4, // 减少底部间距
  },
  countContainer: {
    alignSelf: 'center',
    paddingHorizontal: 8, // 减少水平内边距
    paddingVertical: 4, // 减少垂直内边距
    borderRadius: 12, // 减小圆角
    minWidth: 40, // 减小最小宽度
    alignItems: 'center',
  },
  count: {
    fontSize: 10, // 减小字体
    fontWeight: '700',
  },
});

export default CategoryCard;

