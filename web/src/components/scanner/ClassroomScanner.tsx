/**
 * AttendSure - Classroom QR Attendance Scanner (USB QR Scanner, Camera & Offline Sync)
 * File: web/src/components/scanner/ClassroomScanner.tsx
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { ControlSwitch } from '../ui/ControlSwitch';
import {
  Scan,
  Camera,
  HardDrive,
  QrCode,
  Volume2,
  VolumeX,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Info,
  X,
  CloudUpload,
} from 'lucide-react';

export interface ScannedStudent {
  student_id: number;
  student_name: string;
  lrn: string;
  section: string;
  status: string;
  scanned_at: string;
  photo_url?: string | null;
  attendance_note?: string;
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
}

interface OfflineScanEntry {
  qr_token: string;
  period_id: number | null;
  scanned_at: string;
}

export interface ClassroomScannerProps {
  onClose?: () => void;
  isModal?: boolean;
}

const OFFLINE_QUEUE_KEY = 'attendsure_offline_qr_queue';

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
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
  String(raw || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, MAX_QR_INPUT_LENGTH);

export const ClassroomScanner: React.FC<ClassroomScannerProps> = ({ onClose, isModal = false }) => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert } = useAlert();

  const warmPeriods = useMemo(() => {
    const cached = peekApiCache<ClassPeriodOption[]>(API_ROUTES.attendance.classes, { summary: 1 });
    return Array.isArray(cached) ? cached.filter((p) => p.id > 0) : [];
  }, []);

  const [scannerMode, setScannerMode] = useState<'USB_GUN' | 'CAMERA'>('USB_GUN');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [inputCode, setInputCode] = useState('');

  const [periods, setPeriods] = useState<ClassPeriodOption[]>(() => warmPeriods);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(() =>
    warmPeriods.length > 0 ? warmPeriods[0].id : null
  );
  const [activeStudent, setActiveStudent] = useState<ScannedStudent | null>(null);
  const [sessionList, setSessionList] = useState<ScannedStudent[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineScanEntry[]>(loadOfflineQueue);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const processScanRef = useRef<(rawCode: string) => Promise<void>>(async () => {});
  const keyBuffer = useRef('');
  const lastKeyTime = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  loadingRef.current = loading;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanAbortRef.current?.abort();
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (cameraCooldownTimerRef.current) clearTimeout(cameraCooldownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get(API_ROUTES.attendance.classes, { params: { summary: 1 }, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const rawList: ClassPeriodOption[] = Array.isArray(res.data) ? res.data : [];
        const validList = rawList.filter((p) => p.id > 0);
        setPeriods(validList);
        if (validList.length > 0) setSelectedPeriodId((prev) => prev ?? validList[0].id);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const syncOfflineScans = useCallback(async () => {
    const queued = loadOfflineQueue();
    if (queued.length === 0) return;
    setSyncingOffline(true);
    try {
      const res = await apiClient.post(API_ROUTES.attendance.offlineSync, { scans: queued });
      if (!mountedRef.current) return;
      try {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
      } catch {
        // Ignore storage error
      }
      setOfflineQueue([]);
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
      if (!clean || loadingRef.current) return;

      scanAbortRef.current?.abort();
      const controller = new AbortController();
      scanAbortRef.current = controller;

      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await apiClient.post(
          API_ROUTES.attendance.scan,
          {
            qr_text: clean,
            period_id: selectedPeriodId && selectedPeriodId > 0 ? selectedPeriodId : undefined,
          },
          { signal: controller.signal }
        );
        if (controller.signal.aborted || !mountedRef.current) return;

        const d = res.data || {};
        const item: ScannedStudent = {
          student_id: d.student_id,
          student_name: d.student_name,
          lrn: d.lrn,
          section: d.section,
          status: d.status || 'PRESENT',
          scanned_at: d.scanned_at,
          photo_url: isSafeImageUrl(d.photo_url) ? d.photo_url : null,
          attendance_note: d.attendance_note,
          is_duplicate: Boolean(d.is_duplicate),
        };

        setActiveStudent(item);
        if (soundEnabled) playFeedbackChime(item.is_duplicate ? 'WARNING' : 'SUCCESS');
        if (!item.is_duplicate) {
          setSessionList((prev) => [item, ...prev.filter((p) => p.lrn !== item.lrn)]);
        }
      } catch (err: unknown) {
        const netErr = err as { name?: string; code?: string; response?: unknown };
        if (
          controller.signal.aborted ||
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
            },
          ];
          try {
            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQueue));
          } catch {
            // Ignore storage quota error
          }
          setOfflineQueue(nextQueue);
          if (soundEnabled) playFeedbackChime('WARNING');
          showAlert({
            title: 'Saved to Offline Queue',
            message: `Internet unavailable. Queued "${clean.slice(0, 20)}" for automatic sync.`,
            type: 'info',
          });
        } else {
          if (soundEnabled) playFeedbackChime('ERROR');
          showAlert({ title: 'Scan Rejected', message: extractApiError(err), type: 'warning' });
        }
      } finally {
        loadingRef.current = false;
        if (mountedRef.current && !controller.signal.aborted) {
          setLoading(false);
          setInputCode('');
          if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
          focusTimerRef.current = setTimeout(() => {
            inputRef.current?.focus();
          }, 40);
        }
      }
    },
    [selectedPeriodId, soundEnabled, showAlert]
  );

  processScanRef.current = handleProcessScan;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' && document.activeElement !== inputRef.current) return;
      const now = Date.now();
      if (now - lastKeyTime.current > 120) keyBuffer.current = '';
      lastKeyTime.current = now;
      if (e.key === 'Enter' && keyBuffer.current.length >= 4) {
        e.preventDefault();
        void processScanRef.current(keyBuffer.current);
        keyBuffer.current = '';
      } else if (e.key.length === 1 && keyBuffer.current.length < MAX_QR_INPUT_LENGTH) {
        const ch = e.key.replace(/[\u0000-\u001F\u007F<>]/g, '');
        if (ch) keyBuffer.current += ch;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Stable camera lifecycle: depends ONLY on scannerMode so scans never restart the webcam
  useEffect(() => {
    if (scannerMode !== 'CAMERA') {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (cameraCooldownTimerRef.current) clearTimeout(cameraCooldownTimerRef.current);
      return;
    }

    setCameraMessage(null);
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        if ('BarcodeDetector' in window) {
          const Detector = (
            window as unknown as {
              BarcodeDetector: new (opts: { formats: string[] }) => {
                detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
              };
            }
          ).BarcodeDetector;
          const detector = new Detector({ formats: ['qr_code', 'code_128'] });
          const tick = async () => {
            if (!active) return;
            if (videoRef.current && videoRef.current.readyState >= 2 && !loadingRef.current) {
              const codes = await detector.detect(videoRef.current).catch(() => []);
              if (codes[0]?.rawValue) {
                await processScanRef.current(codes[0].rawValue);
                await new Promise<void>((resolve) => {
                  if (cameraCooldownTimerRef.current) clearTimeout(cameraCooldownTimerRef.current);
                  cameraCooldownTimerRef.current = setTimeout(resolve, 1300);
                });
              }
            }
            if (active) frameRef.current = requestAnimationFrame(tick);
          };
          frameRef.current = requestAnimationFrame(tick);
        }
      })
      .catch(() => {
        if (active) {
          setCameraMessage('Camera permission denied. Allow camera access in your browser bar or use USB Scanner mode.');
        }
      });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (cameraCooldownTimerRef.current) clearTimeout(cameraCooldownTimerRef.current);
    };
  }, [scannerMode]);

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
            <ControlSwitch
              options={[
                { value: 'USB_GUN', label: 'USB QR Scanner', icon: <HardDrive size={14} /> },
                { value: 'CAMERA', label: 'Device Camera', icon: <Camera size={14} /> },
              ]}
              value={scannerMode}
              onChange={setScannerMode}
            />

            {periods.length > 0 && (
              <select
                aria-label="Select class period"
                value={selectedPeriodId || ''}
                onChange={(e) => setSelectedPeriodId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...ui.input, width: 'auto', minWidth: 220, padding: '6px 10px' }}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.grade_level} - {p.name} • {p.subject_code || p.subject_title} ({p.time_display || 'Active'})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {offlineQueue.length > 0 && (
              <button type="button" onClick={syncOfflineScans} disabled={syncingOffline} style={ui.btnPrimary}>
                <CloudUpload size={14} /> Sync Offline ({offlineQueue.length})
              </button>
            )}

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
            {scannerMode === 'USB_GUN' ? (
              <div onClick={() => inputRef.current?.focus()} style={{ ...ui.card, textAlign: 'center', padding: 24, cursor: 'text' }}>
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: '50%',
                    backgroundColor: tokens.primaryLight,
                    color: brand.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                  }}
                >
                  <Scan size={26} />
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary }}>USB QR Scanner Ready</div>
                <p style={{ fontSize: '0.76rem', color: tokens.textSecondary, margin: '6px auto 14px', maxWidth: 400 }}>
                  Scan an official signed student QR ID card below.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleProcessScan(inputCode);
                  }}
                  style={{ display: 'flex', gap: 8 }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    maxLength={MAX_QR_INPUT_LENGTH}
                    value={inputCode}
                    onChange={(e) => setInputCode(sanitizeQrInput(e.target.value))}
                    placeholder="Scan signed QR card..."
                    style={{ ...ui.input, fontFamily: 'monospace' }}
                  />
                  <button type="submit" disabled={loading || !inputCode.trim()} style={ui.btnPrimary}>
                    {loading ? '...' : 'Verify'}
                  </button>
                </form>
              </div>
            ) : (
              <div style={ui.card}>
                {cameraMessage ? (
                  <div style={{ ...ui.subtleBox, color: brand.warning }}>{cameraMessage}</div>
                ) : (
                  <div
                    style={{
                      position: 'relative',
                      height: 260,
                      backgroundColor: '#0f172a',
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
                        width: 165,
                        height: 165,
                        border: `2px solid ${brand.primary}`,
                        borderRadius: 12,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {activeStudent ? (
              <div
                key="verified-student-card"
                style={{
                  ...ui.card,
                  borderLeftWidth: 5,
                  borderLeftStyle: 'solid',
                  borderLeftColor: activeStudent.is_duplicate ? brand.warning : brand.success,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '1.02rem', fontWeight: 900, color: tokens.textPrimary }}>
                      {activeStudent.student_name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: brand.primary, fontWeight: 700, marginTop: 2 }}>
                      LRN: {activeStudent.lrn} &bull; {activeStudent.section}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: tokens.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={12} /> {activeStudent.scanned_at}
                    </div>
                  </div>
                  <span
                    style={ui.badge(
                      activeStudent.is_duplicate ? tokens.warningLight : tokens.successLight,
                      activeStudent.is_duplicate ? brand.warning : brand.success
                    )}
                  >
                    {activeStudent.is_duplicate ? 'DUPLICATE' : activeStudent.status}
                  </span>
                </div>
                {activeStudent.attendance_note && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTopWidth: 1,
                      borderTopStyle: 'dashed',
                      borderTopColor: tokens.borderSubtle,
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: activeStudent.attendance_note.includes('CUTTING') ? brand.danger : brand.success,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <ShieldCheck size={14} /> {activeStudent.attendance_note}
                  </div>
                )}
              </div>
            ) : (
              <div
                key="waiting-scan-card"
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
                  Waiting for First QR Scan
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
                <div style={{ margin: 'auto', textAlign: 'center', color: tokens.textMuted, fontSize: '0.78rem' }}>
                  <Info size={22} style={{ margin: '0 auto 6px', display: 'block' }} /> Scanned students appear here live.
                </div>
              ) : (
                sessionList.map((item, idx) => (
                  <div key={`${item.lrn}-${idx}`} style={{ ...ui.subtleBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.82rem', color: tokens.textPrimary }}>
                        #{idx + 1} {item.student_name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>
                        LRN: {item.lrn} &bull; {item.section}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={ui.badge(tokens.successLight, brand.success)}>
                        <CheckCircle2 size={11} /> {item.status}
                      </span>
                      <div style={{ fontSize: '0.64rem', color: tokens.textMuted, marginTop: 2 }}>{item.scanned_at}</div>
                    </div>
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