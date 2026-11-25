// AttendSure Mobile - Telemetry Service
// File: D:\AttendSure_V3\mobile\src\services\telemetryService.ts

import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import type * as BatteryType from 'expo-battery';
import type * as NetworkType from 'expo-network';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getFriendlyErrorMessage } from '../constants/theme';
import { formatTime12h } from '../utils/formatters';
import { getOrCreateDeviceUuid, getHardwareDeviceUuid } from './deviceService';
import {
  enqueueOfflineHeartbeat,
  syncOfflineQueue,
  QueuedCampusPingPayload,
} from './offlineQueue';
import type { CampusPingResponse } from '../types';

function getBatteryModule(): typeof BatteryType | null {
  try {
    return require('expo-battery') as typeof BatteryType;
  } catch {
    return null;
  }
}

function getNetworkModule(): typeof NetworkType | null {
  try {
    return require('expo-network') as typeof NetworkType;
  } catch {
    return null;
  }
}

let lastSentTimestamp = 0;
export const ADAPTIVE_PING_INTERVAL_MS = 45000;

export { getOrCreateDeviceUuid, getHardwareDeviceUuid };

export type HeartbeatResponse = CampusPingResponse;

export interface CoordinatesPayload {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  mocked?: boolean;
  timestampMs?: number;
  timestamp?: string;
}

export interface PhoneHealthSnapshot {
  device_model: string | null;
  battery_percent: number | null;
  is_charging: boolean | null;
  is_low_power_mode: boolean | null;
  network_type: 'WIFI' | 'CELLULAR' | 'NONE' | 'UNKNOWN';
  is_gps_enabled: boolean;
  app_state: 'ACTIVE' | 'BACKGROUND' | 'UNKNOWN';
}

export const getRealDeviceModel = (): string | null => {
  if (Platform.OS === 'android') {
    const constants = Platform.constants as unknown as Record<string, unknown>;
    const brand =
      typeof constants?.Brand === 'string'
        ? constants.Brand
        : typeof constants?.brand === 'string'
          ? constants.brand
          : '';
    const model =
      typeof constants?.Model === 'string'
        ? constants.Model
        : typeof constants?.model === 'string'
          ? constants.model
          : '';
    const full = `${brand} ${model}`.trim();
    return full.length > 0 ? full : 'Android Phone';
  }
  if (Platform.OS === 'ios') {
    return 'Apple iOS Device';
  }
  return null;
};

export const getRealBatteryPercentage = async (): Promise<number | null> => {
  try {
    const Battery = getBatteryModule();
    if (!Battery || typeof Battery.getBatteryLevelAsync !== 'function') {
      return null;
    }
    const level = await Battery.getBatteryLevelAsync();
    if (typeof level === 'number' && level >= 0 && !Number.isNaN(level)) {
      return Math.min(100, Math.max(0, Math.round(level * 100)));
    }
  } catch {}
  return null;
};

