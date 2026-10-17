/**
 * AttendSure V3 - Institutional Navigation Sidebar (Role-Secured)
 * File: frontend/src/components/layout/Sidebar.tsx
 *
 * Security: Strictly filters menu items based on the user's RBAC role.
 * Faculty-only accounts cannot view admin panels, user settings, or system hardware config.
 */

import React from 'react';
import type { UserSession } from '../../types/section';
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

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  session,
  userPhoto,
  isCollapsed,
  onToggleCollapse,
  schoolName = 'Lapasan National High School',
  schoolId = '340964',
  schoolLogo,
  canTeach = false,
}) => {
  const role = (session?.role || 'FACULTY').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const isPrincipal = role === 'PRINCIPAL';
  const isDeptHead = role === 'DEPT_HEAD';
  const isLeadership = isAdmin || isPrincipal || isDeptHead;
  const isPureFaculty = role === 'FACULTY';

  // Show "My Assigned Classes" if user has active teaching duties or is FACULTY
  const showMyClasses = canTeach || isPureFaculty;

  // STRICT RBAC MENU FILTERING: Pure faculty users only see classroom tools.
  const menuGroups: NavGroup[] = [
    {
      groupTitle: 'OVERVIEW',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
        { key: 'gate-logs', label: 'Gate Logs', icon: <Scan size={18} /> },
      ],
    },
    {
      groupTitle: 'ACADEMICS & ROSTER',
      items: [
        ...(showMyClasses
          ? [{ key: 'my-classes' as NavItemKey, label: 'My Assigned Classes', icon: <BookOpen size={18} /> }]
          : []),
        { key: 'students', label: 'Student Directory', icon: <GraduationCap size={18} /> },
        ...(isLeadership
          ? [{ key: 'facultys' as NavItemKey, label: 'Faculty Directory', icon: <Users size={18} /> }]
          : []),
        { key: 'schedules', label: isLeadership ? 'Schedules & Sections' : 'Class Schedules', icon: <CalendarDays size={18} /> },
      ],
    },
    {
      groupTitle: 'GATE & SECURITY',
      items: [
        ...(isAdmin || isPrincipal
          ? [{ key: 'sms' as NavItemKey, label: 'SMS Gateway', icon: <Send size={18} /> }]
          : []),
        { key: 'gate-passes', label: 'Gate Passes', icon: <Ticket size={18} /> },
        ...(isAdmin || isPrincipal
          ? [{ key: 'scanners' as NavItemKey, label: 'IoT Kiosks & Scanners', icon: <Cpu size={18} /> }]
          : []),
        // Faculty members can view their own DTR Form 48, while leadership sees all
        { key: 'dtr', label: 'DTR Form 48', icon: <Clock size={18} /> },
        ...(isAdmin || isPrincipal
          ? [{ key: 'geofence' as NavItemKey, label: 'Campus Perimeter', icon: <MapPin size={18} /> }]
          : []),
      ],
    },
    {
      groupTitle: 'GOVERNANCE & REPORTS',
      items: [
        // Regular faculty cannot access administrative master reports (SF1/SF2/SF4)
        ...(!isPureFaculty
          ? [{ key: 'reports' as NavItemKey, label: 'DepEd Reports (SF1/2/4)', icon: <FileSpreadsheet size={18} /> }]
          : []),
        ...(isAdmin
          ? [{ key: 'users' as NavItemKey, label: 'User Accounts', icon: <UserCheck size={18} /> }]
          : []),
        ...(isAdmin || isPrincipal
          ? [{ key: 'settings' as NavItemKey, label: 'School Settings', icon: <Settings size={18} /> }]
          : []),
      ],
    },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? 72 : 250,
        minWidth: isCollapsed ? 72 : 250,
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
          {schoolLogo ? (
            <img
              src={schoolLogo}
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

      {/* 2. Navigation List */}
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
        {menuGroups.map((group, gIdx) => {
          if (group.items.length === 0) return null;
          return (
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
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelectTab(item.key)}
                    title={isCollapsed ? item.label : undefined}
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      height: 38,
                      padding: isCollapsed ? '0 16px' : '0 12px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: isActive ? '#0284c7' : 'transparent',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.icon}
                    </div>
                    {!isCollapsed && (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
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
          {userPhoto ? (
            <img
              src={userPhoto}
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
              {session?.faculty_name ? session.faculty_name.charAt(0) : 'U'}
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
