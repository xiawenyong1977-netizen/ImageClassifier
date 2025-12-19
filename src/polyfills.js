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

// 设置 Intl polyfill (React Native 的 JavaScriptCore 在某些 Android 版本中不支持 Intl)
// 直接使用简单实现，避免 require 失败导致应用无法启动
if (typeof global.Intl === 'undefined') {
  global.Intl = {
    DateTimeFormat: class {
      constructor(locale, options) {
        this.locale = locale;
        this.options = options;
      }
      format(date) {
        // 简单的日期格式化实现
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        // 使用简单的日期格式化，不依赖 Intl
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
    },
    NumberFormat: class {
      constructor(locale, options) {
        this.locale = locale;
        this.options = options;
      }
      format(number) {
        // 简单的数字格式化实现
        if (typeof number !== 'number') return String(number);
        // 使用简单的数字格式化，不依赖 Intl
        return String(number);
      }
    },
    Collator: class {
      constructor(locale, options) {
        this.locale = locale;
        this.options = options;
      }
      compare(a, b) {
        // 简单的字符串比较实现（不依赖 localeCompare）
        const aStr = String(a || '').toLowerCase();
        const bStr = String(b || '').toLowerCase();
        if (aStr < bStr) return -1;
        if (aStr > bStr) return 1;
        return 0;
      }
    }
  };
}

