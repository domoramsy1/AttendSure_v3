import React from 'react';
import appLogoSrc from '../../assets/AppLogo.svg';
import type { UserSession } from '../../types/section';
import { 
  LayoutDashboard, 
  Activity,
  GraduationCap, 
  Users, 
  UserCog, 
  KeyRound, 
  CalendarDays, 
  Clock, 
  MapPin, 
  ScanLine, 
  FileText, 
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';

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

interface AdminSidebarProps {
  activeTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  session: UserSession | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ 
  activeTab, 
  onSelectTab, 
  session,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const navItems: { key: NavItemKey; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
    { key: 'gate-logs', label: 'Gate Access Logs', icon: <Activity size={17} /> },
    { key: 'students', label: 'Students', icon: <GraduationCap size={17} /> },
    { key: 'teachers', label: 'Teachers', icon: <Users size={17} /> },
    { key: 'users', label: 'Users', icon: <UserCog size={17} /> },
    { key: 'gate-passes', label: 'Gate Passes', icon: <KeyRound size={17} /> },
    { key: 'schedules', label: 'Schedules & Sections', icon: <CalendarDays size={17} /> },
    { key: 'dtr', label: 'DTR', icon: <Clock size={17} /> },
    { key: 'geofence', label: 'Geofence Map', icon: <MapPin size={17} /> },
    { key: 'scanners', label: 'Scanners', icon: <ScanLine size={17} /> },
    { key: 'reports', label: 'Reports', icon: <FileText size={17} /> },
    { key: 'settings', label: 'Settings', icon: <Settings size={17} /> },
  ];

  const userInitial = session?.username ? session.username.charAt(0).toUpperCase() : 'A';
  const sidebarWidth = isCollapsed ? '64px' : '220px';

  return (
    <aside
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: isCollapsed ? '12px 6px' : '12px 10px',
        boxSizing: 'border-box',
        userSelect: 'none',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', padding: '2px 4px 10px 4px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={appLogoSrc} alt="AttendSure Logo" width={30} height={30} style={{ objectFit: 'contain', flexShrink: 0 }} />
            {!isCollapsed && (
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                  AttendSure
                </div>
                <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#0284c7', letterSpacing: '0.4px' }}>
                  ADMIN
                </div>
              </div>
            )}
          </div>
          {onToggleCollapse && !isCollapsed && (
            <button
              onClick={onToggleCollapse}
              title="Collapse sidebar"
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '5px',
                padding: '3px',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={15} />
            </button>
          )}
        </div>

        {onToggleCollapse && isCollapsed && (
          <button
            onClick={onToggleCollapse}
            title="Expand sidebar"
            style={{
              width: '100%',
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '5px',
              padding: '5px',
              cursor: 'pointer',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              flexShrink: 0,
            }}
          >
            <ChevronRight size={15} />
          </button>
        )}

        {/* Navigation list */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelectTab(item.key)}
                title={isCollapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  gap: 10,
                  padding: isCollapsed ? '8px 0' : '7px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: isActive ? '#f0f9ff' : 'transparent',
                  color: isActive ? '#0284c7' : '#475569',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  width: '100%',
                }}
              >
                <span style={{ color: isActive ? '#0284c7' : '#64748b', display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: 8,
          padding: '8px 4px',
          borderTop: '1px solid #f1f5f9',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.78rem',
            flexShrink: 0,
          }}
        >
          {userInitial}
        </div>
        {!isCollapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {session?.staff_name || session?.username || 'Administrator'}
            </div>
            <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>
              {session?.role || 'System Administrator'}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};