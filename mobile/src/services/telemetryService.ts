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
  distance?: string;
  distance_meters?: number;
  verified_inside?: boolean;
  is_inside_perimeter?: boolean;
  server_time?: string;
  isQueuedOffline?: boolean;
}

export interface CoordinatesPayload {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  mocked?: boolean;
}

/**
 * Retrieves or registers the hardware device lock UUID in persistent storage.
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
    return fallbackId || `DEV-${Platform.OS.toUpperCase()}-DEVICE`;
  }
};

/**
 * Reads the actual phone model from React Native hardware constants.
 */
export const getRealDeviceModel = (): string => {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as Record<string, any>;
    const brand = constants?.Brand || constants?.brand || '';
    const model = constants?.Model || constants?.model || '';
    const full = `${brand} ${model}`.trim();
    return full || 'Android Device';
  }
  if (Platform.OS === 'ios') {
    return 'Apple iOS Device';
  }
  return 'Web Client';
};

/**
 * Reads battery percentage from phone hardware.
 * Always returns a clean integer number to satisfy the offline queue type.
 */
const getRealBatteryPercentage = async (): Promise<number> => {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (typeof level === 'number' && level >= 0) {
      return Math.round(level * 100);
    }
  } catch {
    // Hardware sensor unavailable
  }
  return 100;
};

/**
 * Transmits real GPS coordinates and hardware telemetry directly to PostgreSQL.
 */
export const sendLiveHeartbeat = async (
  coordsOrIdentifier?: CoordinatesPayload | string,
  fallbackIdentifier?: string
): Promise<HeartbeatResponse> => {
  let lat: number | undefined;
  let lng: number | undefined;
  let acc: number | null = null;
  let isMock = false;

  let facultyIdentifier: string | undefined;

  if (typeof coordsOrIdentifier === 'string') {
    facultyIdentifier = coordsOrIdentifier;
  } else if (coordsOrIdentifier && typeof coordsOrIdentifier === 'object') {
    lat = coordsOrIdentifier.latitude;
    lng = coordsOrIdentifier.longitude;
    acc = coordsOrIdentifier.accuracy ?? null;
    isMock = Boolean(coordsOrIdentifier.mocked);
    facultyIdentifier = fallbackIdentifier;
  }

  // Read location directly from device hardware if not supplied
  if (lat === undefined || lng === undefined) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required.');
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    acc = loc.coords.accuracy ?? null;
    isMock = Boolean(loc.mocked);
  }

  const hardwareUuid = await getHardwareDeviceUuid(facultyIdentifier);
  const batteryLevel = await getRealBatteryPercentage();
  const deviceModel = getRealDeviceModel();

  // Strictly satisfies QueuedTelemetryPayload using 'accuracy' and explicit cast
  const payload: QueuedTelemetryPayload = {
    client_device_id: hardwareUuid,
    latitude: lat,
    longitude: lng,
    accuracy: acc,
    battery_level: batteryLevel,
    is_mock_location: isMock,
  } as QueuedTelemetryPayload;

  try {
    // Send full telemetry to the backend including device pairing info
    const res = await apiClient.post('geofence/checkin/', {
      client_device_id: hardwareUuid,
      device_id: hardwareUuid,
      device_model: deviceModel,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      accuracy_meters: acc,
      battery_level: batteryLevel,
      is_mock_location: isMock,
    });

    return {
      ...res.data,
      isQueuedOffline: false,
    };
  } catch (err: any) {
    const httpStatus = err?.response?.status;

    // Security check: Stop immediately if mock GPS or wrong device is detected
    if (httpStatus === 403) {
      const msg = err?.response?.data?.error || 'Device lock mismatch or mock GPS detected.';
      throw new Error(msg);
    }

    // Queue telemetry locally if offline or connection drops
    await enqueueOfflineHeartbeat(payload);
    return {
      isQueuedOffline: true,
    };
  }
};