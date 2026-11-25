/**
 * AttendSure - DepEd School Portal Overview & Staff Role Launcher
 * File: web/src/components/showcase/StartupShowcasePage.tsx
 */

import React, { useEffect, useRef, useState } from 'react';
import apiClient, { clearApiClientCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { useCompliance, LOCALE_OPTIONS, type SupportedLocale } from '../../context/ComplianceContext';
import { isSafeImageUrl, type ThemeMode } from '../../theme/tokens';
import { AttendSureBrandBadge } from '../branding/BrandAssets';
import { ControlSwitch } from '../ui/ControlSwitch';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from '../layout/Sidebar';
import {
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  Cpu,
  FileSpreadsheet,
  Lock,
  LogIn,
  Moon,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Eye,
  Zap,
} from 'lucide-react';

interface DemoRoleOption {
  role: string;
  label: string;
  description: string;
}

interface StartupShowcasePageProps {
  onOpenSignIn: () => void;
  onDemoLoginSuccess: (session: UserSession, targetTab?: NavItemKey) => void;
}

const clearPreviousSessionStorage = (): void => {
  [
    'attendsure_access',
    'attendsure_refresh',
    'attendsure_token',
    'auth_token',
    'token',
    'attendsure_username',
    'attendsure_teacher_name',
    'attendsure_role',
    'attendsure_user_id',
    'attendsure_teacher_id',
    'attendsure_is_superuser',
    'attendsure_user_photo',
    'attendsure_can_teach',
  ].forEach((k) => localStorage.removeItem(k));
};

export const StartupShowcasePage: React.FC<StartupShowcasePageProps> = ({
  onOpenSignIn,
  onDemoLoginSuccess,
}) => {
  const { mode, setThemeMode, tokens, brand, fonts } = useTheme();
  const { school, updateSchoolInstantly, refreshSchool } = useSchool();
  const { locale, setLocale, t } = useCompliance();

  const [demoEnabled, setDemoEnabled] = useState<boolean>(false);
  const [demoRoles, setDemoRoles] = useState<DemoRoleOption[]>([]);
  const [launchingRole, setLaunchingRole] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const loginAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    apiClient
      .get(API_ROUTES.accounts.demoStatus, { timeout: 4000, signal: controller.signal })
      .then((res) => {
        if (!active || controller.signal.aborted || !res.data) return;
        setDemoEnabled(Boolean(res.data.enabled));
        const roles: DemoRoleOption[] = Array.isArray(res.data.roles) ? res.data.roles : [];
        setDemoRoles(roles);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setDemoEnabled(false);
      });
    return () => {
      active = false;
      controller.abort();
      loginAbortRef.current?.abort();
    };
  }, []);

  const handleLaunchDemo = async (role: string, targetTab: NavItemKey = 'dashboard') => {
    if (launchingRole) return;
    loginAbortRef.current?.abort();
    const controller = new AbortController();
    loginAbortRef.current = controller;

    setDemoError(null);
    setLaunchingRole(`${role}:${targetTab}`);

    try {
      const res = await apiClient.post(
        API_ROUTES.accounts.demoLogin,
        { role },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const data = res.data || {};
      const userObj = data.user || data;
      const resolvedRole = String(userObj.role || userObj.system_role || 'ADMIN').toUpperCase();
      const token = String(data.token || data.access || '').trim();
      const access = String(data.access || '').trim();
      const refresh = String(data.refresh || '').trim();
      const username = String(userObj.username || `demo_${role}`).trim();
      const teacherName = String(userObj.teacher_name || userObj.full_name || username).trim();
      const userId = Number(userObj.id || userObj.user_id || 0);
      const teacherId = userObj.teacher_id ? Number(userObj.teacher_id) : null;
      const isSuperuser = Boolean(userObj.is_superuser);
      const canTeach =
        userObj.can_handle_classes !== undefined && userObj.can_handle_classes !== null
          ? Boolean(userObj.can_handle_classes)
          : userObj.can_teach !== undefined && userObj.can_teach !== null
            ? Boolean(userObj.can_teach)
            : resolvedRole === 'TEACHER';
      const rawPhoto = (userObj.photo_url || userObj.photo) as string | null | undefined;
      const safeUserPhoto = isSafeImageUrl(rawPhoto) ? rawPhoto! : null;

      clearPreviousSessionStorage();
      clearApiClientCache();

      if (token) localStorage.setItem('attendsure_token', token);
      if (access) localStorage.setItem('attendsure_access', access);
      if (refresh) localStorage.setItem('attendsure_refresh', refresh);
      localStorage.setItem('attendsure_username', username);
      localStorage.setItem('attendsure_teacher_name', teacherName);
      localStorage.setItem('attendsure_role', resolvedRole);
      localStorage.setItem('attendsure_can_teach', String(canTeach));
      localStorage.setItem('attendsure_is_superuser', String(isSuperuser));
      if (userId) localStorage.setItem('attendsure_user_id', String(userId));
      if (teacherId) localStorage.setItem('attendsure_teacher_id', String(teacherId));
      if (safeUserPhoto) localStorage.setItem('attendsure_user_photo', safeUserPhoto);

      if (userObj.school_name || userObj.school_id) {
        updateSchoolInstantly({
          school_name: String(userObj.school_name || ''),
          school_id: String(userObj.school_id || ''),
          school_logo: isSafeImageUrl(userObj.school_logo) ? userObj.school_logo : school.school_logo,
          left_logo: isSafeImageUrl(userObj.left_logo) ? userObj.left_logo : school.left_logo,
          right_logo: isSafeImageUrl(userObj.right_logo) ? userObj.right_logo : school.right_logo,
        });
      }
      refreshSchool().catch(() => {});

      onDemoLoginSuccess(
        {
          user_id: userId,
          token,
          username,
          teacher_name: teacherName,
          role: resolvedRole,
        },
        targetTab
      );
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (
        controller.signal.aborted ||
        anyErr?.name === 'CanceledError' ||
        anyErr?.name === 'AbortError' ||
        anyErr?.code === 'ERR_CANCELED'
      ) {
        return;
      }
      setDemoError(
        extractApiError(
          err,
          'Demo workspace is currently unavailable. Please try again later or use Staff Sign In.'
        )
      );
    } finally {
      if (!controller.signal.aborted) {
        setLaunchingRole(null);
      }
    }
  };

  const themeChoices: { value: ThemeMode; title: string; icon: React.ReactNode }[] = [
    { value: 'light', title: 'Light Mode', icon: <Sun size={13} /> },
    { value: 'dark', title: 'Dark Mode', icon: <Moon size={13} /> },
    { value: 'high-contrast', title: 'High-Contrast Mode', icon: <Eye size={13} /> },
  ];

  const heroGradient = `radial-gradient(circle at 12% 14%, rgba(56, 189, 248, 0.22) 0%, transparent 42%), radial-gradient(circle at 88% 22%, rgba(16, 185, 129, 0.16) 0%, transparent 40%), linear-gradient(150deg, ${tokens.heroBgStart} 0%, ${tokens.heroBgEnd} 100%)`;

  const depedPillars = [
    {
      code: 'DEPED SF1 & SF2',
      title: 'Daily Learner Attendance & LRN',
      desc: 'Built-in camera QR scanning with 12-digit DepEd LRN verification and 30-day SARDO dropout early-warning.',
      color: brand.danger,
    },
    {
      code: 'DEPED SF4',
      title: 'Monthly Movement & 4Ps Tracking',
      desc: 'Automated school-wide monthly movement summaries, enrollment parity, and 4Ps / CCT learner monitoring.',
      color: brand.secondary,
    },
    {
      code: 'CAMPUS SAFETY',
      title: 'Emergency Evacuation Roll-Call',
      desc: 'One-click Emergency Campus Roll-Call gives school heads an instant verified headcount during drills and emergencies.',
      color: brand.warning,
    },
    {
      code: 'CSC FORM 48',
      title: 'Verified Teacher DTR & Geofence',
      desc: 'Phone Fingerprint / Biometric & Campus GPS Time In / Time Out paired 1-to-1 with each teacher phone — zero biometric data ever leaves the device.',
      color: brand.success,
    },
    {
      code: 'LOAFING & CUTTING',
      title: 'Teacher Loafing & Student Cutting Monitor',
      desc: 'Flags teacher loafing outside campus during duty hours, students cutting class, and overdue exit passes or locator slips.',
      color: brand.accentPurple,
    },
  ];

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: tokens.bgApp,
        color: tokens.textPrimary,
        fontFamily: fonts.sans,
        overflowY: 'auto',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          backgroundColor: mode === 'dark' ? 'rgba(9, 17, 31, 0.90)' : 'rgba(255, 255, 255, 0.94)',
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          padding: '10px clamp(16px, 4vw, 48px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AttendSureBrandBadge size={36} mode={mode} />
          <div>
            <div style={{ fontSize: '1.02rem', fontWeight: 900, letterSpacing: '-0.02em', color: tokens.textPrimary }}>
              AttendSure
            </div>
            <div style={{ fontSize: '0.68rem', color: tokens.textMuted, fontWeight: 600 }}>
              Geofencing Attendance &amp; Loafing Monitoring &bull; DepEd School Portal
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 11px',
              borderRadius: 9999,
              border: `1px solid ${brand.success}`,
              backgroundColor: tokens.successLight,
              color: brand.success,
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            <Building2 size={13} />
            DepEd PH Forms Ready
          </div>

          <select
            aria-label="Language"
            value={locale}
            onChange={(e) => setLocale(e.target.value as SupportedLocale)}
            style={{
              padding: '5px 8px',
              borderRadius: 8,
              border: `1px solid ${tokens.borderStrong}`,
              backgroundColor: tokens.bgSurface,
              color: tokens.textPrimary,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {LOCALE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.shortLabel} — {opt.label}
              </option>
            ))}
          </select>

          <ControlSwitch
            options={themeChoices}
            value={mode}
            onChange={setThemeMode}
            compactIconsOnly
            ariaLabel="Color Theme"
          />

          <button
            type="button"
            onClick={onOpenSignIn}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 9,
              border: 'none',
              backgroundColor: brand.buttonBg,
              color: tokens.onPrimary,
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <LogIn size={14} /> {t('sign_in')}
          </button>
        </div>
      </header>

      <section
        style={{
          background: heroGradient,
          color: tokens.onPrimary,
          padding: 'clamp(36px, 6vw, 68px) clamp(16px, 4vw, 48px)',
        }}
      >
        <div
          style={{
            maxWidth: 1220,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: 28,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                alignSelf: 'flex-start',
                padding: '5px 12px',
                borderRadius: 9999,
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                border: '1px solid rgba(255, 255, 255, 0.30)',
                fontSize: '0.70rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: tokens.onPrimary,
              }}
            >
              <Sparkles size={13} /> {t('hero_badge')}
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(1.9rem, 3.8vw, 2.95rem)',
                fontWeight: 900,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                fontFamily: fonts.display,
              }}
            >
              {t('hero_title')}
            </h1>

            <p style={{ margin: 0, fontSize: '0.96rem', lineHeight: 1.58, color: tokens.onPrimary, opacity: 0.9, maxWidth: 590 }}>
              {t('hero_subtitle')}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: 10,
                maxWidth: 540,
              }}
            >
              {[
                { val: '100%', label: 'Pure-Software Setup' },
                { val: 'DepEd', label: 'SF1, SF2, SF4 & DTR' },
                { val: 'Offline', label: 'Auto-Sync Queue' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.09)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: tokens.onPrimary }}>{stat.val}</div>
                  <div style={{ fontSize: '0.70rem', color: tokens.onPrimary, opacity: 0.85, fontWeight: 600 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {demoEnabled && (
                <button
                  type="button"
                  onClick={() => handleLaunchDemo('admin', 'impact')}
                  disabled={Boolean(launchingRole)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '11px 18px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: brand.success,
                    color: tokens.onPrimary,
                    fontSize: '0.84rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  <Zap size={16} />
                  {launchingRole === 'admin:impact'
                    ? 'Opening Campus Safety & SARDO...'
                    : 'Open SARDO & Campus Safety Demo'}
                  <ArrowRight size={15} />
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSignIn}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '11px 18px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.35)',
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  color: tokens.onPrimary,
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <LogIn size={15} /> {t('sign_in')}
              </button>
            </div>
          </div>

          <div
            style={{
              borderRadius: 18,
              backgroundColor: 'rgba(15, 23, 42, 0.62)',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Award size={18} color={brand.success} />
                <span style={{ fontSize: '0.92rem', fontWeight: 900, color: tokens.onPrimary }}>
                  {t('launch_demo')}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 9999,
                  backgroundColor: demoEnabled ? 'rgba(16, 185, 129, 0.22)' : 'rgba(148, 163, 184, 0.22)',
                  color: tokens.onPrimary,
                }}
              >
                {demoEnabled ? 'LIVE PREVIEW READY' : 'PRODUCTION LOCKED'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: tokens.onPrimary, opacity: 0.85, lineHeight: 1.45 }}>
              {demoEnabled
                ? 'Choose any school role below to explore live DepEd class lists, built-in camera QR scanning, campus geofencing, and SF1/SF2/SF4/DTR reports.'
                : 'Preview mode is turned off for this school portal. Please sign in with your school-issued account.'}
            </p>

            {demoError && (
              <div
                style={{
                  padding: '9px 11px',
                  borderRadius: 10,
                  backgroundColor: tokens.dangerBg,
                  border: `1px solid ${brand.danger}`,
                  color: brand.danger,
                  fontSize: '0.74rem',
                  fontWeight: 600,
                }}
              >
                {demoError}
              </div>
            )}

            {demoEnabled && demoRoles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {demoRoles.map((item) => {
                  const isBusy = launchingRole === `${item.role}:dashboard`;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      disabled={Boolean(launchingRole)}
                      onClick={() => handleLaunchDemo(item.role, 'dashboard')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '11px 13px',
                        borderRadius: 12,
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: tokens.onPrimary,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: tokens.onPrimary }}>
                          {isBusy ? `Signing in as ${item.label}...` : item.label}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: tokens.onPrimary, opacity: 0.78, marginTop: 2 }}>
                          {item.description}
                        </div>
                      </div>
                      <ArrowRight size={16} color={tokens.onPrimary} style={{ flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenSignIn}
                style={{
                  padding: '11px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                  backgroundColor: brand.buttonBg,
                  color: tokens.onPrimary,
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Proceed to Teacher &amp; Admin Sign-In
              </button>
            )}

            <div style={{ fontSize: '0.68rem', color: tokens.onPrimary, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={12} color={brand.success} />
              <span>
                Role preview is only enabled in local demo environments and is disabled automatically in production.
              </span>
            </div>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1220, margin: '0 auto', padding: '32px clamp(16px, 4vw, 48px) 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: 16,
          }}
        >
          <div
            style={{
              backgroundColor: tokens.bgSurface,
              border: `1px solid ${tokens.borderSubtle}`,
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ fontSize: '0.70rem', fontWeight: 800, color: brand.danger, letterSpacing: '0.06em' }}>
              THE EVERYDAY SCHOOL CHALLENGE
            </div>
            <h2 style={{ margin: '6px 0 10px', fontSize: '1.08rem', fontWeight: 900, color: tokens.textPrimary }}>
              Manual Paper Attendance &amp; Spreadsheets
            </h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: tokens.textSecondary, fontSize: '0.82rem', lineHeight: 1.65 }}>
              <li><strong>Lost class time every period</strong> calling names aloud and retyping paper class lists into spreadsheets</li>
              <li><strong>Unnoticed class cutting &amp; loafing</strong> when schools lack period-by-period checks and campus GPS boundaries</li>
              <li><strong>Delayed SARDO detection</strong> making it harder for advisers to spot at-risk learners early</li>
              <li><strong>Heavy monthly paperwork</strong> preparing DepEd SF1, SF2, SF4, and CSC Form 48 DTR by hand</li>
            </ul>
          </div>

          <div
            style={{
              backgroundColor: tokens.bgSurface,
              border: `2px solid ${brand.primary}`,
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div style={{ fontSize: '0.70rem', fontWeight: 800, color: brand.success, letterSpacing: '0.06em' }}>
              THE ATTENDSURE ADVANTAGE
            </div>
            <h2 style={{ margin: '6px 0 10px', fontSize: '1.08rem', fontWeight: 900, color: tokens.textPrimary }}>
              AttendSure Software-Only Geofencing Platform
            </h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: tokens.textSecondary, fontSize: '0.82rem', lineHeight: 1.65 }}>
              <li><strong>Built-in cameras only:</strong> Uses existing teacher laptop webcams and phone cameras with zero external hardware</li>
              <li><strong>Period-by-period accuracy:</strong> Signed 12-digit LRN QR ID cards catch skipped periods and prevent forged passes</li>
              <li><strong>Campus GPS geofencing &amp; loafing detection:</strong> Verifies teachers on campus and flags unauthorized departures or overdue exit passes</li>
              <li><strong>Ready-to-Print DepEd Forms:</strong> Automatic SF1, SF2, SF4, CSC Form 48 DTR, and DepEd Division Data Exports</li>
            </ul>
          </div>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '0.70rem', fontWeight: 800, color: brand.primary, letterSpacing: '0.08em' }}>
                DEPED SCHOOL WORKFLOWS
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 900, color: tokens.textPrimary }}>
                Built for Philippine Public &amp; Secondary Schools
              </h2>
            </div>
            <span style={{ fontSize: '0.76rem', color: tokens.textMuted, fontWeight: 600 }}>
              100% live database records — zero placeholder numbers
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
            {depedPillars.map((pillar) => (
              <div
                key={pillar.code}
                style={{
                  backgroundColor: tokens.bgSurface,
                  border: `1px solid ${tokens.borderSubtle}`,
                  borderTop: `3px solid ${pillar.color}`,
                  borderRadius: 12,
                  padding: 15,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: '0.68rem', fontWeight: 900, color: pillar.color }}>{pillar.code}</span>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>{pillar.title}</div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: tokens.textSecondary, lineHeight: 1.45 }}>
                  {pillar.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {[
            {
              icon: <QrCode size={18} color={brand.primary} />,
              title: 'Offline-Ready Camera QR Attendance',
              desc: 'Digitally signed learner QR IDs scan directly on built-in laptop webcams or mobile cameras and sync automatically when back online.',
            },
            {
              icon: <Smartphone size={18} color={brand.success} />,
              title: 'Phone Fingerprint / Biometric & Campus GPS',
              desc: 'Built-in phone fingerprint / passkey sensor and campus GPS Time In / Time Out in the mobile app with 1-to-1 phone pairing — zero biometric data ever leaves the phone.',
            },
            {
              icon: <ShieldAlert size={18} color={brand.danger} />,
              title: 'SARDO Early-Warning & Campus Roll-Call',
              desc: '30-day attendance trend scoring flags at-risk learners early, paired with instant emergency evacuation headcount checklists.',
            },
            {
              icon: <FileSpreadsheet size={18} color={brand.accentPurple} />,
              title: 'DepEd Official Forms & Division Export',
              desc: 'Print official DepEd SF1, SF2, SF4, and CSC Form 48 DTR or download DepEd Division Data Exports in JSON and CSV formats.',
            },
          ].map((cap) => (
            <div
              key={cap.title}
              style={{
                backgroundColor: tokens.bgSurface,
                border: `1px solid ${tokens.borderSubtle}`,
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: tokens.bgSurfaceSubtle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {cap.icon}
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>{cap.title}</div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: tokens.textSecondary, lineHeight: 1.48 }}>{cap.desc}</p>
            </div>
          ))}
        </section>

        <footer
          style={{
            backgroundColor: tokens.bgSurface,
            border: `1px solid ${tokens.borderSubtle}`,
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: '0.75rem', color: tokens.textSecondary, fontWeight: 700 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <ShieldCheck size={15} color={brand.success} /> Data Privacy Act (RA 10173) Protected
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle2 size={15} color={brand.primary} /> DepEd SF1, SF2, SF4 &amp; CSC Form 48 Ready
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Cpu size={15} color={brand.accentPurple} /> Built for Reliable Daily Campus Use
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <FileSpreadsheet size={15} color={brand.warning} /> Designed for Philippine High Schools
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: tokens.textMuted }}>
            ATTENDSURE &bull; TECHBLAZER
          </span>
        </footer>
      </main>
    </div>
  );
};

export default StartupShowcasePage;
