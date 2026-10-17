/**
 * AttendSure V3 - Top Application Navigation Bar
 * Developer: TECHBLAZER
 * File: frontend/src/components/layout/Header.tsx
 */

import React, { useState, useEffect } from 'react';
import type { UserSession } from '../../types/section';
import type { NavItemKey } from './Sidebar';
import {
  Bell,
  Clock,
  Radio,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  title: string;
  isGateNodeOnline: boolean;
  session: UserSession | null;
  userPhoto?: string | null;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  onLogout: () => void;
  onNavigateTab: (tab: NavItemKey) => void;
  onOpenProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  isGateNodeOnline,
  session,
  userPhoto,
  schoolName,
  onLogout,
  onOpenProfile,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  // Live Philippine Standard Time clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' PST'
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Remove repeated school name prefix from the title
  const cleanTitle = title.replace(schoolName ? `${schoolName} ` : '', '');

  return (
    <header
      style={{
        height: 60,
        minHeight: 60,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 40,
      }}
    >
      {/* 1. View Title with Subtle Breadcrumb */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {schoolName && (
          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
            {schoolName}
          </span>
        )}
        <h1
          style={{
            fontSize: '1.18rem',
            fontWeight: 800,
            color: '#0f172a',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          {cleanTitle}
        </h1>
      </div>

      {/* 2. Top-Right Status Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Real-time Clock Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 34,
            padding: '0 12px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: '0.76rem',
            color: '#475569',
            fontFamily: 'monospace',
            fontWeight: 600,
          }}
        >
          <Clock size={14} color="#0284c7" />
          <span>{currentTime}</span>
        </div>

        {/* Dynamic Gate Scanner Status Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 34,
            padding: '0 12px',
            borderRadius: 8,
            backgroundColor: isGateNodeOnline ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${isGateNodeOnline ? '#a7f3d0' : '#fca5a5'}`,
            fontSize: '0.76rem',
            fontWeight: 700,
            color: isGateNodeOnline ? '#059669' : '#dc2626',
          }}
        >
          <Radio size={14} className={isGateNodeOnline ? 'animate-pulse' : ''} />
          <span>Gate Scanner: {isGateNodeOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Notifications Icon Button */}
        <button
          type="button"
          title="Notifications"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
          onClick={() => {}}
        >
          <Bell size={16} />
        </button>

        {/* Profile Dropdown Menu Trigger */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 8px 0 4px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {userPhoto ? (
              <img
                src={userPhoto}
                alt="Avatar"
                style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {session?.faculty_name ? session.faculty_name.charAt(0) : 'U'}
              </div>
            )}
            <ChevronDown size={14} color="#64748b" />
          </button>

          {/* User Options Dropdown */}
          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 0,
                width: 170,
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 8px 18px rgba(0, 0, 0, 0.08)',
                padding: '6px 0',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 100,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenProfile();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.80rem',
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <User size={14} /> My Profile
              </button>
              <div style={{ height: 1, backgroundColor: '#f1f5f9', margin: '4px 0' }} />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onLogout();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 14px',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.80rem',
                  color: '#dc2626',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontWeight: 600,
                }}
              >
                <LogOut size={14} /> Log Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;