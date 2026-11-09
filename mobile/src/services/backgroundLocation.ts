/**
 * AttendSure - 1-Minute Background & Sleep Mode GPS Service
 * File: mobile/src/services/backgroundLocation.ts
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import {
  getHardwareDeviceUuid,
  getRealDeviceModel,
  getRealBatteryPercentage,
  evaluateRealSignal,
} from './telemetryService';
import { enqueueOfflineHeartbeat, QueuedTelemetryPayload } from './offlineQueue';

const client = defaultApiClient || namedClient;
export const BACKGROUND_TELEMETRY_TASK = 'ATTENDSURE_BACKGROUND_TELEMETRY';

TaskManager.defineTask(BACKGROUND_TELEMETRY_TASK, async ({ data, error }: any) => {
  if (error || !data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations && locations.length > 0 ? locations[locations.length - 1] : null;

  if (!latest || !latest.coords) return;

  const lat = latest.coords.latitude;
  const lng = latest.coords.longitude;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return;
  }

  const isMock = Boolean(latest.mocked);
  const accuracy = latest.coords.accuracy ?? null;

  try {
    const [deviceId, batteryLevel] = await Promise.all([
      getHardwareDeviceUuid(),
      getRealBatteryPercentage(),
    ]);

    const deviceModel = getRealDeviceModel();
    const signal = evaluateRealSignal(accuracy);

    await client.post(
      'geofence/checkin/',
      {
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
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
  } catch (err: any) {
    if (err?.response?.status === 403) return;

    try {
      const [deviceId, batteryLevel] = await Promise.all([
        getHardwareDeviceUuid(),
        getRealBatteryPercentage(),
      ]);
      const deviceModel = getRealDeviceModel();
      const signal = evaluateRealSignal(accuracy);

      const offlinePayload: QueuedTelemetryPayload = {
        client_device_id: deviceId ?? '',
        latitude: lat,
        longitude: lng,
        accuracy: accuracy,
        battery_level: batteryLevel,
        is_mock_location: isMock,
        mac_address: deviceId,
        signal_strength: signal.label,
        signal_percentage: signal.percentage,
        device_model: deviceModel,
      };
      await enqueueOfflineHeartbeat(offlinePayload);
    } catch {}
  }
});

export async function startPassivePresenceTracking(): Promise<boolean> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') return false;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK, {
        accuracy: Location.Accuracy.High, // High accuracy satellite GPS
        timeInterval: 60000,              // 1 minute interval
        distanceInterval: 5,               // 5 meters moved
        deferredUpdatesInterval: 60000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
          notificationTitle: 'AttendSure Attendance Active',
          notificationBody: 'Location check-in active every minute.',
          notificationColor: '#004b87',
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