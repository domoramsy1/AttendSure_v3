/**
 * AttendSure - Offline Storage & Sync Queue Engine (Student QR + Campus Pings)
 * File: mobile/src/services/offlineQueue.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

const OFFLINE_QUEUE_KEY = 'attendsure_offline_queue';
const OFFLINE_QR_SCANS_KEY = 'attendsure_offline_qr_scans';
const MAX_RETRY_ATTEMPTS = 8;
const MAX_QR_PERMANENT_RETRIES = 3;
const MAX_HEARTBEAT_AGE_MS = 24 * 60 * 60 * 1000;

let isSyncing = false;

export interface QueuedCampusPingPayload {
  device_id?: string | null;
  client_device_id?: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  accuracy?: number | null;
  is_mock_location?: boolean;
  device_model?: string | null;
}

export interface QueuedQrScan {
  client_scan_uuid: string;
  qr_token: string;
  period_id: number;
  scanned_at: string;
  retryCount?: number;
}

export interface OfflineQueueItem {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH';
  payload: unknown;
  timestamp: number;
  retryCount?: number;
}

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

function isPingEndpoint(endpoint: string): boolean {
  const lower = endpoint.toLowerCase();
  return lower.includes('campus/ping') || lower.includes('campus/check-in');
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

async function readQrScansSafe(): Promise<QueuedQrScan[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QR_SCANS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedQrScan[]) : [];
  } catch {
    return [];
  }
}

export async function getQueuedQrScans(): Promise<QueuedQrScan[]> {
  return readQrScansSafe();
}

export async function getUnsyncedCount(): Promise<number> {
  const [items, qrScans] = await Promise.all([readQueueSafe(), readQrScansSafe()]);
  return items.length + qrScans.length;
}

export async function enqueueOfflineQrScan(scan: QueuedQrScan): Promise<number> {
  try {
    const current = await readQrScansSafe();
    if (!current.some((s) => s.client_scan_uuid === scan.client_scan_uuid)) {
      current.push({ ...scan, retryCount: scan.retryCount ?? 0 });
      await AsyncStorage.setItem(OFFLINE_QR_SCANS_KEY, JSON.stringify(current));
    }
    return current.length;
  } catch {
    return 0;
  }
}

export async function syncOfflineQrScans(): Promise<{ synced: number; remaining: number }> {
  const scans = await readQrScansSafe();
  if (scans.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  const apiScans = scans.map(({ client_scan_uuid, qr_token, period_id, scanned_at }) => ({
    client_scan_uuid,
    qr_token,
    period_id,
    scanned_at,
  }));

  try {
    await apiClient.post(
      ENDPOINTS.ATTENDANCE_OFFLINE_SYNC,
      { scans: apiScans },
      { timeout: 10000 }
    );
    const snapshotIds = new Set(scans.map((s) => s.client_scan_uuid));
    const latest = await readQrScansSafe();
    const stillPending = latest.filter((s) => !snapshotIds.has(s.client_scan_uuid));
    await AsyncStorage.setItem(OFFLINE_QR_SCANS_KEY, JSON.stringify(stillPending));
    return { synced: scans.length, remaining: stillPending.length };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;

    // Leave 401 untouched so token refresh or sign-in can retry cleanly
    if (status === 401) {
      return { synced: 0, remaining: scans.length };
    }

    // Track retries on permanent 400/403 responses and drop unrecoverable items after max tries
    if (status === 400 || status === 403) {
      const snapshotIds = new Set(scans.map((s) => s.client_scan_uuid));
      const latest = await readQrScansSafe();
      const nextQueue: QueuedQrScan[] = [];
      let droppedCount = 0;

      for (const item of latest) {
        if (!snapshotIds.has(item.client_scan_uuid)) {
          nextQueue.push(item);
          continue;
        }
        const nextRetry = (item.retryCount || 0) + 1;
        if (nextRetry < MAX_QR_PERMANENT_RETRIES) {
          nextQueue.push({ ...item, retryCount: nextRetry });
        } else {
          droppedCount += 1;
        }
      }

      if (droppedCount > 0) {
        console.warn(
          `[AttendSure] Removed ${droppedCount} unrecoverable offline QR scan(s) after HTTP ${status} (${MAX_QR_PERMANENT_RETRIES} tries).`
        );
      }

      await AsyncStorage.setItem(OFFLINE_QR_SCANS_KEY, JSON.stringify(nextQueue));
      return { synced: 0, remaining: nextQueue.length };
    }

    // Keep transient network or 5xx errors queued for automatic retry
    return { synced: 0, remaining: scans.length };
  }
}

export async function enqueueOfflineHeartbeat(payload: QueuedCampusPingPayload): Promise<void> {
  if (payload.is_mock_location) return;
  try {
    const current = await readQueueSafe();
    const filtered = current.filter((item) => !isPingEndpoint(item.endpoint || ''));

    filtered.push({
      id: `ping_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint: ENDPOINTS.CAMPUS_PING,
      method: 'POST',
      payload: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy_meters: payload.accuracy_meters ?? payload.accuracy ?? 15,
        device_id: payload.device_id ?? payload.client_device_id ?? '',
        is_mock_location: false,
      },
      timestamp: Date.now(),
      retryCount: 0,
    });

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch {}
}

export async function queueOfflineAction(
  endpoint: string,
  payload: unknown,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST'
): Promise<void> {
  if (!isAllowedRelativeEndpoint(endpoint)) return;
  const safeEndpoint = endpoint.trim();

  try {
    let queue = await readQueueSafe();
    if (isPingEndpoint(safeEndpoint)) {
      queue = queue.filter((item) => !isPingEndpoint(item.endpoint || ''));
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
  } catch {}
}

export async function syncOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  if (isSyncing) {
    return { synced: 0, remaining: await getUnsyncedCount() };
  }

  isSyncing = true;
  let totalSynced = 0;

  try {
    // 1. Batch-sync any queued offline student QR scans
    const qrResult = await syncOfflineQrScans();
    totalSynced += qrResult.synced;

    // 2. Sync general queued actions / campus pings
    const queue = await readQueueSafe();
    if (queue.length === 0) {
      return { synced: totalSynced, remaining: qrResult.remaining };
    }

    const snapshotIds = new Set(queue.map((item) => item.id));
    const remaining: OfflineQueueItem[] = [];

    for (const item of queue) {
      if (!isAllowedRelativeEndpoint(item?.endpoint)) continue;
      if (isPingEndpoint(item.endpoint) && Date.now() - item.timestamp > MAX_HEARTBEAT_AGE_MS) {
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
        totalSynced += 1;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) break;
        if (status === 400 || status === 403 || status === 404 || status === 409) continue;

        const nextRetry = (item.retryCount || 0) + 1;
        if (nextRetry < MAX_RETRY_ATTEMPTS) {
          remaining.push({ ...item, retryCount: nextRetry });
        }
      }
    }

    const latestQueue = await readQueueSafe();
    const newlyAdded = latestQueue.filter((item) => !snapshotIds.has(item.id));
    const nextQueue = [...remaining, ...newlyAdded];

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQueue));
    return { synced: totalSynced, remaining: nextQueue.length + qrResult.remaining };
  } catch {
    return { synced: totalSynced, remaining: await getUnsyncedCount() };
  } finally {
    isSyncing = false;
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([OFFLINE_QUEUE_KEY, OFFLINE_QR_SCANS_KEY]);
  } catch {}
}
