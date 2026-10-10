/**
 * AttendSure V3 - SMS Gateway & Outbox Dispatcher
 * File: frontend/src/components/tabs/SmsTab.tsx
 *
 * Core Supported Channels:
 * 1. GATE TAPPING: Instant parent SMS notification on every gate IN/OUT scan.
 * 2. CLASSROOM ATTENDANCE (2 Policy Modes):
 *    - Mode A (Instant): Sends SMS to parent on every classroom scan.
 *    - Mode B (Gate-OUT Summary): Compiles all subject attendance and sends 1 summary SMS when learner scans OUT at the gate.
 * 3. SCHOOL ANNOUNCEMENTS (Targeted Groupings):
 *    - All Parents, All Faculty, Both Parents & Faculty, By Year Level, By Class Section, Specific Parent, or Specific Faculty.
 * 4. TWO-FACTOR AUTHENTICATION (2FA):
 *    - High-priority security OTP dispatches for system logins.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import {
  Send,
  RotateCw,
  Clock,
  AlertTriangle,
  Radio,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Loader2,
  Smartphone,
  UserCheck,
  Pencil,
  Trash2,
  Plus,
  Eraser,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  DoorOpen,
  GraduationCap,
  Megaphone,
  Bell,
  Sparkles,
  Layers,
  Zap,
  Sliders,
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type SmsCategory =
  | 'GATE_TAP'
  | 'CLASS_ATTENDANCE'
  | 'ANNOUNCEMENT'
  | 'OTP_2FA'
  | 'GENERAL_NOTICE';

export type ClassroomSmsMode = 'INSTANT' | 'GATE_OUT_SUMMARY';

export type AnnouncementAudience =
  | 'ALL_PARENTS'
  | 'ALL_FACULTY'
  | 'BOTH_PARENTS_AND_FACULTY'
  | 'BY_YEAR_LEVEL'
  | 'BY_SECTION'
  | 'SPECIFIC_PARENT'
  | 'SPECIFIC_FACULTY';

interface SmsRecord {
  id: number;
  recipient_name: string;
  recipient_number: string;
  message_body: string;
  trigger_event: string;
  category: SmsCategory | string;
  priority: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  retry_count: number;
  error_message: string | null;
  formatted_created_at: string;
  formatted_sent_at: string;
}

interface DynamicStudent {
  id: number;
  full_name: string;
  lrn: string;
  guardian_name: string;
  guardian_phone: string;
  grade_level?: string;
  section_id?: number | string;
  section_name?: string;
}

interface DynamicFaculty {
  id: number;
  full_name: string;
  employee_id: string;
  phone_number?: string;
  department?: string;
}

interface SectionOption {
  id: number;
  name: string;
  grade_level: string;
}

interface SmsMetrics {
  total_today: number;
  pending: number;
  sent_today: number;
  failed: number;
  modem_port: string;
  modem_baudrate: number;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

const SMS_TEMPLATES: Record<SmsCategory, { label: string; text: string }> = {
  GATE_TAP: {
    label: 'Gate Tap (Entry/Exit)',
    text: '[AttendSure] Good day! Your child {NAME} has successfully tapped {DIRECTION} at the school main gate at {TIME}.',
  },
  CLASS_ATTENDANCE: {
    label: 'Classroom Attendance',
    text: '[AttendSure] Classroom Notice: {NAME} was recorded {STATUS} for subject {SUBJECT} at {TIME}.',
  },
  ANNOUNCEMENT: {
    label: 'School Announcement',
    text: '[LNHS Advisory] To our school community: Classes and activities will be {DETAILS}. Please be guided accordingly.',
  },
  OTP_2FA: {
    label: '2FA Login Security OTP',
    text: '[AttendSure Security] Your Two-Factor Verification Code is: {OTP}. Valid for 5 minutes. Do not disclose this code to anyone.',
  },
  GENERAL_NOTICE: {
    label: 'General Notice / Memo',
    text: '[LNHS Notice] Dear Parent/Guardian of {NAME}: Please be informed of the school schedule update on {DATE}.',
  },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SmsTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();

  // --- Table Data States ---
  const [messages, setMessages] = useState<SmsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // --- Classroom Dispatch Policy Setting ---
  const [classroomSmsMode, setClassroomSmsMode] = useState<ClassroomSmsMode>('GATE_OUT_SUMMARY');
  const [savingPolicy, setSavingPolicy] = useState(false);

  // --- Live Metrics State ---
  const [metrics, setMetrics] = useState<SmsMetrics>({
    total_today: 0,
    pending: 0,
    sent_today: 0,
    failed: 0,
    modem_port: 'COM3',
    modem_baudrate: 9600,
  });

  // --- Pagination States ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // --- Directories Cache ---
  const [students, setStudents] = useState<DynamicStudent[]>([]);
  const [facultyList, setFacultyList] = useState<DynamicFaculty[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);

  // --- Modals Visibility ---
  const [isComposeModalOpen, setIsComposeModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [editingSms, setEditingSms] = useState<SmsRecord | null>(null);
  const [inspectedSms, setInspectedSms] = useState<SmsRecord | null>(null);

  // --- Processing States ---
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // --- Individual Compose Form ---
  const [composeForm, setComposeForm] = useState({
    recipient_name: '',
    recipient_number: '',
    message_body: '',
    category: 'GATE_TAP' as SmsCategory,
    priority: 'HIGH',
  });
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  // --- Broadcast Announcement Form ---
  const [broadcastForm, setBroadcastForm] = useState({
    audience: 'ALL_PARENTS' as AnnouncementAudience,
    message_body: '',
    priority: 'HIGH',
    year_level: '',
    section_id: '',
    specific_target_id: '',
  });

  const isInteracting = useRef(false);
  isInteracting.current =
    isComposeModalOpen || isBroadcastModalOpen || Boolean(editingSms) || Boolean(inspectedSms);

  const availableYearLevels = useMemo(() => {
    const list = new Set<string>();
    sections.forEach((s) => {
      if (s.grade_level) list.add(s.grade_level.trim());
    });
    students.forEach((s) => {
      if (s.grade_level) list.add(s.grade_level.trim());
    });

    if (list.size === 0) {
      return ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
    }

    return Array.from(list).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  }, [sections, students]);

  // ============================================================================
  // HELPERS & SANITIZATION
  // ============================================================================

  const sanitizePhoneNumber = (phone: string): string => {
    let clean = phone.replace(/[^\d+]/g, '').trim();
    if (clean.startsWith('+63')) clean = '0' + clean.slice(3);
    else if (clean.startsWith('63') && clean.length === 12) clean = '0' + clean.slice(2);
    return clean;
  };

  const handleCopy = async (text: string, id: string) => {
    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        success = false;
      }
    }
    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        textArea.remove();
      } catch (err) {
        console.error('Copy fallback error:', err);
      }
    }
    if (success) {
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const getStatusBadge = (statusVal: string) => {
    switch (statusVal) {
      case 'SENT':
        return { label: 'DELIVERED', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' };
      case 'PENDING':
        return { label: 'IN QUEUE', bg: '#eff6ff', color: '#0284c7', border: '#bfdbfe' };
      case 'FAILED':
        return { label: 'FAILED', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
      default:
        return { label: statusVal, bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' };
    }
  };

  const getCategoryBadge = (categoryVal: string) => {
    switch (categoryVal) {
      case 'GATE_TAP':
      case 'GATE_IN':
      case 'GATE_OUT':
        return {
          label: 'Gate Tap',
          icon: <DoorOpen size={12} />,
          bg: '#f0fdf4',
          color: '#16a34a',
          border: '#bbf7d0',
        };
      case 'CLASS_ATTENDANCE':
      case 'CLASS_ABSENT':
        return {
          label: 'Class Attendance',
          icon: <GraduationCap size={12} />,
          bg: '#eff6ff',
          color: '#0284c7',
          border: '#bae6fd',
        };
      case 'ANNOUNCEMENT':
      case 'EMERGENCY':
        return {
          label: 'Announcement',
          icon: <Megaphone size={12} />,
          bg: '#fff7ed',
          color: '#ea580c',
          border: '#fed7aa',
        };
      case 'OTP_2FA':
        return {
          label: '2FA OTP',
          icon: <ShieldCheck size={12} />,
          bg: '#fdf2f8',
          color: '#db2777',
          border: '#fbcfe8',
        };
      default:
        return {
          label: 'General Notice',
          icon: <Bell size={12} />,
          bg: '#f8fafc',
          color: '#475569',
          border: '#cbd5e1',
        };
    }
  };

  // ============================================================================
  // DATA FETCHING & LIVE POLLING PIPELINE
  // ============================================================================

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await apiClient.get<SmsMetrics>('/sms-outbox/metrics/');
      setMetrics(res.data);
    } catch (err) {
      console.warn('[SmsTab] Metrics fetch error:', err);
    }
  }, []);

  const fetchMessages = useCallback(
    async (page = 1, size = 25, query = '', statusVal = '', catVal = 'ALL', silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);
        const res = await apiClient.get<PaginatedResponse<SmsRecord> | SmsRecord[]>('/sms-outbox/', {
          params: {
            page,
            page_size: size,
            search: query.trim() || undefined,
            status: statusVal || undefined,
            category: catVal !== 'ALL' ? catVal : undefined,
          },
        });

        if (res.data && 'results' in res.data) {
          setMessages(res.data.results);
          setTotalCount(res.data.count);
          setTotalPages(res.data.total_pages || Math.ceil(res.data.count / size) || 1);
          setCurrentPage(res.data.current_page || page);
        } else if (Array.isArray(res.data)) {
          setMessages(res.data);
          setTotalCount(res.data.length);
          setTotalPages(1);
          setCurrentPage(1);
        }
      } catch (err: any) {
        if (!silent) {
          setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to load SMS outbox logs.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  const loadDirectories = async () => {
    try {
      const [stuRes, facRes, secRes, settingsRes] = await Promise.allSettled([
        apiClient.get('/students/?page_size=100'),
        apiClient.get('/facultys/'),
        apiClient.get('/sections/'),
        apiClient.get('/settings/school/'),
      ]);

      if (stuRes.status === 'fulfilled') {
        const raw = Array.isArray(stuRes.value.data) ? stuRes.value.data : stuRes.value.data?.results || [];
        setStudents(
          raw.map((s: any) => ({
            id: s.id,
            full_name: `${s.first_name} ${s.last_name}`.trim(),
            lrn: s.lrn,
            guardian_name: s.guardian_name || 'Parent/Guardian',
            guardian_phone: s.guardian_phone || s.emergency_contact || s.parent_contact || '',
            grade_level: s.grade_level,
            section_id: s.section,
            section_name: s.section_name,
          }))
        );
      }

      if (facRes.status === 'fulfilled') {
        const raw = Array.isArray(facRes.value.data) ? facRes.value.data : facRes.value.data?.results || [];
        setFacultyList(
          raw.map((f: any) => ({
            id: f.id,
            full_name: `${f.first_name} ${f.last_name}`.trim(),
            employee_id: f.employee_id,
            phone_number: f.phone_number || f.contact_number || '',
            department: f.department || f.position || '',
          }))
        );
      }

      if (secRes.status === 'fulfilled') {
        const raw = Array.isArray(secRes.value.data) ? secRes.value.data : secRes.value.data?.results || [];
        setSections(
          raw.map((s: any) => ({
            id: s.id,
            name: s.name,
            grade_level: s.grade_level,
          }))
        );
      }

      if (settingsRes.status === 'fulfilled' && settingsRes.value.data?.classroom_sms_mode) {
        setClassroomSmsMode(settingsRes.value.data.classroom_sms_mode);
      }
    } catch (err) {
      console.warn('[SmsTab] Directory caching error:', err);
    }
  };

  useEffect(() => {
    loadDirectories();
  }, []);

  useEffect(() => {
    fetchMetrics();
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchMessages(1, pageSize, search, statusFilter, categoryFilter, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, categoryFilter, pageSize, fetchMessages, fetchMetrics]);

  useEffect(() => {
    const liveHeartbeat = setInterval(() => {
      if (!isInteracting.current) {
        fetchMetrics();
        fetchMessages(currentPage, pageSize, search, statusFilter, categoryFilter, true);
      }
    }, 3000);

    return () => clearInterval(liveHeartbeat);
  }, [currentPage, pageSize, search, statusFilter, categoryFilter, fetchMetrics, fetchMessages]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchMessages(newPage, pageSize, search, statusFilter, categoryFilter, false);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchMessages(1, newSize, search, statusFilter, categoryFilter, false);
  };

  // ============================================================================
  // DISPATCH POLICY SWITCHER (CLASSROOM ATTENDANCE)
  // ============================================================================

  const handleSaveClassroomPolicy = async (newMode: ClassroomSmsMode) => {
    setClassroomSmsMode(newMode);
    setSavingPolicy(true);
    try {
      await apiClient.patch('/settings/school/', {
        classroom_sms_mode: newMode,
      });
      showAlert({
        title: 'SMS Policy Updated',
        message:
          newMode === 'GATE_OUT_SUMMARY'
            ? 'Parents will receive 1 consolidated summary SMS when learner scans OUT at the gate.'
            : 'Parents will receive immediate real-time SMS notifications on every classroom scan.',
        type: 'success',
      });
    } catch {
      showAlert({
        title: 'Policy Active (Local)',
        message: `Classroom notification set to ${newMode === 'GATE_OUT_SUMMARY' ? 'Gate-OUT Daily Summary' : 'Instant Per-Tap'}.`,
        type: 'info',
      });
    } finally {
      setSavingPolicy(false);
    }
  };

  // ============================================================================
  // BROADCAST ANNOUNCEMENT DISPATCHER
  // ============================================================================

  const handleOpenBroadcast = () => {
    setBroadcastForm({
      audience: 'ALL_PARENTS',
      message_body: SMS_TEMPLATES.ANNOUNCEMENT.text,
      priority: 'HIGH',
      year_level: '',
      section_id: '',
      specific_target_id: '',
    });
    setIsBroadcastModalOpen(true);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.message_body.trim()) {
      showAlert({
        title: 'Validation Error',
        message: 'Please provide announcement message text.',
        type: 'error',
      });
      return;
    }

    if (broadcastForm.audience === 'BY_YEAR_LEVEL' && !broadcastForm.year_level) {
      showAlert({
        title: 'Validation Error',
        message: 'Please select a Year / Grade Level for broadcast.',
        type: 'error',
      });
      return;
    }

    if (broadcastForm.audience === 'BY_SECTION' && !broadcastForm.section_id) {
      showAlert({
        title: 'Validation Error',
        message: 'Please select a Class Section for broadcast.',
        type: 'error',
      });
      return;
    }

    if (
      (broadcastForm.audience === 'SPECIFIC_PARENT' || broadcastForm.audience === 'SPECIFIC_FACULTY') &&
      !broadcastForm.specific_target_id
    ) {
      showAlert({
        title: 'Validation Error',
        message: 'Please select a specific recipient for broadcast.',
        type: 'error',
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiClient.post('/sms-outbox/broadcast/', {
        audience: broadcastForm.audience,
        message_body: broadcastForm.message_body.trim(),
        priority: broadcastForm.priority,
        year_level: broadcastForm.year_level || undefined,
        section_id: broadcastForm.section_id || undefined,
        target_id: broadcastForm.specific_target_id || undefined,
      });

      setIsBroadcastModalOpen(false);
      fetchMessages(1, pageSize, search, statusFilter, categoryFilter, true);
      fetchMetrics();

      showAlert({
        title: 'Announcement Queued',
        message: res.data?.message || 'Broadcast successfully queued for dispatch.',
        type: 'success',
      });
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.response?.data?.message_body?.[0] ||
        'Could not queue broadcast messages.';
      showAlert({
        title: 'Broadcast Error',
        message: errorMsg,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================================
  // INDIVIDUAL NOTIFICATION CRUD
  // ============================================================================

  const handleOpenCompose = () => {
    setSelectedStudentId('');
    setComposeForm({
      recipient_name: '',
      recipient_number: '',
      message_body: SMS_TEMPLATES.GATE_TAP.text,
      category: 'GATE_TAP',
      priority: 'HIGH',
    });
    setIsComposeModalOpen(true);
  };

  const handleCategorySelectInCompose = (cat: SmsCategory) => {
    setComposeForm((prev) => ({
      ...prev,
      category: cat,
      message_body: SMS_TEMPLATES[cat]?.text || prev.message_body,
    }));
  };

  const handleSelectStudent = (idStr: string) => {
    setSelectedStudentId(idStr);
    const matched = students.find((s) => String(s.id) === idStr);
    if (matched) {
      setComposeForm((prev) => {
        const template = SMS_TEMPLATES[prev.category]?.text || prev.message_body;
        const personalized = template.replace('{NAME}', matched.full_name);
        return {
          ...prev,
          recipient_name: matched.guardian_name,
          recipient_number: sanitizePhoneNumber(matched.guardian_phone),
          message_body: personalized,
        };
      });
    }
  };

  const handleCreateSms = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNumber = sanitizePhoneNumber(composeForm.recipient_number);
    if (!cleanNumber || !composeForm.message_body.trim()) {
      showAlert({
        title: 'Validation Error',
        message: 'A valid recipient mobile number and message text are required.',
        type: 'error',
      });
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.post('/sms-outbox/', {
        recipient_name: composeForm.recipient_name.trim() || 'Parent / Guardian',
        recipient_number: cleanNumber,
        message_body: composeForm.message_body.trim(),
        trigger_event: 'MANUAL',
        category: composeForm.category,
        priority: composeForm.priority,
        status: 'PENDING',
      });

      setIsComposeModalOpen(false);
      fetchMessages(1, pageSize, search, statusFilter, categoryFilter, true);
      fetchMetrics();

      showAlert({
        title: 'SMS Queued',
        message: `Notification queued for ${cleanNumber} (${composeForm.category}).`,
        type: 'info',
      });
    } catch (err: any) {
      const errorDetail =
        err?.response?.data?.recipient_number?.[0] ||
        err?.response?.data?.message_body?.[0] ||
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Could not queue message.';
      showAlert({
        title: 'Queue Failed',
        message: errorDetail,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (sms: SmsRecord) => {
    setEditingSms({ ...sms });
  };

  const handleUpdateSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSms) return;

    const cleanNumber = sanitizePhoneNumber(editingSms.recipient_number);

    try {
      setSubmitting(true);
      await apiClient.patch(`/sms-outbox/${editingSms.id}/`, {
        recipient_name: editingSms.recipient_name,
        recipient_number: cleanNumber,
        message_body: editingSms.message_body,
        category: editingSms.category,
        priority: editingSms.priority,
        status: editingSms.status,
      });

      setEditingSms(null);
      fetchMessages(currentPage, pageSize, search, statusFilter, categoryFilter, true);
      fetchMetrics();

      showAlert({
        title: 'Message Updated',
        message: `Outbox entry #${editingSms.id} saved successfully.`,
        type: 'info',
      });
    } catch (err: any) {
      showAlert({
        title: 'Update Error',
        message: err?.response?.data?.error || 'Could not update record.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const promptDeleteSms = (id: number) => {
    showConfirm({
      title: 'Delete Outbox Entry',
      message: `Permanently delete SMS message #${id}? This action cannot be undone.`,
      confirmLabel: 'Delete Entry',
      isDestructive: true,
      onConfirm: async () => {
        try {
          setActionLoadingId(id);
          await apiClient.delete(`/sms-outbox/${id}/`);
          if (inspectedSms?.id === id) setInspectedSms(null);
          if (editingSms?.id === id) setEditingSms(null);
          fetchMessages(currentPage, pageSize, search, statusFilter, categoryFilter, true);
          fetchMetrics();
          showAlert({
            title: 'Entry Deleted',
            message: `Outbox record #${id} removed from database.`,
            type: 'info',
          });
        } catch (err: any) {
          showAlert({
            title: 'Delete Failed',
            message: err?.response?.data?.error || 'Could not delete entry.',
            type: 'error',
          });
        } finally {
          setActionLoadingId(null);
        }
      },
    });
  };

  const promptPurgeDelivered = () => {
    showConfirm({
      title: 'Delete Delivered Messages',
      message: 'Clear all delivered (SENT) messages from database history to optimize log storage?',
      confirmLabel: 'Delete Delivered',
      isDestructive: true,
      onConfirm: async () => {
        try {
          setSubmitting(true);
          await apiClient.delete('/sms-outbox/delete-delivered/');
          fetchMessages(1, pageSize, search, statusFilter, categoryFilter, true);
          fetchMetrics();
          showAlert({
            title: 'Logs Deleted',
            message: 'All delivered notification logs have been cleared.',
            type: 'info',
          });
        } catch (err: any) {
          showAlert({
            title: 'Delete Failed',
            message: err?.response?.data?.error || 'Could not delete logs.',
            type: 'error',
          });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const handleRetrySingle = async (sms: SmsRecord) => {
    try {
      setActionLoadingId(sms.id);
      await apiClient.post(`/sms-outbox/${sms.id}/retry/`);
      fetchMessages(currentPage, pageSize, search, statusFilter, categoryFilter, true);
      fetchMetrics();
      if (inspectedSms?.id === sms.id) {
        setInspectedSms((prev) => (prev ? { ...prev, status: 'PENDING' } : null));
      }
      showAlert({
        title: 'Message Queued',
        message: `Message #${sms.id} re-queued for immediate dispatch.`,
        type: 'info',
      });
    } catch (err: any) {
      showAlert({
        title: 'Retry Failed',
        message: err?.response?.data?.error || 'Could not re-queue message.',
        type: 'error',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const promptRetryAllFailed = () => {
    showConfirm({
      title: 'Retry All Failed Messages',
      message: 'Re-queue all failed SMS notifications for immediate modem resend?',
      confirmLabel: 'Queue All',
      isDestructive: false,
      onConfirm: async () => {
        try {
          setSubmitting(true);
          await apiClient.post('/sms-outbox/retry-all-failed/');
          fetchMessages(currentPage, pageSize, search, statusFilter, categoryFilter, true);
          fetchMetrics();
          showAlert({
            title: 'Messages Re-queued',
            message: 'All failed messages are queued for immediate resend.',
            type: 'info',
          });
        } catch (err: any) {
          showAlert({
            title: 'Retry Failed',
            message: err?.response?.data?.error || 'Could not re-queue messages.',
            type: 'error',
          });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  // ============================================================================
  // RENDER UI
  // ============================================================================

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Live SMS Metrics Overview */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>SENT TODAY</span>
            <Check size={18} color="#059669" />
          </div>
          <div style={{ ...statVal, color: '#059669' }}>{metrics.sent_today}</div>
          <div style={statSub}>Gate scans, attendance &amp; 2FA OTPs</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>PENDING QUEUE</span>
            <Clock size={18} color="#0284c7" />
          </div>
          <div style={{ ...statVal, color: '#0284c7' }}>{metrics.pending}</div>
          <div style={statSub}>Awaiting GSM modem transmission</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>FAILED DISPATCHES</span>
            <AlertTriangle size={18} color={metrics.failed > 0 ? '#dc2626' : '#64748b'} />
          </div>
          <div style={{ ...statVal, color: metrics.failed > 0 ? '#dc2626' : '#64748b' }}>{metrics.failed}</div>
          <div style={statSub}>Network, SIM load, or invalid mobile format</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>GSM MODEM PORT</span>
            <Radio size={18} color="#0284c7" />
          </div>
          <div style={{ ...statVal, fontSize: '1.25rem', fontFamily: 'monospace', color: '#0f172a' }}>
            {metrics.modem_port || 'COM3'}
          </div>
          <div style={statSub}>Baudrate: {metrics.modem_baudrate || 9600} bps &bull; Online</div>
        </div>
      </div>

      {/* 2. Classroom Attendance Policy Banner */}
      <div style={policyBannerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={policyIconBox}>
            <Sliders size={20} color="#0284c7" />
          </div>
          <div>
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
              Classroom Attendance SMS Dispatch Policy
            </div>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
              Choose whether subject attendance notifications are sent immediately on every classroom tap, or compiled into a single end-of-day summary when the child scans OUT at the gate.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            disabled={savingPolicy}
            onClick={() => handleSaveClassroomPolicy('GATE_OUT_SUMMARY')}
            style={{
              ...policyBtnStyle,
              borderColor: classroomSmsMode === 'GATE_OUT_SUMMARY' ? '#0284c7' : '#cbd5e1',
              backgroundColor: classroomSmsMode === 'GATE_OUT_SUMMARY' ? '#eff6ff' : '#ffffff',
              color: classroomSmsMode === 'GATE_OUT_SUMMARY' ? '#0284c7' : '#475569',
            }}
          >
            <Layers size={14} />
            <span>Gate-OUT Daily Summary (Default)</span>
          </button>

          <button
            type="button"
            disabled={savingPolicy}
            onClick={() => handleSaveClassroomPolicy('INSTANT')}
            style={{
              ...policyBtnStyle,
              borderColor: classroomSmsMode === 'INSTANT' ? '#0284c7' : '#cbd5e1',
              backgroundColor: classroomSmsMode === 'INSTANT' ? '#eff6ff' : '#ffffff',
              color: classroomSmsMode === 'INSTANT' ? '#0284c7' : '#475569',
            }}
          >
            <Zap size={14} />
            <span>Instant Per-Tap</span>
          </button>
        </div>
      </div>

      {/* 3. Control Bar, Category Filters & Actions */}
      <div style={controlBar}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            style={{ ...filterPill, ...(statusFilter === '' ? filterPillActive : {}) }}
          >
            All Logs
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING')}
            style={{ ...filterPill, ...(statusFilter === 'PENDING' ? filterPillActive : {}) }}
          >
            In Queue ({metrics.pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SENT')}
            style={{ ...filterPill, ...(statusFilter === 'SENT' ? filterPillActive : {}) }}
          >
            Delivered
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('FAILED')}
            style={{ ...filterPill, ...(statusFilter === 'FAILED' ? filterPillActive : {}) }}
          >
            Failed ({metrics.failed})
          </button>

          <div style={{ height: 18, width: 1, backgroundColor: '#cbd5e1', margin: '0 4px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700 }}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={categorySelectStyle}
            >
              <option value="ALL">All Categories</option>
              <option value="GATE_TAP">Gate Attendance Taps</option>
              <option value="CLASS_ATTENDANCE">Classroom Attendance</option>
              <option value="ANNOUNCEMENT">School Announcements</option>
              <option value="OTP_2FA">2FA Login Security OTP</option>
              <option value="GENERAL_NOTICE">General School Memos</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={() => {
              fetchMetrics();
              fetchMessages(currentPage, pageSize, search, statusFilter, categoryFilter, false);
            }}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          {messages.some((m) => m.status === 'SENT') && (
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={promptPurgeDelivered}
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Clear delivered messages to optimize log storage"
            >
              <Eraser size={14} />
              Delete Delivered
            </Button>
          )}

          {metrics.failed > 0 && (
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={promptRetryAllFailed}
              disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', borderColor: '#fecaca' }}
            >
              <RotateCw size={14} />
              Retry All Failed
            </Button>
          )}

          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={handleOpenBroadcast}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0284c7', borderColor: '#bae6fd' }}
          >
            <Megaphone size={15} />
            Broadcast Announcement
          </Button>

          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={handleOpenCompose}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} />
            Compose SMS
          </Button>
        </div>
      </div>

      {/* 4. Main SMS Logs Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="SMS Gateway & Outbox Dispatcher"
          subtitle="Real-time log of automated school notifications: gate taps, classroom attendance, announcements, and 2FA OTPs."
          searchPlaceholder="Search phone number, student name, or message text..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          error={error}
          data={messages}
          keyExtractor={(m) => m.id}
          columns={[
            {
              header: 'Recipient',
              render: (m) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={phoneIconBox}>
                    <Smartphone size={16} color="#0284c7" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                      {m.recipient_name || 'Parent / Guardian'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>
                        {m.recipient_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(m.recipient_number, `num-${m.id}`)}
                        title="Copy Number"
                        style={copyMiniBtn}
                      >
                        {copiedKey === `num-${m.id}` ? <Check size={11} color="#059669" /> : <Copy size={11} color="#94a3b8" />}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Category & Channel',
              render: (m) => {
                const cat = getCategoryBadge(String(m.category || m.trigger_event));
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.70rem',
                      fontWeight: 700,
                      backgroundColor: cat.bg,
                      color: cat.color,
                      borderWidth: 1,
                      borderStyle: 'solid',
                      borderColor: cat.border,
                    }}
                  >
                    {cat.icon}
                    {cat.label}
                  </span>
                );
              },
            },
            {
              header: 'Message Content',
              render: (m) => (
                <div style={{ maxWidth: 360 }}>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#1e293b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={m.message_body}
                  >
                    {m.message_body}
                  </div>
                </div>
              ),
            },
            {
              header: 'Delivery Status',
              render: (m) => {
                const badge = getStatusBadge(m.status);
                return (
                  <div>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        backgroundColor: badge.bg,
                        color: badge.color,
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: badge.border,
                      }}
                    >
                      {badge.label}
                    </span>
                    {m.error_message && (
                      <div style={{ fontSize: '0.68rem', color: '#dc2626', marginTop: 3, maxWidth: 200 }} title={m.error_message}>
                        {m.error_message.slice(0, 35)}...
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              header: 'Timestamp',
              render: (m) => (
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                    {m.formatted_created_at}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 2 }}>
                    Sent: {m.formatted_sent_at}
                  </div>
                </div>
              ),
            },
            {
              header: 'Actions',
              align: 'right',
              render: (m) => (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setInspectedSms(m)}
                    title="View Message Details"
                    style={actionBtn}
                  >
                    <Eye size={13} color="#475569" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(m)}
                    title="Edit Message / Recipient"
                    style={{ ...actionBtn, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
                  >
                    <Pencil size={13} color="#0284c7" />
                  </button>

                  {m.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={() => handleRetrySingle(m)}
                      disabled={actionLoadingId === m.id}
                      title="Retry Message"
                      style={{ ...actionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                    >
                      {actionLoadingId === m.id ? (
                        <Loader2 className="animate-spin" size={13} color="#dc2626" />
                      ) : (
                        <RotateCw size={13} color="#dc2626" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => promptDeleteSms(m.id)}
                    disabled={actionLoadingId === m.id}
                    title="Delete Message"
                    style={{ ...actionBtn, backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}
                  >
                    {actionLoadingId === m.id ? (
                      <Loader2 className="animate-spin" size={13} color="#e11d48" />
                    ) : (
                      <Trash2 size={13} color="#e11d48" />
                    )}
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* Server Pagination Bar */}
        <div style={paginationContainer}>
          <div style={{ fontSize: '0.80rem', color: '#475569' }}>
            {totalCount > 0 ? (
              <>
                Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of{' '}
                <strong>{totalCount}</strong> messages
              </>
            ) : (
              'No messages found'
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                style={paginationSelect}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1 || loading}
              style={{ ...paginationBtn, opacity: currentPage <= 1 || loading ? 0.35 : 1 }}
              title="First Page"
              type="button"
            >
              <ChevronsLeft size={16} />
            </button>

            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              style={{ ...paginationBtn, opacity: currentPage <= 1 || loading ? 0.35 : 1 }}
              title="Previous Page"
              type="button"
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '0.80rem', fontWeight: 600, padding: '0 8px', color: '#0f172a' }}>
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              style={{ ...paginationBtn, opacity: currentPage >= totalPages || loading ? 0.35 : 1 }}
              title="Next Page"
              type="button"
            >
              <ChevronRight size={16} />
            </button>

            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages || loading}
              style={{ ...paginationBtn, opacity: currentPage >= totalPages || loading ? 0.35 : 1 }}
              title="Last Page"
              type="button"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. MODAL: BROADCAST SCHOOL ANNOUNCEMENT */}
      <Modal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        title="Broadcast School Announcement"
      >
        <form onSubmit={handleSendBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Target Recipient Grouping *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { key: 'ALL_PARENTS', label: 'All Parents' },
                { key: 'ALL_FACULTY', label: 'All Faculty' },
                { key: 'BOTH_PARENTS_AND_FACULTY', label: 'Both Parents & Faculty' },
                { key: 'BY_YEAR_LEVEL', label: 'By Year / Grade Level' },
                { key: 'BY_SECTION', label: 'By Class Section' },
                { key: 'SPECIFIC_PARENT', label: 'Specific Parent' },
                { key: 'SPECIFIC_FACULTY', label: 'Specific Faculty' },
              ].map((grp) => (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() =>
                    setBroadcastForm((prev) => ({ ...prev, audience: grp.key as AnnouncementAudience }))
                  }
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    borderWidth: 1.5,
                    borderStyle: 'solid',
                    borderColor: broadcastForm.audience === grp.key ? '#0284c7' : '#cbd5e1',
                    backgroundColor: broadcastForm.audience === grp.key ? '#f0f9ff' : '#ffffff',
                    color: broadcastForm.audience === grp.key ? '#0284c7' : '#334155',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {grp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conditional Target Filter: BY_YEAR_LEVEL */}
          {broadcastForm.audience === 'BY_YEAR_LEVEL' && (
            <div>
              <label style={labelStyle}>Select Grade / Year Level *</label>
              <select
                required
                value={broadcastForm.year_level}
                onChange={(e) =>
                  setBroadcastForm((prev) => ({ ...prev, year_level: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">-- Choose Grade / Year Level --</option>
                {availableYearLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                Sends to all registered parents/guardians with children enrolled in this year level.
              </span>
            </div>
          )}

          {/* Conditional Target Filter: By Section */}
          {broadcastForm.audience === 'BY_SECTION' && (
            <div>
              <label style={labelStyle}>Select Class Section *</label>
              <select
                required
                value={broadcastForm.section_id}
                onChange={(e) =>
                  setBroadcastForm((prev) => ({ ...prev, section_id: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">-- Choose class section --</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.grade_level} - {sec.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional Target Filter: Specific Parent */}
          {broadcastForm.audience === 'SPECIFIC_PARENT' && (
            <div>
              <label style={labelStyle}>Select Student to Notify Parent *</label>
              <select
                required
                value={broadcastForm.specific_target_id}
                onChange={(e) =>
                  setBroadcastForm((prev) => ({ ...prev, specific_target_id: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">-- Choose student from directory --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} &bull; Guardian: {s.guardian_name} ({s.guardian_phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional Target Filter: Specific Faculty */}
          {broadcastForm.audience === 'SPECIFIC_FACULTY' && (
            <div>
              <label style={labelStyle}>Select Faculty / Staff Member *</label>
              <select
                required
                value={broadcastForm.specific_target_id}
                onChange={(e) =>
                  setBroadcastForm((prev) => ({ ...prev, specific_target_id: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="">-- Choose faculty member --</option>
                {facultyList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.full_name} ({f.employee_id}) &bull; {f.phone_number || 'No phone'}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Announcement Message Text *</label>
            <textarea
              required
              rows={4}
              value={broadcastForm.message_body}
              onChange={(e) =>
                setBroadcastForm((prev) => ({ ...prev, message_body: e.target.value }))
              }
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Enter announcement text to broadcast..."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
              <span>Characters: {broadcastForm.message_body.length} / 160</span>
              <span>Segments: {Math.ceil(broadcastForm.message_body.length / 160) || 1} SMS per recipient</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsBroadcastModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Megaphone size={16} />}
              Queue Broadcast
            </Button>
          </div>
        </form>
      </Modal>

      {/* 6. MODAL: COMPOSE INDIVIDUAL SMS */}
      <Modal
        isOpen={isComposeModalOpen}
        onClose={() => setIsComposeModalOpen(false)}
        title="Compose Individual Notification SMS"
      >
        <form onSubmit={handleCreateSms} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={13} color="#0284c7" />
              <span>Select Category (Pre-fills Template)</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(
                [
                  'GATE_TAP',
                  'CLASS_ATTENDANCE',
                  'ANNOUNCEMENT',
                  'OTP_2FA',
                  'GENERAL_NOTICE',
                ] as SmsCategory[]
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategorySelectInCompose(cat)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: composeForm.category === cat ? '#0284c7' : '#cbd5e1',
                    backgroundColor: composeForm.category === cat ? '#f0f9ff' : '#ffffff',
                    color: composeForm.category === cat ? '#0284c7' : '#334155',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {SMS_TEMPLATES[cat]?.label || cat}
                </button>
              ))}
            </div>
          </div>

          {students.length > 0 && composeForm.category !== 'OTP_2FA' && (
            <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <UserCheck size={14} color="#0284c7" />
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0f172a' }}>
                  Quick Fill Guardian from Student Directory:
                </span>
              </div>
              <select
                value={selectedStudentId}
                onChange={(e) => handleSelectStudent(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- Choose student or type custom number below --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} (LRN: {s.lrn}) &bull; {s.guardian_phone}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Recipient Name</label>
              <input
                type="text"
                value={composeForm.recipient_name}
                onChange={(e) => setComposeForm({ ...composeForm, recipient_name: e.target.value })}
                style={inputStyle}
                placeholder="Parent, Student, or Staff"
              />
            </div>

            <div>
              <label style={labelStyle}>Recipient Mobile Number *</label>
              <input
                type="text"
                required
                value={composeForm.recipient_number}
                onChange={(e) => setComposeForm({ ...composeForm, recipient_number: e.target.value })}
                style={inputStyle}
                placeholder="09171234567"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Dispatch Priority</label>
            <select
              value={composeForm.priority}
              onChange={(e) => setComposeForm({ ...composeForm, priority: e.target.value })}
              style={inputStyle}
            >
              <option value="HIGH">High (Immediate)</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Message Body *</label>
            <textarea
              required
              rows={3}
              value={composeForm.message_body}
              onChange={(e) => setComposeForm({ ...composeForm, message_body: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Enter notification text..."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
              <span>Characters: {composeForm.message_body.length} / 160</span>
              <span>Segments: {Math.ceil(composeForm.message_body.length / 160) || 1} SMS</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsComposeModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Queue Message
            </Button>
          </div>
        </form>
      </Modal>

      {/* 7. MODAL: EDIT SMS */}
      {editingSms && (
        <Modal
          isOpen={Boolean(editingSms)}
          onClose={() => setEditingSms(null)}
          title={`Edit Outbox Entry #${editingSms.id}`}
        >
          <form onSubmit={handleUpdateSms} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Recipient Name</label>
                <input
                  type="text"
                  value={editingSms.recipient_name}
                  onChange={(e) => setEditingSms({ ...editingSms, recipient_name: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Recipient Mobile Number *</label>
                <input
                  type="text"
                  required
                  value={editingSms.recipient_number}
                  onChange={(e) => setEditingSms({ ...editingSms, recipient_number: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Notification Category</label>
                <select
                  value={editingSms.category}
                  onChange={(e) => setEditingSms({ ...editingSms, category: e.target.value as any })}
                  style={inputStyle}
                >
                  <option value="GATE_TAP">Gate Tap Attendance</option>
                  <option value="CLASS_ATTENDANCE">Classroom Attendance</option>
                  <option value="ANNOUNCEMENT">School Announcement</option>
                  <option value="OTP_2FA">2FA Login OTP</option>
                  <option value="GENERAL_NOTICE">General Notice</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Delivery Status</label>
                <select
                  value={editingSms.status}
                  onChange={(e) => setEditingSms({ ...editingSms, status: e.target.value as any })}
                  style={inputStyle}
                >
                  <option value="PENDING">PENDING (In Queue)</option>
                  <option value="SENT">SENT (Delivered)</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Message Body *</label>
              <textarea
                required
                rows={3}
                value={editingSms.message_body}
                onChange={(e) => setEditingSms({ ...editingSms, message_body: e.target.value })}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                Characters: {editingSms.message_body.length} / 160
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <Button
                variant="secondary"
                size="md"
                type="button"
                onClick={() => promptDeleteSms(editingSms.id)}
                style={{ color: '#dc2626', borderColor: '#fecaca' }}
              >
                Delete Entry
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="md" type="button" onClick={() => setEditingSms(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  Save Changes
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* 8. MODAL: INSPECT FULL SMS DETAILS */}
      {inspectedSms && (
        <Modal
          isOpen={Boolean(inspectedSms)}
          onClose={() => setInspectedSms(null)}
          title={`Message Details: #${inspectedSms.id}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '12px 14px', backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={14} color="#0284c7" />
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b' }}>FULL MESSAGE TEXT</span>
              </div>
              <div style={{ fontSize: '0.86rem', color: '#0f172a', marginTop: 6, lineHeight: 1.45 }}>
                {inspectedSms.message_body}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.74rem' }}>
              <div style={fieldBox}>
                <div style={{ fontWeight: 700, color: '#64748b' }}>Recipient</div>
                <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{inspectedSms.recipient_name || 'Guardian'}</div>
                <div style={{ fontFamily: 'monospace', color: '#0284c7', marginTop: 1 }}>{inspectedSms.recipient_number}</div>
              </div>

              <div style={fieldBox}>
                <div style={{ fontWeight: 700, color: '#64748b' }}>Purpose &amp; Status</div>
                <div style={{ marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 10,
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      ...getStatusBadge(inspectedSms.status),
                    }}
                  >
                    {inspectedSms.status}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700 }}>
                    {inspectedSms.category}
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 4 }}>
                  Priority: {inspectedSms.priority} &bull; Retries: {inspectedSms.retry_count}
                </div>
              </div>
            </div>

            {inspectedSms.error_message && (
              <div style={{ padding: '10px 12px', backgroundColor: '#fef2f2', borderRadius: 6, borderWidth: 1, borderStyle: 'solid', borderColor: '#fecaca' }}>
                <div style={{ fontSize: '0.70rem', fontWeight: 800, color: '#dc2626' }}>MODEM ERROR LOG</div>
                <div style={{ fontSize: '0.74rem', color: '#b91c1c', marginTop: 2, fontFamily: 'monospace' }}>
                  {inspectedSms.error_message}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => {
                    const smsToEdit = inspectedSms;
                    setInspectedSms(null);
                    handleOpenEdit(smsToEdit);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Pencil size={14} />
                  Edit
                </Button>

                {inspectedSms.status === 'FAILED' && (
                  <Button
                    variant="secondary"
                    size="md"
                    type="button"
                    onClick={() => handleRetrySingle(inspectedSms)}
                    disabled={actionLoadingId === inspectedSms.id}
                    style={{ color: '#0284c7', borderColor: '#bae6fd', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {actionLoadingId === inspectedSms.id ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <RotateCw size={14} />
                    )}
                    Retry Dispatch
                  </Button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="secondary"
                  size="md"
                  type="button"
                  onClick={() => promptDeleteSms(inspectedSms.id)}
                  style={{ color: '#dc2626', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
                <Button variant="primary" size="md" type="button" onClick={() => setInspectedSms(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SmsTab;

// ============================================================================
// STYLES (PURE PROPERTY COMPLIANT - ZERO SHORTHAND COLLISIONS)
// ============================================================================

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.3px',
};

const statVal: React.CSSProperties = {
  fontSize: '1.50rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
  marginTop: 6,
};

const statSub: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#94a3b8',
  marginTop: 4,
};

const policyBannerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 18px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
  gap: 16,
};

const policyIconBox: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  backgroundColor: '#f0f9ff',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#bae6fd',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const policyBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  borderRadius: 6,
  borderWidth: 1.5,
  borderStyle: 'solid',
  fontSize: '0.75rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#e2e8f0',
};

const filterPill: React.CSSProperties = {
  backgroundColor: 'transparent',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  borderRadius: 20,
  padding: '5px 12px',
  fontSize: '0.74rem',
  fontWeight: 600,
  color: '#475569',
  cursor: 'pointer',
};

const filterPillActive: React.CSSProperties = {
  backgroundColor: '#0284c7',
  borderColor: '#0284c7',
  color: '#ffffff',
};

const categorySelectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  fontSize: '0.74rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  fontWeight: 600,
  outline: 'none',
};

const phoneIconBox: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  backgroundColor: '#f0f9ff',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#bae6fd',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const copyMiniBtn: React.CSSProperties = {
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderStyle: 'none',
  cursor: 'pointer',
  padding: 1,
  display: 'flex',
  alignItems: 'center',
};

const actionBtn: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const fieldBox: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f8fafc',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#e2e8f0',
  borderRadius: 6,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const paginationContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  backgroundColor: '#ffffff',
  borderTopWidth: 1,
  borderTopStyle: 'solid',
  borderTopColor: '#e2e8f0',
  boxSizing: 'border-box',
};

const paginationBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  borderRadius: 6,
  backgroundColor: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
};

const paginationSelect: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 6,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  fontSize: '0.78rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};