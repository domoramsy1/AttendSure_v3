// AttendSure Mobile - Background & Sleeping GPS Location + Phone Telemetry Service
// File: D:\AttendSure_V3\mobile\src\services\backgroundLocation.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { getValidAccessToken, isJwtString } from '../api/client';
import { getServerBaseUrl, cleanUrl, SERVER_URL_STORAGE_KEY } from './configService';
import { getOrCreateDeviceUuid } from './deviceService';
import {
  enqueueOfflineHeartbeat,
  flushUnifiedOfflineGpsPings,
} from './offlineQueue';

export const TEACHER_DUTY_LOCATION_TASK = 'ATTENDSURE_TEACHER_DUTY_GPS_TASK';
export const TEACHER_ON_DUTY_KEY = 'attendsure_teacher_on_duty';

const BACKGROUND_TIME_INTERVAL_MS = 60000;

export interface PhoneTelemetryPayload {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_mps: number | null;
  gps_timestamp_ms: number;
  device_id: string;
  device_model: string | null;
  battery_percent: number | null;
  is_charging: boolean | null;
  is_low_power_mode: boolean | null;
  network_type: 'WIFI' | 'CELLULAR' | 'NONE' | 'UNKNOWN';
  is_gps_enabled: boolean;
  is_mock_location: boolean;
  app_state: 'ACTIVE' | 'BACKGROUND' | 'UNKNOWN';
  ping_source: 'FOREGROUND' | 'BACKGROUND_TASK' | 'OFFLINE_QUEUE';
  recorded_at: string;
}

function getPhoneModelLabel(): string | null {
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
  if (Platform.OS === 'ios') return 'Apple iOS Device';
  return null;
}

function mapNetworkType(
  netType: Network.NetworkStateType | undefined,
  isConnected: boolean | undefined
): PhoneTelemetryPayload['network_type'] {
  if (isConnected === false || netType === Network.NetworkStateType.NONE) {
    return 'NONE';
  }
  if (netType === Network.NetworkStateType.WIFI) return 'WIFI';
  if (netType === Network.NetworkStateType.CELLULAR) return 'CELLULAR';
  return 'UNKNOWN';
}

function mapAppState(): PhoneTelemetryPayload['app_state'] {
  const current = AppState.currentState;
  if (current === 'active') return 'ACTIVE';
  if (current === 'background' || current === 'inactive') return 'BACKGROUND';
  return 'UNKNOWN';
}

async function readResolvedServerBase(): Promise<string | null> {
  try {
    const base = await getServerBaseUrl();
    if (base && /^https?:\/\//i.test(base)) {
      return cleanUrl(base);
    }
  } catch {}
  const saved = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY).catch(() => null);
  if (saved && /^https?:\/\//i.test(saved)) {
    return cleanUrl(saved);
  }
  return null;
}

export async function collectPhoneTelemetry(
  location: Location.LocationObject,
  source: PhoneTelemetryPayload['ping_source'] = 'BACKGROUND_TASK'
): Promise<PhoneTelemetryPayload> {
  const [powerState, netState, servicesEnabled, deviceId] = await Promise.all([
    Battery.getPowerStateAsync().catch(() => null),
    Network.getNetworkStateAsync().catch(() => null),
    Location.hasServicesEnabledAsync().catch(() => true),
    getOrCreateDeviceUuid(),
  ]);

  const rawBattery = powerState?.batteryLevel;
  const batteryPercent =
    typeof rawBattery === 'number' && rawBattery >= 0 && Number.isFinite(rawBattery)
      ? Math.min(100, Math.max(0, Math.round(rawBattery * 100)))
      : null;

  const isCharging =
    powerState?.batteryState === Battery.BatteryState.CHARGING ||
    powerState?.batteryState === Battery.BatteryState.FULL
      ? true
      : powerState?.batteryState === Battery.BatteryState.UNPLUGGED
        ? false
        : null;

  const isLowPowerMode =
    typeof powerState?.lowPowerMode === 'boolean' ? powerState.lowPowerMode : null;

  const rawSpeed = location.coords.speed;
  const speedMps =
    typeof rawSpeed === 'number' && Number.isFinite(rawSpeed) && rawSpeed >= 0
      ? Math.round(rawSpeed * 100) / 100
      : null;

  const gpsTimestampMs = Math.round(location.timestamp || Date.now());

  return {
    latitude: Number(location.coords.latitude.toFixed(6)),
    longitude: Number(location.coords.longitude.toFixed(6)),
    accuracy_meters:
      typeof location.coords.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
        ? Math.round(location.coords.accuracy * 10) / 10
        : null,
    speed_mps: speedMps,
    gps_timestamp_ms: gpsTimestampMs,
    device_id: deviceId,
    device_model: getPhoneModelLabel(),
    battery_percent: batteryPercent,
    is_charging: isCharging,
    is_low_power_mode: isLowPowerMode,
    network_type: mapNetworkType(netState?.type, netState?.isConnected),
    is_gps_enabled: Boolean(servicesEnabled),
    is_mock_location: Boolean(location.mocked),
    app_state: mapAppState(),
    ping_source: source,
    recorded_at: new Date(gpsTimestampMs).toISOString(),
  };
}

