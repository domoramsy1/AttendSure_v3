import React, { useState, useEffect, useMemo } from 'react';
import apiClient from './api/client';
import { LoginView } from './components/auth/LoginView';
import { Sidebar, type NavItemKey } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ProfileModal } from './components/profile/ProfileModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { SchoolProvider, useSchoolProfile } from './context/SchoolContext';
import type { UserSession } from './types/section';
import { ShieldAlert, ArrowLeft, Radio, Database } from 'lucide-react';
import { AlertProvider } from './context/AlertContext';

// Modular Tab Views
import {
  GateLogsTab,
  SF1ReportTab,
  SF2ReportTab,
  SF4ReportTab,
  StudentsTab,
  TeachersTab,
  DTRTab,
  ScannersTab,
  GatePassesTab,
  SchedulesTab,
  GeofenceTab,
  UsersTab,
  SettingsTab,
} from './components/tabs';

// Strictly ADMIN and TEACHER roles
const ROLE_PERMISSIONS: Record<string, NavItemKey[]> = {
  ADMIN: [
    'dashboard',
    'gate-logs',
    'students',
    'teachers',
    'users',
    'gate-passes',
    'schedules',
    'dtr',
    'geofence',
    'scanners',
    'reports',
    'settings',
  ],
  TEACHER: [
    'dashboard',
    'students',
    'schedules',
    'dtr',
    'gate-passes',
    'reports',
  ],
};

