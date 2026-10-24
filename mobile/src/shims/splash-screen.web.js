/**
 * AttendSure - Web Splash Screen Shim
 * File: mobile/src/shims/splash-screen.web.js
 */

export async function preventAutoHideAsync() {
  return true;
}

export async function hideAsync() {
  return true;
}

export function hide() {
  return true;
}

export function preventAutoHide() {
  return true;
}

const SplashScreenShim = {
  preventAutoHideAsync,
  hideAsync,
  hide,
  preventAutoHide,
};

export default SplashScreenShim;
module.exports = {
  __esModule: true,
  preventAutoHideAsync,
  hideAsync,
  hide,
  preventAutoHide,
  default: SplashScreenShim,
};
