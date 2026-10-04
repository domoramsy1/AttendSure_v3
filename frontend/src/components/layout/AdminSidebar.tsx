import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
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

interface DynamicSchoolInfo {
  school_name: string;
  school_id: string;
  school_logo: string | null;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ 
  activeTab, 
  onSelectTab, 
  session,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [schoolInfo, setSchoolInfo] = useState<DynamicSchoolInfo>({
    school_name: 'Lapasan NHS',
    school_id: '304033',
    school_logo: null,
  });

  // Dynamically load institutional identity from the database
  useEffect(() => {
    let isMounted = true;

    const fetchSchoolSettings = async () => {
      try {
        const res = await apiClient.get('/settings/school/');
        if (res.data && isMounted) {
          setSchoolInfo({
            school_name: res.data.school_name || 'Lapasan NHS',
            school_id: res.data.school_id || '304033',
            school_logo: res.data.school_logo || res.data.right_logo || null,
          });
        }
      } catch {
        // Keeps fallback values if database or network is initializing
      }
    };

    fetchSchoolSettings();

    // Listen for real-time changes saved from the Settings tab
    const handleSettingsUpdated = () => {
      fetchSchoolSettings();
    };

    window.addEventListener('attendsure:school-settings-updated', handleSettingsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('attendsure:school-settings-updated', handleSettingsUpdated);
    };
  }, []);

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
  const sidebarWidth = isCollapsed ? '64px' : '224px';

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
        {/* Dynamic Institutional Header */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: isCollapsed ? 'center' : 'space-between', 
            padding: '2px 4px 10px 4px', 
            flexShrink: 0,
            borderBottom: '1px solid #f1f5f9',
            marginBottom: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
            <div 
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {schoolInfo.school_logo ? (
                <img 
                  src={schoolInfo.school_logo} 
                  alt="School Crest" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
              ) : (
                <img 
                  src={appLogoSrc} 
                  alt="AttendSure Logo" 
                  width={24} 
                  height={24} 
                  style={{ objectFit: 'contain' }} 
                />
              )}
            </div>

            {!isCollapsed && (
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div 
                  style={{ 
                    fontSize: '0.84rem', 
                    fontWeight: 800, 
                    color: '#0f172a', 
                    lineHeight: 1.15,
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                  }}
                  title={schoolInfo.school_name}
                >
                  {schoolInfo.school_name}
                </div>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#0284c7', letterSpacing: '0.3px', marginTop: 1 }}>
                  ID: {schoolInfo.school_id} &bull; AttendSure
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
                flexShrink: 0,
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
                <span style={{ color: isActive ? '#0284c7' : '#64748b', display: 'flex', alignItems: 'center' }}>
                  {item.icon}
                </span>
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: User Profile & Developer Copyright */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid #f1f5f9',
          paddingTop: 8,
          flexShrink: 0,
        }}
      >
        {/* User Account Info */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: 8,
            padding: '2px 4px',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.76rem',
              flexShrink: 0,
            }}
          >
            {userInitial}
          </div>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden' }}>
              <div 
                style={{ 
                  fontSize: '0.76rem', 
                  fontWeight: 700, 
                  color: '#0f172a', 
                  whiteSpace: 'nowrap', 
                  textOverflow: 'ellipsis' 
                }}
              >
                {session?.staff_name || session?.username || 'Administrator'}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>
                {session?.role || 'System Administrator'}
              </div>
            </div>
          )}
        </div>

        {/* Developer Attribution & Copyright */}
        {!isCollapsed ? (
          <div
            style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: '1px dashed #e2e8f0',
              fontSize: '0.60rem',
              color: '#94a3b8',
              lineHeight: 1.3,
              textAlign: 'center',
            }}
          >
            <div>AttendSure V3 &bull; DepEd Compliant</div>
            <div>
              &copy; 2026 Developed by{' '}
              <strong style={{ color: '#0284c7', fontWeight: 700 }}>TechBlazer</strong>
            </div>
          </div>
        ) : (
          <div
            title="Developed by TechBlazer"
            style={{
              marginTop: 6,
              paddingTop: 4,
              borderTop: '1px dashed #e2e8f0',
              fontSize: '0.54rem',
              color: '#94a3b8',
              textAlign: 'center',
              fontWeight: 700,
            }}
          >
            TB
          </div>
        )}
      </div>
    </aside>
  );
};

export default AdminSidebar;