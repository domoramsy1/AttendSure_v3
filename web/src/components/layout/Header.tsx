/**
 * AttendSure - Top Navigation Header & Role-Aware Official Pass Modal
 * File: web/src/components/layout/Header.tsx
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useCompliance } from '../../context/ComplianceContext';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { NavItemKey } from './Sidebar';
import type { UserSession } from '../../types/section';
import {
  Bell,
  Sun,
  Moon,
  QrCode,
  ShieldCheck,
  Printer,
  Copy,
  Check,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Globe2,
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
  onLogout: () => void;
  onNavigateTab: (tab: NavItemKey) => void;
  onOpenProfile: () => void;
}

interface CurrentUserAccountData {
  id?: number;
  username?: string;
  employee_id?: string | null;
  lrn?: string | null;
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
  onLogout,
  onNavigateTab,
  onOpenProfile,
}) => {
  const themeCtx = useTheme();
  const { mode, tokens, brand, fonts, ui } = themeCtx;
  const complianceCtx = useCompliance() as unknown as Record<string, unknown>;

  const activeComplianceMode = useMemo(() => {
    const raw =
      complianceCtx.standard ??
      complianceCtx.complianceMode ??
      complianceCtx.regionMode ??
      complianceCtx.mode ??
      'DEPED_PH';
    return String(raw).toUpperCase().includes('GLOBAL') ? 'GLOBAL' : 'DEPED_PH';
  }, [complianceCtx]);

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

  const handleToggleCompliance = useCallback(() => {
    const next = activeComplianceMode === 'DEPED_PH' ? 'GLOBAL' : 'DEPED_PH';
    if (typeof complianceCtx.toggleStandard === 'function') {
      (complianceCtx.toggleStandard as () => void)();
    } else if (typeof complianceCtx.toggleMode === 'function') {
      (complianceCtx.toggleMode as () => void)();
    } else if (typeof complianceCtx.setStandard === 'function') {
      (complianceCtx.setStandard as (val: string) => void)(next);
    } else if (typeof complianceCtx.setComplianceMode === 'function') {
      (complianceCtx.setComplianceMode as (val: string) => void)(next);
    } else if (typeof complianceCtx.setMode === 'function') {
      (complianceCtx.setMode as (val: string) => void)(next);
    }
  }, [complianceCtx, activeComplianceMode]);

  const [isPassModalOpen, setIsPassModalOpen] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const cachedMe = peekApiCache<CurrentUserAccountData>(API_ROUTES.accounts.me);
  const [accountMeta, setAccountMeta] = useState<CurrentUserAccountData | null>(cachedMe || null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roleUpper = useMemo(
    () =>
      sanitizePlainText(
        session?.role || localStorage.getItem('attendsure_role') || 'FACULTY',
        30
      ).toUpperCase(),
    [session?.role]
  );

  const isStudentAccount = roleUpper === 'STUDENT';
  const canOpenSettings = ['SUPERADMIN', 'ADMIN', 'FACULTY_ADMIN', 'PRINCIPAL'].includes(roleUpper);

  const fetchAccountAndAlerts = useCallback(
    async (signal?: AbortSignal) => {
      if (!session?.token) return;

      const [meRes, notifRes] = await Promise.allSettled([
        apiClient.get<CurrentUserAccountData>(API_ROUTES.accounts.me, { signal }),
        apiClient.get(API_ROUTES.messaging.notifications, {
          params: { page_size: 20 },
          signal,
        }),
      ]);

      if (signal?.aborted) return;

      if (meRes.status === 'fulfilled' && meRes.value?.data) {
        setAccountMeta(meRes.value.data);
      }

      if (notifRes.status === 'fulfilled' && notifRes.value?.data) {
        const payload = notifRes.value.data;
        const items: Array<{ is_read?: boolean }> = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.results)
            ? payload.results
            : [];
        const unread =
          typeof payload?.unread_count === 'number'
            ? payload.unread_count
            : items.filter((item) => item && item.is_read === false).length;
        setUnreadCount(unread);
      }
    },
    [session?.token]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchAccountAndAlerts(controller.signal);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchAccountAndAlerts();
      }
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, [fetchAccountAndAlerts]);

  useEffect(() => {
    if (!isUserMenuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isUserMenuOpen]);

  const displaySchoolName = sanitizePlainText(schoolName, 140) || 'AttendSure Campus';
  const displaySchoolId = sanitizePlainText(schoolId, 30);
  const displayUserName =
    sanitizePlainText(session?.faculty_name || session?.username, 100) || 'Staff Member';

  // Strictly separate Student LRN vs Staff Employee ID
  const badgeIdLabel = isStudentAccount ? 'LRN' : 'Employee ID';
  const badgeIdValue = useMemo(() => {
    if (isStudentAccount) {
      return sanitizePlainText(accountMeta?.lrn || session?.username, 30) || 'Unassigned';
    }
    const empId = sanitizePlainText(accountMeta?.employee_id, 40);
    if (empId) return empId;
    const uname = sanitizePlainText(accountMeta?.username || session?.username, 40);
    return uname || `STAFF-${session?.user_id || 1}`;
  }, [isStudentAccount, accountMeta, session?.username, session?.user_id]);

  const qrBadgeValue = useMemo(() => {
    const signed = sanitizePlainText(accountMeta?.qr_payload, 240);
    if (signed) return signed;
    return isStudentAccount
      ? `ATTENDSURE:STUDENT:${badgeIdValue}`
      : `ATTENDSURE:FACULTY:${badgeIdValue}`;
  }, [accountMeta?.qr_payload, isStudentAccount, badgeIdValue]);

  const handleCopyIdentifier = async () => {
    if (!badgeIdValue) return;
    try {
      await navigator.clipboard.writeText(badgeIdValue);
      setCopiedId(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedId(false);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // Ignore clipboard permission denial
    }
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
          <button
            type="button"
            onClick={handleToggleCompliance}
            title="Switch reporting standard between DepEd PH and Global Ed-Fi"
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
              cursor: 'pointer',
            }}
          >
            <Globe2 size={13} />
            <span>{activeComplianceMode === 'DEPED_PH' ? 'DepEd PH' : 'Global Ed-Fi'}</span>
          </button>

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
            <span>My Pass</span>
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
              <Sun size={15} color="#f59e0b" />
            ) : (
              <Moon size={15} color={brand.primary} />
            )}
          </button>

          <button
            type="button"
            aria-label="View push alerts"
            onClick={() => onNavigateTab('push')}
            style={{
              position: 'relative',
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
            <Bell size={15} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 999,
                  backgroundColor: brand.danger,
                  color: '#ffffff',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
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
                    <span>School Settings</span>
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
        title={isStudentAccount ? 'Official Student QR ID Pass' : 'Official Faculty & Staff ID Pass'}
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
            <div style={{ backgroundColor: brand.buttonBg, color: '#ffffff', padding: '12px 14px' }}>
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
                <span>
                  {isStudentAccount ? 'ATTENDSURE STUDENT PASS' : 'ATTENDSURE STAFF PASS'}
                </span>
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
                <span>
                  {badgeIdLabel}: {badgeIdValue}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyIdentifier()}
                  title={`Copy ${badgeIdLabel}`}
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
                  backgroundColor: '#ffffff',
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
              {isStudentAccount ? (
                <span>
                  Classroom USB QR Verification:{' '}
                  <strong style={{ color: brand.success }}>Active</strong>
                </span>
              ) : (
                <span>
                  Mobile GPS &amp; Face Check Account:{' '}
                  <strong style={{ color: brand.success }}>Active</strong>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" type="button" onClick={() => setIsPassModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={() => window.print()}
              icon={<Printer size={14} />}
            >
              Print Pass
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Header;