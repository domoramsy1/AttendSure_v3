/**
 * AttendSure - Live Campus GPS Check-In Service
 * File: mobile/src/services/telemetryService.ts
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { apiClient } from '../api/client';
import { getFriendlyErrorMessage } from '../constants/theme';
import { getOrCreateDeviceUuid, getHardwareDeviceUuid } from './deviceService';
import { enqueueOfflineHeartbeat, QueuedTelemetryPayload } from './offlineQueue';

let lastSentTimestamp = 0;
const ONE_MINUTE_MS = 60000;

export { getOrCreateDeviceUuid, getHardwareDeviceUuid };

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

export const getRealDeviceModel = (): string | null => {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as unknown as Record<string, unknown>;
    const brand = typeof constants?.Brand === 'string'
      ? constants.Brand
      : typeof constants?.brand === 'string'
      ? constants.brand
      : '';
    const model = typeof constants?.Model === 'string'
      ? constants.Model
      : typeof constants?.model === 'string'
      ? constants.model
      : '';
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
    if (typeof level === 'number' && level >= 0 && !Number.isNaN(level)) {
      return Math.round(level * 100);
    }
  } catch {}
  return null;
};

export const evaluateRealSignal = (
  accuracyMeters: number | null | undefined
): { label: string | null; percentage: number | null } => {
  if (
    accuracyMeters === null ||
    accuracyMeters === undefined ||
    accuracyMeters < 0 ||
    Number.isNaN(accuracyMeters)
  ) {
    return { label: null, percentage: null };
  }
  if (accuracyMeters <= 15) {
    return { label: 'Strong', percentage: 95 };
  }
  if (accuracyMeters <= 30) {
    return { label: 'Good', percentage: 75 };
  }
  if (accuracyMeters <= 60) {
    return { label: 'Fair', percentage: 50 };
  }
  return { label: 'Weak', percentage: 25 };
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
      throw new Error('Location permission is required to verify campus presence.');
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    acc = loc.coords.accuracy ?? null;
    isMock = Boolean(loc.mocked);
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error('Unable to read valid campus location coordinates.');
  }

  const [uuidRes, batteryRes] = await Promise.allSettled([
    getHardwareDeviceUuid(),
    getRealBatteryPercentage(),
  ]);

  const hardwareUuid = uuidRes.status === 'fulfilled' ? uuidRes.value : '';
  const batteryLevel = batteryRes.status === 'fulfilled' ? batteryRes.value : null;

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
      'geofence/check-in/',
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
  } catch (err: unknown) {
    const httpStatus = (err as { response?: { status?: number } })?.response?.status;

    if (httpStatus === 401) {
      throw new Error(
        getFriendlyErrorMessage(err, 'Your session expired. Please sign in again.')
      );
    }

    if (httpStatus === 403) {
      throw new Error(
        getFriendlyErrorMessage(err, 'Device lock mismatch or fake location detected.')
      );
    }

    await enqueueOfflineHeartbeat(payload);
    return {
      isQueuedOffline: true,
    };
  }
};
