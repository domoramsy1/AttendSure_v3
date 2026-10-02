import React, { useState, useEffect } from 'react';
import { LoginView } from './components/auth/LoginView';
import { AdminSidebar, type NavItemKey } from './components/layout/AdminSidebar';
import { AdminHeader } from './components/layout/AdminHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import type { UserSession } from './types/section';

// Modular Tab Views
import {
  GateLogsTab,
  SF1ReportTab,
  StudentsTab,
  TeachersTab,
  DTRTab,
  ScannersTab,
  GatePassesTab,
  SchedulesTab,
  GeofenceTab,
  UsersTab,
} from './components/tabs';
import { SettingsTab } from './components/tabs/SettingsTab';

export const App: React.FC = () => {
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

  // Navigation & Shell State
  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [isGateOnline, setIsGateOnline] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Listen for backend token invalidation
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
        return 'Dashboard';
      case 'gate-logs':
        return 'Gate Access Logs';
      case 'students':
        return 'Students';
      case 'teachers':
        return 'Teachers';
      case 'users':
        return 'User Accounts';
      case 'gate-passes':
        return 'Pass Slips';
      case 'schedules':
        return 'Classes & Sections';
      case 'dtr':
        return 'Teacher DTR (Form 48)';
      case 'geofence':
        return 'Campus Boundary';
      case 'scanners':
        return 'Gate Scanners';
      case 'reports':
        return 'DepEd Reports (SF1)';
      case 'settings':
        return 'System & School Settings';
      default:
        return 'AttendSure';
    }
  };

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView onGateStatusChange={setIsGateOnline} />;
      case 'gate-logs':
        return <GateLogsTab />;
      case 'reports':
        return <SF1ReportTab />;
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
            height: 'calc(100vh - 48px)',
            overflowY: activeTab === 'dashboard' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            position: 'relative',
          }}
        >
          {renderActiveTabContent()}
        </main>
      </div>
    </div>
  );
};

export default App;