/**
 * AttendSure - Zero-Lag Application Shell (Hover Prefetch + Non-Blocking Transitions)
 * File: web/src/App.tsx
 */

import React, { Suspense, lazy, startTransition, useState, useEffect, useMemo, useCallback } from 'react';
import apiClient, { prefetchApiGet, warmupRoleEndpoints } from './api/client';
import { API_ROUTES } from './api/routes';
import { AuthPage as LoginView } from './components/auth/AuthPage';
import { SplashScreen } from './components/splash/SplashScreen';
import { Sidebar, type NavItemKey } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Footer from './components/layout/Footer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProfileModal, type ProfileUpdatePayload } from './components/modals/ProfileModal';
import { CompleteProfileModal, type CompletedProfileUser } from './components/modals/CompleteProfileModal';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { AlertProvider } from './context/AlertContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import type { UserSession } from './types/section';
import { ShieldAlert, ArrowLeft, WifiOff } from 'lucide-react';

const loadDashboard = () => import('./components/dashboard/DashboardView');
const loadScanner = () => import('./components/scanner/ClassroomScanner');
const loadMyClasses = () => import('./components/tabs/MyAssignedClassesTab');
const loadAdvisory = () => import('./components/advisory/AdvisorySubjectMonitor');
const loadStudents = () => import('./components/tabs/StudentsTab');
const loadFaculty = () => import('./components/tabs/FacultyTab');
const loadUsers = () => import('./components/tabs/UsersTab');
const loadGatePasses = () => import('./components/tabs/GatePassesTab');
const loadSchedules = () => import('./components/tabs/SchedulesTab');
const loadDtr = () => import('./components/tabs/DTRTab');
const loadGeofence = () => import('./components/tabs/GeofenceTab');
const loadPush = () => import('./components/tabs/PushNotificationsTab');
const loadParentChat = () => import('./components/tabs/ParentChatTab');
const loadSettings = () => import('./components/tabs/SettingsTab');
const loadSf1 = () => import('./components/tabs/SF1ReportTab');
const loadSf2 = () => import('./components/tabs/SF2ReportTab');
const loadSf4 = () => import('./components/tabs/SF4ReportTab');

const DashboardView = lazy(loadDashboard);
const ClassroomScanner = lazy(loadScanner);
const MyAssignedClassesTab = lazy(loadMyClasses);
const AdvisorySubjectMonitor = lazy(loadAdvisory);
const StudentsTab = lazy(loadStudents);
const FacultyTab = lazy(loadFaculty);
const UsersTab = lazy(loadUsers);
const GatePassesTab = lazy(loadGatePasses);
const SchedulesTab = lazy(loadSchedules);
const DTRTab = lazy(loadDtr);
const GeofenceTab = lazy(loadGeofence);
const PushNotificationsTab = lazy(loadPush);
const ParentChatTab = lazy(loadParentChat);
const SettingsTab = lazy(loadSettings);
const SF1ReportTab = lazy(loadSf1);
const SF2ReportTab = lazy(loadSf2);
const SF4ReportTab = lazy(loadSf4);

export const BASE_ROLE_PERMISSIONS: Record<string, NavItemKey[]> = {
  ADMIN: [
    'dashboard', 'classroom-scanner', 'my-classes', 'advisory-monitor',
    'students', 'facultys', 'users', 'gate-passes', 'schedules',
    'dtr', 'geofence', 'messages', 'push', 'reports', 'settings',
  ],
  PRINCIPAL: [
    'dashboard', 'classroom-scanner', 'my-classes', 'advisory-monitor',
    'students', 'facultys', 'gate-passes', 'schedules',
    'dtr', 'geofence', 'messages', 'push', 'reports', 'settings',
  ],
  DEPT_HEAD: [
    'dashboard', 'classroom-scanner', 'my-classes', 'advisory-monitor',
    'students', 'facultys', 'gate-passes', 'schedules', 'dtr', 'messages', 'reports',
  ],
  FACULTY: [
    'dashboard', 'classroom-scanner', 'my-classes', 'advisory-monitor',
    'students', 'dtr', 'gate-passes', 'messages', 'reports',
  ],
};

