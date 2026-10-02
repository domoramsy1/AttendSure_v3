import React, { useState } from 'react';
import apiClient from '../../api/client';
import appLogoSrc from '../../assets/AppLogo.svg';
import type { UserSession } from '../../types/section';
import { Loader2, AlertCircle } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (session: UserSession) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login/', {
        username: identifier,
        password: password,
      });

      const session: UserSession = {
        token: res.data.token,
        username: res.data.username,
        staff_name: res.data.staff_name,
        role: res.data.role,
      };

      localStorage.setItem('attendsure_token', session.token);
      localStorage.setItem('attendsure_username', session.username);
      localStorage.setItem('attendsure_staff_name', session.staff_name);
      localStorage.setItem('attendsure_role', session.role);

      onLoginSuccess(session);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid username or password.');
    } finally {
      setLoading(false);
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
          padding: '42px 36px 32px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <img src={appLogoSrc} alt="AttendSure Logo" width={58} height={58} style={{ objectFit: 'contain' }} />
          <h1 style={{ margin: '12px 0 4px 0', fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
            AttendSure
          </h1>
          <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
            School Attendance & Gate Management
          </div>
        </div>

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
              fontSize: '0.8rem',
              marginBottom: 16,
              boxSizing: 'border-box',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              required
              placeholder="admin"
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
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
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
              backgroundColor: '#0084d1',
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
              boxShadow: '0 4px 6px -1px rgba(0, 132, 209, 0.2)',
            }}
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            Sign In
          </button>
        </form>

        <div style={{ marginTop: 32, fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center' }}>
          AttendSure • Unified Campus Attendance & Security
        </div>
      </div>
    </div>
  );
};