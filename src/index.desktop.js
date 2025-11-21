import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.desktop';
import { logger } from './adapters/WebAdapters';

// 全局错误处理：捕获未处理的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
  // 过滤掉浏览器扩展相关的错误（这些错误不影响应用功能）
  const errorPath = event.reason?.reqInfo?.path || '';
  const errorMessage = event.reason?.message || '';
  
  // 如果是扩展程序或无关的请求错误，仅记录debug日志，不显示错误
  if (errorPath.includes('/user/check_country') || 
      (errorMessage.includes('Failed to fetch') && 
       (errorPath.includes('/user/') || errorMessage.includes('network error')))) {
    logger.debug('⚠️ 检测到网络请求错误（可能是扩展程序或服务不可用）:', {
      path: errorPath,
      message: errorMessage
    });
    // 阻止错误冒泡到控制台
    event.preventDefault();
    return;
  }
  
  // 其他错误正常处理
  logger.error('❌ 未处理的 Promise 错误:', event.reason);
});

// 全局错误处理：捕获未捕获的异常
window.addEventListener('error', (event) => {
  // 过滤掉扩展程序相关的错误
  if (event.filename && event.filename.includes('content.js')) {
    logger.debug('⚠️ 检测到扩展程序错误（不影响应用）:', event.message);
    event.preventDefault();
    return;
  }
  
  logger.error('❌ 未捕获的异常:', event.error);
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <App />
);
