/**
 * AttendSure - Built-In Browser/Webcam Continuous QR Scanner & Real-Time Sync
 * File: web/src/components/scanner/ClassroomScanner.tsx
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AxiosResponse } from 'axios';
import jsQR from 'jsqr';
import apiClient, { invalidateApiCache, peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { formatDayOfWeekLabel, periodRunsToday } from '../../utils/scheduleAlarms';
import { ProfileAvatar } from '../common/ProfileAvatar';
import {
  Camera,
  QrCode,
  Volume2,
  VolumeX,
  CheckCircle2,
  Info,
  X,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';

export interface ScannedStudent {
  student_id: number;
  student_name: string;
  lrn: string;
  section: string;
  status: string;
  scanned_at: string;
  photo_url?: string | null;
  is_duplicate?: boolean;
}

interface ClassPeriodOption {
  id: number;
  schedule_id?: number | null;
  name: string;
  grade_level: string;
  subject_code: string;
  subject_title: string;
  time_display: string;
  day_of_week?: string;
}

const prioritizePeriodsForToday = (list: ClassPeriodOption[], jsDay: number): ClassPeriodOption[] => {
  const todayList: ClassPeriodOption[] = [];
  const otherDaysList: ClassPeriodOption[] = [];
  for (const period of list) {
    if (periodRunsToday(period.day_of_week, jsDay)) {
      todayList.push(period);
    } else {
      otherDaysList.push(period);
    }
  }
  return [...todayList, ...otherDaysList];
};

const formatScannerPeriodOptionLabel = (period: ClassPeriodOption, runsToday: boolean): string => {
  const dayTag = formatDayOfWeekLabel(period.day_of_week);
  const timePart = period.time_display || 'Active';
  const scheduleTag = runsToday
    ? period.day_of_week && period.day_of_week !== 'ALL_WEEKDAYS'
      ? `${timePart} • ${dayTag}`
      : timePart
    : `${timePart} • ${dayTag} (Off-Day)`;
  return `${period.grade_level} - ${period.name} • ${period.subject_code || period.subject_title} (${scheduleTag})`;
};

interface OfflineScanEntry {
  qr_token: string;
  period_id: number | null;
  scanned_at: string;
  client_scan_uuid: string;
}

export interface ClassroomScannerProps {
  onClose?: () => void;
  isModal?: boolean;
}

const OFFLINE_QUEUE_KEY = 'attendsure_offline_qr_queue';
const SCAN_CANVAS_WIDTH = 400;
const SCAN_CANVAS_HEIGHT = 300;
const SCAN_INTERVAL_MS = 66; // ~15 FPS continuous auto-scanner

const generateScanUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const loadOfflineQueue = (): OfflineScanEntry[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineScanEntry[]) : [];
  } catch {
    return [];
  }
};

const playFeedbackChime = (type: 'SUCCESS' | 'WARNING' | 'ERROR') => {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type === 'SUCCESS' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(type === 'SUCCESS' ? 1046 : 250, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // Browser autoplay policy blocked audio
  }
};

const MAX_QR_INPUT_LENGTH = 256;
const sanitizeQrInput = (raw: string): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .slice(0, MAX_QR_INPUT_LENGTH);

export const ClassroomScanner: React.FC<ClassroomScannerProps> = ({ onClose, isModal = false }) => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { showAlert } = useAlert();

  const todayJsDay = useMemo(() => new Date().getDay(), []);

  const warmPeriods = useMemo(() => {
    const cached = peekApiCache<ClassPeriodOption[]>(API_ROUTES.attendance.classes, { summary: 1 });
    const valid = Array.isArray(cached) ? cached.filter((p) => p.id > 0) : [];
    return prioritizePeriodsForToday(valid, todayJsDay);
  }, [todayJsDay]);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [manualQrInput, setManualQrInput] = useState('');
  const [cameraRestartKey, setCameraRestartKey] = useState(0);

  const [periods, setPeriods] = useState<ClassPeriodOption[]>(() => warmPeriods);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(() =>
    warmPeriods.length > 0 ? warmPeriods[0].id : null
  );
  const [activeStudent, setActiveStudent] = useState<ScannedStudent | null>(null);
  const [sessionList, setSessionList] = useState<ScannedStudent[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineScanEntry[]>(loadOfflineQueue);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const lastFrameDecodeTsRef = useRef(0);
  const recentScansMapRef = useRef<Map<string, number>>(new Map());
  const inFlightSetRef = useRef<Set<string>>(new Set());
  const processScanRef = useRef<(rawCode: string) => Promise<void>>(async () => {});
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<ClassPeriodOption[]>(API_ROUTES.attendance.classes, {
        params: { summary: 1 },
        signal: controller.signal,
      })
      .then((res: AxiosResponse<ClassPeriodOption[]>) => {
        if (controller.signal.aborted) return;
        const rawList: ClassPeriodOption[] = Array.isArray(res.data) ? res.data : [];
        const validList = prioritizePeriodsForToday(
          rawList.filter((p) => p.id > 0),
          todayJsDay
        );
        setPeriods(validList);
        if (validList.length > 0) {
          setSelectedPeriodId((prev) =>
            prev && validList.some((p) => p.id === prev) ? prev : validList[0].id
          );
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [todayJsDay]);

  const syncOfflineScans = useCallback(async () => {
    const queued = loadOfflineQueue();
    if (queued.length === 0) return;
    setSyncingOffline(true);
    try {
      const res = await apiClient.post(API_ROUTES.attendance.offlineSync, { scans: queued });
      if (!mountedRef.current) return;
      try {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
      } catch {}
      setOfflineQueue([]);
      invalidateApiCache();
      window.dispatchEvent(new CustomEvent('attendsure:attendance-updated'));
      showAlert({
        title: 'Offline Scans Synced',
        message: `Synced ${res.data?.synced_count ?? 0} scan(s) (${res.data?.duplicate_count ?? 0} duplicate).`,
        type: 'success',
      });
    } catch (err) {
      if (!mountedRef.current) return;
      showAlert({ title: 'Sync Notice', message: extractApiError(err, 'Still offline.'), type: 'warning' });
    } finally {
      if (mountedRef.current) setSyncingOffline(false);
    }
  }, [showAlert]);

  const handleProcessScan = useCallback(
    async (rawCode: string) => {
      const clean = sanitizeQrInput(rawCode).trim();
      if (!clean) return;

      const now = Date.now();
      recentScansMapRef.current.forEach((ts, k) => {
        if (now - ts > 10000) recentScansMapRef.current.delete(k);
      });
      if (
        now - (recentScansMapRef.current.get(clean) || 0) < 3000 ||
        inFlightSetRef.current.has(clean)
      ) {
        return;
      }

      recentScansMapRef.current.set(clean, now);
      inFlightSetRef.current.add(clean);
      setLoading(true);

      const scanUuid = generateScanUuid();
      try {
        const res = await apiClient.post(API_ROUTES.attendance.scan, {
          qr_text: clean,
          period_id: selectedPeriodId && selectedPeriodId > 0 ? selectedPeriodId : undefined,
          client_scan_uuid: scanUuid,
        });
        if (!mountedRef.current) return;

        const d = res.data || {};
        const item: ScannedStudent = {
          student_id: d.student_id,
          student_name: d.student_name,
          lrn: d.lrn,
          section: d.section,
          status: d.status || 'PRESENT',
          scanned_at: d.scanned_at,
          photo_url: isSafeImageUrl(d.photo_url) ? d.photo_url : null,
          is_duplicate: Boolean(d.is_duplicate),
        };

        setActiveStudent(item);
        invalidateApiCache();
        window.dispatchEvent(new CustomEvent('attendsure:attendance-updated', { detail: item }));

        if (soundEnabled) playFeedbackChime(item.is_duplicate ? 'WARNING' : 'SUCCESS');
        if (!item.is_duplicate) {
          setSessionList((prev) => [item, ...prev.filter((p) => p.lrn !== item.lrn)]);
        }
      } catch (err: unknown) {
        const netErr = err as { name?: string; code?: string; response?: unknown };
        if (
          !mountedRef.current ||
          netErr?.name === 'CanceledError' ||
          netErr?.name === 'AbortError' ||
          netErr?.code === 'ERR_CANCELED'
        ) {
          return;
        }
        if (!netErr?.response) {
          const nextQueue: OfflineScanEntry[] = [
            ...loadOfflineQueue(),
            {
              qr_token: clean,
              period_id: selectedPeriodId && selectedPeriodId > 0 ? selectedPeriodId : null,
              scanned_at: new Date().toISOString(),
              client_scan_uuid: scanUuid,
            },
          ];
          try {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQueue));
          } catch {}
          setOfflineQueue(nextQueue);
          if (soundEnabled) playFeedbackChime('WARNING');
          showAlert({
            title: 'Saved on Device',
            message: 'School Wi-Fi is unreachable right now. This scan is safely saved on your device and will upload automatically once connected.',
            type: 'info',
          });
        } else {
          if (soundEnabled) playFeedbackChime('ERROR');
          showAlert({ title: 'Could Not Verify QR Card', message: extractApiError(err), type: 'warning' });
        }
      } finally {
        inFlightSetRef.current.delete(clean);
        if (mountedRef.current) {
          setLoading(inFlightSetRef.current.size > 0);
          setManualQrInput('');
        }
      }
    },
    [selectedPeriodId, soundEnabled, showAlert]
  );

  processScanRef.current = handleProcessScan;

  useEffect(() => {
    setCameraMessage(null);

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      const portSuffix = window.location.port ? `:${window.location.port}` : '';
      setCameraMessage(
        `Browser camera access requires HTTPS or localhost (${window.location.origin}). Open http://localhost${portSuffix} to enable your built-in camera, or verify a signed QR string below.`
      );
      return;
    }

    let active = true;
    const startCameraStream = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      if (!active) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      canvas.width = SCAN_CANVAS_WIDTH;
      canvas.height = SCAN_CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const scanFrame = (timestamp: number) => {
        if (!active) return;
        const video = videoRef.current;
        if (
          timestamp - lastFrameDecodeTsRef.current >= SCAN_INTERVAL_MS &&
          video &&
          ctx &&
          video.readyState >= video.HAVE_ENOUGH_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          lastFrameDecodeTsRef.current = timestamp;
          ctx.drawImage(video, 0, 0, SCAN_CANVAS_WIDTH, SCAN_CANVAS_HEIGHT);
          const imageData = ctx.getImageData(0, 0, SCAN_CANVAS_WIDTH, SCAN_CANVAS_HEIGHT);
          const decoded = jsQR(imageData.data, SCAN_CANVAS_WIDTH, SCAN_CANVAS_HEIGHT, {
            inversionAttempts: 'dontInvert',
          });

          if (decoded?.data) {
            void processScanRef.current(decoded.data);
          }
        }
        if (active) {
          frameRef.current = requestAnimationFrame(scanFrame);
        }
      };

      frameRef.current = requestAnimationFrame(scanFrame);
    };

    startCameraStream().catch((err: unknown) => {
      if (!active) return;
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraMessage('No built-in camera was detected on this device.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraMessage(
          'Your camera is currently in use by another app. Close the other app and click Retry Camera.'
        );
      } else {
        setCameraMessage(
          'Camera permission was blocked. Allow camera access in your browser address bar, then click Retry Camera.'
        );
      }
    });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [cameraRestartKey]);

  return (
    <div
      style={
        isModal
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              backgroundColor: 'rgba(15,23,42,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }
          : { width: '100%' }
      }
    >
      <div style={{ ...ui.card, padding: 0, overflow: 'hidden', width: '100%', maxWidth: isModal ? 900 : '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 18px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: tokens.primaryLight,
                color: brand.primary,
                fontSize: '0.78rem',
                fontWeight: 800,
              }}
            >
              <Camera size={15} />
              <span>Auto QR Scanner</span>
            </div>

            {periods.length > 0 && (
              <select
                aria-label="Select class period"
                value={selectedPeriodId || ''}
                onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...ui.input, width: 'auto', minWidth: 240, padding: '6px 10px' }}
              >
                {(() => {
                  const todayPeriods = periods.filter((p) => periodRunsToday(p.day_of_week, todayJsDay));
                  const otherDayPeriods = periods.filter((p) => !periodRunsToday(p.day_of_week, todayJsDay));
                  if (todayPeriods.length > 0 && otherDayPeriods.length > 0) {
                    return (
                      <>
                        <optgroup label="Scheduled Today">
                          {todayPeriods.map((p) => (
                            <option key={p.id} value={p.id}>
                              {formatScannerPeriodOptionLabel(p, true)}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Other Days (Make-Up)">
                          {otherDayPeriods.map((p) => (
                            <option key={p.id} value={p.id}>
                              {formatScannerPeriodOptionLabel(p, false)}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    );
                  }
                  return periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatScannerPeriodOptionLabel(p, periodRunsToday(p.day_of_week, todayJsDay))}
                    </option>
                  ));
                })()}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {offlineQueue.length > 0 && (
              <button type="button" onClick={syncOfflineScans} disabled={syncingOffline} style={ui.btnPrimary}>
                <CloudUpload size={14} /> Sync Offline ({offlineQueue.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setCameraRestartKey((k) => k + 1)}
              style={ui.btnSecondary}
              title="Restart built-in camera"
            >
              <RefreshCw size={14} /> Retry Camera
            </button>

            <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} style={ui.btnSecondary}>
              {soundEnabled ? <Volume2 size={14} color={brand.primary} /> : <VolumeX size={14} />}
              {soundEnabled ? 'Sound On' : 'Muted'}
            </button>

            {onClose && (
              <button
                type="button"
                aria-label="Close scanner"
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: tokens.textMuted }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            padding: 18,
            backgroundColor: tokens.bgCanvas,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={ui.card}>
              {cameraMessage ? (
                <div style={{ ...ui.subtleBox, color: brand.warning, lineHeight: 1.5, fontSize: '0.80rem', fontWeight: 600 }}>
                  {cameraMessage}
                </div>
              ) : (
                <div
                  style={{
                    position: 'relative',
                    height: 270,
                    backgroundColor: tokens.darkSurface,
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div
                    style={{
                      position: 'absolute',
                      width: 185,
                      height: 185,
                      border: `3px solid ${loading ? brand.success : brand.primary}`,
                      borderRadius: 14,
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(15,23,42,0.78)',
                      color: tokens.darkText,
                      padding: '4px 12px',
                      borderRadius: 999,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Auto-Scanner Active • Place QR ID in frame
                  </div>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleProcessScan(manualQrInput);
                }}
                style={{ display: 'flex', gap: 8, marginTop: 12 }}
              >
                <input
                  type="text"
                  maxLength={MAX_QR_INPUT_LENGTH}
                  value={manualQrInput}
                  onChange={(e) => setManualQrInput(sanitizeQrInput(e.target.value))}
                  placeholder="Or paste signed student QR code..."
                  style={{ ...ui.input, fontFamily: fonts.mono, fontSize: '0.78rem' }}
                />
                <button type="submit" disabled={loading || !manualQrInput.trim()} style={ui.btnPrimary}>
                  {loading ? '...' : 'Verify'}
                </button>
              </form>
            </div>

            {/* Scanned Student Card: Student Photo + Name (Status) + ONLY Timestamp below */}
            {activeStudent ? (
              <div
                style={{
                  ...ui.card,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: activeStudent.is_duplicate ? tokens.warningLight : tokens.successLight,
                  borderColor: activeStudent.is_duplicate ? brand.warning : brand.success,
                  borderWidth: 1.5,
                }}
              >
                <ProfileAvatar
                  photoUrl={activeStudent.photo_url}
                  name={activeStudent.student_name}
                  size={54}
                  iconSize={24}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.98rem',
                      fontWeight: 900,
                      color: activeStudent.is_duplicate ? brand.warning : brand.success,
                    }}
                  >
                    {activeStudent.student_name} (
                    {activeStudent.is_duplicate ? `${activeStudent.status} • ALREADY SCANNED` : activeStudent.status})
                  </div>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: tokens.textPrimary,
                      fontFamily: fonts.mono,
                      marginTop: 3,
                    }}
                  >
                    {activeStudent.scanned_at}
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  ...ui.card,
                  borderStyle: 'dashed',
                  borderColor: tokens.borderStrong,
                  textAlign: 'center',
                  padding: 24,
                }}
              >
                <QrCode size={30} color={tokens.textMuted} style={{ margin: '0 auto 6px', display: 'block' }} />
                <div style={{ fontSize: '0.80rem', fontWeight: 700, color: tokens.textSecondary }}>
                  Auto-Scanner Ready — Hold Student QR ID in Front of Camera
                </div>
              </div>
            )}
          </div>

          <div style={{ ...ui.card, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${tokens.borderSubtle}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <strong style={{ fontSize: '0.82rem', color: tokens.textPrimary }}>SESSION SCANS ({sessionList.length})</strong>
              {sessionList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSessionList([])}
                  style={{ background: 'none', border: 'none', color: brand.danger, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Clear
                </button>
              )}
            </div>
            <div style={{ height: 340, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessionList.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: tokens.textMuted, fontSize: '0.78rem', maxWidth: 260, lineHeight: 1.5 }}>
                  <Info size={22} style={{ margin: '0 auto 6px', display: 'block' }} />
                  No students scanned for this period yet. Hold a student QR ID in front of your camera to begin.
                </div>
              ) : (
                sessionList.map((item, idx) => (
                  <div
                    key={`${item.lrn}-${idx}`}
                    style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <ProfileAvatar photoUrl={item.photo_url} name={item.student_name} size={36} iconSize={16} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.82rem', color: tokens.textPrimary }}>
                          {item.student_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', fontFamily: fonts.mono, color: tokens.textSecondary, marginTop: 2 }}>
                          {item.scanned_at}
                        </div>
                      </div>
                    </div>
                    <span style={ui.badge(tokens.successLight, brand.success)}>
                      <CheckCircle2 size={11} /> {item.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassroomScanner;