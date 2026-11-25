/**
 * AttendSure - Live Campus GPS Geofence Ping Service
 * File: mobile/src/services/telemetryService.ts
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import type * as BatteryType from 'expo-battery';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getFriendlyErrorMessage } from '../constants/theme';
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

let lastSentTimestamp = 0;
export const ADAPTIVE_PING_INTERVAL_MS = 45000;

export { getOrCreateDeviceUuid, getHardwareDeviceUuid };

export type HeartbeatResponse = CampusPingResponse;

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
    return full.length > 0 ? full : null;
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
  if (accuracyMeters <= 15) return { label: 'Strong', percentage: 95 };
  if (accuracyMeters <= 30) return { label: 'Good', percentage: 75 };
  if (accuracyMeters <= 60) return { label: 'Fair', percentage: 50 };
  return { label: 'Weak', percentage: 25 };
};

export const format12HourTime = (date: Date = new Date()): string => {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const strHours = String(hours).padStart(2, '0');
  return `${strHours}:${minutes}:${seconds} ${ampm}`;
};

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
  let isMock = false;

  if (coordsOrOptions && typeof coordsOrOptions === 'object') {
    lat = coordsOrOptions.latitude;
    lng = coordsOrOptions.longitude;
    acc = coordsOrOptions.accuracy ?? null;
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
      throw new Error('Waiting for GPS satellite fix. Move near a window or open area.');
    }
    lat = loc.coords.latitude;
    lng = loc.coords.longitude;
    acc = loc.coords.accuracy ?? null;
    isMock = Boolean(loc.mocked);
  }

  // Strictly reject mocked / fake GPS locations before hitting the API
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

  const hardwareUuid = await getHardwareDeviceUuid();
  const deviceModel = getRealDeviceModel();

  const pingPayload = {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    accuracy_meters: acc !== null ? Number(acc.toFixed(1)) : 15,
    device_id: hardwareUuid,
    is_mock_location: false,
  };

  try {
    const res = await apiClient.post<CampusPingResponse>(ENDPOINTS.CAMPUS_PING, pingPayload, {
      timeout: 8000,
    });
    lastSentTimestamp = now;
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
      device_id: hardwareUuid,
      latitude: pingPayload.latitude,
      longitude: pingPayload.longitude,
      accuracy_meters: pingPayload.accuracy_meters,
      is_mock_location: false,
      device_model: deviceModel,
    };
    await enqueueOfflineHeartbeat(offlinePayload);
    return { isQueuedOffline: true };
  }
};