/** Preloads both the Vite code chunk and PostgreSQL JSON data when hovering a Sidebar item. */
let hoverPrefetchTimer: ReturnType<typeof setTimeout> | null = null;

const prefetchTabResources = (tab: NavItemKey): void => {
  if (hoverPrefetchTimer) clearTimeout(hoverPrefetchTimer);
  hoverPrefetchTimer = setTimeout(() => {
    const now = new Date();
    switch (tab) {
      case 'dashboard':
        void loadDashboard();
        prefetchApiGet(API_ROUTES.reports.dashboard);
        break;
      case 'classroom-scanner':
        void loadScanner();
        prefetchApiGet(API_ROUTES.attendance.classes, { summary: 1 });
        break;
      case 'my-classes':
        void loadMyClasses();
        prefetchApiGet(API_ROUTES.attendance.classes);
        break;
      case 'advisory-monitor':
        void loadAdvisory();
        prefetchApiGet(API_ROUTES.attendance.adviserMatrix);
        break;
      case 'students':
        void loadStudents();
        prefetchApiGet(API_ROUTES.students.metrics);
        prefetchApiGet(API_ROUTES.students.list, { page: 1, page_size: 25 });
        break;
      case 'facultys':
        void loadFaculty();
        prefetchApiGet(API_ROUTES.accounts.teachers, { page: 1, page_size: 25 });
        break;
      case 'users':
        void loadUsers();
        prefetchApiGet(API_ROUTES.accounts.users, { page_size: 'ALL' });
        break;
      case 'gate-passes':
        void loadGatePasses();
        prefetchApiGet(API_ROUTES.attendance.exitPasses);
        break;
      case 'schedules':
        void loadSchedules();
        prefetchApiGet(API_ROUTES.school.periods, { page_size: 500 });
        break;
      case 'dtr':
        void loadDtr();
        prefetchApiGet(API_ROUTES.reports.dtr, { month: now.getMonth() + 1, year: now.getFullYear() });
        break;
      case 'geofence':
        void loadGeofence();
        prefetchApiGet(API_ROUTES.campus.boundary);
        break;
      case 'messages':
        void loadParentChat();
        prefetchApiGet(API_ROUTES.messaging.threads);
        break;
      case 'push':
        void loadPush();
        prefetchApiGet(API_ROUTES.messaging.notifications, { page_size: 100 });
        break;
      case 'reports':
        void loadSf1();
        void loadSf2();
        void loadSf4();
        prefetchApiGet(API_ROUTES.school.sections);
        break;
      case 'settings':
        void loadSettings();
        prefetchApiGet(API_ROUTES.school.settings);
        break;
      default:
        break;
    }
  }, 120);
};

const SubtleSkeletonFallback: React.FC = () => {
  const { tokens } = useTheme();
  return (
    <div style={{ padding: 20, display: 'grid', gap: 12 }}>
      <div style={{ height: 48, borderRadius: 12, backgroundColor: tokens.bgSurface, opacity: 0.65 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ height: 84, borderRadius: 12, backgroundColor: tokens.bgSurface, opacity: 0.65 }} />
        ))}
      </div>
      <div style={{ height: 280, borderRadius: 14, backgroundColor: tokens.bgSurface, opacity: 0.65 }} />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { school, loading: isSchoolLoading } = useSchool();
  const { tokens, brand } = useTheme();

  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('attendsure_token') || localStorage.getItem('attendsure_access');
    if (!token) return null;
    const username = localStorage.getItem('attendsure_username') || '';
    return {
      user_id: Number(localStorage.getItem('attendsure_user_id') || 0),
      token,
      username,
      faculty_name: localStorage.getItem('attendsure_faculty_name') || username || 'Staff User',
      role: localStorage.getItem('attendsure_role') || 'FACULTY',
    };
  });

  const [userPhoto, setUserPhoto] = useState<string | null>(() => localStorage.getItem('attendsure_user_photo'));
  const [canTeach, setCanTeach] = useState<boolean>(() => localStorage.getItem('attendsure_can_teach') === 'true');
  const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [selectedReport, setSelectedReport] = useState<'sf1' | 'sf2' | 'sf4'>('sf1');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(true);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  const userRole = (session?.role || '').toUpperCase();

  const allowedTabs = useMemo<NavItemKey[]>(() => {
    if (!userRole) return [];
    const tabs = [...(BASE_ROLE_PERMISSIONS[userRole] || BASE_ROLE_PERMISSIONS.FACULTY)];
    if (canTeach) {
      (['my-classes', 'classroom-scanner', 'advisory-monitor', 'messages'] as NavItemKey[]).forEach((t) => {
        if (!tabs.includes(t)) tabs.push(t);
      });
    }
    return tabs;
  }, [userRole, canTeach]);

  const isAllowed = allowedTabs.includes(activeTab);

  // Warm up primary endpoints & code chunks right after sign-in without blocking UI paint
