/**
 * AttendSure V3 - Official Campus Sign In
 * Clean, Pure White Institutional Interface with AttendSure Logo Navy Palette.
 * File: web/src/components/auth/LoginView.tsx
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
  CheckCircle2,
  Lock,
  User,
  ArrowLeft,
  RotateCw,
  KeyRound,
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

  const [step, setStep] = useState<'LOGIN' | 'OTP'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [twoFactor, setTwoFactor] = useState<TwoFactorData>({ username: '', phone: '' });
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMessage('Please enter your username or Employee ID.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login/', {
        username: cleanUsername,
        password,
      });

      if (res.data.requires_2fa || res.data.two_factor_required || res.data.status === '2FA_REQUIRED') {
        setTwoFactor({
          username: res.data.username || cleanUsername,
          phone: res.data.masked_phone || res.data.phone || 'registered mobile phone',
          tempToken: res.data.temp_token || '',
        });
        setOtpCode('');
        setOtpTimer(60);
        setStep('OTP');
        setSuccessMessage('A 6-digit verification code has been sent to your phone.');
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

      window.dispatchEvent(new CustomEvent('attendsure:auth-success'));
      onLoginSuccess(session);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Invalid username or password. Please verify your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCode = otpCode.trim().replace(/\D/g, '');
    if (cleanCode.length < 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
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

      window.dispatchEvent(new CustomEvent('attendsure:auth-success'));
      onLoginSuccess(session);
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'The verification code is incorrect or has expired.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpTimer > 0 || resending) return;
    setErrorMessage(null);
    setResending(true);

    try {
      await apiClient.post('/auth/resend-2fa-otp/', {
        username: twoFactor.username,
      });
      setSuccessMessage('A fresh verification code has been dispatched to your phone.');
      setOtpTimer(60);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || 'Unable to send SMS verification code right now.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="portal-canvas">
      <style>{`
        .portal-canvas {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100vw;
          background-color: #F1F5F9;
          display: flex;
          flex-direction: column;
          align-items: center;
          justifyContent: center;
          padding: 24px 16px;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          user-select: none;
        }

        .portal-wrapper {
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin: auto 0;
        }

        .portal-card {
          position: relative;
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 20px;
          box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.08), 0 4px 12px -2px rgba(15, 23, 42, 0.04);
          padding: 36px 32px;
          box-sizing: border-box;
          width: 100%;
        }

        .portal-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin-bottom: 24px;
        }

        .brand-logo-frame {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
        }

        .brand-logo-frame img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .portal-title {
          font-size: 1.45rem;
          font-weight: 800;
          color: #0F172A;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .school-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 14px;
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 9999px;
          margin-top: 10px;
          max-width: 100%;
        }

        .school-pill span {
          font-size: 0.72rem;
          font-weight: 600;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          font-size: 0.76rem;
          font-weight: 700;
          color: #475569;
        }

        .field-box {
          position: relative;
          display: flex;
          align-items: center;
        }

        .field-icon {
          position: absolute;
          left: 14px;
          color: #94A3B8;
          pointer-events: none;
        }

        .portal-input {
          width: 100%;
          height: 44px;
          padding: 10px 14px 10px 42px;
          border-radius: 10px;
          border: 1px solid #CBD5E1;
          background-color: #F8FAFC;
          font-size: 14px;
          color: #0F172A;
          outline: none;
          box-sizing: border-box;
          font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
        }

        .portal-input:focus {
          border-color: #004B87;
          background-color: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(0, 75, 135, 0.15);
        }

        .toggle-pw-btn {
          position: absolute;
          right: 12px;
          background: none;
          border: none;
          color: #94A3B8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }

        .toggle-pw-btn:hover {
          color: #475569;
        }

        .btn-submit {
          width: 100%;
          height: 44px;
          border-radius: 10px;
          background: #004B87;
          color: #FFFFFF;
          border: none;
          font-weight: 700;
          font-size: 0.88rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit;
          transition: background-color 0.15s, opacity 0.15s;
        }

        .btn-submit:hover:not(:disabled) {
          background-color: #003865;
        }

        .btn-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .portal-footer {
          font-size: 0.72rem;
          color: #64748B;
          text-align: center;
          width: 100%;
          user-select: none;
        }

        .footer-brand {
          font-weight: 700;
          color: #0F172A;
        }

        @media (max-width: 480px) {
          .portal-card {
            padding: 28px 20px;
            border-radius: 16px;
          }
        }
      `}</style>

      <div className="portal-wrapper">
        <div className="portal-card">
          <div className="portal-header">
            <div className="brand-logo-frame">
              <img
                src="/splash.svg"
                alt="AttendSure Logo"
                onError={(e) => {
                  e.currentTarget.src = '/public/splash.svg';
                }}
              />
            </div>
            <h1 className="portal-title">AttendSure</h1>

            <div className="school-pill">
              {school.school_logo && (
                <img
                  src={school.school_logo}
                  alt="School Seal"
                  width={14}
                  height={14}
                  style={{ objectFit: 'contain', borderRadius: '50%' }}
                />
              )}
              <span>{school.school_name || 'Lapasan National High School'}</span>
            </div>
          </div>

          {errorMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#B91C1C',
                borderRadius: '8px',
                fontSize: '0.80rem',
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
                padding: '10px 14px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10B981',
                color: '#065F46',
                borderRadius: '8px',
                fontSize: '0.80rem',
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
              <div className="field-group">
                <label className="field-label">Username or Employee ID</label>
                <div className="field-box">
                  <User size={15} className="field-icon" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. faculty_admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="portal-input"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="field-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="field-label">Password</label>
                  <a
                    href="#forgot"
                    onClick={(e) => {
                      e.preventDefault();
                      setErrorMessage('Please contact your School Administrator to reset your password.');
                    }}
                    style={{ fontSize: '0.74rem', color: '#004B87', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Forgot Password?
                  </a>
                </div>
                <div className="field-box">
                  <Lock size={15} className="field-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="portal-input"
                    style={{ paddingRight: '40px' }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="toggle-pw-btn"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-submit" style={{ marginTop: 6 }}>
                {loading ? <Loader2 className="animate-spin" size={17} /> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.78rem',
                  color: '#475569',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <KeyRound size={15} color="#004B87" style={{ flexShrink: 0 }} />
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
                    color: '#004B87',
                    fontWeight: 700,
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <ArrowLeft size={13} /> Edit
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    letterSpacing: '8px',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                <span style={{ color: '#64748B' }}>Didn&apos;t receive code?</span>
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
                    color: otpTimer > 0 ? '#94A3B8' : '#004B87',
                    fontWeight: 700,
                    cursor: otpTimer > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RotateCw size={13} className={resending ? 'animate-spin' : ''} />
                  {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend Code'}
                </button>
              </div>

              <button type="submit" disabled={loading} className="btn-submit">
                {loading ? <Loader2 className="animate-spin" size={17} /> : 'Verify & Enter'}
              </button>
            </form>
          )}
        </div>

        <footer className="portal-footer">
          <span>&copy; 2026 AttendSure</span>
          <span> &bull; </span>
          <span className="footer-brand">TECHBLAZER</span>
        </footer>
      </div>
    </div>
  );
};

export default LoginView;