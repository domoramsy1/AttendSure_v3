/**
 * AttendSure V3 - Student Directory & ID Cards
 * File: frontend/src/components/tabs/StudentsTab.tsx
 *
 * Key Highlights:
 * 1. DEFAULT USER ICON: Uses <User /> from lucide-react as the neutral fallback for all profiles.
 * 2. NO COLORED INITIALS: Completely removed letter monograms and colored circle backgrounds.
 * 3. FULL CRUD: Enroll new student, inspect ID badge & QR pass, edit profile & photo, delete student.
 * 4. LIVE DATABASE POLLING: Silent 3-second background polling ensures real-time UI synchronization without manual refresh.
 * 5. MODERN MODALS: Custom confirmation dialogs replace blocking browser alert() and confirm() prompts.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertTriangle,
  AlertCircle,
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
  current_section?: string;
  photo?: string | null;
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

  // Reset error state whenever the photo URL changes
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
        borderRadius: shape === 'circle' ? '50%' : '8px',
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

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [copiedLrn, setCopiedLrn] = useState<string | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
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

  // Confirmation Modal State (replaces window.confirm)
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

  // Guard flag: prevents silent background polling from interrupting open modals
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
        const res = await apiClient.get<PaginatedResponse<Student> | Student[]>('/students/', {
          params: {
            page,
            page_size: size,
            search: query.trim() || undefined,
          },
        });

        if (res.data && 'results' in res.data) {
          setStudents(res.data.results);
          setTotalCount(res.data.count);
          setTotalPages(res.data.total_pages || Math.ceil(res.data.count / size));
          setCurrentPage(res.data.current_page || page);
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

  // Debounced search watcher
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCurrentPage(1);
      fetchStudents(1, pageSize, search, false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, pageSize, fetchStudents]);

  // LIVE ZERO-REFRESH POLLING: Syncs fresh data from PostgreSQL every 3 seconds
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
  const totalBoys = students.filter((s) => s.sex === 'Male' || s.sex === 'M').length;
  const totalGirls = students.filter((s) => s.sex === 'Female' || s.sex === 'F').length;
  const pairedCards = students.filter((s) => Boolean(s.rfid_uid && s.rfid_uid.trim().length > 0)).length;
  const unpairedCards = Math.max(0, students.length - pairedCards);

  const handleCopyLrn = (lrn: string) => {
    navigator.clipboard.writeText(lrn);
    setCopiedLrn(lrn);
    setTimeout(() => setCopiedLrn(null), 2000);
  };

  // ============================================================================
  // PHOTO UPLOAD HANDLER
  // ============================================================================

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPEG or PNG).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Profile photo must be smaller than 2 MB.');
      return;
    }

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
    setFormData({
      lrn: student.lrn || '',
      first_name: student.first_name || '',
      middle_name: student.middle_name || '',
      last_name: student.last_name || '',
      sex: student.sex === 'Female' || student.sex === 'F' ? 'Female' : 'Male',
      parent_contact: student.parent_contact || '',
      rfid_uid: student.rfid_uid || '',
      photo: student.photo || null,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload: any = {
        lrn: formData.lrn.trim(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || '',
        last_name: formData.last_name.trim(),
        sex: formData.sex === 'Female' ? 'Female' : 'Male',
        parent_contact: formData.parent_contact.trim() || '',
        rfid_uid: formData.rfid_uid && formData.rfid_uid.trim() !== '' ? formData.rfid_uid.trim() : null,
      };

      if (formData.photo !== undefined) {
        payload.photo = formData.photo;
      }

      if (editingStudent) {
        const res = await apiClient.put<Student>(`/students/${editingStudent.id}/`, payload);
        setStudents((prev) => prev.map((s) => (s.id === editingStudent.id ? res.data : s)));
      } else {
        await apiClient.post<Student>('/students/', payload);
        fetchStudents(1, pageSize, search, true);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      const backendErrors = err.response?.data;
      if (backendErrors && typeof backendErrors === 'object') {
        const errorList = Object.entries(backendErrors)
          .map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(', ') : msg}`)
          .join('\n');
        alert(`Could not save student:\n${errorList}`);
      } else {
        alert(err.response?.data?.detail || 'Failed to save student record.');
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
        } catch {
          alert('Failed to delete student record.');
        }
      },
    });
  };

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* 1. Quick Telemetry Stats Header */}
      <div style={statsContainer}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL STUDENTS</div>
          <div style={statValue}>{totalStudents}</div>
          <div style={statHelp}>Enrolled learners in database</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>SEX RATIO (PAGE)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '1.40rem', fontWeight: 800, color: '#0284c7' }}>{totalBoys}</span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Male</span>
            <span style={{ fontSize: '1.40rem', fontWeight: 800, color: '#ec4899', marginLeft: 6 }}>{totalGirls}</span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Female</span>
          </div>
          <div style={statHelp}>Current page distribution</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>RFID CARDS PAIRED (PAGE)</div>
          <div style={{ fontSize: '1.40rem', fontWeight: 800, color: '#059669' }}>
            {pairedCards}
            <span style={{ fontSize: '0.80rem', color: '#94a3b8', fontWeight: 500 }}> / {students.length}</span>
          </div>
          <div style={statHelp}>Ready for gate card tap</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>NEEDS RFID CARD (PAGE)</div>
          <div style={{ fontSize: '1.40rem', fontWeight: 800, color: unpairedCards > 0 ? '#d97706' : '#059669' }}>
            {unpairedCards}
          </div>
          <div style={statHelp}>Learners without linked card</div>
        </div>
      </div>

      {/* 2. Main Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
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
          data={students}
          keyExtractor={(s) => s.id}
          columns={[
            {
              header: 'Photo & Learner Name',
              render: (s) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Default User Icon / Real Photo Avatar */}
                  <ProfileAvatar
                    photoUrl={s.photo}
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
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                        LRN: {s.lrn}
                      </span>
                      <button
                        onClick={() => handleCopyLrn(s.lrn)}
                        title="Copy LRN"
                        style={copyBtnStyle}
                        type="button"
                      >
                        {copiedLrn === s.lrn ? <Check size={11} color="#059669" /> : <Copy size={11} color="#94a3b8" />}
                      </button>
                      {copiedLrn === s.lrn && (
                        <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 700 }}>Copied!</span>
                      )}
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
                  <div style={rfidChipStyle}>
                    <CreditCard size={12} color="#059669" />
                    <span>{s.rfid_uid}</span>
                  </div>
                ) : (
                  <div style={unlinkedChipStyle}>
                    <CreditCard size={12} color="#d97706" />
                    <span>No Card</span>
                  </div>
                ),
            },
            {
              header: 'Parent Phone (SMS)',
              render: (s) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#334155' }}>
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
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
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
                    style={{ ...iconActionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                    type="button"
                  >
                    <Trash2 size={13} color="#dc2626" />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* Pagination Bar */}
        <div style={paginationContainer}>
          <div style={{ fontSize: '0.80rem', color: '#475569' }}>
            {totalCount > 0 ? (
              <>
                Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of{' '}
                <strong>{totalCount}</strong> students
              </>
            ) : (
              'No records found'
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

      {/* 3. Enroll / Edit Modal with Profile Photo Upload */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? 'Edit Student Details' : 'Enroll New Student'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Profile Photo Uploader with Default User Icon Fallback */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
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
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {formData.photo && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={removePhotoBtn}
                  >
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                Square photo recommended (JPG or PNG, max 2 MB). Defaults to user icon.
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Learner Reference Number (LRN) *</label>
            <input
              type="text"
              required
              maxLength={12}
              value={formData.lrn}
              onChange={(e) => setFormData({ ...formData, lrn: e.target.value.replace(/\D/g, '') })}
              style={inputStyle}
              placeholder="12-digit LRN (e.g. 128930491029)"
            />
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
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Assigned RFID Card UID</label>
            <input
              type="text"
              placeholder="Card UID (e.g. 8A3F29C1)"
              value={formData.rfid_uid}
              onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              {editingStudent ? 'Save Changes' : 'Enroll Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. Student QR Pass Modal with Default User Icon Fallback */}
      {badgeStudent && (
        <Modal
          isOpen={Boolean(badgeStudent)}
          onClose={() => setBadgeStudent(null)}
          title="Official Student ID Pass"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
            <div
              style={{
                width: 290,
                backgroundColor: '#ffffff',
                border: '2px solid #0284c7',
                borderRadius: 12,
                padding: '16px 14px',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#0284c7', letterSpacing: '0.5px' }}>
                ATTENDSURE STUDENT PASS
              </div>
              <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: 12 }}>
                Official Campus Entry Pass
              </div>

              {/* Student Avatar on ID Card */}
              <div style={{ margin: '0 auto 10px auto', display: 'flex', justifyContent: 'center' }}>
                <ProfileAvatar
                  photoUrl={badgeStudent.photo}
                  name={badgeStudent.full_name || badgeStudent.first_name}
                  size={72}
                  iconSize={36}
                  shape="rounded"
                />
              </div>

              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {badgeStudent.full_name || `${badgeStudent.first_name} ${badgeStudent.last_name}`}
              </div>

              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', marginTop: 3 }}>
                Section: {badgeStudent.current_section || 'Unassigned'}
              </div>

              <div
                style={{
                  display: 'inline-block',
                  margin: '8px 0',
                  padding: '3px 8px',
                  backgroundColor: '#f1f5f9',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                LRN: {badgeStudent.lrn}
              </div>

              {/* Student QR Code */}
              <div
                style={{
                  margin: '8px auto',
                  padding: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  width: 110,
                  height: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(badgeStudent.lrn)}`}
                  alt="Student QR Code"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>

              <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: 4 }}>
                RFID: <strong style={{ color: badgeStudent.rfid_uid ? '#059669' : '#d97706' }}>
                  {badgeStudent.rfid_uid || 'No Card Linked'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%', justifyContent: 'center' }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setBadgeStudent(null)}>
                Close
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
                <Printer size={15} style={{ marginRight: 6 }} />
                Print Student ID
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 5. Modern Confirmation Modal */}
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
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 1,
  display: 'flex',
  alignItems: 'center',
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

export default StudentsTab;