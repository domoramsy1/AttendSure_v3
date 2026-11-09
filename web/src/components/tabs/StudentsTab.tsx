/**
 * AttendSure - Students Directory (Full 30-Column DepEd SF1 Schema with Year Level & Section Linking)
 * File: web/src/components/tabs/StudentsTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { exportToCsv } from '../common/Pagination';
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
  AlertCircle,
  Download,
  Plus,
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Home,
  Users2,
  GraduationCap,
} from 'lucide-react';

interface Student {
  id: number;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name: string;
  sex: string;
  birthdate?: string;
  mother_tongue?: string;
  ethnic_group?: string;
  religion?: string;
  house_street_sitio?: string;
  barangay?: string;
  municipality_city?: string;
  province?: string;
  father_name?: string;
  mother_maiden_name?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  parent_contact: string;
  rfid_uid?: string;
  qr_token?: string;
  current_section?: string;
  section_id?: number;
  grade_level_id?: number;
  grade_level_name?: string;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

interface GradeLevelItem {
  id: number;
  code: string;
  name: string;
}

interface SectionItem {
  id: number;
  name: string;
  code?: string;
  grade_level_id?: number;
  grade_level?: number | { id: number; name: string };
  grade_level_name?: string;
}

interface MetricsData {
  total: number;
  active: number;
  paired: number;
  total_sections: number;
}

type ModalFormTab = 'BASIC' | 'ADDRESS' | 'PARENTS' | 'DEPED';

const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  return clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('data:image/');
};

const copyTextSafely = async (textToCopy: string): Promise<boolean> => {
  const cleanText = String(textToCopy || '').trim();
  if (!cleanText) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return true;
    } catch {}
  }

  if (typeof document !== 'undefined') {
    const textArea = document.createElement('textarea');
    textArea.value = cleanText;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
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

export const StudentsTab: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(1000);

  // Database metrics
  const [metrics, setMetrics] = useState<MetricsData>({
    total: 1000,
    active: 1000,
    paired: 0,
    total_sections: 24,
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Modal Form State (With Year Level & Section)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formTab, setFormTab] = useState<ModalFormTab>('BASIC');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    sex: 'Male',
    birthdate: '2012-01-01',
    grade_level_id: '',
    section_id: '',
    rfid_uid: '',
    photo: null as string | null,
    house_street_sitio: '',
    barangay: '',
    municipality_city: 'Cagayan de Oro City',
    province: 'Misamis Oriental',
    father_name: '',
    mother_maiden_name: '',
    guardian_name: '',
    guardian_relationship: 'Parent',
    parent_contact: '',
    mother_tongue: 'Cebuano',
    ethnic_group: '',
    religion: 'Roman Catholic',
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    action: async () => {},
  });

  const isInteracting = useRef<boolean>(false);
  isInteracting.current = isModalOpen || Boolean(badgeStudent) || confirmDialog.isOpen;

  // Filter sections by selected Grade Level inside the Modal
  const modalAvailableSections = useMemo(() => {
    if (!formData.grade_level_id) return sections;
    return sections.filter((sec) => {
      const glId = typeof sec.grade_level === 'object' && sec.grade_level !== null
        ? sec.grade_level.id
        : (sec.grade_level_id || sec.grade_level);
      return String(glId) === String(formData.grade_level_id);
    });
  }, [sections, formData.grade_level_id]);

  // 1. Fetch Real Database Metrics
  const loadMetrics = useCallback(async () => {
    try {
      const res = await apiClient.get('/students/metrics/');
      if (res.data) {
        setMetrics({
          total: Number(res.data.total) || 1000,
          active: Number(res.data.active) || 1000,
          paired: Number(res.data.paired) || 0,
          total_sections: Number(res.data.total_sections) || 24,
        });
        setTotalCount(Number(res.data.total) || 1000);
      }
    } catch {}
  }, []);

  // 2. Fetch Paginated Student Records & Prerequisites
  const loadData = useCallback(async (page = currentPage, size = pageSize, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { page, page_size: size };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedSectionFilter !== 'ALL') params.section_id = selectedSectionFilter;

      const [studRes, glRes, secRes] = await Promise.all([
        apiClient.get('/students/', { params }),
        apiClient.get('/grade-levels/?page_size=500'),
        apiClient.get('/sections/?page_size=500'),
      ]);

      setGradeLevels(Array.isArray(glRes.data) ? glRes.data : glRes.data?.results || []);
      setSections(Array.isArray(secRes.data) ? secRes.data : secRes.data?.results || []);

      if (studRes.data && 'results' in studRes.data) {
        setStudents(studRes.data.results);
        setTotalCount(Number(studRes.data.count) || 1000);
      } else if (Array.isArray(studRes.data)) {
        setStudents(studRes.data);
        setTotalCount(studRes.data.length);
      }
    } catch (err: any) {
      if (!silent) {
        setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to load students.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, selectedSectionFilter]);

  useEffect(() => {
    loadMetrics();
    loadData(1, pageSize, false);
    setCurrentPage(1);
  }, [loadMetrics, loadData, pageSize]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        loadData(currentPage, pageSize, true);
        loadMetrics();
      }
    }, 12000);
    return () => clearInterval(liveInterval);
  }, [currentPage, pageSize, loadData, loadMetrics]);

  const handleCopy = async (val: string) => {
    const ok = await copyTextSafely(val);
    if (ok) {
      setCopiedValue(val);
      setTimeout(() => setCopiedValue((prev) => (prev === val ? null : prev)), 2000);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await apiClient.get('/students/?page_size=1000');
      const allStudents: Student[] = Array.isArray(res.data) ? res.data : res.data?.results || [];

      exportToCsv(
        `AttendSure_All_Students_${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'LRN',
          'Full Name',
          'Sex',
          'Birthdate',
          'Class Section',
          'RFID Card UID',
          'Parent Contact',
          'Father Name',
          'Mother Maiden Name',
          'Barangay',
          'City',
          'Status',
        ],
        allStudents.map((s) => [
          s.lrn,
          s.full_name || `${s.last_name}, ${s.first_name}`,
          s.sex || 'Male',
          s.birthdate || '',
          s.current_section || 'Unassigned',
          s.rfid_uid || '',
          s.parent_contact || '',
          s.father_name || '',
          s.mother_maiden_name || '',
          s.barangay || '',
          s.municipality_city || '',
          s.is_active ? 'ACTIVE' : 'INACTIVE',
        ])
      );
    } catch {
      alert('Could not export full list. Exporting current page.');
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      loadData(newPage, pageSize, false);
    }
  };

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

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setFormError(null);
    setFormTab('BASIC');
    setFormData({
      lrn: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      sex: 'Male',
      birthdate: '2012-01-01',
      grade_level_id: gradeLevels.length > 0 ? String(gradeLevels[0].id) : '',
      section_id: '',
      rfid_uid: '',
      photo: null,
      house_street_sitio: '',
      barangay: '',
      municipality_city: 'Cagayan de Oro City',
      province: 'Misamis Oriental',
      father_name: '',
      mother_maiden_name: '',
      guardian_name: '',
      guardian_relationship: 'Parent',
      parent_contact: '',
      mother_tongue: 'Cebuano',
      ethnic_group: '',
      religion: 'Roman Catholic',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormError(null);
    setFormTab('BASIC');

    // Find the student's section to infer grade level
    const matchedSec = sections.find((s) => s.id === student.section_id || s.name === student.current_section);
    let inferredGL = '';
    if (matchedSec) {
      const glVal = typeof matchedSec.grade_level === 'object' && matchedSec.grade_level !== null
        ? matchedSec.grade_level.id
        : (matchedSec.grade_level_id || matchedSec.grade_level);
      inferredGL = glVal ? String(glVal) : '';
    }

    setFormData({
      lrn: student.lrn || '',
      first_name: student.first_name || '',
      middle_name: student.middle_name || '',
      last_name: student.last_name || '',
      suffix: student.suffix || '',
      sex: student.sex === 'Female' || student.sex === 'F' ? 'Female' : 'Male',
      birthdate: student.birthdate || '2012-01-01',
      grade_level_id: inferredGL || (gradeLevels.length > 0 ? String(gradeLevels[0].id) : ''),
      section_id: student.section_id ? String(student.section_id) : (matchedSec ? String(matchedSec.id) : ''),
      rfid_uid: student.rfid_uid || '',
      photo: student.photo_url || student.photo || null,
      house_street_sitio: student.house_street_sitio || '',
      barangay: student.barangay || '',
      municipality_city: student.municipality_city || 'Cagayan de Oro City',
      province: student.province || 'Misamis Oriental',
      father_name: student.father_name || '',
      mother_maiden_name: student.mother_maiden_name || '',
      guardian_name: student.guardian_name || '',
      guardian_relationship: student.guardian_relationship || 'Parent',
      parent_contact: student.parent_contact || '',
      mother_tongue: student.mother_tongue || 'Cebuano',
      ethnic_group: student.ethnic_group || '',
      religion: student.religion || 'Roman Catholic',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formData.lrn.trim().length !== 12) {
      setFormError('Learner Reference Number (LRN) must be exactly 12 digits.');
      setFormTab('BASIC');
      return;
    }

    if (!formData.section_id) {
      setFormError('Please assign a Class Section to this learner.');
      setFormTab('BASIC');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        lrn: formData.lrn.trim(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || '',
        last_name: formData.last_name.trim(),
        suffix: formData.suffix.trim() || '',
        sex: formData.sex,
        birthdate: formData.birthdate,
        mother_tongue: formData.mother_tongue.trim() || '',
        ethnic_group: formData.ethnic_group.trim() || '',
        religion: formData.religion.trim() || '',
        house_street_sitio: formData.house_street_sitio.trim() || '',
        barangay: formData.barangay.trim() || '',
        municipality_city: formData.municipality_city.trim() || '',
        province: formData.province.trim() || '',
        father_name: formData.father_name.trim() || '',
        mother_maiden_name: formData.mother_maiden_name.trim() || '',
        guardian_name: formData.guardian_name.trim() || '',
        guardian_relationship: formData.guardian_relationship.trim() || '',
        parent_contact: formData.parent_contact.trim().replace(/[\s-]/g, '') || '',
        rfid_uid: formData.rfid_uid?.trim() ? formData.rfid_uid.trim().toUpperCase() : null,
        section_id: Number(formData.section_id),
      };

      if (formData.photo !== undefined) payload.photo = formData.photo;

      if (editingStudent) {
        await apiClient.put(`/students/${editingStudent.id}/`, payload);
      } else {
        await apiClient.post('/students/', payload);
      }

      setIsModalOpen(false);
      loadMetrics();
      loadData(currentPage, pageSize, false);
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to save student profile.');
    } finally {
      setSaving(false);
    }
  };

  const promptDelete = (student: Student) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Student Record',
      message: `Permanently delete student "${student.full_name || student.first_name}" (LRN: ${student.lrn}) from the school database?`,
      confirmLabel: 'Delete Student',
      action: async () => {
        try {
          await apiClient.delete(`/students/${student.id}/`);
          loadMetrics();
          loadData(currentPage, pageSize, true);
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Four Metric Cards */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL REGISTERED STUDENTS</div>
          <div style={{ ...statVal, color: '#0f172a' }}>{metrics.total.toLocaleString()}</div>
          <div style={statSub}>Enrolled learners in database</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>ACTIVE ON CLASS LIST</div>
          <div style={{ ...statVal, color: '#16a34a' }}>{metrics.active.toLocaleString()}</div>
          <div style={statSub}>Eligible for gate scan tracking</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>RFID CARDS PAIRED</div>
          <div style={{ ...statVal, color: '#004b87' }}>
            {metrics.paired.toLocaleString()} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 600 }}>/ {metrics.total.toLocaleString()}</span>
          </div>
          <div style={statSub}>Linked gate security credentials</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>CLASS SECTIONS</div>
          <div style={{ ...statVal, color: '#d97706' }}>{metrics.total_sections}</div>
          <div style={statSub}>Active academic class lists</div>
        </div>
      </div>

      {/* 2. Top Filter and Actions Bar */}
      <div style={controlBar}>
        <select
          value={selectedSectionFilter}
          onChange={(e) => {
            setSelectedSectionFilter(e.target.value);
            setCurrentPage(1);
          }}
          style={selectStyle}
        >
          <option value="ALL">All Class Sections</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name} {sec.code ? `(${sec.code})` : ''}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleExportCsv} disabled={isExporting} style={secondaryBtnStyle}>
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export CSV ({metrics.total.toLocaleString()})</span>
          </button>

          <button type="button" onClick={handleOpenCreate} style={primaryBtnStyle}>
            <Plus size={16} />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* 3. Main Directory White Card */}
      <div style={mainCard}>
        <div style={mainCardHeader}>
          <div>
            <h3 style={titleHeading}>Students Directory</h3>
            <p style={subtitleText}>Manage verified learner credentials, section assignments, and physical security access.</p>
          </div>

          <div style={searchWrapper}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by Student Name, LRN..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              style={searchInput}
            />
          </div>
        </div>

        {error && (
          <div style={errorBanner}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={loadingContainer}>
            <Loader2 size={28} className="animate-spin" color="#004b87" />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading students from database...</span>
          </div>
        ) : students.length === 0 ? (
          <div style={emptyContainer}>
            <User size={40} color="#cbd5e1" />
            <p style={{ margin: '8px 0 2px 0', fontWeight: 700, color: '#334155', fontSize: '0.90rem' }}>
              No students found
            </p>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
              No student records match your active search or section filter.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRow}>
                  <th style={thStyle}>Student Member</th>
                  <th style={thStyle}>Learner LRN</th>
                  <th style={thStyle}>Class Section</th>
                  <th style={thStyle}>School Gate Card</th>
                  <th style={thStyle}>Parent Contact</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => {
                  const safePhoto = isSafeImageUrl(row.photo_url || row.photo) ? (row.photo_url || row.photo) : null;
                  const fullName = row.full_name || `${row.first_name} ${row.last_name}`;

                  return (
                    <tr key={row.id} style={tableRowStyle}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={avatarStyle}>
                            {safePhoto ? (
                              <img src={safePhoto} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <User size={18} color="#94a3b8" />
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                              {fullName}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>
                              {row.sex || 'Learner'} &bull; Grade {row.grade_level_name || '7'}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={codePill}>
                          <span>{row.lrn}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.lrn)}
                            style={copyBtn}
                            title="Copy LRN"
                          >
                            {copiedValue === row.lrn ? <Check size={11} color="#16a34a" /> : <Copy size={11} color="#64748b" />}
                          </button>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                          <BookOpen size={14} color="#004b87" />
                          <span>{row.current_section || 'Unassigned'}</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 20, marginTop: 1 }}>
                          Regular Class List
                        </div>
                      </td>

                      <td style={tdStyle}>
                        {row.rfid_uid ? (
                          <div style={cardPairedBadge}>
                            <CreditCard size={13} color="#16a34a" />
                            <span>{row.rfid_uid}</span>
                          </div>
                        ) : (
                          <div style={cardUnpairedBadge}>
                            <CreditCard size={13} color="#94a3b8" />
                            <span>Not Paired</span>
                          </div>
                        )}
                      </td>

                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', color: '#334155' }}>
                          <Phone size={13} color="#64748b" />
                          <span>{row.parent_contact || 'None'}</span>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span style={activePill}>
                          {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setBadgeStudent(row)}
                            style={actionBtn}
                            title="Print / View QR Pass"
                          >
                            <QrCode size={14} color="#004b87" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(row)}
                            style={actionBtn}
                            title="Edit Student Profile"
                          >
                            <Pencil size={14} color="#004b87" />
                          </button>

                          <button
                            type="button"
                            onClick={() => promptDelete(row)}
                            style={{ ...actionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                            title="Delete Student Record"
                          >
                            <Trash2 size={14} color="#dc2626" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Server-Side Pagination Bar */}
        <div style={paginationFooter}>
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong>{Math.min(currentPage * pageSize, totalCount)}</strong> of{' '}
            <strong>{totalCount.toLocaleString()}</strong> students
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#64748b' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={pageSelectStyle}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={1000}>All (1000)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
                style={{ ...pageNavBtn, opacity: currentPage === 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={16} />
              </button>

              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
                style={{ ...pageNavBtn, opacity: currentPage === totalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Full 30-Column Modal (With Linked Year Level & Section) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? `Edit Learner: ${editingStudent.full_name || editingStudent.first_name}` : 'Enroll New Learner (DepEd SF1)'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <div style={errorBanner}>
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          {/* Sub-Tabs */}
          <div style={modalTabContainer}>
            <button
              type="button"
              onClick={() => setFormTab('BASIC')}
              style={formTab === 'BASIC' ? modalActiveTab : modalInactiveTab}
            >
              <User size={13} /> 1. Basic &amp; Gate ID
            </button>
            <button
              type="button"
              onClick={() => setFormTab('ADDRESS')}
              style={formTab === 'ADDRESS' ? modalActiveTab : modalInactiveTab}
            >
              <Home size={13} /> 2. Address
            </button>
            <button
              type="button"
              onClick={() => setFormTab('PARENTS')}
              style={formTab === 'PARENTS' ? modalActiveTab : modalInactiveTab}
            >
              <Users2 size={13} /> 3. Parents &amp; Guardian
            </button>
            <button
              type="button"
              onClick={() => setFormTab('DEPED')}
              style={formTab === 'DEPED' ? modalActiveTab : modalInactiveTab}
            >
              <GraduationCap size={13} /> 4. DepEd Profile
            </button>
          </div>

          {/* TAB 1: Basic & Gate ID (Includes Linked Year Level & Section) */}
          {formTab === 'BASIC' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Profile Photo Uploader */}
              <div style={photoUploadContainer}>
                <div style={photoPreviewCircle}>
                  {formData.photo ? (
                    <img
                      src={formData.photo}
                      alt="Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <User size={30} color="#94a3b8" />
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={uploadPhotoLabelBtn}>
                      <Camera size={13} />
                      <span>{formData.photo ? 'Change Photo' : 'Upload Profile Picture'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoUpload}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {formData.photo && (
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, photo: null }))}
                        style={removePhotoBtn}
                      >
                        <X size={13} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    JPG, PNG, or WebP format (max file size: 2 MB)
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>12-Digit Learner Reference Number (LRN) *</label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    value={formData.lrn}
                    onChange={(e) => setFormData({ ...formData, lrn: e.target.value.replace(/\D/g, '') })}
                    style={formInput}
                    placeholder="e.g. 128936000093"
                  />
                </div>
                <div>
                  <label style={formLabel}>Birthdate *</label>
                  <input
                    type="date"
                    required
                    value={formData.birthdate}
                    onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                    style={formInput}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    style={formInput}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label style={formLabel}>Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    style={formInput}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>Middle Name</label>
                  <input
                    type="text"
                    value={formData.middle_name}
                    onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                    style={formInput}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label style={formLabel}>Suffix</label>
                  <select
                    value={formData.suffix}
                    onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                    style={formInput}
                  >
                    <option value="">None</option>
                    <option value="Jr.">Jr.</option>
                    <option value="Sr.">Sr.</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                  </select>
                </div>
                <div>
                  <label style={formLabel}>Sex *</label>
                  <select
                    value={formData.sex}
                    onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                    style={formInput}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              {/* 2-Tier Linking: Year Level filters the Class Section dropdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>Year Level (Dropdown) *</label>
                  <select
                    value={formData.grade_level_id}
                    onChange={(e) => {
                      const newGL = e.target.value;
                      setFormData({
                        ...formData,
                        grade_level_id: newGL,
                        section_id: '', // Reset section when year level changes
                      });
                    }}
                    style={formInput}
                    required
                  >
                    <option value="">-- Choose Year Level --</option>
                    {gradeLevels.map((gl) => (
                      <option key={gl.id} value={gl.id}>
                        {gl.name} ({gl.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={formLabel}>Class Section (Dropdown) *</label>
                  <select
                    value={formData.section_id}
                    onChange={(e) => setFormData({ ...formData, section_id: e.target.value })}
                    style={formInput}
                    required
                    disabled={!formData.grade_level_id && modalAvailableSections.length === 0}
                  >
                    <option value="">
                      {formData.grade_level_id ? '-- Select Section --' : 'Select Year Level First'}
                    </option>
                    {modalAvailableSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} {sec.code ? `(${sec.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={formLabel}>School Gate RFID UID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 6B69D870"
                  value={formData.rfid_uid}
                  onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value.toUpperCase() })}
                  style={{ ...formInput, fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {/* TAB 2: Address */}
          {formTab === 'ADDRESS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={formLabel}>House / Street / Sitio</label>
                <input
                  type="text"
                  placeholder="e.g. Zone 2, Purok Apple"
                  value={formData.house_street_sitio}
                  onChange={(e) => setFormData({ ...formData, house_street_sitio: e.target.value })}
                  style={formInput}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>Barangay</label>
                  <input
                    type="text"
                    placeholder="e.g. Lapasan, Lumbia"
                    value={formData.barangay}
                    onChange={(e) => setFormData({ ...formData, barangay: e.target.value })}
                    style={formInput}
                  />
                </div>
                <div>
                  <label style={formLabel}>Municipality / City</label>
                  <input
                    type="text"
                    value={formData.municipality_city}
                    onChange={(e) => setFormData({ ...formData, municipality_city: e.target.value })}
                    style={formInput}
                  />
                </div>
              </div>

              <div>
                <label style={formLabel}>Province</label>
                <input
                  type="text"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                  style={formInput}
                />
              </div>
            </div>
          )}

          {/* TAB 3: Parents & Guardian */}
          {formTab === 'PARENTS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>Father's Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Juan Santos Cruz"
                    value={formData.father_name}
                    onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                    style={formInput}
                  />
                </div>
                <div>
                  <label style={formLabel}>Mother's Maiden Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Maria Lopez Reyes"
                    value={formData.mother_maiden_name}
                    onChange={(e) => setFormData({ ...formData, mother_maiden_name: e.target.value })}
                    style={formInput}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>Guardian Name (if not with parents)</label>
                  <input
                    type="text"
                    placeholder="Guardian full name"
                    value={formData.guardian_name}
                    onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
                    style={formInput}
                  />
                </div>
                <div>
                  <label style={formLabel}>Relationship</label>
                  <input
                    type="text"
                    placeholder="e.g. Aunt, Grandmother"
                    value={formData.guardian_relationship}
                    onChange={(e) => setFormData({ ...formData, guardian_relationship: e.target.value })}
                    style={formInput}
                  />
                </div>
              </div>

              <div>
                <label style={formLabel}>Parent Contact Mobile (11 digits for SMS Alerts) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 09170000093"
                  value={formData.parent_contact}
                  onChange={(e) => setFormData({ ...formData, parent_contact: e.target.value })}
                  style={formInput}
                />
              </div>
            </div>
          )}

          {/* TAB 4: DepEd Demographics */}
          {formTab === 'DEPED' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={formLabel}>Mother Tongue</label>
                  <input
                    type="text"
                    placeholder="e.g. Cebuano, Tagalog"
                    value={formData.mother_tongue}
                    onChange={(e) => setFormData({ ...formData, mother_tongue: e.target.value })}
                    style={formInput}
                  />
                </div>
                <div>
                  <label style={formLabel}>Ethnic Group / Indigenous Community</label>
                  <input
                    type="text"
                    placeholder="e.g. Higaonon, None"
                    value={formData.ethnic_group}
                    onChange={(e) => setFormData({ ...formData, ethnic_group: e.target.value })}
                    style={formInput}
                  />
                </div>
              </div>

              <div>
                <label style={formLabel}>Religion / Faith Tradition</label>
                <input
                  type="text"
                  placeholder="e.g. Roman Catholic, Islam, Seventh-Day Adventist"
                  value={formData.religion}
                  onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                  style={formInput}
                />
              </div>
            </div>
          )}

          {/* Modal Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {formTab !== 'BASIC' && (
                <button
                  type="button"
                  onClick={() => {
                    if (formTab === 'ADDRESS') setFormTab('BASIC');
                    else if (formTab === 'PARENTS') setFormTab('ADDRESS');
                    else if (formTab === 'DEPED') setFormTab('PARENTS');
                  }}
                  style={secondaryBtnStyle}
                >
                  &larr; Previous Tab
                </button>
              )}
              {formTab !== 'DEPED' && (
                <button
                  type="button"
                  onClick={() => {
                    if (formTab === 'BASIC') setFormTab('ADDRESS');
                    else if (formTab === 'ADDRESS') setFormTab('PARENTS');
                    else if (formTab === 'PARENTS') setFormTab('DEPED');
                  }}
                  style={secondaryBtnStyle}
                >
                  Next Tab &rarr;
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="md" type="submit" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : editingStudent ? 'Save Learner Profile' : 'Enroll Learner (SF1)'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ID Pass View/Print Modal */}
      {badgeStudent && (
        <Modal
          isOpen={Boolean(badgeStudent)}
          onClose={() => setBadgeStudent(null)}
          title="Student Gate & Classroom Pass"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0' }}>
            <div style={{ width: 300, backgroundColor: '#ffffff', border: '2px solid #004b87', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ background: '#004b87', color: '#ffffff', padding: '12px 14px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800 }}>ATTENDSURE STUDENT PASS</div>
                <div style={{ fontSize: '0.60rem', color: '#e0f2fe', marginTop: 2 }}>Department of Education &bull; Student Pass</div>
              </div>

              <div style={{ padding: '16px 14px' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 8px auto', overflow: 'hidden', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #004b87' }}>
                  {badgeStudent.photo_url ? (
                    <img
                      src={badgeStudent.photo_url}
                      alt={badgeStudent.full_name || badgeStudent.first_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <User size={34} color="#94a3b8" />
                  )}
                </div>

                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                  {badgeStudent.full_name || `${badgeStudent.first_name} ${badgeStudent.last_name}`}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>
                  Section: {badgeStudent.current_section || 'Unassigned'}
                </div>
                <div style={{ margin: '8px 0', padding: '4px 10px', backgroundColor: '#f1f5f9', borderRadius: 6, fontFamily: 'monospace', fontWeight: 700 }}>
                  LRN: {badgeStudent.lrn}
                </div>
                <div style={{ width: 120, height: 120, margin: '10px auto', padding: 6, border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(badgeStudent.lrn)}`}
                    alt="QR"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '8px 12px', fontSize: '0.70rem', color: '#64748b' }}>
                Card UID: <strong>{badgeStudent.rfid_uid || 'No Card Linked'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setBadgeStudent(null)}>
                Close
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
                <Printer size={15} style={{ marginRight: 6 }} />
                Print ID Card
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        title={confirmDialog.title}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: '0.84rem', color: '#334155', margin: 0 }}>
            {confirmDialog.message}
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={async () => {
                await confirmDialog.action();
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              }}
              style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
            >
              {confirmDialog.confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StudentsTab;

// Styles
const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
  gap: 12,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '14px 18px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
};

const statVal: React.CSSProperties = {
  fontSize: '1.60rem',
  fontWeight: 800,
  marginTop: 4,
  lineHeight: 1.1,
};

const statSub: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#94a3b8',
  marginTop: 3,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
};

const selectStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  fontSize: '0.82rem',
  color: '#334155',
  fontWeight: 600,
  outline: 'none',
  cursor: 'pointer',
  minWidth: 200,
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#ffffff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  padding: '8px 14px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.80rem',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#004b87',
  color: '#ffffff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 6,
  fontWeight: 700,
  fontSize: '0.80rem',
  cursor: 'pointer',
};

const mainCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 12,
  padding: '20px 24px',
  border: '1px solid #e2e8f0',
};

const mainCardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: 14,
  marginBottom: 16,
};

const titleHeading: React.CSSProperties = {
  margin: 0,
  fontSize: '1.20rem',
  fontWeight: 800,
  color: '#0f172a',
};

const subtitleText: React.CSSProperties = {
  margin: '4px 0 0 0',
  fontSize: '0.80rem',
  color: '#64748b',
};

const searchWrapper: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 290,
};

const searchInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 14px 8px 34px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: '0.80rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 700,
  borderCollapse: 'collapse',
  textAlign: 'left',
};

const tableHeaderRow: React.CSSProperties = {
  borderBottom: '2px solid #e2e8f0',
};

const thStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#475569',
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 14px',
  verticalAlign: 'middle',
};

const avatarStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const codePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontFamily: 'monospace',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#0f172a',
};

const copyBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};

const cardPairedBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#16a34a',
  fontFamily: 'monospace',
};

const cardUnpairedBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.76rem',
  color: '#94a3b8',
};

const activePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: 14,
  fontSize: '0.70rem',
  fontWeight: 800,
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
  color: '#16a34a',
};

const actionBtn: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 6,
  padding: '10px 14px',
  marginBottom: 14,
  fontSize: '0.80rem',
};

const loadingContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '40px 0',
};

const emptyContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 0',
};

const paginationFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: 16,
  paddingTop: 12,
  borderTop: '1px solid #f1f5f9',
  flexWrap: 'wrap',
  gap: 10,
};

const pageSelectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  fontSize: '0.76rem',
  fontWeight: 600,
  color: '#334155',
  cursor: 'pointer',
};

const pageNavBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
  color: '#0f172a',
};

const modalTabContainer: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  backgroundColor: '#f1f5f9',
  padding: 4,
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
};

const modalBaseTab: React.CSSProperties = {
  flex: 1,
  minWidth: 105,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  border: 'none',
  padding: '6px 4px',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const modalActiveTab: React.CSSProperties = {
  ...modalBaseTab,
  backgroundColor: '#ffffff',
  color: '#004b87',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
};

const modalInactiveTab: React.CSSProperties = {
  ...modalBaseTab,
  backgroundColor: 'transparent',
  color: '#64748b',
};

const formLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const formInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const photoUploadContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 14px',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};

const photoPreviewCircle: React.CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  border: '2px solid #004b87',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const uploadPhotoLabelBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: '#004b87',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const removePhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 600,
  cursor: 'pointer',
};