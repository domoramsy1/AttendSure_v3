// AttendSure Web - Settings Tab
// File: D:\AttendSure_V3\web\src\components\tabs\SettingsTab.tsx

/**
 * AttendSure - School Settings & Self-Service Maintenance Center
 * File: web/src/components/tabs/SettingsTab.tsx
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { isSafeImageUrl } from '../../theme/tokens';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { exportToCsv } from '../common/Pagination';
import { canManageSchoolSetup, canViewAuditLogs, getCurrentUserFromStorage } from '../../utils/permissions';
import { formatTime12h } from '../../utils/timeFormat';
import { Building2, History, Layers, Loader2, Wrench } from 'lucide-react';
import { MaintenancePanel } from './settings/MaintenancePanel';
import {
  AuditLogsPanel,
  formatAuditTimestamp,
  getAuditActionLabel,
  getAuditActorName,
  getAuditDetailsText,
  getAuditIpAddress,
  getAuditModuleLabel,
  getAuditStatusDisplay,
} from './settings/AuditLogsPanel';
import { SchoolProfileForm } from './settings/SchoolProfileForm';
import {
  sanitizeSettingsInput,
  type ActivityRecord,
  type FreshLogosState,
  type MaintenanceHealthStatus,
  type SchoolSettingsFormData,
  type TeacherOption,
} from './settings/types';

const INITIAL_FORM_DATA: SchoolSettingsFormData = {
  school_id: '',
  school_name: '',
  region: '',
  division: '',
  district: '',
  academic_year: '',
  address: '',
  contact_number: '',
  email: '',
  website: '',
  principal_teacher: '',
  principal_name: '',
  principal_title: '',
  principal_photo_url: null,
  principal_employee_id: '',
  principal_department: '',
  principal_contact_number: '',
  principal_email: '',
  superintendent_name: '',
  school_logo: null,
  left_logo: null,
  right_logo: null,
  latitude: '',
  longitude: '',
  geofence_radius_meters: 150,
};

export const SettingsTab: React.FC = () => {
  const { updateSchoolInstantly, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand } = useTheme();
  const currentUser = getCurrentUserFromStorage();
  const canEditSettings = canManageSchoolSetup(currentUser);
  const canViewLogs = canViewAuditLogs(currentUser);

  const initAbortRef = useRef<AbortController | null>(null);
  const diagAbortRef = useRef<AbortController | null>(null);
  const logsAbortRef = useRef<AbortController | null>(null);
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'MAINTENANCE' | 'SETTINGS' | 'LOGS' | 'ALL'>(
    canEditSettings ? 'MAINTENANCE' : 'LOGS'
  );

  const cachedSchool = peekApiCache<any>(API_ROUTES.school.settings);
  const [teacherList, setTeacherList] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(!cachedSchool);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activityLogs, setActivityLogs] = useState<ActivityRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');
  const [logDateFilter, setLogDateFilter] = useState<string>('');
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  const [health, setHealth] = useState<MaintenanceHealthStatus>({
    database: 'ONLINE',
    dbLatencyMs: 0,
    teachersOnline: 0,
    teachersTotal: 0,
    openLoafingIncidents: 0,
    activeExitPasses: 0,
    lastChecked: '',
  });

  const [formData, setFormData] = useState<SchoolSettingsFormData>(INITIAL_FORM_DATA);
  const [freshLogos, setFreshLogos] = useState<FreshLogosState>({
    school_logo: false,
    left_logo: false,
    right_logo: false,
  });

  useEffect(() => {
    return () => {
      initAbortRef.current?.abort();
      diagAbortRef.current?.abort();
      logsAbortRef.current?.abort();
      if (saveSuccessTimerRef.current) {
        clearTimeout(saveSuccessTimerRef.current);
        saveSuccessTimerRef.current = null;
      }
    };
  }, []);

  const applySchoolPayload = useCallback((s: any) => {
    if (!s || typeof s !== 'object') return;
    setFormData({
      school_id: s.school_id || '',
      school_name: s.school_name || '',
      region: s.region || '',
      division: s.division || '',
      district: s.district || '',
      academic_year: s.academic_year || s.school_year || '',
      address: s.address || s.street_address || '',
      contact_number: s.contact_number || s.telephone || '',
      email: s.email || '',
      website: s.website || '',
      principal_teacher: s.principal_teacher ?? '',
      principal_name: s.principal_name || '',
      principal_title: s.principal_title || '',
      principal_photo_url: isSafeImageUrl(s.principal_photo_url) ? s.principal_photo_url : null,
      principal_employee_id: s.principal_employee_id || '',
      principal_department: s.principal_department || '',
      principal_contact_number: s.principal_contact_number || '',
      principal_email: s.principal_email || '',
      superintendent_name: s.superintendent_name || '',
      school_logo: isSafeImageUrl(s.school_logo) ? s.school_logo : null,
      left_logo: isSafeImageUrl(s.left_logo) ? s.left_logo : null,
      right_logo: isSafeImageUrl(s.right_logo) ? s.right_logo : null,
      latitude: s.latitude !== undefined && s.latitude !== null && s.latitude !== '' ? String(s.latitude) : '',
      longitude: s.longitude !== undefined && s.longitude !== null && s.longitude !== '' ? String(s.longitude) : '',
      geofence_radius_meters: s.geofence_radius_meters ? Number(s.geofence_radius_meters) : 150,
    });
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    diagAbortRef.current?.abort();
    const controller = new AbortController();
    diagAbortRef.current = controller;

    const [dbRes, sysRes] = await Promise.allSettled([
      apiClient.get(API_ROUTES.health.db, { params: { nocache: 1 }, signal: controller.signal }),
      apiClient.get(API_ROUTES.reports.systemStatus, { params: { nocache: 1 }, signal: controller.signal }),
    ]);

    if (controller.signal.aborted) return;

    const dbData = dbRes.status === 'fulfilled' ? dbRes.value.data : null;
    const sysData = sysRes.status === 'fulfilled' ? sysRes.value.data : null;

    setHealth({
      database: dbData?.database === 'CONNECTED' || dbData?.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
      dbLatencyMs: Number(dbData?.latency_ms) || 0,
      teachersOnline:
        Number(
          sysData?.online_teachers_today ??
            sysData?.online_teachers ??
            sysData?.teachers_timed_in ??
            sysData?.online_count ??
            sysData?.teachers_on_duty
        ) || 0,
      teachersTotal:
        Number(
          sysData?.active_teachers ??
            sysData?.total_teachers ??
            sysData?.total_class_teachers ??
            sysData?.total_scanners
        ) || 0,
      openLoafingIncidents: Number(sysData?.open_loafing_incidents) || 0,
      activeExitPasses: Number(sysData?.active_exit_passes) || 0,
      lastChecked: formatTime12h(new Date(), { includeSeconds: true }),
    });
  }, []);

  const fetchUserActivities = useCallback(async () => {
    logsAbortRef.current?.abort();
    const controller = new AbortController();
    logsAbortRef.current = controller;

    setLogsLoading(true);
    try {
      const params: Record<string, string | number> = { nocache: 1 };
      const cleanSearch = sanitizeSettingsInput(logSearch, 80);
      if (cleanSearch) params.search = cleanSearch;
      if (logActionFilter !== 'ALL') params.action = logActionFilter;
      if (logDateFilter) params.date = logDateFilter;

      const res = await apiClient.get(API_ROUTES.accounts.auditLogs, {
        params,
        timeout: 8000,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (res.data) {
        const rawList = res.data.records || res.data.results || (Array.isArray(res.data) ? res.data : []);
        setActivityLogs(rawList);
        setIsAdminUser(Boolean(res.data.is_admin));
      }
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
        return;
      }
      setActivityLogs([]);
      showAlert({
        title: 'Activity Log Notice',
        message: extractApiError(err, 'Could not load activity logs.'),
        type: 'warning',
      });
    } finally {
      if (!controller.signal.aborted) {
        setLogsLoading(false);
      }
    }
  }, [logSearch, logActionFilter, logDateFilter, showAlert]);

  useEffect(() => {
    const controller = new AbortController();
    initAbortRef.current = controller;

    const warmSchool = peekApiCache<any>(API_ROUTES.school.settings);
    if (warmSchool) {
      applySchoolPayload(warmSchool);
      setLoading(false);
    }

    const loadInitialData = async () => {
      if (!warmSchool) setLoading(true);
      try {
        const [schoolRes, teacherRes] = await Promise.allSettled([
          apiClient.get(API_ROUTES.school.settings, { timeout: 6000, signal: controller.signal }),
          apiClient
            .get(API_ROUTES.accounts.teachersDropdown, {
              params: { include_all: 'true' },
              timeout: 6000,
              signal: controller.signal,
            })
            .catch(() => apiClient.get(API_ROUTES.accounts.teachers, { timeout: 6000, signal: controller.signal })),
        ]);

        if (controller.signal.aborted) return;

        if (schoolRes.status === 'fulfilled' && schoolRes.value.data) {
          applySchoolPayload(schoolRes.value.data);
        }

        if (teacherRes.status === 'fulfilled' && teacherRes.value.data) {
          const tList = Array.isArray(teacherRes.value.data)
            ? teacherRes.value.data
            : teacherRes.value.data?.results || [];
          setTeacherList(tList);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadInitialData();
    void fetchDiagnostics();

    return () => {
      controller.abort();
    };
  }, [applySchoolPayload, fetchDiagnostics]);

  useEffect(() => {
    if (activeSubTab === 'LOGS' || activeSubTab === 'ALL') {
      void fetchUserActivities();
    }
  }, [activeSubTab, fetchUserActivities]);

  const runMaintenanceAction = (
    actionKey: string,
    title: string,
    description: string,
    apiCall: () => Promise<any>
  ) => {
    showConfirm({
      title,
      message: `${description} Do you want to proceed?`,
      confirmLabel: 'Run Fix Now',
      isDestructive: false,
      onConfirm: async () => {
        setActionLoading(actionKey);
        try {
          const res = await apiCall();
          showAlert({
            title: 'Task Finished Successfully',
            message: res?.data?.message || `${title} completed with zero errors.`,
            type: 'success',
          });
          void fetchDiagnostics();
        } catch (err: unknown) {
          showAlert({
            title: 'Action Notice',
            message: extractApiError(err, 'Action could not be completed. Please try again.'),
            type: 'warning',
          });
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const exportActivityCSV = () => {
    if (activityLogs.length === 0) {
      showAlert({ title: 'Empty Export', message: 'No activity logs available to export.', type: 'warning' });
      return;
    }

    exportToCsv(
      `AttendSure_User_Activities_${new Date().toISOString().split('T')[0]}.csv`,
      ['Timestamp', 'User Account', 'Action', 'Module', 'Event Details', 'Client IP', 'Status'],
      activityLogs.map((r) => [
        formatAuditTimestamp(r).fullText,
        getAuditActorName(r),
        getAuditActionLabel(r),
        getAuditModuleLabel(r),
        getAuditDetailsText(r),
        getAuditIpAddress(r),
        getAuditStatusDisplay(r).label,
      ])
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    const hasLat = String(formData.latitude).trim() !== '';
    const hasLng = String(formData.longitude).trim() !== '';
    const lat = hasLat ? Number(formData.latitude) : null;
    const lng = hasLng ? Number(formData.longitude) : null;
    const radius = Number(formData.geofence_radius_meters);

    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      showAlert({ title: 'Invalid Latitude', message: 'Latitude must be between -90 and 90 degrees.', type: 'error' });
      setSaving(false);
      return;
    }
    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      showAlert({ title: 'Invalid Longitude', message: 'Longitude must be between -180 and 180 degrees.', type: 'error' });
      setSaving(false);
      return;
    }
    if (isNaN(radius) || radius < 20 || radius > 5000) {
      showAlert({ title: 'Invalid Boundary Radius', message: 'Radius must be between 20 and 5000 meters.', type: 'error' });
      setSaving(false);
      return;
    }

    const validTeacherId =
      formData.principal_teacher && !isNaN(Number(formData.principal_teacher))
        ? Number(formData.principal_teacher)
        : null;

    const payload: Record<string, unknown> = {
      school_id: sanitizeSettingsInput(formData.school_id, 40),
      school_name: sanitizeSettingsInput(formData.school_name, 160),
      region: sanitizeSettingsInput(formData.region, 80),
      division: sanitizeSettingsInput(formData.division, 120),
      district: sanitizeSettingsInput(formData.district, 120),
      academic_year: sanitizeSettingsInput(formData.academic_year, 20),
      address: sanitizeSettingsInput(formData.address, 250),
      contact_number: sanitizeSettingsInput(formData.contact_number, 40),
      email: sanitizeSettingsInput(formData.email, 150),
      website: sanitizeSettingsInput(formData.website, 200),
      principal_teacher: validTeacherId,
      principal_name: sanitizeSettingsInput(formData.principal_name, 150),
      principal_title: sanitizeSettingsInput(formData.principal_title, 120),
      superintendent_name: sanitizeSettingsInput(formData.superintendent_name, 150),
      latitude: lat,
      longitude: lng,
      geofence_radius_meters: radius,
    };

    if (freshLogos.school_logo) payload.school_logo = formData.school_logo;
    if (freshLogos.left_logo) payload.left_logo = formData.left_logo;
    if (freshLogos.right_logo) payload.right_logo = formData.right_logo;

    try {
      const res = await apiClient.put(API_ROUTES.school.settings, payload, { timeout: 15000 });
      updateSchoolInstantly(res.data || payload);
      if (isSafeImageUrl(res.data?.principal_photo_url)) {
        setFormData((prev) => ({ ...prev, principal_photo_url: res.data.principal_photo_url }));
      }
      setFreshLogos({ school_logo: false, left_logo: false, right_logo: false });
      setSaveSuccess(true);
      showAlert({
        title: 'Settings Saved',
        message: 'School profile and campus boundary saved to the database.',
        type: 'success',
        autoCloseDuration: 2500,
      });
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current);
      saveSuccessTimerRef.current = setTimeout(() => {
        setSaveSuccess(false);
        saveSuccessTimerRef.current = null;
      }, 3000);
      await refreshSchool();
    } catch (err: unknown) {
      showAlert({
        title: 'Save Failed',
        message: extractApiError(err, 'Could not save school settings. Please check your permissions and inputs.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loader2 className="animate-spin" size={30} color={brand.primary} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        backgroundColor: tokens.bgApp,
        padding: 'clamp(14px, 2.5vw, 24px)',
      }}
    >
      <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: tokens.textPrimary, margin: 0 }}>
              School Settings &amp; Maintenance Center
            </h1>
            <p style={{ fontSize: '0.78rem', color: tokens.textSecondary, marginTop: 4 }}>
              Manage school profiles, official report seals, self-service maintenance diagnostics, and activity logs.
            </p>
          </div>

          <div
            style={{
              display: 'inline-flex',
              backgroundColor: tokens.bgSurfaceSubtle,
              padding: 3,
              borderRadius: 10,
              border: `1px solid ${tokens.borderSubtle}`,
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {(
              [
                ...(canEditSettings
                  ? ([{ key: 'MAINTENANCE', label: 'One-Click System Fixes', icon: <Wrench size={14} /> }] as const)
                  : []),
                {
                  key: 'SETTINGS',
                  label: canEditSettings ? 'School Profile & Settings' : 'School Profile (View)',
                  icon: <Building2 size={14} />,
                },
                ...(canViewLogs
                  ? ([{ key: 'LOGS', label: 'System Audit Logs', icon: <History size={14} /> }] as const)
                  : []),
                ...(canEditSettings
                  ? ([{ key: 'ALL', label: 'Show All', icon: <Layers size={14} /> }] as const)
                  : []),
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSubTab(tab.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: activeSubTab === tab.key ? tokens.bgSurface : 'transparent',
                  color: activeSubTab === tab.key ? brand.primary : tokens.textSecondary,
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  boxShadow: activeSubTab === tab.key ? tokens.cardShadow : 'none',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {canEditSettings && (activeSubTab === 'MAINTENANCE' || activeSubTab === 'ALL') && (
          <MaintenancePanel
            health={health}
            actionLoading={actionLoading}
            onRefreshDiagnostics={() => void fetchDiagnostics()}
            onRunAction={runMaintenanceAction}
          />
        )}

        {(activeSubTab === 'LOGS' || activeSubTab === 'ALL') && (
          <AuditLogsPanel
            activityLogs={activityLogs}
            logsLoading={logsLoading}
            isAdminUser={isAdminUser}
            logSearch={logSearch}
            logActionFilter={logActionFilter}
            logDateFilter={logDateFilter}
            onLogSearchChange={setLogSearch}
            onLogActionFilterChange={setLogActionFilter}
            onLogDateFilterChange={setLogDateFilter}
            onRefresh={() => void fetchUserActivities()}
            onExportCsv={exportActivityCSV}
          />
        )}

        {(activeSubTab === 'SETTINGS' || activeSubTab === 'ALL') && (
          <SchoolProfileForm
            formData={formData}
            teacherList={teacherList}
            canEditSettings={canEditSettings}
            saving={saving}
            saveSuccess={saveSuccess}
            onChangeFormData={setFormData}
            onMarkLogoDirty={(field) => setFreshLogos((prev) => ({ ...prev, [field]: true }))}
            onSubmit={handleSave}
          />
        )}
      </div>
    </div>
  );
};

export default SettingsTab;
