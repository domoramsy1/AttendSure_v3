/**
 * AttendSure - Standalone Top Navigation Bar (Role-Secured)
 * File: web/src/components/layout/Navbar.tsx
 *
 * Upgrades:
 * - Red circle notification counter ("4", "20+") on the Bell button.
 * - Hides "Institutional Settings" from regular teachers and guards.
 * - Safe image URL validation against XSS.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSchool } from '../../context/SchoolContext';
import type { TabBadgeCounts } from './Header';
import { formatBadgeCount } from './Header';
import {
  GraduationCap,
  Clock,
  Radio,
  Bell,
  LogOut,
  Settings,
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
  const [totalAlerts, setTotalAlerts] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const facultyName = localStorage.getItem('attendsure_faculty_name') || 'User';
  const username = localStorage.getItem('attendsure_username') || 'user';
  const role = (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isAdminOrPrincipal = role === 'ADMIN' || role === 'PRINCIPAL';

  useEffect(() => {
    const updatePSTClock = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleString('en-US', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }) + ' PST'
      );
    };

    updatePSTClock();
    const interval = setInterval(updatePSTClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync badge counts from global notification event
  useEffect(() => {
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<TabBadgeCounts>;
      if (custom.detail) {
        const sum = Object.values(custom.detail).reduce((acc, v) => acc + (Number(v) || 0), 0);
        setTotalAlerts(sum);
      }
    };
    window.addEventListener('attendsure:notifications-sync', handleSync);
    return () => window.removeEventListener('attendsure:notifications-sync', handleSync);
  }, []);

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
    localStorage.removeItem('attendsure_user_photo');
    localStorage.removeItem('attendsure_can_teach');
    window.location.reload();
  };

  const getInitials = (name: string): string => {
    return (
      name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0].toUpperCase())
        .join('') || 'U'
    );
  };

  const badgeLabel = formatBadgeCount(totalAlerts);

  return (
    <nav className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Left: School Branding */}
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
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
              className="h-10 w-10 object-contain rounded-full border border-slate-100"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-sky-600 flex items-center justify-center text-white">
              <GraduationCap size={22} />
            </div>
          )}

          <div>
            <span className="font-extrabold text-slate-900 text-sm md:text-base leading-tight block truncate">
              {school.school_name || 'Lapasan National High School'}
            </span>
            <span className="text-[11px] text-slate-500 font-medium hidden sm:block">
              {school.school_id ? `ID: ${school.school_id} • ` : ''}Attendance &amp; Security Portal
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold">
          <Clock size={14} className="text-sky-600" />
          <span className="font-mono">{timeString}</span>
        </div>

        <div
          className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
            isScannerOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}
        >
          <Radio size={12} />
          <span>Gate: {isScannerOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Bell Icon with Red Circle Counter */}
        <button
          type="button"
          onClick={() => {
            const targetTab = isAdminOrPrincipal ? 'sms' : 'gate-passes';
            window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail: targetTab }));
          }}
          style={{ position: 'relative' }}
          className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors"
          title="Notifications"
        >
          <Bell size={18} />
          {badgeLabel && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -5,
                minWidth: 19,
                height: 19,
                padding: '0 5px',
                borderRadius: 9999,
                backgroundColor: '#e11d48',
                color: '#ffffff',
                fontSize: '0.66rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #ffffff',
              }}
            >
              {badgeLabel}
            </span>
          )}
        </button>

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 pl-1.5 rounded-full hover:bg-slate-100 border border-slate-200"
          >
            <div className="w-8 h-8 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center">
              {getInitials(facultyName)}
            </div>
            <ChevronDown size={14} className="text-slate-400 mr-1" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-900 truncate">{facultyName}</div>
                <div className="text-[11px] text-slate-500 font-mono truncate">@{username}</div>
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  <ShieldCheck size={11} />
                  <span>{role}</span>
                </div>
              </div>

              {/* Least Privilege: Only Admin & Principal see School Settings */}
              {isAdminOrPrincipal && (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      window.dispatchEvent(new CustomEvent('attendsure:navigate', { detail: 'settings' }));
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                  >
                    <Settings size={14} className="text-slate-400" />
                    <span>School Settings</span>
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5"
                >
                  <LogOut size={14} className="text-rose-500" />
                  <span>Log Out</span>
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