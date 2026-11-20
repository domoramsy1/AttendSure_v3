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
import { ProfileAvatar } from '../common/ProfileAvatar';
import { Button } from '../ui/Button';
import {
  Building2,
  UserCheck,
  Save,
  Loader2,
  Upload,
  Trash2,
  ShieldCheck,
  MapPin,
  Phone,
  Mail,
  Globe,
  Compass,
  Calendar,
  Award,
  Wrench,
  Radio,
  Send,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  HardDrive,
  Layers,
  History,
  Search,
  FileSpreadsheet,
} from 'lucide-react';

interface FacultyOption {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  department: string;
  contact_number?: string;
  email?: string;
  photo_url?: string | null;
}

interface MaintenanceHealthStatus {
  database: 'ONLINE' | 'OFFLINE';
  dbLatencyMs: number;
  scannersOnline: number;
  scannersTotal: number;
  pushPending: number;
  pushFailed: number;
  pushSentToday: number;
  lastChecked: string;
}

interface ActivityRecord {
  id: number;
  timestamp: string;
  time_only: string;
  date_only: string;
  user: string;
  action: string;
  module: string;
  details: string;
  ip_address: string;
  status: string;
}

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const sanitizeInput = (raw: string, maxLength = 200): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

const compressImageToDataUrl = (file: File, maxDim = 360, quality = 0.78): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      if (typeof window === 'undefined') {
        resolve('');
        return;
      }
      const rawDataUrl = typeof e.target?.result === 'string' ? e.target.result : '';
      if (!isSafeImageUrl(rawDataUrl)) {
        resolve('');
        return;
      }
      const img = new window.Image();
      img.src = rawDataUrl;
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(isSafeImageUrl(compressed) ? compressed : '');
      };
      img.onerror = () => resolve('');
    };
    reader.onerror = () => resolve('');
  });
};

