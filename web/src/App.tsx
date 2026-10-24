// D:\AttendSure_V3\web\src\App.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from './api/client';
import { LoginView } from './components/auth/LoginView';
import { SplashScreen } from './components/splash/SplashScreen';
import { Sidebar, type NavItemKey } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ProfileModal, type ProfileUpdatePayload } from './components/profile/ProfileModal';
import { CompleteProfileModal, type CompletedProfileUser } from './components/profile/CompleteProfileModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { AlertProvider } from './context/AlertContext';
import type { UserSession } from './types/section';
import {
  ShieldAlert,
  ArrowLeft,
  Database,
  Radio,
} from 'lucide-react';

// Modular Tab Views
import {
  GateLogsTab,
  SF1ReportTab,
  SF2ReportTab,
  SF4ReportTab,
  StudentsTab,
  FacultysTab,
  DTRTab,
  ScannersTab,
  GatePassesTab,
  SchedulesTab,
  GeofenceTab,
  UsersTab,
  SettingsTab,
  SmsTab,
} from './components/tabs';
import { MyAssignedClassesTab } from './components/tabs/MyAssignedClassesTab';

// Strict Role-Based Access Control (RBAC) Permission Map
export const BASE_ROLE_PERMISSIONS: Record<string, NavItemKey[]> = {
  ADMIN: [
    'dashboard',
    'gate-logs',
    'students',
    'facultys',
    'users',
    'gate-passes',
    'schedules',
    'dtr',
    'geofence',
    'scanners',
    'sms',
    'reports',
    'settings',
  ],
  PRINCIPAL: [
    'dashboard',
    'gate-logs',
    'students',
    'facultys',
    'gate-passes',
    'schedules',
    'dtr',
    'geofence',
    'scanners',
    'sms',
    'reports',
    'settings',
  ],
  DEPT_HEAD: [
    'dashboard',
    'gate-logs',
    'students',
    'facultys',
    'gate-passes',
    'schedules',
    'dtr',
    'reports',
  ],
  FACULTY: [
    'dashboard',
    'my-classes',
    'students',
    'dtr',
    'gate-passes',
    'reports',
  ],
  TEACHER: [
    'dashboard',
    'my-classes',
    'students',
    'dtr',
    'gate-passes',
    'reports',

  ],
  GUARD: [
    'dashboard',
    'gate-logs',
    'gate-passes',
  ],
};

// ============================================================================
// ATTENDSURE TELEMETRY VEIL (Only activates if network genuinely fails)
// ============================================================================

interface TelemetrySyncVeilProps {
  onManualRetry: () => void;
  isChecking: boolean;
}

const TelemetrySyncVeil: React.FC<TelemetrySyncVeilProps> = ({ onManualRetry, isChecking }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 35,
        backgroundColor: 'rgba(11, 25, 44, 0.65)',
        backdropFilter: 'blur(6px) grayscale(90%)',
        WebkitBackdropFilter: 'blur(6px) grayscale(90%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '22px 26px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        style={{
          alignSelf: 'center',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 18px',
          borderRadius: 9999,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.45)',
          marginBottom: 22,
          cursor: 'pointer',
        }}
        onClick={onManualRetry}
        title="Click to retry connection"
      >
        <Radio size={14} color="#38bdf8" />
        <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#f8fafc' }}>
          {isChecking ? 'Reconnecting to AttendSure Server...' : 'Server Unreachable • Click to Reconnect'}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN APPLICATION CONTENT
// ============================================================================

