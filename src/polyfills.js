// React Native Polyfills
// 必须在所有其他模块导入之前执行

// 设置 setImmediate polyfill (React Native 不支持 setImmediate)
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => {
    return setTimeout(() => {
      if (typeof fn === 'function') {
        fn(...args);
      }
    }, 0);
  };
  global.clearImmediate = (id) => {
    return clearTimeout(id);
  };
}

// 设置 requestAnimationFrame polyfill (如果不存在)
if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (fn) => {
    return setTimeout(() => {
      if (typeof fn === 'function') {
        fn();
      }
    }, 16); // 约60fps
  };
  global.cancelAnimationFrame = (id) => {
    return clearTimeout(id);
  };
}

// 设置 performance polyfill (React Native 不支持 performance API)
if (typeof global.performance === 'undefined') {
  // 使用 Date.now() 作为基准时间，提供高精度时间戳
  const startTime = Date.now();
  global.performance = {
    now: () => {
      // 返回从某个基准时间开始的毫秒数
      // 使用 Date.now() - startTime 来模拟高精度时间
      return Date.now() - startTime;
    },
    // 兼容 Web Performance API 的其他方法
    timing: {
      navigationStart: startTime,
    },
    mark: () => {},
    measure: () => {},
    clearMarks: () => {},
    clearMeasures: () => {},
    getEntriesByType: () => [],
    getEntriesByName: () => [],
  };
}

