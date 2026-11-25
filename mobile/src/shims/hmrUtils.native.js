/**
 * AttendSure Mobile - Safe Native HMR Utils Shim for Expo Go / React Native 0.88
 * Prevents "Cannot read property 'hide' of undefined" when DevLoadingView is absent
 * from react-native/unstable-internals-do-not-use.
 * File: mobile/src/shims/hmrUtils.native.js
 */

import { DevSettings, LogBox, NativeModules } from 'react-native';

const ANSI_ESCAPE_REGEX = /\u001b\[[0-9;]*m/g;

function getUnstableInternals() {
  try {
    return require('react-native/unstable-internals-do-not-use') || {};
  } catch {
    return {};
  }
}

class HMRMetroBuildError extends Error {
  constructor(message = 'Unknown Metro Error', type, cause) {
    super(String(message || 'Unknown Metro Error').replace(ANSI_ESCAPE_REGEX, ''));
    this.name = type || 'BuildError';
    this.cause = cause;
    this.originalMessage = [type, message].filter(Boolean).join(': ');
    this.stack = '';
  }
}

export function showLoading(message, type) {
  try {
    const { DevLoadingView } = getUnstableInternals();
    if (DevLoadingView && typeof DevLoadingView.showMessage === 'function') {
      DevLoadingView.showMessage(message, type);
    }
  } catch {
    // Safely ignore when DevLoadingView is unavailable in Expo Go on RN 0.88
  }
}

export function hideLoading() {
  try {
    const { DevLoadingView } = getUnstableInternals();
    if (DevLoadingView && typeof DevLoadingView.hide === 'function') {
      DevLoadingView.hide();
    }
  } catch {
    // Safely ignore when DevLoadingView is unavailable in Expo Go on RN 0.88
  }
}

function dismissRedbox() {
  try {
    const { NativeRedBox, NativeExceptionsManager } = getUnstableInternals();
    if (process.env.EXPO_OS === 'ios' && NativeRedBox && typeof NativeRedBox.dismiss === 'function') {
      NativeRedBox.dismiss();
      return;
    }
    if (NativeExceptionsManager && typeof NativeExceptionsManager.dismissRedbox === 'function') {
      NativeExceptionsManager.dismissRedbox();
    }
  } catch {
    // Safely ignore if native redbox bridge is unavailable
  }
}

export function resetErrorOverlay() {
  dismissRedbox();
  try {
    if (LogBox && typeof LogBox.clearAllLogs === 'function') {
      LogBox.clearAllLogs();
    }
  } catch {
    // Safely ignore
  }
}

export function reload() {
  try {
    if (DevSettings && typeof DevSettings.reload === 'function') {
      DevSettings.reload('Bundle Splitting - Metro disconnected');
    }
  } catch {
    // Safely ignore
  }
}

export function getFullBundlerUrl({ serverScheme, serverHost, bundleEntry, platform }) {
  try {
    const scriptUrl = NativeModules?.SourceCode?.scriptURL;
    if (typeof scriptUrl === 'string' && scriptUrl.startsWith('http')) {
      return scriptUrl;
    }
  } catch {
    // Fall back to reconstructed bundler URL
  }
  return `${serverScheme}://${serverHost}/hot?bundleEntry=${bundleEntry}&platform=${platform}`;
}

export function getConnectionError(serverHost, e) {
  let error = `Cannot connect to Expo CLI.

Try the following to fix the issue:
- Ensure that Expo dev server is running and available on the same network`;
  if (process.env.EXPO_OS === 'android') {
    error += `
- Ensure that your device/emulator is connected to your machine and has USB debugging enabled - run 'adb devices' to see a list of connected devices
- If you're on a physical device connected to the same machine, run 'adb reverse tcp:8081 tcp:8081' to forward requests from your device`;
  }
  error += `

URL: ${serverHost}

Error: ${e?.message || String(e || 'Connection failed')}`;
  return error;
}

export function handleCompileError(cause) {
  if (cause === null || cause === undefined) {
    return;
  }
  dismissRedbox();
  try {
    if (LogBox && typeof LogBox.addException === 'function') {
      LogBox.addException(new HMRMetroBuildError(cause.message, cause.type, cause.cause));
    }
  } catch {
    // Safely ignore
  }
}
