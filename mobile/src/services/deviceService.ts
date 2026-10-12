import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Safe loaders for Expo hardware modules
let Device: any = null;
let Application: any = null;

try {
  Device = require('expo-device');
} catch {
  // Graceful fallback if expo-device is unavailable
}

try {
  Application = require('expo-application');
} catch {
  // Graceful fallback if expo-application is unavailable
}

const DEVICE_ID_STORAGE_KEY = '@attendsure_device_uuid';

export interface DeviceHardwareInfo {
  client_device_id: string;
  deviceId: string;
  brand: string | null;
  device_model: string | null;
  deviceModel: string | null;
  modelName: string | null;
  osName: string | null;
  osVersion: string | null;
  isPhysicalDevice: boolean;
}

/**
 * Gets or creates a stable hardware ID for this phone.
 */
export const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    // 1. Try native Android ID
    if (Platform.OS === 'android' && Application?.getAndroidId) {
      const androidId = Application.getAndroidId();
      if (androidId) {
        return `PHONE-ANDROID-${androidId.toUpperCase()}`;
      }
    }

    // 2. Try native iOS Identifier
    if (Platform.OS === 'ios' && Application?.getIosIdForVendorAsync) {
      const iosId = await Application.getIosIdForVendorAsync();
      if (iosId) {
        return `PHONE-IOS-${iosId.toUpperCase()}`;
      }
    }

    // 3. Fallback to cached ID in storage
    const storedId = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (storedId) {
      return storedId;
    }

    // 4. Generate and save a new persistent device ID
    const randomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const newId = `PHONE-${Platform.OS.toUpperCase()}-${randomHex.toUpperCase()}`;
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    return newId;
  } catch {
    return `PHONE-${Platform.OS.toUpperCase()}-CLIENT-ID`;
  }
};

/**
 * Reads phone hardware information for device binding.
 */
export const getDeviceHardwareInfo = async (): Promise<DeviceHardwareInfo> => {
  const deviceId = await getOrCreateDeviceId();

  const brand = Device?.brand || (Platform.OS === 'ios' ? 'Apple' : 'Android');
  const modelName = Device?.modelName || Device?.designName || Device?.productName || Platform.OS;
  const deviceModel = modelName;
  const osName = Device?.osName || Platform.OS;
  const osVersion = Device?.osVersion ? String(Device.osVersion) : String(Platform.Version);
  const isPhysicalDevice = Device?.isDevice ?? true;

  return {
    client_device_id: deviceId,
    deviceId: deviceId,
    brand,
    device_model: deviceModel,
    deviceModel: deviceModel,
    modelName,
    osName,
    osVersion,
    isPhysicalDevice,
  };
};

// Aliases for compatibility across older screens
export const getDeviceIdentity = getDeviceHardwareInfo;
export const getDeviceId = getOrCreateDeviceId;

export default {
  getDeviceHardwareInfo,
  getDeviceIdentity,
  getDeviceId,
  getOrCreateDeviceId,
};