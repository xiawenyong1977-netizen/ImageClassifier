const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1' || !app.isPackaged;

// 简单的日志系统
const logger = {
  debug: (message, ...args) => {
    if (isDev) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};

  // 禁用应用菜单
  Menu.setApplicationMenu(null);

// 检查并安装 Visual C++ Redistributable
function checkAndInstallVCRedist() {
  if (isDev) return; // 开发环境跳过
  
  const redistPath = path.join(process.resourcesPath, 'redist');
  const vcRedistPath = path.join(redistPath, 'vc_redist.x64.exe');
  
  if (fs.existsSync(vcRedistPath)) {
    logger.info('检查 Visual C++ Redistributable...');
    
    // 检查是否已安装
    exec('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64"', (error) => {
      if (error) {
        logger.info('Visual C++ Redistributable 未安装，正在安装...');
        
        // 静默安装
        exec(`"${vcRedistPath}" /quiet /norestart`, (installError) => {
          if (installError) {
            logger.warn('Visual C++ Redistributable 安装失败:', installError);
          } else {
            logger.info('Visual C++ Redistributable 安装成功');
          }
        });
      } else {
        logger.info('Visual C++ Redistributable 已安装');
      }
    });
  }
}

function createWindow() {
  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,  // 开发环境需要禁用以加载本地文件
      // GPU 相关配置，解决 GPU 状态错误
      hardwareAcceleration: false,  // 禁用硬件加速
      offscreen: false,  // 禁用离屏渲染
      backgroundThrottling: false  // 禁用后台节流
    },
    icon: path.join(__dirname, '../icons/imageclassify.png'),  // 使用更高分辨率的图标
    title: '芯图相册-智能分类，便捷管理，仅你可见',
    autoHideMenuBar: true,  // 隐藏默认菜单栏
    titleBarStyle: 'hidden',  // 隐藏原生标题栏
    frame: true,  // 保持窗口框架
    titleBarOverlay: {
      color: '#2f3241',  // 标题栏背景色
      symbolColor: '#74b1be',  // 控制按钮颜色
      height: 60  // 标题栏高度
    },
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true
  });

  // 加载应用
  logger.info('开发环境检测:', {
    NODE_ENV: process.env.NODE_ENV,
    ELECTRON_IS_DEV: process.env.ELECTRON_IS_DEV,
    isPackaged: app.isPackaged,
    isDev: isDev
  });
  
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, 'index.html')}`;
  
  logger.info('加载应用:', startUrl);
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
    logger.debug('标题栏设置按钮被点击');
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
    logger.debug(`收到删除文件请求: ${filePath}`);
    try {
      const fs = require('fs');
      const path = require('path');
      
      logger.debug(`检查文件是否存在: ${filePath}`);
      // 检查文件是否存在
      if (fs.existsSync(filePath)) {
        logger.debug(`文件存在，开始删除...`);
        // 删除文件
        fs.unlinkSync(filePath);
        logger.info(`文件删除成功: ${filePath}`);
        event.reply('delete-file-result', { success: true, message: '文件删除成功' });
      } else {
        logger.warn(`文件不存在: ${filePath}`);
        event.reply('delete-file-result', { success: false, message: '文件不存在' });
      }
    } catch (error) {
      logger.error(`文件删除失败: ${filePath}`, error);
      event.reply('delete-file-result', { success: false, message: `文件删除失败: ${error.message}` });
    }
  });

  // 监听更新标题栏统计信息
  ipcMain.on('update-titlebar-stats', (event, stats) => {
    logger.debug(`更新标题栏统计信息:`, stats);
    try {
      const totalImages = stats.totalImages || 0;
      const classified = stats.classified || 0;
      const totalSize = stats.totalSize ? (stats.totalSize / 1024 / 1024).toFixed(1) : '0';
      const titleText = `芯图相册-智能分类，便捷管理，仅你可见 | 总照片: ${totalImages} | 已分类: ${classified} | 大小: ${totalSize}MB`;
      
      // 更新窗口标题
      mainWindow.setTitle(titleText);
    } catch (error) {
      logger.error(`更新标题栏统计信息失败:`, error);
    }
  });

  // 监听复制文件到剪贴板请求
  ipcMain.on('copy-files-to-clipboard', (event, filePaths) => {
    logger.info(`📋 收到复制文件请求，数量: ${filePaths.length}`);
    
    try {
      if (!Array.isArray(filePaths) || filePaths.length === 0) {
        logger.warn('文件路径列表为空');
        event.reply('copy-files-result', { success: false, error: '文件路径列表为空' });
        return;
      }

      logger.debug(`📋 文件路径列表:`, filePaths);

      // 验证所有文件是否存在
      const existingFiles = [];
      const missingFiles = [];
      
      for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
          existingFiles.push(filePath);
          logger.debug(`✅ 文件存在: ${filePath}`);
        } else {
          missingFiles.push(filePath);
          logger.warn(`❌ 文件不存在: ${filePath}`);
        }
      }

      if (existingFiles.length === 0) {
        logger.error('所有文件都不存在');
        event.reply('copy-files-result', { 
          success: false, 
          error: '所有文件都不存在' 
        });
        return;
      }

      logger.info(`📋 准备复制 ${existingFiles.length} 个文件到剪贴板`);
      logger.debug(`📋 文件列表:`, existingFiles);

      // 使用PowerShell脚本复制文件到剪贴板（Windows最可靠的方法）
      // 构建PowerShell命令
      const filePathsForPS = existingFiles.map(p => `'${p.replace(/'/g, "''")}'`).join(', ');
      const psCommand = `
        Add-Type -AssemblyName System.Windows.Forms;
        $files = New-Object System.Collections.Specialized.StringCollection;
        $filePaths = @(${filePathsForPS});
        foreach ($filePath in $filePaths) {
          if (Test-Path $filePath) {
            [void]$files.Add($filePath);
            Write-Host "Added: $filePath";
          } else {
            Write-Host "File not found: $filePath";
          }
        }
        [System.Windows.Forms.Clipboard]::SetFileDropList($files);
        Write-Host "Copied $($files.Count) files to clipboard";
      `;
      
      logger.debug(`📋 PowerShell命令:`, psCommand);
      
      exec(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`❌ PowerShell执行失败:`, error);
          logger.error(`stderr:`, stderr);
          event.reply('copy-files-result', { 
            success: false, 
            error: `复制失败: ${error.message}` 
          });
        } else {
          logger.info(`✅ PowerShell执行成功`);
          logger.debug(`stdout:`, stdout);
          if (stderr) {
            logger.warn(`stderr:`, stderr);
          }
          
          event.reply('copy-files-result', { 
            success: true, 
            copiedCount: existingFiles.length,
            skippedCount: missingFiles.length
          });
        }
      });
    } catch (error) {
      logger.error(`❌ 复制文件到剪贴板失败:`, error);
      event.reply('copy-files-result', { 
        success: false, 
        error: error.message 
      });
    }
  });

  // 页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('页面加载完成');
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
  // 处理窗口控制请求
  ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  ipcMain.handle('window-close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

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
      logger.error('文件夹选择失败:', error);
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
  checkAndInstallVCRedist(); // 检查并安装运行库
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
