// AttendSure Web - Gate Passes Tab
// File: D:\AttendSure_V3\web\src\components\tabs\GatePassesTab.tsx

/**
 * AttendSure - Campus Exit & Official Travel Passes (Strict 3NF Lifecycle)
 * File: web/src/components/tabs/GatePassesTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { SEAL_COLORS } from '../../theme/tokens';
import { ModuleTableLayout } from './ModuleTableLayout';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { StatusBadge } from '../common/StatusBadge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import {
  canApproveOrCancelLocatorSlip,
  canIssueStudentExitPass,
  getCurrentUserFromStorage,
} from '../../utils/permissions';
import { formatDateTime12h } from '../../utils/timeFormat';
import { CheckCircle2, ShieldCheck, Printer, QrCode, FileText, Plus, ExternalLink, Edit2, Trash2, XCircle } from 'lucide-react';

interface ExitPassItem {
  id: number;
  pass_number: string;
  pass_scope: 'STUDENT' | 'TEACHER';
  enrollment?: number | null;
  student_id?: number | null;
  student_name?: string;
  student_lrn?: string;
  teacher?: number | null;
  teacher_name?: string;
  teacher_employee_id?: string;
  pass_type: string;
  reason: string;
  destination?: string;
  issued_at: string;
  valid_until: string;
  returned_at?: string | null;
  is_cancelled?: boolean;
  is_approved?: boolean;
  approved_by_name?: string;
  approved_at?: string | null;
  pass_status: 'PENDING_APPROVAL' | 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'CANCELLED';
  status?: 'PENDING_APPROVAL' | 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'CANCELLED';
  attachment_url?: string | null;
  issued_by?: number | null;
  issued_by_name?: string;
}

const PASS_STATUS_LABELS: Record<string, string> = {
  ALL: 'All',
  PENDING_APPROVAL: 'Pending Approval',
  ACTIVE: 'Active',
  RETURNED: 'Returned',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

interface StudentOption {
  id: number;
  lrn: string;
  full_name: string;
}

const sanitizeInput = (raw: string, maxLength = 250): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

const isSafeProofUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/media/');
};

export const GatePassesTab: React.FC = () => {
  const { school } = useSchool();
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand, ui } = useTheme();

  const currentUser = getCurrentUserFromStorage();
  const isLeader = canApproveOrCancelLocatorSlip(currentUser);
  const canIssueStudentPass = canIssueStudentExitPass(currentUser);

  const [passes, setPasses] = useState<ExitPassItem[]>(() => {
    const cached = peekApiCache<any>(API_ROUTES.attendance.exitPasses);
    return cached?.results ?? (Array.isArray(cached) ? cached : []);
  });
  const [loading, setLoading] = useState<boolean>(() => !peekApiCache(API_ROUTES.attendance.exitPasses));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedPass, setSelectedPass] = useState<ExitPassItem | null>(null);
  const [editingPass, setEditingPass] = useState<ExitPassItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [passScope, setPassScope] = useState<'STUDENT' | 'TEACHER'>('STUDENT');

  const [formData, setFormData] = useState({
    student_id: '',
    pass_type: 'Clinic / Medical Clearance',
    destination: '',
    reason: '',
    valid_until: '',
  });
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [clearExistingProof, setClearExistingProof] = useState(false);

  const passesAbortRef = useRef<AbortController | null>(null);
  const studentsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(sanitizeInput(search, 80));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    return () => {
      passesAbortRef.current?.abort();
      studentsAbortRef.current?.abort();
    };
  }, []);

  const fetchPasses = useCallback(
    async (bypassCache = false) => {
      passesAbortRef.current?.abort();
      const controller = new AbortController();
      passesAbortRef.current = controller;

      const baseParams = {
        search: debouncedSearch || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      };
      const cached = !bypassCache ? peekApiCache<any>(API_ROUTES.attendance.exitPasses, baseParams) : undefined;
      if (cached) {
        setPasses(cached?.results ?? (Array.isArray(cached) ? cached : []));
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await apiClient.get<any>(API_ROUTES.attendance.exitPasses, {
          params: {
            ...baseParams,
            ...(bypassCache ? { nocache: 1 } : {}),
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const list = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
        setPasses(list);
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        setError(extractApiError(err, 'Failed to fetch exit passes.'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [debouncedSearch, statusFilter]
  );

  useEffect(() => {
    void fetchPasses(false);
  }, [fetchPasses]);

  const fetchStudents = async () => {
    studentsAbortRef.current?.abort();
    const controller = new AbortController();
    studentsAbortRef.current = controller;

    const cached = peekApiCache<any>(API_ROUTES.students.dropdown);
    if (cached) {
      setStudents(cached?.results ?? (Array.isArray(cached) ? cached : []));
      setLoadingStudents(false);
    } else {
      setLoadingStudents(true);
    }

    try {
      const res = await apiClient.get<any>(API_ROUTES.students.dropdown, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStudents(res.data?.results ?? (Array.isArray(res.data) ? res.data : []));
    } catch {
      if (!controller.signal.aborted) setStudents([]);
    } finally {
      if (!controller.signal.aborted) setLoadingStudents(false);
    }
  };

  const toInputDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenCreateModal = (scope: 'STUDENT' | 'TEACHER') => {
    setEditingPass(null);
    setPassScope(scope);
    const now = new Date();
    setFormData({
      student_id: '',
      pass_type: scope === 'STUDENT' ? 'Clinic / Medical Clearance' : 'Official Travel Order',
      destination: '',
      reason: '',
      valid_until: toInputDate(new Date(now.getTime() + 4 * 3600000)),
    });
    setAttachedFile(null);
    setClearExistingProof(false);
    if (scope === 'STUDENT') void fetchStudents();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (pass: ExitPassItem) => {
    setEditingPass(pass);
    setPassScope(pass.pass_scope || (pass.student_id ? 'STUDENT' : 'TEACHER'));
    const toDt = pass.valid_until ? new Date(pass.valid_until) : new Date(Date.now() + 4 * 3600000);
    setFormData({
      student_id: pass.student_id ? String(pass.student_id) : '',
      pass_type: pass.pass_type || '',
      destination: pass.destination || '',
      reason: pass.reason || '',
      valid_until: isNaN(toDt.getTime()) ? toInputDate(new Date(Date.now() + 4 * 3600000)) : toInputDate(toDt),
    });
    setAttachedFile(null);
    setClearExistingProof(false);
    if (pass.pass_scope === 'STUDENT') void fetchStudents();
    setIsModalOpen(true);
  };

  const handleSubmitPass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (attachedFile && attachedFile.size > 2 * 1024 * 1024) {
      showAlert({ title: 'File Too Large', message: 'Attachment must be 2 MB or smaller.', type: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const cleanPassType = sanitizeInput(formData.pass_type, 60);
      const cleanReason = sanitizeInput(formData.reason, 500);
      const cleanDest = sanitizeInput(formData.destination, 200);
      if (!cleanPassType || !cleanReason) {
        showAlert({ title: 'Details Required', message: 'Please enter a valid pass type and reason.', type: 'warning' });
        setSubmitting(false);
        return;
      }

      const payload = new FormData();
      payload.append('pass_scope', passScope);
      payload.append('pass_type', cleanPassType);
      payload.append('destination', cleanDest);
      payload.append('reason', cleanReason);
      payload.append('valid_until', new Date(formData.valid_until).toISOString());
      if (attachedFile) {
        payload.append('attachment', attachedFile);
      } else if (editingPass && clearExistingProof) {
        payload.append('clear_proof', 'true');
      }

      if (passScope === 'STUDENT') {
        if (!formData.student_id) {
          showAlert({ title: 'Student Required', message: 'Please select a student.', type: 'warning' });
          setSubmitting(false);
          return;
        }
        payload.append('student_id', formData.student_id);
      }

      if (editingPass) {
        await apiClient.patch(`${API_ROUTES.attendance.exitPasses}${editingPass.id}/`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showAlert({ title: 'Pass Updated', message: `Exit pass #${editingPass.pass_number} updated.`, type: 'success' });
      } else {
        await apiClient.post(API_ROUTES.attendance.exitPasses, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const pendingApproval = passScope === 'TEACHER' && !isLeader;
        showAlert({
          title:
            passScope === 'TEACHER'
              ? pendingApproval
                ? 'Locator Slip Submitted for Approval'
                : 'Teacher Travel Pass Issued'
              : 'Student Exit Pass Issued',
          message: pendingApproval
            ? 'Your official locator slip was sent to your school leader for approval. Campus boundary exemption begins once approved.'
            : 'Pass saved and active. Campus checks will automatically recognize this approved departure until the scheduled return time.',
          type: 'success',
        });
      }

      setIsModalOpen(false);
      setEditingPass(null);
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({ title: 'Submission Error', message: extractApiError(err, 'Unable to save exit pass.'), type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkReturned = async (passId: number) => {
    try {
      await apiClient.post(`${API_ROUTES.attendance.exitPasses}${passId}/mark-returned/`);
      showAlert({ title: 'Return Recorded', message: 'Welcome back — return to campus has been recorded.', type: 'success' });
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({ title: 'Notice', message: extractApiError(err, 'Failed to mark pass as returned.'), type: 'warning' });
    }
  };

  const handleApprovePass = async (pass: ExitPassItem) => {
    if (!isLeader) return;
    try {
      await apiClient.post(`${API_ROUTES.attendance.exitPasses}${pass.id}/approve/`);
      showAlert({
        title: 'Locator Slip Approved',
        message: `Official Locator Slip #${pass.pass_number} approved.`,
        type: 'success',
      });
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({ title: 'Approval Failed', message: extractApiError(err, 'Failed to approve locator slip.'), type: 'error' });
    }
  };

  const handleCancelPass = (pass: ExitPassItem) => {
    showConfirm({
      title: 'Cancel Exit Pass',
      message: `Cancel pass #${pass.pass_number}?`,
      confirmLabel: 'Cancel Pass',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.post(`${API_ROUTES.attendance.exitPasses}${pass.id}/cancel/`);
          showAlert({ title: 'Pass Cancelled', message: `Pass #${pass.pass_number} cancelled.`, type: 'info' });
          await fetchPasses(true);
        } catch (err: unknown) {
          showAlert({ title: 'Error', message: extractApiError(err, 'Failed to cancel pass.'), type: 'error' });
        }
      },
    });
  };

  const handleDeletePass = (pass: ExitPassItem) => {
    showConfirm({
      title: 'Delete Exit Pass',
      message: `Permanently delete pass #${pass.pass_number}?`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`${API_ROUTES.attendance.exitPasses}${pass.id}/`);
          setPasses((prev) => prev.filter((item) => item.id !== pass.id));
          showAlert({ title: 'Pass Deleted', message: `Pass #${pass.pass_number} removed.`, type: 'success' });
        } catch (err: unknown) {
          showAlert({ title: 'Delete Failed', message: extractApiError(err, 'Could not delete pass.'), type: 'error' });
        }
      },
    });
  };

  const resolveStatus = (p: ExitPassItem) => p.pass_status || p.status || 'ACTIVE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(14px, 2.5vw, 24px)', boxSizing: 'border-box', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, backgroundColor: tokens.bgSurface, padding: 14, borderRadius: 12, border: `1px solid ${tokens.borderSubtle}` }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['ALL', 'PENDING_APPROVAL', 'ACTIVE', 'RETURNED', 'OVERDUE', 'CANCELLED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${statusFilter === st ? brand.buttonBg : tokens.borderStrong}`,
                backgroundColor: statusFilter === st ? brand.buttonBg : tokens.bgSurfaceSubtle,
                color: statusFilter === st ? tokens.onPrimary : tokens.textSecondary,
              }}
            >
              {PASS_STATUS_LABELS[st] || st}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="md" type="button" onClick={() => handleOpenCreateModal('TEACHER')}>
            <FileText size={15} style={{ marginRight: 6 }} /> Request Locator Slip
          </Button>
          {canIssueStudentPass && (
            <Button variant="primary" size="md" type="button" onClick={() => handleOpenCreateModal('STUDENT')}>
              <Plus size={15} style={{ marginRight: 6 }} /> Issue Student Exit Pass
            </Button>
          )}
        </div>
      </div>

      <ModuleTableLayout
        title="Exit & Official Travel Passes"
        subtitle="Authorized departures for students and teachers. Active passes prevent false teacher loafing and student cutting alerts."
        searchPlaceholder="Search pass #, student, teacher, destination, reason..."
        searchValue={search}
        onSearchChange={setSearch}
        loading={loading}
        error={error}
        data={passes}
        keyExtractor={(p) => p.id}
        columns={[
          {
            header: 'Pass Reference #',
            render: (p) => (
              <div>
                <strong style={{ fontFamily: 'monospace', color: brand.primary }}>{p.pass_number}</strong>
                <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>{p.pass_scope} PASS</div>
              </div>
            ),
          },
          {
            header: 'Authorized Bearer',
            render: (p) => (
              <div>
                <strong style={{ color: tokens.textPrimary, fontSize: '0.86rem' }}>
                  {p.pass_scope === 'STUDENT' ? p.student_name : p.teacher_name}
                </strong>
                <div style={{ fontSize: '0.68rem', color: tokens.textSecondary }}>
                  {p.pass_scope === 'STUDENT' ? `LRN: ${p.student_lrn || '—'}` : `Emp ID: ${p.teacher_employee_id || '—'}`}
                </div>
              </div>
            ),
          },
          {
            header: 'Issued By',
            render: (p) => (
              <div style={{ fontSize: '0.78rem', color: tokens.textPrimary }}>
                <strong>{p.issued_by_name || 'School Staff'}</strong>
                {p.pass_scope === 'TEACHER' && p.is_approved && p.approved_by_name && (
                  <div style={{ fontSize: '0.66rem', color: brand.success, fontWeight: 700 }}>
                    Approved by: {p.approved_by_name}
                  </div>
                )}
                <div style={{ fontSize: '0.66rem', color: tokens.textMuted }}>
                  Until: {formatDateTime12h(p.valid_until)}
                </div>
              </div>
            ),
          },
          {
            header: 'Destination & Reason',
            render: (p) => (
              <div style={{ maxWidth: 240 }}>
                <span style={{ fontWeight: 700, fontSize: '0.76rem', color: tokens.textPrimary }}>{p.pass_type}</span>
                {p.destination && (
                  <div style={{ fontSize: '0.70rem', color: brand.primary, fontWeight: 700 }}>{p.destination}</div>
                )}
                <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: tokens.textSecondary }}>{p.reason}</p>
                {isSafeProofUrl(p.attachment_url) && (
                  <a
                    href={p.attachment_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.70rem', color: brand.primary, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
                  >
                    <ExternalLink size={11} /> View Attachment
                  </a>
                )}
              </div>
            ),
          },
          {
            header: 'Status',
            render: (p) => <StatusBadge status={resolveStatus(p)} />,
          },
          {
            header: 'Actions',
            align: 'right',
            render: (p) => {
              const st = resolveStatus(p);
              const isTeacherSlip = p.pass_scope === 'TEACHER';
              const canApproveThis = isLeader && isTeacherSlip && st === 'PENDING_APPROVAL';
              const canCancelThis = isTeacherSlip ? isLeader : canIssueStudentPass;
              const currentUserId = Number(localStorage.getItem('attendsure_user_id') || 0);
              const isOwnPendingSlip =
                isTeacherSlip &&
                st === 'PENDING_APPROVAL' &&
                currentUserId > 0 &&
                p.issued_by !== undefined &&
                p.issued_by !== null &&
                Number(p.issued_by) === currentUserId;
              const canModifyThis =
                isLeader ||
                isOwnPendingSlip ||
                (!isTeacherSlip && canIssueStudentPass && st !== 'RETURNED');
              return (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedPass(p)}
                    title="View Pass Slip"
                    style={{ backgroundColor: tokens.bgSurfaceSubtle, border: `1px solid ${tokens.borderStrong}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                  >
                    <QrCode size={14} color={brand.primary} />
                  </button>

                  {canApproveThis && (
                    <button
                      type="button"
                      onClick={() => void handleApprovePass(p)}
                      title="Approve Official Locator Slip"
                      style={{ backgroundColor: tokens.primaryLight, border: `1px solid ${brand.primary}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                    >
                      <ShieldCheck size={14} color={brand.primary} />
                    </button>
                  )}

                  {(st === 'ACTIVE' || st === 'OVERDUE' || st === 'PENDING_APPROVAL') && (
                    <>
                      {(st === 'ACTIVE' || st === 'OVERDUE') && (
                        <button
                          type="button"
                          onClick={() => void handleMarkReturned(p.id)}
                          title="Mark Returned"
                          style={{ backgroundColor: tokens.successLight, border: `1px solid ${brand.success}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                        >
                          <CheckCircle2 size={14} color={brand.success} />
                        </button>
                      )}
                      {canCancelThis && (
                        <button
                          type="button"
                          onClick={() => handleCancelPass(p)}
                          title="Cancel Pass"
                          style={{ backgroundColor: tokens.warningLight, border: `1px solid ${brand.warning}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                        >
                          <XCircle size={14} color={brand.warning} />
                        </button>
                      )}
                    </>
                  )}

                  {canModifyThis && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(p)}
                        title="Edit Pass"
                        style={{ backgroundColor: tokens.bgSurfaceSubtle, border: `1px solid ${tokens.borderStrong}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                      >
                        <Edit2 size={14} color={brand.primary} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePass(p)}
                        title="Delete Pass"
                        style={{ backgroundColor: tokens.dangerLight, border: `1px solid ${brand.danger}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} color={brand.danger} />
                      </button>
                    </>
                  )}
                </div>
              );
            },
          },
        ]}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPass(null);
        }}
        title={
          editingPass
            ? `Edit Exit Pass #${editingPass.pass_number}`
            : passScope === 'TEACHER'
              ? 'Issue Official Teacher Travel Pass'
              : 'Issue Student Exit Pass'
        }
      >
        <form onSubmit={handleSubmitPass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {passScope === 'STUDENT' ? (
            <>
              <div style={{ padding: 10, backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, fontSize: '0.74rem', color: tokens.textSecondary }}>
                <strong>Parent Hardcopy Excuse Process:</strong> Review the parent&rsquo;s physical hardcopy excuse letter before issuing this Student Exit Pass. Optionally attach a photo or PDF scan below.
              </div>
              <div>
                <label style={ui.label}>Select Student *</label>
                {loadingStudents ? (
                  <div style={{ fontSize: '0.74rem', color: tokens.textMuted, padding: '8px 0' }}>Loading student list...</div>
                ) : (
                  <select required value={formData.student_id} onChange={(e) => setFormData({ ...formData, student_id: e.target.value })} style={ui.input}>
                    <option value="">-- Choose Student --</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} (LRN: {s.lrn})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          ) : (
            <div style={{ padding: 10, backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, fontSize: '0.74rem', color: tokens.textSecondary }}>
              <strong>Campus Boundary Protection:</strong>{' '}
              {isLeader
                ? 'Approved official locator slips mark the teacher as Authorized Off-Campus until the scheduled return time.'
                : 'Your locator slip starts as Pending Approval. Campus boundary exemption begins once a school leader approves it.'}
            </div>
          )}

          <div>
            <label style={ui.label}>Pass Category *</label>
            <input type="text" required maxLength={60} value={formData.pass_type} onChange={(e) => setFormData({ ...formData, pass_type: e.target.value })} style={ui.input} />
          </div>

          <div>
            <label style={ui.label}>Destination</label>
            <input type="text" maxLength={200} value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="e.g. DepEd Division Office / Health Clinic" style={ui.input} />
          </div>

          <div>
            <label style={ui.label}>Reason *</label>
            <textarea required rows={3} maxLength={500} value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} placeholder="State purpose of travel or exit..." style={ui.input} />
          </div>

          <div>
            <label style={ui.label}>Valid Until (Expected Return) *</label>
            <input type="datetime-local" required value={formData.valid_until} onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })} style={ui.input} />
            {formData.valid_until && (
              <div style={{ marginTop: 4, fontSize: '0.70rem', color: tokens.textMuted, fontWeight: 700 }}>
                Return time: {formatDateTime12h(formData.valid_until)}
              </div>
            )}
          </div>

          <div>
            <label style={ui.label}>
              {passScope === 'STUDENT'
                ? 'Hardcopy Excuse Letter / Proof (Photo or PDF, up to 2 MB)'
                : 'Travel Order / Supporting Proof (Photo or PDF, up to 2 MB)'}
            </label>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setAttachedFile(e.target.files?.[0] || null);
                setClearExistingProof(false);
              }}
              style={{ fontSize: '0.76rem', color: tokens.textPrimary }}
            />
            {editingPass && isSafeProofUrl(editingPass.attachment_url) && !attachedFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, fontSize: '0.72rem' }}>
                {!clearExistingProof ? (
                  <>
                    <a
                      href={editingPass.attachment_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: brand.primary, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ExternalLink size={12} /> View Current Proof
                    </a>
                    <button
                      type="button"
                      onClick={() => setClearExistingProof(true)}
                      style={{
                        border: `1px solid ${brand.danger}`,
                        backgroundColor: tokens.dangerLight,
                        color: brand.danger,
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Remove Proof
                    </button>
                  </>
                ) : (
                  <span style={{ color: brand.warning, fontWeight: 700 }}>
                    Current proof will be removed when you save.{' '}
                    <button
                      type="button"
                      onClick={() => setClearExistingProof(false)}
                      style={{
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: brand.primary,
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      Keep it
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => { setIsModalOpen(false); setEditingPass(null); }}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editingPass ? 'Save Changes' : 'Issue Pass'}
            </Button>
          </div>
        </form>
      </Modal>

      {selectedPass && (
        <Modal isOpen={Boolean(selectedPass)} onClose={() => setSelectedPass(null)} title="Official Campus Exit Slip">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 300, backgroundColor: SEAL_COLORS.white, border: `2px solid ${SEAL_COLORS.ink}`, borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: SEAL_COLORS.mutedBorder }}>DEPARTMENT OF EDUCATION</div>
              <div style={{ fontSize: '0.90rem', fontWeight: 900, color: SEAL_COLORS.ink, marginTop: 2 }}>
                {school.school_name || 'ATTENDSURE CAMPUS'}
              </div>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: SEAL_COLORS.navy, marginTop: 2 }}>
                OFFICIAL EXIT CLEARANCE SLIP
              </div>
              <div style={{ fontSize: '0.66rem', color: SEAL_COLORS.mutedBorder, fontFamily: 'monospace' }}>Pass #: {selectedPass.pass_number}</div>

              <div style={{ borderTop: `1px dashed ${SEAL_COLORS.border}`, borderBottom: `1px dashed ${SEAL_COLORS.border}`, padding: '8px 0', margin: '8px 0' }}>
                <div style={{ fontSize: '0.70rem', color: SEAL_COLORS.mutedBorder }}>Bearer Name</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: SEAL_COLORS.ink }}>
                  {selectedPass.pass_scope === 'STUDENT' ? selectedPass.student_name : selectedPass.teacher_name}
                </div>
                {selectedPass.destination && (
                  <div style={{ fontSize: '0.72rem', color: SEAL_COLORS.navy, fontWeight: 700, marginTop: 2 }}>
                    Destination: {selectedPass.destination}
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: SEAL_COLORS.ink, marginTop: 2 }}>
                  <strong>Reason:</strong> {selectedPass.reason}
                </div>
              </div>

              <div style={{ margin: '8px auto', width: 130, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCodeSvg value={`ATTENDSURE-EXITPASS:${selectedPass.pass_number}`} size={130} label={`Exit Pass QR code for ${selectedPass.pass_number}`} />
              </div>

              <div style={{ fontSize: '0.66rem', color: SEAL_COLORS.ink, textAlign: 'left', borderTop: `1px solid ${SEAL_COLORS.subtleBorder}`, paddingTop: 6 }}>
                <div><strong>Issued By:</strong> {selectedPass.issued_by_name || 'School Staff'}</div>
                {selectedPass.pass_scope === 'TEACHER' && selectedPass.approved_by_name && (
                  <div><strong>Approved By:</strong> {selectedPass.approved_by_name}</div>
                )}
                <div><strong>Valid Until:</strong> {formatDateTime12h(selectedPass.valid_until)}</div>
                <div>
                  <strong>Status:</strong>{' '}
                  <span style={{ fontWeight: 800, color: resolveStatus(selectedPass) === 'ACTIVE' ? brand.success : brand.warning }}>
                    {PASS_STATUS_LABELS[resolveStatus(selectedPass)] || resolveStatus(selectedPass)}
                  </span>
                </div>
                {isSafeProofUrl(selectedPass.attachment_url) && (
                  <div style={{ marginTop: 6, paddingTop: 5, borderTop: `1px dashed ${SEAL_COLORS.border}` }}>
                    <a
                      href={selectedPass.attachment_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.66rem', color: SEAL_COLORS.navy, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ExternalLink size={11} /> Open Attached Proof Document
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setSelectedPass(null)}>Close</Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
                <Printer size={15} style={{ marginRight: 6 }} /> Print Slip
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GatePassesTab;
