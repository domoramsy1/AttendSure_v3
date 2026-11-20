/**
 * AttendSure - Compact Collapsible Sidebar Navigation with Hover Prefetch
 * File: web/src/components/layout/Sidebar.tsx
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useCompliance } from '../../context/ComplianceContext';
import { isSafeImageUrl } from '../../theme/tokens';
import type { UserSession } from '../../types/section';
import type { TabBadgeCounts } from './Header';
import {
  LayoutDashboard,
  Globe,
  Users,
  GraduationCap,
  CalendarDays,
  FileSpreadsheet,
  Settings,
  Bell,
  Ticket,
  Clock,
  MapPin,
  UserCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  QrCode,
  LayoutGrid,
  MessageSquare,
} from 'lucide-react';

export type NavItemKey =
  | 'dashboard'
  | 'impact'
  | 'classroom-scanner'
  | 'my-classes'
  | 'advisory-monitor'
  | 'attendance-logs'
  | 'students'
  | 'facultys'
  | 'users'
  | 'gate-passes'
  | 'schedules'
  | 'dtr'
  | 'geofence'
  | 'scanners'
  | 'push'
  | 'messages'
  | 'notifications'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  onPrefetchTab?: (tab: NavItemKey) => void;
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

const getSchoolAbbreviation = (name?: string): string => {
  if (!name || !name.trim()) return 'AS';
  const ignore = new Set(['of', 'the', 'and', 'in', 'at', 'for', 'to', 'ng', 'sa']);
  const words = name.trim().split(/\s+/).filter((w) => !ignore.has(w.toLowerCase()));
  return words.length === 1
    ? words[0].slice(0, 4).toUpperCase()
    : words.map((w) => w[0]).join('').toUpperCase().slice(0, 6);
};

const formatBadge = (count?: number): string => {
  if (!count || count <= 0) return '';
  return count > 99 ? '99+' : String(count);
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onPrefetchTab,
  session,
  userPhoto,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  schoolName = '',
  schoolId = '',
  schoolLogo,
  canTeach = false,
  allowedTabs,
  badgeCounts: propBadgeCounts,
}) => {
  const { mode, tokens, brand } = useTheme();
  const { isGlobalMode, t } = useCompliance();
  const [liveBadges, setLiveBadges] = useState<TabBadgeCounts>({});
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('attendsure_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const role = (session?.role || 'FACULTY').toUpperCase();
  const isLeadership = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(role);

  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<TabBadgeCounts>).detail;
      if (detail) setLiveBadges(detail);
    };
    window.addEventListener('attendsure:notifications-sync', onSync);
    return () => window.removeEventListener('attendsure:notifications-sync', onSync);
  }, []);

  const handleToggle = () => {
    const next = !isCollapsed;
    setInternalCollapsed(next);
    try {
      localStorage.setItem('attendsure_sidebar_collapsed', String(next));
    } catch {
      // Ignore storage quota errors
    }
    onToggleCollapse?.();
  };

  const mergedBadges: TabBadgeCounts = { ...liveBadges, ...propBadgeCounts };
  const schoolAbbr = useMemo(() => getSchoolAbbreviation(schoolName), [schoolName]);

  const allGroups: NavGroup[] = useMemo(
    () => [
      {
        groupTitle: t('group_overview', 'OVERVIEW'),
        items: [
          { key: 'dashboard', label: t('nav_dashboard', 'Dashboard'), icon: <LayoutDashboard size={17} /> },
          { key: 'impact', label: t('nav_impact', 'Impact & Safety'), icon: <Globe size={17} /> },
        ],
      },
      {
        groupTitle: t('group_classroom', 'CLASSROOM'),
        items: [
          { key: 'classroom-scanner', label: t('nav_scanner', 'QR Scanner'), icon: <QrCode size={17} /> },
          { key: 'my-classes', label: t('nav_my_classes', 'My Classes'), icon: <BookOpen size={17} /> },
          { key: 'advisory-monitor', label: t('nav_advisory', 'Advisory Matrix'), icon: <LayoutGrid size={17} /> },
          { key: 'students', label: t('nav_students', 'Students'), icon: <GraduationCap size={17} /> },
          { key: 'facultys', label: t('nav_faculty', 'Faculty & Staff'), icon: <Users size={17} /> },
          { key: 'schedules', label: t('nav_schedules', 'Schedules'), icon: <CalendarDays size={17} /> },
        ],
      },
      {
        groupTitle: t('group_alerts', 'ATTENDANCE & ALERTS'),
        items: [
          { key: 'messages', label: t('nav_messages', 'Parent Chat'), icon: <MessageSquare size={17} /> },
          { key: 'push', label: t('nav_push', 'Push Alerts'), icon: <Bell size={17} /> },
          { key: 'gate-passes', label: t('nav_gate_passes', 'Exit Passes'), icon: <Ticket size={17} /> },
          {
            key: 'dtr',
            label: isGlobalMode ? t('nav_dtr_global', 'Staff Timesheets') : t('nav_dtr_deped', 'Monthly DTR'),
            icon: <Clock size={17} />,
          },
          { key: 'geofence', label: t('nav_geofence', 'Campus GPS'), icon: <MapPin size={17} /> },
        ],
      },
      {
        groupTitle: t('group_admin', 'ADMINISTRATION'),
        items: [
          {
            key: 'reports',
            label: isGlobalMode ? t('nav_reports_global', 'Compliance Reports') : t('nav_reports_deped', 'DepEd Reports'),
            icon: <FileSpreadsheet size={19} />,
          },
          { key: 'users', label: t('nav_users', 'User Accounts'), icon: <UserCheck size={17} /> },
          { key: 'settings', label: t('nav_settings', 'School Settings'), icon: <Settings size={17} /> },
        ],
      },
    ],
    [isGlobalMode, t]
  );

  const visibleGroups = useMemo(() => {
    return allGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (allowedTabs && allowedTabs.length > 0) return allowedTabs.includes(item.key);
          if (item.key === 'users') return ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN'].includes(role);
          if (['settings', 'push', 'geofence'].includes(item.key)) {
            return ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL'].includes(role);
          }
          if (['facultys', 'schedules'].includes(item.key)) return isLeadership;
          if (item.key === 'my-classes') return canTeach || isLeadership;
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [allGroups, allowedTabs, canTeach, isLeadership, role]);

  const safeLogo = isSafeImageUrl(schoolLogo) ? schoolLogo : null;
  const safeUserPhoto = isSafeImageUrl(userPhoto) ? userPhoto : null;

  return (
    <aside
      style={{
        width: isCollapsed ? 64 : 196,
        minWidth: isCollapsed ? 64 : 196,
        height: '100%',
        backgroundColor: tokens.bgSurface,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'width 0.2s ease',
      }}
    >
      <div
        style={{
          padding: isCollapsed ? '10px 6px' : '10px 10px',
          borderBottomWidth: 1,
          borderBottomStyle: 'solid',
          borderBottomColor: tokens.borderSubtle,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            position: isCollapsed ? 'static' : 'absolute',
            top: 10,
            right: 8,
            marginBottom: isCollapsed ? 4 : 0,
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: tokens.borderSubtle,
            backgroundColor: tokens.bgSurfaceSubtle,
            color: brand.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: '0.80rem', fontWeight: 900, color: brand.primary }}>{schoolAbbr}</div>
          {schoolId && (
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: tokens.textMuted, fontFamily: 'monospace' }}>
              ID: {schoolId}
            </div>
          )}
        </div>

        {safeLogo ? (
          <img
            src={safeLogo}
            alt="School Seal"
            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${brand.primary}` }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: brand.buttonBg,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.76rem',
            }}
          >
            {schoolAbbr.slice(0, 2)}
          </div>
        )}

        {!isCollapsed && schoolName && (
          <div
            style={{
              fontSize: '0.70rem',
              fontWeight: 700,
              color: tokens.textSecondary,
              textAlign: 'center',
              marginTop: 5,
              lineHeight: 1.25,
            }}
          >
            {schoolName}
          </div>
        )}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: isCollapsed ? '8px 6px' : '8px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleGroups.map((group) => (
          <div key={group.groupTitle} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!isCollapsed && (
              <div style={{ fontSize: '0.60rem', fontWeight: 800, color: tokens.textMuted, padding: '3px 8px', letterSpacing: '0.5px' }}>
                {group.groupTitle}
              </div>
            )}
            {group.items.map((item) => {
              const active = activeTab === item.key;
              const badge = formatBadge(mergedBadges[item.key]);
              return (
                <button
                  key={item.key}
                  type="button"
                  title={isCollapsed ? item.label : undefined}
                  onMouseEnter={() => onPrefetchTab?.(item.key)}
                  onFocus={() => onPrefetchTab?.(item.key)}
                  onClick={() => onSelectTab(item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    gap: 9,
                    height: 36,
                    padding: isCollapsed ? 0 : '0 10px',
                    borderRadius: 9,
                    borderWidth: 0,
                    borderStyle: 'none',
                    backgroundColor: active ? brand.buttonBg : 'transparent',
                    color: active ? '#ffffff' : tokens.textSecondary,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <span style={{ display: 'flex', color: active ? '#ffffff' : tokens.textMuted }}>{item.icon}</span>
                  {!isCollapsed && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: active ? 800 : 600,
                        color: active ? '#ffffff' : tokens.textPrimary,
                        flex: 1,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                  {badge && (
                    <span
                      style={{
                        backgroundColor: mode === 'dark' ? '#dc2626' : brand.danger,
                        color: '#ffffff',
                        fontSize: '0.58rem',
                        fontWeight: 800,
                        borderRadius: 9999,
                        padding: '1px 5px',
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        style={{
          padding: isCollapsed ? '8px 0' : '8px 10px',
          borderTopWidth: 1,
          borderTopStyle: 'solid',
          borderTopColor: tokens.borderSubtle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: 8,
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', backgroundColor: tokens.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {safeUserPhoto ? (
            <img src={safeUserPhoto} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontWeight: 800, fontSize: '0.78rem', color: brand.primary }}>
              {(session?.faculty_name || session?.username || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {!isCollapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.faculty_name || session?.username || 'User'}
            </div>
            <div style={{ fontSize: '0.60rem', fontWeight: 700, color: tokens.textMuted }}>{role}</div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;