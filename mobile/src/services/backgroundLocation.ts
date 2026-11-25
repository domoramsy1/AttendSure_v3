/**
 * AttendSure - Continuous Background & Sleep-Safe Campus GPS Heartbeat Service
 * File: mobile/src/services/backgroundLocation.ts
 *
 * Registered at top-level app entry (mobile/index.ts) so Android Foreground Service
 * and iOS Background Location continue checking GPS even when the phone is locked,
 * stationary, or sleeping. Backend duty-aware rules log continuous presence while
 * raising loafing alerts only during active duty hours without an exit pass.
 */

import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import defaultApiClient, { apiClient as namedClient, AUTH_TOKEN_KEY } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { PALETTES } from '../constants/theme';
import { getHardwareDeviceUuid } from './deviceService';
import { getRealDeviceModel } from './telemetryService';
import {
  enqueueOfflineHeartbeat,
  syncOfflineQueue,
  QueuedCampusPingPayload,
} from './offlineQueue';

const client = defaultApiClient || namedClient;
export const BACKGROUND_TELEMETRY_TASK = 'ATTENDSURE_BACKGROUND_GEOFENCE';
export const TEACHER_ON_DUTY_KEY = 'attendsure_teacher_on_duty';
export const CONTINUOUS_GPS_ACTIVE_KEY = 'attendsure_continuous_gps_active';
export const LAST_HEARTBEAT_TS_KEY = 'attendsure_last_heartbeat_ts';

interface BackgroundLocationTaskData {
  locations?: Location.LocationObject[];
}

async function hasStoredAuthSession(): Promise<boolean> {
  try {
    const [primary, access, legacy] = await Promise.all([
      AsyncStorage.getItem(AUTH_TOKEN_KEY),
      AsyncStorage.getItem('attendsure_access'),
      AsyncStorage.getItem('attendsure_token'),
    ]);
    return Boolean(
      (primary && primary.trim()) || (access && access.trim()) || (legacy && legacy.trim())
    );
  } catch {
    return false;
  }
}

export async function isTeacherOnDutyStored(): Promise<boolean> {
  try {
    const flag = await AsyncStorage.getItem(TEACHER_ON_DUTY_KEY);
    return flag === 'true';
  } catch {
    return false;
  }
}

export async function setTeacherOnDutyFlag(onDuty: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(TEACHER_ON_DUTY_KEY, onDuty ? 'true' : 'false');
    if (onDuty) {
      const signedIn = await hasStoredAuthSession();
      if (signedIn) {
        await startContinuousGpsHeartbeat();
      }
    } else {
      await stopContinuousGpsHeartbeat();
    }
  } catch {}
}

try {
  TaskManager.defineTask<BackgroundLocationTaskData>(
    BACKGROUND_TELEMETRY_TASK,
    async ({ data, error }) => {
      if (error || !data) return;

      // Transmit background GPS pings ONLY while the teacher is signed in and timed in on duty
      const [activeFlag, onDutyFlag, signedIn] = await Promise.all([
        AsyncStorage.getItem(CONTINUOUS_GPS_ACTIVE_KEY).catch(() => 'false'),
        AsyncStorage.getItem(TEACHER_ON_DUTY_KEY).catch(() => 'false'),
        hasStoredAuthSession(),
      ]);
      if (activeFlag === 'false' || onDutyFlag !== 'true' || !signedIn) {
        await stopContinuousGpsHeartbeat();
        return;
      }

      const locations = Array.isArray(data.locations) ? data.locations : [];
      const latest = locations.length > 0 ? locations[locations.length - 1] : null;
      if (!latest || !latest.coords) return;

      // Strictly block fake / mocked GPS before touching the API
      if (latest.mocked) return;

      const lat = latest.coords.latitude;
      const lng = latest.coords.longitude;
      const accuracy = latest.coords.accuracy ?? 15;

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180 ||
        accuracy > 250
      ) {
        return;
      }

      const deviceId = await getHardwareDeviceUuid().catch(() => '');
      const deviceModel = getRealDeviceModel();

      const payload = {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        accuracy_meters: Number(accuracy.toFixed(1)),
        device_id: deviceId,
        is_mock_location: false,
      };

      try {
        await client.post(ENDPOINTS.CAMPUS_PING, payload, { timeout: 10000 });
        await AsyncStorage.setItem(LAST_HEARTBEAT_TS_KEY, String(Date.now())).catch(() => {});
        // Opportunistically flush any pings queued while the phone had no signal
        await syncOfflineQueue().catch(() => {});
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 400 || status === 401 || status === 403) return;

        const offlinePayload: QueuedCampusPingPayload = {
          device_id: deviceId,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy_meters: payload.accuracy_meters,
          is_mock_location: false,
          device_model: deviceModel,
        };
        await enqueueOfflineHeartbeat(offlinePayload).catch(() => {});
      }
    }
  );
} catch {
  // Background task manager may not be available in web runtimes
}

/**
 * Starts continuous background GPS tracking with distanceInterval: 0 so stationary
 * teachers and sleeping phones continue transmitting uninterrupted campus heartbeats.
 */
export async function startContinuousGpsHeartbeat(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [onDuty, signedIn] = await Promise.all([
      isTeacherOnDutyStored(),
      hasStoredAuthSession(),
    ]);
    if (!onDuty || !signedIn) {
      await stopContinuousGpsHeartbeat();
      return false;
    }

    await AsyncStorage.setItem(CONTINUOUS_GPS_ACTIVE_KEY, 'true');

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync().catch(() => ({
      status: 'denied',
    }));
    if (bgStatus !== 'granted') return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 45000,
        distanceInterval: 0,
        deferredUpdatesInterval: 45000,
        deferredUpdatesDistance: 0,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Other,
        foregroundService: {
          notificationTitle: 'AttendSure Campus GPS Active',
          notificationBody: 'Checking campus GPS location while you are timed in on duty.',
          notificationColor: PALETTES.light.primary,
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function stopContinuousGpsHeartbeat(): Promise<void> {
  try {
    await AsyncStorage.setItem(CONTINUOUS_GPS_ACTIVE_KEY, 'false');
    if (Platform.OS === 'web') return;
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK);
    }
  } catch {}
}

// Backwards-compatible aliases
export const startPassivePresenceTracking = startContinuousGpsHeartbeat;
export const stopPassivePresenceTracking = stopContinuousGpsHeartbeat;
