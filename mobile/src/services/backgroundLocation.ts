/**
 * AttendSure - Sleep-Mode & Background GPS Telemetry Service
 * File: mobile/src/services/backgroundLocation.ts
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import defaultApiClient, { apiClient as namedClient } from '../api/client';
import { getOrCreateDeviceUuid } from './deviceService';
import { getRealDeviceModel } from './telemetryService';
import { enqueueOfflineHeartbeat, QueuedTelemetryPayload } from './offlineQueue';

const client = defaultApiClient || namedClient;

export const BACKGROUND_TELEMETRY_TASK = 'ATTENDSURE_BACKGROUND_TELEMETRY';

// Background Task Executor (Runs continuously even when phone screen is locked or asleep)
TaskManager.defineTask(BACKGROUND_TELEMETRY_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[BackgroundTelemetry] Service notice:', error.message);
    return;
  }

  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations && locations.length > 0 ? locations[locations.length - 1] : null;

  if (!latest || !latest.coords) return;

  const lat = latest.coords.latitude;
  const lng = latest.coords.longitude;

  // Validate coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const isMock = Boolean(latest.mocked);
  const accuracy = latest.coords.accuracy ?? null;

  try {
    const deviceId = await getOrCreateDeviceUuid();
    const deviceModel = getRealDeviceModel();

    let batteryLevel = 100;
    try {
      const rawBattery = await Battery.getBatteryLevelAsync();
      if (typeof rawBattery === 'number' && rawBattery >= 0) {
        batteryLevel = Math.round(rawBattery * 100);
      }
    } catch {}

    const payload = {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      accuracy_meters: accuracy,
      is_mock_location: isMock,
      battery_level: batteryLevel,
      device_id: deviceId,
      client_device_id: deviceId,
      device_model: deviceModel,
    };

    // Send ping to backend
    await client.post('geofence/checkin/', payload);
  } catch (err: any) {
    const httpStatus = err?.response?.status;

    // Block fake GPS or locked phone
    if (httpStatus === 403) {
      console.warn('[BackgroundTelemetry] Blocked by security shield:', err?.response?.data?.error);
      return;
    }

    // Network offline: store GPS breadcrumb locally so it uploads when connection returns
    try {
      const deviceId = await getOrCreateDeviceUuid();
      const offlinePayload: QueuedTelemetryPayload = {
        client_device_id: deviceId,
        latitude: lat,
        longitude: lng,
        battery_level: 100,
        is_mock_location: isMock,
      };
      await enqueueOfflineHeartbeat(offlinePayload);
    } catch {}
  }
});

/**
 * Starts continuous background and sleep-mode presence tracking.
 * Pings every 2.5 minutes (150,000 ms) or every 10 meters moved.
 */
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
        timeInterval: 150000, // 2.5 minutes interval (saves battery while keeping active status)
        distanceInterval: 10,  // Or every 10 meters moved
        deferredUpdatesInterval: 150000,
        pausesUpdatesAutomatically: false, // Prevents OS from pausing GPS during sleep mode
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Fitness,
        foregroundService: {
          notificationTitle: 'AttendSure Presence Active',
          notificationBody: 'Campus boundary tracking is active in the background.',
          notificationColor: '#004b87',
        },
      });
    }
    return true;
  } catch (err: any) {
    console.warn('[BackgroundTelemetry] Initialization notice:', err?.message || err);
    return false;
  }
}

/**
 * Stops background presence tracking when faculty signs out.
 */
export async function stopPassivePresenceTracking(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TELEMETRY_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TELEMETRY_TASK);
    }
  } catch (err: any) {
    console.warn('[BackgroundTelemetry] Stop notice:', err?.message || err);
  }
}