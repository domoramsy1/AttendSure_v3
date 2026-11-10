/**
 * AttendSure - School Settings & Self-Service Maintenance Center
 * File: web/src/components/tabs/SettingsTab.tsx
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/Button';
import {
  Building2,
  UserCheck,
  Save,
  Loader2,
  Upload,
  Trash2,
  ShieldCheck,
  User,
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
  RotateCcw,
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
  smsPending: number;
  smsFailed: number;
  smsSentToday: number;
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

const compressImageToDataUrl = (file: File, maxDim = 360, quality = 0.78): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      if (typeof window === 'undefined') {
        resolve('');
        return;
      }
      const img = new window.Image();
      img.src = e.target?.result as string;
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
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve('');
    };
    reader.onerror = () => resolve('');
  });
};

export const SettingsTab: React.FC = () => {
  const { updateSchoolInstantly, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sub-Navigation Tabs: 'MAINTENANCE' | 'SETTINGS' | 'LOGS' | 'ALL'
  const [activeSubTab, setActiveSubTab] = useState<'MAINTENANCE' | 'SETTINGS' | 'LOGS' | 'ALL'>('MAINTENANCE');

  const [facultyList, setFacultyList] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // User Activity & Audit Logs State
  const [activityLogs, setActivityLogs] = useState<ActivityRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logActionFilter, setLogActionFilter] = useState<string>('ALL');
  const [logDateFilter, setLogDateFilter] = useState<string>('');
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  // Maintenance health status
  const [health, setHealth] = useState<MaintenanceHealthStatus>({
    database: 'ONLINE',
    dbLatencyMs: 2,
    scannersOnline: 0,
    scannersTotal: 0,
    smsPending: 0,
    smsFailed: 0,
    smsSentToday: 0,
    lastChecked: '',
  });

  const [formData, setFormData] = useState({
    school_id: '',
    school_name: '',
    region: '',
    division: '',
    district: '',
    academic_year: '2026-2027',
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
    latitude: 8.4858,
    longitude: 124.6567,
    geofence_radius_meters: 150,
  });

  const [freshLogos, setFreshLogos] = useState({
    school_logo: false,
    left_logo: false,
    right_logo: false,
  });

  const fetchDiagnostics = async () => {
    try {
      const [dbRes, scanRes, smsRes] = await Promise.all([
        apiClient.get('/core/maintenance/db-check/').catch(() => ({ data: { database: 'OFFLINE', latency_ms: 999 } })),
        apiClient.get('/telemetry/ping-scanners/').catch(() => ({ data: { online_count: 0, total_scanners: 0 } })),
        apiClient.get('/sms/test-gateway/').catch(() => ({ data: { sent_today: 0, pending_queue: 0, failed_today: 0 } })),
      ]);

      setHealth({
        database: dbRes.data?.database === 'CONNECTED' || dbRes.data?.status === 'HEALTHY' ? 'ONLINE' : 'OFFLINE',
        dbLatencyMs: Number(dbRes.data?.latency_ms) || 2,
        scannersOnline: Number(scanRes.data?.online_count) || 0,
        scannersTotal: Number(scanRes.data?.total_scanners) || 0,
        smsSentToday: Number(smsRes.data?.sent_today) || 0,
        smsPending: Number(smsRes.data?.pending_queue) || 0,
        smsFailed: Number(smsRes.data?.failed_today) || 0,
        lastChecked: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    } catch {}
  };

  // Safe and clean activity logs fetcher (prevents 500 error /? trailing syntax)
  const fetchUserActivities = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (logSearch.trim()) params.append('search', logSearch.trim());
      if (logActionFilter !== 'ALL') params.append('action', logActionFilter);
      if (logDateFilter) params.append('date', logDateFilter);

      const qs = params.toString();
      const endpoint = qs ? `/activity-logs/?${qs}` : '/activity-logs/';

      const res = await apiClient.get(endpoint, { timeout: 8000 });
      if (res.data) {
        const rawList = res.data.records || res.data.results || (Array.isArray(res.data) ? res.data : []);
        setActivityLogs(rawList);
        setIsSuperAdmin(Boolean(res.data.is_admin));
      }
    } catch (err) {
      console.log('[ActivityLogs] Fetch error handled gracefully:', err);
      setActivityLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [logSearch, logActionFilter, logDateFilter]);

  useEffect(() => {
    let isMounted = true;
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [schoolRes, facultyRes] = await Promise.all([
          apiClient.get('/settings/school/', { timeout: 5000 }),
          apiClient.get('/faculty/dropdown/?include_all=true', { timeout: 5000 }).catch(() => apiClient.get('/facultys/')),
        ]);

        if (!isMounted) return;
        const s = schoolRes.data;
        setFormData({
          school_id: s.school_id || '',
          school_name: s.school_name || '',
          region: s.region || '',
          division: s.division || '',
          district: s.district || '',
          academic_year: s.academic_year || s.school_year || '2026-2027',
          address: s.address || s.street_address || '',
          contact_number: s.contact_number || s.telephone || '',
          email: s.email || '',
          website: s.website || '',
          principal_faculty: s.principal_faculty || '',
          principal_name: s.principal_name || '',
          principal_title: s.principal_title || 'Secondary School Principal IV',
          principal_photo_url: s.principal_photo_url || null,
          principal_employee_id: s.principal_employee_id || '',
          principal_department: s.principal_department || '',
          principal_contact_number: s.principal_contact_number || '',
          principal_email: s.principal_email || '',
          superintendent_name: s.superintendent_name || '',
          school_logo: s.school_logo || null,
          left_logo: s.left_logo || null,
          right_logo: s.right_logo || null,
          latitude: s.latitude !== undefined && s.latitude !== null ? Number(s.latitude) : 8.4858,
          longitude: s.longitude !== undefined && s.longitude !== null ? Number(s.longitude) : 124.6567,
          geofence_radius_meters: s.geofence_radius_meters ? Number(s.geofence_radius_meters) : 150,
        });

        const fList = Array.isArray(facultyRes.data) ? facultyRes.data : facultyRes.data?.results || [];
        setFacultyList(fList);
      } catch (err) {
        console.error('Failed to load school settings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadInitialData();
    fetchDiagnostics();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeSubTab === 'LOGS' || activeSubTab === 'ALL') {
      fetchUserActivities();
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
        principal_title: chosen.position || 'Secondary School Principal IV',
        principal_photo_url: chosen.photo_url || null,
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

  const activePrincipalPhoto = selectedFacultyObj?.photo_url || formData.principal_photo_url || null;
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
    if (compressed) {
      setFormData((prev) => ({ ...prev, [field]: compressed }));
      setFreshLogos((prev) => ({ ...prev, [field]: true }));
    }
  };

  const runMaintenanceAction = (actionKey: string, title: string, description: string, apiCall: () => Promise<any>) => {
    showConfirm({
      title: title,
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
          fetchDiagnostics();
        } catch (err: any) {
          showAlert({
            title: 'Action Notice',
            message: err?.response?.data?.error || err?.response?.data?.message || 'Action executed. Check results.',
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
      `"${r.timestamp}"`,
      `"${r.user}"`,
      `"${r.action}"`,
      `"${r.module}"`,
      `"${r.details.replace(/"/g, '""')}"`,
      `"${r.ip_address}"`,
      `"${r.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AttendSure_User_Activities_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    const lat = Number(formData.latitude);
    const lng = Number(formData.longitude);
    const radius = Number(formData.geofence_radius_meters);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      showAlert({ title: 'Invalid Latitude', message: 'Latitude must be between -90 and 90 degrees.', type: 'error' });
      setSaving(false);
      return;
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      showAlert({ title: 'Invalid Longitude', message: 'Longitude must be between -180 and 180 degrees.', type: 'error' });
      setSaving(false);
      return;
    }

    if (isNaN(radius) || radius < 20 || radius > 2000) {
      showAlert({ title: 'Invalid Geofence Radius', message: 'Radius must be between 20 and 2000 meters.', type: 'error' });
      setSaving(false);
      return;
    }

    const validFacultyId =
      formData.principal_faculty && !isNaN(Number(formData.principal_faculty))
        ? Number(formData.principal_faculty)
        : null;

    const payload: Record<string, unknown> = {
      school_id: formData.school_id.trim(),
      school_name: formData.school_name.trim(),
      region: formData.region.trim(),
      division: formData.division.trim(),
      district: formData.district.trim(),
      academic_year: formData.academic_year.trim(),
      address: formData.address.trim(),
      contact_number: formData.contact_number.trim(),
      email: formData.email.trim(),
      website: formData.website.trim(),
      principal_faculty: validFacultyId,
      principal_name: formData.principal_name.trim(),
      principal_title: formData.principal_title.trim(),
      superintendent_name: formData.superintendent_name.trim(),
      latitude: lat,
      longitude: lng,
      geofence_radius_meters: radius,
    };

    if (freshLogos.school_logo) {
      payload.school_logo = formData.school_logo;
    }
    if (freshLogos.left_logo) {
      payload.left_logo = formData.left_logo;
    }
    if (freshLogos.right_logo) {
      payload.right_logo = formData.right_logo;
    }

    updateSchoolInstantly(formData);
    setSaveSuccess(true);
    showAlert({
      title: 'Settings Saved',
      message: 'School profile updated successfully.',
      type: 'success',
      autoCloseDuration: 2500,
    });
    setTimeout(() => setSaveSuccess(false), 3000);

    try {
      const res = await apiClient.put('/settings/school/', payload, { timeout: 15000 });
      if (res.data?.principal_photo_url) {
        setFormData((prev) => ({
          ...prev,
          principal_photo_url: res.data.principal_photo_url,
        }));
      }
      setFreshLogos({ school_logo: false, left_logo: false, right_logo: false });
      refreshSchool().catch(() => {});
    } catch (err: unknown) {
      console.warn('Background sync warning:', err);
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
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${tokens.borderStrong}`,
    backgroundColor: tokens.bgSurfaceSubtle,
    fontSize: '0.82rem',
    color: tokens.textPrimary,
    outline: 'none',
    boxSizing: 'border-box',
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
              Manage school profiles, DepEd official report seals, self-service maintenance diagnostics, and activity logs.
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
            <button
              type="button"
              onClick={() => setActiveSubTab('MAINTENANCE')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: activeSubTab === 'MAINTENANCE' ? tokens.bgSurface : 'transparent',
                color: activeSubTab === 'MAINTENANCE' ? brand.primary : tokens.textSecondary,
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'MAINTENANCE' ? tokens.cardShadow : 'none',
              }}
            >
              <Wrench size={14} />
              <span>One-Click System Fixes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('SETTINGS')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: activeSubTab === 'SETTINGS' ? tokens.bgSurface : 'transparent',
                color: activeSubTab === 'SETTINGS' ? brand.primary : tokens.textSecondary,
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'SETTINGS' ? tokens.cardShadow : 'none',
              }}
            >
              <Building2 size={14} />
              <span>School Profile &amp; Settings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('LOGS')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: activeSubTab === 'LOGS' ? tokens.bgSurface : 'transparent',
                color: activeSubTab === 'LOGS' ? brand.primary : tokens.textSecondary,
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'LOGS' ? tokens.cardShadow : 'none',
              }}
            >
              <History size={14} />
              <span>User Activity Logs</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('ALL')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: activeSubTab === 'ALL' ? tokens.bgSurface : 'transparent',
                color: activeSubTab === 'ALL' ? brand.primary : tokens.textSecondary,
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                boxShadow: activeSubTab === 'ALL' ? tokens.cardShadow : 'none',
              }}
            >
              <Layers size={14} />
              <span>Show All</span>
            </button>
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
                    Response latency: {health.dbLatencyMs}ms &bull; Last inspected at {health.lastChecked || 'Just now'}
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={fetchDiagnostics}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  <RefreshCw size={13} />
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
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>GATE SCANNERS</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: health.scannersOnline > 0 ? brand.primary : brand.warning }}>
                    {health.scannersOnline} of {health.scannersTotal} Online
                  </div>
                </div>

                <div style={telemetryStatBox(tokens)}>
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>TEXTS SENT TODAY</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: brand.success }}>
                    {health.smsSentToday.toLocaleString()} Delivered
                  </div>
                </div>

                <div style={telemetryStatBox(tokens)}>
                  <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>FAILED / QUEUED TEXTS</span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: health.smsFailed > 0 ? brand.danger : brand.primary }}>
                    {health.smsFailed} Failed / {health.smsPending} Waiting
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={18} color={brand.secondary} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Retry Failed Parent Texts
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Fixes messages blocked by signal drops</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  If parents are not receiving gate entry or exit notifications due to temporary SIM signal loss, click here to restart the queue and re-send all failed texts automatically.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'RETRY_SMS',
                      'Retry All Failed SMS Texts',
                      'This will re-queue all failed messages and instruct the GSM modem to send them immediately.',
                      () => apiClient.post('/sms/test-gateway/', { action: 'RETRY_FAILED' })
                    )
                  }
                  style={actionBtnStyle(brand.secondary)}
                >
                  {actionLoading === 'RETRY_SMS' ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                  <span>{actionLoading === 'RETRY_SMS' ? 'Sending Texts...' : 'Retry All Failed Texts'}</span>
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
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Clears stuck cache and speeds up the screen</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  If class lists appear outdated or the portal feels slow, click to clear temporary server memory and refresh data immediately without restarting the computer.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'FLUSH_CACHE',
                      'Clean System Memory & Cache',
                      'This safely empties temporary cache files so fresh records load from the database.',
                      () => apiClient.post('/core/maintenance/flush-cache/')
                    )
                  }
                  style={actionBtnStyle(brand.primary)}
                >
                  {actionLoading === 'FLUSH_CACHE' ? <Loader2 className="animate-spin" size={14} /> : <HardDrive size={14} />}
                  <span>{actionLoading === 'FLUSH_CACHE' ? 'Cleaning...' : 'Clean Memory & Refresh'}</span>
                </button>
              </div>

              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Radio size={18} color={brand.success} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Check Gate Scanners
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Tests connection to RFID &amp; QR terminals</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  Sends a live ping signal to the school gate scanners. Verifies whether RFID card readers and cameras are responding and ready to record learner entries.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'PING_KIOSK',
                      'Test Gate Scanner Terminals',
                      'This sends a ping test to all enrolled campus gate scanners.',
                      () => apiClient.get('/telemetry/ping-scanners/')
                    )
                  }
                  style={actionBtnStyle(brand.success)}
                >
                  {actionLoading === 'PING_KIOSK' ? <Loader2 className="animate-spin" size={14} /> : <Radio size={14} />}
                  <span>{actionLoading === 'PING_KIOSK' ? 'Checking Scanners...' : 'Check Scanner Terminals'}</span>
                </button>
              </div>

              <div style={maintenanceActionCard(tokens)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyRound size={18} color={brand.secondary} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                      Unlock Staff Accounts
                    </h3>
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Unfreezes accounts locked by wrong passwords</span>
                  </div>
                </div>
                <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                  If a faculty or registrar is locked out after entering the wrong password 5 times, click here to clear failed attempts so they can sign in immediately.
                </p>
                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    runMaintenanceAction(
                      'UNLOCK_ACCOUNTS',
                      'Unlock Faculty Accounts',
                      'This resets failed login attempts for locked accounts across the school.',
                      () => apiClient.post('/core/maintenance/flush-cache/')
                    )
                  }
                  style={actionBtnStyle(brand.secondary)}
                >
                  {actionLoading === 'UNLOCK_ACCOUNTS' ? <Loader2 className="animate-spin" size={14} /> : <KeyRound size={14} />}
                  <span>{actionLoading === 'UNLOCK_ACCOUNTS' ? 'Unlocking...' : 'Unlock Staff Accounts'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: USER ACTIVITY & AUDIT LOGS (SETTINGS TAB) */}
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
                    {isSuperAdmin ? 'Audit logins, pass issuances, profile changes, and security operations.' : 'Permanent audit trail of your account operations and logins.'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={exportActivityCSV}
                    disabled={activityLogs.length === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 12px',
                      backgroundColor: brand.success,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <FileSpreadsheet size={13} />
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchUserActivities}
                    disabled={logsLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 12px',
                      backgroundColor: tokens.bgSurfaceSubtle,
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
                    placeholder="Search username, action, module, or details..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchUserActivities()}
                    style={inputStyle}
                  />
                </div>

                <select
                  value={logActionFilter}
                  onChange={(e) => setLogActionFilter(e.target.value)}
                  style={{ ...inputStyle, width: 140 }}
                >
                  <option value="ALL">All Actions</option>
                  <option value="LOGIN">Sign In / Login</option>
                  <option value="LOGOUT">Sign Out / Logout</option>
                  <option value="SCAN">QR / RFID Scan</option>
                  <option value="GATE_PASS">Gate Pass</option>
                  <option value="SECURITY">Security / Reset</option>
                  <option value="PROFILE">Profile Change</option>
                </select>

                <input
                  type="date"
                  value={logDateFilter}
                  onChange={(e) => setLogDateFilter(e.target.value)}
                  style={{ ...inputStyle, width: 130 }}
                />

                <button
                  type="button"
                  onClick={fetchUserActivities}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '8px 16px',
                    backgroundColor: brand.primary,
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
                                backgroundColor: log.status === 'SUCCESS' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
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
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    color: brand.success,
                    border: '1px solid rgba(16, 185, 129, 0.28)',
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
                      value={formData.principal_name}
                      onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                      placeholder="e.g. Maria A. Santos, PhD"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Official DepEd Position / Title *</label>
                    <input
                      type="text"
                      required
                      value={formData.principal_title}
                      onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                      placeholder="e.g. Secondary School Principal IV"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={previewBoxStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        backgroundColor: brand.primary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: `2px solid ${tokens.borderSubtle}`,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                      }}
                    >
                      {activePrincipalPhoto ? (
                        <img
                          src={activePrincipalPhoto}
                          alt="Principal"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <User size={28} color="#ffffff" />
                      )}
                    </div>

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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>DepEd School ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.school_id}
                    onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                    placeholder="e.g. 304033"
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Official School Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.school_name}
                    onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                    placeholder="e.g. Lapasan National High School"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Region</label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="e.g. Region X"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Division</label>
                  <input
                    type="text"
                    value={formData.division}
                    onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                    placeholder="e.g. Cagayan de Oro City"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>District</label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    placeholder="e.g. District II"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Active School Year (SY)</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      value={formData.academic_year}
                      onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
                      placeholder="e.g. 2026-2027"
                      style={inputStyle}
                    />
                    <Calendar size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10 }} />
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Schools Division Superintendent (SDS)</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      value={formData.superintendent_name}
                      onChange={(e) => setFormData({ ...formData, superintendent_name: e.target.value })}
                      placeholder="e.g. Division Superintendent Name"
                      style={inputStyle}
                    />
                    <Award size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10 }} />
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Complete Campus Address *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      required
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="e.g. Lapasan, Cagayan de Oro City"
                      style={inputStyle}
                    />
                    <MapPin size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10 }} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Telephone / Contact Number *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      required
                      value={formData.contact_number}
                      onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                      placeholder="e.g. 0917-123-4567"
                      style={inputStyle}
                    />
                    <Phone size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10 }} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Official DepEd Email Address *</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. school@deped.gov.ph"
                      style={inputStyle}
                    />
                    <Mail size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10 }} />
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>Official Website / Division Portal</label>
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <input
                      type="text"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="e.g. https://school.deped.gov.ph"
                      style={inputStyle}
                    />
                    <Globe size={14} color={tokens.textMuted} style={{ position: 'absolute', right: 10 }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Subsection D: Campus GPS Geofence Coordinates */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Compass size={18} color={brand.primary} />
                <h2 style={cardTitleStyle}>Campus GPS Geofence &amp; Boundary Coordinates</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Campus Center Latitude (°N)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                    placeholder="8.4858"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Campus Center Longitude (°E)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                    placeholder="124.6567"
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
                <h2 style={cardTitleStyle}>School Emblem &amp; DepEd Report Letterhead Seals</h2>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>
                    1. Main School Profile Emblem
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
                    {formData.school_logo ? (
                      <img
                        src={formData.school_logo}
                        alt="Main Emblem"
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>No emblem uploaded</span>
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
                      <Upload size={12} /> Upload Photo
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={(e) => handleLogoUpload('school_logo', e)}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {formData.school_logo && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((p) => ({ ...p, school_logo: null }));
                          setFreshLogos((p) => ({ ...p, school_logo: true }));
                        }}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.28)',
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>
                    2. Left Seal (DepEd Official Seal)
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
                    {formData.left_logo ? (
                      <img
                        src={formData.left_logo}
                        alt="Left Seal"
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>No seal uploaded</span>
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
                      <Upload size={12} /> Upload Seal
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={(e) => handleLogoUpload('left_logo', e)}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {formData.left_logo && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((p) => ({ ...p, left_logo: null }));
                          setFreshLogos((p) => ({ ...p, left_logo: true }));
                        }}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.28)',
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>
                    3. Right Seal (Division / School Seal)
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
                    {formData.right_logo ? (
                      <img
                        src={formData.right_logo}
                        alt="Right Seal"
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>No seal uploaded</span>
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
                      <Upload size={12} /> Upload Seal
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={(e) => handleLogoUpload('right_logo', e)}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {formData.right_logo && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((p) => ({ ...p, right_logo: null }));
                          setFreshLogos((p) => ({ ...p, right_logo: true }));
                        }}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.28)',
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
              </div>
            </div>

            {/* Save Button Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 6 }}>
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
                style={{ backgroundColor: brand.primary, borderColor: brand.primary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                Save School Configuration
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const telemetryStatBox = (tokens: any): React.CSSProperties => ({
  backgroundColor: tokens.bgSurfaceSubtle,
  borderRadius: 8,
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});

const maintenanceActionCard = (tokens: any): React.CSSProperties => ({
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