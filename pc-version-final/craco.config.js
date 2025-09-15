const path = require('path');

module.exports = {
  babel: {
    presets: [
      '@babel/preset-env',
      '@babel/preset-react'
    ],
    plugins: [
      '@babel/plugin-proposal-class-properties'
    ]
  },
  webpack: {
    configure: (webpackConfig) => {
      // 指定入口文件为 index.desktop.js
      webpackConfig.entry = path.resolve(__dirname, 'src/index.desktop.js');
      
      // 添加别名，将 react-native 映射到 react-native-web
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        'react-native': 'react-native-web',
        // 强制使用正确的React版本
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      };
      
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "react-native-fs": false,
        "react-native-vector-icons": false,
        "react-native-image-picker": false,
      };
      
      // 使用 ignorePlugin 完全忽略这些模块
      const webpack = require('webpack');
      webpackConfig.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^(react-native-fs|react-native-vector-icons|react-native-image-picker)$/
        })
      );
      
      return webpackConfig;
    },
  },
};
