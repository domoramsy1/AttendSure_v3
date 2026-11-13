/**
 * AttendSure V3 - Main Application Layout & State Container
 * File: web/src/App.tsx
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from './api/client';
import { LoginView } from './components/auth/LoginView';
import { SplashScreen } from './components/splash/SplashScreen';
import { Sidebar, type NavItemKey } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Footer from './components/layout/Footer';
import { ProfileModal, type ProfileUpdatePayload } from './components/modals/ProfileModal';
import { CompleteProfileModal, type CompletedProfileUser } from './components/modals/CompleteProfileModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { AdvisorySubjectMonitor } from './components/advisory/AdvisorySubjectMonitor';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { AlertProvider } from './context/AlertContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import type { UserSession } from './types/section';
import {
  ShieldAlert,
  ArrowLeft,
  WifiOff,
} from 'lucide-react';

// Modular Tab Views
import {
  SF1ReportTab,
  SF2ReportTab,
  SF4ReportTab,
  StudentsTab,
  FacultyTab,
  DTRTab,
  GatePassesTab,
  SchedulesTab,
  GeofenceTab,
  UsersTab,
  SettingsTab,
  SmsTab,
} from './components/tabs';
import { MyAssignedClassesTab } from './components/tabs/MyAssignedClassesTab';
import { ClassroomScanner } from './components/scanner/ClassroomScanner';

// Role-Based Access Control (RBAC) Permissions Map (Classroom & Loafing Scope)
export const BASE_ROLE_PERMISSIONS: Record<string, NavItemKey[]> = {
  ADMIN: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'students',
    'facultys',
    'users',
    'gate-passes',
    'schedules',
    'dtr',
    'geofence',
    'sms',
    'reports',
    'settings',
  ],
  PRINCIPAL: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'students',
    'facultys',
    'gate-passes',
    'schedules',
    'dtr',
    'geofence',
    'sms',
    'reports',
    'settings',
  ],
  DEPT_HEAD: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'students',
    'facultys',
    'gate-passes',
    'schedules',
    'dtr',
    'reports',
  ],
  FACULTY: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'students',
    'dtr',
    'gate-passes',
    'reports',
  ],
};

interface OfflineNoticeOverlayProps {
  onManualRetry: () => void;
  isChecking: boolean;
}

const OfflineNoticeOverlay: React.FC<OfflineNoticeOverlayProps> = ({ onManualRetry, isChecking }) => {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 35,
        backgroundColor: 'rgba(15, 23, 42, 0.70)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 20px',
          borderRadius: 9999,
          backgroundColor: '#0f172a',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
        }}
        onClick={onManualRetry}
        title="Click to reconnect"
      >
        <WifiOff size={16} color="#38bdf8" />
        <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#f8fafc' }}>
          {isChecking ? 'Connecting to school system...' : 'System offline. Click to reconnect.'}
        </span>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { school, loading: isSchoolLoading } = useSchool();
  const { tokens, brand } = useTheme();

  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('attendsure_token');
    const username = localStorage.getItem('attendsure_username');
    const faculty_name = localStorage.getItem('attendsure_faculty_name');
    const role = localStorage.getItem('attendsure_role');
    const user_id = Number(localStorage.getItem('attendsure_user_id') || 0);

    return token
      ? {
          user_id,
          token,
          username: username || '',
          faculty_name: faculty_name || username || 'Faculty User',
          role: role || 'FACULTY',
        }
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

  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);
  const [isCheckingServer, setIsCheckingServer] = useState<boolean>(false);

  const userRole = (session?.role || '').toUpperCase();

  const allowedTabs = useMemo<NavItemKey[]>(() => {
    if (!userRole) return [];
    const baseAllowed = BASE_ROLE_PERMISSIONS[userRole] || BASE_ROLE_PERMISSIONS['FACULTY'];
    const tabs = [...baseAllowed];

    if (canTeach && !tabs.includes('my-classes')) {
      tabs.push('my-classes');
    }
    if (canTeach && !tabs.includes('classroom-scanner')) {
      tabs.push('classroom-scanner');
    }
    if (canTeach && !tabs.includes('advisory-monitor')) {
      tabs.push('advisory-monitor');
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
    localStorage.removeItem('attendsure_user_id');
    localStorage.removeItem('attendsure_user_photo');
    localStorage.removeItem('attendsure_can_teach');
    setSession(null);
    setUserPhoto(null);
    setCanTeach(false);
    setIsCompleteProfileModalOpen(false);
  }, []);

  const handleTabSelection = useCallback((tab: NavItemKey) => {
    if (allowedTabs.includes(tab)) setActiveTab(tab);
  }, [allowedTabs]);

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent<string | { tab: string; report?: string }>;
      const detail = customEvent.detail;
      if (!detail) return;

      if (typeof detail === 'string') {
        handleTabSelection(detail as NavItemKey);
      } else if (typeof detail === 'object' && detail.tab) {
        handleTabSelection(detail.tab as NavItemKey);
        if (detail.report && ['sf1', 'sf2', 'sf4'].includes(detail.report)) {
          setSelectedReport(detail.report as 'sf1' | 'sf2' | 'sf4');
        }
      }
    };

    window.addEventListener('attendsure:navigate', handleNavigate);
    return () => window.removeEventListener('attendsure:navigate', handleNavigate);
  }, [handleTabSelection]);

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
        const userId = Number(res.data.id || res.data.user_id || 0);
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
        if (userId) localStorage.setItem('attendsure_user_id', String(userId));

        setCanTeach(canTeachFlag);
        localStorage.setItem('attendsure_can_teach', String(canTeachFlag));

        if (!isCompleted) {
          setIsCompleteProfileModalOpen(true);
        }

        setSession((prev) =>
          prev
            ? {
                ...prev,
                user_id: userId || prev.user_id,
                faculty_name: name || prev.faculty_name,
                role: role || prev.role,
              }
            : null
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

  const getPageTitle = (): string => {
    if (!isAllowedToAccess) return 'Access Restricted';
    const currentSchool = school.school_name ? `${school.school_name} ` : '';

    switch (activeTab) {
      case 'dashboard': return `${currentSchool}Dashboard`;
      case 'classroom-scanner': return 'Classroom Attendance Scanner';
      case 'my-classes': return 'My Classes';
      case 'advisory-monitor': return 'Classroom Attendance & Loafing Monitor';
      case 'students': return 'Student Profiles & IDs';
      case 'facultys': return 'Faculty & Staff Directory';
      case 'users': return 'User Accounts & Roles';
      case 'gate-passes': return 'Classroom Exit Passes';
      case 'schedules': return 'Class Schedules & Sections';
      case 'dtr': return 'Daily Time Records (DTR)';
      case 'geofence': return 'Campus Boundary';
      case 'sms': return 'Parent Text Messages (SMS)';
      case 'reports':
        if (selectedReport === 'sf1') return 'School Register (Form 1)';
        if (selectedReport === 'sf2') return 'Daily Attendance Register (Form 2)';
        return "Monthly Learner's Movement and Attendance (Form 4)";
      case 'settings': return 'School Settings';
      default: return 'AttendSure System';
    }
  };

  const renderActiveTabContent = () => {
    if (!isAllowedToAccess) {
      return (
        <div style={{ height: '100%', minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <ShieldAlert size={28} color={brand.danger} />
          </div>
          <h2 style={{ fontSize: '1.20rem', fontWeight: 800, color: tokens.textPrimary, margin: '0 0 6px 0' }}>Access Restricted</h2>
          <p style={{ fontSize: '0.82rem', color: tokens.textMuted, maxWidth: 440, margin: '0 0 20px 0' }}>
            Your account role (<strong style={{ color: tokens.textPrimary }}>{userRole}</strong>) does not have permission to view this section.
          </p>
          <button
            onClick={() => setActiveTab(allowedTabs[0] || 'dashboard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', backgroundColor: brand.primary, color: '#ffffff', borderRadius: 8, border: 'none', fontWeight: 700, cursor: 'pointer' }}
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
            onManualRefresh={retryConnection}
            onNavigateTab={(tab, report) => {
              handleTabSelection(tab as NavItemKey);
              if (report && ['sf1', 'sf2', 'sf4'].includes(report)) {
                setSelectedReport(report as 'sf1' | 'sf2' | 'sf4');
              }
            }}
          />
        );
      case 'classroom-scanner':
        return (
          <div style={{ padding: 'clamp(12px, 2vw, 20px)', width: '100%', boxSizing: 'border-box' }}>
            <ClassroomScanner />
          </div>
        );
      case 'my-classes': return <MyAssignedClassesTab />;
      case 'advisory-monitor':
        return (
          <div style={{ padding: 'clamp(12px, 2vw, 20px)', width: '100%', boxSizing: 'border-box' }}>
            <AdvisorySubjectMonitor />
          </div>
        );
      case 'reports':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            {selectedReport === 'sf1' && <SF1ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />}
            {selectedReport === 'sf2' && <SF2ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />}
            {selectedReport === 'sf4' && <SF4ReportTab activeReportId={selectedReport} onSelectReport={(id) => setSelectedReport(id as any)} />}
          </div>
        );
      case 'students': return <StudentsTab />;
      case 'facultys': return <FacultyTab />;
      case 'dtr': return <DTRTab />;
      case 'sms': return <SmsTab />;
      case 'gate-passes': return <GatePassesTab />;
      case 'schedules': return <SchedulesTab />;
      case 'geofence': return <GeofenceTab />;
      case 'users': return <UsersTab />;
      case 'settings': return <SettingsTab />;
      default: return <DashboardView isServerOnline={isServerOnline} onManualRefresh={retryConnection} />;
    }
  };

  const resolvedSchoolLogo = school.school_logo || school.left_logo || null;

  return (
    <>
      <SplashScreen loading={isSchoolLoading} minDurationMs={300} />

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
            maxWidth: '100%',
            overflow: 'hidden',
            backgroundColor: tokens.bgApp || '#f1f5f9',
            padding: 'clamp(8px, 1.2vw, 16px)',
            gap: 'clamp(8px, 1.2vw, 16px)',
            boxSizing: 'border-box',
            textAlign: 'left',
            transition: 'background-color 0.2s ease',
          }}
        >
          {/* Floating Sidebar */}
          <div
            style={{
              height: '100%',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: tokens.cardShadow,
              border: `1px solid ${tokens.borderSubtle}`,
              display: 'flex',
              flexShrink: 0,
              backgroundColor: tokens.bgSurface,
              transition: 'background-color 0.2s ease, border-color 0.2s ease',
            }}
          >
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
          </div>

          {/* Floating Main Content Card */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              minHeight: 0,
              height: '100%',
              borderRadius: 16,
              backgroundColor: tokens.bgSurface,
              boxShadow: tokens.cardShadow,
              border: `1px solid ${tokens.borderSubtle}`,
              overflow: 'hidden',
              boxSizing: 'border-box',
              transition: 'background-color 0.2s ease, border-color 0.2s ease',
            }}
          >
            <Header
              title={getPageTitle()}
              isGateNodeOnline={isServerOnline}
              session={session}
              userPhoto={userPhoto}
              schoolName={school.school_name}
              schoolId={school.school_id}
              schoolLogo={resolvedSchoolLogo}
              onLogout={handleAuthExpired}
              onNavigateTab={handleTabSelection}
              onOpenProfile={() => setIsProfileModalOpen(true)}
            />

            <main
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                overflowY: activeTab === 'dashboard' || activeTab === 'reports' ? 'hidden' : 'auto',
                overflowX: 'hidden',
                position: 'relative',
                backgroundColor: tokens.bgSurfaceSubtle,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: '100%',
                  height: '100%',
                  filter: !isServerOnline ? 'grayscale(90%) blur(3px) opacity(0.30)' : 'none',
                  pointerEvents: !isServerOnline ? 'none' : 'auto',
                  userSelect: !isServerOnline ? 'none' : 'text',
                  transition: 'filter 0.25s ease',
                }}
              >
                {renderActiveTabContent()}
              </div>

              {!isServerOnline && (
                <OfflineNoticeOverlay onManualRetry={retryConnection} isChecking={isCheckingServer} />
              )}
            </main>

            <Footer
              schoolName={school.school_name}
              schoolId={school.school_id}
              divisionOrCity={school.division}
              isDatabaseConnected={isServerOnline}
              isGateSystemOnline={isServerOnline}
            />
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
    <ThemeProvider>
      <SchoolProvider>
        <AlertProvider>
          <AppContent />
        </AlertProvider>
      </SchoolProvider>
    </ThemeProvider>
  );
};

export default App;