// 哈希计算Worker
// 在Web Worker中计算图片哈希，避免阻塞主线程

// 检查是否在Worker环境中
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  // 在Web Worker中
  self.onmessage = async function(e) {
    const { imageUri, taskId } = e.data;
    
    try {
      // 安全地加载图片数据
      let blob;
      
      if (imageUri.startsWith('file://')) {
        // 在Worker中无法直接访问Node.js fs模块
        // 需要从主线程传递ArrayBuffer
        throw new Error('Worker中无法直接读取本地文件，需要从主线程传递数据');
      } else {
        // 网络URL：使用 fetch
        const response = await fetch(imageUri);
        blob = await response.blob();
      }
      
      const arrayBuffer = await blob.arrayBuffer();
      
      // 计算SHA-256哈希
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // 返回结果
      self.postMessage({
        taskId,
        success: true,
        hash: hashHex
      });
      
    } catch (error) {
      // 返回错误
      self.postMessage({
        taskId,
        success: false,
        error: error.message
      });
    }
  };
} else {
  // 不在Worker环境中，导出空对象
  module.exports = {};
}
