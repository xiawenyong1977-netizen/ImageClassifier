# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

XinTu Album (芯图相册) is an AI-powered photo classification app. The repo contains:

| Directory | Purpose | Dev command |
|-----------|---------|-------------|
| `/` (root) | React Native mobile app (Android/iOS) | `npx react-native start` |
| `pc-version-final/` | PC desktop version (React + Craco + Electron) | `npm start` (port 3000) |

`pc-version-final/src` is a **symlink** to `../src` — both platforms share the same core source.

### Running the PC desktop version (primary dev target in Cloud)

```bash
cd pc-version-final
npm start          # React dev server at http://localhost:3000
npm run build      # Production build
```

Electron requires a display and is not usable in headless Cloud VMs; use the browser dev server instead.

### Lint and tests

- **Lint**: The root `npm run lint` (`eslint .`) requires an `.eslintrc` config that is not present in the repo — it will error. This is a pre-existing repo issue, not an environment problem.
- **Tests**: `npx jest --passWithNoTests` in root — no test files currently exist.
- The PC version uses CRA's built-in ESLint (via `craco build`) which runs lint checks during the build step.

### System dependencies for `canvas` npm package

The `pc-version-final` depends on the native `canvas` npm package, which requires these system libraries:

```
libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev libpixman-1-dev
```

These are installed during initial VM setup. If `npm install` in `pc-version-final/` fails with `pixman` or `cairo` errors, install them via `apt-get`.

### External API

The app calls `https://api.aifuture.net.cn` for remote AI classification, image enhancement, and city lookup. These are optional — the app degrades gracefully to local-only inference when the API is unreachable.
