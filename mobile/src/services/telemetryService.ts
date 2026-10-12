import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as Crypto from 'expo-crypto';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { enqueueOfflineTelemetry, flushOfflineTelemetryQueue } from './offlineQueue';

export async function sendLiveHeartbeat(deviceId: string) {
  // Check location permission
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new Error('Location permission is required for campus telemetry.');
  }

  // 1. Read real device sensors
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const batteryFraction = await Battery.getBatteryLevelAsync();
  const batteryLevel = batteryFraction >= 0 ? Math.round(batteryFraction * 100) : 100;
  const isMock = Boolean(location.mocked);

  const payload = {
    client_device_id: deviceId,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    battery_level: batteryLevel,
    is_mock_location: isMock,
  };

  const requestId = Crypto.randomUUID();

  try {
    // Attempt real-time push to the ingestion endpoint
    const response = await apiClient.post(ENDPOINTS.TELEMETRY_HEARTBEAT, {
      ...payload,
      request_id: requestId,
    });

    // Check for and flush any previously saved offline items
    flushOfflineTelemetryQueue().catch(() => {});

    return {
      status: response.data.status,
      isQueuedOffline: false,
      requestId,
    };
  } catch {
    // Save to phone storage if network is offline or server is unreachable
    await enqueueOfflineTelemetry(payload);

    return {
      status: 'STORED_OFFLINE',
      isQueuedOffline: true,
      requestId,
    };
  }
}