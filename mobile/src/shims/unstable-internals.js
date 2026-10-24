/**
 * AttendSure - React Native Internal Resolution Shim
 * File: mobile/src/shims/unstable-internals.js
 *
 * Resolves AssetSourceResolver for Expo Asset compatibility.
 */

let AssetSourceResolver;

try {
  AssetSourceResolver = require('react-native/Libraries/Image/AssetSourceResolver');
} catch (e1) {
  try {
    AssetSourceResolver = require('@react-native/assets-registry/AssetSourceResolver');
  } catch (e2) {
    AssetSourceResolver = class AssetSourceResolver {
      constructor(serverUrl, jsbundleUrl, asset) {
        this.serverUrl = serverUrl;
        this.jsbundleUrl = jsbundleUrl;
        this.asset = asset;
      }
      isLoadedFromServer() {
        return Boolean(this.serverUrl);
      }
      isLoadedFromFileSystem() {
        return Boolean(this.jsbundleUrl && this.jsbundleUrl.startsWith('file://'));
      }
      defaultAsset() {
        return this.asset;
      }
      scaledAssetURL(scale) {
        return this.asset;
      }
    };
  }
}

let resolveAssetSource;
try {
  resolveAssetSource = require('react-native/Libraries/Image/resolveAssetSource');
} catch (e) {
  resolveAssetSource = (source) => source;
}

const ResolvedResolver = AssetSourceResolver.default || AssetSourceResolver;
const ResolvedSource = resolveAssetSource.default || resolveAssetSource;

module.exports = {
  __esModule: true,
  default: {
    AssetSourceResolver: ResolvedResolver,
    resolveAssetSource: ResolvedSource,
  },
  AssetSourceResolver: ResolvedResolver,
  resolveAssetSource: ResolvedSource,
};
