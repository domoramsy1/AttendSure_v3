/**
 * AttendSure V3 - Collapsible Sidebar Navigation
 * Supports icons-only mode and expanded mode with tab names.
 * Displays school abbreviation and School ID directly above the logo.
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
  ChevronLeft,
  ChevronRight,
  QrCode,
} from 'lucide-react';

export type NavItemKey =
  | 'dashboard'
  | 'classroom-scanner'
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

// Cybersecurity: Block unsafe URI schemes (XSS prevention)
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

// Generates school initials abbreviation (e.g., "Lapasan National High School" -> "LNHS")
const getSchoolAbbreviation = (name?: string): string => {
  if (!name || !name.trim()) return 'AS';
  const clean = name.trim();
  const ignoreWords = new Set(['of', 'the', 'and', 'in', 'at', 'for', 'to', 'ng', 'mga', 'sa']);
  const words = clean.split(/\s+/).filter((w) => !ignoreWords.has(w.toLowerCase()));
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 6);
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
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
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

  // Persistent sidebar collapse state (icons-only vs tab names)
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('attendsure_sidebar_collapsed') === 'true';
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    const nextState = !isCollapsed;
    setInternalCollapsed(nextState);
    localStorage.setItem('attendsure_sidebar_collapsed', String(nextState));
    if (onToggleCollapse) {
      onToggleCollapse();
    }
  };

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
  const schoolAbbreviation = useMemo(() => getSchoolAbbreviation(schoolName), [schoolName]);

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
        groupTitle: 'ACADEMICS',
        items: [
          { key: 'classroom-scanner', label: 'Attendance Scanner', icon: <QrCode size={20} /> },
          { key: 'my-classes', label: 'Classes', icon: <BookOpen size={20} /> },
          { key: 'students', label: 'Students', icon: <GraduationCap size={20} /> },
          { key: 'facultys', label: 'Faculties', icon: <Users size={20} /> },
          { key: 'schedules', label: 'Schedules', icon: <CalendarDays size={20} /> },
        ],
      },
      {
        groupTitle: 'GATE & TELEMETRY',
        items: [
          { key: 'sms', label: 'SMS Alerts', icon: <Send size={20} /> },
          { key: 'gate-passes', label: 'Gate Passes', icon: <Ticket size={20} /> },
          { key: 'scanners', label: 'Gate Kiosks', icon: <Cpu size={20} /> },
          { key: 'dtr', label: 'DTR', icon: <Clock size={20} /> },
          { key: 'geofence', label: 'Geofence', icon: <MapPin size={20} /> },
        ],
      },
      {
        groupTitle: 'GOVERNANCE',
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
          if (item.key === 'classroom-scanner') return canTeach || isLeadership;
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
          width: isCollapsed ? 76 : 224,
          minWidth: isCollapsed ? 76 : 224,
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
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease, border-color 0.2s ease',
        }}
      >
        {/* Top Header: School Abbreviation & School ID ABOVE the School Logo */}
        <div
          style={{
            padding: isCollapsed ? '12px 6px 10px 6px' : '14px 12px 10px 12px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            boxSizing: 'border-box',
            position: 'relative',
          }}
        >
          {/* Collapse/Expand Toggle Button */}
          <button
            type="button"
            onClick={handleToggle}
            title={isCollapsed ? 'Show tab names' : 'Icons only'}
            style={{
              position: isCollapsed ? 'static' : 'absolute',
              top: isCollapsed ? undefined : 12,
              right: isCollapsed ? undefined : 10,
              marginBottom: isCollapsed ? 6 : 0,
              width: 24,
              height: 24,
              borderRadius: 6,
              border: `1px solid ${tokens.borderSubtle}`,
              backgroundColor: tokens.bgSurfaceSubtle,
              color: brand.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              transition: 'background-color 0.15s ease',
            }}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* School Abbreviation & School ID */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: 6,
              width: '100%',
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            <div
              style={{
                fontSize: isCollapsed ? '0.78rem' : '0.86rem',
                fontWeight: 900,
                color: brand.primary,
                letterSpacing: '0.6px',
                lineHeight: 1.15,
                textTransform: 'uppercase',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={schoolName}
            >
              {schoolAbbreviation}
            </div>

            <div
              style={{
                fontSize: '0.64rem',
                fontWeight: 700,
                color: tokens.textMuted,
                fontFamily: 'monospace',
                lineHeight: 1.2,
                marginTop: 2,
              }}
            >
              ID: {schoolId || '—'}
            </div>
          </div>

          {/* School Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={handleToggle}
            onMouseEnter={(e) => {
              if (isCollapsed) {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  label: `${schoolName} (ID: ${schoolId})`,
                  top: rect.top + rect.height / 2,
                  left: rect.right + 12,
                });
              }
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {safeLogo ? (
              <img
                src={safeLogo}
                alt="School Logo"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${brand.primary}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  backgroundColor: brand.primary,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                }}
              >
                {schoolAbbreviation.slice(0, 2)}
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: tokens.textSecondary,
                textAlign: 'center',
                marginTop: 6,
                padding: '0 4px',
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {schoolName}
            </div>
          )}
        </div>

        {/* Navigation Items Rail */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: isCollapsed ? '12px 0' : '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            scrollbarWidth: 'none',
            boxSizing: 'border-box',
          }}
        >
          {filteredMenuGroups.map((group, gIdx) => (
            <div
              key={gIdx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isCollapsed ? 'center' : 'stretch',
                gap: 4,
                width: '100%',
              }}
            >
              {!isCollapsed && (
                <div
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    color: tokens.textMuted,
                    letterSpacing: '0.5px',
                    padding: '6px 8px 2px 8px',
                    textTransform: 'uppercase',
                  }}
                >
                  {group.groupTitle}
                </div>
              )}

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
                      if (isCollapsed) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          label: item.label,
                          badge: badgeText,
                          top: rect.top + rect.height / 2,
                          left: rect.right + 12,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    type="button"
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      width: isCollapsed ? 46 : '100%',
                      height: 42,
                      padding: isCollapsed ? 0 : '0 12px',
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: isActive ? brand.primary : 'transparent',
                      color: isActive ? '#FFFFFF' : tokens.textSecondary,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease, color 0.15s ease',
                      boxSizing: 'border-box',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isActive ? '#FFFFFF' : tokens.textMuted,
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>

                    {!isCollapsed && (
                      <span
                        style={{
                          fontSize: '0.80rem',
                          fontWeight: isActive ? 800 : 600,
                          color: isActive ? '#FFFFFF' : tokens.textPrimary,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                          textAlign: 'left',
                        }}
                      >
                        {item.label}
                      </span>
                    )}

                    {badgeText && (
                      <span
                        style={{
                          position: isCollapsed ? 'absolute' : 'static',
                          top: isCollapsed ? 4 : undefined,
                          right: isCollapsed ? 4 : undefined,
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
                          border: isCollapsed ? `2px solid ${tokens.bgSurface}` : 'none',
                          lineHeight: 1,
                          marginLeft: isCollapsed ? 0 : 'auto',
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

        {/* User Avatar Footer */}
        <div
          style={{
            padding: isCollapsed ? '12px 0' : '12px 14px',
            borderTop: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            width: '100%',
            boxSizing: 'border-box',
            gap: 10,
          }}
          onMouseEnter={(e) => {
            if (isCollapsed) {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                label: `${session?.faculty_name || session?.username || 'User'} (${role})`,
                top: rect.top + rect.height / 2,
                left: rect.right + 12,
              });
            }
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

          {!isCollapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: tokens.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {session?.faculty_name || session?.username || 'User'}
              </div>
              <div
                style={{
                  fontSize: '0.64rem',
                  fontWeight: 600,
                  color: tokens.textMuted,
                  textTransform: 'uppercase',
                }}
              >
                {role}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Floating Hover Tooltip (Icons-only mode) */}
      {tooltip && isCollapsed && (
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