const AppContent: React.FC = () => {
  const { profile } = useSchoolProfile();

  // User Session & Avatar State
  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('attendsure_token');
    const username = localStorage.getItem('attendsure_username');
    const faculty_name = localStorage.getItem('attendsure_faculty_name');
    const role = localStorage.getItem('attendsure_role');
    return token
      ? {
          token,
          username: username || '',
          faculty_name: faculty_name || '',
          role: role || '',
        }
      : null;
  });

  const [userPhoto, setUserPhoto] = useState<string | null>(() => {
    return localStorage.getItem('attendsure_user_photo') || null;
  });

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [selectedReport, setSelectedReport] = useState<'sf1' | 'sf2' | 'sf4'>('sf1');
  const [isGateOnline, setIsGateOnline] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Sync profile & photo from database on mount or session start
  useEffect(() => {
    if (!session?.token) return;

    apiClient
      .get('/me/')
      .then((res) => {
        if (res.data) {
          const photo = res.data.photo || null;
          const name = res.data.full_name || res.data.username;

          if (photo) {
            setUserPhoto(photo);
            localStorage.setItem('attendsure_user_photo', photo);
          } else {
            setUserPhoto(null);
            localStorage.removeItem('attendsure_user_photo');
          }

          if (name) {
            localStorage.setItem('attendsure_faculty_name', name);
            setSession((prev) => (prev ? { ...prev, faculty_name: name } : null));
          }
        }
      })
      .catch(() => {});
  }, [session?.token]);

  useEffect(() => {
    const handleAuthExpired = () => {
      localStorage.removeItem('attendsure_token');
      localStorage.removeItem('attendsure_username');
      localStorage.removeItem('attendsure_faculty_name');
      localStorage.removeItem('attendsure_role');
      localStorage.removeItem('attendsure_user_photo');
      setSession(null);
      setUserPhoto(null);
    };

    window.addEventListener('attendsure:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('attendsure:auth-expired', handleAuthExpired);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setSession(null);
    setUserPhoto(null);
  };

  const userRole = (session?.role || '').toUpperCase();

  const isAllowedToAccess = useMemo(() => {
    if (!userRole) return false;
    const allowedTabs = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['TEACHER'];
    return allowedTabs.includes(activeTab);
  }, [userRole, activeTab]);

  if (!session) {
    return (
      <LoginView
        onLoginSuccess={(newSession: UserSession) => {
          setSession(newSession);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const handleTabSelection = (tab: NavItemKey) => {
    setActiveTab(tab);
  };

  const getPageTitle = (): string => {
    if (!isAllowedToAccess) {
      return 'Access Restricted';
    }

    const currentSchool = profile.school_name ? `${profile.school_name} ` : '';

    switch (activeTab) {
      case 'dashboard':
        return `${currentSchool}Dashboard Overview`;
      case 'gate-logs':
        return 'Gate Access Logs';
      case 'students':
        return 'Student Directory & ID Cards';
      case 'teachers':
        return 'Faculty';
      case 'users':
        return 'User Accounts & Roles';
      case 'gate-passes':
        return 'Gate Passes & Exit Permits';
      case 'schedules':
        return 'Class Schedules & Sections';
      case 'dtr':
        return 'Faculty Daily Time Records (Form 48)';
      case 'geofence':
        return 'Campus Perimeter Boundary';
      case 'scanners':
        return 'Gate Scanners & Readers';
      case 'reports':
        if (selectedReport === 'sf1') return 'School Register (Form 1)';
        if (selectedReport === 'sf2') return 'Daily Attendance Register (Form 2)';
        return "Monthly Learner's Movement and Attendance (Form 4)";
      case 'settings':
        return 'School & Institutional Settings';
      default:
        return 'AttendSure Management System';
    }
  };

  const renderActiveTabContent = () => {
    if (!isAllowedToAccess) {
      return (
        <div
          style={{
            height: '100%',
            minHeight: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
            backgroundColor: '#f8fafc',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <ShieldAlert size={28} color="#dc2626" />
          </div>
          <h2 style={{ fontSize: '1.20rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
            Access Restricted
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 440, margin: '0 0 20px 0', lineHeight: 1.5 }}>
            Your account role (<strong style={{ color: '#0f172a' }}>{userRole}</strong>) does not have permission to access this screen.
          </p>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              borderRadius: 6,
              border: 'none',
              fontSize: '0.80rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} />
            <span>Return to Dashboard</span>
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onGateStatusChange={setIsGateOnline} />;
      case 'gate-logs':
        return <GateLogsTab />;
      case 'reports':
        return (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            {selectedReport === 'sf1' && (
              <SF1ReportTab
                activeReportId={selectedReport}
                onSelectReport={(id: string) => setSelectedReport(id as 'sf1' | 'sf2' | 'sf4')}
              />
            )}
            {selectedReport === 'sf2' && (
              <SF2ReportTab
                activeReportId={selectedReport}
                onSelectReport={(id: string) => setSelectedReport(id as 'sf1' | 'sf2' | 'sf4')}
              />
            )}
            {selectedReport === 'sf4' && (
              <SF4ReportTab
                activeReportId={selectedReport}
                onSelectReport={(id: string) => setSelectedReport(id as 'sf1' | 'sf2' | 'sf4')}
              />
            )}
          </div>
        );
      case 'students':
        return <StudentsTab />;
      case 'teachers':
        return <TeachersTab />;
      case 'dtr':
        return <DTRTab />;
      case 'scanners':
        return <ScannersTab />;
      case 'gate-passes':
        return <GatePassesTab />;
      case 'schedules':
        return <SchedulesTab />;
      case 'geofence':
        return <GeofenceTab />;
      case 'users':
        return <UsersTab />;
      case 'settings':
        return <SettingsTab />;
      default:
        return <DashboardView onGateStatusChange={setIsGateOnline} />;
    }
  };

  const resolvedSchoolLogo =
    profile.school_logo ||
    (profile as any).school_seal_photo ||
    (profile as any).left_logo ||
    null;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        maxWidth: '100vw',
        overflow: 'hidden',
        backgroundColor: '#f8fafc',
        textAlign: 'left',
      }}
    >
      {/* 1. Sidebar with User Avatar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleTabSelection}
        session={session}
        userPhoto={userPhoto}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        schoolName={profile.school_name}
        schoolId={profile.school_id}
        schoolLogo={resolvedSchoolLogo}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* 2. Global Header with User Avatar */}
        <Header
          title={getPageTitle()}
          isGateNodeOnline={isGateOnline}
          session={session}
          userPhoto={userPhoto}
          schoolName={profile.school_name}
          schoolId={profile.school_id}
          schoolLogo={resolvedSchoolLogo}
          onLogout={handleLogout}
          onNavigateTab={handleTabSelection}
          onOpenProfile={() => setIsProfileModalOpen(true)}
        />

        {/* 3. Screen Viewport */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            height: 'calc(100vh - 98px)',
            overflowY: activeTab === 'dashboard' || activeTab === 'reports' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            position: 'relative',
          }}
        >
          {renderActiveTabContent()}
        </main>

        {/* 4. Global Footer */}
        <footer
          style={{
            height: 38,
            minHeight: 38,
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            fontSize: '0.74rem',
            color: '#64748b',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {profile.school_name && (
              <span style={{ fontWeight: 700, color: '#1e293b' }}>{profile.school_name}</span>
            )}
            {profile.school_id && (
              <>
                <span>&bull;</span>
                <span>
                  School ID: <strong style={{ color: '#475569', fontFamily: 'monospace' }}>{profile.school_id}</strong>
                </span>
              </>
            )}
            {profile.division && (
              <>
                <span>&bull;</span>
                <span style={{ color: '#94a3b8' }}>{profile.division}</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#059669', fontWeight: 600 }}>
              <Database size={12} />
              <span>Database Connected</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: isGateOnline ? '#0284c7' : '#e11d48', fontWeight: 600 }}>
              <Radio size={12} />
              <span>Gate System {isGateOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <div>
            &copy; 2026 AttendSure V3 &bull; Developed by <strong style={{ color: '#0284c7' }}>TechBlazer</strong>. All rights reserved.
          </div>
        </footer>
      </div>

      {/* 5. User Self-Profile Management Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated) => {
          if (updated.full_name) {
            localStorage.setItem('attendsure_faculty_name', updated.full_name);
            setSession((prev) => (prev ? { ...prev, faculty_name: updated.full_name } : null));
          }
          if (updated.photo !== undefined) {
            setUserPhoto(updated.photo || null);
            if (updated.photo) {
              localStorage.setItem('attendsure_user_photo', updated.photo);
            } else {
              localStorage.removeItem('attendsure_user_photo');
            }
          }
        }}
      />
    </div>
  );
};

export const App: React.FC = () => (
  <SchoolProvider>
    <AlertProvider>
      <AppContent />
    </AlertProvider>
  </SchoolProvider>
);
export default App;