const AppContent: React.FC = () => {
  const { school, loading: isSchoolLoading } = useSchool();

  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('attendsure_token');
    const username = localStorage.getItem('attendsure_username');
    const faculty_name = localStorage.getItem('attendsure_faculty_name');
    const role = localStorage.getItem('attendsure_role');
    return token
      ? { token, username: username || '', faculty_name: faculty_name || '', role: role || '' }
      : null;
  });

  const [userPhoto, setUserPhoto] = useState<string | null>(() => {
    return localStorage.getItem('attendsure_user_photo') || null;
  });

  const [canTeach, setCanTeach] = useState<boolean>(() => {
    return localStorage.getItem('attendsure_can_teach') === 'true';
  });
  const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [selectedReport, setSelectedReport] = useState<'sf1' | 'sf2' | 'sf4'>('sf1');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Connection State: Starts true to avoid initial delay flash
  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);
  const [isGateOnline, setIsGateOnline] = useState<boolean>(false);
  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(false);

  const userRole = (session?.role || '').toUpperCase();

  const allowedTabs = useMemo<NavItemKey[]>(() => {
    if (!userRole) return [];
    const baseAllowed = BASE_ROLE_PERMISSIONS[userRole] || BASE_ROLE_PERMISSIONS['FACULTY'];
    const tabs = [...baseAllowed];

    if (canTeach && !tabs.includes('my-classes') && userRole !== 'GUARD') {
      tabs.push('my-classes');
    }
    if (userRole === 'GUARD') {
      return tabs.filter((t) => t !== 'my-classes');
    }
    return tabs;
  }, [userRole, canTeach]);

  const isAllowedToAccess = useMemo(() => {
    return allowedTabs.includes(activeTab);
  }, [allowedTabs, activeTab]);

  useEffect(() => {
    if (session && allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [session, allowedTabs, activeTab]);

  const handleAuthExpired = useCallback(() => {
    localStorage.removeItem('attendsure_token');
    localStorage.removeItem('attendsure_username');
    localStorage.removeItem('attendsure_faculty_name');
    localStorage.removeItem('attendsure_role');
    localStorage.removeItem('attendsure_user_photo');
    localStorage.removeItem('attendsure_can_teach');
    setSession(null);
    setUserPhoto(null);
    setCanTeach(false);
    setIsCompleteProfileModalOpen(false);
  }, []);

  // Rapid Initial Warmup: Loads profile immediately without waterfall chaining
  useEffect(() => {
    if (!session?.token) return;

    let isSubscribed = true;

    apiClient
      .get('/me/', { timeout: 8000 })
      .then((res) => {
        if (!isSubscribed || !res.data) return;

        setIsServerOnline(true);
        const photo = res.data.photo || null;
        const name: string = String(res.data.full_name || res.data.username || '').trim();
        const role = (res.data.role || res.data.system_role || session.role || 'FACULTY').toUpperCase();
        const isCompleted = res.data.is_profile_completed ?? true;
        const canTeachFlag = Boolean(
          res.data.can_teach ||
          res.data.is_teaching ||
          res.data.assigned_class_count > 0 ||
          role === 'FACULTY' ||
          role === 'TEACHER'
        );

        if (photo) {
          setUserPhoto(photo);
          localStorage.setItem('attendsure_user_photo', photo);
        } else {
          setUserPhoto(null);
          localStorage.removeItem('attendsure_user_photo');
        }

        if (name) localStorage.setItem('attendsure_faculty_name', name);
        if (role) localStorage.setItem('attendsure_role', role);

        setCanTeach(canTeachFlag);
        localStorage.setItem('attendsure_can_teach', String(canTeachFlag));

        if (!isCompleted) {
          setIsCompleteProfileModalOpen(true);
        }

        setSession((prev) =>
          prev ? { ...prev, faculty_name: name || prev.faculty_name, role: role || prev.role } : null
        );
      })
      .catch((err) => {
        if (!isSubscribed) return;
        if (!err.response && (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error'))) {
          setIsServerOnline(false);
        } else if (err.response?.status === 401) {
          handleAuthExpired();
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [session?.token, handleAuthExpired]);

  // Lightweight Reconnection Check (Only runs when explicitly offline or requested)
  const retryConnection = useCallback(async () => {
    setIsCheckingServer(true);
    try {
      const res = await apiClient.get('/settings/school/', { timeout: 5000 });
      if (res.status >= 200 && res.status < 500) {
        setIsServerOnline(true);
      }
    } catch (err: any) {
      if (!err.response) {
        setIsServerOnline(false);
      }
    } finally {
      setIsCheckingServer(false);
    }
  }, []);

  const handleTabSelection = (tab: NavItemKey) => {
    if (allowedTabs.includes(tab)) setActiveTab(tab);
  };

  const getPageTitle = (): string => {
    if (!isAllowedToAccess) return 'Access Restricted';
    const currentSchool = school.school_name ? `${school.school_name} ` : '';

    switch (activeTab) {
      case 'dashboard': return `${currentSchool}Dashboard`;
      case 'my-classes': return 'Classes';
      case 'gate-logs': return 'Gate Logs';
      case 'students': return 'Students & ID Cards';
      case 'facultys': return 'Faculty & Staff Directory';
      case 'users': return 'Users & Roles';
      case 'gate-passes': return 'Gate Passes & Exit Permits';
      case 'schedules': return 'Class Schedules & Sections';
      case 'dtr': return 'Faculty Daily Time Records (DTR)';
      case 'geofence': return 'Geofence Boundary';
      case 'scanners': return 'Gate Scanners & Readers';
      case 'sms': return 'SMS & Hardware Outbox';
      case 'reports':
        if (selectedReport === 'sf1') return 'School Register (Form 1)';
        if (selectedReport === 'sf2') return 'Daily Attendance Register (Form 2)';
        return "Monthly Learner's Movement and Attendance (Form 4)";
      case 'settings': return 'School & Institutional Settings';
      default: return 'AttendSure Management System';
    }
  };

  const renderActiveTabContent = () => {
    if (!isAllowedToAccess) {
      return (
        <div style={{ height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <ShieldAlert size={28} color="#dc2626" />
          </div>
          <h2 style={{ fontSize: '1.20rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>Access Restricted</h2>
          <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 440, margin: '0 0 20px 0' }}>
            Your account role (<strong style={{ color: '#0f172a' }}>{userRole}</strong>) does not have permission to view this section.
          </p>
          <button
            onClick={() => setActiveTab(allowedTabs[0] || 'dashboard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', backgroundColor: '#0284c7', color: '#ffffff', borderRadius: 6, border: 'none', fontWeight: 700, cursor: 'pointer' }}
            type="button"
          >
            <ArrowLeft size={14} /> Return to Dashboard
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardView isServerOnline={isServerOnline} userRole={userRole} onGateStatusChange={setIsGateOnline} onManualRefresh={retryConnection} />;
      case 'my-classes': return <MyAssignedClassesTab />;
      case 'gate-logs': return <GateLogsTab />;
      case 'reports':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            {selectedReport === 'sf1' && <SF1ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />}
            {selectedReport === 'sf2' && <SF2ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />}
            {selectedReport === 'sf4' && <SF4ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />}
          </div>
        );
      case 'students': return <StudentsTab />;
      case 'facultys': return <FacultysTab />;
      case 'dtr': return <DTRTab />;
      case 'scanners': return <ScannersTab />;
      case 'sms': return <SmsTab />;
      case 'gate-passes': return <GatePassesTab />;
      case 'schedules': return <SchedulesTab />;
      case 'geofence': return <GeofenceTab />;
      case 'users': return <UsersTab />;
      case 'settings': return <SettingsTab />;
      default: return <DashboardView isServerOnline={isServerOnline} onGateStatusChange={setIsGateOnline} onManualRefresh={retryConnection} />;
    }
  };

  const resolvedSchoolLogo = school.school_logo || school.left_logo || null;

  return (
    <>
      {/* QUICK SPLASH SCREEN: Reduced from 1500ms+ to 300ms for instant feel */}
      <SplashScreen loading={isSchoolLoading} minDurationMs={300} />

      {!session ? (
        <LoginView
          onLoginSuccess={(newSession: UserSession) => {
            setSession(newSession);
            setActiveTab('dashboard');
          }}
        />
      ) : (
        <div style={{ display: 'flex', height: '100vh', width: '100%', maxWidth: '100vw', overflow: 'hidden', backgroundColor: '#f8fafc', textAlign: 'left' }}>
          <Sidebar
            activeTab={activeTab}
            onSelectTab={handleTabSelection}
            session={session}
            userPhoto={userPhoto}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
            schoolName={school.school_name}
            schoolId={school.school_id}
            schoolLogo={resolvedSchoolLogo}
            canTeach={canTeach}
            allowedTabs={allowedTabs}
          />

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
            <Header
              title={getPageTitle()}
              isGateNodeOnline={isServerOnline && isGateOnline}
              session={session}
              userPhoto={userPhoto}
              schoolName={school.school_name}
              schoolId={school.school_id}
              schoolLogo={resolvedSchoolLogo}
              onLogout={handleAuthExpired}
              onNavigateTab={handleTabSelection}
              onOpenProfile={() => setIsProfileModalOpen(true)}
            />

            <main style={{ flex: 1, minWidth: 0, height: 'calc(100vh - 100px)', overflowY: activeTab === 'dashboard' || activeTab === 'reports' ? 'hidden' : 'auto', overflowX: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: '100%', filter: !isServerOnline ? 'grayscale(90%) blur(3px) opacity(0.30)' : 'none', pointerEvents: !isServerOnline ? 'none' : 'auto', userSelect: !isServerOnline ? 'none' : 'auto', transition: 'filter 0.25s ease' }}>
                {renderActiveTabContent()}
              </div>

              {!isServerOnline && (
                <TelemetrySyncVeil onManualRetry={retryConnection} isChecking={isCheckingServer} />
              )}
            </main>

            <footer style={{ height: 38, minHeight: 38, backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', fontSize: '0.74rem', color: '#64748b', boxSizing: 'border-box', userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#334155' }}>
                  School ID: <span style={{ fontFamily: 'monospace' }}>{school.school_id || '340964'}</span>
                </span>
                {school.division && (
                  <>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span>{school.division}</span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: isServerOnline ? '#059669' : '#64748b', fontWeight: 600 }}>
                  <Database size={12} />
                  <span>{isServerOnline ? 'Database Live' : 'Reconnecting...'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>&copy; 2026 AttendSure • Developed by</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <img src="/techblazer.svg" alt="TECHBLAZER" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                  <strong style={{ color: '#0A1F3D', letterSpacing: '0.06em' }}>TECHBLAZER</strong>
                </div>
              </div>
            </footer>
          </div>

          <ProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onProfileUpdated={(updated: ProfileUpdatePayload) => {
              const safeName = typeof updated.full_name === 'string' && updated.full_name.trim() !== '' ? updated.full_name.trim() : undefined;
              if (safeName) {
                localStorage.setItem('attendsure_faculty_name', safeName);
                setSession((prev) => (prev ? { ...prev, faculty_name: safeName } : null));
              }
              if (updated.photo !== undefined) {
                setUserPhoto(updated.photo || null);
                if (updated.photo) localStorage.setItem('attendsure_user_photo', updated.photo);
                else localStorage.removeItem('attendsure_user_photo');
              }
            }}
          />

          <CompleteProfileModal
            isOpen={isCompleteProfileModalOpen}
            onCompleted={(updatedUser: CompletedProfileUser) => {
              setIsCompleteProfileModalOpen(false);
              const safeName = String(updatedUser.full_name || updatedUser.username || '').trim();
              const photo = (typeof updatedUser.photo_url === 'string' && updatedUser.photo_url) || (typeof updatedUser.photo === 'string' && updatedUser.photo) || null;
              if (safeName) {
                localStorage.setItem('attendsure_faculty_name', safeName);
                setSession((prev) => (prev ? { ...prev, faculty_name: safeName } : null));
              }
              if (photo) {
                setUserPhoto(photo);
                localStorage.setItem('attendsure_user_photo', photo);
              }
            }}
          />
        </div>
      )}
    </>
  );
};

export const App: React.FC = () => {
  return (
    <SchoolProvider>
      <AlertProvider>
        <AppContent />
      </AlertProvider>
    </SchoolProvider>
  );
};

export default App;