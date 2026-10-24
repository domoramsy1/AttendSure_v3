// D:\AttendSure_V3\mobile\index.ts

import { NativeModules } from 'react-native';

// Polyfill DevLoadingView to prevent hmrUtils crash when Metro reloads
if (typeof NativeModules !== 'undefined' && NativeModules && !NativeModules.DevLoadingView) {
  NativeModules.DevLoadingView = {
    showMessage: () => {},
    hide: () => {},
  };
}

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);