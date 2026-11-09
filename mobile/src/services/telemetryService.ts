/**
 * AttendSure - Zero-Mock Foreground Telemetry Service
 * File: mobile/src/services/telemetryService.ts
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { enqueueOfflineHeartbeat, QueuedTelemetryPayload } from './offlineQueue';

const DEVICE_UUID_STORAGE_KEY = 'attendsure_hardware_device_uuid';
let lastSentTimestamp = 0;
const ONE_MINUTE_MS = 60000;

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
  timestamp?: string;
}

export const getHardwareDeviceUuid = async (): Promise<string | null> => {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_UUID_STORAGE_KEY);
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }

    let realHardwareId: string | null = null;
    if (Platform.OS === 'android') {
      realHardwareId = Application.getAndroidId();
    } else if (Platform.OS === 'ios') {
      realHardwareId = await Application.getIosIdForVendorAsync();
    }

    if (realHardwareId && realHardwareId.trim().length > 0) {
      const cleanId = `DEV-${Platform.OS.toUpperCase()}-${realHardwareId.trim().toUpperCase()}`;
      await AsyncStorage.setItem(DEVICE_UUID_STORAGE_KEY, cleanId);
      return cleanId;
    }
  } catch {}
  return null;
};

export const getOrCreateDeviceUuid = getHardwareDeviceUuid;

export const getRealDeviceModel = (): string | null => {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as Record<string, any>;
    const brand = constants?.Brand || constants?.brand || '';
    const model = constants?.Model || constants?.model || '';
    const full = `${brand} ${model}`.trim();
    return full.length > 0 ? full : null;
  }
  if (Platform.OS === 'ios') {
    return 'Apple iOS Device';
  }
  return null;
};

export const getRealBatteryPercentage = async (): Promise<number | null> => {
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (typeof level === 'number' && level >= 0 && !isNaN(level)) {
      return Math.round(level * 100);
    }
  } catch {}
  return null;
};

export const evaluateRealSignal = (
  accuracyMeters: number | null | undefined
): { label: string | null; percentage: number | null } => {
  if (accuracyMeters === null || accuracyMeters === undefined || accuracyMeters < 0 || isNaN(accuracyMeters)) {
    return { label: null, percentage: null };
  }
  if (accuracyMeters <= 15) {
    return { label: 'Strong', percentage: 95 };
  } else if (accuracyMeters <= 30) {
    return { label: 'Good', percentage: 75 };
  } else if (accuracyMeters <= 60) {
    return { label: 'Fair', percentage: 50 };
  } else {
    return { label: 'Weak', percentage: 25 };
  }
};

export const format12HourTime = (date: Date = new Date()): string => {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  return `${strHours}:${minutes}:${seconds} ${ampm}`;
};

export const sendLiveHeartbeat = async (
  coordsOrIdentifier?: CoordinatesPayload | string
): Promise<HeartbeatResponse> => {
  const now = Date.now();
  if (now - lastSentTimestamp < ONE_MINUTE_MS && lastSentTimestamp !== 0) {
    return { status: 'THROTTLED' };
  }

  let lat: number | undefined;
  let lng: number | undefined;
  let acc: number | null = null;
  let isMock = false;

  if (coordsOrIdentifier && typeof coordsOrIdentifier === 'object') {
    lat = coordsOrIdentifier.latitude;
    lng = coordsOrIdentifier.longitude;
    acc = coordsOrIdentifier.accuracy ?? null;
    isMock = Boolean(coordsOrIdentifier.mocked);
  }

  if (lat === undefined || lng === undefined) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required.');
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    acc = loc.coords.accuracy ?? null;
    isMock = Boolean(loc.mocked);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid satellite coordinates.');
  }

  const [hardwareUuid, batteryLevel] = await Promise.all([
    getHardwareDeviceUuid(),
    getRealBatteryPercentage(),
  ]);

  const deviceModel = getRealDeviceModel();
  const signal = evaluateRealSignal(acc);

  const payload: QueuedTelemetryPayload = {
    client_device_id: hardwareUuid,
    latitude: lat,
    longitude: lng,
    accuracy: acc,
    battery_level: batteryLevel,
    is_mock_location: isMock,
    mac_address: hardwareUuid,
    signal_strength: signal.label,
    signal_percentage: signal.percentage,
    device_model: deviceModel,
  };

  try {
    const res = await apiClient.post(
      'geofence/checkin/',
      {
        client_device_id: hardwareUuid,
        device_id: hardwareUuid,
        mac_address: hardwareUuid,
        device_model: deviceModel,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        accuracy_meters: acc,
        battery_level: batteryLevel,
        is_mock_location: isMock,
        signal_strength: signal.label,
        signal_percentage: signal.percentage,
      },
      { timeout: 8000 }
    );

    lastSentTimestamp = now;
    return {
      ...res.data,
      isQueuedOffline: false,
    };
  } catch (err: any) {
    const httpStatus = err?.response?.status;
    const msg = err?.response?.data?.error || err?.message;

    if (httpStatus === 403) {
      throw new Error(msg || 'Device lock mismatch or mock location detected.');
    }

    await enqueueOfflineHeartbeat(payload);
    return {
      isQueuedOffline: true,
    };
  }
};