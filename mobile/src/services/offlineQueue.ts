// D:\AttendSure_V3\mobile\src\services\offlineQueue.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

const OFFLINE_QUEUE_KEY = 'attendsure_offline_sync_queue_v3';

export interface QueuedScanPayload {
  schedule_id: number;
  scans: Array<{
    qr_token: string;
    status: string;
  }>;
}

export interface QueuedTelemetryPayload {
  client_device_id: string;
  latitude: number;
  longitude: number;
  battery_level: number;
  is_mock_location: boolean;
}

export interface OfflineQueueItem {
  id: string;
  type: 'CLASSROOM_SCAN' | 'TELEMETRY_HEARTBEAT';
  createdAt: string;
  scanPayload?: QueuedScanPayload;
  telemetryPayload?: QueuedTelemetryPayload;
}

export const getOfflineQueue = async (): Promise<OfflineQueueItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOfflineQueue = async (queue: OfflineQueueItem[]): Promise<void> => {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
};

export const getUnsyncedCount = async (): Promise<number> => {
  const queue = await getOfflineQueue();
  return queue.length;
};

export const enqueueOfflineScan = async (
  scheduleId: number,
  qrToken: string,
  status: string = 'PRESENT'
): Promise<OfflineQueueItem> => {
  const queue = await getOfflineQueue();
  const newItem: OfflineQueueItem = {
    id: `SCAN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'CLASSROOM_SCAN',
    createdAt: new Date().toISOString(),
    scanPayload: {
      schedule_id: scheduleId,
      scans: [
        {
          qr_token: qrToken.trim(),
          status: status.toUpperCase(),
        },
      ],
    },
  };

  queue.push(newItem);
  await saveOfflineQueue(queue);
  return newItem;
};

export const enqueueOfflineHeartbeat = async (
  payload: QueuedTelemetryPayload
): Promise<OfflineQueueItem> => {
  const queue = await getOfflineQueue();
  const newItem: OfflineQueueItem = {
    id: `GPS-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    type: 'TELEMETRY_HEARTBEAT',
    createdAt: new Date().toISOString(),
    telemetryPayload: payload,
  };

  queue.push(newItem);
  await saveOfflineQueue(queue);
  return newItem;
};

export const syncOfflineQueue = async (): Promise<{
  syncedCount: number;
  failedCount: number;
  lastError: string | null;
}> => {
  const queue = await getOfflineQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, failedCount: 0, lastError: null };
  }

  const remainingItems: OfflineQueueItem[] = [];
  let syncedCount = 0;
  let lastError: string | null = null;

  for (const item of queue) {
    try {
      if (item.type === 'CLASSROOM_SCAN' && item.scanPayload) {
        await apiClient.post('classroom/batch-scan/', item.scanPayload);
        syncedCount += 1;
      } else if (item.type === 'TELEMETRY_HEARTBEAT' && item.telemetryPayload) {
        await apiClient.post('telemetry/heartbeat/', item.telemetryPayload);
        syncedCount += 1;
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMsg =
        err?.response?.data?.error ||
        err?.response?.data?.security_alert ||
        err?.response?.data?.detail ||
        err?.message ||
        'Sync error';
      lastError = serverMsg;

      if (!status || status >= 500) {
        remainingItems.push(item);
      }
    }
  }

  await saveOfflineQueue(remainingItems);
  return { syncedCount, failedCount: remainingItems.length, lastError };
};