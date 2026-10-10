/**
 * AttendSure V3 - Lightweight Campus Authentication & 2FA Modal View
 * File: frontend/src/components/auth/LoginView.tsx
 *
 * Capabilities:
 * - Dynamic school logo and title from SchoolContext with local SVG fallback.
 * - Password visibility toggle for touchscreens and desktop entry.
 * - Automated 2FA challenge handling via SMS OTP with resend countdown timer.
 * - Comprehensive error parsing supporting DRF 'detail' and 'error' payloads.
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import appLogoSrc from '../../assets/AppLogo.svg';
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
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (session: UserSession) => void;
}

interface TwoFactorPayload {
  username: string;
  masked_phone: string;
  temp_token?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const { school } = useSchool();

  const [step, setStep] = useState<'CREDENTIALS' | '2FA'>('CREDENTIALS');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Two-Factor Authentication State
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorPayload>({
    username: '',
    masked_phone: '',
    temp_token: '',
  });
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [resendingOtp, setResendingOtp] = useState(false);

  // Browser-safe OTP resend cooldown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => {
      setOtpCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login/', {
        username: identifier.trim(),
        password,
      });

      // Intercept 2FA Security Challenge
      if (
        res.data.requires_2fa ||
        res.data.two_factor_required ||
        res.data.status === '2FA_REQUIRED'
      ) {
        setTwoFactorData({
          username: res.data.username || identifier.trim(),
          masked_phone: res.data.masked_phone || res.data.phone || 'your registered mobile number',
          temp_token: res.data.temp_token || '',
        });
        setOtpCode('');
        setOtpCooldown(60);
        setStep('2FA');
        setSuccessMsg(
          res.data.message || 'Security verification required. A 6-digit OTP code has been dispatched via SMS.'
        );
        return;
      }

      // Direct Login (When 2FA is disabled for account)
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
      setError(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.message ||
        'Invalid username or password.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length < 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.post('/auth/verify-2fa/', {
        username: twoFactorData.username,
        otp: cleanOtp,
        temp_token: twoFactorData.temp_token,
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
      setError(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Invalid or expired verification code.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || resendingOtp) return;
    setError(null);
    setResendingOtp(true);

    try {
      await apiClient.post('/auth/resend-2fa-otp/', {
        username: twoFactorData.username,
      });
      setSuccessMsg('A new verification code has been dispatched via SMS.');
      setOtpCooldown(60);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to dispatch new OTP code via SMS.');
    } finally {
      setResendingOtp(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#eef2f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          backgroundColor: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
          padding: '38px 36px 32px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* Institutional Branding Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, textAlign: 'center' }}>
          <img
            src={school.school_logo || appLogoSrc}
            alt="School Logo"
            width={64}
            height={64}
            style={{ objectFit: 'contain', borderRadius: '50%', marginBottom: 10 }}
          />
          <h1 style={{ margin: '0 0 4px 0', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            {school.school_name || 'AttendSure V3'}
          </h1>
          <div style={{ fontSize: '0.80rem', color: '#64748b', fontWeight: 500 }}>
            {step === 'CREDENTIALS' ? 'School Attendance & Security Portal' : 'Two-Factor Authentication'}
          </div>
        </div>

        {/* Error Feedback Banner */}
        {error && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              borderRadius: '8px',
              fontSize: '0.80rem',
              marginBottom: 16,
              boxSizing: 'border-box',
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Feedback Banner */}
        {successMsg && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              backgroundColor: '#ecfdf5',
              color: '#059669',
              borderRadius: '8px',
              fontSize: '0.80rem',
              marginBottom: 16,
              boxSizing: 'border-box',
              lineHeight: 1.4,
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 1: CREDENTIALS LOGIN */}
        {step === 'CREDENTIALS' ? (
          <form onSubmit={handleCredentialSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Username or DepEd Email
              </label>
              <input
                type="text"
                required
                placeholder="e.g. juan.delacruz"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  color: '#1e293b',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    fontWeight: 600,
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
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  color: '#1e293b',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 6,
                boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.25)',
              }}
            >
              {loading && <Loader2 className="animate-spin" size={18} />}
              Sign In to Dashboard
            </button>
          </form>
        ) : (
          /* STEP 2: 2FA SECURITY OTP CHALLENGE */
          <form onSubmit={handleOtpSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                backgroundColor: '#f0f9ff',
                borderRadius: 8,
                border: '1px solid #bae6fd',
                fontSize: '0.78rem',
                color: '#0369a1',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={16} />
                <span>Code sent to <strong>{twoFactorData.masked_phone}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('CREDENTIALS');
                  setError(null);
                  setSuccessMsg(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <ArrowLeft size={12} /> Edit
              </button>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Enter 6-Digit OTP *
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
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '1.35rem',
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: '#64748b' }}>Didn&apos;t receive SMS?</span>
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
                  color: otpCooldown > 0 ? '#94a3b8' : '#0284c7',
                  fontWeight: 700,
                  cursor: otpCooldown > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <RotateCw size={12} className={resendingOtp ? 'animate-spin' : ''} />
                {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend OTP'}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 6,
                boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.25)',
              }}
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              Verify &amp; Sign In
            </button>
          </form>
        )}

        <div style={{ marginTop: 28, fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
          AttendSure • Unified Campus Attendance &amp; Security
        </div>
      </div>
    </div>
  );
};

export default LoginView;