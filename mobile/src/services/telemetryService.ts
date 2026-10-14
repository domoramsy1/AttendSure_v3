// mobile/src/services/telemetryService.ts

import { Platform } from 'react-native';
import * as Location from 'expo-location';
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
 * Retrieves the persistent hardware UUID for this phone so Django's
 * TelemetryHeartbeatAPIView can lock the account to one physical device.
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
 * Reads GPS coordinates on both Android/iOS (via expo-location) and Web (via browser Geolocation).
 */
const getCurrentCoordinates = async (): Promise<{
  latitude: number;
  longitude: number;
  mocked: boolean;
}> => {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            mocked: false,
          });
        },
        (err) => {
          reject(new Error(err.message || 'Browser location permission denied.'));
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
    accuracy: Location.Accuracy.High,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    mocked: Boolean(location.mocked),
  };
};

/**
 * Captures real GPS coordinates and sends a live heartbeat to `/api/telemetry/heartbeat/`.
 * Automatically queues the ping in offline storage if the server cannot be reached.
 */
export const sendLiveHeartbeat = async (facultyIdentifier?: string): Promise<HeartbeatResponse> => {
  const coords = await getCurrentCoordinates();
  const hardwareUuid = await getHardwareDeviceUuid(facultyIdentifier);

  const payload: QueuedTelemetryPayload = {
    client_device_id: hardwareUuid,
    latitude: coords.latitude,
    longitude: coords.longitude,
    battery_level: 100,
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

    // If the server actively rejected the request (400/403 Device Mismatch or Mock GPS), throw the exact server message
    if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
      const backendError =
        err?.response?.data?.error ||
        err?.response?.data?.security_alert ||
        err?.response?.data?.detail ||
        'Telemetry rejected by server.';
      throw new Error(backendError);
    }

    // If the network timed out or server is unreachable, save to offline queue
    await enqueueOfflineHeartbeat(payload);
    return {
      isQueuedOffline: true,
    };
  }
};