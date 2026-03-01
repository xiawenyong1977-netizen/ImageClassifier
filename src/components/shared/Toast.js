/**
 * 轻量 Toast：显示一条消息，几秒后自动消失（淡出后调用 onDone）
 * 用于非模态的成功提示，如「已暂存」「已移出暂存箱」
 */
import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated } from 'react-native';

const DEFAULT_DURATION = 2500;

const Toast = ({ message, duration = DEFAULT_DURATION, onDone }) => {
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

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <Text style={styles.message} numberOfLines={1}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    maxWidth: 280,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
  },
});

export default Toast;