export const collectCurrentPhoneHealth = async (): Promise<PhoneHealthSnapshot> => {
  const Battery = getBatteryModule();
  const Network = getNetworkModule();

  const [powerState, netState, gpsEnabled] = await Promise.all([
    Battery && typeof Battery.getPowerStateAsync === 'function'
      ? Battery.getPowerStateAsync().catch(() => null)
      : Promise.resolve(null),
    Network && typeof Network.getNetworkStateAsync === 'function'
      ? Network.getNetworkStateAsync().catch(() => null)
      : Promise.resolve(null),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);

  const rawLevel = powerState?.batteryLevel;
  const batteryPercent =
    typeof rawLevel === 'number' && rawLevel >= 0 && Number.isFinite(rawLevel)
      ? Math.min(100, Math.max(0, Math.round(rawLevel * 100)))
      : null;

  let isCharging: boolean | null = null;
  if (Battery && powerState?.batteryState !== undefined) {
    if (
      powerState.batteryState === Battery.BatteryState.CHARGING ||
      powerState.batteryState === Battery.BatteryState.FULL
    ) {
      isCharging = true;
    } else if (powerState.batteryState === Battery.BatteryState.UNPLUGGED) {
      isCharging = false;
    }
  }

  let networkType: PhoneHealthSnapshot['network_type'] = 'UNKNOWN';
  if (Network && netState) {
    if (netState.isConnected === false || netState.type === Network.NetworkStateType.NONE) {
      networkType = 'NONE';
    } else if (netState.type === Network.NetworkStateType.WIFI) {
      networkType = 'WIFI';
    } else if (netState.type === Network.NetworkStateType.CELLULAR) {
      networkType = 'CELLULAR';
    }
  }

  const currentAppState = AppState.currentState;
  const appState: PhoneHealthSnapshot['app_state'] =
    currentAppState === 'active'
      ? 'ACTIVE'
      : currentAppState === 'background' || currentAppState === 'inactive'
        ? 'BACKGROUND'
        : 'UNKNOWN';

  return {
    device_model: getRealDeviceModel(),
    battery_percent: batteryPercent,
    is_charging: isCharging,
    is_low_power_mode:
      typeof powerState?.lowPowerMode === 'boolean' ? powerState.lowPowerMode : null,
    network_type: networkType,
    is_gps_enabled: Boolean(gpsEnabled),
    app_state: appState,
  };
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
  if (accuracyMeters <= 15) return { label: 'Strong', percentage: 95 };
  if (accuracyMeters <= 30) return { label: 'Good', percentage: 75 };
  if (accuracyMeters <= 60) return { label: 'Fair', percentage: 50 };
  return { label: 'Weak', percentage: 25 };
};

export const format12HourTime = (date: Date = new Date()): string =>
  formatTime12h(date, { includeSeconds: true });

export const sendLiveHeartbeat = async (
  coordsOrOptions?: CoordinatesPayload,
  force = false
): Promise<HeartbeatResponse> => {
  const now = Date.now();
  if (!force && now - lastSentTimestamp < ADAPTIVE_PING_INTERVAL_MS && lastSentTimestamp !== 0) {
    return { zone_status: 'THROTTLED' };
  }

  let lat: number | undefined;
  let lng: number | undefined;
  let acc: number | null = null;
  let speedMps: number | null = null;
  let gpsTimestampMs = now;
  let isMock = false;

  if (coordsOrOptions && typeof coordsOrOptions === 'object') {
    lat = coordsOrOptions.latitude;
    lng = coordsOrOptions.longitude;
    acc = coordsOrOptions.accuracy ?? null;
    speedMps =
      typeof coordsOrOptions.speed === 'number' && coordsOrOptions.speed >= 0
        ? Math.round(coordsOrOptions.speed * 100) / 100
        : null;
    gpsTimestampMs = coordsOrOptions.timestampMs || now;
    isMock = Boolean(coordsOrOptions.mocked);
  }

  if (lat === undefined || lng === undefined) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required to check campus boundaries.');
    }
    let loc: Location.LocationObject | null = null;
    try {
      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      loc = await Location.getLastKnownPositionAsync({
        maxAge: 120000,
        requiredAccuracy: 250,
      }).catch(() => null);
    }
    if (!loc || !loc.coords) {
      throw new Error('Waiting for GPS signal. Move near a window or open area.');
    }
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    acc = loc.coords.accuracy ?? null;
    speedMps =
      typeof loc.coords.speed === 'number' && loc.coords.speed >= 0
        ? Math.round(loc.coords.speed * 100) / 100
        : null;
    gpsTimestampMs = Math.round(loc.timestamp || now);
    isMock = Boolean(loc.mocked);
  }

  if (isMock) {
    throw new Error(
      'Fake GPS or mock location detected. Turn off mock location apps before pinging campus.'
    );
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error('Unable to read valid campus GPS coordinates.');
  }

  if (acc !== null && acc > 250) {
    throw new Error(
      `GPS signal is too weak (${Math.round(acc)}m accuracy). Move to an open area and try again.`
    );
  }

  const [hardwareUuid, phoneHealth] = await Promise.all([
    getHardwareDeviceUuid(),
    collectCurrentPhoneHealth(),
  ]);

  const pingPayload = {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    accuracy_meters: acc !== null ? Number(acc.toFixed(1)) : 15,
    speed_mps: speedMps,
    gps_timestamp_ms: gpsTimestampMs,
    device_id: hardwareUuid,
    is_mock_location: false,
    ping_source: 'FOREGROUND' as const,
    recorded_at: new Date(gpsTimestampMs).toISOString(),
    ...phoneHealth,
  };

  try {
    const res = await apiClient.post<CampusPingResponse>(ENDPOINTS.CAMPUS_PING, pingPayload, {
      timeout: 8000,
    });
    lastSentTimestamp = now;
    // Unified sync handles QR scans, offline GPS pings, and general queued actions together
    void syncOfflineQueue().catch(() => {});
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

    if (httpStatus === 400 || httpStatus === 403) {
      throw new Error(
        getFriendlyErrorMessage(
          err,
          'Phone binding mismatch or GPS verification blocked by school server.'
        )
      );
    }

    const offlinePayload: QueuedCampusPingPayload = {
      ...pingPayload,
      ping_source: 'OFFLINE_QUEUE',
    };
    await enqueueOfflineHeartbeat(offlinePayload);
    return { isQueuedOffline: true };
  }
};
