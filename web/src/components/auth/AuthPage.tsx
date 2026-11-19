/**
 * AttendSure - Executive School Staff Sign-In Portal
 * File: web/src/components/auth/AuthPage.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import apiClient, { clearApiClientCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { isSafeImageUrl, type ThemeMode } from '../../theme/tokens';
import { AttendSureBrandBadge } from '../branding/BrandAssets';
import { Button } from '../ui/Button';
import { ControlSwitch } from '../ui/ControlSwitch';
import type { UserSession } from '../../types/section';
import type { LoginPayload } from '../../types/auth';
import {
  School,
  ShieldCheck,
  QrCode,
  Smartphone,
  FileSpreadsheet,
  BellRing,
  LogIn,
  Eye,
  EyeOff,
  AlertCircle,
  AlertTriangle,
  Sun,
  Moon,
  Lock,
  User,
} from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess?: (session: UserSession) => void;
  onLoginSuccess?: (session: UserSession) => void;
}

const ALLOWED_WEB_ROLES = new Set(['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'FACULTY']);

const clearPreviousSessionStorage = (): void => {
  const keys = [
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
  ];
  keys.forEach((k) => localStorage.removeItem(k));
};

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess, onLoginSuccess }) => {
  const { school, updateSchoolInstantly, refreshSchool } = useSchool();
  const { mode, setThemeMode, tokens, brand, fonts } = useTheme();

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [capsLockOn, setCapsLockOn] = useState<boolean>(false);
  const [focusedField, setFocusedField] = useState<'username' | 'password' | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState<LoginPayload>({ username: '', password: '' });

  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    usernameInputRef.current?.focus();
    return () => {
      setLoginForm({ username: '', password: '' });
    };
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => setCooldownSeconds((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || cooldownSeconds > 0) return;

    const cleanUsername = loginForm.username.replace(/[\r\n\t<>]/g, '').trim().slice(0, 100);
    const rawPassword = loginForm.password.slice(0, 128);

    if (!cleanUsername || !rawPassword) {
      setErrorMsg('Please enter both your username and password.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await apiClient.post(API_ROUTES.accounts.login, {
        username: cleanUsername,
        password: rawPassword,
      });

      const data = res.data || {};
      const userObj = data.user || data;
      const role = String(userObj.role || userObj.system_role || 'FACULTY').toUpperCase();

      if (!ALLOWED_WEB_ROLES.has(role)) {
        clearPreviousSessionStorage();
        clearApiClientCache();
        setLoginForm((prev) => ({ ...prev, password: '' }));
        setErrorMsg(
          'Parent accounts sign in on the AttendSure Mobile App. Please use a teacher or admin account here.'
        );
        return;
      }

      const token = String(data.token || data.access || '').trim();
      const access = String(data.access || '').trim();
      const refresh = String(data.refresh || '').trim();
      const username = String(userObj.username || cleanUsername).trim();
      const facultyName = String(userObj.faculty_name || userObj.full_name || username).trim();
      const userId = Number(userObj.id || userObj.user_id || 0);
      const canTeach = Boolean(
        userObj.can_teach || userObj.is_teaching || Number(userObj.assigned_class_count) > 0 || role === 'FACULTY'
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
      localStorage.setItem('attendsure_role', role);
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

      setLoginForm({ username: '', password: '' });

      const session: UserSession = {
        user_id: userId,
        token,
        username,
        faculty_name: facultyName,
        role,
      };

      onAuthSuccess?.(session);
      onLoginSuccess?.(session);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setCooldownSeconds(30);
      }
      setLoginForm((prev) => ({ ...prev, password: '' }));
      setErrorMsg(extractApiError(err, 'Wrong username or password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const safeSchoolLogo = isSafeImageUrl(school.school_logo) ? school.school_logo : null;
  const schoolTitle = school.school_name?.trim() || 'Official School Portal';
  const validSchoolId =
    school.school_id?.trim() && school.school_id !== '55555' && school.school_id !== '000000'
      ? school.school_id.trim()
      : '';

  const features = [
    {
      icon: <QrCode size={16} color="#7dd3fc" />,
      title: 'Classroom QR Scan',
      desc: 'Fast USB scanner or camera check-in, even offline.',
    },
    {
      icon: <Smartphone size={16} color="#6ee7b7" />,
      title: 'Campus GPS Check-In',
      desc: 'Teachers verify arrival via mobile camera and GPS.',
    },
    {
      icon: <FileSpreadsheet size={16} color="#fcd34d" />,
      title: 'Official DepEd Forms',
      desc: 'Ready-to-print SF1, SF2, SF4, and CSC Form 48.',
    },
    {
      icon: <BellRing size={16} color="#f9a8d4" />,
      title: 'Parent Mobile Alerts',
      desc: 'Instant arrival, cutting, and exit pass notices.',
    },
  ];

  const themeChoices: { value: ThemeMode; title: string; icon: React.ReactNode }[] = [
    { value: 'light', title: 'Light Mode', icon: <Sun size={13} /> },
    { value: 'dark', title: 'Dark Mode', icon: <Moon size={13} /> },
    { value: 'high-contrast', title: 'Daylight High-Contrast Mode', icon: <Eye size={13} /> },
  ];

  // Theme-harmonized outer viewport & hero gradients so Light, Dark, and Daylight all feel cohesive
  const viewportBackground =
    mode === 'dark'
      ? 'radial-gradient(circle at 18% 18%, rgba(2, 132, 199, 0.20) 0%, transparent 45%), radial-gradient(circle at 84% 82%, rgba(16, 185, 129, 0.12) 0%, transparent 45%), linear-gradient(155deg, #060b16 0%, #0a1324 55%, #050912 100%)'
      : mode === 'high-contrast'
      ? 'linear-gradient(155deg, #dce4ee 0%, #cbd5e1 100%)'
      : 'radial-gradient(circle at 15% 15%, rgba(2, 132, 199, 0.12) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(0, 75, 135, 0.10) 0%, transparent 45%), linear-gradient(155deg, #edf2f7 0%, #e2e8f0 100%)';

  const heroBackground =
    mode === 'dark'
      ? 'linear-gradient(155deg, #0c2d52 0%, #071d36 56%, #051324 100%)'
      : mode === 'high-contrast'
      ? 'linear-gradient(155deg, #003865 0%, #002342 100%)'
      : 'linear-gradient(155deg, #0369a1 0%, #004b87 54%, #06284b 100%)';

  const shellShadow =
    mode === 'dark'
      ? '0 28px 65px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(148, 163, 184, 0.16)'
      : mode === 'high-contrast'
      ? '0 18px 40px rgba(15, 23, 42, 0.18), 0 0 0 2px #0f172a'
      : '0 24px 56px -8px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.08)';

  const inputWrapStyle = (isFocused: boolean): React.CSSProperties => ({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: isFocused ? brand.primary : tokens.borderStrong,
    backgroundColor: isFocused ? tokens.bgSurface : tokens.bgSurfaceSubtle,
    boxShadow: isFocused ? `0 0 0 3px ${tokens.primaryLight}` : 'none',
    transition: 'border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease',
  });

  return (
    <div
      className="auth-viewport"
      style={{
        fontFamily: fonts.sans,
        background: viewportBackground,
      }}
    >
      <style>{`
        .auth-viewport {
          height: 100dvh;
          width: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(14px, 2.5vh, 28px) clamp(14px, 3vw, 28px);
          box-sizing: border-box;
          transition: background 0.25s ease;
        }
        .auth-shell {
          display: grid;
          grid-template-columns: 1.06fr 0.94fr;
          width: 100%;
          max-width: 870px;
          margin: auto;
          border-radius: 20px;
          overflow: hidden;
        }
        .auth-hero-pane {
          padding: clamp(24px, 2.8vw, 34px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 20px;
          color: #ffffff;
          position: relative;
        }
        .auth-hero-pattern {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px);
          background-size: 20px 20px;
          pointer-events: none;
        }
        .auth-feature-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 18px;
        }
        .auth-feature-card {
          padding: 12px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          display: flex;
          flex-direction: column;
          gap: 6px;
          transition: background-color 0.18s ease, border-color 0.18s ease;
        }
        .auth-feature-card:hover {
          background: rgba(255, 255, 255, 0.13);
          border-color: rgba(125, 211, 252, 0.35);
        }
        .auth-form-pane {
          padding: clamp(24px, 3vw, 36px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 18px;
        }
        @media (max-width: 820px) {
          .auth-viewport {
            align-items: flex-start;
          }
          .auth-shell {
            grid-template-columns: 1fr;
            max-width: 450px;
          }
          .auth-hero-pane {
            order: 2;
          }
          .auth-form-pane {
            order: 1;
          }
        }
        @media (max-width: 480px) {
          .auth-feature-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="auth-shell" style={{ boxShadow: shellShadow }}>
        {/* Left Institutional Showcase Pane */}
        <div className="auth-hero-pane" style={{ background: heroBackground }}>
          <div className="auth-hero-pattern" />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Verified School Header Pill */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'rgba(255, 255, 255, 0.22)',
                borderRadius: 9999,
                marginBottom: 18,
                maxWidth: '100%',
              }}
            >
              {safeSchoolLogo ? (
                <img
                  src={safeSchoolLogo}
                  alt="School Seal"
                  style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'contain', backgroundColor: '#ffffff', padding: 1, flexShrink: 0 }}
                />
              ) : (
                <School size={15} color="#7dd3fc" style={{ flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {schoolTitle}
              </span>
              {validSchoolId && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: '#bae6fd',
                    borderLeftWidth: 1,
                    borderLeftStyle: 'solid',
                    borderLeftColor: 'rgba(255, 255, 255, 0.28)',
                    paddingLeft: 8,
                    fontFamily: fonts.mono,
                    flexShrink: 0,
                  }}
                >
                  ID: {validSchoolId}
                </span>
              )}
            </div>

            {/* Brand Title Lockup */}
            <div style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: '#7dd3fc',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                ATTENDANCE &amp; CAMPUS MANAGEMENT
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.65rem, 2.5vw, 2.05rem)',
                  fontWeight: 900,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.1,
                  fontFamily: fonts.display,
                }}
              >
                AttendSure
              </h1>
            </div>

            <p style={{ margin: 0, fontSize: '0.84rem', color: '#e0f2fe', lineHeight: 1.5, maxWidth: 400 }}>
              Real-time classroom QR attendance, teacher campus check-in, parent mobile alerts, and official DepEd reports.
            </p>

            {/* 2x2 Capability Grid */}
            <div className="auth-feature-grid">
              {features.map((feat) => (
                <div key={feat.title} className="auth-feature-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: 'rgba(15, 23, 42, 0.42)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(255, 255, 255, 0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {feat.icon}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.80rem', lineHeight: 1.2 }}>{feat.title}</div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#cbd5e1', lineHeight: 1.38 }}>{feat.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              zIndex: 1,
              borderTopWidth: 1,
              borderTopStyle: 'solid',
              borderTopColor: 'rgba(255, 255, 255, 0.15)',
              paddingTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: '0.72rem',
              color: '#bae6fd',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <ShieldCheck size={14} color="#34d399" /> Authorized School Personnel
            </span>
            <span style={{ fontWeight: 800, letterSpacing: '0.05em', fontSize: '0.68rem', opacity: 0.9 }}>
              TECHBLAZER
            </span>
          </div>
        </div>

        {/* Right Sign-In Workspace Pane */}
        <div className="auth-form-pane" style={{ backgroundColor: tokens.bgSurface }}>
          <div>
            {/* Top Brand Emblem + Theme Switcher Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 22,
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AttendSureBrandBadge size={42} mode={mode} />
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.14rem',
                      fontWeight: 900,
                      color: tokens.textPrimary,
                      letterSpacing: '-0.015em',
                      lineHeight: 1.15,
                      fontFamily: fonts.display,
                    }}
                  >
                    Welcome Back
                  </h2>
                  <div style={{ fontSize: '0.76rem', color: tokens.textMuted, marginTop: 2 }}>
                    Sign in to your school workspace
                  </div>
                </div>
              </div>

              <ControlSwitch
                options={themeChoices}
                value={mode}
                onChange={setThemeMode}
                compactIconsOnly
                ariaLabel="Color Theme"
              />
            </div>

            {errorMsg && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  backgroundColor: tokens.dangerLight,
                  color: brand.danger,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: brand.danger,
                  marginBottom: 16,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  lineHeight: 1.35,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Primary Sign-In Form */}
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label
                  htmlFor="login-identifier"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    marginBottom: 6,
                    color: tokens.textPrimary,
                  }}
                >
                  Username or Employee ID
                </label>
                <div style={inputWrapStyle(focusedField === 'username')}>
                  <User
                    size={15}
                    color={focusedField === 'username' ? brand.primary : tokens.textMuted}
                    style={{ marginLeft: 12, flexShrink: 0 }}
                  />
                  <input
                    ref={usernameInputRef}
                    id="login-identifier"
                    type="text"
                    required
                    maxLength={100}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Enter username or Employee ID"
                    value={loginForm.username}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 9px',
                      borderWidth: 0,
                      borderStyle: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '0.86rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    marginBottom: 6,
                    color: tokens.textPrimary,
                  }}
                >
                  Password
                </label>
                <div style={inputWrapStyle(focusedField === 'password')}>
                  <Lock
                    size={15}
                    color={focusedField === 'password' ? brand.primary : tokens.textMuted}
                    style={{ marginLeft: 12, flexShrink: 0 }}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={loginForm.password}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    onKeyUp={handleKeyEvent}
                    onKeyDown={handleKeyEvent}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 8px 10px 9px',
                      borderWidth: 0,
                      borderStyle: 'none',
                      background: 'transparent',
                      color: tokens.textPrimary,
                      fontSize: '0.86rem',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      background: 'none',
                      borderWidth: 0,
                      borderStyle: 'none',
                      color: brand.primary,
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      padding: '4px 11px',
                      flexShrink: 0,
                    }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>

                {capsLockOn && (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      marginTop: 5,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: brand.warning,
                    }}
                  >
                    <AlertTriangle size={13} />
                    <span>Caps Lock is on</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                disabled={loading || cooldownSeconds > 0}
                icon={<LogIn size={16} />}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '11px 0',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: '0.88rem',
                }}
              >
                {cooldownSeconds > 0 ? `Please wait (${cooldownSeconds}s)` : 'Sign In'}
              </Button>
            </form>
          </div>

          {/* Calm Account Governance Footnote */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopStyle: 'solid',
              borderTopColor: tokens.borderSubtle,
              fontSize: '0.73rem',
              color: tokens.textMuted,
              lineHeight: 1.4,
            }}
          >
            <Lock size={14} color={tokens.textMuted} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              Accounts are issued by your <strong style={{ color: tokens.textSecondary }}>School Admin</strong>. Need a password reset? Contact the school office.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;