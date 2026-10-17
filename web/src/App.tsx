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
  WifiOff,
  RefreshCw,
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

// DepEd Role-Based Access Control Map
const BASE_ROLE_PERMISSIONS: Record<string, NavItemKey[]> = {
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
    'schedules',
    'dtr',
    'gate-passes',
    'reports',
  ],
};

const AppContent: React.FC = () => {
  const { school, loading: isSchoolLoading } = useSchool();

  // User Session State
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

  // Dual-role teaching & profile completion flags
  const [canTeach, setCanTeach] = useState<boolean>(() => {
    return localStorage.getItem('attendsure_can_teach') === 'true';
  });
  const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState<boolean>(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [selectedReport, setSelectedReport] = useState<'sf1' | 'sf2' | 'sf4'>('sf1');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Live Server & Hardware Health States
  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);
  const [isGateOnline, setIsGateOnline] = useState<boolean>(false);
  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(false);

  const userRole = (session?.role || '').toUpperCase();

  // Clear session storage upon logout or token expiration
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

  // Server Heartbeat Check
  const checkServerHealth = useCallback(async () => {
    try {
      setIsCheckingServer(true);
      await apiClient.get('/settings/school/', { timeout: 4000 });
      setIsServerOnline(true);
    } catch (err: any) {
      if (!err.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setIsServerOnline(false);
        setIsGateOnline(false);
      }
    } finally {
      setIsCheckingServer(false);
    }
  }, []);

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 10000);
    return () => clearInterval(interval);
  }, [checkServerHealth]);

  // Synchronize authenticated user profile, teaching status, and profile completion
  useEffect(() => {
    if (!session?.token) return;

    apiClient
      .get('/me/', { timeout: 5000 })
      .then((res) => {
        if (res.data) {
          setIsServerOnline(true);
          const photo = res.data.photo || null;
          const name: string = String(res.data.full_name || res.data.username || '').trim();
          const role = (res.data.role || res.data.system_role || session.role || 'FACULTY').toUpperCase();
          const isCompleted = res.data.is_profile_completed ?? true;
          const canTeachFlag = Boolean(
            res.data.can_teach ||
            res.data.is_teaching ||
            res.data.assigned_class_count > 0 ||
            role === 'FACULTY'
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

          // Prompt profile completion if admin created user stub
          if (!isCompleted) {
            setIsCompleteProfileModalOpen(true);
          }

          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  faculty_name: name || prev.faculty_name,
                  role: role || prev.role,
                }
              : null
          );
        }
      })
      .catch((err) => {
        if (!err.response) {
          setIsServerOnline(false);
        } else if (err.response.status === 401) {
          handleAuthExpired();
        }
      });
  }, [session?.token, handleAuthExpired]);

  // Global Navigation Events
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<string | { tab: NavItemKey; report?: 'sf1' | 'sf2' | 'sf4' }>;
      if (!customEvent.detail) return;

      const baseAllowed = BASE_ROLE_PERMISSIONS[userRole] || BASE_ROLE_PERMISSIONS['FACULTY'];
      const allowedTabs = [...baseAllowed];
      if (canTeach && !allowedTabs.includes('my-classes')) {
        allowedTabs.push('my-classes');
      }

      if (typeof customEvent.detail === 'string') {
        const targetTab = customEvent.detail as NavItemKey;
        if (allowedTabs.includes(targetTab)) {
          setActiveTab(targetTab);
        }
      } else if (typeof customEvent.detail === 'object') {
        const { tab, report } = customEvent.detail;
        if (allowedTabs.includes(tab)) {
          setActiveTab(tab);
          if (report) {
            setSelectedReport(report);
          }
        }
      }
    };

    window.addEventListener('attendsure:auth-expired', handleAuthExpired);
    window.addEventListener('attendsure:navigate', handleNavigate);

    return () => {
      window.removeEventListener('attendsure:auth-expired', handleAuthExpired);
      window.removeEventListener('attendsure:navigate', handleNavigate);
    };
  }, [userRole, canTeach, handleAuthExpired]);

  // Determine allowed access based on role & teaching duties
  const isAllowedToAccess = useMemo(() => {
    if (!userRole) return false;
    const baseAllowed = BASE_ROLE_PERMISSIONS[userRole] || BASE_ROLE_PERMISSIONS['FACULTY'];
    const allowed = [...baseAllowed];
    if (canTeach && !allowed.includes('my-classes')) {
      allowed.push('my-classes');
    }
    return allowed.includes(activeTab);
  }, [userRole, canTeach, activeTab]);

  const handleTabSelection = (tab: NavItemKey) => {
    setActiveTab(tab);
  };

  const getPageTitle = (): string => {
    if (!isAllowedToAccess) return 'Access Restricted';
    const currentSchool = school.school_name ? `${school.school_name} ` : '';

    switch (activeTab) {
      case 'dashboard':
        return `${currentSchool}Dashboard Overview`;
      case 'my-classes':
        return 'My Assigned Classes & Student Roster';
      case 'gate-logs':
        return 'Gate Logs';
      case 'students':
        return 'Student Directory & ID Cards';
      case 'facultys':
        return 'Faculty & Staff Directory';
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
      case 'sms':
        return 'SMS Gateway & Hardware Outbox';
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
          <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 440, margin: '0 0 20px 0' }}>
            Your account role (<strong style={{ color: '#0f172a' }}>{userRole}</strong>) does not have permission to view this section.
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
              fontWeight: 700,
              cursor: 'pointer',
            }}
            type="button"
          >
            <ArrowLeft size={14} /> Return to Dashboard
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardView
            isServerOnline={isServerOnline}
            userRole={userRole}
            onGateStatusChange={setIsGateOnline}
            onManualRefresh={checkServerHealth}
          />
        );
      case 'my-classes':
        return <MyAssignedClassesTab />;
      case 'gate-logs':
        return <GateLogsTab />;
      case 'reports':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            {selectedReport === 'sf1' && (
              <SF1ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />
            )}
            {selectedReport === 'sf2' && (
              <SF2ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />
            )}
            {selectedReport === 'sf4' && (
              <SF4ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />
            )}
          </div>
        );
      case 'students':
        return <StudentsTab />;
      case 'facultys':
        return <FacultysTab />;
      case 'dtr':
        return <DTRTab />;
      case 'scanners':
        return <ScannersTab />;
      case 'sms':
        return <SmsTab />;
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
        return (
          <DashboardView
            isServerOnline={isServerOnline}
            onGateStatusChange={setIsGateOnline}
            onManualRefresh={checkServerHealth}
          />
        );
    }
  };

  const resolvedSchoolLogo = school.school_logo || school.left_logo || null;

  return (
    <>
      <SplashScreen loading={isSchoolLoading} minDurationMs={2500} />

      {!session ? (
        <LoginView
          onLoginSuccess={(newSession: UserSession) => {
            setSession(newSession);
            setActiveTab('dashboard');
          }}
        />
      ) : (
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
          {/* Sidebar */}
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
            {/* Header */}
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

            {/* Offline Alert Bar */}
            {!isServerOnline && (
              <div
                style={{
                  backgroundColor: '#fee2e2',
                  borderBottom: '1px solid #f87171',
                  color: '#991b1b',
                  padding: '8px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <WifiOff size={16} color="#dc2626" />
                  <span>
                    Backend Server Disconnected. Cannot reach API server. Data shown below may be stale.
                  </span>
                </div>
                <button
                  onClick={checkServerHealth}
                  disabled={isCheckingServer}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: isCheckingServer ? 'not-allowed' : 'pointer',
                  }}
                  type="button"
                >
                  <RefreshCw size={12} className={isCheckingServer ? 'animate-spin' : ''} />
                  <span>{isCheckingServer ? 'Reconnecting...' : 'Retry Connection'}</span>
                </button>
              </div>
            )}

            {/* Screen Viewport */}
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

            {/* Global Footer */}
            <footer
              style={{
                height: 38,
                minHeight: 38,
                backgroundColor: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                fontSize: '0.74rem',
                color: '#64748b',
                boxSizing: 'border-box',
                userSelect: 'none',
              }}
            >
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
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    color: isServerOnline ? '#059669' : '#dc2626',
                    fontWeight: 600,
                  }}
                >
                  <Database size={12} />
                  <span>{isServerOnline ? 'Database Live' : 'Database Disconnected'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>&copy; 2026 AttendSure • Developed by</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <img
                    src="/techblazer.svg"
                    alt="TECHBLAZER"
                    style={{ width: 14, height: 14, objectFit: 'contain' }}
                  />
                  <strong style={{ color: '#0A1F3D', letterSpacing: '0.06em' }}>TECHBLAZER</strong>
                </div>
              </div>
            </footer>
          </div>

          {/* Standard Profile Modal */}
          <ProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            onProfileUpdated={(updated: ProfileUpdatePayload) => {
              const safeName = typeof updated.full_name === 'string' && updated.full_name.trim() !== ''
                ? updated.full_name.trim()
                : undefined;

              if (safeName) {
                localStorage.setItem('attendsure_faculty_name', safeName);
                setSession((prev) => (prev ? { ...prev, faculty_name: safeName } : null));
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

          {/* Mandatory First-Time Profile Completion Modal */}
          <CompleteProfileModal
            isOpen={isCompleteProfileModalOpen}
            onCompleted={(updatedUser: CompletedProfileUser) => {
              setIsCompleteProfileModalOpen(false);
              const safeName = String(updatedUser.full_name || updatedUser.username || '').trim();
              const photo = (typeof updatedUser.photo_url === 'string' && updatedUser.photo_url)
                || (typeof updatedUser.photo === 'string' && updatedUser.photo)
                || null;

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

export const App: React.FC = () => (
  <SchoolProvider>
    <AlertProvider>
      <AppContent />
    </AlertProvider>
  </SchoolProvider>
);

export default App;