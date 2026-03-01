/**
 * 轻量 Toast：显示一条消息，几秒后自动消失（淡出后调用 onDone）
 * 用于非模态的成功提示，如「已暂存」「已移出暂存箱」
 * placement: 'bottom' 在容器内底部水平居中（PC 图片区）；'screenCenter' 屏幕正中（移动端）
 */
import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, View } from 'react-native';

const DEFAULT_DURATION = 2500;

const Toast = ({ message, duration = DEFAULT_DURATION, onDone, placement = 'bottom' }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        onDone && onDone();
      });
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDone, opacity]);

  const isScreenCenter = placement === 'screenCenter';
  const wrapperStyle = isScreenCenter ? styles.wrapperScreenCenter : styles.wrapperBottom;

  return (
    <View style={[styles.wrapper, wrapperStyle]} pointerEvents="none">
      <Animated.View style={[styles.container, { opacity }]}>
        <Text style={styles.message} numberOfLines={1}>{message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  wrapperBottom: {
    bottom: 80,
    justifyContent: 'flex-end',
  },
  wrapperScreenCenter: {
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  container: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    maxWidth: 280,
    marginHorizontal: 24,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
  },
});

export default Toast;
