const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard, nativeImage } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
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

  // 设置应用菜单 - 为 macOS 提供标准菜单
  if (process.platform === 'darwin') {
    // 为 macOS 创建标准菜单
    const template = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(process.platform === 'darwin' ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' }
          ] : [
            { role: 'close' }
          ])
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } else {
    // 在 Windows/Linux 上，我们可以选择不显示菜单或显示简化菜单
    // 当前保持禁用状态，也可以构建一个简化的菜单
    const template = [
      {
        label: 'File',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

// 检查并安装 Visual C++ Redistributable
function checkAndInstallPlatformDependencies() {
  if (isDev) return; // 开发环境跳过
  
  if (process.platform === 'win32') {
    // Windows-specific: 检查并安装 Visual C++ Redistributable
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
  } else if (process.platform === 'darwin') {
    // macOS-specific: 检查必要依赖 (if any needed)
    logger.info('macOS 系统，跳过特定依赖安装检查');
  } else if (process.platform === 'linux') {
    // Linux-specific: 检查必要依赖 (if any needed)
    logger.info('Linux 系统，跳过特定依赖安装检查');
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
      // 在 macOS 上启用硬件加速以获得更好的性能
      hardwareAcceleration: process.platform === 'darwin',
      offscreen: false,  // 禁用离屏渲染
      backgroundThrottling: false  // 禁用后台节流
    },
    icon: process.platform === 'darwin' 
      ? path.join(__dirname, './icon.icns')  // macOS 使用 ICNS 格式
      : process.platform === 'win32'
        ? path.join(__dirname, './icon.ico')  // Windows 使用 ICO 格式
        : path.join(__dirname, './icon.png'), // Linux 使用 PNG 格式
    title: '芯图相册-智能分类，便捷管理，仅你可见',
    autoHideMenuBar: true,  // 隐藏默认菜单栏
    // 混合模式：titleBarOverlay + 自定义内容
    titleBarStyle: 'hidden',
    frame: true,
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
  
  // 在开发和生产环境中都启用对本地文件的访问权限
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // 添加跨域头，以便能够加载本地模型文件
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Headers': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, OPTIONS']
      }
    });
  });


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

      // 根据操作系统选择适当的剪贴板处理方式
      if (process.platform === 'win32') {
        // Windows平台：使用原有的PowerShell方法
        const tempFilePath = path.join(os.tmpdir(), `clipboard_files_${Date.now()}.txt`);
        
        try {
          // 将文件路径写入临时文件，每行一个路径
          // 使用UTF-8编码，并在每行末尾添加换行符
          const fileContent = existingFiles.map(filePath => {
            // 转义路径中的特殊字符，使用Base64编码避免路径中的特殊字符问题
            return Buffer.from(filePath, 'utf8').toString('base64');
          }).join('\n');
          
          fs.writeFileSync(tempFilePath, fileContent, 'utf8');
          logger.debug(`📋 已创建临时文件: ${tempFilePath}，包含 ${existingFiles.length} 个文件路径`);
          
          // 构建PowerShell脚本，从临时文件读取路径
          // 将文件路径转换为PowerShell中的安全字符串（使用单引号，并转义单引号）
          const tempFileEscaped = tempFilePath.replace(/'/g, "''");
          const psScript = `Add-Type -AssemblyName System.Windows.Forms;
$files = New-Object System.Collections.Specialized.StringCollection;
$tempFile = '${tempFileEscaped}';

if (Test-Path $tempFile) {
  $filePaths = Get-Content $tempFile -Encoding UTF8;
  $count = 0;
  $errorCount = 0;
  foreach ($encodedPath in $filePaths) {
    if ([string]::IsNullOrWhiteSpace($encodedPath)) {
      continue;
    }
    try {
      $filePath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encodedPath.Trim()));
      if (Test-Path $filePath) {
        [void]$files.Add($filePath);
        $count++;
        if ($count % 500 -eq 0) {
          Write-Host "Processed $count files...";
        }
      }
    } catch {
      $errorCount++;
      if ($errorCount -le 10) {
        Write-Host "Error decoding path: $_";
      }
    }
  }
  if ($files.Count -gt 0) {
    [System.Windows.Forms.Clipboard]::SetFileDropList($files);
    Write-Host "Successfully copied $($files.Count) files to clipboard";
  } else {
    Write-Host "No valid files found to copy";
    exit 1;
  }
  Remove-Item $tempFile -Force -ErrorAction SilentlyContinue;
} else {
  Write-Host "Temp file not found: $tempFile";
  exit 1;
}`;
          
          // 将PowerShell脚本保存到临时文件，避免命令行参数长度限制
          const psScriptPath = path.join(os.tmpdir(), `clipboard_script_${Date.now()}.ps1`);
          fs.writeFileSync(psScriptPath, psScript, 'utf8');
          logger.debug(`📋 已创建PowerShell脚本: ${psScriptPath}`);
          
          // 执行PowerShell脚本
          const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}"`;
          
          exec(psCommand, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            // 清理临时文件
            try {
              if (fs.existsSync(psScriptPath)) {
                fs.unlinkSync(psScriptPath);
              }
              if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
              }
            } catch (cleanupError) {
              logger.warn(`清理临时文件失败:`, cleanupError);
            }
            
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
        } catch (fileError) {
          logger.error(`❌ 创建临时文件失败:`, fileError);
          // 清理临时文件
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (cleanupError) {
            // 忽略清理错误
          }
          event.reply('copy-files-result', { 
            success: false, 
            error: `创建临时文件失败: ${fileError.message}` 
          });
        }
      } else if (process.platform === 'darwin') {
        // macOS平台：使用osascript设置剪贴板
        const appleScript = `
          use AppleScript version "2.4"
          use framework "Foundation"
          use framework "AppKit"

          property NSFileManager : a reference to current application's NSFileManager
          property NSURL : a reference to current application's NSURL
          property NSWorkspace : a reference to current application's NSWorkspace

          set fileUrls to {}
          repeat with aPath in {"${existingFiles.map(p => escapePathForAppleScript(p)).join('", "')}"} as list
            set end of fileUrls to (NSURL's fileURLWithPath:aPath)
          end repeat

          set pb to the pasteboard "NSGeneralPboard"
          pb's clearContents()
          pb's writeObjects:fileUrls
        `;

        // 保存AppleScript到临时文件并执行
        const scriptPath = path.join(os.tmpdir(), `clipboard_script_${Date.now()}.scpt`);
        fs.writeFileSync(scriptPath, appleScript, 'utf8');
        logger.debug(`📋 已创建AppleScript: ${scriptPath}`);

        const osaCommand = `osascript "${scriptPath}"`;
        exec(osaCommand, (error, stdout, stderr) => {
          // 清理临时文件
          try {
            if (fs.existsSync(scriptPath)) {
              fs.unlinkSync(scriptPath);
            }
          } catch (cleanupError) {
            logger.warn(`清理临时文件失败:`, cleanupError);
          }

          if (error) {
            logger.error(`❌ AppleScript执行失败:`, error);
            event.reply('copy-files-result', { 
              success: false, 
              error: `复制失败: ${error.message}` 
            });
          } else {
            logger.info(`✅ AppleScript执行成功`);
            event.reply('copy-files-result', { 
              success: true, 
              copiedCount: existingFiles.length,
              skippedCount: missingFiles.length
            });
          }
        });
      } else {
        // Linux及其他平台：使用xclip或xsel（如果可用）
        // 首先尝试使用系统剪贴板API
        try {
          // 使用Electron的clipboard API来设置文件路径
          // 注意：这可能不适用于所有Linux桌面环境
          clipboard.write({
            bookmark: existingFiles.join('\n'),
            text: existingFiles.join('\n')
          });
          
          logger.info(`✅ Linux剪贴板设置成功`);
          event.reply('copy-files-result', { 
            success: true, 
            copiedCount: existingFiles.length,
            skippedCount: missingFiles.length
          });
        } catch (error) {
          logger.error(`❌ Linux剪贴板设置失败:`, error);
          event.reply('copy-files-result', { 
            success: false, 
            error: `复制失败: ${error.message}` 
          });
        }
      }
    } catch (error) {
      logger.error(`❌ 复制文件到剪贴板失败:`, error);
      event.reply('copy-files-result', { 
        success: false, 
        error: error.message 
      });
    }
  });

  // 辅助函数：为AppleScript转义路径
  function escapePathForAppleScript(p) {
    return p.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  // 页面加载完成
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('页面加载完成');
  });


  // 窗口关闭事件
  mainWindow.on('closed', () => {
    // 在 macOS 上，当所有窗口关闭时并不退出应用程序
    // 用户可以通过dock重新打开窗口
    // 在其他平台上，关闭最后一个窗口时退出应用
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
      // 动态获取用户的 Pictures 目录
      const os = require('os');
      const path = require('path');
      const defaultPath = path.join(os.homedir(), 'Pictures');
      
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择照片目录',
        buttonLabel: '选择',
        defaultPath: defaultPath
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

  // ========== AI图像增强相关 IPC handlers ==========
  
  /**
   * 确保目录存在（递归创建）
   * 用于创建 xualbum 目录来存储增强后的图片
   */
  ipcMain.handle('ensure-directory', async (event, dirPath) => {
    try {
      const fs = require('fs').promises;
      await fs.mkdir(dirPath, { recursive: true });
      logger.debug('✅ 目录已创建:', dirPath);
      return { success: true, path: dirPath };
    } catch (error) {
      logger.error('❌ 创建目录失败:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * 保存文件到指定路径
   * 用于保存增强后的图片到 xualbum 目录
   */
  ipcMain.handle('save-file-to-path', async (event, { path, buffer }) => {
    try {
      const fs = require('fs').promises;
      const pathModule = require('path');
      
      // 确保父目录存在
      const dir = pathModule.dirname(path);
      await fs.mkdir(dir, { recursive: true });
      
      // 写入文件
      await fs.writeFile(path, Buffer.from(buffer));
      logger.debug('✅ 文件已保存:', path);
      
      return { success: true, path };
    } catch (error) {
      logger.error('❌ 保存文件失败:', error);
      return { success: false, error: error.message };
    }
  });

  // ========== 分享功能相关 IPC handlers ==========
  
  /**
   * 复制图片文件到剪贴板（作为图片对象）
   */
  ipcMain.handle('shell-copy-image-to-clipboard', async (event, imagePath) => {
    try {
      // 使用nativeImage加载图片
      const image = nativeImage.createFromPath(imagePath);
      
      if (image.isEmpty()) {
        logger.error('❌ 图片为空或加载失败:', imagePath);
        return { success: false, error: '图片加载失败' };
      }
      
      // 将图片写入剪贴板
      clipboard.writeImage(image);
      logger.debug('✅ 图片已复制到剪贴板:', imagePath);
      return { success: true };
    } catch (error) {
      logger.error('❌ 复制图片失败:', error);
      return { success: false, error: error.message };
    }
  });

}

// 在应用启动前设置 GPU 相关参数，解决 GPU 状态错误
// 在 macOS 上，我们可能会启用硬件加速，因为它通常有更好的图形支持
if (process.platform !== 'darwin') {
  app.commandLine.appendSwitch('--disable-gpu');
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
}
app.commandLine.appendSwitch('--disable-background-timer-throttling');
app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('--disable-renderer-backgrounding');

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  checkAndInstallPlatformDependencies(); // 检查并安装平台特定依赖
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
