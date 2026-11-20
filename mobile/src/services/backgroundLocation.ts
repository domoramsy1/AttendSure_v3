/**
 * AttendSure - Background Campus GPS Presence Service
 * File: mobile/src/services/backgroundLocation.ts
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import { PALETTES } from '../constants/theme';
import { getHardwareDeviceUuid } from './deviceService';
import {
  getRealDeviceModel,
  getRealBatteryPercentage,
  evaluateRealSignal,
} from './telemetryService';
import { enqueueOfflineHeartbeat, QueuedTelemetryPayload } from './offlineQueue';

const client = defaultApiClient || namedClient;
export const BACKGROUND_TELEMETRY_TASK = 'ATTENDSURE_BACKGROUND_TELEMETRY';

interface BackgroundLocationTaskData {
  locations?: Location.LocationObject[];
}

TaskManager.defineTask<BackgroundLocationTaskData>(
  BACKGROUND_TELEMETRY_TASK,
  async ({ data, error }) => {
    if (error || !data) return;

    const locations = Array.isArray(data.locations) ? data.locations : [];
    const latest = locations.length > 0 ? locations[locations.length - 1] : null;

    if (!latest || !latest.coords) return;

    const lat = latest.coords.latitude;
    const lng = latest.coords.longitude;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    const isMock = Boolean(latest.mocked);
    const accuracy = latest.coords.accuracy ?? null;

    const [deviceRes, batteryRes] = await Promise.allSettled([
      getHardwareDeviceUuid(),
      getRealBatteryPercentage(),
    ]);

    const deviceId = deviceRes.status === 'fulfilled' ? deviceRes.value : '';
    const batteryLevel = batteryRes.status === 'fulfilled' ? batteryRes.value : null;
    const deviceModel = getRealDeviceModel();
    const signal = evaluateRealSignal(accuracy);

    try {
      await client.post(
        'geofence/check-in/',
        {
          latitude: lat,
          longitude: lng,
          accuracy,
          accuracy_meters: accuracy,
          is_mock_location: isMock,
          battery_level: batteryLevel,
          device_id: deviceId,
          client_device_id: deviceId,
          mac_address: deviceId,
          device_model: deviceModel,
          signal_strength: signal.label,
          signal_percentage: signal.percentage,
        },
        { timeout: 8000 }
      );
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // Never queue unauthorized (401) or forbidden (403) responses
      if (status === 401 || status === 403) return;

      try {
        const offlinePayload: QueuedTelemetryPayload = {
          client_device_id: deviceId,
          latitude: lat,
          longitude: lng,
          accuracy,
          battery_level: batteryLevel,
          is_mock_location: isMock,
          mac_address: deviceId,
          signal_strength: signal.label,
          signal_percentage: signal.percentage,
          device_model: deviceModel,
        };
        await enqueueOfflineHeartbeat(offlinePayload);
      } catch {
        // Ignore background storage failures quietly
      }
    }
  }
);

export async function startPassivePresenceTracking(): Promise<boolean> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 60000,
        distanceInterval: 5,
        deferredUpdatesInterval: 60000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
          notificationTitle: 'AttendSure Attendance Active',
          notificationBody: 'Campus location check-in is active.',
          notificationColor: PALETTES.light.primary,
        },
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function stopPassivePresenceTracking(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK);
    }
  } catch {}
}