type PostOutcome = 'OK' | 'DROP' | 'AUTH_EXPIRED' | 'RETRY';

async function postSinglePing(
  apiBaseUrl: string,
  accessToken: string,
  payload: PhoneTelemetryPayload
): Promise<PostOutcome> {
  const cleanBase = cleanUrl(apiBaseUrl);
  if (!/^https?:\/\//i.test(cleanBase)) return 'RETRY';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${cleanBase}/api/v1/campus/ping/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Device-UUID': payload.device_id,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (response.ok) return 'OK';
    if (response.status === 401) return 'AUTH_EXPIRED';
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 409
    ) {
      return 'DROP';
    }
    return 'RETRY';
  } catch {
    return 'RETRY';
  } finally {
    clearTimeout(timer);
  }
}

export async function flushQueuedTeacherPings(): Promise<void> {
  await flushUnifiedOfflineGpsPings();
}

async function handleIncomingLocation(location: Location.LocationObject): Promise<void> {
  const isOnDuty = await isTeacherOnDutyStored();
  if (!isOnDuty) {
    await stopTeacherBackgroundTracking();
    return;
  }

  // Never transmit or queue mocked / fake GPS fixes
  if (location.mocked) return;
  if (typeof location.coords.accuracy === 'number' && location.coords.accuracy > 250) {
    return;
  }

  const payload = await collectPhoneTelemetry(location, 'BACKGROUND_TASK');
  const [apiBaseUrl, authToken] = await Promise.all([
    readResolvedServerBase(),
    getValidAccessToken(false),
  ]);

  if (!apiBaseUrl || !authToken || !isJwtString(authToken)) {
    await enqueueOfflineHeartbeat({ ...payload, ping_source: 'OFFLINE_QUEUE' });
    return;
  }

  await flushUnifiedOfflineGpsPings();

  let outcome = await postSinglePing(apiBaseUrl, authToken, payload);
  if (outcome === 'AUTH_EXPIRED') {
    const refreshed = await getValidAccessToken(true);
    if (refreshed && isJwtString(refreshed)) {
      outcome = await postSinglePing(apiBaseUrl, refreshed, payload);
    }
  }

  if (outcome === 'RETRY' || outcome === 'AUTH_EXPIRED') {
    await enqueueOfflineHeartbeat({ ...payload, ping_source: 'OFFLINE_QUEUE' });
  }
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TEACHER_DUTY_LOCATION_TASK)) {
  TaskManager.defineTask(TEACHER_DUTY_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations?: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    const latestLocation = locations[locations.length - 1];
    await handleIncomingLocation(latestLocation);
  });
}

export async function isTeacherOnDutyStored(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TEACHER_ON_DUTY_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function startTeacherBackgroundTracking(): Promise<{
  started: boolean;
  reason?: string;
}> {
  if (Platform.OS === 'web') {
    return { started: false, reason: 'Background GPS tracking runs on Android and iOS phones.' };
  }

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { started: false, reason: 'Location permission is required while on duty.' };
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return {
      started: false,
      reason:
        'Please set Location permission to "Allow all the time" so campus checks keep running when your screen is locked.',
    };
  }

  await AsyncStorage.setItem(TEACHER_ON_DUTY_KEY, 'true');

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(
    TEACHER_DUTY_LOCATION_TASK
  ).catch(() => false);
  if (alreadyRunning) {
    return { started: true };
  }

  await Location.startLocationUpdatesAsync(TEACHER_DUTY_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: BACKGROUND_TIME_INTERVAL_MS,
    distanceInterval: 0,
    deferredUpdatesInterval: BACKGROUND_TIME_INTERVAL_MS,
    deferredUpdatesDistance: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'AttendSure On Duty',
      notificationBody: 'Campus location and phone battery/signal checks are active.',
      killServiceOnDestroy: false,
    },
  });

  return { started: true };
}

export async function stopTeacherBackgroundTracking(): Promise<void> {
  await AsyncStorage.setItem(TEACHER_ON_DUTY_KEY, 'false').catch(() => {});
  if (Platform.OS === 'web') return;
  const isRunning = await Location.hasStartedLocationUpdatesAsync(
    TEACHER_DUTY_LOCATION_TASK
  ).catch(() => false);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(TEACHER_DUTY_LOCATION_TASK).catch(() => {});
  }
}

export async function setTeacherOnDutyFlag(onDuty: boolean): Promise<void> {
  await AsyncStorage.setItem(TEACHER_ON_DUTY_KEY, onDuty ? 'true' : 'false').catch(() => {});
  if (onDuty) {
    await startTeacherBackgroundTracking().catch(() => {});
  } else {
    await stopTeacherBackgroundTracking().catch(() => {});
  }
}

export const startContinuousGpsHeartbeat = startTeacherBackgroundTracking;
export const stopContinuousGpsHeartbeat = stopTeacherBackgroundTracking;
export const stopPassivePresenceTracking = stopTeacherBackgroundTracking;
