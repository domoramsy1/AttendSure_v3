/**
 * AttendSure - Campus Exit Passes & Exit Clearances
 * File: web/src/components/tabs/GatePassesTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { ModuleTableLayout } from './ModuleTableLayout';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { CheckCircle2, Printer, QrCode, FileText, Plus, FileCheck, FileX, ExternalLink, Edit2, Trash2 } from 'lucide-react';

interface GatePass {
  id: number;
  pass_number: string;
  bearer_type: 'STUDENT' | 'FACULTY';
  student?: number | null;
  student_name?: string;
  student_lrn?: string;
  faculty?: number | null;
  faculty_name?: string;
  faculty_emp_id?: string;
  pass_type: string;
  reason: string;
  valid_from: string;
  valid_to: string;
  valid_until?: string;
  status: 'PENDING' | 'ACTIVE' | 'USED' | 'DECLINED' | 'EXPIRED' | 'REVOKED';
  attachment_url?: string | null;
  adviser_name?: string;
  approved_by?: string;
}

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
  const { mode, tokens, brand, ui } = useTheme();
  const successBtnBg = mode === 'dark' ? '#059669' : brand.success;

  const userRole = (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isPrincipalOrAdmin = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL'].includes(userRole);
  const isRestrictedRole = userRole === 'PARENT';

  const [passes, setPasses] = useState<GatePass[]>(() => {
    const cached = peekApiCache<any>(API_ROUTES.attendance.exitPasses);
    return cached?.results ?? (Array.isArray(cached) ? cached : []);
  });
  const [loading, setLoading] = useState<boolean>(() => !peekApiCache(API_ROUTES.attendance.exitPasses));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedPass, setSelectedPass] = useState<GatePass | null>(null);
  const [reviewingPass, setReviewingPass] = useState<GatePass | null>(null);
  const [editingPass, setEditingPass] = useState<GatePass | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [passFormType, setPassFormType] = useState<'STUDENT' | 'FACULTY'>('STUDENT');

  const [formData, setFormData] = useState({
    student_id: '',
    pass_type: 'Medical / Health Emergency',
    reason: '',
    valid_from: '',
    valid_to: '',
  });

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [showDeclineModal, setShowDeclineModal] = useState(false);

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
        const cachedList = cached?.results ?? (Array.isArray(cached) ? cached : []);
        setPasses(cachedList);
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
        if (!controller.signal.aborted) {
          setLoading(false);
        }
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
      const list = cached?.results ?? (Array.isArray(cached) ? cached : []);
      setStudents(list);
      setLoadingStudents(false);
    } else {
      setLoadingStudents(true);
    }

    try {
      const res = await apiClient.get<any>(API_ROUTES.students.dropdown, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const list = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
      setStudents(list);
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
        return;
      }
      setStudents([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingStudents(false);
      }
    }
  };

  const toInputDate = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenCreateModal = (type: 'STUDENT' | 'FACULTY') => {
    setEditingPass(null);
    setPassFormType(type);
    const now = new Date();

    setFormData({
      student_id: '',
      pass_type: type === 'STUDENT' ? 'Clinic / Medical Clearance' : 'Official DepEd Travel Order',
      reason: '',
      valid_from: toInputDate(now),
      valid_to: toInputDate(new Date(now.getTime() + 4 * 3600000)),
    });
    setAttachedFile(null);

    if (type === 'STUDENT') {
      void fetchStudents();
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (pass: GatePass) => {
    setEditingPass(pass);
    setPassFormType(pass.bearer_type || (pass.student ? 'STUDENT' : 'FACULTY'));
    const fromDt = pass.valid_from ? new Date(pass.valid_from) : new Date();
    const toDt = (pass.valid_until || pass.valid_to) ? new Date(pass.valid_until || pass.valid_to) : new Date(Date.now() + 4 * 3600000);

    setFormData({
      student_id: pass.student ? String(pass.student) : '',
      pass_type: pass.pass_type || '',
      reason: pass.reason || '',
      valid_from: isNaN(fromDt.getTime()) ? toInputDate(new Date()) : toInputDate(fromDt),
      valid_to: isNaN(toDt.getTime()) ? toInputDate(new Date(Date.now() + 4 * 3600000)) : toInputDate(toDt),
    });
    setAttachedFile(null);

    if (pass.bearer_type === 'STUDENT' || pass.student) {
      void fetchStudents();
    }
    setIsModalOpen(true);
  };

  const handleSubmitPass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (attachedFile && attachedFile.size > 5 * 1024 * 1024) {
      showAlert({
        title: 'File Too Large',
        message: 'Proof attachment must be 5 MB or smaller.',
        type: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const cleanPassType = sanitizeInput(formData.pass_type, 100);
      const cleanReason = sanitizeInput(formData.reason, 500);
      if (!cleanPassType || !cleanReason) {
        showAlert({ title: 'Details Required', message: 'Please enter a valid clearance category and reason.', type: 'warning' });
        setSubmitting(false);
        return;
      }

      const payload = new FormData();
      payload.append('bearer_type', passFormType);
      payload.append('pass_type', cleanPassType);
      payload.append('reason', cleanReason);
      payload.append('valid_from', new Date(formData.valid_from).toISOString());
      payload.append('valid_until', new Date(formData.valid_to).toISOString());
      payload.append('valid_to', new Date(formData.valid_to).toISOString());
      if (attachedFile) {
        payload.append('attachment', attachedFile);
      }

      if (passFormType === 'STUDENT') {
        if (!formData.student_id) {
          showAlert({ title: 'Student Required', message: 'Please select a student.', type: 'warning' });
          setSubmitting(false);
          return;
        }
        payload.append('student', formData.student_id);
      }

      if (editingPass) {
        await apiClient.patch(`${API_ROUTES.attendance.exitPasses}${editingPass.id}/`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showAlert({
          title: 'Exit Pass Updated',
          message: `Exit pass #${editingPass.pass_number} has been updated.`,
          type: 'success',
        });
      } else {
        await apiClient.post(API_ROUTES.attendance.exitPasses, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        showAlert({
          title: passFormType === 'FACULTY' ? 'Travel Pass Submitted' : 'Student Exit Permit Issued',
          message:
            passFormType === 'FACULTY'
              ? 'Travel pass submitted to Principal/Admin for approval.'
              : 'Student exit permit generated and parent notified via mobile push.',
          type: 'success',
        });
      }

      setIsModalOpen(false);
      setEditingPass(null);
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({
        title: 'Submission Error',
        message: extractApiError(err, 'Unable to submit exit pass.'),
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePass = (pass: GatePass) => {
    showConfirm({
      title: 'Delete Exit Pass',
      message: `Are you sure you want to permanently remove pass #${pass.pass_number}?`,
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`${API_ROUTES.attendance.exitPasses}${pass.id}/`);
          setPasses((prev) => prev.filter((item) => item.id !== pass.id));
          showAlert({ title: 'Pass Deleted', message: `Pass #${pass.pass_number} has been removed.`, type: 'success' });
        } catch (err: unknown) {
          showAlert({ title: 'Delete Failed', message: extractApiError(err, 'Could not delete exit pass.'), type: 'error' });
        }
      },
    });
  };

  const handleApprove = async (passId: number) => {
    try {
      await apiClient.post(`${API_ROUTES.attendance.exitPasses}${passId}/approve/`);
      showAlert({ title: 'Pass Approved', message: 'Travel pass approved and active for campus departure.', type: 'success' });
      setReviewingPass(null);
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({ title: 'Error', message: extractApiError(err, 'Failed to approve pass.'), type: 'error' });
    }
  };

  const handleDecline = async () => {
    if (!reviewingPass) return;
    try {
      await apiClient.post(`${API_ROUTES.attendance.exitPasses}${reviewingPass.id}/decline/`, {
        reason: sanitizeInput(declineReason, 300) || 'Declined upon document authenticity review.',
      });
      showAlert({ title: 'Pass Declined', message: 'Exit pass has been declined.', type: 'info' });
      setShowDeclineModal(false);
      setDeclineReason('');
      setReviewingPass(null);
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({ title: 'Error', message: extractApiError(err, 'Failed to decline pass.'), type: 'error' });
    }
  };

  const handleMarkUsed = async (passId: number) => {
    try {
      await apiClient.post(`${API_ROUTES.attendance.exitPasses}${passId}/mark-used/`);
      showAlert({ title: 'Exit Confirmed', message: 'Bearer departure confirmed.', type: 'success' });
      await fetchPasses(true);
    } catch (err: unknown) {
      showAlert({ title: 'Notice', message: extractApiError(err, 'Failed to confirm exit.'), type: 'warning' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(14px, 2.5vw, 24px)', boxSizing: 'border-box', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, backgroundColor: tokens.bgSurface, padding: 14, borderRadius: 12, border: `1px solid ${tokens.borderSubtle}` }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['ALL', 'PENDING', 'ACTIVE', 'USED', 'DECLINED'].map((st) => (
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
                color: statusFilter === st ? '#ffffff' : tokens.textSecondary,
              }}
            >
              {st === 'PENDING' ? 'Pending Review' : st}
            </button>
          ))}
        </div>

        {!isRestrictedRole && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="md" type="button" onClick={() => handleOpenCreateModal('FACULTY')}>
              <FileText size={15} style={{ marginRight: 6 }} /> Request Official Travel Pass
            </Button>
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={() => handleOpenCreateModal('STUDENT')}
            >
              <Plus size={15} style={{ marginRight: 6 }} /> Issue Student Exit Pass
            </Button>
          </div>
        )}
      </div>

      <ModuleTableLayout
        title="Campus Exit Passes & Exit Clearances"
        subtitle="Adviser student permits and official faculty travel authorizations."
        searchPlaceholder="Search pass #, student, faculty, reason..."
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
                <div style={{ fontSize: '0.68rem', color: tokens.textMuted }}>{p.bearer_type} CLEARANCE</div>
              </div>
            ),
          },
          {
            header: 'Authorized Bearer',
            render: (p) => (
              <div>
                <strong style={{ color: tokens.textPrimary, fontSize: '0.86rem' }}>
                  {p.bearer_type === 'STUDENT' ? p.student_name : p.faculty_name}
                </strong>
                <div style={{ fontSize: '0.68rem', color: tokens.textSecondary }}>
                  {p.bearer_type === 'STUDENT' ? `LRN: ${p.student_lrn || '—'}` : `Emp ID: ${p.faculty_emp_id || '—'}`}
                </div>
              </div>
            ),
          },
          {
            header: 'Class Adviser / Issuer',
            render: (p) => (
              <div style={{ fontSize: '0.78rem', color: tokens.textPrimary }}>
                <strong>{p.adviser_name || 'Staff User'}</strong>
                <div style={{ fontSize: '0.66rem', color: tokens.textMuted }}>Issuing Authority</div>
              </div>
            ),
          },
          {
            header: 'Reason & Proof File',
            render: (p) => (
              <div style={{ maxWidth: 220 }}>
                <span style={{ fontWeight: 700, fontSize: '0.76rem', color: tokens.textPrimary }}>{p.pass_type}</span>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: tokens.textSecondary }}>{p.reason}</p>
                {isSafeProofUrl(p.attachment_url) ? (
                  <a
                    href={p.attachment_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.70rem', color: brand.primary, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
                  >
                    <ExternalLink size={11} /> View Attached Proof
                  </a>
                ) : (
                  <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>No file attached</span>
                )}
              </div>
            ),
          },
          {
            header: 'Status',
            render: (p) => {
              const colorMap: Record<string, string> = {
                PENDING: '#f59e0b',
                ACTIVE: '#10b981',
                USED: '#0284c7',
                DECLINED: '#ef4444',
                EXPIRED: '#64748b',
              };
              return (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 10,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    backgroundColor: `${colorMap[p.status] || '#64748b'}20`,
                    color: colorMap[p.status] || '#64748b',
                  }}
                >
                  {p.status}
                </span>
              );
            },
          },
          {
            header: 'Actions',
            align: 'right',
            render: (p) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedPass(p)}
                  title="View Slip"
                  style={{ backgroundColor: tokens.bgSurfaceSubtle, border: `1px solid ${tokens.borderStrong}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                >
                  <QrCode size={14} color={brand.primary} />
                </button>

                {isPrincipalOrAdmin && p.status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => setReviewingPass(p)}
                    style={{ backgroundColor: brand.buttonBg, color: '#ffffff', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Review Authenticity
                  </button>
                )}

                {!isRestrictedRole && p.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleMarkUsed(p.id)}
                    title="Confirm Exit"
                    style={{ backgroundColor: tokens.successLight, border: `1px solid ${brand.success}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                  >
                    <CheckCircle2 size={14} color={brand.success} />
                  </button>
                )}

                {!isRestrictedRole && (isPrincipalOrAdmin || p.status !== 'USED') && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(p)}
                      title="Edit Exit Pass"
                      aria-label={`Edit pass ${p.pass_number}`}
                      style={{ backgroundColor: tokens.bgSurfaceSubtle, border: `1px solid ${tokens.borderStrong}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                    >
                      <Edit2 size={14} color={brand.primary} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePass(p)}
                      title="Delete Exit Pass"
                      aria-label={`Delete pass ${p.pass_number}`}
                      style={{ backgroundColor: tokens.dangerLight, border: `1px solid ${brand.danger}`, borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} color={brand.danger} />
                    </button>
                  </>
                )}
              </div>
            ),
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
            : passFormType === 'FACULTY'
              ? 'Request Official Travel Pass'
              : 'Issue Student Exit Permit'
        }
      >
        <form onSubmit={handleSubmitPass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {passFormType === 'STUDENT' ? (
            <div>
              <label style={ui.label}>Select Student Learner *</label>
              {loadingStudents ? (
                <div style={{ fontSize: '0.74rem', color: tokens.textMuted, padding: '8px 0' }}>Loading student list...</div>
              ) : (
                <select
                  required
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  style={ui.input}
                >
                  <option value="">-- Choose Student --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} (LRN: {s.lrn})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div style={{ padding: 10, backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, fontSize: '0.74rem', color: tokens.textSecondary }}>
              <strong>Notice:</strong> Your official travel pass will be submitted to the School Principal or Administrator for file review.
            </div>
          )}

          <div>
            <label style={ui.label}>Clearance Category *</label>
            <input
              type="text"
              required
              maxLength={100}
              value={formData.pass_type}
              onChange={(e) => setFormData({ ...formData, pass_type: e.target.value })}
              style={ui.input}
            />
          </div>

          <div>
            <label style={ui.label}>Valid Reason &amp; Destination Details *</label>
            <textarea
              required
              rows={3}
              maxLength={500}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="State purpose of travel or valid exit reason..."
              style={ui.input}
            />
          </div>

          <div>
            <label style={ui.label}>
              Upload Supporting Document (PDF, JPG, PNG, or WEBP up to 5 MB) {editingPass ? '(Optional to replace)' : ''}
            </label>
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
              style={{ fontSize: '0.76rem', color: tokens.textPrimary }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10 }}>
            <div>
              <label style={ui.label}>Departure Time</label>
              <input
                type="datetime-local"
                required
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                style={ui.input}
              />
            </div>
            <div>
              <label style={ui.label}>Expected Return</label>
              <input
                type="datetime-local"
                required
                value={formData.valid_to}
                onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                style={ui.input}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setEditingPass(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : editingPass ? 'Save Changes' : 'Submit Exit Pass'}
            </Button>
          </div>
        </form>
      </Modal>

      {reviewingPass && (
        <Modal isOpen={Boolean(reviewingPass)} onClose={() => setReviewingPass(null)} title="Inspect Proof Document Authenticity">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>APPLICANT</span>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary }}>
                {reviewingPass.bearer_type === 'STUDENT' ? reviewingPass.student_name : reviewingPass.faculty_name}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>PURPOSE OF TRAVEL</span>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.84rem', color: tokens.textPrimary }}>{reviewingPass.reason}</p>
            </div>

            <div style={{ padding: 12, backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: tokens.textMuted }}>ATTACHED PROOF FILE</span>
              {isSafeProofUrl(reviewingPass.attachment_url) ? (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.76rem', color: tokens.textPrimary }}>Uploaded file on record</span>
                  <a
                    href={reviewingPass.attachment_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ backgroundColor: brand.buttonBg, color: '#ffffff', padding: '6px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={12} /> Inspect File
                  </a>
                </div>
              ) : (
                <div style={{ color: brand.danger, fontSize: '0.76rem', marginTop: 4 }}>No document attached!</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setShowDeclineModal(true)} style={{ color: brand.danger }}>
                <FileX size={15} style={{ marginRight: 6 }} /> Decline (Invalid Proof)
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => handleApprove(reviewingPass.id)} style={{ backgroundColor: successBtnBg, borderColor: successBtnBg }}>
                <FileCheck size={15} style={{ marginRight: 6 }} /> Approve Authentic Travel Pass
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showDeclineModal && reviewingPass && (
        <Modal isOpen={showDeclineModal} onClose={() => setShowDeclineModal(false)} title="Decline Exit Pass">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.80rem', color: tokens.textSecondary }}>
              Provide the reason for declining this request (e.g. unverified travel order, missing school seal).
            </p>
            <textarea
              rows={3}
              maxLength={300}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="State reason for declining..."
              style={ui.input}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setShowDeclineModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="md" type="button" onClick={handleDecline}>
                Confirm Decline
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {selectedPass && (
        <Modal isOpen={Boolean(selectedPass)} onClose={() => setSelectedPass(null)} title="Official Campus Exit Slip">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 300, backgroundColor: '#ffffff', border: '2px solid #0f172a', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b' }}>DEPARTMENT OF EDUCATION</div>
              <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                {school.school_name || 'ATTENDSURE CAMPUS'}
              </div>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#004b87', marginTop: 2 }}>
                OFFICIAL EXIT CLEARANCE SLIP
              </div>
              <div style={{ fontSize: '0.66rem', color: '#64748b', fontFamily: 'monospace' }}>Pass #: {selectedPass.pass_number}</div>

              <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '8px 0', margin: '8px 0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b' }}>Bearer Name</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedPass.bearer_type === 'STUDENT' ? selectedPass.student_name : selectedPass.faculty_name}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}>
                  <strong>Reason:</strong> {selectedPass.reason}
                </div>
              </div>

              <div style={{ margin: '8px auto', width: 130, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCodeSvg
                  value={`ATTENDSURE-EXITPASS:${selectedPass.pass_number}`}
                  size={130}
                  label={`Exit Pass QR code for ${selectedPass.pass_number}`}
                />
              </div>

              <div style={{ fontSize: '0.66rem', color: '#334155', textAlign: 'left', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
                <div>
                  <strong>Class Adviser / Issuer:</strong> {selectedPass.adviser_name || 'Adviser'}
                </div>
                <div>
                  <strong>Valid Until:</strong>{' '}
                  {new Date(selectedPass.valid_until || selectedPass.valid_to).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div>
                  <strong>Status:</strong>{' '}
                  <span style={{ fontWeight: 800, color: selectedPass.status === 'ACTIVE' ? '#059669' : '#d97706' }}>
                    {selectedPass.status}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setSelectedPass(null)}>
                Close
              </Button>
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