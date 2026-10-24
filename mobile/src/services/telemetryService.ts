// mobile/src/services/telemetryService.ts

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { enqueueOfflineHeartbeat, QueuedTelemetryPayload } from './offlineQueue';

const DEVICE_UUID_STORAGE_KEY = 'attendsure_hardware_device_uuid';

export interface HeartbeatResponse {
  status?: string;
  device_bound?: boolean;
  distance_meters?: number;
  is_inside_perimeter?: boolean;
  server_time?: string;
  isQueuedOffline?: boolean;
}

/**
 * Retrieves or initializes the hardware device lock UUID.
 */
export const getHardwareDeviceUuid = async (fallbackId?: string): Promise<string> => {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_UUID_STORAGE_KEY);
    if (existing) return existing;

    const randomHex = () =>
      Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1)
        .toUpperCase();

    const generated = `DEV-${Platform.OS.toUpperCase()}-${randomHex()}${randomHex()}-${randomHex()}`;
    await AsyncStorage.setItem(DEVICE_UUID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return fallbackId || `DEV-${Platform.OS.toUpperCase()}-DEFAULT`;
  }
};

/**
 * Reads GPS coordinates across Native and Web platforms.
 */
const getCurrentCoordinates = async (): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked: boolean;
}> => {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || null,
            mocked: false,
          });
        },
        (err) => {
          reject(new Error(err.message || 'Location permission denied.'));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission is required to verify campus presence.');
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy || null,
    mocked: Boolean(location.mocked),
  };
};

/**
 * Reads battery percentage from device hardware.
 */
const getBatteryPercentage = async (): Promise<number> => {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level >= 0) return Math.round(level * 100);
  } catch {}
  return 100;
};

/**
 * Captures real GPS and posts to `/api/telemetry/heartbeat/`.
 */
export const sendLiveHeartbeat = async (facultyIdentifier?: string): Promise<HeartbeatResponse> => {
  const coords = await getCurrentCoordinates();
  const hardwareUuid = await getHardwareDeviceUuid(facultyIdentifier);
  const batteryLevel = await getBatteryPercentage();

  const payload: QueuedTelemetryPayload = {
    client_device_id: hardwareUuid,
    device_id: hardwareUuid,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy_meters: coords.accuracy,
    battery_level: batteryLevel,
    is_mock_location: coords.mocked,
  };

  try {
    const res = await apiClient.post('/api/telemetry/heartbeat/', payload);
    return {
      ...res.data,
      isQueuedOffline: false,
    };
  } catch (err: any) {
    const httpStatus = err?.response?.status;

    // Reject on hardware mismatch (403) or mock GPS (403)
    if (httpStatus === 403) {
      const backendError =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Account locked to another device or mock GPS detected.';
      throw new Error(backendError);
    }

    // Queue offline on connection failure
    await enqueueOfflineHeartbeat(payload);
    return {
      isQueuedOffline: true,
    };
  }
};