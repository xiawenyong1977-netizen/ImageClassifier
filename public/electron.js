const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

  // 禁用应用菜单
  Menu.setApplicationMenu(null);

function createWindow() {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      // GPU 相关配置，解决 GPU 状态错误
      hardwareAcceleration: false,  // 禁用硬件加速
      offscreen: false,  // 禁用离屏渲染
      backgroundThrottling: false  // 禁用后台节流
    },
    icon: path.join(__dirname, 'icon.png'),
    title: '图片分类助手',
    autoHideMenuBar: true,  // 隐藏默认菜单栏
    titleBarStyle: 'hidden',  // 隐藏默认标题栏
    frame: true,  // 显示窗口框架
    titleBarOverlay: {
      color: '#f0f0f0',
      symbolColor: '#333',
      height: 32
    },
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true
  });

  // 加载应用
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);


  // 开发环境下打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 添加快捷键来切换开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'r') {
      mainWindow.reload();
    }
  });


  // 监听设置按钮点击事件
  const { ipcMain } = require('electron');
  ipcMain.on('show-settings-menu', (event) => {
    // 直接导航到设置页面
    mainWindow.webContents.send('navigate-to-settings');
  });

  // 监听自定义标题栏设置按钮点击
  ipcMain.on('titlebar-settings-click', (event) => {
    console.log('[Electron Main] 标题栏设置按钮被点击');
    mainWindow.webContents.send('navigate-to-settings');
  });

  // 监听窗口控制按钮事件
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });


  // 监听文件删除请求
  ipcMain.on('delete-file', (event, filePath) => {
    console.log(`[Electron Main] 收到删除文件请求: ${filePath}`);
    try {
      const fs = require('fs');
      const path = require('path');
      
      console.log(`[Electron Main] 检查文件是否存在: ${filePath}`);
      // 检查文件是否存在
      if (fs.existsSync(filePath)) {
        console.log(`[Electron Main] 文件存在，开始删除...`);
        // 删除文件
        fs.unlinkSync(filePath);
        console.log(`[Electron Main] 文件删除成功: ${filePath}`);
        event.reply('delete-file-result', { success: true, message: '文件删除成功' });
      } else {
        console.log(`[Electron Main] 文件不存在: ${filePath}`);
        event.reply('delete-file-result', { success: false, message: '文件不存在' });
      }
    } catch (error) {
      console.error(`[Electron Main] 文件删除失败: ${filePath}`, error);
      event.reply('delete-file-result', { success: false, message: `文件删除失败: ${error.message}` });
    }
  });

  // 监听更新标题栏统计信息
  ipcMain.on('update-titlebar-stats', (event, stats) => {
    console.log(`[Electron Main] 更新标题栏统计信息:`, stats);
    try {
      const totalImages = stats.totalImages || 0;
      const classified = stats.classified || 0;
      const totalSize = stats.totalSize ? (stats.totalSize / 1024 / 1024).toFixed(1) : '0';
      const titleText = `图片分类助手 | 总照片: ${totalImages} | 已分类: ${classified} | 大小: ${totalSize}MB`;
      
      // 更新窗口标题
      mainWindow.setTitle(titleText);
    } catch (error) {
      console.error(`[Electron Main] 更新标题栏统计信息失败:`, error);
    }
  });

  // 页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Electron Main] 页面加载完成');
  });


  // 窗口关闭事件
  mainWindow.on('closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// IPC处理函数
function setupIpcHandlers() {
  // 处理文件夹选择请求
  ipcMain.handle('select-folder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择照片目录',
        buttonLabel: '选择',
        defaultPath: 'D:\\Pictures'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      } else {
        return { success: false, message: '用户取消了选择' };
      }
    } catch (error) {
      console.error('文件夹选择失败:', error);
      return { success: false, message: '文件夹选择失败: ' + error.message };
    }
  });
}

// 在应用启动前设置 GPU 相关参数，解决 GPU 状态错误
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--disable-background-timer-throttling');
app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('--disable-renderer-backgrounding');

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();
});

// 当所有窗口都关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
