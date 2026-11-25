// AttendSure Mobile - Unified Offline Queue Service (Student QR + Campus GPS Telemetry)
// File: D:\AttendSure_V3\mobile\src\services\offlineQueue.ts

/**
 * AttendSure - Single Shared Offline Storage & Sync Queue Engine
 * Consolidates foreground and background offline GPS pings into one safe queue
 * with automatic migration from legacy queue keys and full preservation of
 * recorded_at, gps_timestamp_ms, ping_source='OFFLINE_QUEUE', and phone health telemetry.
 * File: mobile/src/services/offlineQueue.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, getValidAccessToken, isJwtString } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { cleanUrl, getServerBaseUrl, SERVER_URL_STORAGE_KEY } from './configService';
import type { CampusPingSource, PhoneAppStateType, PhoneNetworkType } from '../types';

const UNIFIED_GPS_QUEUE_KEY = 'attendsure_unified_gps_queue_v3';
const LEGACY_BG_GPS_QUEUE_KEY = 'attendsure_bg_gps_queue_v2';
const OFFLINE_QUEUE_KEY = 'attendsure_offline_queue';
const OFFLINE_QR_SCANS_KEY = 'attendsure_offline_qr_scans';

const MAX_RETRY_ATTEMPTS = 8;
const MAX_QR_PERMANENT_RETRIES = 3;
const MAX_QUEUED_GPS_PINGS = 120;
const MAX_HEARTBEAT_AGE_MS = 24 * 60 * 60 * 1000;

let isSyncing = false;
let isFlushingPings = false;
let legacyMigrated = false;

export interface QueuedCampusPingPayload {
  device_id?: string | null;
  client_device_id?: string | null;
  device_model?: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  accuracy?: number | null;
  speed_mps?: number | null;
  gps_timestamp_ms?: number | null;
  recorded_at?: string | null;
  battery_percent?: number | null;
  is_charging?: boolean | null;
  is_low_power_mode?: boolean | null;
  network_type?: PhoneNetworkType | string | null;
  is_gps_enabled?: boolean | null;
  is_mock_location?: boolean;
  app_state?: PhoneAppStateType | string | null;
  ping_source?: CampusPingSource | string | null;
}

export interface StoredCampusPingRecord {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_mps: number | null;
  gps_timestamp_ms: number;
  recorded_at: string;
  device_id: string;
  device_model: string | null;
  battery_percent: number | null;
  is_charging: boolean | null;
  is_low_power_mode: boolean | null;
  network_type: PhoneNetworkType;
  is_gps_enabled: boolean;
  is_mock_location: false;
  app_state: PhoneAppStateType;
  ping_source: 'OFFLINE_QUEUE';
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

function normalizeNetworkType(raw: unknown): PhoneNetworkType {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'WIFI' || upper === 'CELLULAR' || upper === 'NONE') {
    return upper;
  }
  return 'UNKNOWN';
}

function normalizeAppState(raw: unknown): PhoneAppStateType {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'ACTIVE' || upper === 'BACKGROUND') {
    return upper;
  }
  return 'UNKNOWN';
}

function normalizeStoredPing(
  raw: QueuedCampusPingPayload | null | undefined,
  fallbackTimestampMs?: number
): StoredCampusPingRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.is_mock_location) return null;

  const lat = Number(raw.latitude);
  const lng = Number(raw.longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  let tsMs = Number(raw.gps_timestamp_ms);
  if (!Number.isFinite(tsMs) || tsMs <= 0) {
    if (raw.recorded_at) {
      const parsedMs = Date.parse(String(raw.recorded_at));
      if (Number.isFinite(parsedMs) && parsedMs > 0) {
        tsMs = parsedMs;
      }
    }
  }
  if (!Number.isFinite(tsMs) || tsMs <= 0) {
    tsMs = fallbackTimestampMs && fallbackTimestampMs > 0 ? fallbackTimestampMs : Date.now();
  }
  tsMs = Math.round(tsMs);

  let recordedAtIso = String(raw.recorded_at || '').trim();
  if (!recordedAtIso || Number.isNaN(Date.parse(recordedAtIso))) {
    recordedAtIso = new Date(tsMs).toISOString();
  }

  const rawAccuracy = raw.accuracy_meters ?? raw.accuracy;
  const accuracyMeters =
    typeof rawAccuracy === 'number' && Number.isFinite(rawAccuracy) && rawAccuracy >= 0
      ? Math.round(rawAccuracy * 10) / 10
      : null;

  const speedMps =
    typeof raw.speed_mps === 'number' && Number.isFinite(raw.speed_mps) && raw.speed_mps >= 0
      ? Math.round(raw.speed_mps * 100) / 100
      : null;

  const batteryPercent =
    typeof raw.battery_percent === 'number' && Number.isFinite(raw.battery_percent)
      ? Math.min(100, Math.max(0, Math.round(raw.battery_percent)))
      : null;

  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    accuracy_meters: accuracyMeters,
    speed_mps: speedMps,
    gps_timestamp_ms: tsMs,
    recorded_at: recordedAtIso,
    device_id: String(raw.device_id ?? raw.client_device_id ?? '').trim(),
    device_model: raw.device_model ? String(raw.device_model).trim().slice(0, 120) : null,
    battery_percent: batteryPercent,
    is_charging: typeof raw.is_charging === 'boolean' ? raw.is_charging : null,
    is_low_power_mode: typeof raw.is_low_power_mode === 'boolean' ? raw.is_low_power_mode : null,
    network_type: normalizeNetworkType(raw.network_type),
    is_gps_enabled: raw.is_gps_enabled !== false,
    is_mock_location: false,
    app_state: normalizeAppState(raw.app_state),
    ping_source: 'OFFLINE_QUEUE',
  };
}

function pruneAndSortPings(items: StoredCampusPingRecord[]): StoredCampusPingRecord[] {
  const cutoff = Date.now() - MAX_HEARTBEAT_AGE_MS;
  const dedup = new Map<number, StoredCampusPingRecord>();

  for (const item of items) {
    if (!item || item.gps_timestamp_ms < cutoff) continue;
    dedup.set(item.gps_timestamp_ms, { ...item, ping_source: 'OFFLINE_QUEUE' });
  }

  return Array.from(dedup.values())
    .sort((a, b) => a.gps_timestamp_ms - b.gps_timestamp_ms)
    .slice(-MAX_QUEUED_GPS_PINGS);
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

async function readRawUnifiedPings(): Promise<StoredCampusPingRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(UNIFIED_GPS_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized: StoredCampusPingRecord[] = [];
    for (const entry of parsed) {
      const clean = normalizeStoredPing(entry as QueuedCampusPingPayload);
      if (clean) normalized.push(clean);
    }
    return pruneAndSortPings(normalized);
  } catch {
    return [];
  }
}

async function writeUnifiedPings(items: StoredCampusPingRecord[]): Promise<void> {
  const cleaned = pruneAndSortPings(items);
  await AsyncStorage.setItem(UNIFIED_GPS_QUEUE_KEY, JSON.stringify(cleaned));
}

/**
 * Safely drains any leftover pings from both old keys (`attendsure_bg_gps_queue_v2`
 * and ping entries inside `attendsure_offline_queue`) into the single unified queue.
 */
