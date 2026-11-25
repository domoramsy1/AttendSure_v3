// AttendSure Mobile - Metro Bundler Configuration
// Safely shims expo async-require/hmrUtils on native so Expo Go on React Native 0.88
// never throws "Cannot read property 'hide' of undefined".
// File: mobile/metro.config.js

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const hmrUtilsShimPath = path.resolve(__dirname, 'src/shims/hmrUtils.native.js');
const expoCryptoShimPath = path.resolve(__dirname, 'src/shims/expoCryptoShim.js');
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalizedModule = String(moduleName || '').replace(/\\/g, '/');
  const normalizedOrigin = String(context.originModulePath || '').replace(/\\/g, '/');

  if (normalizedModule === 'expo-crypto' && normalizedOrigin !== expoCryptoShimPath.replace(/\\/g, '/')) {
    return {
      filePath: expoCryptoShimPath,
      type: 'sourceFile',
    };
  }

  if (platform !== 'web') {
    const isRelativeHmrUtils =
      (normalizedModule === './hmrUtils' ||
        normalizedModule === './hmrUtils.native' ||
        normalizedModule === './hmrUtils.js' ||
        normalizedModule === './hmrUtils.native.js') &&
      normalizedOrigin.includes('/async-require/');

    const isDirectHmrUtils =
      normalizedModule.endsWith('/async-require/hmrUtils') ||
      normalizedModule.endsWith('/async-require/hmrUtils.native') ||
      normalizedModule.endsWith('/async-require/hmrUtils.js') ||
      normalizedModule.endsWith('/async-require/hmrUtils.native.js');

    if (isRelativeHmrUtils || isDirectHmrUtils) {
      return {
        filePath: hmrUtilsShimPath,
        type: 'sourceFile',
      };
    }
  }

  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
