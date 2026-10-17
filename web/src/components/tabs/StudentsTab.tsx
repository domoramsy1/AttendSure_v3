/**
 * AttendSure - Student Directory & ID Cards
 * File: frontend/src/components/tabs/StudentsTab.tsx
 *
 * Key Upgrades:
 * 1. REUSABLE PAGINATION: Uses <Pagination /> and `exportToCsv` from common/Pagination.tsx.
 * 2. XSS-SAFE ID PRINTING: Escapes HTML characters before printing student ID cards.
 * 3. LIVE VALIDATION: Checks 12-digit LRN and 11-digit PH mobile number as you type.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Pagination, ALL_ROWS_SIZE, exportToCsv } from '../common/Pagination';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  User,
  Pencil,
  Trash2,
  Loader2,
  CreditCard,
  QrCode,
  Copy,
  Check,
  Phone,
  Printer,
  Camera,
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Download,
  Filter,
  ShieldCheck,
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Student {
  id: number;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  sex: string;
  parent_contact: string;
  rfid_uid?: string;
  qr_token?: string;
  current_section?: string;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages: number;
  current_page: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

type QuickFilterType = 'ALL' | 'MALE' | 'FEMALE' | 'RFID_PAIRED' | 'NEEDS_RFID';

interface ToastNotice {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

/** Escapes HTML characters to prevent XSS in printable ID card windows */
const escapeHtml = (unsafe: string | undefined | null): string => {
  return String(unsafe ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// ============================================================================
// UNIVERSAL HTTP/HTTPS CLIPBOARD HELPER
// ============================================================================

const copyTextSafely = async (textToCopy: string): Promise<boolean> => {
  const cleanText = String(textToCopy || '').trim();
  if (!cleanText) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return true;
    } catch {
      // Fall through to legacy textarea method if blocked
    }
  }

  if (typeof document !== 'undefined') {
    const textArea = document.createElement('textarea');
    textArea.value = cleanText;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, cleanText.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }

    document.body.removeChild(textArea);
    return copied;
  }

  return false;
};