async function ensureLegacyGpsQueuesMigrated(): Promise<void> {
  if (legacyMigrated) return;
  legacyMigrated = true;

  try {
    const [existingUnified, legacyBgRaw, legacyGeneral] = await Promise.all([
      readRawUnifiedPings(),
      AsyncStorage.getItem(LEGACY_BG_GPS_QUEUE_KEY).catch(() => null),
      readQueueSafe(),
    ]);

    const migrated: StoredCampusPingRecord[] = [...existingUnified];
    let dirty = false;

    if (legacyBgRaw) {
      try {
        const parsedBg: unknown = JSON.parse(legacyBgRaw);
        if (Array.isArray(parsedBg)) {
          for (const item of parsedBg) {
            const clean = normalizeStoredPing(item as QueuedCampusPingPayload);
            if (clean) {
              migrated.push(clean);
              dirty = true;
            }
          }
        }
      } catch {}
      await AsyncStorage.removeItem(LEGACY_BG_GPS_QUEUE_KEY).catch(() => {});
    }

    const nonPingGeneral: OfflineQueueItem[] = [];
    let removedGeneralPing = false;
    for (const item of legacyGeneral) {
      if (item && isPingEndpoint(item.endpoint || '')) {
        const clean = normalizeStoredPing(
          item.payload as QueuedCampusPingPayload,
          item.timestamp
        );
        if (clean) {
          migrated.push(clean);
          dirty = true;
        }
        removedGeneralPing = true;
      } else {
        nonPingGeneral.push(item);
      }
    }

    if (dirty) {
      await writeUnifiedPings(migrated);
    }
    if (removedGeneralPing) {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nonPingGeneral)).catch(() => {});
    }
  } catch {
    // Migration failure should never block normal app operation
  }
}

