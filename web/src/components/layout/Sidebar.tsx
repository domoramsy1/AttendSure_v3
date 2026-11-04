/**
 * AttendSure V3 - Minimalist Floating Rail Navigation
 * Displays compact icons by default and reveals the tab name on hover.
 * File: web/src/components/layout/Sidebar.tsx
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import type { UserSession } from '../../types/section';
import type { TabBadgeCounts } from './Header';
import {
  LayoutDashboard,
  Scan,
  Users,
  GraduationCap,
  CalendarDays,
  FileSpreadsheet,
  Settings,
  Send,
  Ticket,
  Clock,
  MapPin,
  Cpu,
  UserCheck,
  BookOpen,
} from 'lucide-react';

export type NavItemKey =
  | 'dashboard'
  | 'my-classes'
  | 'gate-logs'
  | 'students'
  | 'facultys'
  | 'users'
  | 'gate-passes'
  | 'schedules'
  | 'dtr'
  | 'geofence'
  | 'scanners'
  | 'sms'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  session?: UserSession | null;
  userPhoto?: string | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  canTeach?: boolean;
  allowedTabs?: NavItemKey[];
  badgeCounts?: TabBadgeCounts;
}

interface NavItem {
  key: NavItemKey;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

interface HoverTooltipState {
  label: string;
  badge?: string;
  top: number;
  left: number;
}

// Cybersecurity: Block malicious URI schemes (XSS protection)
const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

const formatBadge = (count?: number): string => {
  if (!count || count <= 0) return '';
  return count > 99 ? '99+' : String(count);
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  session,
  userPhoto,
  schoolName = 'Lapasan National High School',
  schoolId = '55555',
  schoolLogo,
  canTeach = false,
  allowedTabs,
  badgeCounts: propBadgeCounts,
}) => {
  const { tokens, brand } = useTheme();
  const [liveBadges, setLiveBadges] = useState<TabBadgeCounts>({});
  const [tooltip, setTooltip] = useState<HoverTooltipState | null>(null);

  const role = (session?.role || 'ADMIN').toUpperCase();
  const isLeadership = role === 'ADMIN' || role === 'SUPERADMIN' || role === 'PRINCIPAL' || role === 'DEPT_HEAD';

  useEffect(() => {
    const handleBadgeSync = (e: Event) => {
      const customEvent = e as CustomEvent<TabBadgeCounts>;
      if (customEvent.detail) {
        setLiveBadges(customEvent.detail);
      }
    };
    window.addEventListener('attendsure:notifications-sync', handleBadgeSync);
    return () => window.removeEventListener('attendsure:notifications-sync', handleBadgeSync);
  }, []);

  const mergedBadges: TabBadgeCounts = { ...liveBadges, ...propBadgeCounts };

  const allMenuGroups: NavGroup[] = useMemo(
    () => [
      {
        groupTitle: 'OVERVIEW',
        items: [
          { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
          { key: 'gate-logs', label: 'Gate Logs', icon: <Scan size={20} /> },
        ],
      },
      {
        groupTitle: 'ACADEMICS & CLASS LIST',
        items: [
          { key: 'my-classes', label: 'Classes', icon: <BookOpen size={20} /> },
          { key: 'students', label: 'Students', icon: <GraduationCap size={20} /> },
          { key: 'facultys', label: 'Faculties', icon: <Users size={20} /> },
          { key: 'schedules', label: 'Schedules & Sections', icon: <CalendarDays size={20} /> },
        ],
      },
      {
        groupTitle: 'GATE & SECURITY',
        items: [
          { key: 'sms', label: 'SMS', icon: <Send size={20} /> },
          { key: 'gate-passes', label: 'Gate Passes', icon: <Ticket size={20} /> },
          { key: 'scanners', label: 'Scanners', icon: <Cpu size={20} /> },
          { key: 'dtr', label: 'DTR', icon: <Clock size={20} /> },
          { key: 'geofence', label: 'Geofence', icon: <MapPin size={20} /> },
        ],
      },
      {
        groupTitle: 'GOVERNANCE & REPORTS',
        items: [
          { key: 'reports', label: 'Reports', icon: <FileSpreadsheet size={20} /> },
          { key: 'users', label: 'Users', icon: <UserCheck size={20} /> },
          { key: 'settings', label: 'Settings', icon: <Settings size={20} /> },
        ],
      },
    ],
    []
  );

  const filteredMenuGroups = useMemo(() => {
    return allMenuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (allowedTabs && allowedTabs.length > 0) {
            return allowedTabs.includes(item.key);
          }
          if (item.key === 'my-classes') return canTeach;
          if (item.key === 'users') return role === 'ADMIN' || role === 'SUPERADMIN';
          if (['settings', 'sms', 'scanners', 'geofence'].includes(item.key)) {
            return role === 'ADMIN' || role === 'SUPERADMIN' || role === 'PRINCIPAL';
          }
          if (['facultys', 'reports', 'schedules'].includes(item.key)) return isLeadership;
          if (role === 'GUARD') return ['dashboard', 'gate-logs', 'gate-passes'].includes(item.key);
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [allMenuGroups, allowedTabs, canTeach, role, isLeadership]);

  const safeLogo = isSafeImageUrl(schoolLogo) ? schoolLogo : null;
  const safeUserPhoto = isSafeImageUrl(userPhoto) ? userPhoto : null;

  return (
    <>
      <aside
        style={{
          width: 74,
          minWidth: 74,
          height: '100%',
          backgroundColor: tokens.bgSurface,
          border: `1px solid ${tokens.borderSubtle}`,
          borderRadius: 16,
          boxShadow: tokens.cardShadow,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxSizing: 'border-box',
          overflow: 'hidden',
          zIndex: 40,
          flexShrink: 0,
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        {/* 1. School Logo */}
        <div
          style={{
            padding: '16px 0',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltip({
              label: `${schoolName} (ID: ${schoolId})`,
              top: rect.top + rect.height / 2,
              left: rect.right + 12,
            });
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          {safeLogo ? (
            <img
              src={safeLogo}
              alt="School Logo"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${brand.primary}`,
                cursor: 'pointer',
              }}
            />
          ) : (
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: brand.primary,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              AS
            </div>
          )}
        </div>

        {/* 2. Navigation Icons Rail */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '14px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            scrollbarWidth: 'none',
          }}
        >
          {filteredMenuGroups.map((group, gIdx) => (
            <div
              key={gIdx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                width: '100%',
              }}
            >
              {group.items.map((item) => {
                const isActive = activeTab === item.key;
                const rawCount = mergedBadges[item.key as keyof TabBadgeCounts] || 0;
                const badgeText = formatBadge(rawCount);

                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setTooltip(null);
                      onSelectTab(item.key);
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        label: item.label,
                        badge: badgeText,
                        top: rect.top + rect.height / 2,
                        left: rect.right + 12,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    type="button"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      border: 'none',
                      backgroundColor: isActive ? brand.primary : 'transparent',
                      color: isActive ? '#FFFFFF' : tokens.textSecondary,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease, color 0.15s ease',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isActive ? '#FFFFFF' : tokens.textMuted,
                      }}
                    >
                      {item.icon}

                      {/* Small badge dot on icon */}
                      {badgeText && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            minWidth: 16,
                            height: 16,
                            padding: '0 4px',
                            borderRadius: 9999,
                            backgroundColor: brand.danger,
                            color: '#FFFFFF',
                            fontSize: '0.60rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `2px solid ${tokens.bgSurface}`,
                            lineHeight: 1,
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 3. User Avatar Footer */}
        <div
          style={{
            padding: '14px 0',
            borderTop: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltip({
              label: `${session?.faculty_name || session?.username || 'User'} (${role})`,
              top: rect.top + rect.height / 2,
              left: rect.right + 12,
            });
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
            {safeUserPhoto ? (
              <img
                src={safeUserPhoto}
                alt="Profile"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${brand.primary}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: tokens.primaryLight,
                  color: brand.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: `1.5px solid ${tokens.borderSubtle}`,
                }}
              >
                {session?.faculty_name ? session.faculty_name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <span
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                backgroundColor: brand.success,
                borderRadius: '50%',
                border: `2px solid ${tokens.bgSurface}`,
              }}
            />
          </div>
        </div>
      </aside>

      {/* Floating Hover Label (Immune to overflow clipping) */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.top,
            left: tooltip.left,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            backgroundColor: tokens.bgSurface,
            color: tokens.textPrimary,
            border: `1px solid ${tokens.borderSubtle}`,
            borderRadius: 8,
            padding: '7px 12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
            fontSize: '0.80rem',
            fontWeight: 700,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            animation: 'fadeIn 0.12s ease',
          }}
        >
          <span>{tooltip.label}</span>
          {tooltip.badge && (
            <span
              style={{
                backgroundColor: brand.danger,
                color: '#FFFFFF',
                borderRadius: 9999,
                padding: '1px 6px',
                fontSize: '0.64rem',
                fontWeight: 800,
              }}
            >
              {tooltip.badge}
            </span>
          )}
        </div>
      )}
    </>
  );
};

export default Sidebar;