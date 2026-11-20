/**
 * AttendSure - International Startup Competition Showcase & 1-Click Judge Demo Launcher
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
  CheckCircle2,
  Cpu,
  FileJson,
  FileSpreadsheet,
  Globe,
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
    'attendsure_faculty_name',
    'attendsure_role',
    'attendsure_user_id',
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
  const { complianceMode, toggleComplianceMode, isGlobalMode, locale, setLocale, t } = useCompliance();

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
        // Keep web-compatible staff roles on the Web Portal launcher
        setDemoRoles(roles.filter((r) => r.role.toLowerCase() !== 'parent'));
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
      const facultyName = String(userObj.faculty_name || userObj.full_name || username).trim();
      const userId = Number(userObj.id || userObj.user_id || 0);
      const canTeach = Boolean(
        userObj.can_teach || userObj.is_teaching || Number(userObj.assigned_class_count) > 0 || resolvedRole === 'FACULTY'
      );
      const rawPhoto = (userObj.photo_url || userObj.photo) as string | null | undefined;
      const safeUserPhoto = isSafeImageUrl(rawPhoto) ? rawPhoto! : null;

      clearPreviousSessionStorage();
      clearApiClientCache();

      if (token) localStorage.setItem('attendsure_token', token);
      if (access) localStorage.setItem('attendsure_access', access);
      if (refresh) localStorage.setItem('attendsure_refresh', refresh);
      localStorage.setItem('attendsure_username', username);
      localStorage.setItem('attendsure_faculty_name', facultyName);
      localStorage.setItem('attendsure_role', resolvedRole);
      localStorage.setItem('attendsure_can_teach', String(canTeach));
      if (userId) localStorage.setItem('attendsure_user_id', String(userId));
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
          faculty_name: facultyName,
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

  const heroGradient =
    mode === 'dark'
      ? 'radial-gradient(circle at 12% 14%, rgba(56, 189, 248, 0.22) 0%, transparent 40%), radial-gradient(circle at 86% 24%, rgba(16, 185, 129, 0.16) 0%, transparent 42%), linear-gradient(155deg, #071324 0%, #0b1c36 52%, #07101f 100%)'
      : 'radial-gradient(circle at 12% 14%, rgba(56, 189, 248, 0.24) 0%, transparent 42%), radial-gradient(circle at 88% 22%, rgba(16, 185, 129, 0.18) 0%, transparent 40%), linear-gradient(148deg, #023e73 0%, #004b87 48%, #042544 100%)';

  const purpleAccent = mode === 'dark' ? '#c084fc' : '#7c3aed';

  const sdgPillars = [
    {
      code: 'SDG 4',
      title: 'Quality Education',
      desc: 'Verified USB QR classroom attendance and 30-day dropout early-warning help schools support learners early.',
      color: mode === 'dark' ? '#fb7185' : '#e11d48',
    },
    {
      code: 'SDG 5 & 10',
      title: 'Gender Parity & Equity',
      desc: 'Live attendance parity tracking and program support monitoring for learners receiving educational assistance.',
      color: mode === 'dark' ? '#38bdf8' : '#0284c7',
    },
    {
      code: 'SDG 11',
      title: 'Safe Resilient Schools',
      desc: 'One-click Emergency Campus Roll-Call gives schools an instant verified headcount during drills and evacuations.',
      color: mode === 'dark' ? '#fb923c' : '#c2410c',
    },
    {
      code: 'SDG 12 & 13',
      title: 'Climate & Paperless Schools',
      desc: 'Pure-software classroom attendance eliminates paper logbooks, repeated printing, and wasteful standalone hardware.',
      color: mode === 'dark' ? '#4ade80' : '#15803d',
    },
    {
      code: 'SDG 16',
      title: 'Accountable Institutions',
      desc: 'Digitally verified QR passes, 1-to-1 phone-linked campus GPS check-ins, clear audit logs, and open Ed-Fi reports.',
      color: purpleAccent,
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
      {/* Sticky Top Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          backgroundColor: mode === 'dark' ? 'rgba(9, 17, 31, 0.88)' : 'rgba(255, 255, 255, 0.92)',
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
              School Attendance Platform &bull; Global Ed-Fi + DepEd Ready
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Dual Compliance Mode Pill */}
          <button
            type="button"
            onClick={toggleComplianceMode}
            title="Switch between Global Ed-Fi Standard and DepEd Philippines Official Forms"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 11px',
              borderRadius: 9999,
              border: `1px solid ${isGlobalMode ? brand.primary : brand.success}`,
              backgroundColor: isGlobalMode ? tokens.primaryLight : tokens.successLight,
              color: isGlobalMode ? brand.primary : brand.success,
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Globe size={13} />
            {complianceMode === 'GLOBAL' ? 'Global Ed-Fi' : 'DepEd PH Forms'}
          </button>

          {/* Language Selector */}
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
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <LogIn size={14} /> {t('sign_in')}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          background: heroGradient,
          color: '#ffffff',
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
                backgroundColor: 'rgba(125, 211, 252, 0.16)',
                border: '1px solid rgba(125, 211, 252, 0.36)',
                fontSize: '0.70rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: '#bae6fd',
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

            <p style={{ margin: 0, fontSize: '0.96rem', lineHeight: 1.58, color: '#dbeafe', maxWidth: 590 }}>
              {t('hero_subtitle')}
            </p>

            {/* Key Platform Highlights Strip */}
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
                { val: 'Ed-Fi', label: 'Open Global Standard' },
                { val: 'Offline', label: 'Auto-Sync Queue' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(255, 255, 255, 0.09)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#7dd3fc' }}>{stat.val}</div>
                  <div style={{ fontSize: '0.70rem', color: '#e0f2fe', fontWeight: 600 }}>{stat.label}</div>
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
                    backgroundColor: '#10b981',
                    color: '#042f2e',
                    fontSize: '0.84rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  <Zap size={16} />
                  {launchingRole === 'admin:impact'
                    ? 'Opening Impact Command Center...'
                    : 'Open Live Impact & Early-Warning Demo'}
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
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <LogIn size={15} /> {t('sign_in')}
              </button>
            </div>
          </div>

          {/* Right Card: 1-Click Judge Demo Role Launcher */}
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
                <Award size={18} color="#34d399" />
                <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#ffffff' }}>
                  {t('launch_demo')}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 9999,
                  backgroundColor: demoEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                  color: demoEnabled ? '#6ee7b7' : '#cbd5e1',
                }}
              >
                {demoEnabled ? 'LIVE SANDBOX READY' : 'PRODUCTION LOCKED'}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.45 }}>
              {demoEnabled
                ? 'Choose any school role below to explore live attendance records, verified QR scanning, dropout alerts, and privacy-safe reports instantly.'
                : 'Demo mode is turned off for this school portal. Please sign in with your school-issued account.'}
            </p>

            {demoError && (
              <div
                style={{
                  padding: '9px 11px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(248, 113, 113, 0.5)',
                  color: '#fecaca',
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
                        color: '#ffffff',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#f8fafc' }}>
                          {isBusy ? `Signing in as ${item.label}...` : item.label}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: '#cbd5e1', marginTop: 2 }}>
                          {item.description}
                        </div>
                      </div>
                      <ArrowRight size={16} color="#7dd3fc" style={{ flexShrink: 0 }} />
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
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Proceed to School Staff Sign-In
              </button>
            )}

            <div style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={12} color="#34d399" />
              <span>
                Demo access is only enabled in preview workspaces and is automatically disabled for live school portals.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <main style={{ maxWidth: 1220, margin: '0 auto', padding: '32px clamp(16px, 4vw, 48px) 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Comparison: Manual Paper Attendance vs AttendSure Pure-Software Campus Platform */}
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
              THE EVERYDAY BOTTLENECK
            </div>
            <h2 style={{ margin: '6px 0 10px', fontSize: '1.08rem', fontWeight: 900, color: tokens.textPrimary }}>
              Manual Paper Attendance &amp; Spreadsheets
            </h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: tokens.textSecondary, fontSize: '0.82rem', lineHeight: 1.65 }}>
              <li><strong>Lost class time every period</strong> calling names aloud and retyping paper class lists into spreadsheets</li>
              <li><strong>Delayed parent updates</strong> when families only learn about absences or skipped periods days later</li>
              <li><strong>Fragmented school records</strong> make it difficult to spot patterns of student cutting or dropout risk early</li>
              <li><strong>Heavy monthly paperwork</strong> preparing attendance summaries, class registers, and staff time sheets by hand</li>
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
              AttendSure Pure-Software Campus Platform
            </h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: tokens.textSecondary, fontSize: '0.82rem', lineHeight: 1.65 }}>
              <li><strong>Ready on classroom PCs:</strong> Works with affordable USB QR code scanners plugged into existing faculty laptops</li>
              <li><strong>Period-by-period accuracy:</strong> Digitally verified QR ID cards catch skipped periods and prevent forged passes</li>
              <li><strong>Instant parent mobile push alerts:</strong> Real-time phone notifications plus automatic offline queue sync</li>
              <li><strong>Dual Compliance Engine:</strong> Privacy-safe Global Ed-Fi exports alongside ready-to-print DepEd forms (SF1, SF2, SF4, DTR)</li>
            </ul>
          </div>
        </section>

        {/* UN SDG Global Impact Strip */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '0.70rem', fontWeight: 800, color: brand.primary, letterSpacing: '0.08em' }}>
                MEASURABLE SOCIAL IMPACT
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 900, color: tokens.textPrimary }}>
                Aligned with 5 United Nations Sustainable Development Goals
              </h2>
            </div>
            <span style={{ fontSize: '0.76rem', color: tokens.textMuted, fontWeight: 600 }}>
              100% live school records — zero sample or placeholder numbers
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
            {sdgPillars.map((pillar) => (
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

        {/* Core Platform Capabilities & Dual Compliance */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
          {[
            {
              icon: <QrCode size={18} color={brand.primary} />,
              title: 'Verified Offline-Ready USB QR Attendance',
              desc: 'Digitally signed student QR passes scan cleanly on classroom USB QR readers and queue automatically whenever internet drops.',
            },
            {
              icon: <Smartphone size={18} color={brand.success} />,
              title: 'Phone-Linked Faculty Face & GPS Check-In',
              desc: 'On-device facial recognition and campus GPS check-ins in the mobile app with 1-to-1 phone pairing and zero face photos stored on the server.',
            },
            {
              icon: <ShieldAlert size={18} color={brand.danger} />,
              title: 'Dropout Early-Warning & Campus Roll-Call',
              desc: '30-day attendance trend scoring flags at-risk learners early, paired with instant emergency headcount checklists.',
            },
            {
              icon: <FileJson size={18} color={purpleAccent} />,
              title: 'Dual Compliance: Global Ed-Fi + DepEd Forms',
              desc: 'Export privacy-protected Ed-Fi JSON for districts or print official DepEd SF1, SF2, SF4, and monthly time records.',
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

        {/* Compliance & Privacy Trust Footer */}
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
              <ShieldCheck size={15} color={brand.success} /> GDPR Art. 25 Privacy Protection
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle2 size={15} color={brand.primary} /> FERPA, COPPA &amp; RA 10173 Aligned
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Cpu size={15} color={purpleAccent} /> Built for Reliable Daily Campus Use
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <FileSpreadsheet size={15} color={brand.warning} /> Pilot Proven in Public High Schools
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: tokens.textMuted }}>
            ATTENDSURE &bull; TECHBLAZER GLOBAL EDTECH
          </span>
        </footer>
      </main>
    </div>
  );
};

export default StartupShowcasePage;
