/**
 * AttendSure - Students Directory & DepEd SF1 Enrollment (Zero Mock Data & Role-Aware)
 * File: web/src/components/tabs/StudentsTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { isSafeImageUrl, sanitizeText } from '../../theme/tokens';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { Pagination, exportToCsv, ALL_ROWS_SIZE } from '../common/Pagination';
import { ControlSwitch } from '../ui/ControlSwitch';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
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
  Home,
  Users2,
  GraduationCap,
  ShieldCheck,
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
  qr_token?: string;
  current_section?: string;
  section_id?: number;
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

const maskQrToken = (token?: string): string => {
  const clean = String(token || '').trim();
  if (!clean) return '';
  return clean.length <= 4 ? 'Linked' : `••••${clean.slice(-4)}`;
};

export const StudentsTab: React.FC = () => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { school } = useSchool();
  const { showAlert, showConfirm } = useAlert();

  const userRole = useMemo(
    () => (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase(),
    []
  );
  const canManageStudents = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(userRole);

  const [students, setStudents] = useState<Student[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevelItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Strictly zero mock numbers — hydrated 100% from PostgreSQL
  const [metrics, setMetrics] = useState<MetricsData>({
    total: 0,
    active: 0,
    paired: 0,
    total_sections: 0,
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

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
    qr_token: '',
    photo: null as string | null,
    house_street_sitio: '',
    barangay: '',
    municipality_city: '',
    province: '',
    father_name: '',
    mother_maiden_name: '',
    guardian_name: '',
    guardian_relationship: 'Mother',
    parent_contact: '',
    mother_tongue: '',
    ethnic_group: '',
    religion: '',
  });

  const abortRef = useRef<AbortController | null>(null);
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = isModalOpen || Boolean(badgeStudent);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(sanitizeText(searchQuery, 60));
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load static lookups (Grade Levels & Sections) once on mount
  useEffect(() => {
    let active = true;
    Promise.all([
      apiClient.get(API_ROUTES.school.gradeLevels, { params: { page_size: 200 } }),
      apiClient.get(API_ROUTES.school.sections, { params: { page_size: 300 } }),
    ])
      .then(([glRes, secRes]) => {
        if (!active) return;
        setGradeLevels(Array.isArray(glRes.data) ? glRes.data : glRes.data?.results || []);
        setSections(Array.isArray(secRes.data) ? secRes.data : secRes.data?.results || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const loadMetrics = useCallback(async (bypassCache = false) => {
    try {
      const res = await apiClient.get(API_ROUTES.students.metrics, {
        params: bypassCache ? { nocache: 1 } : undefined,
      });
      if (res.data) {
        setMetrics({
          total: Number(res.data.total ?? res.data.total_students ?? 0),
          active: Number(res.data.active ?? res.data.total_students ?? 0),
          paired: Number(res.data.paired ?? 0),
          total_sections: Number(res.data.total_sections ?? 0),
        });
      }
    } catch {
      // Keep existing metrics if offline
    }
  }, []);

  const loadStudents = useCallback(
    async (page: number, size: number, silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!silent) setLoading(true);
      setError(null);

      try {
        const isAll = size >= ALL_ROWS_SIZE;
        const params: Record<string, string | number> = {
          page: isAll ? 1 : page,
          page_size: isAll ? 'ALL' : size,
        };
        if (debouncedSearch) params.search = debouncedSearch;
        if (selectedSectionFilter !== 'ALL') params.section_id = selectedSectionFilter;
        if (bypassCache) params.nocache = 1;

        const res = await apiClient.get(API_ROUTES.students.list, {
          params,
          signal: controller.signal,
        });

        if (res.data && 'results' in res.data) {
          setStudents(res.data.results);
          setTotalCount(Number(res.data.count) || 0);
        } else if (Array.isArray(res.data)) {
          setStudents(res.data);
          setTotalCount(res.data.length);
        }
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') return;
        if (!silent) setError(extractApiError(err, 'Could not load student directory.'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [debouncedSearch, selectedSectionFilter]
  );

  useEffect(() => {
    loadMetrics(false);
  }, [loadMetrics]);

  useEffect(() => {
    loadStudents(currentPage, pageSize, false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [currentPage, pageSize, loadStudents]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        loadStudents(currentPage, pageSize, true, true);
        loadMetrics(true);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [currentPage, pageSize, loadStudents, loadMetrics]);

  const modalAvailableSections = useMemo(() => {
    if (!formData.grade_level_id) return sections;
    return sections.filter((sec) => {
      const glId =
        typeof sec.grade_level === 'object' && sec.grade_level !== null
          ? sec.grade_level.id
          : sec.grade_level;
      return String(glId) === String(formData.grade_level_id);
    });
  }, [sections, formData.grade_level_id]);

  const handleCopy = async (val: string) => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedValue(val);
      setTimeout(() => setCopiedValue((prev) => (prev === val ? null : prev)), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const params: Record<string, string | number> = { page_size: 'ALL' };
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedSectionFilter !== 'ALL') params.section_id = selectedSectionFilter;

      const res = await apiClient.get(API_ROUTES.students.list, { params });
      const list: Student[] = Array.isArray(res.data) ? res.data : res.data?.results || [];

      exportToCsv(
        `AttendSure_Students_${new Date().toISOString().slice(0, 10)}.csv`,
        [
          'LRN',
          'Full Name',
          'Sex',
          'Birthdate',
          'Class Section',
          'QR Card Status',
          'Parent Contact',
          'Father Name',
          'Mother Maiden Name',
          'Barangay',
          'Municipality / City',
          'Status',
        ],
        list.map((s) => [
          s.lrn,
          s.full_name || `${s.last_name}, ${s.first_name}`,
          s.sex || '',
          s.birthdate || '',
          s.current_section || 'Unassigned',
          s.qr_token ? 'Linked' : 'Not Linked',
          s.parent_contact || '',
          s.father_name || '',
          s.mother_maiden_name || '',
          s.barangay || '',
          s.municipality_city || '',
          s.is_active ? 'ACTIVE' : 'INACTIVE',
        ])
      );
    } catch (err) {
      showAlert({ title: 'Export Failed', message: extractApiError(err), type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Please upload a JPG, PNG, or WebP photo.');
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      setFormError('Photo size must be 2.5 MB or smaller.');
      return;
    }
    setFormError(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, photo: reader.result as string }));
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
      grade_level_id: gradeLevels[0] ? String(gradeLevels[0].id) : '',
      section_id: '',
      qr_token: '',
      photo: null,
      house_street_sitio: '',
      barangay: '',
      municipality_city: '',
      province: '',
      father_name: '',
      mother_maiden_name: '',
      guardian_name: '',
      guardian_relationship: 'Mother',
      parent_contact: '',
      mother_tongue: '',
      ethnic_group: '',
      religion: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (st: Student) => {
    setEditingStudent(st);
    setFormError(null);
    setFormTab('BASIC');

    const matchedSec = sections.find(
      (s) => s.id === st.section_id || s.name === st.current_section
    );
    const glVal =
      matchedSec && typeof matchedSec.grade_level === 'object' && matchedSec.grade_level !== null
        ? matchedSec.grade_level.id
        : matchedSec?.grade_level;

    setFormData({
      lrn: st.lrn || '',
      first_name: st.first_name || '',
      middle_name: st.middle_name || '',
      last_name: st.last_name || '',
      suffix: st.suffix || '',
      sex: st.sex === 'Female' || st.sex === 'F' ? 'Female' : 'Male',
      birthdate: st.birthdate || '2012-01-01',
      grade_level_id: glVal ? String(glVal) : gradeLevels[0] ? String(gradeLevels[0].id) : '',
      section_id: st.section_id ? String(st.section_id) : matchedSec ? String(matchedSec.id) : '',
      qr_token: '',
      photo: isSafeImageUrl(st.photo_url || st.photo) ? (st.photo_url || st.photo || null) : null,
      house_street_sitio: st.house_street_sitio || '',
      barangay: st.barangay || '',
      municipality_city: st.municipality_city || '',
      province: st.province || '',
      father_name: st.father_name || '',
      mother_maiden_name: st.mother_maiden_name || '',
      guardian_name: st.guardian_name || '',
      guardian_relationship: st.guardian_relationship || 'Mother',
      parent_contact: st.parent_contact || '',
      mother_tongue: st.mother_tongue || '',
      ethnic_group: st.ethnic_group || '',
      religion: st.religion || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (formData.lrn.trim().length !== 12) {
      setFormError('LRN must be 12 digits.');
      setFormTab('BASIC');
      return;
    }
    if (!formData.section_id) {
      setFormError('Please select a class section.');
      setFormTab('BASIC');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        lrn: formData.lrn.trim(),
        first_name: sanitizeText(formData.first_name, 100),
        middle_name: sanitizeText(formData.middle_name, 100),
        last_name: sanitizeText(formData.last_name, 100),
        suffix: sanitizeText(formData.suffix, 20),
        sex: formData.sex,
        birthdate: formData.birthdate,
        mother_tongue: sanitizeText(formData.mother_tongue, 80),
        ethnic_group: sanitizeText(formData.ethnic_group, 80),
        religion: sanitizeText(formData.religion, 80),
        house_street_sitio: sanitizeText(formData.house_street_sitio, 150),
        barangay: sanitizeText(formData.barangay, 100),
        municipality_city: sanitizeText(formData.municipality_city, 100),
        province: sanitizeText(formData.province, 100),
        father_name: sanitizeText(formData.father_name, 150),
        mother_maiden_name: sanitizeText(formData.mother_maiden_name, 150),
        guardian_name: sanitizeText(formData.guardian_name, 150),
        guardian_relationship: sanitizeText(formData.guardian_relationship, 60),
        parent_contact: formData.parent_contact.trim().replace(/[\s-]/g, ''),
        section_id: Number(formData.section_id),
      };

      if (formData.qr_token.trim()) {
        payload.qr_token = formData.qr_token.trim().toUpperCase();
      }
      if (formData.photo && formData.photo.startsWith('data:image/')) {
        payload.photo = formData.photo;
      }

      if (editingStudent) {
        await apiClient.patch(`${API_ROUTES.students.list}${editingStudent.id}/`, payload);
        showAlert({ title: 'Student Updated', message: 'Student profile saved.', type: 'success' });
      } else {
        await apiClient.post(API_ROUTES.students.list, payload);
        showAlert({ title: 'Student Enrolled', message: 'New student enrolled successfully.', type: 'success' });
      }

      setIsModalOpen(false);
      loadMetrics(true);
      loadStudents(currentPage, pageSize, false, true);
    } catch (err) {
      setFormError(extractApiError(err, 'Failed to save student record.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (st: Student) => {
    showConfirm({
      title: 'Delete Student Record',
      message: `Permanently delete ${st.full_name} (LRN: ${st.lrn})?`,
      confirmLabel: 'Delete Student',
      isDestructive: true,
      onConfirm: async () => {
        await apiClient.delete(`${API_ROUTES.students.list}${st.id}/`);
        loadMetrics(true);
        loadStudents(currentPage, pageSize, true, true);
      },
    });
  };

  const totalPages = pageSize >= ALL_ROWS_SIZE ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));
  const activeSchoolName = school.school_name || 'Official Student Pass';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(12px, 2vw, 20px)' }}>
      {/* 1. Real Database KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <StatsCard
          label="REGISTERED STUDENTS"
          value={metrics.total.toLocaleString()}
          helpText="Students in your accessible scope"
          badge={<GraduationCap size={18} color={brand.primary} />}
        />
        <StatsCard
          label="ACTIVE CLASS LIST"
          value={metrics.active.toLocaleString()}
          valueColor={brand.success}
          helpText="Cleared for classroom QR scanning"
          badge={<User size={18} color={brand.success} />}
        />
        <StatsCard
          label="QR CARDS LINKED"
          value={`${metrics.paired.toLocaleString()} / ${metrics.active.toLocaleString()}`}
          valueColor={brand.primary}
          helpText="Active signed QR tokens"
          badge={<CreditCard size={18} color={brand.primary} />}
        />
        <StatsCard
          label="CLASS SECTIONS"
          value={metrics.total_sections.toLocaleString()}
          valueColor={brand.secondary}
          helpText="Assigned active sections"
          badge={<BookOpen size={18} color={brand.secondary} />}
        />
      </div>

      {/* 2. Section Filter & Actions Bar */}
      <div
        style={{
          ...ui.card,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            aria-label="Filter by class section"
            value={selectedSectionFilter}
            onChange={(e) => {
              setSelectedSectionFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ ...ui.input, width: 'auto', minWidth: 220, fontWeight: 700, cursor: 'pointer' }}
          >
            <option value="ALL">All Class Sections</option>
            {sections.map((sec) => (
              <option key={sec.id} value={sec.id}>
                {sec.grade_level_name ? `${sec.grade_level_name} - ` : ''}
                {sec.name}
              </option>
            ))}
          </select>

          <div style={{ position: 'relative', width: 250 }}>
            <Search
              size={14}
              color={tokens.textMuted}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              maxLength={60}
              placeholder="Search student name or LRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...ui.input, paddingLeft: 32 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || totalCount === 0}
            style={ui.btnSecondary}
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export CSV ({totalCount.toLocaleString()})</span>
          </button>

          {canManageStudents && (
            <button type="button" onClick={handleOpenCreate} style={ui.btnPrimary}>
              <Plus size={15} />
              <span>Add Student</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Students Table */}
      <div style={{ ...ui.card, padding: 0, overflow: 'hidden' }}>
        {error && (
          <div
            style={{
              ...ui.subtleBox,
              margin: 14,
              backgroundColor: tokens.dangerLight,
              borderColor: brand.danger,
              color: brand.danger,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 600,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
            <Loader2 size={26} className="animate-spin" color={brand.primary} style={{ margin: '0 auto 8px', display: 'block' }} />
            <span style={{ fontSize: fonts.size.base, fontWeight: 600 }}>Loading student records...</span>
          </div>
        ) : students.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: tokens.textMuted }}>
            <User size={36} style={{ margin: '0 auto 8px', display: 'block' }} />
            <div style={{ fontWeight: 800, color: tokens.textPrimary }}>No Students Found</div>
            <div style={{ fontSize: fonts.size.sm, marginTop: 2 }}>No student records match your current filter.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 740, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Student</th>
                  <th style={ui.th}>LRN</th>
                  <th style={ui.th}>Class Section</th>
                  <th style={ui.th}>QR ID Card</th>
                  <th style={ui.th}>Parent Contact</th>
                  <th style={ui.th}>Status</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => {
                  const fullName = row.full_name || `${row.first_name} ${row.last_name}`;
                  return (
                    <tr key={row.id}>
                      <td style={ui.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <ProfileAvatar photoUrl={row.photo_url || row.photo} name={fullName} size={36} iconSize={17} />
                          <div>
                            <div style={{ fontWeight: 800, color: tokens.textPrimary }}>{fullName}</div>
                            <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>
                              {row.sex}
                              {row.grade_level_name ? ` • ${row.grade_level_name}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={ui.td}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '3px 8px',
                            backgroundColor: tokens.bgSurfaceSubtle,
                            borderWidth: 1,
                            borderStyle: 'solid',
                            borderColor: tokens.borderSubtle,
                            borderRadius: 6,
                            fontFamily: fonts.mono,
                            fontSize: fonts.size.sm,
                            fontWeight: 700,
                          }}
                        >
                          <span>{row.lrn}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(row.lrn)}
                            title="Copy LRN"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                          >
                            {copiedValue === row.lrn ? (
                              <Check size={12} color={brand.success} />
                            ) : (
                              <Copy size={12} color={tokens.textMuted} />
                            )}
                          </button>
                        </div>
                      </td>

                      <td style={ui.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: tokens.textPrimary }}>
                          <BookOpen size={14} color={brand.primary} />
                          <span>{row.current_section || 'Unassigned'}</span>
                        </div>
                      </td>

                      <td style={ui.td}>
                        {row.qr_token ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: brand.success, fontFamily: fonts.mono, fontSize: fonts.size.sm }}>
                            <CreditCard size={13} /> {maskQrToken(row.qr_token)}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: tokens.textMuted, fontSize: fonts.size.sm }}>
                            <CreditCard size={13} /> Not Linked
                          </span>
                        )}
                      </td>

                      <td style={ui.td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: fonts.size.sm, color: tokens.textSecondary }}>
                          <Phone size={13} color={tokens.textMuted} /> {row.parent_contact || '—'}
                        </span>
                      </td>

                      <td style={ui.td}>
                        <span style={ui.badge(row.is_active ? tokens.successLight : tokens.dangerLight, row.is_active ? brand.success : brand.danger)}>
                          {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      <td style={{ ...ui.td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setBadgeStudent(row)}
                            title="View / Print Student QR ID"
                            style={{ ...ui.btnSecondary, padding: '6px 8px' }}
                          >
                            <QrCode size={14} color={brand.primary} />
                          </button>

                          {canManageStudents && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(row)}
                                title="Edit Student"
                                style={{ ...ui.btnSecondary, padding: '6px 8px' }}
                              >
                                <Pencil size={14} color={brand.primary} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(row)}
                                title="Delete Student"
                                style={{ ...ui.btnSecondary, padding: '6px 8px', color: brand.danger }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setCurrentPage(1);
          }}
          itemLabel="students"
          style={{ backgroundColor: tokens.bgSurface, borderTop: `1px solid ${tokens.borderSubtle}` }}
        />
      </div>

      {/* 4. Enroll / Edit Student Modal (Leadership Only) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? `Edit Student: ${editingStudent.full_name}` : 'Enroll New Student (DepEd SF1)'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <div style={{ ...ui.subtleBox, backgroundColor: tokens.dangerLight, borderColor: brand.danger, color: brand.danger, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} /> <span>{formError}</span>
            </div>
          )}

          <ControlSwitch<ModalFormTab>
            options={[
              { value: 'BASIC', label: '1. Basic', icon: <User size={13} /> },
              { value: 'ADDRESS', label: '2. Address', icon: <Home size={13} /> },
              { value: 'PARENTS', label: '3. Guardian', icon: <Users2 size={13} /> },
              { value: 'DEPED', label: '4. DepEd', icon: <GraduationCap size={13} /> },
            ]}
            value={formTab}
            onChange={setFormTab}
            size="sm"
          />

          {formTab === 'BASIC' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 12 }}>
                <ProfileAvatar photoUrl={formData.photo} name={formData.first_name || 'Student'} size={50} iconSize={22} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={ui.btnPrimary}>
                    <Camera size={13} /> Upload Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                  </label>
                  {formData.photo && (
                    <button type="button" onClick={() => setFormData((p) => ({ ...p, photo: null }))} style={{ ...ui.btnSecondary, color: brand.danger }}>
                      <X size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div>
                  <label style={ui.label}>12-Digit LRN *</label>
                  <input required maxLength={12} value={formData.lrn} onChange={(e) => setFormData({ ...formData, lrn: e.target.value.replace(/\D/g, '') })} style={ui.input} placeholder="128936000001" />
                </div>
                <div>
                  <label style={ui.label}>Birthdate *</label>
                  <input type="date" required value={formData.birthdate} onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })} style={ui.input} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={ui.label}>First Name *</label><input required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} style={ui.input} /></div>
                <div><label style={ui.label}>Last Name *</label><input required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} style={ui.input} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.9fr', gap: 10 }}>
                <div><label style={ui.label}>Middle Name</label><input value={formData.middle_name} onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })} style={ui.input} /></div>
                <div>
                  <label style={ui.label}>Suffix</label>
                  <select value={formData.suffix} onChange={(e) => setFormData({ ...formData, suffix: e.target.value })} style={ui.input}>
                    <option value="">None</option>
                    <option value="Jr.">Jr.</option>
                    <option value="Sr.">Sr.</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                  </select>
                </div>
                <div>
                  <label style={ui.label}>Sex *</label>
                  <select value={formData.sex} onChange={(e) => setFormData({ ...formData, sex: e.target.value })} style={ui.input}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10 }}>
                <div>
                  <label style={ui.label}>Grade Level *</label>
                  <select
                    required
                    value={formData.grade_level_id}
                    onChange={(e) => setFormData({ ...formData, grade_level_id: e.target.value, section_id: '' })}
                    style={ui.input}
                  >
                    <option value="">-- Select Grade --</option>
                    {gradeLevels.map((gl) => (
                      <option key={gl.id} value={gl.id}>{gl.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={ui.label}>Class Section *</label>
                  <select required value={formData.section_id} onChange={(e) => setFormData({ ...formData, section_id: e.target.value })} style={ui.input}>
                    <option value="">-- Select Section --</option>
                    {modalAvailableSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>{sec.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {formTab === 'ADDRESS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={ui.label}>House # / Street / Sitio</label><input value={formData.house_street_sitio} onChange={(e) => setFormData({ ...formData, house_street_sitio: e.target.value })} style={ui.input} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={ui.label}>Barangay</label><input value={formData.barangay} onChange={(e) => setFormData({ ...formData, barangay: e.target.value })} style={ui.input} /></div>
                <div><label style={ui.label}>Municipality / City</label><input value={formData.municipality_city} onChange={(e) => setFormData({ ...formData, municipality_city: e.target.value })} style={ui.input} /></div>
              </div>
              <div><label style={ui.label}>Province</label><input value={formData.province} onChange={(e) => setFormData({ ...formData, province: e.target.value })} style={ui.input} /></div>
            </div>
          )}

          {formTab === 'PARENTS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={ui.label}>Father&apos;s Name</label><input value={formData.father_name} onChange={(e) => setFormData({ ...formData, father_name: e.target.value })} style={ui.input} /></div>
                <div><label style={ui.label}>Mother&apos;s Maiden Name</label><input value={formData.mother_maiden_name} onChange={(e) => setFormData({ ...formData, mother_maiden_name: e.target.value })} style={ui.input} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div><label style={ui.label}>Guardian Name</label><input value={formData.guardian_name} onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })} style={ui.input} /></div>
                <div><label style={ui.label}>Relationship</label><input value={formData.guardian_relationship} onChange={(e) => setFormData({ ...formData, guardian_relationship: e.target.value })} style={ui.input} /></div>
              </div>
              <div><label style={ui.label}>Parent Mobile Number (11 Digits) *</label><input required value={formData.parent_contact} onChange={(e) => setFormData({ ...formData, parent_contact: e.target.value })} style={ui.input} placeholder="09171234567" /></div>
            </div>
          )}

          {formTab === 'DEPED' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={ui.label}>Mother Tongue</label><input value={formData.mother_tongue} onChange={(e) => setFormData({ ...formData, mother_tongue: e.target.value })} style={ui.input} /></div>
                <div><label style={ui.label}>IP / Ethnic Group</label><input value={formData.ethnic_group} onChange={(e) => setFormData({ ...formData, ethnic_group: e.target.value })} style={ui.input} /></div>
              </div>
              <div><label style={ui.label}>Religion</label><input value={formData.religion} onChange={(e) => setFormData({ ...formData, religion: e.target.value })} style={ui.input} /></div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving}>
              {editingStudent ? 'Save Changes' : 'Enroll Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 5. Student QR Pass Modal */}
      {badgeStudent && (
        <Modal isOpen={Boolean(badgeStudent)} onClose={() => setBadgeStudent(null)} title="Student QR ID Card">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 292, backgroundColor: tokens.bgSurface, borderWidth: 2, borderStyle: 'solid', borderColor: brand.primary, borderRadius: 14, overflow: 'hidden', boxShadow: tokens.cardShadow }}>
              <div style={{ backgroundColor: brand.buttonBg, color: '#ffffff', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: fonts.size.xs, fontWeight: 800 }}>
                  <ShieldCheck size={14} /> OFFICIAL STUDENT QR PASS
                </div>
                <div style={{ fontSize: '0.64rem', opacity: 0.9, marginTop: 2 }}>{activeSchoolName}</div>
              </div>

              <div style={{ padding: '16px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <ProfileAvatar photoUrl={badgeStudent.photo_url || badgeStudent.photo} name={badgeStudent.full_name} size={56} iconSize={26} />
                </div>
                <div style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>{badgeStudent.full_name}</div>
                <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>{badgeStudent.current_section || 'Enrolled Student'}</div>
                <div style={{ margin: '8px auto', padding: '3px 10px', backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 6, fontFamily: fonts.mono, fontWeight: 700, fontSize: fonts.size.sm, display: 'inline-block' }}>
                  LRN: {badgeStudent.lrn}
                </div>
                <div style={{ width: 122, height: 122, margin: '8px auto', padding: 6, backgroundColor: '#ffffff', borderWidth: 1, borderStyle: 'solid', borderColor: tokens.borderSubtle, borderRadius: 10 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(badgeStudent.lrn)}`}
                    alt="Student QR"
                    referrerPolicy="no-referrer"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="secondary" type="button" onClick={() => setBadgeStudent(null)}>Close</Button>
              <Button variant="primary" type="button" onClick={() => window.print()} icon={<Printer size={14} />}>Print Pass</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default StudentsTab;