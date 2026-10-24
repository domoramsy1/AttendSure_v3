/**
 * AttendSure V3 - Official Campus Authentication Portal
 * Developed by TECHBLAZER
 * File: frontend/src/components/auth/LoginView.tsx
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useSchool } from '../../context/SchoolContext';
import type { UserSession } from '../../types/section';
import {
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  RotateCw,
  ArrowLeft,
  CheckCircle2,
  QrCode,
  MapPin,
  Bell,
  Lock,
  User,
  ExternalLink,
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (session: UserSession) => void;
}

interface TwoFactorData {
  username: string;
  phone: string;
  tempToken?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { school } = useSchool();

  // Screen and input states
  const [step, setStep] = useState<'LOGIN' | 'OTP'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 2FA OTP verification states
  const [twoFactor, setTwoFactor] = useState<TwoFactorData>({ username: '', phone: '' });
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [resending, setResending] = useState(false);

  // OTP resend countdown
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Handle standard login submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login/', {
        username: username.trim(),
        password,
      });

      if (res.data.requires_2fa || res.data.two_factor_required || res.data.status === '2FA_REQUIRED') {
        setTwoFactor({
          username: res.data.username || username.trim(),
          phone: res.data.masked_phone || res.data.phone || 'your phone number',
          tempToken: res.data.temp_token || '',
        });
        setOtpCode('');
        setOtpTimer(60);
        setStep('OTP');
        setSuccessMessage('A 6-digit code has been sent to your registered phone.');
        return;
      }

      const session: UserSession = {
        token: res.data.token,
        username: res.data.username,
        faculty_name: res.data.faculty_name,
        role: res.data.role,
      };

      localStorage.setItem('attendsure_token', session.token);
      localStorage.setItem('attendsure_username', session.username);
      localStorage.setItem('attendsure_faculty_name', session.faculty_name);
      localStorage.setItem('attendsure_role', session.role);

      onLoginSuccess(session);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Invalid username or password.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle SMS OTP verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = otpCode.trim();
    if (cleanCode.length < 6) {
      setErrorMessage('Please type the full 6-digit code.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.post('/auth/verify-2fa/', {
        username: twoFactor.username,
        otp: cleanCode,
        temp_token: twoFactor.tempToken,
      });

      const session: UserSession = {
        token: res.data.token,
        username: res.data.username,
        faculty_name: res.data.faculty_name,
        role: res.data.role,
      };

      localStorage.setItem('attendsure_token', session.token);
      localStorage.setItem('attendsure_username', session.username);
      localStorage.setItem('attendsure_faculty_name', session.faculty_name);
      localStorage.setItem('attendsure_role', session.role);

      onLoginSuccess(session);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'The verification code is incorrect or expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP SMS
  const handleResendOtp = async () => {
    if (otpTimer > 0 || resending) return;
    setErrorMessage(null);
    setResending(true);

    try {
      await apiClient.post('/auth/resend-2fa-otp/', {
        username: twoFactor.username,
      });
      setSuccessMessage('A fresh code was sent to your phone.');
      setOtpTimer(60);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Could not send SMS code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="portal-root">
      <style>{`
        .portal-root {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background: linear-gradient(145deg, #f8fafc 0%, #edf2f7 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: clamp(16px, 3vh, 36px) clamp(16px, 4vw, 40px);
          box-sizing: border-box;
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow-x: hidden;
          overflow-y: auto;
        }

        .portal-grid {
          width: 100%;
          max-width: 1120px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: clamp(24px, 5vw, 64px);
          margin: auto 0;
          box-sizing: border-box;
        }

        .portal-left {
          flex: 1 1 480px;
          max-width: 560px;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        .institution-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 6px 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
          width: fit-content;
          max-width: 100%;
          margin-bottom: clamp(14px, 2vh, 22px);
          box-sizing: border-box;
        }

        .institution-title {
          font-size: clamp(0.80rem, 1.4vw, 0.88rem);
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .institution-sub {
          font-size: clamp(0.74rem, 1.2vw, 0.80rem);
          color: #64748b;
          white-space: nowrap;
        }

        .product-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: clamp(12px, 2vh, 18px);
        }

        .product-icon {
          width: clamp(44px, 5vw, 54px);
          height: clamp(44px, 5vw, 54px);
          border-radius: 14px;
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 20px rgba(2, 132, 199, 0.25);
          flex-shrink: 0;
        }

        .product-icon img {
          width: 60%;
          height: 60%;
          object-fit: contain;
          filter: brightness(0) invert(1);
        }

        .product-name {
          font-size: clamp(2rem, 3.8vw, 2.6rem);
          font-weight: 800;
          color: #0284c7;
          letter-spacing: -0.03em;
          line-height: 1;
        }

        .portal-headline {
          font-size: clamp(1.4rem, 2.4vw, 1.95rem);
          font-weight: 800;
          color: #0f172a;
          line-height: 1.25;
          letter-spacing: -0.025em;
          margin: 0 0 clamp(10px, 1.5vh, 14px) 0;
        }

        .portal-summary {
          font-size: clamp(0.92rem, 1.4vw, 1rem);
          color: #64748b;
          line-height: 1.55;
          margin: 0 0 clamp(18px, 2.5vh, 28px) 0;
        }

        .features-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .feature-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(8px);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 2px 4px rgba(15, 23, 42, 0.02);
        }

        .feature-badge {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background-color: #e0f2fe;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0284c7;
          flex-shrink: 0;
        }

        .feature-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 2px;
        }

        .feature-desc {
          font-size: 0.80rem;
          color: #64748b;
          line-height: 1.35;
        }

        .portal-right {
          flex: 1 1 360px;
          max-width: 430px;
          width: 100%;
          box-sizing: border-box;
        }

        .auth-card {
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid rgba(226, 232, 240, 0.9);
          box-shadow: 0 12px 32px -4px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.03);
          padding: clamp(22px, 3.5vw, 32px) clamp(20px, 3vw, 28px);
          box-sizing: border-box;
          width: 100%;
        }

        .auth-card-header {
          margin-bottom: 20px;
        }

        .auth-card-title {
          font-size: clamp(1.15rem, 1.8vw, 1.3rem);
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.015em;
          margin: 0 0 4px 0;
        }

        .auth-card-subtitle {
          font-size: 0.84rem;
          color: #64748b;
          margin: 0;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .input-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: #334155;
        }

        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          color: #94a3b8;
          pointer-events: none;
        }

        .form-input {
          width: 100%;
          height: 48px;
          padding: 12px 14px 12px 42px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          background-color: #f8fafc;
          font-size: 16px;
          color: #0f172a;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
          transition: all 0.15s ease-in-out;
        }

        .form-input:focus {
          background-color: #ffffff;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
        }

        .eye-toggle-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .submit-btn {
          width: 100%;
          min-height: 46px;
          border-radius: 10px;
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          color: #ffffff;
          border: none;
          font-weight: 700;
          font-size: 0.98rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
          font-family: inherit;
          transition: opacity 0.15s ease;
          touch-action: manipulation;
        }

        .submit-btn:hover:not(:disabled) {
          opacity: 0.94;
        }

        .submit-btn:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .kiosk-card {
          margin-top: 18px;
          padding: 14px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          text-decoration: none;
          transition: background-color 0.15s ease;
        }

        .kiosk-card:hover {
          background: #dcfce7;
        }

        .kiosk-badge {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: #166534;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .portal-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding-top: 16px;
          user-select: none;
        }

        @media (max-width: 960px) {
          .portal-grid {
            flex-direction: column;
            align-items: center;
            gap: 24px;
            margin: 16px 0;
          }

          .portal-left {
            max-width: 100%;
            text-align: center;
            align-items: center;
          }

          .product-brand {
            justify-content: center;
          }

          .features-grid {
            display: none;
          }

          .portal-right {
            max-width: 440px;
          }
        }

        @media (max-width: 480px) {
          .portal-root {
            padding: 16px 12px;
          }

          .auth-card {
            padding: 22px 16px;
            border-radius: 16px;
          }
        }

        @media (max-height: 640px) {
          .portal-root {
            justify-content: flex-start;
            padding-top: 8px;
            padding-bottom: 8px;
          }

          .portal-grid {
            margin: 4px 0;
            gap: 12px;
          }

          .portal-headline,
          .portal-summary,
          .features-grid {
            display: none;
          }

          .portal-footer {
            padding-top: 8px;
          }
        }
      `}</style>

      {/* Main Grid */}
      <div className="portal-grid">
        {/* Left Side */}
        <div className="portal-left">
          <div className="institution-badge">
            {school.school_logo && (
              <img
                src={school.school_logo}
                alt="School Seal"
                width={22}
                height={22}
                style={{ objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
              />
            )}
            <span className="institution-title">
              {school.school_name || 'Lapasan National High School'}
            </span>
            <span className="institution-sub">
              • {school.division ? `Division of ${school.division}` : 'DepEd Region X'}
            </span>
          </div>

          <div className="product-brand">
            <div className="product-icon">
              <img src="/splash.svg" alt="AttendSure" />
            </div>
            <span className="product-name">AttendSure</span>
          </div>

          <h1 className="portal-headline">
            Institutional campus security and attendance in real time.
          </h1>

          <p className="portal-summary">
            Log in with your official DepEd faculty credentials to manage daily records, verify gate telemetry, and track attendance.
          </p>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-badge">
                <MapPin size={16} />
              </div>
              <div>
                <div className="feature-title">Geofenced Time Logs</div>
                <div className="feature-desc">Bound to verified school campus coordinates.</div>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-badge">
                <QrCode size={16} />
              </div>
              <div>
                <div className="feature-title">Instant Gate Scans</div>
                <div className="feature-desc">Fast 1-second badge scans for teachers and students.</div>
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-badge">
                <Bell size={16} />
              </div>
              <div>
                <div className="feature-title">Automated SMS Dispatch</div>
                <div className="feature-desc">Real-time parent notifications on campus entry and exit.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side */}
        <div className="portal-right">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2 className="auth-card-title">
                {step === 'LOGIN' ? 'Portal Sign In' : 'Two-Factor Check'}
              </h2>
              <p className="auth-card-subtitle">
                {step === 'LOGIN'
                  ? 'Access your teacher or administrator account'
                  : 'Enter the verification code sent to your phone'}
              </p>
            </div>

            {errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #ef4444',
                  color: '#991b1b',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  marginBottom: 16,
                  lineHeight: 1.4,
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  backgroundColor: '#e0f2fe',
                  border: '1px solid #0284c7',
                  color: '#0369a1',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  marginBottom: 16,
                  lineHeight: 1.4,
                }}
              >
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>{successMessage}</span>
              </div>
            )}

            {step === 'LOGIN' ? (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="input-group">
                  <label className="input-label">Username or Faculty ID</label>
                  <div className="input-wrapper">
                    <User size={16} className="input-icon" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. faculty_admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="form-input"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                </div>

                <div className="input-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="input-label">Password</label>
                    <a
                      href="#forgot"
                      onClick={(e) => {
                        e.preventDefault();
                        setErrorMessage('Please contact your School ICT Coordinator to reset your password.');
                      }}
                      style={{ fontSize: '0.78rem', color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Forgot?
                    </a>
                  </div>
                  <div className="input-wrapper">
                    <Lock size={16} className="input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="form-input"
                      style={{ paddingRight: '42px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="eye-toggle-btn"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className="submit-btn" style={{ marginTop: 4 }}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : 'Log In'}
                </button>

                <div
                  className="kiosk-card"
                  onClick={() => (window.location.href = '/kiosk')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="kiosk-badge">
                      <QrCode size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#166534' }}>
                        Gate Scanner Terminal
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#15803d' }}>
                        Switch this device into standalone QR mode
                      </div>
                    </div>
                  </div>
                  <ExternalLink size={15} color="#166534" />
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '10px',
                    border: '1px solid #bae6fd',
                    fontSize: '0.82rem',
                    color: '#0369a1',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <KeyRound size={15} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Code sent to <strong>{twoFactor.phone}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('LOGIN')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0284c7',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      flexShrink: 0,
                    }}
                  >
                    <ArrowLeft size={12} /> Edit
                  </button>
                </div>

                <div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="••••••"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    style={{
                      width: '100%',
                      height: '52px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '1.4rem',
                      fontWeight: 800,
                      letterSpacing: '8px',
                      textAlign: 'center',
                      fontFamily: 'monospace',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#64748b' }}>Didn&apos;t get SMS?</span>
                  <button
                    type="button"
                    disabled={otpTimer > 0 || resending}
                    onClick={handleResendOtp}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 'none',
                      color: otpTimer > 0 ? '#94a3b8' : '#0284c7',
                      fontWeight: 700,
                      cursor: otpTimer > 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <RotateCw size={14} className={resending ? 'animate-spin' : ''} />
                    {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend Code'}
                  </button>
                </div>

                <button type="submit" disabled={loading} className="submit-btn">
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                  Verify &amp; Enter Dashboard
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* TECHBLAZER Developer Signature */}
      <div className="portal-footer">
        <span style={{ fontSize: '0.74rem', color: '#8a8d91', letterSpacing: '0.04em' }}>from</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img
            src="/techblazer.svg"
            alt="TECHBLAZER"
            style={{ width: '20px', height: '20px', objectFit: 'contain' }}
          />
          <span
            style={{
              fontSize: '0.94rem',
              fontWeight: 800,
              color: '#0A1F3D',
              letterSpacing: '0.08em',
            }}
          >
            TECHBLAZER
          </span>
        </div>
      </div>
    </div>
  );
};

export default LoginView;