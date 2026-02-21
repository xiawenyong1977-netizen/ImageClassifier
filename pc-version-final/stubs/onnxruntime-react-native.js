/**
 * PC/Electron 构建用桩模块：不安装 onnxruntime-react-native，避免 resolve 报错。
 * 桌面端使用 onnxruntime-node，此模块不会被调用。
 */
module.exports = {};
module.exports.default = {};
