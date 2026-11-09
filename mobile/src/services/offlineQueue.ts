/**
 * AttendSure - Offline Storage & Sync Queue Engine
 * File: mobile/src/services/offlineQueue.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

const OFFLINE_QUEUE_KEY = 'attendsure_offline_queue';

export interface QueuedTelemetryPayload {
  client_device_id?: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  battery_level?: number | null;
  is_mock_location?: boolean;
  ip_address?: string | null;
  mac_address?: string | null;
  signal_strength?: string | null;
  signal_percentage?: number | null;
  device_model?: string | null;
}

export interface OfflineQueueItem {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  payload: any;
  timestamp: number;
  retryCount?: number;
}

/**
 * Returns the total number of records waiting to be uploaded.
 */
export async function getUnsyncedCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const items: OfflineQueueItem[] = JSON.parse(raw);
    return Array.isArray(items) ? items.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Queues an offline telemetry heartbeat with automatic deduplication.
 * Replaces older heartbeats so breadcrumbs do not stack up during long offline periods.
 */
export async function enqueueOfflineHeartbeat(payload: QueuedTelemetryPayload): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    let queue: OfflineQueueItem[] = raw ? JSON.parse(raw) : [];

    // Remove any previous pending heartbeat to keep only the newest location
    queue = queue.filter(
      (item) => !item.endpoint.includes('checkin') && !item.endpoint.includes('heartbeat')
    );

    queue.push({
      id: `hb_${Date.now()}`,
      endpoint: 'geofence/checkin/',
      method: 'POST',
      payload: {
        ...payload,
        device_id: payload.client_device_id ?? null,
        accuracy_meters: payload.accuracy ?? null,
      },
      timestamp: Date.now(),
      retryCount: 0,
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[OfflineQueue] Save notice:', err);
  }
}

/**
 * Generic queue action for class roll calls and gate logs.
 */
export async function queueOfflineAction(
  endpoint: string,
  payload: any,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST'
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    let queue: OfflineQueueItem[] = raw ? JSON.parse(raw) : [];

    if (endpoint.includes('checkin') || endpoint.includes('heartbeat')) {
      queue = queue.filter(
        (item) => !item.endpoint.includes('checkin') && !item.endpoint.includes('heartbeat')
      );
    }

    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint,
      method,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('[OfflineQueue] Save notice:', err);
  }
}

/**
 * Uploads all queued offline records to the school server.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return { synced: 0, remaining: 0 };

    const queue: OfflineQueueItem[] = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    const remaining: OfflineQueueItem[] = [];
    let synced = 0;

    for (const item of queue) {
      // Discard location pings older than 24 hours
      if (
        (item.endpoint.includes('checkin') || item.endpoint.includes('heartbeat')) &&
        Date.now() - item.timestamp > 86400000
      ) {
        continue;
      }

      try {
        if (item.method === 'PUT') {
          await apiClient.put(item.endpoint, item.payload, { timeout: 7000 });
        } else {
          await apiClient.post(item.endpoint, item.payload, { timeout: 7000 });
        }
        synced += 1;
      } catch (err: any) {
        const status = err?.response?.status;
        // If server rejected the record (bad payload or 403 lock), remove it from queue
        if (status === 400 || status === 403 || status === 409) {
          continue;
        }

        // Retry temporary network errors up to 8 times
        item.retryCount = (item.retryCount || 0) + 1;
        if ((item.retryCount || 0) < 8) {
          remaining.push(item);
        }
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return { synced, remaining: remaining.length };
  } catch (err) {
    console.warn('[OfflineQueue] Sync notice:', err);
    return { synced: 0, remaining: await getUnsyncedCount() };
  }
}

/**
 * Clears the offline queue.
 */
export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {}
}