export async function getQueuedQrScans(): Promise<QueuedQrScan[]> {
  return readQrScansSafe();
}

export async function getQueuedCampusPings(): Promise<StoredCampusPingRecord[]> {
  await ensureLegacyGpsQueuesMigrated();
  return readRawUnifiedPings();
}

export async function getUnsyncedCount(): Promise<number> {
  await ensureLegacyGpsQueuesMigrated();
  const [items, qrScans, gpsPings] = await Promise.all([
    readQueueSafe(),
    readQrScansSafe(),
    readRawUnifiedPings(),
  ]);
  return items.length + qrScans.length + gpsPings.length;
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

    if (status === 401) {
      return { synced: 0, remaining: scans.length };
    }

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

    return { synced: 0, remaining: scans.length };
  }
}

/**
 * Enqueues a campus GPS ping with ALL phone health and timestamp fields preserved.
 * Used identically by both foreground telemetry and the background location task.
 */
export async function enqueueOfflineHeartbeat(payload: QueuedCampusPingPayload): Promise<number> {
  const normalized = normalizeStoredPing(payload);
  if (!normalized) return 0;

  try {
    await ensureLegacyGpsQueuesMigrated();
    const current = await readRawUnifiedPings();
    const next = pruneAndSortPings([...current, normalized]);
    await writeUnifiedPings(next);
    return next.length;
  } catch {
    return 0;
  }
}

async function resolveBackgroundServerBase(): Promise<string | null> {
  try {
    const base = await getServerBaseUrl();
    if (base && /^https?:\/\//i.test(base)) {
      return cleanUrl(base);
    }
  } catch {}
  const saved = await AsyncStorage.getItem(SERVER_URL_STORAGE_KEY).catch(() => null);
  if (saved && /^https?:\/\//i.test(saved)) {
    return cleanUrl(saved);
  }
  return null;
}

type PingPostOutcome = 'OK' | 'DROP' | 'AUTH_EXPIRED' | 'RETRY';

