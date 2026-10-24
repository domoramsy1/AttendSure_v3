/**
 * AttendSure V3 - Institutional Navigation Sidebar (Role-Secured + Live Badge Counts)
 * File: web/src/components/layout/Sidebar.tsx
 *
 * UI/UX & Cybersecurity Upgrades:
 * 1. RED NOTIFICATION BADGES: Renders red count pills ("4", "20+") on tabs with
 *    active tasks (Gate Passes, Unscanned Classes, Queued/Failed SMS, Offline Scanners, Draft DTR).
 * 2. COLLAPSED ICON BADGES: When collapsed, the red circle badge overlaps the top-right
 *    of the circular icon button (matching modern notification badge UX).
 * 3. PRINCIPLE OF LEAST PRIVILEGE: Strictly hides unauthorized tabs and empty groups.
 * 4. XSS IMAGE SHIELD: Validates school logo and user photo URLs before rendering.
 */

import React, { useMemo, useState, useEffect } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
  session: UserSession | null;
  userPhoto?: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
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
  return count > 20 ? '20+' : String(count);
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  session,
  userPhoto,
  isCollapsed,
  onToggleCollapse,
  schoolName,
  schoolId,
  schoolLogo,
  canTeach = false,
  allowedTabs,
  badgeCounts: propBadgeCounts,
}) => {
  const [liveBadges, setLiveBadges] = useState<TabBadgeCounts>({});

  const role = (session?.role || 'FACULTY').toUpperCase();
  const isLeadership = role === 'ADMIN' || role === 'PRINCIPAL' || role === 'DEPT_HEAD';

  // Listen for live notification badge counts broadcasted from Header.tsx
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

  // Master definition of all possible navigation groups
  const allMenuGroups: NavGroup[] = useMemo(
    () => [
      {
        groupTitle: 'OVERVIEW',
        items: [
          { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
          { key: 'gate-logs', label: 'Gate Logs', icon: <Scan size={18} /> },
        ],
      },
      {
        groupTitle: 'ACADEMICS & CLASS LIST',
        items: [
          { key: 'my-classes', label: 'Classes', icon: <BookOpen size={18} /> },
          { key: 'students', label: 'Students', icon: <GraduationCap size={18} /> },
          { key: 'facultys', label: 'Faculties', icon: <Users size={18} /> },
          { key: 'schedules', label: 'Schedules & Sections', icon: <CalendarDays size={18} /> },
        ],
      },
      {
        groupTitle: 'GATE & SECURITY',
        items: [
          { key: 'sms', label: 'SMS', icon: <Send size={18} /> },
          { key: 'gate-passes', label: 'Gate Passes', icon: <Ticket size={18} /> },
          { key: 'scanners', label: 'IoT', icon: <Cpu size={18} /> },
          { key: 'dtr', label: 'DTR', icon: <Clock size={18} /> },
          { key: 'geofence', label: 'Geofence', icon: <MapPin size={18} /> },
        ],
      },
      {
        groupTitle: 'GOVERNANCE & REPORTS',
        items: [
          { key: 'reports', label: 'Reports', icon: <FileSpreadsheet size={18} /> },
          { key: 'users', label: 'Users', icon: <UserCheck size={18} /> },
          { key: 'settings', label: 'Settings', icon: <Settings size={18} /> },
        ],
      },
    ],
    []
  );

  // Strict UI filtering: Only render items authorized for the user's role
  const filteredMenuGroups = useMemo(() => {
    return allMenuGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (allowedTabs && allowedTabs.length > 0) {
            return allowedTabs.includes(item.key);
          }
          if (item.key === 'my-classes') return canTeach;
          if (item.key === 'users') return role === 'ADMIN';
          if (item.key === 'settings' || item.key === 'sms' || item.key === 'scanners' || item.key === 'geofence') {
            return role === 'ADMIN' || role === 'PRINCIPAL';
          }
          if (item.key === 'facultys' || item.key === 'reports' || item.key === 'schedules') return isLeadership;
          if (role === 'GUARD') return ['dashboard', 'gate-logs', 'gate-passes'].includes(item.key);
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [allMenuGroups, allowedTabs, canTeach, role, isLeadership]);

  const safeLogo = isSafeImageUrl(schoolLogo) ? schoolLogo : null;
  const safeUserPhoto = isSafeImageUrl(userPhoto) ? userPhoto : null;

  return (
    <aside
      style={{
        width: isCollapsed ? 74 : 254,
        minWidth: isCollapsed ? 74 : 254,
        height: '100vh',
        backgroundColor: '#0b192c',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.2s ease-in-out',
        borderRight: '1px solid #1e293b',
        boxSizing: 'border-box',
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      {/* 1. Header & School Info */}
      <div
        style={{
          padding: isCollapsed ? '16px 8px' : '16px 14px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          minHeight: 68,
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {safeLogo ? (
            <img
              src={safeLogo}
              alt="School Seal"
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1.5px solid #0284c7',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
            >
              LNHS
            </div>
          )}

          {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span
                title={schoolName}
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 140,
                }}
              >
                {schoolName}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>ID: {schoolId}</span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    backgroundColor: 'rgba(2, 132, 199, 0.25)',
                    color: '#38bdf8',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontWeight: 700,
                  }}
                >
                  AttendSure
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Collapse Button */}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
          style={{
            position: isCollapsed ? 'static' : 'relative',
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* 2. Navigation List with Red Circle Badges */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {filteredMenuGroups.map((group, gIdx) => (
          <div key={gIdx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {!isCollapsed && (
              <span
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  color: '#64748b',
                  letterSpacing: '0.08em',
                  padding: '4px 10px',
                  userSelect: 'none',
                }}
              >
                {group.groupTitle}
              </span>
            )}

            {group.items.map((item) => {
              const isActive = activeTab === item.key;
              const rawCount = mergedBadges[item.key as keyof TabBadgeCounts] || 0;
              const badgeText = formatBadge(rawCount);

              return (
                <button
                  key={item.key}
                  onClick={() => onSelectTab(item.key)}
                  title={isCollapsed ? `${item.label}${badgeText ? ` (${badgeText})` : ''}` : undefined}
                  type="button"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    width: '100%',
                    height: 40,
                    padding: isCollapsed ? '0' : '0 12px',
                    borderRadius: isCollapsed ? 12 : 8,
                    border: 'none',
                    backgroundColor: isActive ? '#0284c7' : 'transparent',
                    color: isActive ? '#ffffff' : '#94a3b8',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = '#1e293b';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#94a3b8';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.icon}

                      {/* Collapsed Mode: Red Circle Badge overlapping top-right of icon */}
                      {isCollapsed && badgeText && (
                        <span
                          style={{
                            position: 'absolute',
                            top: -7,
                            right: -9,
                            minWidth: 18,
                            height: 18,
                            padding: '0 4px',
                            borderRadius: 9999,
                            backgroundColor: '#e11d48',
                            color: '#ffffff',
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid #0b192c',
                            lineHeight: 1,
                            boxSizing: 'border-box',
                          }}
                        >
                          {badgeText}
                        </span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    )}
                  </div>

                  {/* Expanded Mode: Red Circle/Pill Counter on the right side of the tab */}
                  {!isCollapsed && badgeText && (
                    <span
                      style={{
                        minWidth: 20,
                        height: 20,
                        padding: '0 6px',
                        borderRadius: 9999,
                        backgroundColor: '#e11d48',
                        color: '#ffffff',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {badgeText}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* 3. Bottom User Profile Card */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid #1e293b',
          backgroundColor: '#071220',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
          {safeUserPhoto ? (
            <img
              src={safeUserPhoto}
              alt="Profile"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1.5px solid #0284c7',
              }}
            />
          ) : (
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.80rem',
                border: '1.5px solid #334155',
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
              width: 9,
              height: 9,
              backgroundColor: '#10b981',
              borderRadius: '50%',
              border: '2px solid #071220',
            }}
          />
        </div>

        {!isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {session?.faculty_name || session?.username || 'User'}
            </span>
            <span
              style={{
                fontSize: '0.64rem',
                fontWeight: 800,
                color: '#38bdf8',
                letterSpacing: '0.04em',
                marginTop: 2,
              }}
            >
              {role}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;