/**
 * AttendSure V3 - School Authentication & 2FA Security Portal
 * File: frontend/src/components/auth/AuthPage.tsx
 *
 * Capabilities:
 * - Dynamic school logo and name branding loaded from SchoolContext.
 * - Credential login with automated Two-Factor Authentication (2FA) SMS OTP challenge.
 * - Faculty registration with synchronized password toggles and role selection.
 * - Browser-safe OTP countdown timer with resend cooldown.
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { theme } from '../../theme/tokens';
import { useSchool } from '../../context/SchoolContext';
import { Button } from '../ui/Button';
import { TextInput, Select } from '../ui/FormControls';
import type { UserSession } from '../../types/section';
import type { LoginPayload, RegisterPayload } from '../../types/auth';
import { 
  School, 
  ShieldCheck, 
  Radio, 
  FileSpreadsheet, 
  MessageSquare, 
  LogIn, 
  UserPlus, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2,
  KeyRound,
  RotateCw,
  ArrowLeft
} from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: (session: UserSession) => void;
}

interface TwoFactorPayload {
  username: string;
  masked_phone: string;
  temp_token?: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const { school } = useSchool();
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER' | '2FA'>('LOGIN');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 2FA state
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorPayload>({
    username: '',
    masked_phone: '',
    temp_token: '',
  });
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [resendingOtp, setResendingOtp] = useState<boolean>(false);

  // Login form state
  const [loginForm, setLoginForm] = useState<LoginPayload>({
    username: '',
    password: '',
  });

  // Registration form state
  const [regForm, setRegForm] = useState<RegisterPayload>({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    employee_id: '',
    role: 'TEACHER',
    password: '',
    confirm_password: '',
  });

  // Handle OTP resend cooldown timer using browser-safe inference
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => {
      setOtpCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login/', loginForm);

      // Check if user requires 2FA SMS OTP verification
      if (res.data.requires_2fa || res.data.two_factor_required || res.data.status === '2FA_REQUIRED') {
        setTwoFactorData({
          username: res.data.username || loginForm.username,
          masked_phone: res.data.masked_phone || res.data.phone || 'your registered mobile number',
          temp_token: res.data.temp_token || '',
        });
        setOtpCode('');
        setOtpCooldown(60);
        setActiveTab('2FA');
        setSuccessMsg(res.data.message || 'Two-Factor Authentication required. A 6-digit OTP code has been dispatched via SMS.');
        return;
      }

      // Direct login when 2FA is not required
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

      onAuthSuccess(session);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.response?.data?.detail || err.message || 'Authentication failed. Please verify credentials.');
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
      setErrorMsg('Please enter the complete 6-digit verification code.');
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

      onAuthSuccess(session);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.response?.data?.detail || 'Invalid or expired 2FA OTP code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || resendingOtp) return;
    setErrorMsg(null);
    setResendingOtp(true);

    try {
      await apiClient.post('/auth/resend-2fa-otp/', {
        username: twoFactorData.username,
      });
      setSuccessMsg('A fresh verification code has been dispatched via SMS.');
      setOtpCooldown(60);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to dispatch new OTP code via SMS.');
    } finally {
      setResendingOtp(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (regForm.password !== regForm.confirm_password) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (regForm.password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/auth/register/', regForm);
      setSuccessMsg('Faculty account successfully created! Please sign in with your credentials.');
      setActiveTab('LOGIN');
      setLoginForm({ username: regForm.username, password: '' });
      setRegForm({
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        employee_id: '',
        role: 'TEACHER',
        password: '',
        confirm_password: '',
      });
    } catch (err: any) {
      const respData = err.response?.data;
      if (typeof respData === 'object' && respData !== null) {
        const firstKey = Object.keys(respData)[0];
        const val = respData[firstKey];
        setErrorMsg(Array.isArray(val) ? `${firstKey}: ${val[0]}` : String(val));
      } else {
        setErrorMsg('Failed to complete registration. Check input data or network connectivity.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0b1329',
        padding: '24px 16px',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        .auth-container {
          display: flex;
          width: 100%;
          max-width: 1080px;
          min-height: 640px;
          background-color: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4);
        }

        .auth-hero {
          flex: 1.1;
          background: linear-gradient(145deg, #0284c7 0%, #034f84 100%);
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          color: #ffffff;
        }

        .auth-form-card {
          flex: 1.2;
          padding: 44px 48px;
          display: flex;
          flex-direction: column;
          justifyContent: center;
          background-color: #ffffff;
        }

        @media (max-width: 880px) {
          .auth-container {
            flex-direction: column;
            max-width: 520px;
            min-height: auto;
          }
          .auth-hero {
            padding: 32px 24px;
          }
          .auth-form-card {
            padding: 32px 24px;
          }
        }
      `}</style>

      <div className="auth-container">
        {/* Left Side: Dynamic School & System Branding */}
        <div className="auth-hero">
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 14px',
                backgroundColor: 'rgba(255,255,255,0.15)',
                borderRadius: 20,
                marginBottom: 24,
                backdropFilter: 'blur(4px)',
              }}
            >
              {school.school_logo ? (
                <img
                  src={school.school_logo}
                  alt="School Emblem"
                  style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'contain' }}
                />
              ) : (
                <School size={18} color="#ffffff" />
              )}
              <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.5px' }}>
                {school.school_name || 'Lapasan National High School'}
              </span>
            </div>

            <h1 style={{ margin: '0 0 12px 0', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.2 }}>
              AttendSure <span style={{ color: '#7dd3fc' }}>V3</span>
            </h1>
            <p style={{ margin: 0, fontSize: '0.95rem', color: '#e0f2fe', lineHeight: 1.5, maxWidth: 380 }}>
              Automated Attendance Monitoring, Gate Clearance &amp; DepEd Report Generation.
            </p>

            <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 }}>
                  <Radio size={18} color="#ffffff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Dual-Credential Verification</div>
                  <div style={{ fontSize: '0.78rem', color: '#bae6fd' }}>Fast gate RFID taps with printed QR code failover fallback.</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 }}>
                  <FileSpreadsheet size={18} color="#ffffff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>DepEd Legal Canvas Reports</div>
                  <div style={{ fontSize: '0.78rem', color: '#bae6fd' }}>Official print engines for SF1, SF2, SF4, and CSC Form 48.</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 }}>
                  <MessageSquare size={18} color="#ffffff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Automated Parent Alerts &amp; 2FA</div>
                  <div style={{ fontSize: '0.78rem', color: '#bae6fd' }}>GSM modem SMS notifications on gate scans and secure login OTPs.</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 40, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: '#bae6fd' }}>
            <ShieldCheck size={16} />
            <span>Authorized Faculty &amp; Administrative Personnel Only</span>
          </div>
        </div>

        {/* Right Side: Interactive Login / Register / 2FA Form */}
        <div className="auth-form-card">
          {activeTab !== '2FA' ? (
            <div
              style={{
                display: 'flex',
                backgroundColor: theme.colors.surfaceSubtle,
                padding: 4,
                borderRadius: theme.radius.md,
                marginBottom: 24,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <button
                type="button"
                onClick={() => { setActiveTab('LOGIN'); setErrorMsg(null); }}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  border: 'none',
                  borderRadius: theme.radius.sm,
                  backgroundColor: activeTab === 'LOGIN' ? theme.colors.surface : 'transparent',
                  color: activeTab === 'LOGIN' ? theme.colors.primary : theme.colors.textSecondary,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'LOGIN' ? theme.shadows.sm : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <LogIn size={16} /> Sign In
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('REGISTER'); setErrorMsg(null); }}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  border: 'none',
                  borderRadius: theme.radius.sm,
                  backgroundColor: activeTab === 'REGISTER' ? theme.colors.surface : 'transparent',
                  color: activeTab === 'REGISTER' ? theme.colors.primary : theme.colors.textSecondary,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: activeTab === 'REGISTER' ? theme.shadows.sm : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
              >
                <UserPlus size={16} /> Register Faculty
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KeyRound size={18} color="#0284c7" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: theme.colors.textPrimary }}>
                    Security Verification (2FA)
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: theme.colors.textSecondary }}>
                    AttendSure Two-Factor Authentication
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setActiveTab('LOGIN'); setErrorMsg(null); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'none',
                  border: 'none',
                  color: theme.colors.primary,
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
                backgroundColor: theme.colors.dangerLight,
                color: theme.colors.danger,
                borderRadius: theme.radius.sm,
                marginBottom: 16,
                fontSize: '0.82rem',
                lineHeight: 1.4,
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
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
                backgroundColor: '#dcfce7',
                color: '#15803d',
                borderRadius: theme.radius.sm,
                marginBottom: 16,
                fontSize: '0.82rem',
                lineHeight: 1.4,
              }}
            >
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: LOGIN FORM */}
          {activeTab === 'LOGIN' && (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <TextInput
                  label="Username or DepEd Email"
                  type="text"
                  required
                  placeholder="e.g. juan.delacruz"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: theme.colors.textPrimary }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: theme.colors.textSecondary,
                      fontSize: '0.75rem',
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
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={<LogIn size={16} />}
                style={{ width: '100%', marginTop: 8, padding: '10px 0' }}
              >
                Sign In to Dashboard
              </Button>
            </form>
          )}

          {/* TAB 2: TWO-FACTOR AUTHENTICATION (2FA OTP) CHALLENGE */}
          {activeTab === '2FA' && (
            <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 14px', backgroundColor: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                <span style={{ fontSize: '0.80rem', color: '#0369a1', lineHeight: 1.45, display: 'block' }}>
                  A verification code has been dispatched to <strong>{twoFactorData.masked_phone}</strong>. Enter the 6-digit OTP code to authorize login.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.80rem', fontWeight: 700, color: theme.colors.textPrimary, marginBottom: 6 }}>
                  6-Digit Verification Code *
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
                    borderRadius: theme.radius.md,
                    border: `1.5px solid ${theme.colors.border}`,
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: theme.colors.textSecondary }}>Didn&apos;t receive code?</span>
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
                    color: otpCooldown > 0 ? theme.colors.textSecondary : theme.colors.primary,
                    fontWeight: 700,
                    cursor: otpCooldown > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <RotateCw size={12} className={resendingOtp ? 'animate-spin' : ''} />
                  {otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : 'Resend OTP via SMS'}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={<ShieldCheck size={16} />}
                style={{ width: '100%', marginTop: 8, padding: '10px 0' }}
              >
                Verify &amp; Enter Dashboard
              </Button>
            </form>
          )}

          {/* TAB 3: REGISTER FORM */}
          {activeTab === 'REGISTER' && (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextInput
                  label="First Name"
                  required
                  placeholder="Juan"
                  value={regForm.first_name}
                  onChange={(e) => setRegForm({ ...regForm, first_name: e.target.value })}
                />
                <TextInput
                  label="Last Name"
                  required
                  placeholder="Dela Cruz"
                  value={regForm.last_name}
                  onChange={(e) => setRegForm({ ...regForm, last_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextInput
                  label="Employee ID"
                  required
                  placeholder="e.g. 2049182"
                  value={regForm.employee_id}
                  onChange={(e) => setRegForm({ ...regForm, employee_id: e.target.value })}
                />
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: theme.colors.textPrimary }}>
                    System Role
                  </label>
                  <Select
                    value={regForm.role}
                    onChange={(e) => setRegForm({ ...regForm, role: e.target.value as any })}
                    style={{ width: '100%' }}
                  >
                    <option value="TEACHER">Faculty</option>
                    <option value="REGISTRAR">Registrar</option>
                    <option value="ADMIN">Administrator</option>
                  </Select>
                </div>
              </div>

              <TextInput
                label="Username"
                required
                placeholder="juan.delacruz"
                value={regForm.username}
                onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
              />

              <TextInput
                label="DepEd / School Email"
                type="email"
                required
                placeholder="juan.delacruz@deped.gov.ph"
                value={regForm.email}
                onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.colors.textSecondary,
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showPassword ? 'Hide Passwords' : 'Show Passwords'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Min 8 characters"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                />
                <TextInput
                  label="Confirm Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Re-type password"
                  value={regForm.confirm_password}
                  onChange={(e) => setRegForm({ ...regForm, confirm_password: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                loading={loading}
                icon={<UserPlus size={16} />}
                style={{ width: '100%', marginTop: 8, padding: '10px 0' }}
              >
                Register Faculty Account
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;