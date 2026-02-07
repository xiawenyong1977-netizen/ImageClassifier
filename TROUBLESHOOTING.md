# Troubleshooting ImageClassifier on macOS

## Common Issues and Solutions

### Issue 1: Missing Dependencies
If you see errors about missing modules:

**Solution:**
```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
npm install
# If specific modules fail, install them individually:
npm install canvas@^2.11.2 --save
```

### Issue 2: Build Errors
If you see compilation errors:

**Solution:**
```bash
# Clean install
rm -rf node_modules
rm package-lock.json
npm cache clean --force
npm install
```

### Issue 3: Electron Startup Issues
If Electron fails to start:

**Solution:**
```bash
# Check if electron is installed globally
npm install -g electron

# Or run with npx
npx electron@latest .
```

### Issue 4: ONNX Runtime Issues
If you see ONNX-related errors:

**Solution:**
```bash
# Install the specific ONNX runtime for macOS
npm install onnxruntime-node --arch=x64 --platform=darwin
# For Apple Silicon:
npm install onnxruntime-node --arch=arm64 --platform=darwin
```

### Issue 5: File Permission Errors
If you see file access errors:

**Solution:**
1. Make sure the application has proper file system permissions in System Preferences
2. Check that the public folder exists and has proper permissions:
```bash
ls -la /Users/xwyftjk/.openclaw/workspace/ImageClassifier/public/
```

## Debugging Steps

### Step 1: Check Dependencies
```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
npm list electron
npm list react
npm list onnxruntime-node
```

### Step 2: Verify Files
```bash
# Check if required files exist
ls -la /Users/xwyftjk/.openclaw/workspace/ImageClassifier/public/electron.js
ls -la /Users/xwyftjk/.openclaw/workspace/ImageClassifier/public/icon.icns
ls -la /Users/xwyftjk/.openclaw/workspace/ImageClassifier/src/App.desktop.js
```

### Step 3: Run with Verbose Logging
```bash
# Terminal 1 - React app with verbose logging
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
REACT_APP_VERBOSE_LOGGING=1 npm start

# Terminal 2 - Electron app with debugging
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
DEBUG=* npx electron . --enable-logging
```

### Step 4: Alternative Startup Method
If the above doesn't work, try building first:
```bash
cd /Users/xwyftjk/.openclaw/workspace/ImageClassifier/pc-version-final
npm run build
npx electron .
```

### Step 5: Development Mode with Error Reporting
```bash
# Start with development flags
ELECTRON_ENABLE_LOGGING=1 ELECTRON_ENABLE_STACK_DUMPING=1 npx electron .
```

## Specific Known Issues and Solutions

### Canvas Module Issues
If canvas continues to cause problems:
```bash
# Remove canvas from dependencies temporarily
npm uninstall canvas
# The application will work without advanced image processing features
```

### ONNX Runtime for macOS
For Apple Silicon Macs specifically:
```bash
# Uninstall and reinstall with specific platform
npm uninstall onnxruntime-node
npm install onnxruntime-node --platform=darwin --arch=arm64 --target_arch=arm64
```

## Getting More Information

To help diagnose the specific issues you're experiencing, please run:

```bash
# Check Node and NPM versions
node -v
npm -v

# Check system info
uname -a

# Try a simple electron hello world to verify electron works
cd /tmp
mkdir test-electron && cd test-electron
npm init -y
npm install electron
echo '{"main":"index.js"}' > package.json
echo "const {app,BrowserWindow} = require('electron'); app.whenReady().then(()=>{new BrowserWindow().loadURL('https://github.com')})" > index.js
npx electron .
```

If you can share the specific error messages you're seeing, I can provide more targeted solutions.