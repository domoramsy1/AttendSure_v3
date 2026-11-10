/**
 * AttendSure - Campus Gate Passes & Exit Clearances
 * File: web/src/components/tabs/GatePassesTab.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useSchool } from '../../context/SchoolContext';
import { useTheme } from '../../context/ThemeContext';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import {
  CheckCircle2,
  Printer,
  QrCode,
  FileText,
  Plus,
  FileCheck,
  FileX,
  ExternalLink,
} from 'lucide-react';

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

export const GatePassesTab: React.FC = () => {
  const { school } = useSchool();
  const { showAlert } = useAlert();
  const { tokens, brand } = useTheme();

  const userRole = (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isPrincipalOrAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(userRole);
  const isGuard = userRole === 'GUARD';

  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedPass, setSelectedPass] = useState<GatePass | null>(null);
  const [reviewingPass, setReviewingPass] = useState<GatePass | null>(null);
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

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<any>('/gate-passes/', {
        params: {
          search: search.trim() || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
        },
      });
      const list = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
      setPasses(list);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to fetch gate passes.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchPasses();
  }, [fetchPasses]);

  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await apiClient.get<any>('/students/?page_size=200');
      const list = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
      setStudents(list);
    } catch {
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleOpenCreateModal = (type: 'STUDENT' | 'FACULTY') => {
    setPassFormType(type);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toInputDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setFormData({
      student_id: '',
      pass_type: type === 'STUDENT' ? 'Clinic / Medical Clearance' : 'Official DepEd Travel Order',
      reason: '',
      valid_from: toInputDate(now),
      valid_to: toInputDate(new Date(now.getTime() + 4 * 3600000)),
    });
    setAttachedFile(null);

    if (type === 'STUDENT') {
      fetchStudents();
    }
    setIsModalOpen(true);
  };

  const handleSubmitPass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!attachedFile) {
      showAlert({
        title: 'Proof Document Required',
        message: 'A proof document (medical referral, parent letter, or travel order) must be attached.',
        type: 'warning',
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('bearer_type', passFormType);
      payload.append('pass_type', formData.pass_type);
      payload.append('reason', formData.reason.trim());
      payload.append('valid_from', new Date(formData.valid_from).toISOString());
      payload.append('valid_to', new Date(formData.valid_to).toISOString());
      payload.append('attachment', attachedFile);

      if (passFormType === 'STUDENT') {
        if (!formData.student_id) {
          showAlert({ title: 'Student Required', message: 'Please select a student.', type: 'warning' });
          setSubmitting(false);
          return;
        }
        payload.append('student', formData.student_id);
      }

      await apiClient.post('/gate-passes/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      showAlert({
        title: passFormType === 'FACULTY' ? 'Travel Pass Submitted' : 'Student Exit Permit Issued',
        message:
          passFormType === 'FACULTY'
            ? 'Travel order submitted to Principal/Admin for document review.'
            : 'Adviser exit permit generated. Administration has been notified.',
        type: 'success',
      });

      setIsModalOpen(false);
      fetchPasses();
    } catch (err: any) {
      showAlert({
        title: 'Submission Error',
        message: err?.response?.data?.attachment?.[0] || 'Unable to submit gate pass.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (passId: number) => {
    try {
      await apiClient.post(`/gate-passes/${passId}/approve/`);
      showAlert({ title: 'Pass Approved', message: 'Travel pass approved and active for gate departure.', type: 'success' });
      setReviewingPass(null);
      fetchPasses();
    } catch {
      showAlert({ title: 'Error', message: 'Failed to approve pass.', type: 'error' });
    }
  };

  const handleDecline = async () => {
    if (!reviewingPass) return;
    try {
      await apiClient.post(`/gate-passes/${reviewingPass.id}/decline/`, {
        reason: declineReason.trim() || 'Declined upon document authenticity review.',
      });
      showAlert({ title: 'Pass Declined', message: 'Gate pass has been declined.', type: 'info' });
      setShowDeclineModal(false);
      setReviewingPass(null);
      fetchPasses();
    } catch {
      showAlert({ title: 'Error', message: 'Failed to decline pass.', type: 'error' });
    }
  };

  const handleMarkUsed = async (passId: number) => {
    try {
      await apiClient.post(`/gate-passes/${passId}/mark-used/`);
      showAlert({ title: 'Exit Confirmed', message: 'Bearer departure confirmed.', type: 'success' });
      fetchPasses();
    } catch (err: any) {
      showAlert({ title: 'Notice', message: err?.response?.data?.error || 'Failed to update.', type: 'warning' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(14px, 2.5vw, 24px)', boxSizing: 'border-box', width: '100%' }}>
      {/* Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, backgroundColor: tokens.bgSurface, padding: 14, borderRadius: 12, border: `1px solid ${tokens.borderSubtle}` }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['ALL', 'PENDING', 'ACTIVE', 'USED', 'DECLINED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${statusFilter === st ? brand.primary : tokens.borderStrong}`,
                backgroundColor: statusFilter === st ? brand.primary : tokens.bgSurfaceSubtle,
                color: statusFilter === st ? '#ffffff' : tokens.textSecondary,
              }}
            >
              {st === 'PENDING' ? 'Pending Review' : st}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" type="button" onClick={() => handleOpenCreateModal('FACULTY')}>
            <FileText size={15} style={{ marginRight: 6 }} /> Request Official Travel Pass
          </Button>
          {!isGuard && (
            <Button variant="primary" size="md" type="button" onClick={() => handleOpenCreateModal('STUDENT')} style={{ backgroundColor: brand.primary, borderColor: brand.primary }}>
              <Plus size={15} style={{ marginRight: 6 }} /> Issue Student Exit Pass
            </Button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <ModuleTableLayout
        title="Campus Gate Passes & Exit Clearances"
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
                {p.attachment_url ? (
                  <a
                    href={p.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.70rem', color: brand.primary, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
                  >
                    <ExternalLink size={11} /> View Attached Proof
                  </a>
                ) : (
                  <span style={{ fontSize: '0.68rem', color: brand.danger }}>No file attached</span>
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
                <span style={{ padding: '3px 8px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 800, backgroundColor: `${colorMap[p.status] || '#64748b'}20`, color: colorMap[p.status] || '#64748b' }}>
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
                    style={{ backgroundColor: brand.primary, color: '#ffffff', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Review Authenticity
                  </button>
                )}

                {p.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleMarkUsed(p.id)}
                    title="Confirm Exit"
                    style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                  >
                    <CheckCircle2 size={14} color="#10b981" />
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />

      {/* MODAL 1: Create Pass with Mandatory Attachment */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={passFormType === 'FACULTY' ? 'Request Official Travel Pass' : 'Issue Student Gate Exit Permit'}>
        <form onSubmit={handleSubmitPass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {passFormType === 'STUDENT' ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>Select Student Learner *</label>
              {loadingStudents ? (
                <div style={{ fontSize: '0.74rem', color: tokens.textMuted, padding: '8px 0' }}>Loading student list...</div>
              ) : (
                <select
                  required
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurfaceSubtle }}
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
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>Clearance Category *</label>
            <input
              type="text"
              required
              value={formData.pass_type}
              onChange={(e) => setFormData({ ...formData, pass_type: e.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurfaceSubtle }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>Valid Reason &amp; Destination Details *</label>
            <textarea
              required
              rows={3}
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="State purpose of travel or valid exit reason..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurfaceSubtle }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>
              Upload Supporting Document (Travel Order / Medical Certificate / Parent Letter) *
            </label>
            <input
              type="file"
              required
              accept=".pdf,image/*"
              onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
              style={{ fontSize: '0.76rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>Departure Time</label>
              <input
                type="datetime-local"
                required
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}` }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, marginBottom: 4 }}>Expected Return</label>
              <input
                type="datetime-local"
                required
                value={formData.valid_to}
                onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}` }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="md" type="submit" disabled={submitting} style={{ backgroundColor: brand.primary }}>
              {submitting ? 'Uploading...' : 'Submit Gate Pass'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Administrator / Principal Document Review */}
      {reviewingPass && (
        <Modal isOpen={Boolean(reviewingPass)} onClose={() => setReviewingPass(null)} title="Inspect Proof Document Authenticity">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>FACULTY APPLICANT</span>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary }}>{reviewingPass.faculty_name}</div>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>PURPOSE OF TRAVEL</span>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.84rem', color: tokens.textPrimary }}>{reviewingPass.reason}</p>
            </div>

            <div style={{ padding: 12, backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: tokens.textMuted }}>ATTACHED PROOF FILE</span>
              {reviewingPass.attachment_url ? (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.76rem', color: tokens.textPrimary }}>Uploaded file on record</span>
                  <a
                    href={reviewingPass.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ backgroundColor: brand.primary, color: '#ffffff', padding: '6px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ExternalLink size={12} /> Inspect File
                  </a>
                </div>
              ) : (
                <div style={{ color: brand.danger, fontSize: '0.76rem', marginTop: 4 }}>No document attached!</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setShowDeclineModal(true)} style={{ color: brand.danger }}>
                <FileX size={15} style={{ marginRight: 6 }} /> Decline (Invalid Proof)
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => handleApprove(reviewingPass.id)} style={{ backgroundColor: brand.success, borderColor: brand.success }}>
                <FileCheck size={15} style={{ marginRight: 6 }} /> Approve Authentic Travel Pass
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: Decline Reason Dialog */}
      {showDeclineModal && reviewingPass && (
        <Modal isOpen={showDeclineModal} onClose={() => setShowDeclineModal(false)} title="Decline Gate Pass">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.80rem', color: tokens.textSecondary }}>
              Provide the reason for declining this request (e.g. unverified travel order, missing school seal).
            </p>
            <textarea
              rows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="State reason for declining..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}` }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setShowDeclineModal(false)}>Cancel</Button>
              <Button variant="primary" size="md" type="button" onClick={handleDecline} style={{ backgroundColor: brand.danger, borderColor: brand.danger }}>
                Confirm Decline
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 4: Printable Slip */}
      {selectedPass && (
        <Modal isOpen={Boolean(selectedPass)} onClose={() => setSelectedPass(null)} title="Official Campus Gate Slip">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 300, backgroundColor: '#ffffff', border: '2px solid #0f172a', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b' }}>DEPARTMENT OF EDUCATION</div>
              <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{school.school_name || 'ATTENDSURE CAMPUS'}</div>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: brand.primary, marginTop: 2 }}>OFFICIAL GATE CLEARANCE SLIP</div>
              <div style={{ fontSize: '0.66rem', color: '#64748b', fontFamily: 'monospace' }}>Pass #: {selectedPass.pass_number}</div>

              <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '8px 0', margin: '8px 0' }}>
                <div style={{ fontSize: '0.70rem', color: '#64748b' }}>Bearer Name</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedPass.bearer_type === 'STUDENT' ? selectedPass.student_name : selectedPass.faculty_name}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2 }}><strong>Reason:</strong> {selectedPass.reason}</div>
              </div>

              <div style={{ margin: '8px auto', width: 130, height: 130 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(`ATTENDSURE-GATEPASS:${selectedPass.pass_number}`)}`}
                  alt="Pass QR"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              <div style={{ fontSize: '0.66rem', color: '#334155', textAlign: 'left', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
                <div><strong>Class Adviser / Issuer:</strong> {selectedPass.adviser_name || 'Adviser'}</div>
                <div><strong>Valid To:</strong> {new Date(selectedPass.valid_to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                <div><strong>Status:</strong> <span style={{ fontWeight: 800, color: selectedPass.status === 'ACTIVE' ? '#10b981' : '#f59e0b' }}>{selectedPass.status}</span></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setSelectedPass(null)}>Close</Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()} style={{ backgroundColor: brand.primary }}>
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