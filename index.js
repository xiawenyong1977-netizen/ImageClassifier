console.log('📦 index.js: 开始加载应用...');

// 设置全局 Buffer polyfill (React Native 需要)
import { Buffer } from 'buffer';
global.Buffer = Buffer;
console.log('📦 index.js: Buffer polyfill 设置成功');

import 'react-native-gesture-handler';
console.log('📦 index.js: gesture-handler 加载成功');

import {AppRegistry} from 'react-native';
console.log('📦 index.js: AppRegistry 加载成功');

import App from './src/App';
console.log('📦 index.js: App 组件加载成功');

import {name as appName} from './package.json';
console.log('📦 index.js: 准备注册应用:', appName);

AppRegistry.registerComponent(appName, () => App);
console.log('📦 index.js: ✅ 应用注册成功!');
