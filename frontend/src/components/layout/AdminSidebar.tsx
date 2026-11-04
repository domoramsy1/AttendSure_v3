import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Clock,
  KeyRound,
  CalendarDays,
  MapPin,
  Scan,
  FileSpreadsheet,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Building2,
  Radio,
  LogOut,
} from 'lucide-react';

export type NavTabId =
  | 'dashboard'
  | 'gatelogs'
  | 'students'
  | 'teachers'
  | 'users'
  | 'gatepasses'
  | 'schedules'
  | 'dtr'
  | 'geofence'
  | 'scanners'
  | 'reports'
  | 'settings';

interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  groupTitle: string;
  items: NavItem[];
}

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  schoolName?: string;
  schoolId?: string;
  schoolLogo?: string | null;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  schoolName = 'Lapasan NHS',
  schoolId = '304033',
  schoolLogo,
  userName = 'Ramsy Domo',
  userRole = 'ADMIN',
  onLogout,
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const navGroups: NavGroup[] = [
    {
      groupTitle: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'gatelogs', label: 'Gate Access Logs', icon: Radio },
      ],
    },
    {
      groupTitle: 'PEOPLE & CLASSES',
      items: [
        { id: 'students', label: 'Students', icon: GraduationCap },
        { id: 'teachers', label: 'Teachers', icon: Users },
        { id: 'schedules', label: 'Schedules & Sections', icon: CalendarDays },
      ],
    },
    {
      groupTitle: 'GATE & SECURITY',
      items: [
        { id: 'gatepasses', label: 'Gate Passes', icon: KeyRound },
        { id: 'scanners', label: 'Gate Scanners', icon: Scan },
        { id: 'dtr', label: 'Teacher DTR (Form 48)', icon: Clock },
        { id: 'geofence', label: 'Campus Map', icon: MapPin },
      ],
    },
    {
      groupTitle: 'ADMINISTRATION',
      items: [
        { id: 'reports', label: 'DepEd Reports (SF1/SF2)', icon: FileSpreadsheet },
        { id: 'users', label: 'System Users', icon: UserCheck },
        { id: 'settings', label: 'School Settings', icon: Settings },
      ],
    },
  ];

  return (
    <aside
      style={{
        width: collapsed ? 76 : 260,
        height: '100vh',
        backgroundColor: '#0f172a', // Deep slate executive navy
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        zIndex: 50,
        borderRight: '1px solid #1e293b',
        userSelect: 'none',
      }}
    >
      {/* 1. Header: School Identity & Collapse Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '16px 8px' : '18px 16px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0b1120',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {schoolLogo ? (
              <img src={schoolLogo} alt="School Crest" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <Building2 size={20} color="#38bdf8" />
            )}
          </div>

          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.2px',
                }}
              >
                {schoolName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 600 }}>
                  ID: {schoolId}
                </span>
                <span style={{ fontSize: '0.60rem', color: '#38bdf8', fontWeight: 700, backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '1px 5px', borderRadius: 4 }}>
                  AttendSure
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          style={{
            position: 'absolute',
            right: collapsed ? -12 : 10,
            top: 20,
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 60,
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* 2. Navigation Items Grouped by Department */}
      <div
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
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {!collapsed && (
              <div
                style={{
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  color: '#64748b',
                  letterSpacing: '0.8px',
                  padding: '4px 10px 6px 10px',
                }}
              >
                {group.groupTitle}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {group.items.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      padding: collapsed ? '10px 0' : '9px 12px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: isActive ? '#0284c7' : 'transparent',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.80rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = '#1e293b';
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
                    <IconComponent size={18} color={isActive ? '#ffffff' : '#94a3b8'} style={{ flexShrink: 0 }} />

                    {!collapsed && (
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.label}
                      </span>
                    )}

                    {/* Active Indicator dot when collapsed */}
                    {collapsed && isActive && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 3,
                          width: 4,
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
        ))}
      </div>

      {/* 3. User Identity Card (Bottom Profile) */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid #1e293b',
          backgroundColor: '#0b1120',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.80rem',
              flexShrink: 0,
            }}
          >
            {userName ? userName.charAt(0) : 'A'}
          </div>

          {!collapsed && (
            <div style={{ minWidth: 0 }}>
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
                {userName}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    fontSize: '0.58rem',
                    fontWeight: 800,
                    color: '#38bdf8',
                    letterSpacing: '0.4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  {userRole}
                </span>
              </div>
            </div>
          )}
        </div>

        {!collapsed && onLogout && (
          <button
            onClick={onLogout}
            title="Log Out"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>

      {/* 4. TechBlazer Developer Branding Seal */}
      {!collapsed && (
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#070b14',
            borderTop: '1px solid #141e33',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
            AttendSure V3 &bull; DepEd Standard
          </div>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: 2 }}>
            &copy; 2026 Developed by <strong style={{ color: '#38bdf8' }}>TechBlazer</strong>
          </div>
        </div>
      )}
    </aside>
  );
};