import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Radio,
  GraduationCap,
  Users,
  CalendarDays,
  KeyRound,
  Scan,
  Clock,
  MapPin,
  FileSpreadsheet,
  UserCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { UserSession } from '../../types/section';

export type NavItemKey =
  | 'dashboard'
  | 'gate-logs'
  | 'students'
  | 'teachers'
  | 'users'
  | 'gate-passes'
  | 'schedules'
  | 'dtr'
  | 'geofence'
  | 'scanners'
  | 'reports'
  | 'settings';

export type UserRole = 'ADMIN' | 'TEACHER';

interface NavItem {
  id: NavItemKey;
  label: string;
  icon: React.ElementType;
  allowedRoles: UserRole[];
}

interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

export interface SidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  session: UserSession | null;
  userPhoto?: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
}

const formatLogoSource = (rawLogo?: string | null): string | null => {
  if (!rawLogo || typeof rawLogo !== 'string') return null;
  const trimmed = rawLogo.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/media/')) {
    return `http://localhost:8000${trimmed}`;
  }

  if (trimmed.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${trimmed}`;
  }
  if (trimmed.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${trimmed}`;
  }
  if (trimmed.length > 100 && !trimmed.includes(' ')) {
    return `data:image/png;base64,${trimmed}`;
  }

  return trimmed;
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
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const rawRole = (session?.role || 'TEACHER').toUpperCase();
  const userRole: UserRole = rawRole === 'ADMIN' ? 'ADMIN' : 'TEACHER';
  const userName = session?.faculty_name || session?.username || '';

  const dynamicMonogram = useMemo(() => {
    if (!schoolName || !schoolName.trim()) return 'SCH';
    const words = schoolName.trim().split(/\s+/).filter(Boolean);
    const initials = words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
    return initials || 'SCH';
  }, [schoolName]);

  const resolvedLogo = formatLogoSource(schoolLogo);

  // Strictly ADMIN and TEACHER access
  const navGroups: NavGroup[] = [
    {
      groupTitle: 'OVERVIEW',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          allowedRoles: ['ADMIN', 'TEACHER'],
        },
        {
          id: 'gate-logs',
          label: 'Gate Access Logs',
          icon: Radio,
          allowedRoles: ['ADMIN'],
        },
      ],
    },
    {
      groupTitle: 'PEOPLE & CLASSES',
      items: [
        {
          id: 'students',
          label: 'Students',
          icon: GraduationCap,
          allowedRoles: ['ADMIN', 'TEACHER'],
        },
        {
          id: 'teachers',
          label: 'Faculty',
          icon: Users,
          allowedRoles: ['ADMIN'],
        },
        {
          id: 'schedules',
          label: 'Schedules & Sections',
          icon: CalendarDays,
          allowedRoles: ['ADMIN', 'TEACHER'],
        },
      ],
    },
    {
      groupTitle: 'GATE & SECURITY',
      items: [
        {
          id: 'gate-passes',
          label: 'Gate Passes',
          icon: KeyRound,
          allowedRoles: ['ADMIN', 'TEACHER'],
        },
        {
          id: 'scanners',
          label: 'Gate Scanners',
          icon: Scan,
          allowedRoles: ['ADMIN'],
        },
        {
          id: 'dtr',
          label: 'DTR',
          icon: Clock,
          allowedRoles: ['ADMIN', 'TEACHER'],
        },
        {
          id: 'geofence',
          label: 'Campus Perimeter',
          icon: MapPin,
          allowedRoles: ['ADMIN'],
        },
      ],
    },
    {
      groupTitle: 'ADMINISTRATION',
      items: [
        {
          id: 'reports',
          label: 'Reports',
          icon: FileSpreadsheet,
          allowedRoles: ['ADMIN', 'TEACHER'],
        },
        {
          id: 'users',
          label: 'System Users',
          icon: UserCheck,
          allowedRoles: ['ADMIN'],
        },
        {
          id: 'settings',
          label: 'School Settings',
          icon: Settings,
          allowedRoles: ['ADMIN'],
        },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? 74 : 260,
        height: '100vh',
        backgroundColor: '#0c1322',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        borderRight: '1px solid #1a2538',
        position: 'relative',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* 1. Header: School Seal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '16px 8px' : '16px 14px',
          borderBottom: '1px solid #1a2538',
          background: 'linear-gradient(180deg, #101a2e 0%, #0c1322 100%)',
          position: 'relative',
          minHeight: 72,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              border: '2px solid rgba(56, 189, 248, 0.4)',
              boxShadow: '0 0 10px rgba(2, 132, 199, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              padding: 2,
            }}
          >
            {resolvedLogo && !imgFailed ? (
              <img
                src={resolvedLogo}
                alt={schoolName || 'School Seal'}
                onError={() => setImgFailed(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: '50%',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.68rem',
                }}
              >
                {dynamicMonogram}
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.2px',
                }}
              >
                {schoolName || 'AttendSure'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {schoolId && (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}
                  >
                    ID: {schoolId}
                  </span>
                )}
                <span
                  style={{
                    fontSize: '0.58rem',
                    color: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontWeight: 700,
                  }}
                >
                  AttendSure V3
                </span>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand Navigation' : 'Collapse Navigation'}
          style={{
            position: 'absolute',
            right: isCollapsed ? -11 : 10,
            top: 25,
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: '#1a2538',
            border: '1px solid #334155',
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 60,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* 2. Menu Navigation */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {navGroups.map((group, groupIdx) => {
          const visibleItems = group.items.filter((item) =>
            item.allowedRoles.includes(userRole)
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={groupIdx}>
              {!isCollapsed && (
                <div
                  style={{
                    fontSize: '0.60rem',
                    fontWeight: 800,
                    color: '#64748b',
                    letterSpacing: '0.8px',
                    padding: '4px 10px 4px 10px',
                  }}
                >
                  {group.groupTitle}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        width: '100%',
                        padding: isCollapsed ? '10px 0' : '9px 12px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        borderRadius: 8,
                        border: 'none',
                        background: isActive
                          ? 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)'
                          : 'transparent',
                        color: isActive ? '#ffffff' : '#94a3b8',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: '0.80rem',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease, color 0.15s ease',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = '#162238';
                          e.currentTarget.style.color = '#f1f5f9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = '#94a3b8';
                        }
                      }}
                    >
                      <Icon
                        size={17}
                        color={isActive ? '#ffffff' : '#94a3b8'}
                        style={{ flexShrink: 0 }}
                      />
                      {!isCollapsed && (
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.label}
                        </span>
                      )}

                      {isCollapsed && isActive && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 2,
                            width: 3,
                            height: 18,
                            borderRadius: 2,
                            backgroundColor: '#38bdf8',
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Account Identity with Profile Photo */}
      <div
        style={{
          padding: isCollapsed ? '14px 6px' : '14px 14px',
          borderTop: '1px solid #1a2538',
          backgroundColor: '#080d17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.82rem',
            flexShrink: 0,
            border: '2px solid rgba(56, 189, 248, 0.4)',
            overflow: 'hidden',
          }}
        >
          {userPhoto ? (
            <img
              src={userPhoto}
              alt={userName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            userName ? userName.charAt(0).toUpperCase() : '?'
          )}
        </div>

        {!isCollapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '0.80rem',
                fontWeight: 700,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {userName || 'User'}
            </div>
            {userRole && (
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  color: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  padding: '1px 5px',
                  borderRadius: 4,
                  letterSpacing: '0.3px',
                }}
              >
                {userRole}
              </span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;