export const SettingsTab: React.FC = () => {
  const { updateSchoolInstantly, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();
  const { mode, tokens, brand, ui } = useTheme();
  const successBtnBg = mode === 'dark' ? '#059669' : brand.success;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initAbortRef = useRef<AbortController | null>(null);
  const diagAbortRef = useRef<AbortController | null>(null);
  const logsAbortRef = useRef<AbortController | null>(null);
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'MAINTENANCE' | 'SETTINGS' | 'LOGS' | 'ALL'>('MAINTENANCE');

  const cachedSchool = peekApiCache<any>(API_ROUTES.school.settings);
  const [facultyList, setFacultyList] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState(!cachedSchool);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [activityLogs, setActivityLogs] = useState<ActivityRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');
  const [logDateFilter, setLogDateFilter] = useState<string>('');
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  const [health, setHealth] = useState<MaintenanceHealthStatus>({
    database: 'ONLINE',
    dbLatencyMs: 0,
    scannersOnline: 0,
    scannersTotal: 0,
    pushPending: 0,
    pushFailed: 0,
    pushSentToday: 0,
    lastChecked: '',
  });

  const [formData, setFormData] = useState({
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
    principal_faculty: '' as string | number,
    principal_name: '',
    principal_title: '',
    principal_photo_url: null as string | null,
    principal_employee_id: '',
    principal_department: '',
    principal_contact_number: '',
    principal_email: '',
    superintendent_name: '',
    school_logo: null as string | null,
    left_logo: null as string | null,
    right_logo: null as string | null,
    latitude: '',
    longitude: '',
    geofence_radius_meters: 150,
  });

  const [freshLogos, setFreshLogos] = useState({
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
      principal_faculty: s.principal_faculty ?? '',
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
      scannersOnline: Number(sysData?.online_count) || 0,
      scannersTotal: Number(sysData?.total_scanners) || 0,
      pushSentToday: Number(sysData?.sent_today ?? sysData?.push_delivered_today) || 0,
      pushPending: Number(sysData?.pending_queue) || 0,
      pushFailed: Number(sysData?.failed_today) || 0,
      lastChecked: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
  }, []);

  const fetchUserActivities = useCallback(async () => {
    logsAbortRef.current?.abort();
    const controller = new AbortController();
    logsAbortRef.current = controller;

    setLogsLoading(true);
    try {
      const params: Record<string, string | number> = { nocache: 1 };
      const cleanSearch = sanitizeInput(logSearch, 80);
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
        setIsSuperAdmin(Boolean(res.data.is_admin));
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
        const [schoolRes, facultyRes] = await Promise.allSettled([
          apiClient.get(API_ROUTES.school.settings, { timeout: 6000, signal: controller.signal }),
          apiClient
            .get(API_ROUTES.accounts.facultyDropdown, {
              params: { include_all: 'true' },
              timeout: 6000,
              signal: controller.signal,
            })
            .catch(() => apiClient.get(API_ROUTES.accounts.faculty, { timeout: 6000, signal: controller.signal })),
        ]);

        if (controller.signal.aborted) return;

        if (schoolRes.status === 'fulfilled' && schoolRes.value.data) {
          applySchoolPayload(schoolRes.value.data);
        }

        if (facultyRes.status === 'fulfilled' && facultyRes.value.data) {
          const fList = Array.isArray(facultyRes.value.data)
            ? facultyRes.value.data
            : facultyRes.value.data?.results || [];
          setFacultyList(fList);
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

  const handleFacultyChange = (facultyIdStr: string) => {
    if (!facultyIdStr) {
      setFormData((prev) => ({
        ...prev,
        principal_faculty: '',
        principal_name: '',
        principal_title: '',
        principal_photo_url: null,
        principal_employee_id: '',
        principal_department: '',
        principal_contact_number: '',
        principal_email: '',
      }));
      return;
    }

    const fid = Number(facultyIdStr);
    const chosen = facultyList.find((f) => f.id === fid);

    if (chosen) {
      setFormData((prev) => ({
        ...prev,
        principal_faculty: fid,
        principal_name: chosen.full_name || `${chosen.first_name} ${chosen.last_name}`.trim(),
        principal_title: chosen.position || 'School Principal',
        principal_photo_url: isSafeImageUrl(chosen.photo_url) ? chosen.photo_url ?? null : null,
        principal_employee_id: chosen.employee_id || '',
        principal_department: chosen.department || 'Administration',
        principal_contact_number: chosen.contact_number || '',
        principal_email: chosen.email || '',
      }));
    }
  };

  const selectedFacultyObj = facultyList.find(
    (f) => String(f.id) === String(formData.principal_faculty)
  );

  const rawPrincipalPhoto = selectedFacultyObj?.photo_url || formData.principal_photo_url || null;
  const activePrincipalPhoto = isSafeImageUrl(rawPrincipalPhoto) ? rawPrincipalPhoto : null;
  const activePrincipalEmpId = selectedFacultyObj?.employee_id || formData.principal_employee_id || '';
  const activePrincipalDept = selectedFacultyObj?.department || formData.principal_department || 'Administration';
  const activePrincipalContact = selectedFacultyObj?.contact_number || formData.principal_contact_number || '';
  const activePrincipalEmail = selectedFacultyObj?.email || formData.principal_email || '';

  const handleLogoUpload = async (
    field: 'school_logo' | 'left_logo' | 'right_logo',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showAlert({
        title: 'Invalid Image Format',
        message: 'Only PNG, JPG, and WebP images are allowed.',
        type: 'error',
      });
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showAlert({
        title: 'Image File Too Large',
        message: 'Please choose an image under 5 MB.',
        type: 'error',
      });
      return;
    }

    const compressed = await compressImageToDataUrl(file, 360, 0.78);
    if (compressed && isSafeImageUrl(compressed)) {
      setFormData((prev) => ({ ...prev, [field]: compressed }));
      setFreshLogos((prev) => ({ ...prev, [field]: true }));
    }
  };

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

    const headers = ['Timestamp', 'User Account', 'Action', 'Module', 'Details', 'IP Address', 'Status'];
    const rows = activityLogs.map((r) => [
      r.timestamp,
      r.user,
      r.action,
      r.module,
      r.details,
      r.ip_address,
      r.status,
    ]);

    exportToCsv(
      `AttendSure_User_Activities_${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows
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

    const validFacultyId =
      formData.principal_faculty && !isNaN(Number(formData.principal_faculty))
        ? Number(formData.principal_faculty)
        : null;

    const payload: Record<string, unknown> = {
      school_id: sanitizeInput(formData.school_id, 40),
      school_name: sanitizeInput(formData.school_name, 160),
      region: sanitizeInput(formData.region, 80),
      division: sanitizeInput(formData.division, 120),
      district: sanitizeInput(formData.district, 120),
      academic_year: sanitizeInput(formData.academic_year, 20),
      address: sanitizeInput(formData.address, 250),
      contact_number: sanitizeInput(formData.contact_number, 40),
      email: sanitizeInput(formData.email, 150),
      website: sanitizeInput(formData.website, 200),
      principal_faculty: validFacultyId,
      principal_name: sanitizeInput(formData.principal_name, 150),
      principal_title: sanitizeInput(formData.principal_title, 120),
      superintendent_name: sanitizeInput(formData.superintendent_name, 150),
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
        setFormData((prev) => ({
          ...prev,
          principal_photo_url: res.data.principal_photo_url,
        }));
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

  const cardStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 14,
    padding: '18px 22px',
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
  };

  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: `1px solid ${tokens.borderSubtle}`,
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: '0.96rem',
    fontWeight: 800,
    color: tokens.textPrimary,
    margin: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.74rem',
    fontWeight: 700,
    color: tokens.textSecondary,
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    ...ui.input,
    borderRadius: 8,
    backgroundColor: tokens.bgSurfaceSubtle,
    fontSize: '0.82rem',
  };

  const previewBoxStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurfaceSubtle,
    border: `1px solid ${tokens.borderSubtle}`,
    borderRadius: 12,
    padding: '16px',
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
      ref={scrollContainerRef}
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
      <div
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Navigation Selector */}
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
                { key: 'MAINTENANCE', label: 'One-Click System Fixes', icon: <Wrench size={14} /> },
                { key: 'SETTINGS', label: 'School Profile & Settings', icon: <Building2 size={14} /> },
                { key: 'LOGS', label: 'User Activity Logs', icon: <History size={14} /> },
                { key: 'ALL', label: 'Show All', icon: <Layers size={14} /> },
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

        {/* SECTION 1: SELF-SERVICE MAINTENANCE CENTER */}
        {(activeSubTab === 'MAINTENANCE' || activeSubTab === 'ALL') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ ...cardStyle, borderLeft: `4px solid ${health.database === 'ONLINE' ? brand.success : brand.danger}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: health.database === 'ONLINE' ? brand.success : brand.danger,
                        boxShadow: `0 0 8px ${health.database === 'ONLINE' ? brand.success : brand.danger}`,
                      }}
                    />
                    <strong style={{ fontSize: '0.94rem', color: tokens.textPrimary }}>
                      {health.database === 'ONLINE' ? 'System Database is Healthy & Online' : 'Attention: Database Disconnected'}
                    </strong>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: tokens.textSecondary, marginTop: 3, display: 'block' }}>
                    Response time: {health.dbLatencyMs}ms &bull; Last checked at {health.lastChecked || 'Just now'}
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => void fetchDiagnostics()}
                  icon={<RefreshCw size={13} />}
                >
                  Check Status Now
                </Button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: `1px solid ${tokens.borderSubtle}`,
                }}
              >
                <div style={telemetryStatBox(tokens)}>
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>DATABASE HEALTH</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: health.database === 'ONLINE' ? brand.success : brand.danger }}>
                    {health.database === 'ONLINE' ? 'Active (Connected)' : 'Disconnected'}
                  </div>
                </div>

                <div style={telemetryStatBox(tokens)}>
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>USB QR &amp; CAMPUS GPS</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: health.scannersOnline > 0 ? brand.primary : brand.warning }}>
                    {health.scannersOnline} of {health.scannersTotal} Online
                  </div>
                </div>

                <div style={telemetryStatBox(tokens)}>
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>PUSH ALERTS TODAY</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: brand.success }}>
                    {health.pushSentToday.toLocaleString()} Delivered
                  </div>
                </div>

                <div style={telemetryStatBox(tokens)}>
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>PENDING PUSH ALERTS</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: health.pushFailed > 0 ? brand.danger : brand.primary }}>
                    {health.pushFailed} Failed / {health.pushPending} Waiting
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: tokens.infoLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={18} color={brand.secondary} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Sync Parent Push Alerts
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Delivers pending mobile app notifications</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  Refreshes the mobile push notification service so parents immediately receive classroom attendance and exit pass alerts on the AttendSure mobile app.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'SYNC_PUSH',
                      'Sync Pending Push Alerts',
                      'Retries delivery of pending mobile push alerts to connected parent and faculty devices.',
                      () => apiClient.post(API_ROUTES.reports.systemStatus, { action: 'RETRY_FAILED' })
                    )
                  }
                  style={actionBtnStyle(brand.buttonBg)}
                >
                  {actionLoading === 'SYNC_PUSH' ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                  <span>{actionLoading === 'SYNC_PUSH' ? 'Syncing...' : 'Sync Push Alerts Now'}</span>
                </button>
              </div>

              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: tokens.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw size={18} color={brand.primary} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Clean System Memory
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Clears saved cache and speeds up screens</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  If class lists appear outdated or the portal feels slow, click to clear temporary server memory and refresh data immediately without restarting.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'FLUSH_CACHE',
                      'Clean System Memory & Cache',
                      'This safely empties temporary cache files so fresh records load from the database.',
                      () => apiClient.post(API_ROUTES.health.flushCache)
                    )
                  }
                  style={actionBtnStyle(brand.buttonBg)}
                >
                  {actionLoading === 'FLUSH_CACHE' ? <Loader2 className="animate-spin" size={14} /> : <HardDrive size={14} />}
                  <span>{actionLoading === 'FLUSH_CACHE' ? 'Cleaning...' : 'Clean Memory & Refresh'}</span>
                </button>
              </div>

              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: tokens.successLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Radio size={18} color={brand.success} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Check USB QR &amp; Campus GPS
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Checks classroom QR scanning and mobile check-in status</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  Verifies that classroom USB QR code scanning and faculty mobile facial recognition &amp; campus GPS check-ins are online and syncing cleanly.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'VERIFY_STATION',
                      'Check Attendance Services',
                      'Checks connectivity for classroom USB QR attendance and faculty mobile GPS check-in services.',
                      () => apiClient.get(API_ROUTES.reports.systemStatus, { params: { nocache: 1 } })
                    )
                  }
                  style={actionBtnStyle(successBtnBg)}
                >
                  {actionLoading === 'VERIFY_STATION' ? <Loader2 className="animate-spin" size={14} /> : <Radio size={14} />}
                  <span>{actionLoading === 'VERIFY_STATION' ? 'Checking...' : 'Check Attendance Services'}</span>
                </button>
              </div>

              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: tokens.infoLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyRound size={18} color={brand.secondary} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Unlock Faculty Accounts
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Unfreezes accounts locked by wrong passwords</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  If a faculty member or administrator is locked out after entering the wrong password 5 times, click here to clear failed attempts so they can sign in right away.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'UNLOCK_ACCOUNTS',
                      'Unlock Faculty Accounts',
                      'This resets failed login attempts and clears temporary lockouts for locked accounts across the school.',
                      () => apiClient.post(API_ROUTES.accounts.unlockAccounts)
                    )
                  }
                  style={actionBtnStyle(brand.buttonBg)}
                >
                  {actionLoading === 'UNLOCK_ACCOUNTS' ? <Loader2 className="animate-spin" size={14} /> : <KeyRound size={14} />}
                  <span>{actionLoading === 'UNLOCK_ACCOUNTS' ? 'Unlocking...' : 'Unlock Faculty Accounts'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: USER ACTIVITY & AUDIT LOGS */}
        {(activeSubTab === 'LOGS' || activeSubTab === 'ALL') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div>
                  <h2 style={{ fontSize: '0.98rem', fontWeight: 800, color: tokens.textPrimary, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <History size={18} color={brand.primary} />
                    <span>{isSuperAdmin ? 'System-Wide User Activity & Audit Logs' : 'My Activity Logs'}</span>
                  </h2>
                  <p style={{ fontSize: '0.72rem', color: tokens.textSecondary, margin: '2px 0 0 0' }}>
                    {isSuperAdmin
                      ? 'Audit logins, exit pass issuances, profile changes, and account actions.'
                      : 'Permanent audit trail of your account operations and logins.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={exportActivityCSV}
                    disabled={activityLogs.length === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      backgroundColor: successBtnBg,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: activityLogs.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: activityLogs.length === 0 ? 0.55 : 1,
                    }}
                  >
                    <FileSpreadsheet size={13} />
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void fetchUserActivities()}
                    disabled={logsLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      backgroundColor: tokens.bgSurfaceSubtle,
                      color: tokens.textPrimary,
                      border: `1px solid ${tokens.borderStrong}`,
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={12} className={logsLoading ? 'animate-spin' : ''} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div style={{ padding: 10, backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="Search username, action, module, or details..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void fetchUserActivities()}
                    style={inputStyle}
                  />
                </div>

                <select
                  aria-label="Filter activity by action"
                  value={logActionFilter}
                  onChange={(e) => setLogActionFilter(e.target.value)}
                  style={{ ...inputStyle, width: 160 }}
                >
                  <option value="ALL">All Actions</option>
                  <option value="LOGIN">Sign In / Login</option>
                  <option value="LOGOUT">Sign Out / Logout</option>
                  <option value="SCAN">Classroom QR Scan</option>
                  <option value="GATE_PASS">Exit Pass</option>
                  <option value="PROFILE">Profile Change</option>
                </select>

                <input
                  type="date"
                  aria-label="Filter activity by date"
                  value={logDateFilter}
                  onChange={(e) => setLogDateFilter(e.target.value)}
                  style={{ ...inputStyle, width: 140 }}
                />

                <button
                  type="button"
                  onClick={() => void fetchUserActivities()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '8px 16px',
                    backgroundColor: brand.buttonBg,
                    color: '#ffffff',
                    borderRadius: 6,
                    border: 'none',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Search size={13} />
                  <span>Search</span>
                </button>
              </div>

              {/* Activity Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: tokens.bgSurfaceSubtle, borderBottom: `1px solid ${tokens.borderSubtle}`, color: tokens.textSecondary }}>
                      <th style={{ padding: '9px 14px' }}>Timestamp</th>
                      <th style={{ padding: '9px 14px' }}>User Account</th>
                      <th style={{ padding: '9px 14px' }}>Action &amp; Module</th>
                      <th style={{ padding: '9px 14px' }}>Event Details</th>
                      <th style={{ padding: '9px 14px' }}>Client IP</th>
                      <th style={{ padding: '9px 14px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.length > 0 ? (
                      activityLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: tokens.textPrimary }}>
                            <div>{log.time_only}</div>
                            <div style={{ fontSize: '0.64rem', color: tokens.textMuted }}>{log.date_only}</div>
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <strong style={{ color: brand.primary }}>{log.user}</strong>
                          </td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ fontWeight: 700, color: tokens.textPrimary }}>{log.action}</span>
                            <div style={{ fontSize: '0.64rem', color: tokens.textMuted }}>Module: {log.module}</div>
                          </td>
                          <td style={{ padding: '9px 14px', color: tokens.textSecondary }}>{log.details}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: tokens.textMuted }}>{log.ip_address}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: '0.64rem',
                                fontWeight: 800,
                                backgroundColor: log.status === 'SUCCESS' ? tokens.successLight : tokens.dangerLight,
                                color: log.status === 'SUCCESS' ? brand.success : brand.danger,
                              }}
                            >
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: tokens.textMuted }}>
                          {logsLoading ? 'Loading activity logs...' : 'No activity logs found for the selected criteria.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: OFFICIAL SCHOOL SETTINGS */}
        {(activeSubTab === 'SETTINGS' || activeSubTab === 'ALL') && (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Subsection A: School Head / Principal Information */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <UserCheck size={18} color={brand.primary} />
                <h2 style={cardTitleStyle}>School Head / Principal Information</h2>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    backgroundColor: tokens.successLight,
                    color: brand.success,
                    border: `1px solid ${brand.success}`,
                    padding: '2px 8px',
                    borderRadius: 12,
                    marginLeft: 'auto',
                  }}
                >
                  AUTOMATIC SYNC ACTIVE
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Assign from Faculty / Staff Directory</label>
                    <select
                      value={formData.principal_faculty || ''}
                      onChange={(e) => handleFacultyChange(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">-- Select Faculty Member --</option>
                      {facultyList.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.last_name}, {f.first_name} — {f.position || 'Staff'} ({f.employee_id})
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.70rem', color: tokens.textMuted, marginTop: 4, display: 'block' }}>
                      Assigning a user with role <strong>School Principal</strong> in the Users tab sets this automatically.
                    </span>
                  </div>

                  <div>
                    <label style={labelStyle}>Official Signature Name (Printed on SF1, SF2, SF4, DTR) *</label>
                    <input
                      type="text"
                      required
                      maxLength={150}
                      value={formData.principal_name}
                      onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                      placeholder="Enter official school head name"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Official Position / Title *</label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={formData.principal_title}
                      onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                      placeholder="Enter official position or title"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={previewBoxStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Current School Head Credentials
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 10,
                        backgroundColor: tokens.primaryLight,
                        color: brand.primary,
                        fontSize: '0.66rem',
                        fontWeight: 800,
                      }}
                    >
                      <ShieldCheck size={12} /> VERIFIED SCHOOL HEAD
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <ProfileAvatar
                      photoUrl={activePrincipalPhoto}
                      name={formData.principal_name || 'School Head'}
                      size={56}
                      iconSize={26}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.94rem' }}>
                        {formData.principal_name || 'No Principal Assigned'}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: brand.primary, fontWeight: 700, marginTop: 2 }}>
                        {formData.principal_title || 'Unassigned Title'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: `1px solid ${tokens.borderSubtle}`,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
                      gap: 8,
                      fontSize: '0.72rem',
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>Employee ID:</span>
                      <strong style={{ display: 'block', color: tokens.textPrimary, fontFamily: 'monospace' }}>
                        {activePrincipalEmpId || '—'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>Department:</span>
                      <strong style={{ display: 'block', color: tokens.textPrimary }}>
                        {activePrincipalDept}
                      </strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>Contact No.:</span>
                      <strong style={{ display: 'block', color: tokens.textPrimary }}>
                        {activePrincipalContact || '—'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>Email:</span>
                      <strong style={{ display: 'block', color: tokens.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activePrincipalEmail || '—'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Subsection B: School Identification & Academic Calendar */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Building2 size={18} color={brand.primary} />
                <h2 style={cardTitleStyle}>School Identification &amp; Hierarchy</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>School ID *</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={formData.school_id}
                    onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                    placeholder="Enter school ID"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Official School Name *</label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={formData.school_name}
                    onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                    placeholder="Enter official school name"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Region</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="Enter region"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Division</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={formData.division}
                    onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                    placeholder="Enter division"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>District</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    placeholder="Enter district"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Active School Year (SY)</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      maxLength={20}
                      value={formData.academic_year}
                      onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
                      placeholder="YYYY-YYYY"
                      style={{ ...inputStyle, paddingRight: 30 }}
                    />
                    <Calendar size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Schools Division Superintendent (SDS)</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      maxLength={150}
                      value={formData.superintendent_name}
                      onChange={(e) => setFormData({ ...formData, superintendent_name: e.target.value })}
                      placeholder="Enter division superintendent name"
                      style={{ ...inputStyle, paddingRight: 30 }}
                    />
                    <Award size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Subsection C: Official Contact Details */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <MapPin size={18} color={brand.primary} />
                <h2 style={cardTitleStyle}>Official Contact &amp; Document Footer Details</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Complete Campus Address *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      required
                      maxLength={250}
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Enter complete campus address"
                      style={{ ...inputStyle, paddingRight: 30 }}
                    />
                    <MapPin size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Telephone / Contact Number *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={formData.contact_number}
                      onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                      placeholder="Enter official contact number"
                      style={{ ...inputStyle, paddingRight: 30 }}
                    />
                    <Phone size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Official School Email Address *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="email"
                      required
                      maxLength={150}
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="Enter official school email"
                      style={{ ...inputStyle, paddingRight: 30 }}
                    />
                    <Mail size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Official Website / Division Portal</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      maxLength={200}
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://..."
                      style={{ ...inputStyle, paddingRight: 30 }}
                    />
                    <Globe size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Subsection D: Campus GPS Geofence Coordinates */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Compass size={18} color={brand.primary} />
                <h2 style={cardTitleStyle}>Campus GPS Boundary Coordinates</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Campus Center Latitude (°N)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="Enter latitude"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Campus Center Longitude (°E)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="Enter longitude"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Allowed Radius (Meters)</label>
                  <input
                    type="number"
                    min="20"
                    max="2000"
                    value={formData.geofence_radius_meters}
                    onChange={(e) => setFormData({ ...formData, geofence_radius_meters: parseInt(e.target.value, 10) || 150 })}
                    placeholder="150"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Subsection E: School Emblem & Official Seals */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <ShieldCheck size={18} color={brand.primary} />
                <h2 style={cardTitleStyle}>School Emblem &amp; Official Report Letterhead Seals</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
                {(
                  [
                    { field: 'school_logo', label: '1. Main School Profile Emblem', alt: 'Main Emblem', uploadText: 'Upload Photo', emptyText: 'No emblem uploaded' },
                    { field: 'left_logo', label: '2. Left Seal (DepEd Official Seal)', alt: 'Left Seal', uploadText: 'Upload Seal', emptyText: 'No seal uploaded' },
                    { field: 'right_logo', label: '3. Right Seal (Division / School Seal)', alt: 'Right Seal', uploadText: 'Upload Seal', emptyText: 'No seal uploaded' },
                  ] as const
                ).map((item) => {
                  const val = formData[item.field];
                  const safeUrl = isSafeImageUrl(val) ? val : null;
                  return (
                    <div key={item.field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>
                        {item.label}
                      </span>
                      <div
                        style={{
                          width: '100%',
                          height: 90,
                          backgroundColor: tokens.bgSurfaceSubtle,
                          border: `1px dashed ${tokens.borderStrong}`,
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 6,
                          boxSizing: 'border-box',
                        }}
                      >
                        {safeUrl ? (
                          <img
                            src={safeUrl}
                            alt={item.alt}
                            style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>{item.emptyText}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <label
                          style={{
                            padding: '5px 10px',
                            backgroundColor: tokens.bgSurfaceSubtle,
                            border: `1px solid ${tokens.borderStrong}`,
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: brand.primary,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Upload size={12} /> {item.uploadText}
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/webp"
                            onChange={(e) => void handleLogoUpload(item.field, e)}
                            style={{ display: 'none' }}
                          />
                        </label>
                        {safeUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormData((p) => ({ ...p, [item.field]: null }));
                              setFreshLogos((p) => ({ ...p, [item.field]: true }));
                            }}
                            style={{
                              padding: '5px 10px',
                              backgroundColor: tokens.dangerLight,
                              border: `1px solid ${brand.danger}`,
                              borderRadius: 6,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: brand.danger,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                            }}
                          >
                            <Trash2 size={12} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Save Button Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              {saveSuccess && (
                <span style={{ color: brand.success, fontSize: '0.80rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={15} /> Configuration saved successfully.
                </span>
              )}
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={saving}
                icon={saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
              >
                Save School Configuration
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const telemetryStatBox = (tokens: { bgSurfaceSubtle: string }): React.CSSProperties => ({
  backgroundColor: tokens.bgSurfaceSubtle,
  borderRadius: 8,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

const maintenanceActionCard = (tokens: { bgSurface: string; borderSubtle: string; cardShadow: string }): React.CSSProperties => ({
  backgroundColor: tokens.bgSurface,
  borderRadius: 12,
  border: `1px solid ${tokens.borderSubtle}`,
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  boxShadow: tokens.cardShadow,
});

const actionBtnStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: color,
  color: '#ffffff',
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'opacity 0.15s ease',
  width: '100%',
});

export default SettingsTab;
