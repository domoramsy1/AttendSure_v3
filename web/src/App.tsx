/**
 * AttendSure - Application Shell (Lazy-Loaded Tabs, Hover Prefetch & Role Guard)
 * File: web/src/App.tsx
 */

import React, { Suspense, lazy, startTransition, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import apiClient, { clearApiClientCache, prefetchApiGet, warmupRoleEndpoints } from './api/client';
import { API_ROUTES } from './api/routes';
import { AuthPage as LoginView } from './components/auth/AuthPage';
import { StartupShowcasePage } from './components/showcase/StartupShowcasePage';
import { SplashScreen } from './components/splash/SplashScreen';
import { Sidebar, type NavItemKey } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import Footer from './components/layout/Footer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ProfileModal, type ProfileUpdatePayload } from './components/modals/ProfileModal';
import { CompleteProfileModal, type CompletedProfileUser } from './components/modals/CompleteProfileModal';
import { ScheduleAlarmModal } from './components/modals/ScheduleAlarmModal';
import {
  buildTestWebAlarm,
  evaluateDueWebAlarm,
  getLocalDateStamp,
  getWebAlarmsEnabled,
  markAlarmDismissed,
  sendBrowserDesktopAlert,
  setWebAlarmsEnabled,
  startWebAlarmLoop,
  stopWebAlarmLoop,
  unlockWebAlarmAudio,
  type ActiveAlarmEvent,
  type AlarmClassSlot,
  type AlarmKind,
  type AlarmScheduleSnapshot,
} from './utils/scheduleAlarms';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { AlertProvider } from './context/AlertContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ComplianceProvider } from './context/ComplianceContext';
import { isSafeImageUrl } from './theme/tokens';
import {
  canViewSf4 as checkCanViewSf4,
  canViewTab,
  getAllowedTabs,
  getCurrentUserFromStorage,
  type PermissionUser,
} from './utils/permissions';
import type { UserSession } from './types/section';
import { WifiOff } from 'lucide-react';

const loadDashboard = () => import('./components/dashboard/DashboardView');
const loadImpact = () => import('./components/dashboard/EnterpriseSDGWidget');
const loadScanner = () => import('./components/scanner/ClassroomScanner');
const loadMyClasses = () => import('./components/tabs/MyAssignedClassesTab');
const loadAdvisory = () => import('./components/advisory/AdvisorySubjectMonitor');
const loadStudents = () => import('./components/tabs/StudentsTab');
const loadTeachers = () => import('./components/tabs/TeachersTab');
const loadUsers = () => import('./components/tabs/UsersTab');
const loadGatePasses = () => import('./components/tabs/GatePassesTab');
const loadSchedules = () => import('./components/tabs/SchedulesTab');
const loadDtr = () => import('./components/tabs/DTRTab');
const loadGeofence = () => import('./components/tabs/GeofenceTab');
const loadSettings = () => import('./components/tabs/SettingsTab');
const loadSf1 = () => import('./components/tabs/SF1ReportTab');
const loadSf2 = () => import('./components/tabs/SF2ReportTab');
const loadSf4 = () => import('./components/tabs/SF4ReportTab');

const DashboardView = lazy(loadDashboard);
const EnterpriseSDGWidget = lazy(loadImpact);
const ClassroomScanner = lazy(loadScanner);
const MyAssignedClassesTab = lazy(loadMyClasses);
const AdvisorySubjectMonitor = lazy(loadAdvisory);
const StudentsTab = lazy(loadStudents);
const TeachersTab = lazy(loadTeachers);
const UsersTab = lazy(loadUsers);
const GatePassesTab = lazy(loadGatePasses);
const SchedulesTab = lazy(loadSchedules);
const DTRTab = lazy(loadDtr);
const GeofenceTab = lazy(loadGeofence);
const SettingsTab = lazy(loadSettings);
const SF1ReportTab = lazy(loadSf1);
const SF2ReportTab = lazy(loadSf2);
const SF4ReportTab = lazy(loadSf4);

export const BASE_ROLE_PERMISSIONS: Record<string, NavItemKey[]> = {
  ADMIN: getAllowedTabs({ role: 'ADMIN', can_handle_classes: true }),
  PRINCIPAL: getAllowedTabs({ role: 'PRINCIPAL', can_handle_classes: true }),
  DEPT_HEAD: getAllowedTabs({ role: 'DEPT_HEAD', can_handle_classes: true }),
  TEACHER: getAllowedTabs({ role: 'TEACHER', can_handle_classes: true }),
};

let hoverPrefetchTimer: ReturnType<typeof setTimeout> | null = null;

const prefetchTabResources = (tab: NavItemKey): void => {
  if (hoverPrefetchTimer) clearTimeout(hoverPrefetchTimer);
  hoverPrefetchTimer = setTimeout(() => {
    const currentUser = getCurrentUserFromStorage();
    if (!canViewTab(currentUser, tab)) return;
    const now = new Date();
    const allowSf4 = checkCanViewSf4(currentUser);

    switch (tab) {
      case 'dashboard':
        void loadDashboard();
        prefetchApiGet(API_ROUTES.reports.dashboard);
        break;
      case 'impact':
        void loadImpact();
        prefetchApiGet(API_ROUTES.reports.sdgImpact);
        prefetchApiGet(API_ROUTES.reports.dropoutRisk);
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
      case 'teachers':
        void loadTeachers();
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
        prefetchApiGet(API_ROUTES.campus.overview);
        prefetchApiGet(API_ROUTES.campus.loafing);
        break;
      case 'reports':
        void loadSf1();
        void loadSf2();
        if (allowSf4) {
          void loadSf4();
        }
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
  const { school, loading: isSchoolLoading, refreshSchool } = useSchool();
  const { tokens, brand } = useTheme();
  const [showStaffLogin, setShowStaffLogin] = useState<boolean>(false);

  const [session, setSession] = useState<UserSession | null>(() => {
    const token = localStorage.getItem('attendsure_token') || localStorage.getItem('attendsure_access');
    if (!token) return null;
    const username = localStorage.getItem('attendsure_username') || '';
    return {
      user_id: Number(localStorage.getItem('attendsure_user_id') || 0),
      token,
      username,
      teacher_name: localStorage.getItem('attendsure_teacher_name') || username || 'Teacher',
      role: localStorage.getItem('attendsure_role') || 'TEACHER',
    };
  });

  const [userPhoto, setUserPhoto] = useState<string | null>(() => {
    const saved = localStorage.getItem('attendsure_user_photo');
    return isSafeImageUrl(saved) ? saved : null;
  });
  const [canTeach, setCanTeach] = useState<boolean>(() => {
    const raw = localStorage.getItem('attendsure_can_teach');
    return raw === null ? true : raw === 'true';
  });
  const [isSuperuser, setIsSuperuser] = useState<boolean>(
    () => localStorage.getItem('attendsure_is_superuser') === 'true'
  );
  const [isCompleteProfileModalOpen, setIsCompleteProfileModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<NavItemKey>('dashboard');
  const [selectedReport, setSelectedReport] = useState<'sf1' | 'sf2' | 'sf4'>('sf1');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isServerOnline, setIsServerOnline] = useState(true);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  const [alarmsEnabled, setAlarmsEnabled] = useState<boolean>(() => getWebAlarmsEnabled());
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarmEvent | null>(null);
  const activeAlarmRef = useRef<ActiveAlarmEvent | null>(null);
  activeAlarmRef.current = activeAlarm;
  const alarmSnapshotRef = useRef<AlarmScheduleSnapshot>({
    dutyStartTime: '',
    dutyEndTime: '',
    isTimedInToday: false,
    classes: [],
  });
  const alarmSnoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userRole = (session?.role || '').toUpperCase();
  const permissionUser = useMemo<PermissionUser>(
    () => ({
      role: userRole,
      can_handle_classes: canTeach,
      can_teach: canTeach,
      is_superuser: isSuperuser,
    }),
    [userRole, canTeach, isSuperuser]
  );

  const canViewSf4 = checkCanViewSf4(permissionUser);
  const effectiveReport: 'sf1' | 'sf2' | 'sf4' =
    !canViewSf4 && selectedReport === 'sf4' ? 'sf1' : selectedReport;

  useEffect(() => {
    if (!canViewSf4 && selectedReport === 'sf4') {
      setSelectedReport('sf1');
    }
  }, [canViewSf4, selectedReport]);

  const allowedTabs = useMemo<NavItemKey[]>(() => {
    if (!userRole) return [];
    return getAllowedTabs(permissionUser);
  }, [userRole, permissionUser]);

  const isAllowed = canViewTab(permissionUser, activeTab);

  // Instant route guard: redirect immediately to Dashboard if activeTab becomes unauthorized
  useEffect(() => {
    if (session && activeTab !== 'dashboard' && !canViewTab(permissionUser, activeTab)) {
      setActiveTab('dashboard');
    }
  }, [session, activeTab, permissionUser]);

  useEffect(() => {
    if (!session?.token || !userRole) return;
    warmupRoleEndpoints(userRole, canTeach);
    const chunkTimer = setTimeout(() => {
      if (canViewTab(permissionUser, 'my-classes')) void loadMyClasses();
      if (canViewTab(permissionUser, 'classroom-scanner')) void loadScanner();
      if (canViewTab(permissionUser, 'students')) void loadStudents();
      if (canViewTab(permissionUser, 'dtr')) void loadDtr();
    }, 800);
    return () => clearTimeout(chunkTimer);
  }, [session?.token, userRole, canTeach, permissionUser]);

  useEffect(() => {
    return () => {
      if (hoverPrefetchTimer) {
        clearTimeout(hoverPrefetchTimer);
        hoverPrefetchTimer = null;
      }
    };
  }, []);

  const handleAuthExpired = useCallback(() => {
    if (hoverPrefetchTimer) {
      clearTimeout(hoverPrefetchTimer);
      hoverPrefetchTimer = null;
    }
    const keys = [
      'attendsure_access',
      'attendsure_refresh',
      'attendsure_token',
      'auth_token',
      'token',
      'attendsure_username',
      'attendsure_teacher_name',
      'attendsure_role',
      'attendsure_user_id',
      'attendsure_teacher_id',
      'attendsure_is_superuser',
      'attendsure_user_photo',
      'attendsure_can_teach',
    ];
    keys.forEach((k) => localStorage.removeItem(k));
    clearApiClientCache();
    stopWebAlarmLoop();
    if (alarmSnoozeTimerRef.current) {
      clearTimeout(alarmSnoozeTimerRef.current);
      alarmSnoozeTimerRef.current = null;
    }
    setActiveAlarm(null);
    setSession(null);
    setUserPhoto(null);
    setCanTeach(true);
    setIsSuperuser(false);
    setSelectedReport('sf1');
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

  const handleSafeReportSelection = useCallback(
    (reportId: string) => {
      if (!['sf1', 'sf2', 'sf4'].includes(reportId)) return;
      const safeTarget = reportId === 'sf4' && !canViewSf4 ? 'sf1' : (reportId as 'sf1' | 'sf2' | 'sf4');
      startTransition(() => {
        setSelectedReport(safeTarget);
      });
    },
    [canViewSf4]
  );

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent<string | { tab: string; report?: string }>).detail;
      if (!detail) return;
      if (typeof detail === 'string') {
        handleTabSelection(detail as NavItemKey);
      } else if (detail.tab) {
        handleTabSelection(detail.tab as NavItemKey);
        if (detail.report) {
          handleSafeReportSelection(detail.report);
        }
      }
    };
    window.addEventListener('attendsure:navigate', onNavigate);
    return () => window.removeEventListener('attendsure:navigate', onNavigate);
  }, [handleTabSelection, handleSafeReportSelection]);

  useEffect(() => {
    if (!session?.token) return;
    let active = true;
    const controller = new AbortController();
    void refreshSchool();
    apiClient
      .get(API_ROUTES.accounts.me, { params: { nocache: 1 }, signal: controller.signal })
      .then((res) => {
        if (!active || controller.signal.aborted || !res.data) return;
        setIsServerOnline(true);
        const d = res.data;
        const rawPhoto = d.photo_url || d.photo || null;
        const photo = isSafeImageUrl(rawPhoto) ? rawPhoto : null;
        const name = String(d.full_name || d.teacher_name || d.username || '').trim();
        const role = String(d.role || d.system_role || session.role || 'TEACHER').toUpperCase();
        const userId = Number(d.id || d.user_id || 0);
        const teacherId = d.teacher_id ? Number(d.teacher_id) : null;
        const superFlag = Boolean(d.is_superuser);
        const teachFlag =
          d.can_handle_classes !== undefined && d.can_handle_classes !== null
            ? Boolean(d.can_handle_classes)
            : d.can_teach !== undefined && d.can_teach !== null
              ? Boolean(d.can_teach)
              : role === 'TEACHER';

        setUserPhoto(photo);
        if (photo) localStorage.setItem('attendsure_user_photo', photo);
        else localStorage.removeItem('attendsure_user_photo');

        if (name) localStorage.setItem('attendsure_teacher_name', name);
        localStorage.setItem('attendsure_role', role);
        if (userId) localStorage.setItem('attendsure_user_id', String(userId));
        if (teacherId) localStorage.setItem('attendsure_teacher_id', String(teacherId));
        else localStorage.removeItem('attendsure_teacher_id');
        setIsSuperuser(superFlag);
        localStorage.setItem('attendsure_is_superuser', String(superFlag));
        setCanTeach(teachFlag);
        localStorage.setItem('attendsure_can_teach', String(teachFlag));

        const nextPermUser: PermissionUser = {
          role,
          can_handle_classes: teachFlag,
          can_teach: teachFlag,
          is_superuser: superFlag,
        };
        if (!checkCanViewSf4(nextPermUser)) {
          setSelectedReport((prev) => (prev === 'sf4' ? 'sf1' : prev));
        }

        if (d.is_profile_completed === false) setIsCompleteProfileModalOpen(true);

        setSession((prev) =>
          prev ? { ...prev, user_id: userId || prev.user_id, teacher_name: name || prev.teacher_name, role } : null
        );
      })
      .catch((err) => {
        if (!active || controller.signal.aborted) return;
        const anyErr = err as { name?: string; code?: string; response?: { status?: number } };
        if (anyErr?.name === 'CanceledError' || anyErr?.name === 'AbortError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!anyErr?.response) setIsServerOnline(false);
        else if (anyErr.response?.status === 401) handleAuthExpired();
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [session?.token, handleAuthExpired, refreshSchool]);

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

  // Unlock Web Audio API on first user click or keypress so scheduled alarms ring reliably
  useEffect(() => {
    const unlock = () => unlockWebAlarmAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const triggerWebAlarm = useCallback((ev: ActiveAlarmEvent) => {
    setActiveAlarm(ev);
    startWebAlarmLoop(ev.kind);
    sendBrowserDesktopAlert(ev.title, `${ev.timeLabel} — ${ev.detail}`);
  }, []);

  const handleDismissAlarm = useCallback(() => {
    stopWebAlarmLoop();
    if (alarmSnoozeTimerRef.current) {
      clearTimeout(alarmSnoozeTimerRef.current);
      alarmSnoozeTimerRef.current = null;
    }
    const current = activeAlarmRef.current;
    if (current && !current.id.startsWith('TEST_')) {
      markAlarmDismissed(getLocalDateStamp(), current.id);
    }
    setActiveAlarm(null);
  }, []);

  const handleSnoozeAlarm = useCallback(() => {
    stopWebAlarmLoop();
    const current = activeAlarmRef.current;
    setActiveAlarm(null);
    if (!current) return;
    if (alarmSnoozeTimerRef.current) {
      clearTimeout(alarmSnoozeTimerRef.current);
    }
    alarmSnoozeTimerRef.current = setTimeout(() => {
      alarmSnoozeTimerRef.current = null;
      if (getWebAlarmsEnabled()) {
        triggerWebAlarm({ ...current, subtitle: `${current.subtitle} (Snoozed)` });
      }
    }, 5 * 60 * 1000);
  }, [triggerWebAlarm]);

  const handleToggleAlarms = useCallback((next: boolean) => {
    setAlarmsEnabled(next);
    setWebAlarmsEnabled(next);
    if (!next) {
      stopWebAlarmLoop();
      if (alarmSnoozeTimerRef.current) {
        clearTimeout(alarmSnoozeTimerRef.current);
        alarmSnoozeTimerRef.current = null;
      }
      setActiveAlarm(null);
    } else {
      unlockWebAlarmAudio();
    }
  }, []);

  const handleTestAlarm = useCallback(
    (kind: AlarmKind) => {
      unlockWebAlarmAudio();
      triggerWebAlarm(buildTestWebAlarm(kind));
    },
    [triggerWebAlarm]
  );

  // Sync teacher duty schedule + today's class periods and ring alarm when due
  useEffect(() => {
    if (!session?.token || !alarmsEnabled) {
      stopWebAlarmLoop();
      return;
    }
    let active = true;
    const controller = new AbortController();

    const refreshAlarmSchedule = async () => {
      try {
        const [campusRes, classesRes] = await Promise.allSettled([
          apiClient.get<{
            duty_start_time?: string;
            duty_end_time?: string;
            teacher_list?: Array<{
              teacher_id?: number;
              user_id?: number;
              is_clocked_in?: boolean;
              time_in?: string | null;
              time_out?: string | null;
            }>;
          }>(API_ROUTES.campus.overview, { signal: controller.signal }),
          canViewTab(permissionUser, 'classroom-scanner')
            ? apiClient.get<AlarmClassSlot[] | { results?: AlarmClassSlot[] }>(
                API_ROUTES.attendance.classes,
                { params: { summary: 1 }, signal: controller.signal }
              )
            : Promise.resolve({ data: [] as AlarmClassSlot[] }),
        ]);

        if (!active || controller.signal.aborted) return;

        let dutyStartTime = '';
        let dutyEndTime = '';
        let isTimedInToday = false;

        if (campusRes.status === 'fulfilled' && campusRes.value?.data) {
          const campus = campusRes.value.data;
          const savedTeacherId = Number(localStorage.getItem('attendsure_teacher_id') || 0);
          const currentUserId = Number(session.user_id || 0);
          const ownTeacher = Array.isArray(campus.teacher_list)
            ? campus.teacher_list.find(
                (t) =>
                  (savedTeacherId > 0 && Number(t.teacher_id) === savedTeacherId) ||
                  (currentUserId > 0 && Number(t.user_id) === currentUserId)
              )
            : undefined;

          if (ownTeacher || userRole === 'TEACHER') {
            dutyStartTime = String(campus.duty_start_time || '');
            dutyEndTime = String(campus.duty_end_time || '');
            isTimedInToday = Boolean(
              ownTeacher?.is_clocked_in || (ownTeacher?.time_in && !ownTeacher?.time_out)
            );
          }
        }

        let classes: AlarmClassSlot[] = [];
        if (classesRes.status === 'fulfilled' && classesRes.value?.data) {
          const raw = classesRes.value.data;
          classes = Array.isArray(raw) ? raw : Array.isArray(raw.results) ? raw.results : [];
        }

        alarmSnapshotRef.current = {
          dutyStartTime,
          dutyEndTime,
          isTimedInToday,
          classes,
        };
      } catch {
        // Ignore transient network errors during background alarm refresh
      }
    };

    const checkAlarmTick = () => {
      if (!active || activeAlarmRef.current || !getWebAlarmsEnabled()) return;
      const due = evaluateDueWebAlarm(alarmSnapshotRef.current, new Date());
      if (due) {
        triggerWebAlarm(due);
      }
    };

    void refreshAlarmSchedule().then(() => checkAlarmTick());
    const syncHandle = setInterval(() => void refreshAlarmSchedule(), 5 * 60 * 1000);
    const tickHandle = setInterval(checkAlarmTick, 15 * 1000);

    return () => {
      active = false;
      controller.abort();
      clearInterval(syncHandle);
      clearInterval(tickHandle);
      stopWebAlarmLoop();
      if (alarmSnoozeTimerRef.current) {
        clearTimeout(alarmSnoozeTimerRef.current);
        alarmSnoozeTimerRef.current = null;
      }
    };
  }, [session?.token, session?.user_id, alarmsEnabled, permissionUser, userRole, triggerWebAlarm]);

  const pageTitle = useMemo((): string => {
    const safeTab = isAllowed ? activeTab : 'dashboard';
    const prefix = school.school_name ? `${school.school_name} • ` : '';
    switch (safeTab) {
      case 'dashboard':
        return `${prefix}Dashboard`;
      case 'impact':
        return 'SARDO Early-Warning & Campus Safety';
      case 'classroom-scanner':
        return 'QR Scanner';
      case 'my-classes':
        return 'My Classes & Class Lists';
      case 'advisory-monitor':
        return 'Advisory Attendance & Cutting Matrix';
      case 'students':
        return 'Students';
      case 'teachers':
        return 'Teachers Directory';
      case 'users':
        return 'User Accounts & Roles';
      case 'gate-passes':
        return 'Exit & Travel Passes';
      case 'schedules':
        return 'Academic Setup & Class Schedules';
      case 'dtr':
        return userRole === 'TEACHER'
          ? 'My Daily Time Record (CSC Form 48)'
          : 'Monthly Time Records (CSC Form 48)';
      case 'geofence':
        return 'Geofence & Loafing Monitor';
      case 'reports':
        return effectiveReport === 'sf1'
          ? 'DepEd School Form 1 (School Register)'
          : effectiveReport === 'sf2'
            ? 'DepEd School Form 2 (Daily Attendance)'
            : 'DepEd School Form 4 (Monthly Movement)';
      case 'settings':
        return 'System Settings & Audit Logs';
      default:
        return 'AttendSure Portal';
    }
  }, [activeTab, isAllowed, school.school_name, effectiveReport, userRole]);

  const renderTab = () => {
    if (!isAllowed) {
      return null;
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
              if (report) {
                handleSafeReportSelection(report);
              }
            }}
          />
        );
      case 'impact':
        return (
          <div style={{ padding: 'clamp(12px, 2vw, 20px)', maxWidth: 1380, margin: '0 auto' }}>
            <EnterpriseSDGWidget />
          </div>
        );
      case 'classroom-scanner':
        return (
          <div style={{ padding: 'clamp(12px, 2vw, 20px)' }}>
            <ClassroomScanner />
          </div>
        );
      case 'my-classes':
        return <MyAssignedClassesTab />;
      case 'advisory-monitor':
        return (
          <div style={{ padding: 'clamp(12px, 2vw, 20px)' }}>
            <AdvisorySubjectMonitor />
          </div>
        );
      case 'students':
        return <StudentsTab />;
      case 'teachers':
        return <TeachersTab />;
      case 'users':
        return <UsersTab />;
      case 'gate-passes':
        return <GatePassesTab />;
      case 'schedules':
        return <SchedulesTab />;
      case 'dtr':
        return <DTRTab />;
      case 'geofence':
        return <GeofenceTab />;
      case 'reports':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            {effectiveReport === 'sf1' && (
              <SF1ReportTab activeReportId="sf1" onSelectReport={handleSafeReportSelection} />
            )}
            {effectiveReport === 'sf2' && (
              <SF2ReportTab activeReportId="sf2" onSelectReport={handleSafeReportSelection} />
            )}
            {effectiveReport === 'sf4' && canViewSf4 && (
              <SF4ReportTab activeReportId="sf4" onSelectReport={handleSafeReportSelection} />
            )}
          </div>
        );
      case 'settings':
        return <SettingsTab />;
      default:
        return <DashboardView isServerOnline={isServerOnline} onManualRefresh={retryConnection} />;
    }
  };

  const resolvedSchoolLogo = school.school_logo || school.left_logo || null;

  return (
    <>
      <SplashScreen loading={isSchoolLoading} minDurationMs={0} />

      {!session ? (
        showStaffLogin ? (
          <LoginView
            onBackToShowcase={() => setShowStaffLogin(false)}
            onLoginSuccess={(nextSession) => {
              clearApiClientCache();
              const nextTeach = localStorage.getItem('attendsure_can_teach') !== 'false';
              const nextSuper = localStorage.getItem('attendsure_is_superuser') === 'true';
              const savedPhoto = localStorage.getItem('attendsure_user_photo');
              setCanTeach(nextTeach);
              setIsSuperuser(nextSuper);
              setUserPhoto(isSafeImageUrl(savedPhoto) ? savedPhoto : null);
              setSession(nextSession);
              setActiveTab('dashboard');
              setSelectedReport('sf1');
            }}
          />
        ) : (
          <StartupShowcasePage
            onOpenSignIn={() => setShowStaffLogin(true)}
            onDemoLoginSuccess={(nextSession, targetTab = 'dashboard') => {
              clearApiClientCache();
              const nextTeach = localStorage.getItem('attendsure_can_teach') !== 'false';
              const nextSuper = localStorage.getItem('attendsure_is_superuser') === 'true';
              const savedPhoto = localStorage.getItem('attendsure_user_photo');
              const nextUser: PermissionUser = {
                role: nextSession.role,
                can_handle_classes: nextTeach,
                can_teach: nextTeach,
                is_superuser: nextSuper,
              };
              setCanTeach(nextTeach);
              setIsSuperuser(nextSuper);
              setUserPhoto(isSafeImageUrl(savedPhoto) ? savedPhoto : null);
              setSession(nextSession);
              setActiveTab(canViewTab(nextUser, targetTab) ? targetTab : 'dashboard');
              setSelectedReport('sf1');
            }}
          />
        )
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
          <div
            style={{
              height: '100%',
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: tokens.borderSubtle,
              boxShadow: tokens.cardShadow,
              flexShrink: 0,
            }}
          >
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

          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              borderRadius: 16,
              backgroundColor: tokens.bgSurface,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: tokens.borderSubtle,
              boxShadow: tokens.cardShadow,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Header
              title={pageTitle}
              isSystemOnline={isServerOnline}
              session={session}
              userPhoto={userPhoto}
              schoolName={school.school_name}
              schoolId={school.school_id}
              schoolLogo={resolvedSchoolLogo}
              alarmsEnabled={alarmsEnabled}
              onToggleAlarms={handleToggleAlarms}
              onTestAlarm={handleTestAlarm}
              onLogout={handleAuthExpired}
              onNavigateTab={handleTabSelection}
              onOpenProfile={() => setIsProfileModalOpen(true)}
            />

            <main
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: activeTab === 'dashboard' || activeTab === 'reports' ? 'hidden' : 'auto',
                overflowX: 'hidden',
                position: 'relative',
                backgroundColor: tokens.bgSurfaceSubtle,
              }}
            >
              <ErrorBoundary featureName={pageTitle} resetKeys={[activeTab, effectiveReport]}>
                <Suspense fallback={<SubtleSkeletonFallback />}>{renderTab()}</Suspense>
              </ErrorBoundary>

              {!isServerOnline && (
                <div
                  onClick={retryConnection}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 35,
                    backgroundColor: 'rgba(15,23,42,0.68)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 20px',
                      borderRadius: 9999,
                      backgroundColor: tokens.darkSurface,
                      color: tokens.darkText,
                      fontWeight: 700,
                      fontSize: '0.82rem',
                    }}
                  >
                    <WifiOff size={16} color={brand.secondary} />
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
              const name =
                typeof updated.full_name === 'string' && updated.full_name.trim()
                  ? updated.full_name.trim()
                  : undefined;
              if (name) {
                localStorage.setItem('attendsure_teacher_name', name);
                setSession((prev) => (prev ? { ...prev, teacher_name: name } : null));
              }
              if (updated.photo !== undefined || updated.photo_url !== undefined) {
                const candidate = (updated.photo_url as string | null) ?? updated.photo ?? null;
                const nextPhoto = isSafeImageUrl(candidate) ? candidate : null;
                setUserPhoto(nextPhoto);
                if (nextPhoto) localStorage.setItem('attendsure_user_photo', nextPhoto);
                else localStorage.removeItem('attendsure_user_photo');
              }
            }}
          />

          <CompleteProfileModal
            isOpen={isCompleteProfileModalOpen}
            onCompleted={(updatedUser: CompletedProfileUser) => {
              setIsCompleteProfileModalOpen(false);
              const name = String(updatedUser.full_name || updatedUser.username || '').trim();
              const rawPhoto =
                (typeof updatedUser.photo_url === 'string' && updatedUser.photo_url) ||
                (typeof updatedUser.photo === 'string' && updatedUser.photo) ||
                null;
              const photo = isSafeImageUrl(rawPhoto) ? rawPhoto : null;
              if (name) {
                localStorage.setItem('attendsure_teacher_name', name);
                setSession((prev) => (prev ? { ...prev, teacher_name: name } : null));
              }
              if (photo) {
                setUserPhoto(photo);
                localStorage.setItem('attendsure_user_photo', photo);
              }
            }}
          />
          <ScheduleAlarmModal
            alarm={activeAlarm}
            onDismiss={handleDismissAlarm}
            onSnooze={handleSnoozeAlarm}
            onNavigateTab={handleTabSelection}
          />
        </div>
      )}
    </>
  );
};

export const App: React.FC = () => (
  <ThemeProvider>
    <ComplianceProvider>
      <SchoolProvider>
        <AlertProvider>
          <AppContent />
        </AlertProvider>
      </SchoolProvider>
    </ComplianceProvider>
  </ThemeProvider>
);

export default App;
