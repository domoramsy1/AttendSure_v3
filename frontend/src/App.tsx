import React, { useState, useEffect } from 'react';
import { LoginView } from './components/auth/LoginView';
import { AdminSidebar, type NavItemKey } from './components/layout/AdminSidebar';
import { AdminHeader } from './components/layout/AdminHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { SchoolProvider, useSchoolProfile } from './context/SchoolContext';
import type { UserSession } from './types/section';

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

const AppContent: React.FC = () => {
  const { profile } = useSchoolProfile();

  // Session State
  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('attendsure_token');
    const username = localStorage.getItem('attendsure_username');
    const staff_name = localStorage.getItem('attendsure_staff_name');
    const role = localStorage.getItem('attendsure_role');
    return token
      ? {
          token,
          username: username || '',
          staff_name: staff_name || '',
          role: role || '',
        }
      : null;
  });

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [selectedReport, setSelectedReport] = useState<'sf1' | 'sf2' | 'sf4'>('sf1');
  const [isGateOnline, setIsGateOnline] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const handleAuthExpired = () => {
      localStorage.removeItem('attendsure_token');
      localStorage.removeItem('attendsure_username');
      localStorage.removeItem('attendsure_staff_name');
      localStorage.removeItem('attendsure_role');
      setSession(null);
    };

    window.addEventListener('attendsure:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('attendsure:auth-expired', handleAuthExpired);
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setSession(null);
  };

  if (!session) {
    return (
      <LoginView
        onLoginSuccess={(newSession: UserSession) => setSession(newSession)}
      />
    );
  }

  const getPageTitle = (): string => {
    switch (activeTab) {
      case 'dashboard':
        return `${profile.school_name || 'School'} Dashboard Overview`;
      case 'gate-logs':
        return 'Gate Access Logs';
      case 'students':
        return 'Students Directory';
      case 'teachers':
        return 'Faculty & Staff';
      case 'users':
        return 'User Accounts';
      case 'gate-passes':
        return 'Gate Passes & Permits';
      case 'schedules':
        return 'Class Schedules & Sections';
      case 'dtr':
        return 'Staff Daily Time Records';
      case 'geofence':
        return 'Campus Perimeter Boundary';
      case 'scanners':
        return 'Gate Scanners & Terminals';
      case 'reports':
        if (selectedReport === 'sf1') return 'School Register (Form 1)';
        if (selectedReport === 'sf2') return 'Daily Attendance Register (Form 2)';
        return "Monthly Learner's Movement and Attendance (Form 4)";
      case 'settings':
        return 'School & Institutional Settings';
      default:
        return `${profile.school_name || 'AttendSure'} Management System`;
    }
  };

  const renderActiveTabContent = () => {
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
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        session={session}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
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
        <AdminHeader
          title={getPageTitle()}
          isGateNodeOnline={isGateOnline}
          session={session}
          onLogout={handleLogout}
        />

        <main
          style={{
            flex: 1,
            minWidth: 0,
            height: 'calc(100vh - 84px)',
            overflowY: activeTab === 'dashboard' || activeTab === 'reports' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            position: 'relative',
          }}
        >
          {renderActiveTabContent()}
        </main>

        {/* Global Developer Copyright Footer */}
        <footer
          style={{
            height: 36,
            minHeight: 36,
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            fontSize: '0.75rem',
            color: '#64748b',
            boxSizing: 'border-box',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#334155' }}>{profile.school_name}</span>
            <span>&bull;</span>
            <span>ID: {profile.school_id}</span>
            <span>&bull;</span>
            <span style={{ color: '#94a3b8' }}>{profile.division}</span>
          </div>
          <div>
            &copy; 2026 AttendSure V3. Developed by <strong style={{ color: '#0284c7' }}>TechBlazer</strong>. All rights reserved.
          </div>
        </footer>
      </div>
    </div>
  );
};

export const App: React.FC = () => (
  <SchoolProvider>
    <AppContent />
  </SchoolProvider>
);

export default App;