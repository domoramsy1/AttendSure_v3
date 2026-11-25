// AttendSure Web - Students Tab
// File: D:\AttendSure_V3\web\src\components\tabs\StudentsTab.tsx

/**
 * AttendSure - Students Directory, DepEd SF1 Enrollment & Bulk CSV Class List Import
 * Modularized with StudentsFilterBar, StudentCsvImportModal, StudentFormModal, and StudentQrBadgeModal.
 * File: web/src/components/tabs/StudentsTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { StatusBadge } from '../common/StatusBadge';
import { Pagination, exportToCsv, ALL_ROWS_SIZE } from '../common/Pagination';
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
import { StudentsFilterBar } from './students/StudentsFilterBar';
import { StudentCsvImportModal } from './students/StudentCsvImportModal';
import { StudentFormModal } from './students/StudentFormModal';
import { StudentQrBadgeModal } from './students/StudentQrBadgeModal';
import {
  maskQrToken,
  type CsvImportSummary,
  type GradeLevelItem,
  type MetricsData,
  type ModalFormTab,
  type SectionItem,
  type StudentFormData,
  type StudentRecord,
} from './students/types';
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
  AlertCircle,
  BookOpen,
  GraduationCap,
} from 'lucide-react';

const sanitizeInput = (raw: string, maxLength = 150): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

const EMPTY_STUDENT_FORM: StudentFormData = {
  lrn: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  sex: 'Male',
  birthdate: '',
  grade_level_id: '',
  section_id: '',
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

  const [students, setStudents] = useState<StudentRecord[]>(() => {
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
  const [badgeStudent, setBadgeStudent] = useState<StudentRecord | null>(null);
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
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);
  const [formData, setFormData] = useState<StudentFormData>(EMPTY_STUDENT_FORM);

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

  useEffect(() => () => metricsAbortRef.current?.abort(), []);

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
    } catch {}
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
        const res = await apiClient.get(API_ROUTES.students.list, { params, signal: controller.signal });
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
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') return;
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
    return () => abortRef.current?.abort();
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
    (st: StudentRecord) =>
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
      if (importDefaultSectionId) payload.append('section_id', importDefaultSectionId);
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
      const list: StudentRecord[] = Array.isArray(res.data) ? res.data : res.data?.results || [];
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
      ...EMPTY_STUDENT_FORM,
      grade_level_id: defaultGl ? String(defaultGl) : gradeLevels[0] ? String(gradeLevels[0].id) : '',
      section_id: defaultAdvisedSec ? String(defaultAdvisedSec.id) : '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (st: StudentRecord) => {
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
      birthdate: st.birthdate || '',
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
    if (lrnCheck.checking) {
      setFormError('Please wait while we finish checking this LRN.');
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

    const rawBirthdate = formData.birthdate.trim();
    if (!rawBirthdate) {
      setFormError('Birthdate is required. Please pick the student’s date of birth.');
      setFormTab('BASIC');
      return;
    }
    const birthMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawBirthdate);
    if (!birthMatch) {
      setFormError('Please enter a valid birthdate (YYYY-MM-DD).');
      setFormTab('BASIC');
      return;
    }
    const bYear = Number(birthMatch[1]);
    const bMonth = Number(birthMatch[2]);
    const bDay = Number(birthMatch[3]);
    const parsedBirth = new Date(bYear, bMonth - 1, bDay);
    const todayLocal = new Date();
    const todayMidnight = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate());
    if (
      parsedBirth.getFullYear() !== bYear ||
      parsedBirth.getMonth() !== bMonth - 1 ||
      parsedBirth.getDate() !== bDay ||
      bYear < 1950 ||
      parsedBirth >= todayMidnight
    ) {
      setFormError('Birthdate must be a valid date in the past.');
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

  const handleDelete = (st: StudentRecord) => {
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

      <StudentsFilterBar
        sections={sections}
        selectedSectionFilter={selectedSectionFilter}
        onSectionFilterChange={(val) => {
          setSelectedSectionFilter(val);
          setCurrentPage(1);
        }}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedStudentCount={selectedStudentIds.length}
        onClearSelection={() => setSelectedStudentIds([])}
        totalCount={totalCount}
        isExporting={isExporting}
        canBulkImport={canBulkImport}
        canAddStudent={canAddStudent}
        onOpenPrintModal={() => setIsPrintModalOpen(true)}
        onExportCsv={() => void handleExportCsv()}
        onOpenCsvImport={handleOpenCsvImport}
        onOpenCreate={handleOpenCreate}
      />

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
                      checked={students.length > 0 && students.every((row) => selectedStudentIds.includes(row.id))}
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
                            onClick={() => void handleCopy(row.lrn)}
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
                          <Phone size={13} color={tokens.textMuted} /> {row.guardian_contact || '—'}
                        </span>
                      </td>

                      <td style={ui.td}>
                        <StatusBadge status={row.enrollment_status || (row.is_active ? 'ENROLLED' : 'INACTIVE')} />
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

      <StudentCsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        sections={sections}
        csvFile={csvFile}
        importDefaultSectionId={importDefaultSectionId}
        autoCreateSections={autoCreateSections}
        importingCsv={importingCsv}
        importSummary={importSummary}
        importError={importError}
        onSelectFile={(file) => {
          setCsvFile(file);
          setImportSummary(null);
          setImportError(null);
        }}
        onChangeDefaultSection={setImportDefaultSectionId}
        onChangeAutoCreate={setAutoCreateSections}
        onDownloadTemplate={handleDownloadCsvTemplate}
        onSubmit={handleRunCsvImport}
      />

      <StudentFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingStudent={editingStudent}
        formTab={formTab}
        onChangeTab={setFormTab}
        formData={formData}
        onChangeFormData={setFormData}
        formError={formError}
        onSetFormError={setFormError}
        onMarkPhotoRemoved={setPhotoRemoved}
        saving={saving}
        lrnCheck={lrnCheck}
        gradeLevels={gradeLevels}
        modalAvailableSections={modalAvailableSections}
        selectedModalSection={selectedModalSection}
        onSubmit={handleSubmit}
      />

      <StudentQrBadgeModal
        student={badgeStudent}
        schoolName={activeSchoolName}
        onClose={() => setBadgeStudent(null)}
      />

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
