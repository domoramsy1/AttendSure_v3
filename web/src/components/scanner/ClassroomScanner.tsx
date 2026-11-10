/**
 * AttendSure V3 - Institutional Classroom Attendance Scanner
 * File: web/src/components/scanner/ClassroomScanner.tsx
 * Supports: All Device Cameras, USB/OTG Barcode Guns, and Manual Entry.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
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
} from 'lucide-react';

export interface ScannedStudent {
  student_id: number;
  student_name: string;
  lrn: string;
  section: string;
  status: string;
  authorization_role: string;
  scanned_at: string;
  photo_url?: string | null;
  gate_status_note?: string;
  is_duplicate?: boolean;
}

export interface ClassroomScannerProps {
  onClose?: () => void;
  isModal?: boolean;
}

// 1. Web Audio API Feedback Chime
const playFeedbackChime = (type: 'SUCCESS' | 'WARNING' | 'ERROR') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'SUCCESS') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.24);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.08);
      osc2.start(ctx.currentTime + 0.08);
      osc2.stop(ctx.currentTime + 0.24);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.32);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    }
  } catch {
    // Audio context suppressed by browser policy
  }
};

const getWorkstationDeviceId = (): string => {
  let id = localStorage.getItem('attendsure_workstation_device_id');
  if (!id) {
    id = `WEB-STATION-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    localStorage.setItem('attendsure_workstation_device_id', id);
  }
  return id;
};

// 2. Student Profile Photo Component with Initials Fallback
interface StudentPhotoProps {
  photoUrl?: string | null;
  name: string;
  size: number;
  borderWidth?: number;
}

const StudentPhoto: React.FC<StudentPhotoProps> = ({
  photoUrl,
  name,
  size,
  borderWidth = 1.5,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [photoUrl]);

  const resolvedUrl = useMemo(() => {
    if (!photoUrl || typeof photoUrl !== 'string') return null;
    const clean = photoUrl.trim();
    if (!clean || clean === 'null' || clean === 'undefined') return null;

    // Replace 0.0.0.0 bind host with browser host
    if (clean.includes('0.0.0.0:8000')) {
      return clean.replace('0.0.0.0:8000', window.location.host);
    }
    return clean;
  }, [photoUrl]);

  const initials = useMemo(() => {
    if (!name) return 'S';
    const cleanName = name.replace(/,/g, '').trim();
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }, [name]);

  if (resolvedUrl && !hasError) {
    return (
      <img
        src={resolvedUrl}
        alt={name}
        onError={() => setHasError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: `${borderWidth}px solid var(--border-subtle, #cbd5e1)`,
          flexShrink: 0,
          backgroundColor: '#f1f5f9',
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: 'rgba(0, 75, 135, 0.12)',
        color: '#004b87',
        border: `${borderWidth}px solid rgba(0, 75, 135, 0.3)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size > 44 ? '1.05rem' : '0.72rem',
        flexShrink: 0,
        letterSpacing: '0.5px',
      }}
      title={name}
    >
      {initials}
    </div>
  );
};

export const ClassroomScanner: React.FC<ClassroomScannerProps> = ({
  onClose,
  isModal = false,
}) => {
  const { tokens, brand } = useTheme();
  const { showAlert } = useAlert();

  const [scannerMode, setScannerMode] = useState<'HARDWARE_OTG' | 'WEBCAM'>('HARDWARE_OTG');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);

  const [activeStudent, setActiveStudent] = useState<ScannedStudent | null>(null);
  const [sessionList, setSessionList] = useState<ScannedStudent[]>([]);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  const keyBuffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Send scan data to backend
  const handleProcessScan = useCallback(
    async (rawCode: string) => {
      const clean = rawCode.trim().replace(/[\r\n]/g, '');
      if (!clean) return;

      setLoading(true);
      try {
        const deviceId = getWorkstationDeviceId();
        const res = await apiClient.post('/academics/classroom-scan/', {
          code: clean,
          device_uuid: deviceId,
        });

        if (res.data?.success) {
          const item: ScannedStudent = {
            student_id: res.data.student_id,
            student_name: res.data.student_name,
            lrn: res.data.lrn,
            section: res.data.section,
            status: res.data.status || 'PRESENT',
            authorization_role: res.data.authorization_role || 'Faculty',
            scanned_at: res.data.scanned_at,
            photo_url: res.data.photo_url || res.data.photo || null,
            gate_status_note: res.data.gate_status_note,
            is_duplicate: Boolean(res.data.is_duplicate),
          };

          setActiveStudent(item);
          if (soundEnabled) {
            playFeedbackChime(item.is_duplicate ? 'WARNING' : 'SUCCESS');
          }

          if (!item.is_duplicate) {
            setSessionList((prev) => [item, ...prev.filter((p) => p.lrn !== item.lrn)]);
          }
        }
      } catch (err: any) {
        if (soundEnabled) playFeedbackChime('ERROR');
        const errorText =
          err?.response?.data?.error ||
          err?.response?.data?.detail ||
          'Attendance validation failed. Check student records.';
        showAlert({
          title: 'Notice',
          message: errorText,
          type: 'warning',
        });
      } finally {
        setLoading(false);
        setInputCode('');
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [soundEnabled, showAlert]
  );

  // Hardware Scanner listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      if (activeTag === 'INPUT' && document.activeElement !== inputRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime.current > 120) {
        keyBuffer.current = '';
      }
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        if (keyBuffer.current.length >= 2) {
          e.preventDefault();
          handleProcessScan(keyBuffer.current);
          keyBuffer.current = '';
        }
      } else if (e.key.length === 1) {
        keyBuffer.current += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleProcessScan]);

  // Open camera on any device
  useEffect(() => {
    if (scannerMode !== 'WEBCAM') {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let isScanning = true;

    const startDeviceCamera = async () => {
      try {
        setCameraMessage(null);

        let stream: MediaStream;
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
          });
        } else {
          const legacyGetUserMedia =
            (navigator as any).webkitGetUserMedia ||
            (navigator as any).mozGetUserMedia ||
            (navigator as any).getUserMedia;

          if (!legacyGetUserMedia) {
            setCameraMessage('Camera not supported on this browser. Use Hardware Gun mode.');
            return;
          }

          stream = await new Promise<MediaStream>((resolve, reject) => {
            legacyGetUserMedia.call(
              navigator,
              { video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } },
              resolve,
              reject
            );
          });
        }

        if (!isScanning) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        if ('BarcodeDetector' in window) {
          const barcodeDetector = new (window as any).BarcodeDetector({
            formats: ['qr_code', 'code_128', 'ean_13'],
          });

          const scanLoop = async () => {
            if (!isScanning || !videoRef.current || videoRef.current.readyState < 2) {
              animFrameRef.current = requestAnimationFrame(scanLoop);
              return;
            }

            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0 && !loading) {
                const raw = barcodes[0].rawValue;
                if (raw) {
                  handleProcessScan(raw);
                  await new Promise((r) => setTimeout(r, 1400));
                }
              }
            } catch {}

            if (isScanning) {
              animFrameRef.current = requestAnimationFrame(scanLoop);
            }
          };

          animFrameRef.current = requestAnimationFrame(scanLoop);
        }
      } catch {
        setCameraMessage(
          'Camera access was not granted by your browser. Please click the camera icon in your address bar and select "Always allow".'
        );
      }
    };

    startDeviceCamera();

    return () => {
      isScanning = false;
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
        cameraStreamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [scannerMode, loading, handleProcessScan]);

  const sessionStats = useMemo(() => {
    const total = sessionList.length;
    const present = sessionList.filter((s) => s.status === 'PRESENT').length;
    return { total, present };
  }, [sessionList]);

  // Number position for the currently active student card
  const activeStudentNumber = useMemo(() => {
    if (!activeStudent) return null;
    const foundIndex = sessionList.findIndex((s) => s.lrn === activeStudent.lrn);
    if (foundIndex >= 0) {
      return `#${foundIndex + 1}`;
    }
    return `#${sessionList.length + 1}`;
  }, [activeStudent, sessionList]);

  const containerStyle: React.CSSProperties = isModal
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }
    : {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      };

  const cardStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 16,
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
    width: isModal ? '100%' : 'auto',
    maxWidth: isModal ? 880 : '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* 1. Terminal Controls Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 18px',
            backgroundColor: tokens.bgSurface,
            borderBottom: `1px solid ${tokens.borderSubtle}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setScannerMode('HARDWARE_OTG')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${scannerMode === 'HARDWARE_OTG' ? brand.primary : tokens.borderStrong}`,
                backgroundColor: scannerMode === 'HARDWARE_OTG' ? brand.primary : tokens.bgSurfaceSubtle,
                color: scannerMode === 'HARDWARE_OTG' ? '#ffffff' : tokens.textSecondary,
                transition: 'all 0.15s ease',
              }}
            >
              <HardDrive size={15} />
              <span>USB / OTG Scanner Gun</span>
            </button>

            <button
              type="button"
              onClick={() => setScannerMode('WEBCAM')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${scannerMode === 'WEBCAM' ? brand.primary : tokens.borderStrong}`,
                backgroundColor: scannerMode === 'WEBCAM' ? brand.primary : tokens.bgSurfaceSubtle,
                color: scannerMode === 'WEBCAM' ? '#ffffff' : tokens.textSecondary,
                transition: 'all 0.15s ease',
              }}
            >
              <Camera size={15} />
              <span>Device Camera Scanner</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 20,
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: brand.success,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: brand.success,
                }}
              />
              <span>Scanner Ready</span>
            </div>

            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Turn Off Sound' : 'Turn On Sound'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.bgSurfaceSubtle,
                color: soundEnabled ? brand.primary : tokens.textMuted,
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              {soundEnabled ? <Volume2 size={15} color={brand.primary} /> : <VolumeX size={15} />}
              <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: tokens.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* 2. Main Scan Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1.05fr)',
            gap: 16,
            alignItems: 'start',
            padding: 18,
          }}
        >
          {/* Left Column: Scanner Station & Active Student Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {scannerMode === 'HARDWARE_OTG' ? (
              <div
                onClick={() => inputRef.current?.focus()}
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderRadius: 14,
                  border: `1px solid ${isInputFocused ? brand.primary : tokens.borderSubtle}`,
                  boxShadow: tokens.cardShadow,
                  padding: '24px 22px',
                  textAlign: 'center',
                  cursor: 'text',
                }}
              >
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: tokens.primaryLight,
                    color: brand.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto',
                  }}
                >
                  <Scan size={28} />
                </div>

                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: tokens.textPrimary }}>
                  Barcode Scanner Active
                </div>
                <p
                  style={{
                    fontSize: '0.76rem',
                    color: tokens.textSecondary,
                    maxWidth: 420,
                    margin: '6px auto 16px auto',
                    lineHeight: 1.45,
                  }}
                >
                  Connect your USB or OTG barcode scanner. Pull the trigger on the student ID card.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleProcessScan(inputCode);
                  }}
                  style={{
                    display: 'flex',
                    gap: 8,
                    maxWidth: 440,
                    margin: '0 auto',
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    placeholder="Scan card or enter LRN..."
                    style={{
                      flex: 1,
                      padding: '11px 14px',
                      borderRadius: 8,
                      border: `1px solid ${tokens.borderStrong}`,
                      backgroundColor: tokens.bgSurfaceSubtle,
                      fontSize: '0.86rem',
                      color: tokens.textPrimary,
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'monospace',
                    }}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={loading || !inputCode.trim()}
                    style={{
                      padding: '0 20px',
                      borderRadius: 8,
                      backgroundColor: brand.primary,
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.80rem',
                      cursor: 'pointer',
                    }}
                  >
                    {loading ? '...' : 'Verify'}
                  </button>
                </form>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderRadius: 14,
                  border: `1px solid ${tokens.borderSubtle}`,
                  boxShadow: tokens.cardShadow,
                  padding: 16,
                }}
              >
                {cameraMessage ? (
                  <div
                    style={{
                      backgroundColor: '#eff6ff',
                      borderRadius: 10,
                      border: '1px solid #bfdbfe',
                      padding: '16px 18px',
                      fontSize: '0.78rem',
                      color: '#1e40af',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>How to allow camera on this site:</div>
                    <div>{cameraMessage}</div>
                  </div>
                ) : (
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: 280,
                      backgroundColor: '#0f172a',
                      borderRadius: 10,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <video
                      ref={videoRef}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                      playsInline
                    />
                    <div
                      style={{
                        position: 'absolute',
                        width: 170,
                        height: 170,
                        border: `2px solid ${brand.primary}`,
                        borderRadius: 14,
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                        pointerEvents: 'none',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        backgroundColor: 'rgba(15, 23, 42, 0.8)',
                        color: '#ffffff',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: '0.70rem',
                        fontWeight: 600,
                      }}
                    >
                      Place Student QR Code inside box
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active Verified Student Card (Shows Numbering & Profile Photo) */}
            {activeStudent ? (
              <div
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderRadius: 14,
                  border: `1px solid ${tokens.borderSubtle}`,
                  borderLeft: `5px solid ${activeStudent.is_duplicate ? '#f59e0b' : brand.success}`,
                  boxShadow: tokens.cardShadow,
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Real Student Profile Photo */}
                  <StudentPhoto
                    photoUrl={activeStudent.photo_url}
                    name={activeStudent.student_name}
                    size={62}
                    borderWidth={2}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {activeStudentNumber && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '2px 7px',
                              borderRadius: 6,
                              backgroundColor: tokens.primaryLight,
                              color: brand.primary,
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                            }}
                          >
                            {activeStudentNumber}
                          </span>
                        )}
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: tokens.textPrimary }}>
                          {activeStudent.student_name}
                        </div>
                      </div>

                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: '0.70rem',
                          fontWeight: 800,
                          backgroundColor: activeStudent.is_duplicate ? '#fffbeb' : 'rgba(16, 185, 129, 0.12)',
                          color: activeStudent.is_duplicate ? '#d97706' : brand.success,
                        }}
                      >
                        {activeStudent.is_duplicate ? 'ALREADY TAPPED' : 'PRESENT'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: brand.primary, fontWeight: 700, marginTop: 2 }}>
                      LRN: {activeStudent.lrn} &bull; {activeStudent.section}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: '0.72rem', color: tokens.textMuted }}>
                      <span>
                        Role: <strong style={{ color: tokens.textPrimary }}>{activeStudent.authorization_role}</strong>
                      </span>
                      <span>&bull;</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        <span>{activeStudent.scanned_at}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {activeStudent.gate_status_note && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: `1px dashed ${tokens.borderSubtle}`,
                      fontSize: '0.72rem',
                      color: activeStudent.gate_status_note.includes('FLAGGED') ? brand.danger : brand.success,
                      fontWeight: 600,
                    }}
                  >
                    <ShieldCheck size={14} />
                    <span>{activeStudent.gate_status_note}</span>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: tokens.bgSurface,
                  borderRadius: 14,
                  border: `1px dashed ${tokens.borderStrong}`,
                  padding: '24px 20px',
                  textAlign: 'center',
                }}
              >
                <QrCode size={34} color={tokens.textMuted} style={{ margin: '0 auto' }} />
                <div style={{ fontSize: '0.80rem', fontWeight: 700, color: tokens.textSecondary, marginTop: 8 }}>
                  Ready to Scan Student ID
                </div>
                <div style={{ fontSize: '0.70rem', color: tokens.textMuted, marginTop: 2 }}>
                  Show student ID QR code to camera or use a barcode scanner gun.
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Session Class List with Numbering and Profile Photos */}
          <div
            style={{
              backgroundColor: tokens.bgSurface,
              borderRadius: 14,
              border: `1px solid ${tokens.borderSubtle}`,
              boxShadow: tokens.cardShadow,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: `1px solid ${tokens.borderSubtle}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: tokens.textPrimary, textTransform: 'uppercase' }}>
                  Session Class List
                </div>
                <div style={{ fontSize: '0.70rem', color: tokens.textMuted, marginTop: 1 }}>
                  Total: <strong style={{ color: brand.primary }}>{sessionStats.total}</strong> students
                </div>
              </div>

              {sessionList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSessionList([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '0.72rem',
                    color: brand.danger,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div
              style={{
                height: 390,
                overflowY: 'auto',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxSizing: 'border-box',
              }}
            >
              {sessionList.length > 0 ? (
                sessionList.map((item, idx) => (
                  <div
                    key={`${item.lrn}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 10,
                      backgroundColor: tokens.bgSurfaceSubtle,
                      border: `1px solid ${tokens.borderSubtle}`,
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      {/* Numbering Badge */}
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          backgroundColor: tokens.bgSurface,
                          border: `1px solid ${tokens.borderSubtle}`,
                          color: tokens.textSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          flexShrink: 0,
                        }}
                      >
                        {idx + 1}
                      </div>

                      {/* Student Profile Photo */}
                      <StudentPhoto
                        photoUrl={item.photo_url}
                        name={item.student_name}
                        size={36}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            color: tokens.textPrimary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.student_name}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>
                          LRN: {item.lrn} &bull; {item.section}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 8px',
                          borderRadius: 8,
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          backgroundColor: 'rgba(16, 185, 129, 0.12)',
                          color: brand.success,
                        }}
                      >
                        <CheckCircle2 size={11} />
                        <span>{item.status}</span>
                      </span>
                      <div style={{ fontSize: '0.64rem', color: tokens.textMuted, marginTop: 2 }}>
                        {item.scanned_at}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  <Info size={24} color={tokens.textMuted} style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: '0.80rem', fontWeight: 700, color: tokens.textSecondary }}>
                    No Scans Yet
                  </div>
                  <p style={{ fontSize: '0.70rem', color: tokens.textMuted, maxWidth: 220, margin: '4px 0 0 0' }}>
                    Student IDs scanned will appear here with profile photos and numbers.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassroomScanner;