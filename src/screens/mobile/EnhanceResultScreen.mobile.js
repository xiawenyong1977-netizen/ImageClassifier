import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  ScrollView,
  DeviceEventEmitter,
  PanResponder,
  Animated,
} from 'react-native';
import { Alert, RNFS } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * EnhanceResultScreen - 导航模态页（展示增强结果）
 * route.params:
 * - presetName: string
 * - selected: Array<{ id: string, uri: string }>
 * - results: Record<string, { status: 'pending'|'processing'|'done'|'failed', enhancedUri?: string }>
 * - initialIndex?: number
 */
export default function EnhanceResultScreen({ route, navigation }) {
  const {
    presetName = '照片创玩',
    selected = [],
    results = {},
    initialIndex = 0,
  } = route.params || {};

  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(selected.length - 1, 0)));
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [localResults, setLocalResults] = useState(results || {});
  const [savingById, setSavingById] = useState({});

  const total = selected.length;
  const completed = useMemo(() => {
    return selected.reduce((acc, s) => acc + (localResults[s.id]?.status === 'done' ? 1 : 0), 0);
  }, [selected, localResults]);

  const current = selected[index] || null;
  const currentResult = current ? localResults[current.id] : null;
  const enhancedReady = !!(currentResult && currentResult.status === 'done');
  const processing = !!(currentResult && (currentResult.status === 'pending' || currentResult.status === 'processing'));
  const failed = !!(currentResult && currentResult.status === 'failed');
  const isSaving = current ? !!savingById[current.id] : false;
  const canSave = enhancedReady && !failed && !isSaving && !(currentResult && currentResult.saved);
  const translateX = useRef(new Animated.Value(0)).current;

  const goPrev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const goNext = useCallback(() => setIndex((i) => (i < total - 1 ? i + 1 : i)), [total]);

  const onSave = useCallback(async () => {
    // 仅保存增强图（对齐PC逻辑）
    if (!enhancedReady || !currentResult?.enhancedUri) {
      Alert.alert('提示', '增强结果未就绪，稍后再试');
      return;
    }
    if (!current) return;
    // 防重复保存
    if (currentResult?.saved) {
      Alert.alert('提示', '该图片已保存过');
      return;
    }
    try {
      setSavingById((prev) => ({ ...prev, [current.id]: true }));
      // 1) 保存到相册（由适配层处理落盘与权限）
      const res = await RNFS.saveImageToGallery(currentResult.enhancedUri, undefined);

      // 2) 读取原图完整信息（用于复制描述/检测结果）
      let originalImage = null;
      try {
        if (current.id) {
          originalImage = await UnifiedDataService.readImageDetailsById(current.id);
        }
      } catch (e) {
        originalImage = null;
      }

      // 3) 组装完整数据并写入数据库（对齐PC：writeImageDetailedInfo + 刷新缓存）
      const now = Date.now();
      const path = res.path || res.uri?.replace('file://', '') || '';
      const newImageUri = res.path ? `file:///${path.replace(/\\/g, '/')}` : (res.uri || '');
      let fileSize = 0;
      try {
        if (path) {
          const st = await RNFS.stat(path);
          fileSize = Number(st.size) || 0;
        }
      } catch {}

      const completeImageData = {
        uri: newImageUri,
        fileName: res.fileName || 'enhanced.jpg',
        category: 'tobecleaned',
        confidence: 1.0,
        timestamp: now,
        takenAt: now,
        size: fileSize,
        idCardDetections: originalImage?.idCardDetections || [],
        generalDetections: originalImage?.generalDetections || [],
        mobileNetV3Detections: originalImage?.mobileNetV3Detections || null,
        message: originalImage?.message || null,
        ...(originalImage?.imageDimensions && { imageDimensions: originalImage.imageDimensions }),
      };

      await UnifiedDataService.writeImageDetailedInfo([completeImageData], false);
      await UnifiedDataService.imageCache.refreshCache();

      // 4) 标记本地结果为已保存
      setLocalResults((prev) => ({
        ...prev,
        [current.id]: { ...(prev[current.id] || {}), saved: true, savedAt: now },
      }));

    } catch (e) {
      Alert.alert('保存失败', e?.message || String(e));
    } finally {
      setSavingById((prev) => {
        const next = { ...prev };
        if (current?.id) delete next[current.id];
        return next;
      });
    }
  }, [enhancedReady, current, currentResult]);

  const toggleShow = () => {
    if (!enhancedReady) return;
    try {
      const from = showEnhanced ? (currentResult?.enhancedUri || current?.uri) : current?.uri;
      const to = !showEnhanced ? (currentResult?.enhancedUri || current?.uri) : current?.uri;
      console.log('🟡 切换原/增强', { from, to });
    } catch (e) {}
    setShowEnhanced((v) => !v);
  };

  // 订阅增强进度更新事件：{ id, status, enhancedUri? }
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('enhance:update', (payload) => {
      if (!payload || !payload.id) return;
      setLocalResults((prev) => ({
        ...prev,
        [payload.id]: {
          ...(prev[payload.id] || {}),
          status: payload.status || prev[payload.id]?.status || 'processing',
          enhancedUri: payload.enhancedUri || prev[payload.id]?.enhancedUri,
        }
      }));
    });
    return () => sub.remove();
  }, []);

  // 当切换到新的图片或该图片增强完成时：默认展示增强图
  useEffect(() => {
    if (!current) return;
    if (localResults[current.id]?.status === 'done') {
      setShowEnhanced(true);
    } else {
      setShowEnhanced(false);
    }
    // 切换图片时重置位移
    translateX.setValue(0);
  }, [index, current?.id, localResults, translateX]);


  // 手势：左右滑动切换图片（处理中/完成均可）
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8,
    onPanResponderMove: (_, gesture) => {
      translateX.setValue(gesture.dx);
    },
    onPanResponderRelease: (_, gesture) => {
      const threshold = SCREEN_WIDTH * 0.2;
      if (gesture.dx > threshold) {
        Animated.timing(translateX, { toValue: SCREEN_WIDTH, duration: 180, useNativeDriver: true }).start(() => {
          translateX.setValue(0);
          goPrev();
        });
      } else if (gesture.dx < -threshold) {
        Animated.timing(translateX, { toValue: -SCREEN_WIDTH, duration: 180, useNativeDriver: true }).start(() => {
          translateX.setValue(0);
          goNext();
        });
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  }), [goPrev, goNext, translateX]);

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部栏 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{presetName}</Text>
        <Text style={styles.progress}>{completed}/{total}</Text>
      </View>

      {/* 图片区域 */}
      <View style={styles.imageContainer} {...panResponder.panHandlers}>
        {current?.uri ? (
          <Animated.Image
            source={{ uri: enhancedReady && showEnhanced ? (currentResult.enhancedUri || current.uri) : current.uri }}
            style={[styles.image, { transform: [{ translateX }] }]}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imagePlaceholder}><Text style={styles.placeholderText}>暂无图片</Text></View>
        )}

        {/* 处理中蒙层 */}
        {(processing || failed) && (
          <View style={styles.processingOverlay}>
            <Text style={styles.processingText}>{failed ? '处理失败' : '处理中…'}</Text>
          </View>
        )}

        {/* 左右切换区域（简化实现：点击左右区域）*/}
        <TouchableOpacity style={styles.leftZone} onPress={goPrev} />
        <TouchableOpacity style={styles.rightZone} onPress={goNext} />

        {/* 浮动切换按钮已移除，统一放到底部操作栏 */}
      </View>

      {/* 底部栏：序号/总数 + 保存 */}
      <View style={styles.footer}>
        {/* 左：序号 */}
        <View style={styles.footerLeft}>
          <Text style={styles.indexText}>{index + 1} / {total}</Text>
        </View>
        {/* 中：保存到相册 */}
        <View style={styles.footerCenter}>
          <TouchableOpacity style={[styles.saveButton, (!canSave) && styles.saveButtonDisabled]} onPress={onSave} disabled={!canSave}>
            <Text style={styles.saveText}>{currentResult?.saved ? '已保存' : (isSaving ? '保存中…' : '保存到相册')}</Text>
          </TouchableOpacity>
        </View>
        {/* 右：原图/增强 */}
        <View style={styles.footerRight}>
          {enhancedReady && (
            <TouchableOpacity style={styles.toggleFooterButton} onPress={toggleShow}>
              <Text style={styles.toggleFooterText}>{showEnhanced ? '显示原图' : '显示增强'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  back: { color: '#fff', fontSize: 20 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center' },
  progress: { color: '#9aa0a6', fontSize: 14, width: 64, textAlign: 'right' },
  imageContainer: { flex: 1, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  image: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.7 },
  imagePlaceholder: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.7, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#999' },
  processingOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  processingText: { color: '#fff', fontSize: 16 },
  toggleButton: {
    position: 'absolute', right: 12, bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 10,
  },
  toggleText: { color: '#fff', fontSize: 12 },
  leftZone: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SCREEN_WIDTH / 2, zIndex: 1 },
  rightZone: { position: 'absolute', right: 0, top: 0, bottom: 0, width: SCREEN_WIDTH / 2, zIndex: 1 },
  footer: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)'
  },
  indexText: { color: '#fff', fontSize: 14 },
  footerLeft: { width: 80 },
  footerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footerRight: { width: 140, alignItems: 'flex-end', justifyContent: 'center' },
  footerActions: { flexDirection: 'row', alignItems: 'center' },
  toggleFooterButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 16,
    paddingVertical: 0,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleFooterText: { color: '#fff', fontSize: 14 },
  saveButton: { backgroundColor: '#007AFF', borderRadius: 10, height: 40, paddingHorizontal: 16, paddingVertical: 0, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { backgroundColor: '#3a3a3c' },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});


