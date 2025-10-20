const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    sourceExts: ['js', 'json', 'ts', 'tsx', 'jsx'],
    // 明确指定平台扩展优先级
    platforms: ['ios', 'android', 'native', 'web'],
    alias: {
      buffer: 'buffer',
    },
    blockList: [
      /backup_.*\/.*/, // 排除所有备份目录
    ],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