// ============================================================================
// REUSABLE DEFAULT USER AVATAR COMPONENT
// ============================================================================

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
  shape?: 'circle' | 'rounded';
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Student',
  size = 38,
  iconSize = 19,
  shape = 'circle',
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const hasPhoto = Boolean(
    photoUrl &&
      typeof photoUrl === 'string' &&
      photoUrl.trim() !== '' &&
      photoUrl.trim().toLowerCase() !== 'null' &&
      photoUrl.trim().toLowerCase() !== 'undefined'
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? '50%' : '10px',
        backgroundColor: '#f1f5f9',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={name}
    >
      {hasPhoto && !imageFailed ? (
        <img
          src={photoUrl!}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <User size={iconSize} color="#94a3b8" />
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const StudentsTab: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('ALL');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Copy & Toast Feedback State
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    sex: 'Male',
    parent_contact: '',
    rfid_uid: '',
    photo: null as string | null,
  });

  // Live Form Validation State
  const liveFormWarnings = useMemo(() => {
    const warnings: { lrn?: string; parent_contact?: string } = {};
    if (formData.lrn && formData.lrn.length !== 12) {
      warnings.lrn = 'LRN must be exactly 12 digits.';
    }
    const cleanPhone = formData.parent_contact.trim().replace(/[\s-]/g, '');
    if (cleanPhone && !/^(09|\+639)\d{9}$/.test(cleanPhone)) {
      warnings.parent_contact = 'Use a valid 11-digit PH mobile number (e.g. 09171234567).';
    }
    return warnings;
  }, [formData.lrn, formData.parent_contact]);

  // Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    isDestructive: boolean;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    isDestructive: false,
    action: async () => {},
  });

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToast({ id, text, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 3000);
  }, []);

  const isInteracting = useRef<boolean>(false);
  isInteracting.current = isModalOpen || Boolean(badgeStudent) || confirmDialog.isOpen;

  // ============================================================================
  // DATABASE DATA FETCHING & LIVE POLLING
  // ============================================================================

  const fetchStudents = useCallback(
    async (page = 1, size = 25, query = '', silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);
        const isAll = size >= ALL_ROWS_SIZE;
        const res = await apiClient.get<PaginatedResponse<Student> | Student[]>('/students/', {
          params: {
            page: isAll ? 1 : page,
            page_size: isAll ? 'ALL' : size,
            search: query.trim() || undefined,
          },
        });

        if (res.data && 'results' in res.data) {
          setStudents(res.data.results);
          setTotalCount(res.data.count);
          setTotalPages(isAll ? 1 : res.data.total_pages || Math.ceil(res.data.count / size) || 1);
          setCurrentPage(isAll ? 1 : res.data.current_page || page);
        } else if (Array.isArray(res.data)) {
          setStudents(res.data);
          setTotalCount(res.data.length);
          setTotalPages(1);
          setCurrentPage(1);
        }
      } catch (err: any) {
        if (!silent) {
          setError(err.response?.data?.error || 'Failed to load students.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setCurrentPage(1);
      fetchStudents(1, pageSize, search, false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, pageSize, fetchStudents]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchStudents(currentPage, pageSize, search, true);
      }
    }, 3000);

    return () => clearInterval(liveInterval);
  }, [currentPage, pageSize, search, fetchStudents]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchStudents(newPage, pageSize, search, false);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchStudents(1, newSize, search, false);
  };

  // Real database telemetry counts
  const totalStudents = totalCount || students.length;
  const totalBoys = useMemo(
    () => students.filter((s) => s.sex === 'Male' || s.sex === 'M').length,
    [students]
  );
  const totalGirls = useMemo(
    () => students.filter((s) => s.sex === 'Female' || s.sex === 'F').length,
    [students]
  );
  const pairedCards = useMemo(
    () => students.filter((s) => Boolean(s.rfid_uid && s.rfid_uid.trim().length > 0)).length,
    [students]
  );
  const unpairedCards = Math.max(0, students.length - pairedCards);

  const displayedStudents = useMemo(() => {
    return students.filter((s) => {
      if (quickFilter === 'MALE') return s.sex === 'Male' || s.sex === 'M';
      if (quickFilter === 'FEMALE') return s.sex === 'Female' || s.sex === 'F';
      if (quickFilter === 'RFID_PAIRED') return Boolean(s.rfid_uid && s.rfid_uid.trim().length > 0);
      if (quickFilter === 'NEEDS_RFID') return !s.rfid_uid || s.rfid_uid.trim().length === 0;
      return true;
    });
  }, [students, quickFilter]);

  const handleCopyValue = async (val: string, label = 'LRN') => {
    if (!val) return;
    const ok = await copyTextSafely(val);
    if (ok) {
      setCopiedValue(val);
      showToast(`${label} (${val}) copied to clipboard!`, 'success');
      setTimeout(() => setCopiedValue((prev) => (prev === val ? null : prev)), 2000);
    } else {
      showToast(`Could not copy ${label} automatically.`, 'error');
    }
  };

  // Uses shared `exportToCsv` from Pagination.tsx
  const handleExportCsv = () => {
    const suffix = pageSize >= ALL_ROWS_SIZE ? 'ALL' : `Page${currentPage}_${pageSize}rows`;
    const exported = exportToCsv(
      `AttendSure_Students_${suffix}.csv`,
      ['LRN', 'Full Name', 'Sex', 'Section', 'RFID UID', 'Parent Contact', 'Status'],
      displayedStudents.map((s) => [
        s.lrn,
        s.full_name || `${s.last_name}, ${s.first_name}`,
        s.sex === 'Female' || s.sex === 'F' ? 'Female' : 'Male',
        s.current_section || 'Unassigned',
        s.rfid_uid || '',
        s.parent_contact || '',
        s.is_active ? 'ACTIVE' : 'INACTIVE',
      ])
    );

    if (exported) {
      showToast(`Exported ${displayedStudents.length} student records to CSV.`, 'success');
    } else {
      showToast('No student records to export.', 'info');
    }
  };

  // Isolated CR80 ID Card Print Handler (XSS-Hardened)
  const handlePrintIdBadge = (student: Student) => {
    const iframeId = 'attendsure-student-id-print-frame';
    const oldFrame = document.getElementById(iframeId);
    if (oldFrame && oldFrame.parentNode) {
      oldFrame.parentNode.removeChild(oldFrame);
    }

    const iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '500px';
    iframe.style.height = '700px';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const safeFullName = escapeHtml(student.full_name || `${student.first_name} ${student.last_name}`);
    const safeSection = escapeHtml(student.current_section || 'Unassigned');
    const safeLrn = escapeHtml(student.lrn);
    const safeRfid = escapeHtml(student.rfid_uid || 'Not Paired');
    const safeContact = escapeHtml(student.parent_contact || 'N/A');
    const qrPayload = encodeURIComponent(student.qr_token || student.lrn);
    const avatarSrc = escapeHtml(student.photo_url || student.photo || '');

    const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Student ID Pass - ${safeFullName}</title>
        <style>
          @page { size: portrait; margin: 12mm; }
          body { font-family: 'Inter', Arial, sans-serif; display: flex; justify-content: center; padding-top: 20px; margin: 0; }
          .card { width: 310px; border: 2px solid #0284c7; border-radius: 14px; overflow: hidden; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
          .banner { background: linear-gradient(135deg, #003460 0%, #0284c7 100%); color: #fff; padding: 14px 12px; }
          .banner-title { font-size: 11px; font-weight: 800; letter-spacing: 0.8px; }
          .banner-sub { font-size: 9px; opacity: 0.85; margin-top: 2px; }
          .body { padding: 16px; background: #fff; }
          .avatar { width: 78px; height: 78px; border-radius: 12px; border: 2px solid #e2e8f0; margin: 0 auto 10px; object-fit: cover; display: block; background: #f1f5f9; }
          .name { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 3px; }
          .sec { font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 8px; }
          .lrn { display: inline-block; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 11px; font-weight: 700; color: #0f172a; }
          .qr-box { width: 120px; height: 120px; margin: 12px auto; padding: 6px; border: 1px solid #e2e8f0; border-radius: 10px; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 8px 12px; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="banner">
            <div class="banner-title">ATTENDSURE OFFICIAL STUDENT PASS</div>
            <div class="banner-sub">Department of Education • Gate & Classroom ID</div>
          </div>
          <div class="body">
            ${avatarSrc ? `<img src="${avatarSrc}" class="avatar" />` : `<div class="avatar" style="line-height:78px;font-size:28px;color:#94a3b8;">👤</div>`}
            <div class="name">${safeFullName}</div>
            <div class="sec">Section: ${safeSection}</div>
            <div class="lrn">LRN: ${safeLrn}</div>
            <div class="qr-box">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${qrPayload}" style="width:100%;height:100%;" />
            </div>
          </div>
          <div class="footer">
            RFID UID: <strong>${safeRfid}</strong> • Parent SMS: <strong>${safeContact}</strong>
          </div>
        </div>
      </body>
      </html>`;

    const doc = iframe.contentWindow?.document;
    if (doc && iframe.contentWindow) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 400);
    }
  };

  // ============================================================================
  // PHOTO UPLOAD HANDLER
  // ============================================================================

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Please select a valid image file (JPG, PNG, or WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFormError('Profile photo must be smaller than 2 MB.');
      return;
    }

    setFormError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        photo: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({
      ...prev,
      photo: null,
    }));
  };

  // ============================================================================
  // CRUD ACTIONS
  // ============================================================================

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setFormError(null);
    setFormData({
      lrn: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      sex: 'Male',
      parent_contact: '',
      rfid_uid: '',
      photo: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormError(null);
    setFormData({
      lrn: student.lrn || '',
      first_name: student.first_name || '',
      middle_name: student.middle_name || '',
      last_name: student.last_name || '',
      sex: student.sex === 'Female' || student.sex === 'F' ? 'Female' : 'Male',
      parent_contact: student.parent_contact || '',
      rfid_uid: student.rfid_uid || '',
      photo: student.photo_url || student.photo || null,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formData.lrn.trim().length !== 12) {
      setFormError('Learner Reference Number (LRN) must be exactly 12 digits.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        lrn: formData.lrn.trim(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || '',
        last_name: formData.last_name.trim(),
        sex: formData.sex === 'Female' ? 'Female' : 'Male',
        parent_contact: formData.parent_contact.trim().replace(/[\s-]/g, '') || '',
        rfid_uid:
          formData.rfid_uid && formData.rfid_uid.trim() !== ''
            ? formData.rfid_uid.trim().toUpperCase()
            : null,
      };

      if (formData.photo !== undefined) {
        payload.photo = formData.photo;
      }

      if (editingStudent) {
        const res = await apiClient.put<Student>(`/students/${editingStudent.id}/`, payload);
        setStudents((prev) => prev.map((s) => (s.id === editingStudent.id ? res.data : s)));
        showToast(`Updated profile for ${res.data.full_name || formData.first_name}.`, 'success');
      } else {
        await apiClient.post<Student>('/students/', payload);
        fetchStudents(1, pageSize, search, true);
        showToast(`Enrolled ${formData.first_name} ${formData.last_name} successfully.`, 'success');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      const backendErrors = err.response?.data;
      if (backendErrors && typeof backendErrors === 'object') {
        const errorList = Object.entries(backendErrors)
          .map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(', ') : msg}`)
          .join(' | ');
        setFormError(errorList);
      } else {
        setFormError(err.response?.data?.detail || 'Failed to save student record.');
      }
    } finally {
      setSaving(false);
    }
  };

  const promptDelete = (student: Student) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Student Record',
      message: `Permanently delete student "${student.full_name || student.first_name}" (LRN: ${student.lrn}) from the school registry?`,
      confirmLabel: 'Delete Student',
      isDestructive: true,
      action: async () => {
        try {
          await apiClient.delete(`/students/${student.id}/`);
          if (badgeStudent?.id === student.id) setBadgeStudent(null);
          fetchStudents(currentPage, pageSize, search, true);
          showToast(`Deleted learner record (${student.lrn}).`, 'info');
        } catch {
          showToast('Failed to delete student record.', 'error');
        }
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
      {/* Floating Non-Blocking Toast Banner */}
      {toast && (
        <div
          style={{
            ...toastBannerStyle,
            backgroundColor:
              toast.type === 'error' ? '#fef2f2' : toast.type === 'info' ? '#f0f9ff' : '#ecfdf5',
            borderColor:
              toast.type === 'error' ? '#fecaca' : toast.type === 'info' ? '#bae6fd' : '#a7f3d0',
            color:
              toast.type === 'error' ? '#991b1b' : toast.type === 'info' ? '#075985' : '#065f46',
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={16} color="#dc2626" />
          ) : (
            <CheckCircle2 size={16} color={toast.type === 'info' ? '#0284c7' : '#059669'} />
          )}
          <span style={{ fontWeight: 700, fontSize: '0.80rem' }}>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          >
            <X size={14} color="#64748b" />
          </button>
        </div>
      )}

      {/* 1. Quick Telemetry Stats Header */}
      <div style={statsContainer}>
        <div
          onClick={() => setQuickFilter('ALL')}
          style={{
            ...statCard,
            cursor: 'pointer',
            borderColor: quickFilter === 'ALL' ? '#0284c7' : '#e2e8f0',
            backgroundColor: quickFilter === 'ALL' ? '#f8fafc' : '#ffffff',
          }}
        >
          <div style={statLabel}>TOTAL STUDENTS</div>
          <div style={statValue}>{totalStudents}</div>
          <div style={statHelp}>Enrolled learners in database</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>SEX RATIO (LOADED)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              onClick={() => setQuickFilter(quickFilter === 'MALE' ? 'ALL' : 'MALE')}
              style={{ fontSize: '1.40rem', fontWeight: 800, color: '#0284c7', cursor: 'pointer' }}
              title="Click to filter Male learners"
            >
              {totalBoys}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Male</span>
            <span
              onClick={() => setQuickFilter(quickFilter === 'FEMALE' ? 'ALL' : 'FEMALE')}
              style={{
                fontSize: '1.40rem',
                fontWeight: 800,
                color: '#ec4899',
                marginLeft: 6,
                cursor: 'pointer',
              }}
              title="Click to filter Female learners"
            >
              {totalGirls}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Female</span>
          </div>
          <div style={statHelp}>Click count to filter by sex</div>
        </div>

        <div
          onClick={() => setQuickFilter(quickFilter === 'RFID_PAIRED' ? 'ALL' : 'RFID_PAIRED')}
          style={{
            ...statCard,
            cursor: 'pointer',
            borderColor: quickFilter === 'RFID_PAIRED' ? '#059669' : '#e2e8f0',
          }}
        >
          <div style={statLabel}>RFID CARDS PAIRED (LOADED)</div>
          <div style={{ fontSize: '1.40rem', fontWeight: 800, color: '#059669' }}>
            {pairedCards}
            <span style={{ fontSize: '0.80rem', color: '#94a3b8', fontWeight: 500 }}>
              {' '}
              / {students.length}
            </span>
          </div>
          <div style={statHelp}>Ready for gate card tap</div>
        </div>

        <div
          onClick={() => setQuickFilter(quickFilter === 'NEEDS_RFID' ? 'ALL' : 'NEEDS_RFID')}
          style={{
            ...statCard,
            cursor: 'pointer',
            borderColor: quickFilter === 'NEEDS_RFID' ? '#d97706' : '#e2e8f0',
          }}
        >
          <div style={statLabel}>NEEDS RFID CARD (LOADED)</div>
          <div
            style={{
              fontSize: '1.40rem',
              fontWeight: 800,
              color: unpairedCards > 0 ? '#d97706' : '#059669',
            }}
          >
            {unpairedCards}
          </div>
          <div style={statHelp}>Click to filter unlinked learners</div>
        </div>
      </div>

      {/* 2. Quick Filter Bar & CSV Export */}
      <div style={filterStripContainer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.74rem',
              fontWeight: 700,
              color: '#64748b',
              marginRight: 4,
            }}
          >
            <Filter size={13} /> QUICK VIEW:
          </span>

          {(
            [
              { key: 'ALL', label: `All (${students.length})` },
              { key: 'MALE', label: `Male (${totalBoys})` },
              { key: 'FEMALE', label: `Female (${totalGirls})` },
              { key: 'RFID_PAIRED', label: `RFID Paired (${pairedCards})` },
              { key: 'NEEDS_RFID', label: `Needs RFID (${unpairedCards})` },
            ] as const
          ).map((pill) => {
            const active = quickFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setQuickFilter(pill.key)}
                style={{
                  ...filterPillBtn,
                  backgroundColor: active ? '#0284c7' : '#f1f5f9',
                  color: active ? '#ffffff' : '#475569',
                }}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <button type="button" onClick={handleExportCsv} style={exportCsvBtnStyle}>
          <Download size={13} />
          <span>
            {pageSize >= ALL_ROWS_SIZE
              ? `Export All CSV (${displayedStudents.length})`
              : `Export Page CSV (${displayedStudents.length})`}
          </span>
        </button>
      </div>

      {/* 3. Main Table + Reusable Pagination Component */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <ModuleTableLayout
          title="Student Management"
          subtitle="Manage master student records, photos, RFID cards, and gate passes."
          searchPlaceholder="Search by LRN or Name..."
          searchValue={search}
          onSearchChange={setSearch}
          addButtonLabel="Enroll Student"
          onAdd={handleOpenCreate}
          loading={loading}
          error={error}
          data={displayedStudents}
          keyExtractor={(s) => s.id}
          columns={[
            {
              header: 'Photo & Learner Name',
              render: (s) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ProfileAvatar
                    photoUrl={s.photo_url || s.photo}
                    name={s.full_name || `${s.last_name}, ${s.first_name}`}
                    size={38}
                    iconSize={19}
                    shape="circle"
                  />

                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.86rem' }}>
                      {s.full_name || `${s.last_name}, ${s.first_name}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#64748b',
                          fontFamily: 'monospace',
                        }}
                      >
                        LRN: {s.lrn}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyValue(s.lrn, 'LRN');
                        }}
                        title="Copy 12-digit LRN"
                        style={copyBtnStyle}
                        type="button"
                      >
                        {copiedValue === s.lrn ? (
                          <Check size={12} color="#059669" />
                        ) : (
                          <Copy size={12} color="#64748b" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Sex',
              render: (s) => {
                const isMale = s.sex === 'Male' || s.sex === 'M';
                return (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: isMale ? '#eff6ff' : '#fdf2f8',
                      color: isMale ? '#0284c7' : '#db2777',
                    }}
                  >
                    {isMale ? 'Male' : 'Female'}
                  </span>
                );
              },
            },
            {
              header: 'Section',
              render: (s) => (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                  }}
                >
                  {s.current_section || 'Unassigned'}
                </span>
              ),
            },
            {
              header: 'Gate RFID Card',
              render: (s) =>
                s.rfid_uid ? (
                  <div
                    onClick={() => handleCopyValue(s.rfid_uid!, 'RFID UID')}
                    style={{ ...rfidChipStyle, cursor: 'pointer' }}
                    title="Click to copy RFID UID"
                  >
                    <CreditCard size={12} color="#059669" />
                    <span>{s.rfid_uid}</span>
                    {copiedValue === s.rfid_uid ? (
                      <Check size={11} color="#059669" />
                    ) : (
                      <Copy size={10} color="#059669" style={{ opacity: 0.7 }} />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(s)}
                    style={{ ...unlinkedChipStyle, cursor: 'pointer' }}
                    title="Click to assign an RFID card to this student"
                  >
                    <CreditCard size={12} color="#d97706" />
                    <span>+ Pair Card</span>
                  </button>
                ),
            },
            {
              header: 'Parent Phone (SMS)',
              render: (s) => (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.78rem',
                    color: '#334155',
                  }}
                >
                  <Phone size={12} color="#64748b" />
                  <span>{s.parent_contact || '—'}</span>
                </div>
              ),
            },
            {
              header: 'Status',
              render: (s) => (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 12,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    backgroundColor: s.is_active ? '#ecfdf5' : '#fef2f2',
                    color: s.is_active ? '#059669' : '#dc2626',
                  }}
                >
                  {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              ),
            },
            {
              header: 'Actions',
              align: 'right',
              render: (s) => (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  <button
                    onClick={() => setBadgeStudent(s)}
                    title="View Student Gate Pass & QR Badge"
                    style={iconActionBtn}
                    type="button"
                  >
                    <QrCode size={13} color="#0284c7" />
                  </button>
                  <button
                    onClick={() => handleOpenEdit(s)}
                    title="Edit Student Information"
                    style={iconActionBtn}
                    type="button"
                  >
                    <Pencil size={13} color="#475569" />
                  </button>
                  <button
                    onClick={() => promptDelete(s)}
                    title="Delete Student"
                    style={{
                      ...iconActionBtn,
                      backgroundColor: '#fef2f2',
                      borderColor: '#fee2e2',
                    }}
                    type="button"
                  >
                    <Trash2 size={13} color="#dc2626" />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* Shared Reusable Pagination Bar */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="students"
          disabled={loading}
        />
      </div>

      {/* 4. Enroll / Edit Modal with Live Validation */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? 'Edit Student Details' : 'Enroll New Student'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#991b1b',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
              <span>{formError}</span>
            </div>
          )}

          {/* Profile Photo Uploader */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: 12,
              backgroundColor: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <ProfileAvatar
              photoUrl={formData.photo}
              name={formData.first_name || 'Preview'}
              size={56}
              iconSize={28}
              shape="rounded"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={uploadPhotoBtn}>
                  <Camera size={13} />
                  <span>{formData.photo ? 'Change Photo' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {formData.photo && (
                  <button type="button" onClick={handleRemovePhoto} style={removePhotoBtn}>
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                Square photo recommended (JPG, PNG, or WebP, max 2 MB).
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={labelStyle}>Learner Reference Number (LRN) *</label>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: formData.lrn.length === 12 ? '#059669' : '#d97706',
                }}
              >
                {formData.lrn.length}/12 digits
              </span>
            </div>
            <input
              type="text"
              required
              maxLength={12}
              value={formData.lrn}
              onChange={(e) =>
                setFormData({ ...formData, lrn: e.target.value.replace(/\D/g, '') })
              }
              style={{
                ...inputStyle,
                borderColor: liveFormWarnings.lrn
                  ? '#dc2626'
                  : formData.lrn.length === 12
                  ? '#059669'
                  : '#cbd5e1',
              }}
              placeholder="12-digit LRN (e.g. 128930491029)"
            />
            {liveFormWarnings.lrn && (
              <span style={{ fontSize: '0.70rem', color: '#dc2626', fontWeight: 600 }}>
                {liveFormWarnings.lrn}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
                placeholder="Juan"
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={inputStyle}
                placeholder="Dela Cruz"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Middle Name</label>
              <input
                type="text"
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                style={inputStyle}
                placeholder="Optional"
              />
            </div>
            <div>
              <label style={labelStyle}>Sex *</label>
              <select
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                style={inputStyle}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Parent Contact Number (For Instant SMS)</label>
            <input
              type="text"
              placeholder="09171234567"
              value={formData.parent_contact}
              onChange={(e) => setFormData({ ...formData, parent_contact: e.target.value })}
              style={{
                ...inputStyle,
                borderColor: liveFormWarnings.parent_contact ? '#dc2626' : '#cbd5e1',
              }}
            />
            {liveFormWarnings.parent_contact && (
              <span style={{ fontSize: '0.70rem', color: '#dc2626', fontWeight: 600 }}>
                {liveFormWarnings.parent_contact}
              </span>
            )}
          </div>

          <div>
            <label style={labelStyle}>Assigned RFID Card UID (Tap card on USB reader)</label>
            <input
              type="text"
              placeholder="Card UID (e.g. 8A3F29C1)"
              value={formData.rfid_uid}
              onChange={(e) =>
                setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })
              }
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={saving || Boolean(liveFormWarnings.lrn || liveFormWarnings.parent_contact)}
            >
              {saving ? (
                <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} />
              ) : null}
              {editingStudent ? 'Save Changes' : 'Enroll Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. Official Student ID Pass Modal */}
      {badgeStudent && (
        <Modal
          isOpen={Boolean(badgeStudent)}
          onClose={() => setBadgeStudent(null)}
          title="Official Student Gate & Classroom ID Pass"
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '6px 0',
            }}
          >
            <div
              style={{
                width: 300,
                backgroundColor: '#ffffff',
                border: '2px solid #0284c7',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(2, 132, 199, 0.12)',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #003460 0%, #0284c7 100%)',
                  color: '#ffffff',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.6px',
                  }}
                >
                  <ShieldCheck size={14} color="#38bdf8" />
                  <span>ATTENDSURE STUDENT PASS</span>
                </div>
                <div style={{ fontSize: '0.58rem', color: '#e0f2fe', marginTop: 2 }}>
                  Official Campus Turnstile & Classroom QR Pass
                </div>
              </div>

              <div style={{ padding: '16px 14px' }}>
                <div style={{ margin: '0 auto 10px auto', display: 'flex', justifyContent: 'center' }}>
                  <ProfileAvatar
                    photoUrl={badgeStudent.photo_url || badgeStudent.photo}
                    name={badgeStudent.full_name || badgeStudent.first_name}
                    size={74}
                    iconSize={36}
                    shape="rounded"
                  />
                </div>

                <div
                  style={{
                    fontSize: '0.98rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    lineHeight: 1.2,
                  }}
                >
                  {badgeStudent.full_name || `${badgeStudent.first_name} ${badgeStudent.last_name}`}
                </div>

                <div
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: '#64748b',
                    marginTop: 3,
                  }}
                >
                  Section: {badgeStudent.current_section || 'Unassigned'}
                </div>

                <div
                  onClick={() => handleCopyValue(badgeStudent.lrn, 'LRN')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    margin: '8px 0',
                    padding: '4px 10px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: 6,
                    fontFamily: 'monospace',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    cursor: 'pointer',
                  }}
                  title="Click to copy LRN"
                >
                  <span>LRN: {badgeStudent.lrn}</span>
                  <Copy size={11} color="#64748b" />
                </div>

                <div
                  style={{
                    margin: '8px auto',
                    padding: 6,
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    width: 118,
                    height: 118,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
                      badgeStudent.qr_token || badgeStudent.lrn
                    )}`}
                    alt="Student QR Code"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#f8fafc',
                  borderTop: '1px solid #e2e8f0',
                  padding: '8px 12px',
                  fontSize: '0.66rem',
                  color: '#64748b',
                }}
              >
                RFID:{' '}
                <strong style={{ color: badgeStudent.rfid_uid ? '#059669' : '#d97706' }}>
                  {badgeStudent.rfid_uid || 'No Card Linked'}
                </strong>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 16,
                width: '100%',
                justifyContent: 'center',
              }}
            >
              <Button
                variant="secondary"
                size="md"
                type="button"
                onClick={() => setBadgeStudent(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => handlePrintIdBadge(badgeStudent)}
              >
                <Printer size={15} style={{ marginRight: 6 }} />
                Print ID Card
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. Modern Confirmation Modal */}
      <Modal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        title={confirmDialog.title}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: confirmDialog.isDestructive ? '#fee2e2' : '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {confirmDialog.isDestructive ? (
                <AlertTriangle size={20} color="#dc2626" />
              ) : (
                <AlertCircle size={20} color="#0284c7" />
              )}
            </div>
            <div style={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.5, marginTop: 4 }}>
              {confirmDialog.message}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button
              variant="secondary"
              size="md"
              type="button"
              disabled={saving}
              onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="button"
              disabled={saving}
              onClick={async () => {
                await confirmDialog.action();
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              }}
              style={
                confirmDialog.isDestructive
                  ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }
                  : {}
              }
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : confirmDialog.confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const toastBannerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  right: 24,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12)',
};

const statsContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '14px 16px',
  transition: 'all 0.15s ease',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 4,
};

const statValue: React.CSSProperties = {
  fontSize: '1.40rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
};

const statHelp: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  marginTop: 4,
};

const filterStripContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 10,
};

const filterPillBtn: React.CSSProperties = {
  border: 'none',
  borderRadius: 6,
  padding: '5px 11px',
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const exportCsvBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  color: '#334155',
  fontSize: '0.75rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const uploadPhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 12px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const removePhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 8px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const copyBtnStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  cursor: 'pointer',
  padding: '2px 4px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const rfidChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  borderRadius: 6,
  backgroundColor: '#ecfdf5',
  color: '#059669',
  fontSize: '0.70rem',
  fontWeight: 700,
  fontFamily: 'monospace',
  border: '1px solid #a7f3d0',
};

const unlinkedChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  borderRadius: 6,
  backgroundColor: '#fffbeb',
  color: '#d97706',
  fontSize: '0.70rem',
  fontWeight: 600,
  border: '1px dashed #fcd34d',
};

const iconActionBtn: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '5px 7px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

export default StudentsTab;