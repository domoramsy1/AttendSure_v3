/**
 * AttendSure - Faculty & Staff Directory
 * File: web/src/components/tabs/FacultyTab.tsx
 *
 * Cybersecurity & Performance:
 * 1. Fluid Responsive Layout: Replaces rigid 4-column styles with minmax auto-fit.
 * 2. Instant Input Sanitization: Normalizes Employee IDs, RFID tokens, and phone numbers.
 * 3. Race-Condition Defense: AbortController cancels stale in-flight requests.
 * 4. SVG Vector Standards: All visual indicators use Lucide icons with zero emojis.
 * 5. Simple English Terms: Clean labels for "Faculty and staff directory", "Add faculty member", and "ID Card".
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Pagination, ALL_ROWS_SIZE, exportToCsv } from '../common/Pagination';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import {
  User,
  Plus,
  QrCode,
  Pencil,
  Trash2,
  Copy,
  Check,
  Camera,
  X,
  Loader2,
  CreditCard,
  Mail,
  Phone,
  Briefcase,
  Building,
  ShieldCheck,
  Printer,
  Download,
} from 'lucide-react';

export interface Faculty {
  id: number;
  employee_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name: string;
  position: string;
  department: string;
  contact_number?: string;
  email?: string;
  rfid_uid?: string;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

const FACULTY_POSITIONS = [
  {
    category: 'Classroom Teachers',
    ranks: [
      'Faculty I',
      'Faculty II',
      'Faculty III',
      'Special Science Faculty I',
      'Master Faculty I',
      'Master Faculty II',
      'Master Faculty III',
      'Master Faculty IV',
    ],
  },
  {
    category: 'Department Heads',
    ranks: [
      'Head Faculty I',
      'Head Faculty II',
      'Head Faculty III',
      'Head Faculty IV',
      'Head Faculty V',
      'Head Faculty VI',
    ],
  },
  {
    category: 'School Administration & Leadership',
    ranks: [
      'Assistant School Principal I',
      'Assistant School Principal II',
      'School Principal I',
      'School Principal II',
      'School Principal III',
      'School Principal IV',
      'Secondary School Principal IV',
    ],
  },
  {
    category: 'Non-Teaching & Academic Support',
    ranks: [
      'Administrative Officer II',
      'Administrative Assistant',
      'School Registrar',
      'Guidance Counselor I',
    ],
  },
];

const FACULTY_DEPARTMENTS = [
  'Office of the Principal / Administration',
  'Junior High School',
  'Senior High School',
  'English Department',
  'Science Department',
  'Mathematics Department',
  'Filipino Department',
  'Araling Panlipunan Department',
  'MAPEH Department',
  'TLE / TVL Department',
  'Values Education / EsP Department',
  'Guidance & Counseling Office',
];

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

const INITIAL_FORM_DATA = {
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  position: 'Faculty I',
  department: 'Junior High School',
  contact_number: '',
  email: '',
  rfid_uid: '',
  photo: null as string | null,
};

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Faculty Member',
  size = 40,
  iconSize = 20,
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
        borderRadius: '50%',
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

export const FacultyTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();

  const [facultys, setFacultys] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [inspectingFaculty, setInspectingFaculty] = useState<Faculty | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAbortController = useRef<AbortController | null>(null);
  const isInteracting = useRef(false);
  isInteracting.current = isModalOpen || Boolean(inspectingFaculty);

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
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        textArea.remove();
      } catch (err) {
        console.error('Clipboard copy error:', err);
      }
    }
    if (success) {
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const fetchFacultys = useCallback(
    async (page = 1, size = 25, query = '', deptVal = '', silent = false) => {
      if (activeAbortController.current) {
        activeAbortController.current.abort();
      }
      const controller = new AbortController();
      activeAbortController.current = controller;

      try {
        if (!silent) setLoading(true);
        setError(null);
        const isAll = size >= ALL_ROWS_SIZE;

        const res = await apiClient.get<PaginatedResponse<Faculty> | Faculty[]>('/facultys/', {
          params: {
            page: isAll ? 1 : page,
            page_size: isAll ? 'ALL' : size,
            search: query.trim() || undefined,
            department: deptVal || undefined,
          },
          signal: controller.signal,
        });

        if (res.data && 'results' in res.data) {
          setFacultys(res.data.results);
          setTotalCount(res.data.count);
          setTotalPages(isAll ? 1 : res.data.total_pages || Math.ceil(res.data.count / size) || 1);
          setCurrentPage(isAll ? 1 : res.data.current_page || page);
        } else if (Array.isArray(res.data)) {
          setFacultys(res.data);
          setTotalCount(res.data.length);
          setTotalPages(1);
          setCurrentPage(1);
        }
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (!silent) {
          setError('Unable to load faculty records. Please check server connectivity.');
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
      fetchFacultys(1, pageSize, search, departmentFilter, false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, departmentFilter, pageSize, fetchFacultys]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchFacultys(currentPage, pageSize, search, departmentFilter, true);
      }
    }, 3000);

    return () => clearInterval(liveInterval);
  }, [currentPage, pageSize, search, departmentFilter, fetchFacultys]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchFacultys(newPage, pageSize, search, departmentFilter, false);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchFacultys(1, newSize, search, departmentFilter, false);
  };

  const handleExportFacultyCsv = () => {
    const suffix = pageSize >= ALL_ROWS_SIZE ? 'ALL' : `Page${currentPage}_${pageSize}rows`;
    const exported = exportToCsv(
      `AttendSure_Faculty_${suffix}.csv`,
      ['Employee ID', 'Full Name', 'Position', 'Department', 'Email', 'Contact', 'RFID UID', 'Status'],
      facultys.map((f) => [
        f.employee_id,
        f.full_name,
        f.position,
        f.department,
        f.email || '',
        f.contact_number || '',
        f.rfid_uid || '',
        f.is_active ? 'ACTIVE' : 'INACTIVE',
      ])
    );

    if (exported) {
      showAlert({
        title: 'CSV Exported',
        message: `Exported ${facultys.length} faculty records to CSV.`,
        type: 'success',
      });
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAlert({
        title: 'Unsupported Image Format',
        message: 'Only JPG, PNG, and WebP image formats are accepted.',
        type: 'error',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      showAlert({
        title: 'File Too Large',
        message: 'Profile photos must be 2.5 MB or smaller.',
        type: 'error',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPhotoPreview(base64String);
      setFormData((prev) => ({ ...prev, photo: base64String }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setFormData((prev) => ({ ...prev, photo: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenCreate = () => {
    setEditingFaculty(null);
    setFormData(INITIAL_FORM_DATA);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  const handleOpenEdit = (faculty: Faculty) => {
    setEditingFaculty(faculty);
    setFormData({
      employee_id: faculty.employee_id || '',
      first_name: faculty.first_name || '',
      middle_name: faculty.middle_name || '',
      last_name: faculty.last_name || '',
      suffix: faculty.suffix || '',
      position: faculty.position || 'Faculty I',
      department: faculty.department || 'Junior High School',
      contact_number: faculty.contact_number || '',
      email: faculty.email || '',
      rfid_uid: faculty.rfid_uid || '',
      photo: null,
    });
    setPhotoPreview(faculty.photo_url || faculty.photo || null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const cleanedContact = formData.contact_number.trim().replace(/[\s-]/g, '');
    const cleanPayload: Record<string, any> = {
      employee_id: formData.employee_id.trim().toUpperCase(),
      first_name: formData.first_name.trim(),
      middle_name: formData.middle_name.trim(),
      last_name: formData.last_name.trim(),
      suffix: formData.suffix.trim(),
      position: formData.position.trim(),
      department: formData.department.trim(),
      email: formData.email.trim().toLowerCase(),
      contact_number: cleanedContact,
      rfid_uid: formData.rfid_uid.trim().toUpperCase() || null,
    };

    if (formData.photo !== null) {
      cleanPayload.photo = formData.photo === '' ? null : formData.photo;
    }

    try {
      if (editingFaculty) {
        const res = await apiClient.put<Faculty>(`/facultys/${editingFaculty.id}/`, cleanPayload);
        setFacultys((prev) => prev.map((f) => (f.id === editingFaculty.id ? res.data : f)));
        showAlert({
          title: 'Profile Updated',
          message: `Saved changes for ${editingFaculty.first_name} ${editingFaculty.last_name}.`,
          type: 'success',
        });
      } else {
        const res = await apiClient.post<Faculty>('/facultys/', cleanPayload);
        setFacultys((prev) => [res.data, ...prev]);
        showAlert({
          title: 'Faculty Registered',
          message: `${cleanPayload.first_name} ${cleanPayload.last_name} registered successfully.`,
          type: 'success',
        });
      }
      setIsModalOpen(false);
      fetchFacultys(currentPage, pageSize, search, departmentFilter, true);
    } catch (err: any) {
      const serverMessage =
        err.response?.data?.employee_id?.[0] ||
        err.response?.data?.rfid_uid?.[0] ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.detail ||
        'Failed to save faculty record. Please verify details.';

      showAlert({
        title: 'Save Failed',
        message: serverMessage,
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const promptDelete = (faculty: Faculty) => {
    showConfirm({
      title: 'Delete Faculty Member',
      message: `Permanently delete ${faculty.full_name || faculty.first_name} (${faculty.employee_id}) from the faculty registry?`,
      confirmLabel: 'Delete Faculty',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/facultys/${faculty.id}/`);
          setFacultys((prev) => prev.filter((f) => f.id !== faculty.id));
          if (inspectingFaculty?.id === faculty.id) setInspectingFaculty(null);
          showAlert({
            title: 'Faculty Removed',
            message: `Record for ${faculty.first_name} has been deleted.`,
            type: 'info',
          });
          fetchFacultys(currentPage, pageSize, search, departmentFilter, true);
        } catch (err: any) {
          showAlert({
            title: 'Delete Failed',
            message: err?.response?.data?.detail || 'Unable to delete faculty member.',
            type: 'error',
          });
        }
      },
    });
  };

  const activeFacultyCount = facultys.filter((f) => f.is_active).length;
  const pairedCardsCount = facultys.filter((f) => Boolean(f.rfid_uid && f.rfid_uid.trim().length > 0)).length;
  const uniqueDepartments = new Set(facultys.map((f) => f.department).filter(Boolean)).size;

  const allPositions = FACULTY_POSITIONS.flatMap((p) => p.ranks);
  const isCustomPosition = Boolean(formData.position && !allPositions.includes(formData.position));
  const isCustomDepartment = Boolean(formData.department && !FACULTY_DEPARTMENTS.includes(formData.department));
  const isCustomSuffix = Boolean(formData.suffix && !SUFFIX_OPTIONS.includes(formData.suffix));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2.5vw, 20px)' }}>
      {/* 1. Live Faculty Telemetry Cards */}
      <div style={statsContainer}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL REGISTERED FACULTY</div>
          <div style={statValue}>{totalCount || facultys.length}</div>
          <div style={statHelp}>Permanent and contractual staff</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>ACTIVE ON DUTY</div>
          <div style={{ ...statValue, color: '#059669' }}>{activeFacultyCount}</div>
          <div style={statHelp}>Eligible for DTR gate tracking</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>RFID CARDS PAIRED</div>
          <div style={{ ...statValue, color: '#004b87' }}>
            {pairedCardsCount}
            <span style={{ fontSize: '0.80rem', color: '#94a3b8', fontWeight: 500 }}> / {facultys.length}</span>
          </div>
          <div style={statHelp}>Linked gate security credentials</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>DEPARTMENTS</div>
          <div style={{ ...statValue, color: '#d97706' }}>{uniqueDepartments}</div>
          <div style={statHelp}>Academic and admin divisions</div>
        </div>
      </div>

      {/* 2. Control Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={selectPill}
          >
            <option value="">All Departments</option>
            {FACULTY_DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleExportFacultyCsv} style={exportCsvBtnStyle}>
            <Download size={13} />
            <span>Export CSV ({facultys.length})</span>
          </button>

          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={handleOpenCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: '#004b87', borderColor: '#004b87' }}
          >
            <Plus size={15} />
            Add Faculty Member
          </Button>
        </div>
      </div>

      {/* 3. Main Faculty Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="Faculty & Staff Directory"
          subtitle="Manage verified faculty credentials, academic departments, and physical security access."
          searchPlaceholder="Search by Employee ID, name, or department..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          error={error}
          data={facultys}
          keyExtractor={(t) => t.id}
          columns={[
            {
              header: 'Faculty Member',
              render: (t) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ProfileAvatar
                    photoUrl={t.photo_url || t.photo}
                    name={t.full_name}
                    size={38}
                    iconSize={19}
                  />

                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                      {t.full_name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Mail size={12} color="#94a3b8" /> {t.email || 'No email registered'}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Employee ID',
              render: (t) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={empIdBadge}>{t.employee_id}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(t.employee_id, `emp-${t.id}`)}
                    title="Copy Employee ID"
                    style={copyMiniBtn}
                  >
                    {copiedKey === `emp-${t.id}` ? <Check size={11} color="#059669" /> : <Copy size={11} color="#94a3b8" />}
                  </button>
                </div>
              ),
            },
            {
              header: 'Position & Department',
              render: (t) => (
                <div>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.80rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Briefcase size={12} color="#004b87" /> {t.position}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Building size={12} color="#94a3b8" /> {t.department}
                  </div>
                </div>
              ),
            },
            {
              header: 'School Gate Card',
              render: (t) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CreditCard size={14} color={t.rfid_uid ? '#059669' : '#94a3b8'} />
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.74rem',
                      fontWeight: t.rfid_uid ? 700 : 400,
                      color: t.rfid_uid ? '#059669' : '#94a3b8',
                    }}
                  >
                    {t.rfid_uid || 'Not Paired'}
                  </span>
                </div>
              ),
            },
            {
              header: 'Contact',
              render: (t) =>
                t.contact_number ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: '#475569', fontFamily: 'monospace' }}>
                    <Phone size={12} color="#64748b" /> {t.contact_number}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>None</span>
                ),
            },
            {
              header: 'Status',
              render: (t) => (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 12,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.3px',
                    backgroundColor: t.is_active ? '#ecfdf5' : '#fef2f2',
                    color: t.is_active ? '#059669' : '#dc2626',
                    border: `1px solid ${t.is_active ? '#a7f3d0' : '#fecaca'}`,
                  }}
                >
                  {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              ),
            },
            {
              header: 'Actions',
              align: 'right',
              render: (t) => (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setInspectingFaculty(t)}
                    title="View Gate ID Card"
                    style={actionBtn}
                  >
                    <QrCode size={13} color="#004b87" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(t)}
                    title="Edit Faculty Record"
                    style={actionBtn}
                  >
                    <Pencil size={13} color="#004b87" />
                  </button>

                  <button
                    type="button"
                    onClick={() => promptDelete(t)}
                    title="Delete Faculty Member"
                    style={{ ...actionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                  >
                    <Trash2 size={13} color="#dc2626" />
                  </button>
                </div>
              ),
            },
          ]}
        />

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="faculty members"
          disabled={loading}
        />
      </div>

      {/* 4. Registration & Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingFaculty ? `Edit Faculty: ${editingFaculty.full_name}` : 'Register Faculty Member'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={photoUploadContainer}>
            <ProfileAvatar
              photoUrl={photoPreview}
              name={formData.first_name || 'Preview'}
              size={56}
              iconSize={28}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                Official Portrait Photo
              </span>
              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                JPEG, PNG, or WebP under 2.5 MB.
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePhotoSelect}
                />
                <label onClick={() => fileInputRef.current?.click()} style={uploadBtnLabel}>
                  <Camera size={13} />
                  <span>{photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                </label>

                {photoPreview && (
                  <button type="button" onClick={handleRemovePhoto} style={removePhotoBtn}>
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Employee ID *</label>
            <input
              type="text"
              required
              value={formData.employee_id}
              onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              style={inputStyle}
              placeholder="e.g. EMP-2026-004"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
                placeholder="First name"
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
                placeholder="Last name"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
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
              <label style={labelStyle}>Suffix</label>
              <select
                value={formData.suffix}
                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                style={inputStyle}
              >
                <option value="">None</option>
                {SUFFIX_OPTIONS.filter(Boolean).map((suf) => (
                  <option key={suf} value={suf}>
                    {suf}
                  </option>
                ))}
                {isCustomSuffix && <option value={formData.suffix}>{formData.suffix}</option>}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Position / Official Rank *</label>
              <select
                required
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                style={inputStyle}
              >
                {FACULTY_POSITIONS.map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.ranks.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {isCustomPosition && <option value={formData.position}>{formData.position}</option>}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Assigned Department *</label>
              <select
                required
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                style={inputStyle}
              >
                {FACULTY_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
                {isCustomDepartment && <option value={formData.department}>{formData.department}</option>}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                placeholder="faculty@attendsure.edu.ph"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Contact Number</label>
              <input
                type="text"
                placeholder="09171234567"
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>School Gate Card UID (RFID)</label>
            <input
              type="text"
              placeholder="e.g. 5A92B1C4"
              value={formData.rfid_uid}
              onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving} style={{ backgroundColor: '#004b87', borderColor: '#004b87' }}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              {editingFaculty ? 'Save Changes' : 'Register Faculty'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. Printable ID Card Modal */}
      {inspectingFaculty && (
        <Modal
          isOpen={Boolean(inspectingFaculty)}
          onClose={() => setInspectingFaculty(null)}
          title="Digital Faculty ID Card"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={idCardFrame}>
              <div style={idCardHeader}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px' }}>
                  FACULTY &amp; STAFF CREDENTIAL
                </span>
                <span style={{ fontSize: '0.62rem', color: '#bfdbfe' }}>AttendSure</span>
              </div>

              <div style={{ display: 'flex', gap: 14, padding: '16px 14px', alignItems: 'center' }}>
                <ProfileAvatar
                  photoUrl={inspectingFaculty.photo_url || inspectingFaculty.photo}
                  name={inspectingFaculty.full_name}
                  size={68}
                  iconSize={34}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                    {inspectingFaculty.full_name}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#004b87', fontWeight: 700, marginTop: 3 }}>
                    {inspectingFaculty.position}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>
                    {inspectingFaculty.department}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#334155', marginTop: 3 }}>
                    ID: <strong style={{ fontFamily: 'monospace' }}>{inspectingFaculty.employee_id}</strong>
                  </div>
                </div>
              </div>

              <div style={idCardFooter}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CreditCard size={13} color="#059669" />
                  <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, color: '#059669' }}>
                    {inspectingFaculty.rfid_uid || 'NO RFID CARD'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck size={13} color="#004b87" />
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>DEPED CSC 48</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end', marginTop: 4 }}>
              <Button
                variant="secondary"
                size="md"
                type="button"
                onClick={() => window.print()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={14} />
                Print ID
              </Button>
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => setInspectingFaculty(null)}
                style={{ backgroundColor: '#004b87', borderColor: '#004b87' }}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export const FacultysTab = FacultyTab;
export default FacultyTab;

// ============================================================================
// STYLES
// ============================================================================

const statsContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 12,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '12px 16px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  color: '#64748b',
  marginBottom: 4,
  letterSpacing: '0.4px',
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
  marginTop: 3,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 10,
};

const selectPill: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: '0.78rem',
  color: '#334155',
  outline: 'none',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
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
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const empIdBadge: React.CSSProperties = {
  fontFamily: 'monospace',
  fontWeight: 700,
  fontSize: '0.78rem',
  backgroundColor: '#f8fafc',
  padding: '2px 6px',
  borderRadius: 4,
  border: '1px solid #e2e8f0',
  color: '#334155',
};

const copyMiniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 1,
  display: 'flex',
  alignItems: 'center',
};

const actionBtn: React.CSSProperties = {
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
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const photoUploadContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '12px 14px',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};

const uploadBtnLabel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  backgroundColor: '#004b87',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const removePhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.70rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const idCardFrame: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  backgroundColor: '#ffffff',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  boxShadow: '0 4px 10px rgba(0,0,0,0.06)',
  overflow: 'hidden',
};

const idCardHeader: React.CSSProperties = {
  backgroundColor: '#004b87',
  padding: '10px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const idCardFooter: React.CSSProperties = {
  padding: '10px 14px',
  backgroundColor: '#f8fafc',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};