useEffect(() => {
    if (!session?.token || !userRole) return;
    warmupRoleEndpoints(userRole, canTeach);
    const chunkTimer = setTimeout(() => {
      void loadMyClasses();
      void loadScanner();
      void loadStudents();
      void loadDtr();
    }, 800);
    return () => clearTimeout(chunkTimer);
  }, [session?.token, userRole, canTeach]);

  const handleAuthExpired = useCallback(() => {
    localStorage.removeItem('attendsure_access');
    localStorage.removeItem('attendsure_refresh');
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

  useEffect(() => {
    window.addEventListener('attendsure:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('attendsure:auth-expired', handleAuthExpired);
  }, [handleAuthExpired]);

  const handleTabSelection = useCallback(
    (tab: NavItemKey) => {
      if (!allowedTabs.includes(tab)) return;
      startTransition(() => {
        setActiveTab(tab);
      });
    },
    [allowedTabs]
  );

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent<string | { tab: string; report?: string }>).detail;
      if (!detail) return;
      if (typeof detail === 'string') {
        handleTabSelection(detail as NavItemKey);
      } else if (detail.tab) {
        handleTabSelection(detail.tab as NavItemKey);
        if (detail.report && ['sf1', 'sf2', 'sf4'].includes(detail.report)) {
          startTransition(() => {
            setSelectedReport(detail.report as 'sf1' | 'sf2' | 'sf4');
          });
        }
      }
    };
    window.addEventListener('attendsure:navigate', onNavigate);
    return () => window.removeEventListener('attendsure:navigate', onNavigate);
  }, [handleTabSelection]);

  useEffect(() => {
    if (!session?.token) return;
    let active = true;
    apiClient
      .get(API_ROUTES.accounts.me)
      .then((res) => {
        if (!active || !res.data) return;
        setIsServerOnline(true);
        const d = res.data;
        const photo = d.photo_url || d.photo || null;
        const name = String(d.full_name || d.username || '').trim();
        const role = String(d.role || d.system_role || session.role || 'FACULTY').toUpperCase();
        const userId = Number(d.id || d.user_id || 0);
        const teachFlag = Boolean(d.can_teach || d.is_teaching || d.assigned_class_count > 0 || role === 'FACULTY');

        setUserPhoto(photo);
        if (photo) localStorage.setItem('attendsure_user_photo', photo);
        else localStorage.removeItem('attendsure_user_photo');

        if (name) localStorage.setItem('attendsure_faculty_name', name);
        localStorage.setItem('attendsure_role', role);
        if (userId) localStorage.setItem('attendsure_user_id', String(userId));
        setCanTeach(teachFlag);
        localStorage.setItem('attendsure_can_teach', String(teachFlag));

        if (d.is_profile_completed === false) setIsCompleteProfileModalOpen(true);

        setSession((prev) =>
          prev ? { ...prev, user_id: userId || prev.user_id, faculty_name: name || prev.faculty_name, role } : null
        );
      })
      .catch((err) => {
        if (!active) return;
        if (!err.response) setIsServerOnline(false);
        else if (err.response?.status === 401) handleAuthExpired();
      });

    return () => {
      active = false;
    };
  }, [session?.token, handleAuthExpired]);

  const retryConnection = useCallback(async () => {
    setIsCheckingServer(true);
    try {
      await apiClient.get(API_ROUTES.health.db, { params: { nocache: 1 } });
      setIsServerOnline(true);
    } catch {
      setIsServerOnline(false);
    } finally {
      setIsCheckingServer(false);
    }
  }, []);

  const pageTitle = useMemo((): string => {
    if (!isAllowed) return 'Access Restricted';
    const prefix = school.school_name ? `${school.school_name} • ` : '';
    switch (activeTab) {
      case 'dashboard': return `${prefix}Dashboard`;
      case 'classroom-scanner': return 'Classroom QR Attendance Scanner';
      case 'my-classes': return 'My Classes & Student Lists';
      case 'advisory-monitor': return 'Advisory Attendance & Cutting Matrix';
      case 'students': return 'Student Directory & QR Cards';
      case 'facultys': return 'Teachers & Staff Directory';
      case 'users': return 'User Accounts & Roles';
      case 'gate-passes': return 'Campus Exit Passes';
      case 'schedules': return 'Sections & Class Schedules';
      case 'dtr': return 'Monthly Time Records (CSC Form 48)';
      case 'geofence': return 'Campus GPS Boundary';
      case 'messages': return 'Parent & Teacher Direct Chat';
      case 'push': return 'Mobile Push Alerts';
      case 'reports':
        return selectedReport === 'sf1'
          ? 'DepEd School Form 1 (Register)'
          : selectedReport === 'sf2'
          ? 'DepEd School Form 2 (Daily Attendance)'
          : 'DepEd School Form 4 (Monthly Movement)';
      case 'settings': return 'School Settings & Audit Logs';
      default: return 'AttendSure Portal';
    }
  }, [activeTab, isAllowed, school.school_name, selectedReport]);

  const renderTab = () => {
    if (!isAllowed) {
      return (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <ShieldAlert size={36} color={brand.danger} style={{ margin: '0 auto 12px', display: 'block' }} />
          <h2 style={{ margin: '0 0 6px', color: tokens.textPrimary }}>Access Restricted</h2>
          <p style={{ color: tokens.textMuted, fontSize: '0.84rem' }}>Your role ({userRole}) cannot view this module.</p>
          <button
            type="button"
            onClick={() => handleTabSelection(allowedTabs[0] || 'dashboard')}
            style={{ marginTop: 14, padding: '8px 16px', backgroundColor: brand.buttonBg, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={14} /> Back to Dashboard
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
                startTransition(() => setSelectedReport(report as 'sf1' | 'sf2' | 'sf4'));
              }
            }}
          />
        );
      case 'classroom-scanner':
        return <div style={{ padding: 'clamp(12px, 2vw, 20px)' }}><ClassroomScanner /></div>;
      case 'my-classes': return <MyAssignedClassesTab />;
      case 'advisory-monitor':
        return <div style={{ padding: 'clamp(12px, 2vw, 20px)' }}><AdvisorySubjectMonitor /></div>;
      case 'students': return <StudentsTab />;
      case 'facultys': return <FacultyTab />;
      case 'users': return <UsersTab />;
      case 'gate-passes': return <GatePassesTab />;
      case 'schedules': return <SchedulesTab />;
      case 'dtr': return <DTRTab />;
      case 'geofence': return <GeofenceTab />;
      case 'messages': return <ParentChatTab />;
      case 'push': return <PushNotificationsTab />;
      case 'reports':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            {selectedReport === 'sf1' && <SF1ReportTab activeReportId={selectedReport} onSelectReport={(id) => startTransition(() => setSelectedReport(id as 'sf1' | 'sf2' | 'sf4'))} />}
            {selectedReport === 'sf2' && <SF2ReportTab activeReportId={selectedReport} onSelectReport={(id) => startTransition(() => setSelectedReport(id as 'sf1' | 'sf2' | 'sf4'))} />}
            {selectedReport === 'sf4' && <SF4ReportTab activeReportId={selectedReport} onSelectReport={(id) => startTransition(() => setSelectedReport(id as 'sf1' | 'sf2' | 'sf4'))} />}
          </div>
        );
      case 'settings': return <SettingsTab />;
      default: return <DashboardView isServerOnline={isServerOnline} onManualRefresh={retryConnection} />;
    }
  };

  const resolvedSchoolLogo = school.school_logo || school.left_logo || null;

  return (
    <>
      <SplashScreen loading={isSchoolLoading} minDurationMs={0} />

      {!session ? (
        <LoginView
          onLoginSuccess={(nextSession) => {
            setSession(nextSession);
            setActiveTab('dashboard');
          }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            height: '100vh',
            width: '100%',
            overflow: 'hidden',
            backgroundColor: tokens.bgApp,
            padding: 'clamp(6px, 1vw, 12px)',
            gap: 'clamp(6px, 1vw, 12px)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ height: '100%', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderStyle: 'solid', borderColor: tokens.borderSubtle, boxShadow: tokens.cardShadow, flexShrink: 0 }}>
            <Sidebar
              activeTab={activeTab}
              onSelectTab={handleTabSelection}
              onPrefetchTab={prefetchTabResources}
              session={session}
              userPhoto={userPhoto}
              isCollapsed={isSidebarCollapsed}
              onToggleCollapse={() => setIsSidebarCollapsed((p) => !p)}
              schoolName={school.school_name}
              schoolId={school.school_id}
              schoolLogo={resolvedSchoolLogo}
              canTeach={canTeach}
              allowedTabs={allowedTabs}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0, height: '100%', borderRadius: 16, backgroundColor: tokens.bgSurface, borderWidth: 1, borderStyle: 'solid', borderColor: tokens.borderSubtle, boxShadow: tokens.cardShadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Header
              title={pageTitle}
              isSystemOnline={isServerOnline}
              session={session}
              userPhoto={userPhoto}
              schoolName={school.school_name}
              schoolId={school.school_id}
              schoolLogo={resolvedSchoolLogo}
              onLogout={handleAuthExpired}
              onNavigateTab={handleTabSelection}
              onOpenProfile={() => setIsProfileModalOpen(true)}
            />

            <main style={{ flex: 1, minHeight: 0, overflowY: activeTab === 'dashboard' || activeTab === 'reports' ? 'hidden' : 'auto', overflowX: 'hidden', position: 'relative', backgroundColor: tokens.bgSurfaceSubtle }}>
              <ErrorBoundary featureName={pageTitle} resetKeys={[activeTab, selectedReport]}>
                <Suspense fallback={<SubtleSkeletonFallback />}>
                  {renderTab()}
                </Suspense>
              </ErrorBoundary>

              {!isServerOnline && (
                <div onClick={retryConnection} style={{ position: 'absolute', inset: 0, zIndex: 35, backgroundColor: 'rgba(15,23,42,0.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 9999, backgroundColor: '#0f172a', color: '#f8fafc', fontWeight: 700, fontSize: '0.82rem' }}>
                    <WifiOff size={16} color="#38bdf8" />
                    {isCheckingServer ? 'Reconnecting...' : 'Server offline. Click to reconnect.'}
                  </div>
                </div>
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
              const name = typeof updated.full_name === 'string' && updated.full_name.trim() ? updated.full_name.trim() : undefined;
              if (name) {
                localStorage.setItem('attendsure_faculty_name', name);
                setSession((prev) => (prev ? { ...prev, faculty_name: name } : null));
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
              const name = String(updatedUser.full_name || updatedUser.username || '').trim();
              const photo = (typeof updatedUser.photo_url === 'string' && updatedUser.photo_url) || (typeof updatedUser.photo === 'string' && updatedUser.photo) || null;
              if (name) {
                localStorage.setItem('attendsure_faculty_name', name);
                setSession((prev) => (prev ? { ...prev, faculty_name: name } : null));
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
  <ThemeProvider>
    <SchoolProvider>
      <AlertProvider>
        <AppContent />
      </AlertProvider>
    </SchoolProvider>
  </ThemeProvider>
);

export default App;