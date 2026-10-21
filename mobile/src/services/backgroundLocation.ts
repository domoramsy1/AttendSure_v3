// mobile/src/services/backgroundLocation.ts

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import { getOrCreateDeviceUuid } from './deviceService';

const client = defaultApiClient || namedClient;

export const BACKGROUND_TELEMETRY_TASK = 'ATTENDSURE_BACKGROUND_TELEMETRY';

// Background Task Executor (Runs every 3 minutes or on 15m movement)
TaskManager.defineTask(BACKGROUND_TELEMETRY_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[BackgroundTelemetry] Service error:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations[locations.length - 1];

    if (!latest) return;

    try {
      // 1. Fetch hardware UUID
      const deviceId = await getOrCreateDeviceUuid();

      // 2. Fetch battery telemetry
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const isCharging =
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL;

      // 3. Post telemetry payload with both parameter keys for backend compatibility
      await client.post('/api/telemetry/heartbeat/', {
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracy_meters: latest.coords.accuracy,
        is_mock_location: Boolean(latest.mocked),
        battery_level: Math.round(batteryLevel * 100),
        is_charging: isCharging,
        device_id: deviceId,
        client_device_id: deviceId,
      });
    } catch (err: any) {
      console.warn('[BackgroundTelemetry] Telemetry sync notice:', err?.message || err);
    }
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
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 180000,
        distanceInterval: 15,
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: 'AttendSure Active',
          notificationBody: 'Campus presence verification is running.',
        },
      });
    }
    return true;
  } catch (err: any) {
    return false;
  }
}

export async function stopPassivePresenceTracking(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK);
    }
  } catch (err: any) {
    console.warn('[BackgroundTelemetry] Stop error:', err?.message);
  }
}