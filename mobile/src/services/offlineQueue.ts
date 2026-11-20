/**
 * AttendSure - Offline Storage & Sync Queue Engine
 * File: mobile/src/services/offlineQueue.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

const OFFLINE_QUEUE_KEY = 'attendsure_offline_queue';
const MAX_RETRY_ATTEMPTS = 8;
const MAX_HEARTBEAT_AGE_MS = 24 * 60 * 60 * 1000;

let isSyncing = false;

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
  payload: unknown;
  timestamp: number;
  retryCount?: number;
}

/**
 * Cybersecurity: Only allow relative AttendSure API paths inside the offline queue.
 * Rejects absolute http(s):// URLs, dangerous schemes, protocol-relative URLs, and path traversal.
 */
function isAllowedRelativeEndpoint(endpoint?: string | null): endpoint is string {
  if (!endpoint || typeof endpoint !== 'string') return false;
  const trimmed = endpoint.trim();
  if (!trimmed) return false;
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.includes('..') ||
    /[\u0000-\u001F\u007F]/.test(trimmed)
  ) {
    return false;
  }
  return true;
}

function isHeartbeatEndpoint(endpoint: string): boolean {
  const lower = endpoint.toLowerCase();
  return (
    lower.includes('check-in') ||
    lower.includes('checkin') ||
    lower.includes('heartbeat')
  );
}

async function readQueueSafe(): Promise<OfflineQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Returns the total number of records waiting to be uploaded.
 */
export async function getUnsyncedCount(): Promise<number> {
  const items = await readQueueSafe();
  return items.length;
}

/**
 * Queues an offline campus location check-in with automatic deduplication.
 * Replaces older check-ins so records do not stack up during long offline periods.
 */
export async function enqueueOfflineHeartbeat(payload: QueuedTelemetryPayload): Promise<void> {
  try {
    const current = await readQueueSafe();

    // Keep only the newest campus location ping
    const filtered = current.filter((item) => !isHeartbeatEndpoint(item.endpoint || ''));

    filtered.push({
      id: `hb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint: 'geofence/check-in/',
      method: 'POST',
      payload: {
        ...payload,
        device_id: payload.client_device_id ?? null,
        accuracy_meters: payload.accuracy ?? null,
      },
      timestamp: Date.now(),
      retryCount: 0,
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch {
    // Storage failures are ignored safely without leaking raw error objects
  }
}

/**
 * Generic queue action for class attendance and campus check-in records.
 */
export async function queueOfflineAction(
  endpoint: string,
  payload: unknown,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST'
): Promise<void> {
  if (!isAllowedRelativeEndpoint(endpoint)) {
    return;
  }

  const safeEndpoint = endpoint.trim();

  try {
    let queue = await readQueueSafe();

    if (isHeartbeatEndpoint(safeEndpoint)) {
      queue = queue.filter((item) => !isHeartbeatEndpoint(item.endpoint || ''));
    }

    queue.push({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint: safeEndpoint,
      method,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Ignore storage write errors safely
  }
}

/**
 * Uploads all queued offline records to the school server.
 * Protected by a concurrency lock to prevent duplicate submissions.
 */
export async function syncOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (isSyncing) {
    return { synced: 0, remaining: await getUnsyncedCount() };
  }

  isSyncing = true;

  try {
    const queue = await readQueueSafe();
    if (queue.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    const snapshotIds = new Set(queue.map((item) => item.id));
    const remaining: OfflineQueueItem[] = [];
    let synced = 0;

    for (const item of queue) {
      // Discard unsafe or external endpoints
      if (!isAllowedRelativeEndpoint(item?.endpoint)) {
        continue;
      }

      // Discard stale location pings older than 24 hours
      if (
        isHeartbeatEndpoint(item.endpoint) &&
        Date.now() - item.timestamp > MAX_HEARTBEAT_AGE_MS
      ) {
        continue;
      }

      try {
        if (item.method === 'PUT') {
          await apiClient.put(item.endpoint, item.payload, { timeout: 7000 });
        } else if (item.method === 'PATCH') {
          await apiClient.patch(item.endpoint, item.payload, { timeout: 7000 });
        } else {
          await apiClient.post(item.endpoint, item.payload, { timeout: 7000 });
        }
        synced += 1;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;

        // Stop retrying immediately when session expires (401)
        if (status === 401) {
          break;
        }

        // Discard permanently rejected records (bad payload, forbidden, missing, or conflict)
        if (status === 400 || status === 403 || status === 404 || status === 409) {
          continue;
        }

        // Retry temporary network errors up to the retry limit
        const nextRetry = (item.retryCount || 0) + 1;
        if (nextRetry < MAX_RETRY_ATTEMPTS) {
          remaining.push({ ...item, retryCount: nextRetry });
        }
      }
    }

    // Preserve any new items queued while this sync pass was running
    const latestQueue = await readQueueSafe();
    const newlyAdded = latestQueue.filter((item) => !snapshotIds.has(item.id));
    const nextQueue = [...remaining, ...newlyAdded];

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQueue));
    return { synced, remaining: nextQueue.length };
  } catch {
    return { synced: 0, remaining: await getUnsyncedCount() };
  } finally {
    isSyncing = false;
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
