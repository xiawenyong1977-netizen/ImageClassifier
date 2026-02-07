# macOS Development Guide for ImageClassifier

This document explains how to develop, build, and run the ImageClassifier application on macOS.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git

## Setup Instructions

1. Clone the repository:
```bash
git clone <repository-url>
cd ImageClassifier
```

2. Install dependencies for the desktop version:
```bash
cd pc-version-final
npm install
```

## Key Changes for macOS Support

The following changes were made to ensure proper macOS support:

1. **Electron Configuration** (`public/electron.js`):
   - Added cross-platform dependency checking
   - Implemented cross-platform clipboard functionality
   - Added proper icon handling for different platforms
   - Fixed file deletion to work with macOS
   - Added proper menu support for macOS
   - Improved GPU settings for macOS

2. **Web Adapters** (`src/adapters/WebAdapters.js`):
   - Fixed file system operations for macOS paths
   - Corrected IPC communication between renderer and main process
   - Improved path normalization for different operating systems

## Running in Development Mode

To run the application in development mode:

```bash
cd pc-version-final
npm start
```

In another terminal:
```bash
cd pc-version-final
npx electron .
```

## Building for macOS

To build the application for macOS:

```bash
cd pc-version-final
npm run electron:build-mac
```

This will create a distributable DMG file in the `dist/` folder.

## Testing on macOS

1. Make sure you have Xcode Command Line Tools installed:
```bash
xcode-select --install
```

2. For Apple Silicon Macs (M1/M2), the build process will automatically create an ARM64 version.

3. To test the packaged application locally:
```bash
open dist/*.dmg
```

## Troubleshooting

### Common Issues:

1. **Icon not showing**: Make sure `icon.icns` exists in the `public` directory.
2. **File operations failing**: Check that the application has proper file system permissions.
3. **Clipboard not working**: The application may need accessibility permissions in System Preferences.

### Permissions:

For full functionality, make sure to grant the following permissions in macOS System Preferences:
- Accessibility (for clipboard operations)
- Full Disk Access (for file operations)
- Photos (for image access)

## Development Notes

- The application uses Electron to provide cross-platform desktop support
- File system operations are abstracted through WebAdapters.js
- Platform-specific code is handled through conditional logic based on `process.platform`
- The same codebase supports Android, Windows, and macOS

## Architecture

```
ImageClassifier/
├── public/                 # Static assets, including platform-specific icons
│   ├── electron.js         # Electron main process
│   ├── icon.icns          # macOS icon
│   ├── icon.ico           # Windows icon
│   └── icon.png           # Linux icon
├── src/
│   ├── adapters/          # Platform abstraction layer
│   │   └── WebAdapters.js # Cross-platform implementations
│   └── App.desktop.js     # Desktop-specific app entry
└── pc-version-final/      # Electron app configuration
    ├── package.json       # Build configurations
    └── public/            # Symlink to main public directory
```

## Contributing

When adding new features, make sure to:
1. Test on macOS if the feature involves file system operations
2. Use the WebAdapters abstraction for cross-platform compatibility
3. Handle paths appropriately for different operating systems
4. Consider macOS-specific UI patterns and conventions