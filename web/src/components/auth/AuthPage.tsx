/**
 * AttendSure - Responsive School Sign-In Page (Admin-Issued Accounts Only)
 * File: web/src/components/auth/AuthPage.tsx
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { isSafeImageUrl, type ThemeMode } from '../../theme/tokens';
import { AttendSureLogoAsset } from '../branding/BrandAssets';
import { Button } from '../ui/Button';
import { TextInput } from '../ui/FormControls';
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
  CheckCircle2,
  KeyRound,
  RotateCw,
  ArrowLeft,
  Sun,
  Moon,
  Sparkles,
  Lock,
} from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess?: (session: UserSession) => void;
  onLoginSuccess?: (session: UserSession) => void;
}

interface TwoFactorPayload {
  username: string;
  masked_phone: string;
  temp_token?: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess, onLoginSuccess }) => {
  const { school } = useSchool();
  const { mode, setThemeMode, tokens, brand, fonts } = useTheme();

  const [step, setStep] = useState<'LOGIN' | '2FA'>('LOGIN');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [twoFactorData, setTwoFactorData] = useState<TwoFactorPayload>({
    username: '',
    masked_phone: '',
    temp_token: '',
  });
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [resendingOtp, setResendingOtp] = useState<boolean>(false);

  const [loginForm, setLoginForm] = useState<LoginPayload>({
    username: '',
    password: '',
  });

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => setOtpCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  const triggerSuccess = (session: UserSession) => {
    localStorage.setItem('attendsure_token', session.token);
    localStorage.setItem('attendsure_username', session.username);
    localStorage.setItem('attendsure_faculty_name', session.faculty_name);
    localStorage.setItem('attendsure_role', session.role);

    if (onAuthSuccess) onAuthSuccess(session);
    if (onLoginSuccess) onLoginSuccess(session);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const cleanPayload = {
        username: loginForm.username.replace(/[\r\n\t]/g, '').trim(),
        password: loginForm.password,
      };
      const res = await apiClient.post('/auth/login/', cleanPayload);

      if (res.data.requires_2fa || res.data.two_factor_required || res.data.status === '2FA_REQUIRED') {
        setTwoFactorData({
          username: res.data.username || cleanPayload.username,
          masked_phone: res.data.masked_phone || res.data.phone || 'your phone number',
          temp_token: res.data.temp_token || '',
        });
        setOtpCode('');
        setOtpCooldown(60);
        setStep('2FA');
        setSuccessMsg(res.data.message || 'We sent a 6-digit code to your phone.');
        return;
      }

      triggerSuccess({
        token: res.data.token,
        username: res.data.username,
        faculty_name: res.data.faculty_name,
        role: res.data.role,
      });
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          err.message ||
          'Wrong username or password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length < 6) {
      setErrorMsg('Please enter all 6 numbers.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/verify-2fa/', {
        username: twoFactorData.username,
        otp: cleanOtp,
        temp_token: twoFactorData.temp_token,
      });

      triggerSuccess({
        token: res.data.token,
        username: res.data.username,
        faculty_name: res.data.faculty_name,
        role: res.data.role,
      });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.response?.data?.detail || 'Wrong or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || resendingOtp) return;
    setErrorMsg(null);
    setResendingOtp(true);

    try {
      await apiClient.post('/auth/resend-2fa-otp/', { username: twoFactorData.username });
      setSuccessMsg('A new code was sent to your phone.');
      setOtpCooldown(60);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Could not send a new code.');
    } finally {
      setResendingOtp(false);
    }
  };

  const safeSchoolLogo = isSafeImageUrl(school.school_logo) ? school.school_logo : null;
  const schoolTitle = school.school_name || 'Macasandig National High School';

  const features = [
    {
      icon: <QrCode size={18} color="#38bdf8" />,
      title: 'Fast Classroom QR Scanning',
      desc: 'Scan student ID cards using a USB scanner on any faculty laptop, even without internet.',
    },
    {
      icon: <Smartphone size={18} color="#34d399" />,
      title: 'Mobile Faculty Check-In',
      desc: 'Faculty members check in easily using their own phone camera and school location.',
    },
    {
      icon: <FileSpreadsheet size={18} color="#fbbf24" />,
      title: 'Ready-to-Print School Forms',
      desc: 'Creates official SF1, SF2, SF4 attendance sheets and faculty DTR forms automatically.',
    },
    {
      icon: <BellRing size={18} color="#f472b6" />,
      title: 'Instant Parent Updates',
      desc: 'Sends automatic phone alerts to parents when students arrive or receive an exit pass.',
    },
  ];

  const themeChoices: { key: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { key: 'light', label: 'Light', icon: <Sun size={13} /> },
    { key: 'dark', label: 'Dark', icon: <Moon size={13} /> },
    { key: 'high-contrast', label: 'Daylight', icon: <Eye size={13} /> },
  ];

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 15% 20%, #0f294a 0%, #071120 55%, #030712 100%)',
        padding: 'clamp(12px, 3vw, 28px)',
        boxSizing: 'border-box',
        position: 'relative',
        overflowX: 'hidden',
        overflowY: 'auto',
        fontFamily: fonts.sans,
      }}
    >
      <style>{`
        @keyframes auroraFloatOne {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(28px, -22px) scale(1.08); }
        }
        @keyframes auroraFloatTwo {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-24px, 26px) scale(1.06); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(16px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes formFadeSlide {
          from { opacity: 0; transform: translateX(8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.35); }
          50% { box-shadow: 0 0 0 8px rgba(56, 189, 248, 0); }
        }
        .auth-shell {
          display: flex;
          flex-direction: row;
          width: 100%;
          max-width: 1080px;
          min-height: 610px;
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 28px 70px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.09);
          animation: cardEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          position: relative;
          z-index: 2;
        }
        .auth-hero-pane {
          flex: 1.12;
          background: linear-gradient(150deg, #0284c7 0%, #004b87 48%, #022444 100%);
          padding: clamp(24px, 4vw, 42px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          color: #ffffff;
          position: relative;
          overflow: hidden;
        }
        .aurora-orb-1 {
          position: absolute;
          top: -70px;
          right: -60px;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.38) 0%, rgba(56, 189, 248, 0) 70%);
          animation: auroraFloatOne 9s ease-in-out infinite;
          pointer-events: none;
        }
        .aurora-orb-2 {
          position: absolute;
          bottom: -80px;
          left: -50px;
          width: 310px;
          height: 310px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0) 70%);
          animation: auroraFloatTwo 11s ease-in-out infinite;
          pointer-events: none;
        }
        .glass-feature-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .glass-feature-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 11px 14px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(8px);
          transition: transform 0.22s ease, background 0.22s ease, border-color 0.22s ease;
        }
        .glass-feature-card:hover {
          transform: translateX(5px);
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(125, 211, 252, 0.45);
        }
        .auth-form-pane {
          flex: 1.08;
          padding: clamp(24px, 4vw, 46px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          transition: background-color 0.25s ease;
        }
        .form-animate-body {
          animation: formFadeSlide 0.28s ease-out forwards;
        }
        @media (max-width: 920px) {
          .auth-shell {
            flex-direction: column-reverse;
            max-width: 540px;
            min-height: auto;
          }
          .glass-feature-grid {
            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          }
        }
        @media (max-width: 520px) {
          .auth-shell {
            border-radius: 16px;
          }
          .glass-feature-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Ambient Glow */}
      <div
        style={{
          position: 'fixed',
          top: '8%',
          left: '6%',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(2, 132, 199, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="auth-shell">
        {/* LEFT SHOWCASE PANEL */}
        <div className="auth-hero-pane">
          <div className="aurora-orb-1" />
          <div className="aurora-orb-2" />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 9,
                padding: '6px 14px',
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                borderRadius: 9999,
                marginBottom: 20,
                backdropFilter: 'blur(6px)',
                maxWidth: '100%',
              }}
            >
              {safeSchoolLogo ? (
                <img
                  src={safeSchoolLogo}
                  alt="School Logo"
                  style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'contain', flexShrink: 0 }}
                />
              ) : (
                <School size={17} color="#7dd3fc" style={{ flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  letterSpacing: '0.2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {schoolTitle}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.75rem, 3.2vw, 2.35rem)',
                  fontWeight: 900,
                  lineHeight: 1.1,
                  letterSpacing: '-0.6px',
                  fontFamily: fonts.display,
                }}
              >
                AttendSure <span style={{ color: '#7dd3fc' }}></span>
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 9px',
                  borderRadius: 9999,
                  backgroundColor: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(125, 211, 252, 0.4)',
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  color: '#e0f2fe',
                  animation: 'badgePulse 3s infinite',
                }}
              >
                <Sparkles size={11} /> SCHOOL SYSTEM
              </span>
            </div>

            <p style={{ margin: 0, fontSize: '0.90rem', color: '#e0f2fe', lineHeight: 1.55, maxWidth: 420 }}>
              Simple classroom attendance tracking, faculty mobile check-in, and ready-to-print school reports.
            </p>

            <div className="glass-feature-grid">
              {features.map((feat, idx) => (
                <div key={idx} className="glass-feature-card">
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      backgroundColor: 'rgba(15, 23, 42, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {feat.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#ffffff' }}>{feat.title}</div>
                    <div style={{ fontSize: '0.73rem', color: '#bae6fd', lineHeight: 1.35, marginTop: 2 }}>
                      {feat.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              borderTop: '1px solid rgba(255, 255, 255, 0.18)',
              paddingTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: '0.73rem',
              color: '#bae6fd',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={15} color="#34d399" /> For School Faculty &amp; Staff Only
            </span>
            <span style={{ opacity: 0.85, fontWeight: 700 }}>by TECHBLAZER</span>
          </div>
        </div>

        {/* RIGHT SIGN-IN PANEL */}
        <div className="auth-form-pane" style={{ backgroundColor: tokens.bgSurface }}>
          {/* Brand Header & Color Mode Switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 22,
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: tokens.primaryLight,
                  border: `1px solid ${brand.primary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AttendSureLogoAsset size={22} alt="AttendSure" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: tokens.textPrimary, lineHeight: 1.15 }}>
                  {step === 'LOGIN' ? 'Welcome Back' : 'Confirm Code'}
                </div>
                <div style={{ fontSize: '0.74rem', color: tokens.textMuted, marginTop: 2 }}>
                  {step === 'LOGIN'
                    ? 'Sign in with your school account'
                    : 'Enter the 6-digit code sent to your phone'}
                </div>
              </div>
            </div>

            {/* Color Switcher */}
            <div
              style={{
                display: 'flex',
                backgroundColor: tokens.bgSurfaceSubtle,
                padding: 3,
                borderRadius: 9999,
                border: `1px solid ${tokens.borderSubtle}`,
                flexShrink: 0,
              }}
            >
              {themeChoices.map((tc) => {
                const active = mode === tc.key;
                return (
                  <button
                    key={tc.key}
                    type="button"
                    title={`${tc.label} Mode`}
                    onClick={() => setThemeMode(tc.key)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: 'none',
                      backgroundColor: active ? brand.primary : 'transparent',
                      color: active ? '#ffffff' : tokens.textMuted,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tc.icon}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Admin-Issued Account Notice */}
          {step === 'LOGIN' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 12,
                marginBottom: 20,
                backgroundColor: tokens.primaryLight,
                border: `1px solid ${tokens.borderSubtle}`,
              }}
            >
              <Lock size={16} color={brand.primary} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.76rem', color: tokens.textSecondary, lineHeight: 1.35 }}>
                Accounts are provided by the <strong style={{ color: tokens.textPrimary }}>School Admin</strong>. Contact your office if you need a username or password reset.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    backgroundColor: tokens.primaryLight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <KeyRound size={18} color={brand.primary} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: tokens.textPrimary }}>
                    Enter Code
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>
                    Check your phone messages
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('LOGIN');
                  setErrorMsg(null);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  color: brand.primary,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            </div>
          )}

          {/* Feedback Alerts */}
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                backgroundColor: tokens.dangerLight,
                color: brand.danger,
                borderRadius: 10,
                marginBottom: 16,
                fontSize: '0.80rem',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                backgroundColor: tokens.successLight,
                color: brand.success,
                borderRadius: 10,
                marginBottom: 16,
                fontSize: '0.80rem',
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* STEP 1: SIGN IN FORM */}
          {step === 'LOGIN' && (
            <form
              key="login-form"
              className="form-animate-body"
              onSubmit={handleLoginSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <TextInput
                  label="Username or Employee ID"
                  type="text"
                  required
                  placeholder="Enter your username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.80rem', fontWeight: 700, color: tokens.textPrimary }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: brand.primary,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <TextInput
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={<LogIn size={16} />}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 0',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: '0.90rem',
                }}
              >
                Sign In
              </Button>
            </form>
          )}

          {/* STEP 2: 2FA CODE FORM */}
          {step === '2FA' && (
            <form
              key="2fa-form"
              className="form-animate-body"
              onSubmit={handleOtpSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: tokens.infoLight,
                  borderRadius: 10,
                  border: `1px solid ${brand.secondary}`,
                }}
              >
                <span style={{ fontSize: '0.80rem', color: tokens.textPrimary, lineHeight: 1.45, display: 'block' }}>
                  Enter the 6-digit code sent to <strong>{twoFactorData.masked_phone}</strong>.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: tokens.textPrimary, marginBottom: 6 }}>
                  6-Digit Code *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${tokens.borderStrong}`,
                    backgroundColor: tokens.bgSurfaceSubtle,
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    letterSpacing: '8px',
                    textAlign: 'center',
                    fontFamily: fonts.mono,
                    color: tokens.textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: tokens.textSecondary }}>No code received?</span>
                <button
                  type="button"
                  disabled={otpCooldown > 0 || resendingOtp}
                  onClick={handleResendOtp}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    color: otpCooldown > 0 ? tokens.textMuted : brand.primary,
                    fontWeight: 700,
                    cursor: otpCooldown > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RotateCw size={12} className={resendingOtp ? 'animate-spin' : ''} />
                  {otpCooldown > 0 ? `Wait ${otpCooldown}s` : 'Send Again'}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={<ShieldCheck size={16} />}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: '12px 0',
                  borderRadius: 10,
                  fontWeight: 800,
                  fontSize: '0.90rem',
                }}
              >
                Confirm
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;