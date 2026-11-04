/**
 * AttendSure V3 - Institutional Top Navigation Bar
 * File: frontend/src/components/layout/Navbar.tsx
 *
 * Features:
 * - Dynamic school logo and institutional name from SchoolContext.
 * - Live Philippine Standard Time (PST) synchronized clock.
 * - Real-time Gate Scanner / Kiosk hardware telemetry status badge.
 * - Notification drawer trigger.
 * - User session avatar, role badge, and interactive profile/sign-out dropdown.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSchool } from '../../context/SchoolContext';
import {
  GraduationCap,
  Clock,
  Radio,
  Bell,
  LogOut,
  User,
  ShieldCheck,
  ChevronDown,
  Menu,
} from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
  isScannerOnline?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onToggleSidebar,
  isScannerOnline = true,
}) => {
  const { school } = useSchool();
  const [timeString, setTimeString] = useState<string>('');
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [hasUnreadAlerts] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Authenticated user session info from storage
  const facultyName = localStorage.getItem('attendsure_faculty_name') || 'Faculty User';
  const username = localStorage.getItem('attendsure_username') || 'admin';
  const role = (localStorage.getItem('attendsure_role') || 'ADMIN').toUpperCase();

  // Philippine Standard Time (PST) live clock ticker
  useEffect(() => {
    const updatePSTClock = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };

      try {
        const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
        const month = parts.find((p) => p.type === 'month')?.value || '';
        const day = parts.find((p) => p.type === 'day')?.value || '';
        const year = parts.find((p) => p.type === 'year')?.value || '';
        const hour = parts.find((p) => p.type === 'hour')?.value || '';
        const min = parts.find((p) => p.type === 'minute')?.value || '';
        const sec = parts.find((p) => p.type === 'second')?.value || '';
        const period = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() || 'AM';

        setTimeString(`${month} ${day}, ${year} • ${hour}:${min}:${sec} ${period} PST`);
      } catch {
        setTimeString(now.toLocaleTimeString('en-US') + ' PST');
      }
    };

    updatePSTClock();
    const interval = setInterval(updatePSTClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('attendsure_token');
    localStorage.removeItem('attendsure_username');
    localStorage.removeItem('attendsure_faculty_name');
    localStorage.removeItem('attendsure_role');
    window.location.reload();
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('');
  };

  return (
    <nav className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Left: Sidebar Toggle & School Branding */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>
        )}

        <div className="flex items-center gap-3">
          {school.school_logo ? (
            <img
              src={school.school_logo}
              alt={school.school_name || 'School Emblem'}
              className="h-10 w-10 object-contain rounded-full border border-slate-100 shadow-sm"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-sky-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
              <GraduationCap size={22} />
            </div>
          )}

          <div>
            <span className="font-extrabold text-slate-900 text-sm md:text-base leading-tight block truncate max-w-[220px] sm:max-w-xs md:max-w-md">
              {school.school_name || 'Lapasan National High School'}
            </span>
            <span className="text-[11px] text-slate-500 font-medium tracking-wide hidden sm:block">
              {school.school_id ? `ID: ${school.school_id} • ` : ''}School Attendance &amp; Security Portal
            </span>
          </div>
        </div>
      </div>

      {/* Right: PST Clock, Gate Status, Notifications & Profile */}
      <div className="flex items-center gap-3">
        {/* 1. Synchronized Philippine Standard Time Clock */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold">
          <Clock size={14} className="text-sky-600 flex-shrink-0" />
          <span className="font-mono tracking-tight">{timeString || 'Syncing PST...'}</span>
        </div>

        {/* 2. Gate Scanner Telemetry Status Badge */}
        <div
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
            isScannerOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
          title={isScannerOnline ? 'Hardware gate scanners connected' : 'Gate kiosks offline'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isScannerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
            }`}
          />
          <Radio size={12} className={isScannerOnline ? 'text-emerald-600' : 'text-rose-600'} />
          <span>{isScannerOnline ? 'Gate Scanner: Online' : 'Gate Scanner: Offline'}</span>
        </div>

        {/* 3. Notification Drawer Trigger */}
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('attendsure:navigate', { detail: 'sms' })
            );
          }}
          className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          title="SMS Alerts & Notifications"
          aria-label="View notifications"
        >
          <Bell size={18} />
          {hasUnreadAlerts && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </button>

        {/* 4. Authenticated User Avatar & Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 pl-1.5 rounded-full hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all"
            aria-expanded={profileOpen}
            aria-haspopup="true"
          >
            <div className="w-8 h-8 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shadow-sm">
              {getInitials(facultyName)}
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[120px]">
                {facultyName}
              </span>
              <span className="text-[10px] font-semibold text-sky-600 tracking-wide uppercase">
                {role}
              </span>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden xl:block" />
          </button>

          {/* Profile Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-900 truncate">{facultyName}</div>
                <div className="text-[11px] text-slate-500 font-mono truncate">@{username}</div>
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  <ShieldCheck size={11} />
                  <span>{role} ROLE</span>
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    window.dispatchEvent(
                      new CustomEvent('attendsure:navigate', { detail: 'settings' })
                    );
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                >
                  <User size={14} className="text-slate-400" />
                  <span>Institutional Settings</span>
                </button>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors"
                >
                  <LogOut size={14} className="text-rose-500" />
                  <span>Sign Out of Portal</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;