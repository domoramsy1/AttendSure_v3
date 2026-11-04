/**
 * AttendSure V3 - Modular Tab Navigation Bar
 * File: web/src/components/layout/Navbar.tsx
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { formatBadgeCount, type TabBadgeCounts } from './Header';
import {
  LayoutDashboard,
  DoorOpen,
  BookOpen,
  GraduationCap,
  Users,
  Calendar,
  MessageSquare,
  Ticket,
  Cpu,
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  badgeCounts?: TabBadgeCounts;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  badgeCounts = {},
}) => {
  const { tokens, brand } = useTheme();
  const [internalBadges, setInternalBadges] = useState<TabBadgeCounts>(badgeCounts);
  const [totalBadges, setTotalBadges] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const fetchBadges = async () => {
      try {
        const results = await Promise.allSettled([
          apiClient.get('/students/metrics/'),
          apiClient.get('/sms-outbox/metrics/'),
        ]);

        if (!isMounted) return;

        const studRes = results[0].status === 'fulfilled' ? results[0].value : null;
        const smsRes = results[1].status === 'fulfilled' ? results[1].value : null;

        const counts: TabBadgeCounts = {
          ...badgeCounts,
          students: studRes?.data?.total || badgeCounts.students,
          sms: smsRes?.data?.pending_total || badgeCounts.sms,
        };

        setInternalBadges(counts);

        const sum = Object.values(counts).reduce<number>((acc: number, curr: unknown) => {
          return acc + (typeof curr === 'number' ? curr : 0);
        }, 0);

        setTotalBadges(sum);
      } catch {
        const fallbackSum = Object.values(badgeCounts).reduce<number>((acc: number, curr: unknown) => {
          return acc + (typeof curr === 'number' ? curr : 0);
        }, 0);
        if (isMounted) setTotalBadges(fallbackSum);
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 25000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [badgeCounts]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'gatelogs', label: 'Gate Logs', icon: DoorOpen, badgeKey: 'gatelogs' },
    { id: 'classes', label: 'Classes', icon: BookOpen },
    { id: 'students', label: 'Students', icon: GraduationCap, badgeKey: 'students' },
    { id: 'faculties', label: 'Faculties', icon: Users, badgeKey: 'faculties' },
    { id: 'schedules', label: 'Schedules', icon: Calendar, badgeKey: 'schedules' },
    { id: 'sms', label: 'SMS Alerts', icon: MessageSquare, badgeKey: 'sms' },
    { id: 'gatepasses', label: 'Gate Passes', icon: Ticket, badgeKey: 'gatepasses' },
    { id: 'scanners', label: 'Scanners', icon: Cpu, badgeKey: 'scanners' },
  ];

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        backgroundColor: tokens.bgSurface,
        borderBottom: `1px solid ${tokens.borderSubtle}`,
        padding: '0 clamp(12px, 2.5vw, 24px)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        width: '100%',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      }}
      aria-label="Navigation Tabs"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const rawCount = item.badgeKey ? internalBadges[item.badgeKey] : undefined;
        const badgeLabel = formatBadgeCount(rawCount);

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTabChange(item.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: isActive ? `2.5px solid ${brand.primary}` : '2.5px solid transparent',
              color: isActive ? brand.primary : tokens.textSecondary,
              fontSize: '0.80rem',
              fontWeight: isActive ? 700 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
          >
            <Icon size={16} color={isActive ? brand.primary : tokens.textMuted} />
            <span>{item.label}</span>
            {badgeLabel && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: 10,
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  backgroundColor: isActive ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                  color: isActive ? brand.primary : tokens.textMuted,
                }}
              >
                {badgeLabel}
              </span>
            )}
          </button>
        );
      })}

      {totalBadges > 0 && (
        <span style={{ display: 'none' }} aria-hidden="true">
          {totalBadges}
        </span>
      )}
    </nav>
  );
};

export default Navbar;