async function postQueuedPingFetch(
  apiBaseUrl: string,
  accessToken: string,
  ping: StoredCampusPingRecord
): Promise<PingPostOutcome> {
  const cleanBase = cleanUrl(apiBaseUrl);
  if (!/^https?:\/\//i.test(cleanBase)) return 'RETRY';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${cleanBase}/api/v1/campus/ping/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Device-UUID': ping.device_id,
      },
      body: JSON.stringify({ ...ping, ping_source: 'OFFLINE_QUEUE' }),
      signal: controller.signal,
    });

    if (response.ok) return 'OK';
    if (response.status === 401) return 'AUTH_EXPIRED';
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 409
    ) {
      return 'DROP';
    }
    return 'RETRY';
  } catch {
    return 'RETRY';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Flushes all queued offline campus GPS pings chronologically while preserving
 * `ping_source: 'OFFLINE_QUEUE'`, original `recorded_at`, `gps_timestamp_ms`,
 * and every phone health field. Safe to call from both foreground and background tasks.
 */
export async function flushUnifiedOfflineGpsPings(): Promise<{
  synced: number;
  remaining: number;
}> {
  if (isFlushingPings) {
    const current = await readRawUnifiedPings();
    return { synced: 0, remaining: current.length };
  }

  isFlushingPings = true;
  let syncedCount = 0;

  try {
    await ensureLegacyGpsQueuesMigrated();
    const queue = await readRawUnifiedPings();
    if (queue.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    const [apiBaseUrl, initialToken] = await Promise.all([
      resolveBackgroundServerBase(),
      getValidAccessToken(false),
    ]);

    if (!apiBaseUrl || !initialToken || !isJwtString(initialToken)) {
      return { synced: 0, remaining: queue.length };
    }

    let currentToken = initialToken;
    const processedTimestamps = new Set<number>();

    for (let i = 0; i < queue.length; i += 1) {
      const ping: StoredCampusPingRecord = {
        ...queue[i],
        ping_source: 'OFFLINE_QUEUE',
      };

      let outcome = await postQueuedPingFetch(apiBaseUrl, currentToken, ping);

      if (outcome === 'AUTH_EXPIRED') {
        const refreshed = await getValidAccessToken(true);
        if (refreshed && isJwtString(refreshed)) {
          currentToken = refreshed;
          outcome = await postQueuedPingFetch(apiBaseUrl, currentToken, ping);
        }
      }

      if (outcome === 'OK') {
        syncedCount += 1;
        processedTimestamps.add(ping.gps_timestamp_ms);
        continue;
      }

      if (outcome === 'DROP') {
        processedTimestamps.add(ping.gps_timestamp_ms);
        continue;
      }

      // Stop on transient error or unrecoverable auth expiry; keep remaining items ordered
      break;
    }

    const latest = await readRawUnifiedPings();
    const stillPending = latest.filter((item) => !processedTimestamps.has(item.gps_timestamp_ms));
    await writeUnifiedPings(stillPending);

    return { synced: syncedCount, remaining: stillPending.length };
  } catch {
    const current = await readRawUnifiedPings();
    return { synced: syncedCount, remaining: current.length };
  } finally {
    isFlushingPings = false;
  }
}

export async function queueOfflineAction(
  endpoint: string,
  payload: unknown,
  method: 'POST' | 'PUT' | 'PATCH' = 'POST'
): Promise<void> {
  if (!isAllowedRelativeEndpoint(endpoint)) return;
  const safeEndpoint = endpoint.trim();

  if (isPingEndpoint(safeEndpoint) && payload && typeof payload === 'object') {
    await enqueueOfflineHeartbeat(payload as QueuedCampusPingPayload);
    return;
  }

  try {
    const queue = await readQueueSafe();
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
    await ensureLegacyGpsQueuesMigrated();

    // 1. Batch-sync any queued offline student QR scans
    const qrResult = await syncOfflineQrScans();
    totalSynced += qrResult.synced;

    // 2. Chronologically flush the unified offline GPS ping queue
    const pingResult = await flushUnifiedOfflineGpsPings();
    totalSynced += pingResult.synced;

    // 3. Sync general non-ping queued actions
    const queue = await readQueueSafe();
    if (queue.length === 0) {
      return {
        synced: totalSynced,
        remaining: qrResult.remaining + pingResult.remaining,
      };
    }

    const snapshotIds = new Set(queue.map((item) => item.id));
    const remaining: OfflineQueueItem[] = [];

    for (const item of queue) {
      if (!isAllowedRelativeEndpoint(item?.endpoint)) continue;
      if (isPingEndpoint(item.endpoint)) {
        await enqueueOfflineHeartbeat(item.payload as QueuedCampusPingPayload);
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
    return {
      synced: totalSynced,
      remaining: nextQueue.length + qrResult.remaining + pingResult.remaining,
    };
  } catch {
    return { synced: totalSynced, remaining: await getUnsyncedCount() };
  } finally {
    isSyncing = false;
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      UNIFIED_GPS_QUEUE_KEY,
      LEGACY_BG_GPS_QUEUE_KEY,
      OFFLINE_QUEUE_KEY,
      OFFLINE_QR_SCANS_KEY,
    ]);
  } catch {}
}
