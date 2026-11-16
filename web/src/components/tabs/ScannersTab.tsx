/**
 * AttendSure V3 - Classroom USB QR Scanner Station (Offline-First & Auto-Sync)
 * File: web/src/components/tabs/ScannersTab.tsx
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CloudUpload,
  Laptop,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import apiClient from '../../api/client';
import { useApiResource } from '../../hooks/useApiResource';

interface ScheduleOption {
  id: number;
  section_name: string;
  subject_code: string;
  subject_title: string;
  start_time: string;
  end_time: string;
}

interface QueuedQRScan {
  id: string;
  qr_token: string;
  schedule_id: number | null;
  schedule_label: string;
  scanned_at: string;
  display_time: string;
}

interface ScanHistoryItem {
  student_name: string;
  lrn: string;
  section: string;
  status: string;
  scanned_at: string;
  attendance_note: string;
  is_offline?: boolean;
}

const OFFLINE_QUEUE_KEY = 'attendsure_offline_qr_queue_v3';

function loadSavedQueue(): QueuedQRScan[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueueToStorage(items: QueuedQRScan[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {}
}

export const ScannersTab: React.FC = () => {
  const { data: rawSchedules, reload: reloadSchedules } = useApiResource<any>('/schedules/', []);
  const { data: geofenceStatus, reload: reloadGeofence } = useApiResource<any>('/geofence/status/', { heartbeats: [] });

  const schedules: ScheduleOption[] = useMemo(() => {
    if (Array.isArray(rawSchedules)) return rawSchedules;
    if (Array.isArray(rawSchedules?.results)) return rawSchedules.results;
    return [];
  }, [rawSchedules]);

  const activeFacultyCount = useMemo(() => {
    return Array.isArray(geofenceStatus?.heartbeats) ? geofenceStatus.heartbeats.length : 0;
  }, [geofenceStatus]);

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [qrInput, setQrInput] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const [offlineQueue, setOfflineQueue] = useState<QueuedQRScan[]>(loadSavedQueue);
  const [lastScan, setLastScan] = useState<ScanHistoryItem | null>(null);
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'error' | 'warning' | 'success' } | null>(null);
  const [recentScans, setRecentScans] = useState<ScanHistoryItem[]>([]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastTokenTimeRef = useRef<{ token: string; ts: number }>({ token: '', ts: 0 });

  useEffect(() => {
    if (schedules.length > 0 && !selectedScheduleId) {
      setSelectedScheduleId(String(schedules[0].id));
    }
  }, [schedules, selectedScheduleId]);

  useEffect(() => {
    saveQueueToStorage(offlineQueue);
  }, [offlineQueue]);

  const syncOfflineQueue = useCallback(async () => {
    const currentQueue = loadSavedQueue();
    if (currentQueue.length === 0 || syncing) return;

    setSyncing(true);
    try {
      const payload = {
        scans: currentQueue.map((item) => ({
          qr_token: item.qr_token,
          schedule_id: item.schedule_id,
          scanned_at: item.scanned_at,
        })),
      };
      const res = await apiClient.post('/classroom/offline-sync/', payload);
      const synced = Number(res.data?.synced_count || 0);
      const dupes = Number(res.data?.duplicate_count || 0);
      const rejected = Number(res.data?.rejected_count || 0);

      setOfflineQueue([]);
      saveQueueToStorage([]);
      setScanMessage({
        text: `Offline queue synced: ${synced} recorded, ${dupes} duplicate(s), ${rejected} invalid.`,
        type: 'success',
      });
    } catch {
      setScanMessage({
        text: 'Still offline or server unreachable. Queued scans remain safely stored on this PC.',
        type: 'warning',
      });
    } finally {
      setSyncing(false);
      inputRef.current?.focus();
    }
  }, [syncing]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncOfflineQueue]);

  const queueScanLocally = (cleanToken: string) => {
    const now = new Date();
    const matchedSched = schedules.find((s) => String(s.id) === selectedScheduleId);
    const schedLabel = matchedSched ? `${matchedSched.section_name} (${matchedSched.subject_code})` : 'Auto-Detect Class';
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const queuedItem: QueuedQRScan = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      qr_token: cleanToken,
      schedule_id: selectedScheduleId ? Number(selectedScheduleId) : null,
      schedule_label: schedLabel,
      scanned_at: now.toISOString(),
      display_time: timeLabel,
    };

    setOfflineQueue((prev) => [queuedItem, ...prev]);

    const offlineRecord: ScanHistoryItem = {
      student_name: 'Queued Student ID',
      lrn: cleanToken.slice(0, 24),
      section: schedLabel,
      status: 'QUEUED OFFLINE',
      scanned_at: timeLabel,
      attendance_note: 'Saved locally on this PC. Will auto-sync when internet returns.',
      is_offline: true,
    };
    setLastScan(offlineRecord);
    setRecentScans((prev) => [offlineRecord, ...prev.slice(0, 14)]);
    setScanMessage({
      text: 'No internet connection. Scan saved offline and will sync automatically when reconnected.',
      type: 'warning',
    });
  };

  const handleUsbQrScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = qrInput.trim().slice(0, 128);
    if (!cleanToken || submitting) return;

    // Prevent accidental double-scans of the same ID within 5 seconds
    const nowMs = Date.now();
    if (lastTokenTimeRef.current.token === cleanToken && nowMs - lastTokenTimeRef.current.ts < 5000) {
      setQrInput('');
      inputRef.current?.focus();
      return;
    }
    lastTokenTimeRef.current = { token: cleanToken, ts: nowMs };

    setQrInput('');
    setScanMessage(null);

    if (!isOnline) {
      queueScanLocally(cleanToken);
      inputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = { qr_token: cleanToken };
      if (selectedScheduleId) {
        payload.schedule_id = Number(selectedScheduleId);
      }

      const res = await apiClient.post('/classroom/scan/', payload);
      const record: ScanHistoryItem = {
        student_name: res.data.student_name,
        lrn: res.data.lrn,
        section: res.data.section,
        status: res.data.status,
        scanned_at: res.data.scanned_at,
        attendance_note: res.data.attendance_note,
        is_offline: false,
      };
      setLastScan(record);
      setRecentScans((prev) => [record, ...prev.slice(0, 14)]);

      if (offlineQueue.length > 0) {
        syncOfflineQueue();
      }
    } catch (err: any) {
      // If network error (no server response), fall back to offline queue automatically
      if (!err.response) {
        setIsOnline(false);
        queueScanLocally(cleanToken);
      } else {
        setScanMessage({
          text:
            err.response?.data?.error ||
            err.response?.data?.detail ||
            'Unrecognized QR ID card or student is not enrolled in this class.',
          type: 'error',
        });
      }
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const handleRefreshAll = () => {
    reloadSchedules(false);
    reloadGeofence(false);
    inputRef.current?.focus();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      {/* Header & Connection Status */}
      <div style={headerCardStyle}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Laptop size={18} color="#004b87" /> Classroom USB QR Scanner Station (PC / Laptop)
            </h2>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: '0.72rem',
                fontWeight: 800,
                backgroundColor: isOnline ? '#ecfdf5' : '#fef3c7',
                color: isOnline ? '#047857' : '#b45309',
                border: `1px solid ${isOnline ? '#a7f3d0' : '#fde68a'}`,
              }}
            >
              {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
              {isOnline ? 'Online & Synced' : 'Offline Mode Active'}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            Plug your USB QR code scanner into this PC or laptop. Scans save offline automatically if Wi-Fi drops. Faculty attendance uses mobile facial recognition.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {offlineQueue.length > 0 && (
            <button
              type="button"
              onClick={syncOfflineQueue}
              disabled={syncing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#d97706',
                color: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.78rem',
              }}
            >
              <CloudUpload size={14} />
              {syncing ? 'Syncing...' : `Sync Offline Queue (${offlineQueue.length})`}
            </button>
          )}

          <button type="button" onClick={handleRefreshAll} style={secondaryBtnStyle}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Main USB QR Input Form */}
      <form onSubmit={handleUsbQrScan} style={scannerFormStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Active Class Schedule</label>
            <select
              value={selectedScheduleId}
              onChange={(e) => {
                setSelectedScheduleId(e.target.value);
                inputRef.current?.focus();
              }}
              style={inputFieldStyle}
            >
              <option value="">Auto-Detect Student Section Schedule</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.section_name} — {s.subject_code} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ ...labelStyle, color: '#004b87' }}>
              USB QR Scanner Input (Keep Cursor Here &amp; Scan Student ID)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Scan student QR ID card..."
                style={{
                  ...inputFieldStyle,
                  flex: 1,
                  border: '1.5px solid #004b87',
                  fontFamily: 'monospace',
                }}
              />
              <button
                type="submit"
                disabled={submitting || !qrInput.trim()}
                style={primaryBtnStyle}
              >
                {submitting ? 'Saving...' : 'Record'}
              </button>
            </div>
          </div>
        </div>

        {scanMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor:
                scanMessage.type === 'error'
                  ? '#fef2f2'
                  : scanMessage.type === 'warning'
                  ? '#fffbeb'
                  : '#ecfdf5',
              color:
                scanMessage.type === 'error'
                  ? '#dc2626'
                  : scanMessage.type === 'warning'
                  ? '#b45309'
                  : '#047857',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
          >
            <AlertCircle size={16} /> {scanMessage.text}
          </div>
        )}

        {lastScan && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: 8,
              backgroundColor: lastScan.is_offline ? '#fffbeb' : '#ecfdf5',
              border: `1px solid ${lastScan.is_offline ? '#fde68a' : '#a7f3d0'}`,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {lastScan.is_offline ? (
                <Clock size={18} color="#d97706" />
              ) : (
                <CheckCircle2 size={18} color="#059669" />
              )}
              <div>
                <div
                  style={{
                    fontWeight: 800,
                    color: lastScan.is_offline ? '#92400e' : '#065f46',
                    fontSize: '0.9rem',
                  }}
                >
                  {lastScan.student_name} ({lastScan.lrn}) — {lastScan.status}
                </div>
                <div style={{ fontSize: '0.75rem', color: lastScan.is_offline ? '#b45309' : '#047857' }}>
                  {lastScan.section} • {lastScan.scanned_at} • {lastScan.attendance_note}
                </div>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Status Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        <div style={statCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 800, color: '#004b87' }}>
            <QrCode size={15} /> STUDENT ATTENDANCE SETUP
          </div>
          <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', marginTop: 6 }}>
            USB QR Scanner on Faculty PC / Laptop
          </div>
        </div>

        <div style={statCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 800, color: '#059669' }}>
            <Smartphone size={15} /> FACULTY MOBILE FACIAL RECOGNITION
          </div>
          <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
            {activeFacultyCount} Faculty Verified Today via Mobile App
          </div>
        </div>

        <div style={statCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 800, color: '#d97706' }}>
            <CloudUpload size={15} /> OFFLINE QUEUE BUFFER
          </div>
          <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', marginTop: 6 }}>
            {offlineQueue.length} Scan(s) Waiting to Sync
          </div>
        </div>
      </div>

      {/* Offline Queue List (Shown when scans are waiting to sync) */}
      {offlineQueue.length > 0 && (
        <div style={sectionBoxStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#92400e' }}>
              Offline Local Queue ({offlineQueue.length} Pending)
            </h3>
            <button
              type="button"
              onClick={() => setOfflineQueue([])}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={12} /> Clear Queue
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {offlineQueue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: '#fffbeb',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{item.qr_token}</span>
                <span>
                  {item.schedule_label} • {item.display_time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Scans in Current Session */}
      {recentScans.length > 0 && (
        <div style={sectionBoxStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
            Recent Student Scans in This Session ({recentScans.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentScans.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  backgroundColor: '#f8fafc',
                  borderRadius: 6,
                  fontSize: '0.8rem',
                }}
              >
                <strong>
                  {item.student_name} ({item.lrn})
                </strong>
                <span>
                  {item.section} • {item.status} • {item.scanned_at}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const headerCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#ffffff',
  padding: 16,
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 12,
};

const scannerFormStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: 18,
  borderRadius: 12,
  border: '2px solid #004b87',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#334155',
  marginBottom: 4,
};

const inputFieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: '0.85rem',
  fontWeight: 600,
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: '#004b87',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.82rem',
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '0.78rem',
};

const statCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: 14,
  borderRadius: 10,
  border: '1px solid #e2e8f0',
};

const sectionBoxStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: 16,
  borderRadius: 12,
  border: '1px solid #e2e8f0',
};

export default ScannersTab;