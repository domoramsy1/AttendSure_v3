/**
 * AttendSure - Top Navigation Header & Official Teacher ID Pass Modal
 * File: web/src/components/layout/Header.tsx
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { QR_COLORS } from '../../theme/tokens';
import { canViewTab, getCurrentUserFromStorage } from '../../utils/permissions';
import { useCopyFeedback } from '../../utils/clipboard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { QrCodeSvg, buildQrSvgDataUri } from '../common/QrCodeSvg';
import { PageSetupModal } from '../common/PageSetupModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  exportElementToLocalPdf,
  printHtmlWithPageSetup,
} from '../../utils/reportExporters';
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  type PageSetupConfig,
} from '../../types/pageSetup';
import { escapeHtml } from '../../api/routes';
import {
  requestBrowserAlertPermission,
  type AlarmKind,
} from '../../utils/scheduleAlarms';
import type { NavItemKey } from './Sidebar';
import type { UserSession } from '../../types/section';
import {
  Sun,
  Moon,
  Bell,
  BellOff,
  Volume2,
  QrCode,
  ShieldCheck,
  Printer,
  Download,
  SlidersHorizontal,
  Copy,
  Check,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Building2,
} from 'lucide-react';

export type TabBadgeCounts = Partial<Record<NavItemKey, number>>;

export interface HeaderProps {
  title: string;
  isSystemOnline: boolean;
  session: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  badgeCounts?: TabBadgeCounts;
  alarmsEnabled?: boolean;
  onToggleAlarms?: (next: boolean) => void;
  onTestAlarm?: (kind: AlarmKind) => void;
  onLogout: () => void;
  onNavigateTab: (tab: NavItemKey) => void;
  onOpenProfile: () => void;
}

interface CurrentUserAccountData {
  id?: number;
  username?: string;
  employee_id?: string | null;
  position?: string | null;
  department?: string | null;
  qr_payload?: string | null;
}

const sanitizePlainText = (raw: unknown, maxLen = 100): string =>
  String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLen);

export const Header: React.FC<HeaderProps> = ({
  title,
  isSystemOnline,
  session,
  userPhoto,
  schoolName,
  schoolId,
  alarmsEnabled = true,
  onToggleAlarms,
  onTestAlarm,
  onLogout,
  onNavigateTab,
  onOpenProfile,
}) => {
  const themeCtx = useTheme();
  const { mode, tokens, brand, fonts, ui } = themeCtx;

  const handleToggleTheme = useCallback(() => {
    const rawTheme = themeCtx as unknown as Record<string, unknown>;
    if (typeof rawTheme.toggleTheme === 'function') {
      (rawTheme.toggleTheme as () => void)();
    } else if (typeof rawTheme.toggleMode === 'function') {
      (rawTheme.toggleMode as () => void)();
    } else if (typeof rawTheme.setMode === 'function') {
      (rawTheme.setMode as (next: 'light' | 'dark') => void)(mode === 'dark' ? 'light' : 'dark');
    }
  }, [themeCtx, mode]);

  const [isPassModalOpen, setIsPassModalOpen] = useState<boolean>(false);
  const [isPassPageSetupOpen, setIsPassPageSetupOpen] = useState<boolean>(false);
  const [savingPassPdf, setSavingPassPdf] = useState<boolean>(false);
  const [passPageConfig, setPassPageConfig] = useState<PageSetupConfig>({
    ...DEFAULT_PAGE_SETUP,
    layoutMode: 'pages',
    orientation: 'portrait',
    paperSize: 'letter',
    pageColor: QR_COLORS.background,
    marginPreset: 'narrow',
    margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
    headerRepeat: 'first_page_only',
  });
  const passCardRef = useRef<HTMLDivElement>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isAlarmMenuOpen, setIsAlarmMenuOpen] = useState<boolean>(false);
  const [alertPermState, setAlertPermState] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });
  const { copied: copiedId, copy } = useCopyFeedback();

  const cachedMe = peekApiCache<CurrentUserAccountData>(API_ROUTES.accounts.me);
  const [accountMeta, setAccountMeta] = useState<CurrentUserAccountData | null>(cachedMe || null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const alarmMenuRef = useRef<HTMLDivElement>(null);

  const roleUpper = useMemo(
    () =>
      sanitizePlainText(session?.role || localStorage.getItem('attendsure_role') || 'TEACHER', 30).toUpperCase(),
    [session?.role]
  );

  const canOpenSettings = canViewTab(
    { ...getCurrentUserFromStorage(), role: roleUpper },
    'settings'
  );

  useEffect(() => {
    if (!session?.token) return;
    const controller = new AbortController();
    apiClient
      .get<CurrentUserAccountData>(API_ROUTES.accounts.me, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted && res.data) {
          setAccountMeta(res.data);
        }
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }, [session?.token]);

  useEffect(() => {
    if (!isUserMenuOpen && !isAlarmMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (alarmMenuRef.current && !alarmMenuRef.current.contains(event.target as Node)) {
        setIsAlarmMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsAlarmMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isUserMenuOpen, isAlarmMenuOpen]);

  const displaySchoolName = sanitizePlainText(schoolName, 140) || 'AttendSure Campus';
  const displaySchoolId = sanitizePlainText(schoolId, 30);
  const displayUserName =
    sanitizePlainText(session?.teacher_name || session?.username, 100) || 'Teacher';

  const badgeIdValue = useMemo(() => {
    const empId = sanitizePlainText(accountMeta?.employee_id, 40);
    if (empId) return empId;
    const uname = sanitizePlainText(accountMeta?.username || session?.username, 40);
    return uname || `STAFF-${session?.user_id || 1}`;
  }, [accountMeta, session?.username, session?.user_id]);

  const qrBadgeValue = useMemo(() => {
    const signed = sanitizePlainText(accountMeta?.qr_payload, 240);
    if (signed) return signed;
    return `ATTENDSURE:TEACHER:${badgeIdValue}`;
  }, [accountMeta?.qr_payload, badgeIdValue]);

  const handleCopyIdentifier = async () => {
    if (!badgeIdValue) return;
    await copy(badgeIdValue, 'id');
  };

  const cleanHeaderTitle = useMemo(() => {
    const prefix = displaySchoolName ? `${displaySchoolName} • ` : '';
    return title.startsWith(prefix) ? title.slice(prefix.length) : title;
  }, [title, displaySchoolName]);

  return (
    <>
      <header
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 20px',
          backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 800,
              color: tokens.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {cleanHeaderTitle}
          </h1>
          <div
            style={{
              fontSize: '0.72rem',
              color: tokens.textSecondary,
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span>{displaySchoolName}</span>
            <span>&bull;</span>
            <span>School ID: {displaySchoolId || '—'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            title="Philippine Department of Education School Operations Mode"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 11px',
              borderRadius: 999,
              border: `1px solid ${brand.success}`,
              backgroundColor: tokens.successLight,
              color: brand.success,
              fontSize: '0.73rem',
              fontWeight: 800,
            }}
          >
            <Building2 size={13} />
            <span>DepEd PH</span>
          </div>

          <button
            type="button"
            onClick={() => setIsPassModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 11px',
              borderRadius: 8,
              border: `1px solid ${tokens.borderStrong}`,
              backgroundColor: tokens.bgSurfaceSubtle,
              color: brand.primary,
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <QrCode size={14} />
            <span>My ID Pass</span>
          </button>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 999,
              backgroundColor: isSystemOnline ? tokens.successLight : tokens.dangerLight,
              border: `1px solid ${isSystemOnline ? brand.success : brand.danger}`,
              color: isSystemOnline ? brand.success : brand.danger,
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: isSystemOnline ? brand.success : brand.danger,
              }}
            />
            <span>{isSystemOnline ? 'Online' : 'Offline'}</span>
          </div>

          <div ref={alarmMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              aria-label="Schedule and Time In / Out alarms"
              title="Schedule & Teacher Time In / Out Alarms"
              onClick={() => setIsAlarmMenuOpen((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: `1px solid ${alarmsEnabled ? brand.primary : tokens.borderStrong}`,
                backgroundColor: alarmsEnabled ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                color: alarmsEnabled ? brand.primary : tokens.textMuted,
                fontSize: '0.73rem',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {alarmsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              <span>{alarmsEnabled ? 'Alarms On' : 'Muted'}</span>
            </button>

            {isAlarmMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 268,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: tokens.bgSurface,
                  border: `1px solid ${tokens.borderStrong}`,
                  boxShadow: tokens.cardShadow,
                  zIndex: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 900, color: tokens.textPrimary }}>
                      Alarm Sound &amp; Popups
                    </div>
                    <div style={{ fontSize: '0.68rem', color: tokens.textSecondary }}>
                      Teacher Time In/Out &amp; Class Periods
                    </div>
                  </div>
                  {onToggleAlarms && (
                    <button
                      type="button"
                      onClick={() => onToggleAlarms(!alarmsEnabled)}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 999,
                        border: `1px solid ${alarmsEnabled ? brand.success : tokens.borderStrong}`,
                        backgroundColor: alarmsEnabled ? tokens.successLight : tokens.bgSurfaceSubtle,
                        color: alarmsEnabled ? brand.success : tokens.textSecondary,
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {alarmsEnabled ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>

                {alertPermState !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const nextPerm = await requestBrowserAlertPermission();
                      setAlertPermState(nextPerm);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: `1px solid ${tokens.borderSubtle}`,
                      backgroundColor:
                        alertPermState === 'granted' ? tokens.successLight : tokens.bgSurfaceSubtle,
                      color: alertPermState === 'granted' ? brand.success : tokens.textPrimary,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    <Bell size={13} />
                    <span>
                      {alertPermState === 'granted'
                        ? 'Desktop Popup Alerts Allowed'
                        : alertPermState === 'denied'
                          ? 'Desktop Popups Blocked in Browser'
                          : 'Allow Desktop Popup Alerts'}
                    </span>
                  </button>
                )}

                {onTestAlarm && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      style={{
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        color: tokens.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Test Device Sound &amp; Popup
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAlarmMenuOpen(false);
                        onTestAlarm('TIME_IN');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: `1px solid ${tokens.borderSubtle}`,
                        backgroundColor: tokens.successLight,
                        color: brand.success,
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <Volume2 size={14} />
                      <span>Test Teacher TIME IN Alarm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAlarmMenuOpen(false);
                        onTestAlarm('TIME_OUT');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: `1px solid ${tokens.borderSubtle}`,
                        backgroundColor: tokens.warningLight,
                        color: brand.warning,
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <Volume2 size={14} />
                      <span>Test Teacher TIME OUT Alarm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAlarmMenuOpen(false);
                        onTestAlarm('CLASS_PERIOD');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: 8,
                        border: `1px solid ${tokens.borderSubtle}`,
                        backgroundColor: tokens.primaryLight,
                        color: brand.primary,
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <Volume2 size={14} />
                      <span>Test Class Period Alarm</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Switch color theme"
            onClick={handleToggleTheme}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 8,
              border: `1px solid ${tokens.borderStrong}`,
              backgroundColor: tokens.bgSurfaceSubtle,
              color: tokens.textPrimary,
              cursor: 'pointer',
            }}
          >
            {mode === 'dark' ? (
              <Sun size={15} color={brand.warning} />
            ) : (
              <Moon size={15} color={brand.primary} />
            )}
          </button>

          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 10,
                border: `1px solid ${tokens.borderSubtle}`,
                backgroundColor: tokens.bgSurfaceSubtle,
                cursor: 'pointer',
              }}
            >
              <ProfileAvatar photoUrl={userPhoto} name={displayUserName} size={30} iconSize={15} />
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {displayUserName}
                </div>
                <div style={{ fontSize: '0.64rem', fontWeight: 700, color: tokens.textMuted }}>
                  {roleUpper}
                </div>
              </div>
              <ChevronDown size={13} color={tokens.textMuted} />
            </button>

            {isUserMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 60,
                  minWidth: 200,
                  backgroundColor: tokens.bgSurface,
                  border: `1px solid ${tokens.borderStrong}`,
                  borderRadius: 10,
                  boxShadow: tokens.cardShadow,
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onOpenProfile();
                  }}
                  style={{
                    ...ui.btnSecondary,
                    border: 'none',
                    justifyContent: 'flex-start',
                    backgroundColor: 'transparent',
                  }}
                >
                  <User size={14} color={brand.primary} />
                  <span>My Profile</span>
                </button>

                {canOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onNavigateTab('settings');
                    }}
                    style={{
                      ...ui.btnSecondary,
                      border: 'none',
                      justifyContent: 'flex-start',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <Settings size={14} color={tokens.textSecondary} />
                    <span>System Settings</span>
                  </button>
                )}

                <div style={{ height: 1, backgroundColor: tokens.borderSubtle, margin: '4px 0' }} />

                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                  style={{
                    ...ui.btnSecondary,
                    border: 'none',
                    justifyContent: 'flex-start',
                    backgroundColor: 'transparent',
                    color: brand.danger,
                  }}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <Modal
        isOpen={isPassModalOpen}
        onClose={() => setIsPassModalOpen(false)}
        title="Official Teacher ID Pass"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            ref={passCardRef}
            data-print-page="true"
            style={{
              width: 300,
              backgroundColor: tokens.bgSurface,
              borderWidth: 2,
              borderStyle: 'solid',
              borderColor: brand.primary,
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: tokens.cardShadow,
            }}
          >
            <div style={{ backgroundColor: brand.buttonBg, color: tokens.onPrimary, padding: '12px 14px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: fonts.size.xs,
                  fontWeight: 800,
                  letterSpacing: '0.4px',
                }}
              >
                <ShieldCheck size={15} />
                <span>ATTENDSURE TEACHER PASS</span>
              </div>
              <div style={{ fontSize: '0.68rem', opacity: 0.92, marginTop: 2 }}>
                {displaySchoolName}
              </div>
            </div>

            <div style={{ padding: '18px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <ProfileAvatar photoUrl={userPhoto} name={displayUserName} size={62} iconSize={28} />
              </div>

              <div style={{ fontSize: '1.02rem', fontWeight: 800, color: tokens.textPrimary }}>
                {displayUserName}
              </div>

              <div style={{ fontSize: '0.75rem', color: tokens.textSecondary, marginTop: 2 }}>
                {accountMeta?.position ? `${accountMeta.position} • ` : `${roleUpper} • `}
                {displaySchoolName}
              </div>

              <div
                style={{
                  marginTop: 10,
                  marginBottom: 12,
                  padding: '4px 10px',
                  backgroundColor: tokens.bgSurfaceSubtle,
                  border: `1px solid ${tokens.borderStrong}`,
                  borderRadius: 8,
                  fontFamily: fonts.mono,
                  fontWeight: 800,
                  fontSize: '0.76rem',
                  color: tokens.textPrimary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>Employee ID: {badgeIdValue}</span>
                <button
                  type="button"
                  onClick={() => void handleCopyIdentifier()}
                  title="Copy Employee ID"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {copiedId ? (
                    <Check size={13} color={brand.success} />
                  ) : (
                    <Copy size={13} color={tokens.textMuted} />
                  )}
                </button>
              </div>

              <div
                style={{
                  width: 136,
                  height: 136,
                  margin: '0 auto',
                  padding: 8,
                  backgroundColor: QR_COLORS.background,
                  border: `1px solid ${tokens.borderSubtle}`,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <QrCodeSvg
                  value={qrBadgeValue}
                  size={120}
                  label={`Official QR pass for ${displayUserName}`}
                />
              </div>
            </div>

            <div
              style={{
                padding: '8px 12px',
                backgroundColor: tokens.bgSurfaceSubtle,
                borderTop: `1px solid ${tokens.borderSubtle}`,
                fontSize: '0.68rem',
                color: tokens.textSecondary,
                fontWeight: 700,
              }}
            >
              Phone Fingerprint / Biometric &amp; Campus GPS:{' '}
              <strong style={{ color: brand.success }}>Active</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={() => setIsPassPageSetupOpen(true)}
              icon={<SlidersHorizontal size={13} />}
            >
              Page Setup
            </Button>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              disabled={savingPassPdf}
              onClick={async () => {
                if (!passCardRef.current) return;
                setSavingPassPdf(true);
                try {
                  const p = PAPER_SIZES[passPageConfig.paperSize] || PAPER_SIZES.letter;
                  const isLand = passPageConfig.orientation === 'landscape';
                  const safeName = displayUserName.replace(/[^a-zA-Z0-9]/g, '_') || 'Teacher';
                  await exportElementToLocalPdf({
                    element: passCardRef.current,
                    filename: `AttendSure_Teacher_Pass_${safeName}.pdf`,
                    pageWidthInches: isLand ? p.height : p.width,
                    pageHeightInches: isLand ? p.width : p.height,
                    orientation: passPageConfig.orientation,
                    pageColor: passPageConfig.pageColor,
                    pageless: passPageConfig.layoutMode === 'pageless',
                    marginsInches: [
                      passPageConfig.margins.top,
                      passPageConfig.margins.right,
                      passPageConfig.margins.bottom,
                      passPageConfig.margins.left,
                    ],
                  });
                } finally {
                  setSavingPassPdf(false);
                }
              }}
              icon={<Download size={13} />}
            >
              {savingPassPdf ? 'Saving...' : 'Save PDF'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() => {
                const qrUri = buildQrSvgDataUri(qrBadgeValue, 180);
                printHtmlWithPageSetup({
                  title: `AttendSure Teacher Pass - ${displayUserName}`,
                  pageConfig: passPageConfig,
                  bodyHtml: `
                    <div class="print-pack-page" data-print-page="true" style="display:flex;justify-content:center;padding-top:12px;">
                      <div class="id-pass-card" style="width:300px;border:2px solid ${brand.primary};border-radius:14px;overflow:hidden;text-align:center;background:${QR_COLORS.background};">
                        <div style="background:${brand.primary};color:${QR_COLORS.background};padding:12px;">
                          <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;">ATTENDSURE TEACHER PASS</div>
                          <div style="font-size:10px;opacity:0.92;margin-top:2px;">${escapeHtml(displaySchoolName)}</div>
                        </div>
                        <div style="padding:16px;">
                          <div style="font-size:16px;font-weight:800;color:${QR_COLORS.foreground};">${escapeHtml(displayUserName)}</div>
                          <div style="font-size:12px;margin-top:3px;color:${QR_COLORS.foreground};">${escapeHtml(accountMeta?.position || roleUpper)}</div>
                          <div style="display:inline-block;margin:10px auto;padding:4px 10px;border-radius:6px;border:1px solid ${tokens.borderStrong};font-family:monospace;font-size:12px;font-weight:700;">ID: ${escapeHtml(badgeIdValue)}</div>
                          <div style="width:144px;height:144px;margin:6px auto 0;padding:6px;border:1px solid ${tokens.borderStrong};border-radius:10px;background:${QR_COLORS.background};">
                            <img src="${qrUri}" alt="QR Code" style="width:100%;height:100%;display:block;" />
                          </div>
                        </div>
                      </div>
                    </div>`,
                });
              }}
              icon={<Printer size={13} />}
            >
              Print Pass
            </Button>
            <Button variant="secondary" size="sm" type="button" onClick={() => setIsPassModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>

        <PageSetupModal
          isOpen={isPassPageSetupOpen}
          onClose={() => setIsPassPageSetupOpen(false)}
          currentConfig={passPageConfig}
          onLiveChange={setPassPageConfig}
          onApply={(cfg) => setPassPageConfig(cfg)}
          reportTitle="Teacher ID Pass"
        />
      </Modal>
    </>
  );
};

export default Header;
