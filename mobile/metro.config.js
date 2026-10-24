// D:\AttendSure_V3\mobile\metro.config.js

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1. Safe web resolution for expo-splash-screen
  if (platform === 'web' && moduleName === 'expo-splash-screen') {
    return {
      filePath: path.resolve(__dirname, 'src/shims/splash-screen.web.js'),
      type: 'sourceFile',
    };
  }

  // 2. Resolve 'buffer' for react-native-svg & QR code generation
  if (moduleName === 'buffer') {
    return {
      filePath: path.resolve(__dirname, 'src/shims/buffer.js'),
      type: 'sourceFile',
    };
  }

  // 3. Resolve React Native internal exports for Expo Asset on Android / iOS
  if (moduleName.includes('unstable-internals-do-not-use')) {
    return {
      filePath: path.resolve(__dirname, 'src/shims/unstable-internals.js'),
      type: 'sourceFile',
    };
  }

  // 4. Resolve AssetRegistry for web platform
  if (platform === 'web' && moduleName.includes('AssetRegistry')) {
    try {
      return {
        filePath: require.resolve('react-native-web/dist/modules/AssetRegistry'),
        type: 'sourceFile',
      };
    } catch (e) {}
  }

  // 5. Resolve AssetRegistry for Android and iOS
  if (
    moduleName === 'react-native/asset-registry' ||
    moduleName === 'react-native/Libraries/Image/AssetRegistry' ||
    moduleName.endsWith('/asset-registry')
  ) {
    try {
      return {
        filePath: require.resolve('@react-native/assets-registry/registry.js'),
        type: 'sourceFile',
      };
    } catch (e) {
      try {
        return {
          filePath: require.resolve('react-native/Libraries/Image/AssetRegistry'),
          type: 'sourceFile',
        };
      } catch (err) {}
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;