/**
 * AttendSure - Students Directory, DepEd SF1 Enrollment & Bulk CSV Class List Import
 * File: web/src/components/tabs/StudentsTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { isSafeImageUrl, QR_COLORS } from '../../theme/tokens';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { AvatarUploadField } from '../common/AvatarUploadField';
import { StatusBadge } from '../common/StatusBadge';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { Pagination, exportToCsv, ALL_ROWS_SIZE } from '../common/Pagination';
import { ControlSwitch } from '../ui/ControlSwitch';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PrintableExportModal, type SelectableOption } from '../modals/PrintableExportModal';
import { useAlert } from '../../context/AlertContext';
import { useCopyFeedback } from '../../utils/clipboard';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import {
  canBulkImportStudents,
  canDeleteStudents,
  canManageStudents as canManageStudentsPerm,
  getCurrentUserFromStorage,
  isAdminOrPrincipal,
} from '../../utils/permissions';
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
  AlertCircle,
  Download,
  Upload,
  FileSpreadsheet,
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
  guardian_contact: string;
  qr_token?: string;
  qr_payload?: string;
  current_section?: string;
  current_section_id?: number | null;
  section_id?: number;
  enrollment_status?: 'ENROLLED' | 'TRANSFERRED_IN' | 'TRANSFERRED_OUT' | 'DROPPED';
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
  display_label?: string;
  grade_level?: number | { id: number; name: string };
  grade_level_name?: string;
  adviser_id?: number | null;
  is_adviser?: boolean;
  scheduled_subjects_count?: number;
}

interface MetricsData {
  total: number;
  active: number;
  paired: number;
  total_sections: number;
}

interface CsvImportSummary {
  ok: boolean;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  errors: Array<{ row: number; lrn: string; reason: string }>;
}

type ModalFormTab = 'BASIC' | 'ADDRESS' | 'GUARDIAN' | 'DEPED';

const sanitizeInput = (raw: string, maxLength = 150): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

const maskQrToken = (token?: string): string => {
  const clean = String(token || '').trim();
  if (!clean) return '';
  return clean.length <= 4 ? 'Linked' : `••••${clean.slice(-4)}`;
};

export const StudentsTab: React.FC = () => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { school } = useSchool();
  const { showAlert, showConfirm } = useAlert();

  const currentUser = useMemo(() => getCurrentUserFromStorage(), []);
  const isExecutive = isAdminOrPrincipal(currentUser);
  const canBulkImport = canBulkImportStudents(currentUser);
  const canDeleteStudent = canDeleteStudents(currentUser);

  const cachedStudentsPayload = peekApiCache<any>(API_ROUTES.students.list, { page: 1, page_size: 25 });
  const cachedMetricsPayload = peekApiCache<any>(API_ROUTES.students.metrics);
  const cachedGradesPayload = peekApiCache<any>(API_ROUTES.school.gradeLevels, { page_size: 200 });
  const cachedSectionsPayload = peekApiCache<any>(API_ROUTES.school.sections, { page_size: 300 });

  const [students, setStudents] = useState<Student[]>(() => {
    if (cachedStudentsPayload && 'results' in cachedStudentsPayload) return cachedStudentsPayload.results || [];
    if (Array.isArray(cachedStudentsPayload)) return cachedStudentsPayload;
    return [];
  });
  const [gradeLevels, setGradeLevels] = useState<GradeLevelItem[]>(() =>
    Array.isArray(cachedGradesPayload) ? cachedGradesPayload : cachedGradesPayload?.results || []
  );
  const [sections, setSections] = useState<SectionItem[]>(() =>
    Array.isArray(cachedSectionsPayload) ? cachedSectionsPayload : cachedSectionsPayload?.results || []
  );
  const [loading, setLoading] = useState<boolean>(() => !cachedStudentsPayload);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(() => {
    if (cachedStudentsPayload && 'results' in cachedStudentsPayload) return Number(cachedStudentsPayload.count) || 0;
    if (Array.isArray(cachedStudentsPayload)) return cachedStudentsPayload.length;
    return 0;
  });

  const [metrics, setMetrics] = useState<MetricsData>(() => ({
    total: Number(cachedMetricsPayload?.total ?? cachedMetricsPayload?.total_students ?? 0),
    active: Number(cachedMetricsPayload?.active ?? cachedMetricsPayload?.total_students ?? 0),
    paired: Number(cachedMetricsPayload?.paired ?? 0),
    total_sections: Number(cachedMetricsPayload?.total_sections ?? 0),
  }));

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');
  const { copiedKey: copiedValue, copy } = useCopyFeedback();
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  const sectionOptions = useMemo<SelectableOption[]>(
    () =>
      sections.map((sec) => ({
        id: sec.id,
        label: `${sec.grade_level_name ? `${sec.grade_level_name} - ` : ''}${sec.name}`,
      })),
    [sections]
  );

  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  // Bulk CSV Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importDefaultSectionId, setImportDefaultSectionId] = useState<string>('');
  const [autoCreateSections, setAutoCreateSections] = useState<boolean>(true);
  const [importingCsv, setImportingCsv] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<CsvImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [formTab, setFormTab] = useState<ModalFormTab>('BASIC');
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);

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
    enrollment_status: 'ENROLLED' as 'ENROLLED' | 'TRANSFERRED_IN' | 'TRANSFERRED_OUT' | 'DROPPED',
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
    guardian_contact: '',
    mother_tongue: '',
    ethnic_group: '',
    religion: '',
  });

  const abortRef = useRef<AbortController | null>(null);
  const metricsAbortRef = useRef<AbortController | null>(null);
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = isModalOpen || isImportModalOpen || Boolean(badgeStudent);

  const lrnDigits = formData.lrn.replace(/\D/g, '');
  const lrnAvail = useFieldAvailability({
    enabled: isModalOpen && lrnDigits.length === 12,
    field: 'lrn',
    value: lrnDigits,
    minLength: 12,
    fallbackMessage: 'This 12-digit LRN is already registered.',
    excludeId: editingStudent?.id,
  });
  const lrnCheck = {
    checking: lrnAvail.checking,
    is_taken: lrnAvail.isTaken,
    available: lrnAvail.verified,
    message: lrnAvail.error,
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(sanitizeInput(searchQuery, 60));
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadAcademicLookups = useCallback((signal?: AbortSignal) => {
    Promise.allSettled([
      apiClient.get(API_ROUTES.school.gradeLevels, { params: { page_size: 200, nocache: 1 }, signal }),
      apiClient.get(API_ROUTES.school.sections, { params: { page_size: 300, nocache: 1 }, signal }),
    ]).then(([glRes, secRes]) => {
      if (signal?.aborted) return;
      if (glRes.status === 'fulfilled' && glRes.value?.data) {
        setGradeLevels(Array.isArray(glRes.value.data) ? glRes.value.data : glRes.value.data?.results || []);
      }
      if (secRes.status === 'fulfilled' && secRes.value?.data) {
        setSections(Array.isArray(secRes.value.data) ? secRes.value.data : secRes.value.data?.results || []);
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAcademicLookups(controller.signal);
    return () => controller.abort();
  }, [loadAcademicLookups]);

  useEffect(() => {
    return () => {
      metricsAbortRef.current?.abort();
    };
  }, []);

  const loadMetrics = useCallback(async (bypassCache = false) => {
    metricsAbortRef.current?.abort();
    const controller = new AbortController();
    metricsAbortRef.current = controller;

    try {
      const res = await apiClient.get(API_ROUTES.students.metrics, {
        params: bypassCache ? { nocache: 1 } : undefined,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.data) {
        setMetrics({
          total: Number(res.data.total ?? res.data.total_students ?? 0),
          active: Number(res.data.active ?? res.data.total_students ?? 0),
          paired: Number(res.data.paired ?? 0),
          total_sections: Number(res.data.total_sections ?? 0),
        });
      }
    } catch {
      // Keep existing metrics if offline or canceled
    }
  }, []);

  const loadStudents = useCallback(
    async (page: number, size: number, silent = false, bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const isAll = size >= ALL_ROWS_SIZE;
      const baseParams: Record<string, string | number> = {
        page: isAll ? 1 : page,
        page_size: isAll ? 'ALL' : size,
      };
      if (debouncedSearch) baseParams.search = debouncedSearch;
      if (selectedSectionFilter !== 'ALL') baseParams.section_id = selectedSectionFilter;

      const cached = !bypassCache ? peekApiCache<any>(API_ROUTES.students.list, baseParams) : undefined;
      if (cached) {
        if ('results' in cached) {
          setStudents(cached.results || []);
          setTotalCount(Number(cached.count) || 0);
        } else if (Array.isArray(cached)) {
          setStudents(cached);
          setTotalCount(cached.length);
        }
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const params: Record<string, string | number> = { ...baseParams };
        if (bypassCache) params.nocache = 1;

        const res = await apiClient.get(API_ROUTES.students.list, {
          params,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (res.data && 'results' in res.data) {
          setStudents(res.data.results);
          setTotalCount(Number(res.data.count) || 0);
        } else if (Array.isArray(res.data)) {
          setStudents(res.data);
          setTotalCount(res.data.length);
        }
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) setError(extractApiError(err, 'Could not load student directory.'));
      } finally {
        if (!controller.signal.aborted && !silent) setLoading(false);
      }
    },
    [debouncedSearch, selectedSectionFilter]
  );

  useEffect(() => {
    void loadMetrics(false);
  }, [loadMetrics]);

  useEffect(() => {
    void loadStudents(currentPage, pageSize, false, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [currentPage, pageSize, loadStudents]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isInteracting.current && document.visibilityState === 'visible') {
        void loadStudents(currentPage, pageSize, true, true);
        void loadMetrics(true);
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [currentPage, pageSize, loadStudents, loadMetrics]);

  const advisedSectionIds = useMemo(() => {
    const tid = Number(currentUser.teacher_id || 0);
    return sections
      .filter((sec) => Boolean(sec.is_adviser) || (tid > 0 && Number(sec.adviser_id) === tid))
      .map((sec) => sec.id);
  }, [sections, currentUser.teacher_id]);

  const canAddStudent = canManageStudentsPerm(currentUser, advisedSectionIds);
  const canEditStudentRow = useCallback(
    (st: Student) =>
      canManageStudentsPerm(currentUser, advisedSectionIds, st.current_section_id ?? st.section_id ?? null),
    [currentUser, advisedSectionIds]
  );

  const modalAvailableSections = useMemo(() => {
    const baseSections =
      !isExecutive && advisedSectionIds.length > 0
        ? sections.filter((sec) => advisedSectionIds.includes(sec.id))
        : sections;
    if (!formData.grade_level_id) return baseSections;
    return baseSections.filter((sec) => {
      const glId =
        typeof sec.grade_level === 'object' && sec.grade_level !== null ? sec.grade_level.id : sec.grade_level;
      return String(glId) === String(formData.grade_level_id);
    });
  }, [sections, formData.grade_level_id, isExecutive, advisedSectionIds]);

  const selectedModalSection = useMemo(() => {
    if (!formData.section_id) return null;
    return sections.find((sec) => String(sec.id) === String(formData.section_id)) || null;
  }, [sections, formData.section_id]);

  const handleCopy = async (val: string) => {
    if (!val) return;
    await copy(val, val);
  };

  const handleDownloadCsvTemplate = () => {
    exportToCsv(
      'AttendSure_ClassList_Import_Template.csv',
      [
        'lrn',
        'first_name',
        'middle_name',
        'last_name',
        'suffix',
        'sex',
        'birthdate',
        'section_name',
        'grade_level',
        'guardian_contact',
        'barangay',
        'municipality_city',
        'province',
      ],
      [
        [
          '128936000001',
          'FirstName',
          'MiddleName',
          'LastName',
          '',
          'Male',
          '2012-06-15',
          sections[0]?.name || 'SectionA',
          sections[0]?.grade_level_name || 'Grade 7',
          '09170000000',
          'BarangayName',
          'CityName',
          'ProvinceName',
        ],
      ]
    );
  };

  const handleOpenCsvImport = () => {
    setCsvFile(null);
    setImportSummary(null);
    setImportError(null);
    setImportDefaultSectionId(selectedSectionFilter !== 'ALL' ? selectedSectionFilter : '');
    setAutoCreateSections(true);
    setIsImportModalOpen(true);
  };

  const handleRunCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImportSummary(null);

    if (!csvFile) {
      setImportError('Please select a .csv class list file first.');
      return;
    }
    if (!csvFile.name.toLowerCase().endsWith('.csv')) {
      setImportError('Only .csv spreadsheet files are accepted.');
      return;
    }
    if (csvFile.size > 5 * 1024 * 1024) {
      setImportError('CSV file must be 5 MB or smaller.');
      return;
    }

    setImportingCsv(true);
    try {
      const payload = new FormData();
      payload.append('file', csvFile);
      if (importDefaultSectionId) {
        payload.append('section_id', importDefaultSectionId);
      }
      payload.append('auto_create_sections', String(autoCreateSections));

      const res = await apiClient.post<CsvImportSummary>(API_ROUTES.students.bulkImport, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportSummary(res.data);
      loadAcademicLookups();
      await loadMetrics(true);
      await loadStudents(1, pageSize, false, true);
      setCurrentPage(1);
    } catch (err) {
      setImportError(extractApiError(err, 'Could not import CSV class list.'));
    } finally {
      setImportingCsv(false);
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
          'Guardian Contact',
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
          s.guardian_contact || '',
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

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setFormError(null);
    setPhotoRemoved(false);
    setFormTab('BASIC');
    const defaultAdvisedSec =
      !isExecutive && advisedSectionIds.length > 0
        ? sections.find((s) => advisedSectionIds.includes(s.id))
        : undefined;
    const defaultGl =
      defaultAdvisedSec && typeof defaultAdvisedSec.grade_level === 'object' && defaultAdvisedSec.grade_level !== null
        ? defaultAdvisedSec.grade_level.id
        : defaultAdvisedSec?.grade_level;
    setFormData({
      lrn: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      sex: 'Male',
      birthdate: '2012-01-01',
      grade_level_id: defaultGl ? String(defaultGl) : gradeLevels[0] ? String(gradeLevels[0].id) : '',
      section_id: defaultAdvisedSec ? String(defaultAdvisedSec.id) : '',
      enrollment_status: 'ENROLLED',
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
      guardian_contact: '',
      mother_tongue: '',
      ethnic_group: '',
      religion: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (st: Student) => {
    setEditingStudent(st);
    setFormError(null);
    setPhotoRemoved(false);
    setFormTab('BASIC');

    const exactSecId = st.current_section_id ?? st.section_id;
    const matchedSec =
      (exactSecId ? sections.find((s) => s.id === exactSecId) : undefined) ||
      sections.find((s) => s.name === st.current_section);
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
      section_id: exactSecId ? String(exactSecId) : matchedSec ? String(matchedSec.id) : '',
      enrollment_status: st.enrollment_status || 'ENROLLED',
      qr_token: '',
      photo: isSafeImageUrl(st.photo_url || st.photo) ? st.photo_url || st.photo || null : null,
      house_street_sitio: st.house_street_sitio || '',
      barangay: st.barangay || '',
      municipality_city: st.municipality_city || '',
      province: st.province || '',
      father_name: st.father_name || '',
      mother_maiden_name: st.mother_maiden_name || '',
      guardian_name: st.guardian_name || '',
      guardian_relationship: st.guardian_relationship || 'Mother',
      guardian_contact: st.guardian_contact || '',
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
    if (lrnCheck.is_taken) {
      setFormError(lrnCheck.message || 'This 12-digit LRN is already registered to another student.');
      setFormTab('BASIC');
      return;
    }
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      setFormError('First name and last name are required.');
      setFormTab('BASIC');
      return;
    }
    if (!formData.section_id) {
      setFormError('Please select a class section.');
      setFormTab('BASIC');
      return;
    }

    const cleanGuardianPhone = formData.guardian_contact.trim().replace(/[\s-]/g, '');
    if (!cleanGuardianPhone) {
      setFormError('Guardian contact number is required in the "3. Guardian" tab.');
      setFormTab('GUARDIAN');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        lrn: formData.lrn.trim(),
        first_name: sanitizeInput(formData.first_name, 100),
        middle_name: sanitizeInput(formData.middle_name, 100),
        last_name: sanitizeInput(formData.last_name, 100),
        suffix: sanitizeInput(formData.suffix, 20),
        gender: formData.sex,
        birth_date: formData.birthdate,
        mother_tongue: sanitizeInput(formData.mother_tongue, 80),
        ethnic_group: sanitizeInput(formData.ethnic_group, 80),
        religion: sanitizeInput(formData.religion, 80),
        house_street_sitio: sanitizeInput(formData.house_street_sitio, 150),
        barangay: sanitizeInput(formData.barangay, 100),
        municipality_city: sanitizeInput(formData.municipality_city, 100),
        province: sanitizeInput(formData.province, 100),
        father_name: sanitizeInput(formData.father_name, 150),
        mother_maiden_name: sanitizeInput(formData.mother_maiden_name, 150),
        guardian_name: sanitizeInput(formData.guardian_name, 150),
        guardian_relationship: sanitizeInput(formData.guardian_relationship, 60),
        guardian_contact: sanitizeInput(cleanGuardianPhone, 20),
        section_id: Number(formData.section_id),
        enrollment_status: formData.enrollment_status,
      };

      if (formData.photo && formData.photo.startsWith('data:image/') && isSafeImageUrl(formData.photo)) {
        payload.photo = formData.photo;
      } else if (photoRemoved && editingStudent) {
        payload.photo = null;
        payload.remove_photo = true;
      }

      if (editingStudent) {
        await apiClient.patch(`${API_ROUTES.students.list}${editingStudent.id}/`, payload);
        showAlert({ title: 'Student Updated', message: 'Student profile saved.', type: 'success' });
      } else {
        await apiClient.post(API_ROUTES.students.list, payload);
        showAlert({ title: 'Student Enrolled', message: 'New student enrolled successfully.', type: 'success' });
      }

      setIsModalOpen(false);
      await loadMetrics(true);
      await loadStudents(currentPage, pageSize, false, true);
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
        try {
          await apiClient.delete(`${API_ROUTES.students.list}${st.id}/`);
          showAlert({ title: 'Student Removed', message: `${st.full_name} was removed from the class list.`, type: 'info' });
          await loadMetrics(true);
          await loadStudents(currentPage, pageSize, true, true);
        } catch (err) {
          showAlert({ title: 'Delete Failed', message: extractApiError(err, 'Could not delete student record.'), type: 'error' });
        }
      },
    });
  };

  const totalPages = pageSize >= ALL_ROWS_SIZE ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));
  const activeSchoolName = school.school_name || 'Official Student Pass';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 'clamp(12px, 2vw, 20px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
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
          {selectedStudentIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStudentIds([])}
              style={{
                ...ui.btnSecondary,
                backgroundColor: tokens.primaryLight,
                borderColor: brand.primary,
                color: brand.primary,
              }}
            >
              <span>{selectedStudentIds.length} Selected &times; Clear</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            disabled={totalCount === 0}
            style={{ ...ui.btnSecondary, borderColor: brand.primary, color: brand.primary }}
          >
            <Printer size={14} color={brand.primary} />
            <span>
              {selectedStudentIds.length > 0
                ? `Print Class List & QR (${selectedStudentIds.length})`
                : 'Print / Export Class List & QR'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || totalCount === 0}
            style={ui.btnSecondary}
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export CSV ({totalCount.toLocaleString()})</span>
          </button>

          {canBulkImport && (
            <button
              type="button"
              onClick={handleOpenCsvImport}
              style={ui.btnSecondary}
            >
              <Upload size={14} color={brand.primary} />
              <span>Import CSV Class List</span>
            </button>
          )}

          {canAddStudent && (
            <button type="button" onClick={handleOpenCreate} style={ui.btnPrimary}>
              <Plus size={15} />
              <span>Add Student</span>
            </button>
          )}
        </div>
      </div>

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
                  <th style={{ ...ui.th, width: 38, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label="Select all students on this page"
                      checked={
                        students.length > 0 &&
                        students.every((row) => selectedStudentIds.includes(row.id))
                      }
                      onChange={(e) => {
                        const pageIds = students.map((row) => row.id);
                        if (e.target.checked) {
                          setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                        } else {
                          setSelectedStudentIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={ui.th}>Student</th>
                  <th style={ui.th}>LRN</th>
                  <th style={ui.th}>Class Section</th>
                  <th style={ui.th}>QR ID Card</th>
                  <th style={ui.th}>Guardian Contact</th>
                  <th style={ui.th}>Status</th>
                  <th style={{ ...ui.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => {
                  const fullName = row.full_name || `${row.first_name} ${row.last_name}`;
                  return (
                    <tr key={row.id}>
                      <td style={{ ...ui.td, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${fullName}`}
                          checked={selectedStudentIds.includes(row.id)}
                          onChange={() => toggleStudentSelection(row.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
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
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontWeight: 700,
                              color: brand.success,
                              fontFamily: fonts.mono,
                              fontSize: fonts.size.sm,
                            }}
                          >
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
                          <Phone size={13} color={tokens.textMuted} /> {row.guardian_contact || '—'}
                        </span>
                      </td>

                      <td style={ui.td}>
                        <StatusBadge
                          status={row.enrollment_status || (row.is_active ? 'ENROLLED' : 'INACTIVE')}
                        />
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

                          {canEditStudentRow(row) && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(row)}
                              title="Edit Student"
                              style={{ ...ui.btnSecondary, padding: '6px 8px' }}
                            >
                              <Pencil size={14} color={brand.primary} />
                            </button>
                          )}

                          {canDeleteStudent && (
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              title="Delete Student"
                              style={{ ...ui.btnSecondary, padding: '6px 8px', color: brand.danger }}
                            >
                              <Trash2 size={14} />
                            </button>
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

      {/* Bulk CSV Class List Import Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Bulk Import CSV Class List"
      >
        <form onSubmit={handleRunCsvImport} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              ...ui.subtleBox,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileSpreadsheet size={20} color={brand.primary} />
              <div>
                <div style={{ fontSize: fonts.size.sm, fontWeight: 800, color: tokens.textPrimary }}>
                  2-Minute School Onboarding
                </div>
                <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary }}>
                  Upload up to 2,000 students at once (.csv, max 5 MB). Signed QR IDs generate automatically.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              style={ui.btnSecondary}
            >
              <Download size={13} />
              <span>Download Sample CSV Template</span>
            </button>
          </div>

          {importError && (
            <div
              style={{
                ...ui.subtleBox,
                backgroundColor: tokens.dangerLight,
                borderColor: brand.danger,
                color: brand.danger,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 600,
              }}
            >
              <AlertCircle size={15} />
              <span>{importError}</span>
            </div>
          )}

          <div>
            <label style={ui.label}>Select CSV File *</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setCsvFile(e.target.files?.[0] || null);
                setImportSummary(null);
                setImportError(null);
              }}
              style={ui.input}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
            <div>
              <label style={ui.label}>Fallback Section (If row has no section_name)</label>
              <select
                value={importDefaultSectionId}
                onChange={(e) => setImportDefaultSectionId(e.target.value)}
                style={ui.input}
              >
                <option value="">-- Use section_name from CSV --</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.grade_level_name ? `${sec.grade_level_name} - ` : ''}
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: fonts.size.sm, fontWeight: 600, color: tokens.textPrimary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoCreateSections}
                  onChange={(e) => setAutoCreateSections(e.target.checked)}
                  style={{ accentColor: brand.primary }}
                />
                Auto-create new sections from CSV
              </label>
            </div>
          </div>

          {importSummary && (
            <div
              style={{
                ...ui.subtleBox,
                backgroundColor: tokens.successLight,
                borderColor: brand.success,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800, color: brand.success, fontSize: fonts.size.sm }}>
                Import Complete: {importSummary.created_count} Created &bull; {importSummary.updated_count} Updated &bull; {importSummary.skipped_count} Skipped
              </div>
              {importSummary.errors.length > 0 && (
                <div
                  style={{
                    maxHeight: 130,
                    overflowY: 'auto',
                    backgroundColor: tokens.bgSurface,
                    padding: 8,
                    borderRadius: 6,
                    fontSize: fonts.size.xs,
                    color: tokens.textSecondary,
                  }}
                >
                  {importSummary.errors.map((errItem, idx) => (
                    <div key={`${errItem.row}-${idx}`}>
                      Row {errItem.row} ({errItem.lrn || 'No LRN'}): {errItem.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <Button variant="secondary" type="button" onClick={() => setIsImportModalOpen(false)}>
              Close
            </Button>
            <Button variant="primary" type="submit" loading={importingCsv} disabled={!csvFile}>
              Upload &amp; Import Class List
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? `Edit Student: ${editingStudent.full_name}` : 'Enroll New Student (DepEd SF1)'}
      >
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError && (
            <div
              style={{
                ...ui.subtleBox,
                backgroundColor: tokens.dangerLight,
                borderColor: brand.danger,
                color: brand.danger,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertCircle size={15} /> <span>{formError}</span>
            </div>
          )}

          <ControlSwitch<ModalFormTab>
            options={[
              { value: 'BASIC', label: '1. Basic', icon: <User size={13} /> },
              { value: 'ADDRESS', label: '2. Address', icon: <Home size={13} /> },
              { value: 'GUARDIAN', label: '3. Guardian', icon: <Users2 size={13} /> },
              { value: 'DEPED', label: '4. DepEd', icon: <GraduationCap size={13} /> },
            ]}
            value={formTab}
            onChange={setFormTab}
            size="sm"
          />

          {formTab === 'BASIC' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AvatarUploadField
                previewUrl={formData.photo}
                displayName={`${formData.first_name} ${formData.last_name}`.trim() || 'Student'}
                label="Student ID Photo"
                size={54}
                disabled={saving}
                onSelectPhoto={(_file, dataUri) => {
                  setFormError(null);
                  setPhotoRemoved(false);
                  setFormData((prev) => ({ ...prev, photo: dataUri }));
                }}
                onRemovePhoto={() => {
                  setFormData((p) => ({ ...p, photo: null }));
                  setPhotoRemoved(true);
                }}
                onValidationError={(msg) => setFormError(msg)}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>12-Digit LRN *</label>
                  <input
                    maxLength={12}
                    value={formData.lrn}
                    onChange={(e) => setFormData({ ...formData, lrn: e.target.value.replace(/\D/g, '') })}
                    style={{
                      ...ui.input,
                      borderColor: lrnCheck.is_taken
                        ? brand.danger
                        : lrnCheck.available
                          ? brand.success
                          : tokens.borderStrong,
                    }}
                    placeholder="Enter 12-digit LRN"
                  />
                  {lrnCheck.checking && (
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: tokens.textMuted, fontWeight: 600 }}>
                      Checking LRN availability...
                    </span>
                  )}
                  {lrnCheck.is_taken && (
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: brand.danger, fontWeight: 700 }}>
                      {lrnCheck.message || 'This 12-digit LRN is already registered.'}
                    </span>
                  )}
                  {!lrnCheck.checking && lrnCheck.available && (
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: brand.success, fontWeight: 700 }}>
                      LRN is available.
                    </span>
                  )}
                </div>
                <div>
                  <label style={ui.label}>Birthdate *</label>
                  <input
                    type="date"
                    value={formData.birthdate}
                    onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                    style={ui.input}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>First Name *</label>
                  <input maxLength={100} value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} style={ui.input} />
                </div>
                <div>
                  <label style={ui.label}>Last Name *</label>
                  <input maxLength={100} value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} style={ui.input} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>Middle Name</label>
                  <input maxLength={100} value={formData.middle_name} onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })} style={ui.input} />
                </div>
                <div>
                  <label style={ui.label}>Suffix</label>
                  <select value={formData.suffix} onChange={(e) => setFormData({ ...formData, suffix: e.target.value })} style={ui.input}>
                    <option value="">None</option>
                    <option value="Jr.">Jr.</option>
                    <option value="Sr.">Sr.</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                    <option value="V">V</option>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>Grade Level *</label>
                  <select
                    value={formData.grade_level_id}
                    onChange={(e) => setFormData({ ...formData, grade_level_id: e.target.value, section_id: '' })}
                    style={ui.input}
                  >
                    <option value="">-- Select Grade --</option>
                    {gradeLevels.map((gl) => (
                      <option key={gl.id} value={gl.id}>
                        {gl.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={ui.label}>Class Section *</label>
                  <select
                    value={formData.section_id}
                    onChange={(e) => setFormData({ ...formData, section_id: e.target.value })}
                    style={ui.input}
                  >
                    <option value="">-- Select Section --</option>
                    {modalAvailableSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={ui.label}>Enrollment Status (DepEd SF1) *</label>
                  <select
                    value={formData.enrollment_status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        enrollment_status: e.target.value as
                          | 'ENROLLED'
                          | 'TRANSFERRED_IN'
                          | 'TRANSFERRED_OUT'
                          | 'DROPPED',
                      })
                    }
                    style={ui.input}
                  >
                    <option value="ENROLLED">Enrolled</option>
                    <option value="TRANSFERRED_IN">Transferred In</option>
                    <option value="TRANSFERRED_OUT">Transferred Out</option>
                    <option value="DROPPED">Dropped</option>
                  </select>
                </div>
              </div>

              {selectedModalSection && (
                <div
                  style={{
                    ...ui.subtleBox,
                    backgroundColor: tokens.infoLight,
                    borderColor: brand.primary,
                    color: brand.primary,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    fontSize: fonts.size.xs,
                    fontWeight: 700,
                  }}
                >
                  <BookOpen size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Auto-Enrollment Active: Enrolling in{' '}
                    {selectedModalSection.display_label ||
                      (selectedModalSection.grade_level_name
                        ? `${selectedModalSection.grade_level_name} - ${selectedModalSection.name}`
                        : selectedModalSection.name)}{' '}
                    automatically includes this student in all{' '}
                    {Number(selectedModalSection.scheduled_subjects_count ?? 0)} scheduled subject periods and class lists for this section.
                  </span>
                </div>
              )}
            </div>
          )}

          {formTab === 'ADDRESS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={ui.label}>House # / Street / Sitio</label>
                <input maxLength={150} value={formData.house_street_sitio} onChange={(e) => setFormData({ ...formData, house_street_sitio: e.target.value })} style={ui.input} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>Barangay</label>
                  <input maxLength={100} value={formData.barangay} onChange={(e) => setFormData({ ...formData, barangay: e.target.value })} style={ui.input} />
                </div>
                <div>
                  <label style={ui.label}>Municipality / City</label>
                  <input maxLength={100} value={formData.municipality_city} onChange={(e) => setFormData({ ...formData, municipality_city: e.target.value })} style={ui.input} />
                </div>
              </div>
              <div>
                <label style={ui.label}>Province</label>
                <input maxLength={100} value={formData.province} onChange={(e) => setFormData({ ...formData, province: e.target.value })} style={ui.input} />
              </div>
            </div>
          )}

          {formTab === 'GUARDIAN' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>Father&apos;s Name (SF1)</label>
                  <input maxLength={150} value={formData.father_name} onChange={(e) => setFormData({ ...formData, father_name: e.target.value })} style={ui.input} />
                </div>
                <div>
                  <label style={ui.label}>Mother&apos;s Maiden Name (SF1)</label>
                  <input maxLength={150} value={formData.mother_maiden_name} onChange={(e) => setFormData({ ...formData, mother_maiden_name: e.target.value })} style={ui.input} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>Guardian Name (SF1)</label>
                  <input maxLength={150} value={formData.guardian_name} onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })} style={ui.input} />
                </div>
                <div>
                  <label style={ui.label}>Relationship</label>
                  <input maxLength={60} value={formData.guardian_relationship} onChange={(e) => setFormData({ ...formData, guardian_relationship: e.target.value })} style={ui.input} />
                </div>
              </div>
              <div>
                <label style={ui.label}>Guardian Contact Number (11 Digits, SF1 Record) *</label>
                <input
                  maxLength={20}
                  value={formData.guardian_contact}
                  onChange={(e) => setFormData({ ...formData, guardian_contact: e.target.value })}
                  style={ui.input}
                  placeholder="Enter 11-digit guardian contact number"
                />
              </div>
            </div>
          )}

          {formTab === 'DEPED' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
                <div>
                  <label style={ui.label}>Mother Tongue</label>
                  <input maxLength={80} value={formData.mother_tongue} onChange={(e) => setFormData({ ...formData, mother_tongue: e.target.value })} style={ui.input} />
                </div>
                <div>
                  <label style={ui.label}>IP / Ethnic Group</label>
                  <input maxLength={80} value={formData.ethnic_group} onChange={(e) => setFormData({ ...formData, ethnic_group: e.target.value })} style={ui.input} />
                </div>
              </div>
              <div>
                <label style={ui.label}>Religion</label>
                <input maxLength={80} value={formData.religion} onChange={(e) => setFormData({ ...formData, religion: e.target.value })} style={ui.input} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving} disabled={saving || lrnCheck.is_taken || lrnCheck.checking}>
              {editingStudent ? 'Save Changes' : 'Enroll Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {badgeStudent && (
        <Modal isOpen={Boolean(badgeStudent)} onClose={() => setBadgeStudent(null)} title="Student QR ID Card">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div
              style={{
                width: 292,
                backgroundColor: tokens.bgSurface,
                borderWidth: 2,
                borderStyle: 'solid',
                borderColor: brand.primary,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: tokens.cardShadow,
              }}
            >
              <div style={{ backgroundColor: brand.buttonBg, color: tokens.onPrimary, padding: '12px 14px' }}>
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
                <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>
                  {badgeStudent.current_section || 'Enrolled Student'}
                </div>
                <div
                  style={{
                    margin: '8px auto',
                    padding: '3px 10px',
                    backgroundColor: tokens.bgSurfaceSubtle,
                    borderRadius: 6,
                    fontFamily: fonts.mono,
                    fontWeight: 700,
                    fontSize: fonts.size.sm,
                    display: 'inline-block',
                  }}
                >
                  LRN: {badgeStudent.lrn}
                </div>
                <div
                  style={{
                    width: 124,
                    height: 124,
                    margin: '8px auto',
                    padding: 6,
                    backgroundColor: QR_COLORS.background,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: tokens.borderSubtle,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <QrCodeSvg
                    value={badgeStudent.qr_payload || badgeStudent.lrn}
                    size={112}
                    label={`QR code for ${badgeStudent.full_name}`}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="secondary" type="button" onClick={() => setBadgeStudent(null)}>
                Close
              </Button>
              <Button variant="primary" type="button" onClick={() => window.print()} icon={<Printer size={14} />}>
                Print Pass
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <PrintableExportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="Print & Download Section Class Lists & Student QR ID Cards"
        defaultPackType="CLASS_LIST"
        allowedPackTypes={['CLASS_LIST', 'QR_ID_CARDS']}
        initialScope={
          selectedStudentIds.length > 0 || selectedSectionFilter !== 'ALL' ? 'SELECTED' : 'ALL'
        }
        preselectedStudentIds={selectedStudentIds}
        preselectedSectionIds={
          selectedStudentIds.length === 0 && selectedSectionFilter !== 'ALL'
            ? [Number(selectedSectionFilter)]
            : []
        }
        sectionOptions={sectionOptions}
        isSchoolLeader={isExecutive}
      />
    </div>
  );
};

export default StudentsTab;