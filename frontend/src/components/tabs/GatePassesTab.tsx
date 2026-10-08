import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Printer,
  QrCode,
  Loader2,
  User,
  FileText,
  Ban,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface GatePass {
  id: number;
  pass_id: string;
  bearer_name: string;
  bearer_type?: 'STUDENT' | 'FACULTY' | 'VISITOR';
  student?: number | null;
  faculty?: number | null;
  reason: string;
  valid_from: string;
  valid_to: string;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
  approved_by?: string;
  remarks?: string;
  created_at?: string;
}

interface LearnerOption {
  id: number;
  lrn: string;
  full_name: string;
}

interface FacultyOption {
  id: number;
  full_name: string;
  department?: string;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

export const GatePassesTab: React.FC = () => {
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Server Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Slips & Modals
  const [selectedPass, setSelectedPass] = useState<GatePass | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Real database dropdown options
  const [learners, setLearners] = useState<LearnerOption[]>([]);
  const [facultyMembers, setFacultyMembers] = useState<FacultyOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    bearer_type: 'STUDENT' as 'STUDENT' | 'FACULTY',
    student_id: '',
    faculty_id: '',
    reason_preset: 'Medical / Health Emergency',
    custom_reason: '',
    valid_from: '',
    valid_to: '',
    approved_by: 'Office of the Principal',
    remarks: '',
  });

  // 1. Fetch real passes from database
  const fetchPasses = useCallback(async (page = 1, size = 25, query = '', status = 'ALL') => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<PaginatedResponse<GatePass> | GatePass[]>('/gate-passes/', {
        params: {
          page,
          page_size: size,
          search: query.trim() || undefined,
          status: status !== 'ALL' ? status : undefined,
        },
      });

      if (res.data && 'results' in res.data) {
        setPasses(res.data.results);
        setTotalCount(res.data.count);
        setTotalPages(res.data.total_pages || Math.ceil(res.data.count / size) || 1);
        setCurrentPage(res.data.current_page || page);
      } else if (Array.isArray(res.data)) {
        setPasses(res.data);
        setTotalCount(res.data.length);
        setTotalPages(1);
        setCurrentPage(1);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to fetch gate pass records from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchPasses(1, pageSize, search, statusFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, pageSize, fetchPasses]);

  // 2. Fetch real students and faculty for the create modal
  const fetchBearerOptions = async () => {
    setLoadingOptions(true);
    try {
      const [studentsRes, facultyRes] = await Promise.all([
        apiClient.get<any>('/students/?page_size=100'),
        apiClient.get<any>('/faculty/?page_size=100'),
      ]);

      const studentList = Array.isArray(studentsRes.data)
        ? studentsRes.data
        : studentsRes.data?.results || [];
      const facultyList = Array.isArray(facultyRes.data)
        ? facultyRes.data
        : facultyRes.data?.results || [];

      setLearners(
        studentList.map((s: any) => ({
          id: s.id,
          lrn: s.lrn,
          full_name: s.full_name || `${s.last_name}, ${s.first_name}`,
        }))
      );

      setFacultyMembers(
        facultyList.map((f: any) => ({
          id: f.id,
          full_name: f.full_name || `${f.last_name}, ${f.first_name}`,
          department: f.department || f.designation,
        }))
      );
    } catch {
      // Keep lists empty if loading fails
    } finally {
      setLoadingOptions(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchPasses(newPage, pageSize, search, statusFilter);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchPasses(1, newSize, search, statusFilter);
  };

  // Metrics from current database records
  const metrics = useMemo(() => {
    const safePasses = Array.isArray(passes) ? passes : [];
    const active = safePasses.filter((p) => p.status === 'ACTIVE').length;
    const used = safePasses.filter((p) => p.status === 'USED').length;
    const expiredOrRevoked = safePasses.filter((p) => p.status === 'EXPIRED' || p.status === 'REVOKED').length;
    return { active, used, expiredOrRevoked };
  }, [passes]);

  // Open Create Modal
  const handleOpenCreate = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toInputDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const defaultStart = new Date(now);
    const defaultEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours window

    setFormData({
      bearer_type: 'STUDENT',
      student_id: '',
      faculty_id: '',
      reason_preset: 'Medical / Health Emergency',
      custom_reason: '',
      valid_from: toInputDate(defaultStart),
      valid_to: toInputDate(defaultEnd),
      approved_by: 'Office of the Principal',
      remarks: '',
    });

    fetchBearerOptions();
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let bearerName = '';
      if (formData.bearer_type === 'STUDENT') {
        const found = learners.find((l) => String(l.id) === String(formData.student_id));
        bearerName = found ? found.full_name : 'Student';
      } else {
        const found = facultyMembers.find((f) => String(f.id) === String(formData.faculty_id));
        bearerName = found ? found.full_name : 'Faculty Member';
      }

      const finalReason = formData.custom_reason.trim()
        ? `${formData.reason_preset}: ${formData.custom_reason.trim()}`
        : formData.reason_preset;

      const payload = {
        bearer_name: bearerName,
        bearer_type: formData.bearer_type,
        student: formData.bearer_type === 'STUDENT' && formData.student_id ? Number(formData.student_id) : null,
        faculty: formData.bearer_type === 'FACULTY' && formData.faculty_id ? Number(formData.faculty_id) : null,
        reason: finalReason,
        valid_from: formData.valid_from,
        valid_to: formData.valid_to,
        status: 'ACTIVE',
        approved_by: formData.approved_by.trim() || 'Principal Office',
        remarks: formData.remarks.trim() || undefined,
      };

      await apiClient.post('/gate-passes/', payload);
      setIsCreateModalOpen(false);
      fetchPasses(1, pageSize, search, statusFilter);
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to issue gate pass.');
    } finally {
      setSaving(false);
    }
  };

  // Revoke / Cancel a pass
  const handleRevoke = async (pass: GatePass) => {
    if (!window.confirm(`REVOKE PASS: Do you want to cancel Gate Pass "${pass.pass_id}" for ${pass.bearer_name}? It will no longer be accepted at the gate.`)) {
      return;
    }
    try {
      await apiClient.put(`/gate-passes/${pass.id}/`, { ...pass, status: 'REVOKED' });
      fetchPasses(currentPage, pageSize, search, statusFilter);
    } catch {
      alert('Failed to revoke gate pass.');
    }
  };

  // Mark Pass as Used (when student leaves gate)
  const handleMarkUsed = async (pass: GatePass) => {
    try {
      await apiClient.put(`/gate-passes/${pass.id}/`, { ...pass, status: 'USED' });
      fetchPasses(currentPage, pageSize, search, statusFilter);
    } catch {
      alert('Failed to update pass status.');
    }
  };

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* 1. Metric Overview Cards */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>TOTAL PASSES IN DATABASE</span>
            <FileText size={18} color="#0284c7" />
          </div>
          <div style={statVal}>{totalCount}</div>
          <div style={statSub}>All recorded clearance authorizations</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>ACTIVE ON THIS PAGE</span>
            <ShieldCheck size={18} color="#059669" />
          </div>
          <div style={{ ...statVal, color: '#059669' }}>{metrics.active}</div>
          <div style={statSub}>Authorized for gate exit today</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>USED / CLEARED</span>
            <CheckCircle2 size={18} color="#0284c7" />
          </div>
          <div style={{ ...statVal, color: '#0284c7' }}>{metrics.used}</div>
          <div style={statSub}>Bearer already exited the gate</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>EXPIRED OR REVOKED</span>
            <XCircle size={18} color={metrics.expiredOrRevoked > 0 ? '#d97706' : '#64748b'} />
          </div>
          <div style={{ ...statVal, color: metrics.expiredOrRevoked > 0 ? '#d97706' : '#64748b' }}>
            {metrics.expiredOrRevoked}
          </div>
          <div style={statSub}>No longer valid for campus exit</div>
        </div>
      </div>

      {/* 2. Status Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {['ALL', 'ACTIVE', 'USED', 'EXPIRED', 'REVOKED'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              backgroundColor: statusFilter === st ? '#0284c7' : '#ffffff',
              borderColor: statusFilter === st ? '#0284c7' : '#cbd5e1',
              color: statusFilter === st ? '#ffffff' : '#475569',
            }}
          >
            {st}
          </button>
        ))}
      </div>

      {/* 3. Main Data Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="Campus Gate Passes &amp; Exit Clearances"
          subtitle="Authorized campus leaves, parent pickups, and official school business slips."
          searchPlaceholder="Search pass number, bearer name, reason..."
          searchValue={search}
          onSearchChange={setSearch}
          addButtonLabel="Issue Gate Pass"
          onAdd={handleOpenCreate}
          loading={loading}
          error={error}
          data={passes}
          keyExtractor={(p) => p.id || p.pass_id}
          columns={[
            {
              header: 'Pass Reference #',
              render: (p) => (
                <div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                    {p.pass_id}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                    DepEd Official Exit Slip
                  </div>
                </div>
              ),
            },
            {
              header: 'Bearer Name',
              render: (p) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={userIconBox}>
                    <User size={14} color="#0284c7" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.84rem' }}>
                      {p.bearer_name}
                    </div>
                    <span style={roleBadge}>
                      {p.bearer_type || (p.student ? 'STUDENT' : p.faculty ? 'FACULTY' : 'BEARER')}
                    </span>
                  </div>
                </div>
              ),
            },
            {
              header: 'Clearance Reason',
              render: (p) => (
                <div style={{ maxWidth: 220, fontSize: '0.80rem', color: '#334155', lineHeight: 1.3 }}>
                  {p.reason}
                </div>
              ),
            },
            {
              header: 'Validity Period',
              render: (p) => (
                <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600, color: '#059669' }}>From:</span>
                    <span>{new Date(p.valid_from).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span style={{ fontWeight: 600, color: '#dc2626' }}>Until:</span>
                    <span>{new Date(p.valid_to).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ),
            },
            {
              header: 'Status',
              render: (p) => {
                let bg = '#f1f5f9';
                let col = '#475569';
                if (p.status === 'ACTIVE') {
                  bg = '#ecfdf5';
                  col = '#059669';
                } else if (p.status === 'USED') {
                  bg = '#eff6ff';
                  col = '#0284c7';
                } else if (p.status === 'EXPIRED' || p.status === 'REVOKED') {
                  bg = '#fef2f2';
                  col = '#dc2626';
                }
                return (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.70rem',
                      fontWeight: 800,
                      backgroundColor: bg,
                      color: col,
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
                    title="View & Print Official Gate Slip"
                    style={{ ...actionBtn, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
                  >
                    <QrCode size={13} color="#0284c7" />
                  </button>

                  {p.status === 'ACTIVE' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleMarkUsed(p)}
                        title="Mark As Used (Exited Gate)"
                        style={{ ...actionBtn, backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}
                      >
                        <CheckCircle2 size={13} color="#059669" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(p)}
                        title="Revoke / Cancel Pass"
                        style={{ ...actionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                      >
                        <Ban size={13} color="#dc2626" />
                      </button>
                    </>
                  )}
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
                <strong>{totalCount}</strong> gate passes
              </>
            ) : (
              'No gate passes found'
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

      {/* 4. Issue Gate Pass Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Issue Campus Gate Clearance Pass"
      >
        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          <div>
            <label style={labelStyle}>Bearer Role *</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bearer_type"
                  value="STUDENT"
                  checked={formData.bearer_type === 'STUDENT'}
                  onChange={() => setFormData({ ...formData, bearer_type: 'STUDENT' })}
                />
                <span>Student / Learner</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bearer_type"
                  value="FACULTY"
                  checked={formData.bearer_type === 'FACULTY'}
                  onChange={() => setFormData({ ...formData, bearer_type: 'FACULTY' })}
                />
                <span>Teacher / Faculty Member</span>
              </label>
            </div>
          </div>

          {/* Select Real Student or Faculty from database */}
          <div>
            <label style={labelStyle}>
              {formData.bearer_type === 'STUDENT' ? 'Select Student Learner *' : 'Select Faculty Member *'}
            </label>
            {loadingOptions ? (
              <div style={{ fontSize: '0.76rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 className="animate-spin" size={14} />
                <span>Loading members from database...</span>
              </div>
            ) : formData.bearer_type === 'STUDENT' ? (
              <select
                required
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">-- Choose Learner from Database --</option>
                {learners.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name} (LRN: {l.lrn})
                  </option>
                ))}
              </select>
            ) : (
              <select
                required
                value={formData.faculty_id}
                onChange={(e) => setFormData({ ...formData, faculty_id: e.target.value })}
                style={inputStyle}
              >
                <option value="">-- Choose Teacher from Database --</option>
                {facultyMembers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.full_name} {f.department ? `(${f.department})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={labelStyle}>Reason / Clearance Purpose *</label>
            <select
              value={formData.reason_preset}
              onChange={(e) => setFormData({ ...formData, reason_preset: e.target.value })}
              style={inputStyle}
            >
              <option value="Medical / Health Emergency">Medical / Clinic Referral / Health Emergency</option>
              <option value="Official DepEd School Business">Official DepEd School Business / Off-Campus Contest</option>
              <option value="Parent / Guardian Fetching">Parent / Guardian Fetching</option>
              <option value="Early Dismissal Approval">Authorized Early Dismissal</option>
              <option value="Family Emergency">Family Urgent Matter</option>
              <option value="Other Official Reason">Other Official Reason</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Specific Reason Details (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Toothache, Division Science Quiz Bee, Fetch by mother"
              value={formData.custom_reason}
              onChange={(e) => setFormData({ ...formData, custom_reason: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Valid From *</label>
              <input
                type="datetime-local"
                required
                value={formData.valid_from}
                onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Valid Until *</label>
              <input
                type="datetime-local"
                required
                value={formData.valid_to}
                onChange={(e) => setFormData({ ...formData, valid_to: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Approving Official *</label>
            <input
              type="text"
              required
              value={formData.approved_by}
              onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
              style={inputStyle}
              placeholder="e.g. Principal / Prefect of Discipline"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              Issue Official Pass
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. Official Printable Gate Pass Slip Modal */}
      {selectedPass && (
        <Modal
          isOpen={Boolean(selectedPass)}
          onClose={() => setSelectedPass(null)}
          title="Official Campus Exit Clearance Pass"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            
            {/* The printable slip container */}
            <div
              id="printable-gate-pass"
              style={{
                width: 320,
                backgroundColor: '#ffffff',
                border: '2px solid #0f172a',
                borderRadius: 10,
                padding: '16px 18px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px' }}>
                DEPARTMENT OF EDUCATION &bull; DIVISION OF CDO
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                CAMPUS GATE EXIT SLIP
              </div>
              <div style={{ fontSize: '0.66rem', color: '#0284c7', fontWeight: 700, marginTop: 1 }}>
                Pass #: {selectedPass.pass_id}
              </div>

              <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '10px 0', margin: '10px 0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Authorized Bearer</div>
                <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedPass.bearer_name}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: 4 }}>
                  <strong>Reason:</strong> {selectedPass.reason}
                </div>
              </div>

              {/* QR Code for security guard to scan */}
              <div
                style={{
                  margin: '8px auto',
                  padding: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  width: 120,
                  height: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(
                    `ATTENDSURE-GATEPASS:${selectedPass.pass_id}:${selectedPass.bearer_name}`
                  )}`}
                  alt="Gate Pass QR"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>

              <div style={{ fontSize: '0.66rem', color: '#64748b' }}>
                Scan at turnstile kiosk or present to Gate Guard
              </div>

              <div style={{ marginTop: 10, textAlign: 'left', fontSize: '0.66rem', color: '#334155', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <div><strong>Valid From:</strong> {new Date(selectedPass.valid_from).toLocaleString()}</div>
                <div><strong>Valid Until:</strong> {new Date(selectedPass.valid_to).toLocaleString()}</div>
                <div><strong>Approved by:</strong> {selectedPass.approved_by || 'Principal Office'}</div>
                <div><strong>Status:</strong> <span style={{ fontWeight: 800, color: selectedPass.status === 'ACTIVE' ? '#059669' : '#dc2626' }}>{selectedPass.status}</span></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setSelectedPass(null)}>
                Close
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
                <Printer size={15} style={{ marginRight: 6 }} />
                Print Gate Pass Slip
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};

// Styles
const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
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

const userIconBox: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  backgroundColor: '#f0f9ff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const roleBadge: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#64748b',
  backgroundColor: '#f1f5f9',
  padding: '1px 5px',
  borderRadius: 4,
};

const actionBtn: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const paginationContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  boxSizing: 'border-box',
};

const paginationBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  backgroundColor: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
};

const paginationSelect: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

export default GatePassesTab;