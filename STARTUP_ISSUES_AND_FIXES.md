# Potential Issues and Fixes

Based on my analysis of the ImageClassifier codebase, I've identified and fixed several potential issues that could prevent the application from starting properly:

## Fixed Issues

### 1. Duplicate Electron Import
- **Issue**: Line 261 had a duplicate `const { ipcMain } = require('electron');` inside a function
- **Fix**: Removed the duplicate import since electron modules are already imported at the top of the file

### 2. ONNX Runtime Loading for Electron
- **Issue**: Electron environment was loading `onnxruntime-web` instead of the preferred `onnxruntime-node`
- **Fix**: Changed to load `onnxruntime-node` first for Electron (with fallback to web version if needed)

## Common Startup Issues and Solutions

### Issue A: Canvas Module Problems
The canvas module often causes startup issues on macOS. If you're having problems:
```bash
# Option 1: Skip canvas installation initially
npm install --no-optional

# Option 2: Install system dependencies first
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
npm install canvas@^2.11.2
```

### Issue B: Port Already in Use
If the React development server fails to start:
```bash
# Kill any process using port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "Port 3000 is free"
```

### Issue C: File Permissions
Make sure the application has proper file access permissions in System Preferences > Security & Privacy > Privacy > Files and Folders

## Recommended Startup Sequence

1. **Terminal 1** (React Development Server):
```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
PORT=3001 npm start  # Use alternate port to avoid conflicts
```

2. **Terminal 2** (Electron App):
```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
npx electron .
```

## Alternative: Build and Run Directly

If development mode doesn't work:
```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
npm run build
npx electron .
```

## Verification Steps

To verify the application is working:
1. Check that the main window opens
2. Verify the app title shows "芯图相册-智能分类，便捷管理，仅你可见"
3. Check that menus appear correctly (File, Edit, View, Window)
4. Verify the icon displays properly

## Debugging Tips

If issues persist:
```bash
# Run with verbose logging
DEBUG=* npx electron .

# Or enable electron logging
ELECTRON_ENABLE_LOGGING=1 npx electron .

# Check if the index.html file exists
ls -la /Users/xwyftjk/.openclaw/workspace/ImageClassifier/public/index.html
```

The fixes I've implemented should resolve the most common startup issues. The application should now start properly on your macOS system.