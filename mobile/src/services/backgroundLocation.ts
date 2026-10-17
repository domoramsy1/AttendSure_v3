/**
 * AttendSure V3 - Automated Passive Presence & Telemetry Service
 * File: mobile/src/services/backgroundLocation.ts
 *
 * Cybersecurity & Anti-Cheating:
 * 1. Zero Manual Taps: Starts automatically on login and tracks presence quietly.
 * 2. Mock GPS Rejection: Flags spoofed coordinates before transmission.
 * 3. Battery & Abandonment Monitoring: Detects stationary charging phones left in empty rooms.
 * 4. Hardware Lock Binding: Uses decrypted UUID from deviceService without require cycles.
 * 5. Native Android Foreground Service: Stays active in the background when locked.
 */

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
      // 1. Fetch encrypted hardware UUID from decoupled deviceService
      const deviceId = await getOrCreateDeviceUuid();

      // 2. Fetch battery telemetry
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const isCharging =
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL;

      // 3. Post telemetry payload to backend
      const targetUrl = client?.defaults?.baseURL?.endsWith('/api')
        ? '/telemetry/heartbeat/'
        : '/api/telemetry/heartbeat/';

      await client.post(targetUrl, {
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
        accuracy_meters: latest.coords.accuracy,
        is_mock_location: latest.mocked || false,
        battery_level: Math.round(batteryLevel * 100),
        is_charging: isCharging,
        device_id: deviceId,
      });

      console.log(
        `[BackgroundTelemetry] Heartbeat synced: Lat ${latest.coords.latitude.toFixed(5)}, Battery ${Math.round(batteryLevel * 100)}%`
      );
    } catch (err: any) {
      console.warn('[BackgroundTelemetry] Telemetry sync notice:', err?.message || err);
    }
  }
});

/**
 * Starts automatic passive GPS tracking in the background.
 */
export async function startPassivePresenceTracking(): Promise<boolean> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.warn('[BackgroundTelemetry] Foreground location permission denied.');
      return false;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('[BackgroundTelemetry] Background location permission denied.');
      return false;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 180000, // Sync every 3 minutes
        distanceInterval: 15, // Or if device moves by 15 meters
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: 'AttendSure Presence Active',
          notificationBody: 'Passive campus presence and classroom verification active.',
        },
      });
      console.log('[BackgroundTelemetry] Background location service started successfully.');
    }
    return true;
  } catch (err: any) {
    console.warn('[BackgroundTelemetry] Failed to start background tracking:', err?.message);
    return false;
  }
}

/**
 * Stops background location updates to preserve battery when leaving campus.
 */
export async function stopPassivePresenceTracking(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK);
      console.log('[BackgroundTelemetry] Background tracking stopped.');
    }
  } catch (err: any) {
    console.warn('[BackgroundTelemetry] Stop error:', err?.message);
  }
}