/**
 * AttendSure - Faculty & Staff Directory (Theme Adaptive)
 * File: web/src/components/tabs/FacultyTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
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
  Loader2,
  Download,
  Search,
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

export const FacultyTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand } = useTheme();

  const [facultys, setFacultys] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

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
    }, 4000);

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


  // Dynamic Theme-Driven Styles
  const dynamicStyles = useMemo(() => {
    return {
      container: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 16,
        padding: 'clamp(12px, 2.5vw, 20px)',
      },
      statsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
        gap: 14,
      },
      statCard: {
        backgroundColor: tokens.bgSurface,
        borderRadius: 14,
        border: `1px solid ${tokens.borderSubtle}`,
        boxShadow: tokens.cardShadow,
        padding: '16px 18px',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      },
      statLabel: {
        fontSize: '0.66rem',
        fontWeight: 800,
        color: tokens.textMuted,
        letterSpacing: '0.4px',
        textTransform: 'uppercase' as const,
      },
      statValue: {
        fontSize: '1.60rem',
        fontWeight: 800,
        color: tokens.textPrimary,
        margin: '6px 0 2px 0',
      },
      statHelp: {
        fontSize: '0.70rem',
        color: tokens.textSecondary,
      },
      filterBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        gap: 12,
        backgroundColor: tokens.bgSurface,
        padding: '12px 18px',
        borderRadius: 12,
        border: `1px solid ${tokens.borderSubtle}`,
        boxShadow: tokens.cardShadow,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      },
      searchInput: {
        width: 240,
        padding: '8px 12px 8px 34px',
        borderRadius: 8,
        border: `1px solid ${tokens.borderStrong}`,
        backgroundColor: tokens.bgSurfaceSubtle,
        color: tokens.textPrimary,
        fontSize: '0.82rem',
        outline: 'none',
      },
      selectInput: {
        padding: '8px 12px',
        borderRadius: 8,
        border: `1px solid ${tokens.borderStrong}`,
        backgroundColor: tokens.bgSurfaceSubtle,
        color: tokens.textPrimary,
        fontSize: '0.82rem',
        outline: 'none',
      },
      tableCard: {
        backgroundColor: tokens.bgSurface,
        borderRadius: 14,
        border: `1px solid ${tokens.borderSubtle}`,
        boxShadow: tokens.cardShadow,
        overflow: 'hidden',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      },
      th: {
        padding: '12px 14px',
        fontSize: '0.72rem',
        fontWeight: 800,
        color: tokens.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.4px',
        borderBottom: `1px solid ${tokens.borderSubtle}`,
        backgroundColor: tokens.bgSurfaceSubtle,
      },
      td: {
        padding: '12px 14px',
        fontSize: '0.80rem',
        color: tokens.textPrimary,
        borderBottom: `1px solid ${tokens.borderSubtle}`,
      },
      actionBtn: {
        width: 30,
        height: 30,
        borderRadius: 6,
        border: `1px solid ${tokens.borderSubtle}`,
        backgroundColor: tokens.bgSurfaceSubtle,
        color: tokens.textSecondary,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      },
    };
  }, [tokens, brand]);

  return (
    <div style={dynamicStyles.container}>
      {/* 1. Statistics Cards */}
      <div style={dynamicStyles.statsContainer}>
        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>TOTAL REGISTERED FACULTY</div>
          <div style={dynamicStyles.statValue}>{totalCount || facultys.length}</div>
          <div style={dynamicStyles.statHelp}>Teaching and non-teaching personnel</div>
        </div>

        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>ACTIVE ON DUTY</div>
          <div style={{ ...dynamicStyles.statValue, color: brand.success }}>{activeFacultyCount}</div>
          <div style={dynamicStyles.statHelp}>Cleared for real-time tracking</div>
        </div>

        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>RFID CARDS PAIRED</div>
          <div style={{ ...dynamicStyles.statValue, color: brand.primary }}>
            {pairedCardsCount}
            <span style={{ fontSize: '0.82rem', color: tokens.textMuted, fontWeight: 500 }}>
              {' '}
              / {facultys.length}
            </span>
          </div>
          <div style={dynamicStyles.statHelp}>Active smart ID credentials</div>
        </div>

        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>DEPARTMENTS</div>
          <div style={{ ...dynamicStyles.statValue, color: brand.secondary }}>{uniqueDepartments}</div>
          <div style={dynamicStyles.statHelp}>Academic instructional units</div>
        </div>
      </div>

      {/* 2. Controls & Filter Bar */}
      <div style={dynamicStyles.filterBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color={tokens.textMuted} style={{ position: 'absolute', left: 10, top: 10 }} />
            <input
              type="text"
              placeholder="Search faculty name, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={dynamicStyles.searchInput}
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            style={dynamicStyles.selectInput}
          >
            <option value="">All Departments</option>
            {FACULTY_DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="secondary" size="md" onClick={handleExportFacultyCsv}>
            <Download size={14} />
            <span style={{ marginLeft: 6 }}>Export CSV</span>
          </Button>

          <Button variant="primary" size="md" onClick={handleOpenCreate}>
            <Plus size={14} />
            <span style={{ marginLeft: 6 }}>Add Faculty Member</span>
          </Button>
        </div>
      </div>

      {/* 3. Faculty Table */}
      <div style={dynamicStyles.tableCard}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ ...dynamicStyles.th, width: 50 }}>Photo</th>
                <th style={dynamicStyles.th}>Employee ID</th>
                <th style={dynamicStyles.th}>Full Name</th>
                <th style={dynamicStyles.th}>Position</th>
                <th style={dynamicStyles.th}>Department</th>
                <th style={dynamicStyles.th}>Contact</th>
                <th style={dynamicStyles.th}>RFID Card UID</th>
                <th style={dynamicStyles.th}>Status</th>
                <th style={{ ...dynamicStyles.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: tokens.textMuted }}>
                    <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 8px auto', color: brand.primary }} />
                    <span>Loading faculty records...</span>
                  </td>
                </tr>
              ) : facultys.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: tokens.textMuted }}>
                    No faculty members found matching your search.
                  </td>
                </tr>
              ) : (
                facultys.map((f) => (
                  <tr key={f.id}>
                    <td style={dynamicStyles.td}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          backgroundColor: tokens.bgSurfaceSubtle,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${tokens.borderSubtle}`,
                        }}
                      >
                        {f.photo_url || f.photo ? (
                          <img
                            src={f.photo_url || f.photo!}
                            alt={f.full_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <User size={16} color={tokens.textMuted} />
                        )}
                      </div>
                    </td>
                    <td style={{ ...dynamicStyles.td, fontFamily: 'monospace', fontWeight: 700 }}>
                      {f.employee_id}
                    </td>
                    <td style={{ ...dynamicStyles.td, fontWeight: 700 }}>
                      {f.full_name}
                    </td>
                    <td style={dynamicStyles.td}>{f.position}</td>
                    <td style={{ ...dynamicStyles.td, color: tokens.textSecondary }}>{f.department}</td>
                    <td style={dynamicStyles.td}>
                      <div style={{ fontSize: '0.74rem' }}>{f.email || '—'}</div>
                      <div style={{ fontSize: '0.70rem', color: tokens.textMuted }}>{f.contact_number || '—'}</div>
                    </td>
                    <td style={dynamicStyles.td}>
                      {f.rfid_uid ? (
                        <span
                          onClick={() => handleCopy(f.rfid_uid!, `rfid-${f.id}`)}
                          style={{
                            fontFamily: 'monospace',
                            backgroundColor: tokens.bgSurfaceSubtle,
                            padding: '3px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                          title="Click to copy UID"
                        >
                          {copiedKey === `rfid-${f.id}` ? <Check size={11} color={brand.success} /> : <Copy size={11} />}
                          <span>{f.rfid_uid}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>Unassigned</span>
                      )}
                    </td>
                    <td style={dynamicStyles.td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          backgroundColor: f.is_active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          color: f.is_active ? brand.success : brand.danger,
                        }}
                      >
                        {f.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ ...dynamicStyles.td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setInspectingFaculty(f)}
                          style={dynamicStyles.actionBtn}
                          title="View Digital Pass"
                        >
                          <QrCode size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(f)}
                          style={dynamicStyles.actionBtn}
                          title="Edit Profile"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => promptDelete(f)}
                          style={{ ...dynamicStyles.actionBtn, color: brand.danger }}
                          title="Delete Faculty"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="faculty members"
          style={{ backgroundColor: tokens.bgSurface, borderTop: `1px solid ${tokens.borderSubtle}` }}
        />
      </div>

      {/* 4. Add / Edit Faculty Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingFaculty ? `Edit Faculty: ${editingFaculty.full_name}` : 'Register New Faculty'}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  backgroundColor: tokens.bgSurfaceSubtle,
                  border: `1px solid ${tokens.borderSubtle}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <User size={22} color={tokens.textMuted} />
                )}
              </div>

              <div>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
                <Button variant="secondary" size="sm" type="button" onClick={() => fileInputRef.current?.click()}>
                  <Camera size={13} />
                  <span style={{ marginLeft: 6 }}>Upload Photo</span>
                </Button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={{ marginLeft: 8, fontSize: '0.74rem', color: brand.danger, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>
                  Employee ID *
                </label>
                <input
                  type="text"
                  required
                  value={formData.employee_id}
                  onChange={(e) => setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${tokens.borderStrong}`,
                    backgroundColor: tokens.bgSurface,
                    color: tokens.textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  placeholder="e.g. EMP-1049"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>
                  RFID Card UID
                </label>
                <input
                  type="text"
                  value={formData.rfid_uid}
                  onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${tokens.borderStrong}`,
                    backgroundColor: tokens.bgSurface,
                    color: tokens.textPrimary,
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                  }}
                  placeholder="e.g. 8A3F29C1"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 0.8fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Middle Name</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Suffix</label>
                <select
                  value={formData.suffix}
                  onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                >
                  {SUFFIX_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s || 'None'}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Position</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                >
                  {FACULTY_POSITIONS.map((grp) => (
                    <optgroup key={grp.category} label={grp.category}>
                      {grp.ranks.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                >
                  {FACULTY_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: tokens.textSecondary, marginBottom: 4 }}>Contact Number</label>
                <input
                  type="text"
                  value={formData.contact_number}
                  onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="md" type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : 'Save Faculty'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 5. Digital ID Card Inspection Modal */}
      {inspectingFaculty && (
        <Modal
          isOpen={Boolean(inspectingFaculty)}
          onClose={() => setInspectingFaculty(null)}
          title="Digital Faculty Pass"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div
              style={{
                width: 280,
                backgroundColor: tokens.bgSurface,
                border: `2px solid ${brand.primary}`,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: tokens.cardShadow,
              }}
            >
              <div style={{ backgroundColor: brand.primary, color: '#ffffff', padding: '12px 14px' }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 800 }}>ATTENDSURE FACULTY PASS</div>
                <div style={{ fontSize: '0.64rem', color: '#e0f2fe' }}>Lapasan National High School</div>
              </div>

              <div style={{ padding: '16px 14px' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 10px auto', overflow: 'hidden', border: `2px solid ${brand.primary}` }}>
                  {inspectingFaculty.photo_url || inspectingFaculty.photo ? (
                    <img src={inspectingFaculty.photo_url || inspectingFaculty.photo!} alt={inspectingFaculty.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <User size={36} color={tokens.textMuted} style={{ margin: '14px auto' }} />
                  )}
                </div>

                <div style={{ fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {inspectingFaculty.full_name}
                </div>
                <div style={{ fontSize: '0.74rem', color: tokens.textSecondary, marginTop: 2 }}>
                  {inspectingFaculty.position}
                </div>
                <div style={{ fontSize: '0.70rem', color: tokens.textMuted }}>
                  {inspectingFaculty.department}
                </div>

                <div style={{ margin: '12px auto', width: 110, height: 110, padding: 6, backgroundColor: '#ffffff', borderRadius: 8, border: `1px solid ${tokens.borderSubtle}` }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(inspectingFaculty.employee_id)}`}
                    alt="QR"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>

                <div style={{ fontSize: '0.74rem', fontFamily: 'monospace', fontWeight: 700, color: tokens.textPrimary }}>
                  ID: {inspectingFaculty.employee_id}
                </div>
              </div>

              <div style={{ backgroundColor: tokens.bgSurfaceSubtle, padding: '8px 12px', borderTop: `1px solid ${tokens.borderSubtle}`, fontSize: '0.68rem', color: tokens.textSecondary }}>
                Card UID: {inspectingFaculty.rfid_uid || 'No Card Linked'}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Button variant="secondary" size="md" onClick={() => setInspectingFaculty(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FacultyTab;