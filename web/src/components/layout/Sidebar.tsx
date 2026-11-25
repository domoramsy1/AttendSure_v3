/**
 * AttendSure - Compact Collapsible Sidebar Navigation with Hover Prefetch
 * File: web/src/components/layout/Sidebar.tsx
 */

import React, { useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useCompliance } from '../../context/ComplianceContext';
import { isSafeImageUrl, SEAL_COLORS } from '../../theme/tokens';
import { canViewTab } from '../../utils/permissions';
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
  Ticket,
  Clock,
  MapPin,
  UserCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  QrCode,
  LayoutGrid,
} from 'lucide-react';

export type NavItemKey =
  | 'dashboard'
  | 'impact'
  | 'classroom-scanner'
  | 'my-classes'
  | 'advisory-monitor'
  | 'students'
  | 'teachers'
  | 'users'
  | 'gate-passes'
  | 'schedules'
  | 'dtr'
  | 'geofence'
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
    : words
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 6);
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
  badgeCounts = {},
}) => {
  const { tokens, brand } = useTheme();
  const { t } = useCompliance();
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('attendsure_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  const role = (session?.role || 'TEACHER').toUpperCase();
  const isTeacherOnly = role === 'TEACHER';

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

  const schoolAbbr = useMemo(() => getSchoolAbbreviation(schoolName), [schoolName]);

  const allGroups: NavGroup[] = useMemo(
    () => [
      {
        groupTitle: t('group_overview', 'OVERVIEW'),
        items: [
          { key: 'dashboard', label: t('nav_dashboard', 'Dashboard'), icon: <LayoutDashboard size={17} /> },
          { key: 'impact', label: t('nav_impact', 'SARDO & Safety'), icon: <Globe size={17} /> },
        ],
      },
      {
        groupTitle: t('group_classroom', 'CLASSROOM'),
        items: [
          { key: 'classroom-scanner', label: t('nav_scanner', 'QR Scanner'), icon: <QrCode size={17} /> },
          { key: 'my-classes', label: t('nav_my_classes', 'My Classes'), icon: <BookOpen size={17} /> },
          { key: 'advisory-monitor', label: t('nav_advisory', 'Advisory'), icon: <LayoutGrid size={17} /> },
          { key: 'students', label: t('nav_students', 'Students'), icon: <GraduationCap size={17} /> },
          { key: 'teachers', label: t('nav_teachers', 'Teachers'), icon: <Users size={17} /> },
          { key: 'schedules', label: t('nav_schedules', 'Academic Setup'), icon: <CalendarDays size={17} /> },
        ],
      },
      {
        groupTitle: t('group_monitoring', 'GEOFENCING & PASSES'),
        items: [
          { key: 'geofence', label: t('nav_geofence', 'Geofence & Loafing'), icon: <MapPin size={17} /> },
          { key: 'gate-passes', label: t('nav_gate_passes', 'Exit & Travel Passes'), icon: <Ticket size={17} /> },
          {
            key: 'dtr',
            label: isTeacherOnly ? t('nav_my_dtr', 'My DTR') : t('nav_dtr_deped', 'DTR'),
            icon: <Clock size={17} />,
          },
        ],
      },
      {
        groupTitle: t('group_admin', 'ADMINISTRATION'),
        items: [
          {
            key: 'reports',
            label: t('nav_reports_deped', 'DepEd Reports'),
            icon: <FileSpreadsheet size={19} />,
          },
          { key: 'users', label: t('nav_users', 'User Accounts'), icon: <UserCheck size={17} /> },
          { key: 'settings', label: t('nav_settings', 'System Settings'), icon: <Settings size={17} /> },
        ],
      },
    ],
    [isTeacherOnly, t]
  );

  const visibleGroups = useMemo(() => {
    const permUser = { role, can_handle_classes: canTeach, can_teach: canTeach };
    return allGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (allowedTabs && allowedTabs.length > 0) return allowedTabs.includes(item.key);
          return canViewTab(permUser, item.key);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [allGroups, allowedTabs, canTeach, role]);

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
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: SEAL_COLORS.white,
              border: `2px solid ${brand.primary}`,
              padding: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          >
            <img
              src={safeLogo}
              alt="School Seal"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                display: 'block',
                objectFit: 'contain',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: brand.buttonBg,
              color: tokens.onPrimary,
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

      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isCollapsed ? '8px 6px' : '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {visibleGroups.map((group) => (
          <div key={group.groupTitle} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!isCollapsed && (
              <div
                style={{
                  fontSize: '0.60rem',
                  fontWeight: 800,
                  color: tokens.textMuted,
                  padding: '3px 8px',
                  letterSpacing: '0.5px',
                }}
              >
                {group.groupTitle}
              </div>
            )}
            {group.items.map((item) => {
              const active = activeTab === item.key;
              const badge = formatBadge(badgeCounts[item.key]);
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
                    color: active ? tokens.onPrimary : tokens.textSecondary,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <span style={{ display: 'flex', color: active ? tokens.onPrimary : tokens.textMuted }}>{item.icon}</span>
                  {!isCollapsed && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: active ? 800 : 600,
                        color: active ? tokens.onPrimary : tokens.textPrimary,
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
                        backgroundColor: brand.danger,
                        color: tokens.onPrimary,
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
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            overflow: 'hidden',
            backgroundColor: tokens.primaryLight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {safeUserPhoto ? (
            <img src={safeUserPhoto} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontWeight: 800, fontSize: '0.78rem', color: brand.primary }}>
              {(session?.teacher_name || session?.username || 'U').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        {!isCollapsed && (
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: tokens.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session?.teacher_name || session?.username || 'Teacher'}
            </div>
            <div style={{ fontSize: '0.60rem', fontWeight: 700, color: tokens.textMuted }}>{role}</div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
