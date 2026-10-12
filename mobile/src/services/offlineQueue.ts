import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

const STORAGE_QUEUE_KEY = '@attendsure_offline_telemetry_v1';

export interface QueuedTelemetryItem {
  requestId: string;
  payload: {
    client_device_id: string;
    latitude: number;
    longitude: number;
    battery_level: number;
    is_mock_location: boolean;
  };
  queuedAt: number;
}

/**
 * Saves a telemetry record to on-device storage during network outages.
 */
export async function enqueueOfflineTelemetry(payload: QueuedTelemetryItem['payload']): Promise<string> {
  const requestId = Crypto.randomUUID();
  const queueItem: QueuedTelemetryItem = {
    requestId,
    payload,
    queuedAt: Date.now(),
  };

  const rawQueue = await AsyncStorage.getItem(STORAGE_QUEUE_KEY);
  const queue: QueuedTelemetryItem[] = rawQueue ? JSON.parse(rawQueue) : [];
  queue.push(queueItem);

  await AsyncStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  return requestId;
}

/**
 * Returns the number of unsynced items stored locally.
 */
export async function getUnsyncedCount(): Promise<number> {
  const rawQueue = await AsyncStorage.getItem(STORAGE_QUEUE_KEY);
  if (!rawQueue) return 0;
  const queue: QueuedTelemetryItem[] = JSON.parse(rawQueue);
  return queue.length;
}

/**
 * Dispatches all pending telemetry records to the server in chronological order.
 */
export async function flushOfflineTelemetryQueue(): Promise<{ sent: number; remaining: number }> {
  const rawQueue = await AsyncStorage.getItem(STORAGE_QUEUE_KEY);
  if (!rawQueue) return { sent: 0, remaining: 0 };

  const queue: QueuedTelemetryItem[] = JSON.parse(rawQueue);
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const remainingItems: QueuedTelemetryItem[] = [];
  let sentCount = 0;

  for (const item of queue) {
    try {
      await apiClient.post(ENDPOINTS.TELEMETRY_HEARTBEAT, {
        ...item.payload,
        request_id: item.requestId,
      });
      sentCount++;
    } catch {
      // Retain the item if network drops mid-sync
      remainingItems.push(item);
    }
  }

  await AsyncStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(remainingItems));
  return { sent: sentCount, remaining: remainingItems.length };
}