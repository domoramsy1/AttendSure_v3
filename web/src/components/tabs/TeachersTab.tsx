/**
 * AttendSure - Teachers & Staff Directory and 1-to-1 Phone Binding Manager
 * File: web/src/components/tabs/TeachersTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { isSafeImageUrl, sanitizeText, QR_COLORS } from '../../theme/tokens';
import { AttendSureBrandBadge } from '../branding/BrandAssets';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { StatsCard } from '../common/StatsCard';
import { AvatarUploadField } from '../common/AvatarUploadField';
import {
  STAFF_DEPARTMENTS_LIST,
  STAFF_SUFFIX_OPTIONS,
} from '../common/staffConstants';
import {
  StaffContactField,
  StaffDepartmentPositionFields,
  StaffNameFields,
  StaffTeachingToggle,
} from '../common/StaffFormFields';
import { Pagination, ALL_ROWS_SIZE, exportToCsv } from '../common/Pagination';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { PrintableExportModal, type SelectableOption } from '../modals/PrintableExportModal';
import { useCopyFeedback } from '../../utils/clipboard';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import {
  canManageTeachers as canManageTeachersPerm,
  canResetBoundDevice,
  getCurrentUserFromStorage,
} from '../../utils/permissions';
import {
  Users,
  Plus,
  QrCode,
  Pencil,
  Trash2,
  Copy,
  Check,
  Loader2,
  Download,
  Search,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Building2,
  RotateCcw,
  AlertCircle,
  BookOpen,
  Printer,
} from 'lucide-react';

export interface Teacher {
  id: number;
  user?: number;
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
  can_handle_classes?: boolean;
  can_teach?: boolean;
  bound_device_id?: string | null;
  device_model?: string | null;
  device_bound_at?: string | null;
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

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'BOUND' | 'UNBOUND';

interface TeacherFormState {
  employee_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  position: string;
  department: string;
  contact_number: string;
  email: string;
  can_handle_classes: boolean;
  is_active: boolean;
  photo: string | null;
}

const TEACHERS_ENDPOINT = API_ROUTES.accounts.teachers;
const TEACHERS_DROPDOWN_ENDPOINT = API_ROUTES.accounts.teachersDropdown;
const CACHE_STORAGE_KEY = 'attendsure_teachers_directory_cache';

const DEFAULT_POSITION_GROUPS = [
  {
    category: 'Classroom Teachers',
    ranks: [
      'Teacher I',
      'Teacher II',
      'Teacher III',
      'Special Science Teacher I',
      'Master Teacher I',
      'Master Teacher II',
      'Master Teacher III',
      'Master Teacher IV',
    ],
  },
  {
    category: 'Department Heads',
    ranks: [
      'Head Teacher I',
      'Head Teacher II',
      'Head Teacher III',
      'Head Teacher IV',
      'Head Teacher V',
      'Head Teacher VI',
    ],
  },
  {
    category: 'School Leadership',
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
    category: 'Academic & Office Support',
    ranks: [
      'Administrative Officer II',
      'Administrative Assistant',
      'School Registrar',
      'Guidance Counselor I',
      'ICT Systems Coordinator',
    ],
  },
];

const DEFAULT_DEPARTMENTS = STAFF_DEPARTMENTS_LIST;

const INITIAL_FORM_DATA: TeacherFormState = {
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  position: 'Teacher I',
  department: 'Junior High School',
  contact_number: '',
  email: '',
  can_handle_classes: true,
  is_active: true,
  photo: null,
};

const cleanInput = (raw: string, maxLength = 120): string => {
  const stripped = String(raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '');
  return sanitizeText(stripped, maxLength);
};

const getSafeAvatarUrl = (teacher: Pick<Teacher, 'photo_url' | 'photo'>): string | null => {
  const candidate = teacher.photo_url || teacher.photo || null;
  return isSafeImageUrl(candidate) ? candidate : null;
};

const getInitials = (name: string): string => {
  const words = cleanInput(name, 80)
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || 'T').slice(0, 2).toUpperCase();
};

const getUserScopedCacheKey = (): string => {
  const scope = localStorage.getItem('attendsure_user_id') || localStorage.getItem('attendsure_username') || 'default';
  return `${CACHE_STORAGE_KEY}_${scope}`;
};

const readCachedTeacherList = (): { items: Teacher[]; count: number } | null => {
  try {
    const raw = localStorage.getItem(getUserScopedCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: Teacher[]; count?: number };
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      count: typeof parsed.count === 'number' ? parsed.count : parsed.items.length,
    };
  } catch {
    return null;
  }
};

const writeCachedTeacherList = (items: Teacher[], count: number): void => {
  try {
    const compact = items.slice(0, 100).map((item) => ({
      ...item,
      photo: item.photo && item.photo.length > 500 ? null : item.photo,
    }));
    localStorage.setItem(
      getUserScopedCacheKey(),
      JSON.stringify({ items: compact, count, savedAt: Date.now() })
    );
  } catch {
    // Ignore storage quota restrictions
  }
};

export const TeachersTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const { mode, tokens, brand, fonts, radius, ui } = useTheme();
  const { school, refreshSchool } = useSchool();

  const currentUser = useMemo(() => getCurrentUserFromStorage(), []);
  const canManageTeachers = canManageTeachersPerm(currentUser);
  const canResetPhoneLock = canResetBoundDevice(currentUser);

  const initialCache = useMemo(() => {
    const apiHit = peekApiCache<PaginatedResponse<Teacher> | Teacher[]>(TEACHERS_ENDPOINT, {
      page: 1,
      page_size: 25,
    });
    if (apiHit) {
      if ('results' in apiHit && Array.isArray(apiHit.results)) {
        return { items: apiHit.results, count: apiHit.count };
      }
      if (Array.isArray(apiHit)) {
        return { items: apiHit, count: apiHit.length };
      }
    }
    return readCachedTeacherList();
  }, []);

  const [teacherList, setTeacherList] = useState<Teacher[]>(() => initialCache?.items || []);
  const [directoryDepartments, setDirectoryDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !initialCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const [search, setSearch] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(() => initialCache?.count || 0);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [inspectingTeacher, setInspectingTeacher] = useState<Teacher | null>(null);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<number[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  const teacherOptions = useMemo<SelectableOption[]>(
    () =>
      teacherList.map((t) => ({
        id: t.id,
        label: `${t.full_name || `${t.first_name} ${t.last_name}`} (${t.employee_id})`,
      })),
    [teacherList]
  );

  const toggleTeacherSelection = (teacherId: number) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(teacherId) ? prev.filter((id) => id !== teacherId) : [...prev, teacherId]
    );
  };
  const [saving, setSaving] = useState<boolean>(false);
  const [resettingDeviceId, setResettingDeviceId] = useState<number | null>(null);
  const [formData, setFormData] = useState<TeacherFormState>(INITIAL_FORM_DATA);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { copiedKey, copy } = useCopyFeedback();

  const mountedRef = useRef<boolean>(true);
  const activeAbortRef = useRef<AbortController | null>(null);
  const prevSearchRef = useRef<string>(search);
  const hasLoadedItemsRef = useRef<boolean>((initialCache?.items.length || 0) > 0);
  const isInteractingRef = useRef<boolean>(false);
  isInteractingRef.current = isModalOpen || Boolean(inspectingTeacher) || isPrintModalOpen;

  const handleCopy = useCallback(
    async (text: string, key: string) => {
      const cleanValue = cleanInput(text, 120);
      if (!cleanValue) return;
      await copy(cleanValue, key);
    },
    [copy]
  );

  const loadTeacherList = useCallback(
    async (
      page = 1,
      size = 25,
      query = '',
      deptVal = '',
      silent = false,
      bypassCache = false
    ) => {
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;

      const cleanQuery = cleanInput(query, 80);
      const cleanDept = cleanInput(deptVal, 100);
      const isAll = size >= ALL_ROWS_SIZE;

      try {
        if (!silent) {
          if (!hasLoadedItemsRef.current) setLoading(true);
          setRefreshing(true);
        }
        setErrorMessage(null);

        const [listOutcome, dropdownOutcome] = await Promise.allSettled([
          apiClient.get<PaginatedResponse<Teacher> | Teacher[]>(TEACHERS_ENDPOINT, {
            params: {
              page: isAll ? 1 : page,
              page_size: isAll ? 'ALL' : size,
              search: cleanQuery || undefined,
              department: cleanDept || undefined,
              ...(bypassCache ? { nocache: 1 } : {}),
            },
            signal: controller.signal,
          }),
          apiClient.get<Teacher[]>(TEACHERS_DROPDOWN_ENDPOINT, {
            params: { include_all: 1 },
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        if (listOutcome.status === 'fulfilled') {
          const payload = listOutcome.value.data;
          if (payload && !Array.isArray(payload) && Array.isArray(payload.results)) {
            setTeacherList(payload.results);
            hasLoadedItemsRef.current = payload.results.length > 0;
            setTotalCount(payload.count);
            setTotalPages(isAll ? 1 : payload.total_pages || Math.ceil(payload.count / size) || 1);
            setCurrentPage(isAll ? 1 : payload.current_page || page);
            if (!cleanQuery && !cleanDept && page === 1) {
              writeCachedTeacherList(payload.results, payload.count);
            }
          } else if (Array.isArray(payload)) {
            setTeacherList(payload);
            hasLoadedItemsRef.current = payload.length > 0;
            setTotalCount(payload.length);
            setTotalPages(1);
            setCurrentPage(1);
            if (!cleanQuery && !cleanDept) {
              writeCachedTeacherList(payload, payload.length);
            }
          }
          setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        } else {
          const reason = listOutcome.reason as { name?: string; code?: string };
          if (reason?.name === 'CanceledError' || reason?.name === 'AbortError' || reason?.code === 'ERR_CANCELED') {
            return;
          }
          if (!silent) {
            setErrorMessage(
              extractApiError(
                listOutcome.reason,
                'Could not load the teacher directory right now. Please check your connection and try again.'
              )
            );
          }
        }

        if (dropdownOutcome.status === 'fulfilled' && Array.isArray(dropdownOutcome.value.data)) {
          const foundDepts = Array.from(
            new Set(
              dropdownOutcome.value.data
                .map((item) => cleanInput(item.department || '', 100))
                .filter(Boolean)
            )
          ).sort((a, b) => a.localeCompare(b));
          setDirectoryDepartments(foundDepts);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeAbortRef.current?.abort();
    };
  }, []);

  const cleanEmpCheck = cleanInput(formData.employee_id, 50);
  const empAvail = useFieldAvailability({
    enabled: isModalOpen,
    field: 'employee_id',
    value: cleanEmpCheck,
    minLength: 2,
    fallbackMessage: 'This Employee ID is already assigned.',
    excludeId: editingTeacher?.id,
    excludeTeacherId: editingTeacher?.id,
  });

  const cleanEmailCheck = cleanInput(formData.email, 150).toLowerCase();
  const emailFormatErr =
    cleanEmailCheck && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmailCheck)
      ? 'Please enter a valid email address.'
      : '';
  const emailAvail = useFieldAvailability({
    enabled: isModalOpen && Boolean(cleanEmailCheck),
    field: 'email',
    value: cleanEmailCheck,
    formatError: emailFormatErr,
    fallbackMessage: 'This email address is already in use.',
    excludeTeacherId: editingTeacher?.id,
    excludeUserId: editingTeacher?.user,
  });

  const cleanPhoneCheck = cleanInput(formData.contact_number, 30);
  const phoneAvail = useFieldAvailability({
    enabled: isModalOpen && cleanPhoneCheck.replace(/\D/g, '').length >= 10,
    field: 'contact_number',
    value: cleanPhoneCheck,
    minLength: 10,
    fallbackMessage: 'This mobile number is already assigned to another staff account.',
    excludeId: editingTeacher?.id,
    excludeTeacherId: editingTeacher?.id,
  });

  const liveErrors = {
    employee_id: empAvail.error || undefined,
    email: emailAvail.error || undefined,
    contact_number: phoneAvail.error || undefined,
  };
  const fieldVerified = {
    employee_id: empAvail.verified,
    email: emailAvail.verified,
    contact_number: phoneAvail.verified,
  };
  const checkingCount =
    (empAvail.checking ? 1 : 0) + (emailAvail.checking ? 1 : 0) + (phoneAvail.checking ? 1 : 0);
  const hasLiveErrors = Boolean(liveErrors.employee_id || liveErrors.email || liveErrors.contact_number);

  useEffect(() => {
    const searchChanged = prevSearchRef.current !== search;
    prevSearchRef.current = search;
    const delay = searchChanged ? 280 : 0;
    const timer = setTimeout(() => {
      setCurrentPage(1);
      void loadTeacherList(1, pageSize, search, departmentFilter, false, false);
    }, delay);
    return () => clearTimeout(timer);
  }, [search, departmentFilter, pageSize, loadTeacherList]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && !isInteractingRef.current) {
        void loadTeacherList(currentPage, pageSize, search, departmentFilter, true, true);
      }
    }, 15000);
    return () => clearInterval(intervalId);
  }, [currentPage, pageSize, search, departmentFilter, loadTeacherList]);

  const departmentOptions = useMemo(() => {
    const combined = new Set<string>(DEFAULT_DEPARTMENTS);
    directoryDepartments.forEach((d) => combined.add(d));
    teacherList.forEach((t) => {
      if (t.department?.trim()) combined.add(t.department.trim());
    });
    if (formData.department.trim()) combined.add(formData.department.trim());
    return Array.from(combined).sort((a, b) => a.localeCompare(b));
  }, [directoryDepartments, teacherList, formData.department]);

  const positionGroups = useMemo(() => {
    const knownRanks = new Set(DEFAULT_POSITION_GROUPS.flatMap((g) => g.ranks));
    const currentPos = formData.position.trim();
    if (!currentPos || knownRanks.has(currentPos)) {
      return DEFAULT_POSITION_GROUPS;
    }
    return [{ category: 'Current Assignment', ranks: [currentPos] }, ...DEFAULT_POSITION_GROUPS];
  }, [formData.position]);

  const displayedTeachers = useMemo(() => {
    return teacherList.filter((item) => {
      if (statusFilter === 'ACTIVE') return item.is_active;
      if (statusFilter === 'INACTIVE') return !item.is_active;
      if (statusFilter === 'BOUND') return Boolean(item.bound_device_id);
      if (statusFilter === 'UNBOUND') return !item.bound_device_id;
      return true;
    });
  }, [teacherList, statusFilter]);

  const activeTeachersCount = useMemo(
    () => teacherList.filter((t) => t.is_active).length,
    [teacherList]
  );

  const boundPhonesCount = useMemo(
    () => teacherList.filter((t) => Boolean(t.bound_device_id && t.bound_device_id.trim())).length,
    [teacherList]
  );

  const uniqueDepartmentCount = useMemo(() => {
    const source = directoryDepartments.length > 0 ? directoryDepartments : teacherList.map((t) => t.department);
    return new Set(source.filter(Boolean)).size;
  }, [directoryDepartments, teacherList]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setCurrentPage(nextPage);
    void loadTeacherList(nextPage, pageSize, search, departmentFilter, false, false);
  };

  const handlePageSizeChange = (nextSize: number) => {
    if (nextSize === pageSize) return;
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleManualRefresh = () => {
    void refreshSchool();
    void loadTeacherList(currentPage, pageSize, search, departmentFilter, false, true);
  };

  const handleExportCsv = () => {
    const suffix = pageSize >= ALL_ROWS_SIZE ? 'All' : `Page${currentPage}_${pageSize}rows`;
    const exported = exportToCsv(
      `AttendSure_Teachers_${suffix}.csv`,
      [
        'Employee ID',
        'Full Name',
        'Position',
        'Department',
        'Handles Classes',
        'Email',
        'Phone Number',
        'Linked Mobile Device',
        'Status',
      ],
      displayedTeachers.map((t) => [
        t.employee_id,
        t.full_name,
        t.position,
        t.department,
        t.can_handle_classes ?? t.can_teach ? 'YES' : 'NO',
        t.email || '',
        t.contact_number || '',
        t.bound_device_id ? t.device_model || 'Linked Phone' : 'Not Linked',
        t.is_active ? 'ACTIVE' : 'INACTIVE',
      ])
    );

    if (exported) {
      showAlert({
        title: 'CSV Downloaded',
        message: `Saved ${displayedTeachers.length} teacher records to a CSV file.`,
        type: 'success',
      });
    } else {
      showAlert({
        title: 'Nothing to Export',
        message: 'There are no teacher records matching your current filters.',
        type: 'info',
      });
    }
  };

  const handleOpenCreate = () => {
    setEditingTeacher(null);
    setFormData(INITIAL_FORM_DATA);
    setPhotoPreview(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      employee_id: teacher.employee_id || '',
      first_name: teacher.first_name || '',
      middle_name: teacher.middle_name || '',
      last_name: teacher.last_name || '',
      suffix: teacher.suffix || '',
      position: teacher.position || 'Teacher I',
      department: teacher.department || 'Junior High School',
      contact_number: teacher.contact_number || '',
      email: teacher.email || '',
      can_handle_classes: teacher.can_handle_classes ?? teacher.can_teach ?? true,
      is_active: teacher.is_active ?? true,
      photo: null,
    });
    setPhotoPreview(getSafeAvatarUrl(teacher));
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (hasLiveErrors) {
      showAlert({
        title: 'Duplicate Information Found',
        message:
          liveErrors.employee_id ||
          liveErrors.email ||
          liveErrors.contact_number ||
          'Please fix the highlighted fields before saving.',
        type: 'warning',
      });
      return;
    }

    const cleanEmployeeId = cleanInput(formData.employee_id, 50).toUpperCase();
    const cleanFirstName = cleanInput(formData.first_name, 100);
    const cleanMiddleName = cleanInput(formData.middle_name, 100);
    const cleanLastName = cleanInput(formData.last_name, 100);
    const cleanSuffix = (STAFF_SUFFIX_OPTIONS as readonly string[]).includes(formData.suffix)
      ? formData.suffix
      : '';
    const cleanEmail = cleanInput(formData.email, 150).toLowerCase();
    const cleanPhone = cleanInput(formData.contact_number, 30)
      .replace(/[^\d+\-()\s]/g, '')
      .replace(/[\s()-]/g, '');

    if (!cleanEmployeeId || !cleanFirstName || !cleanLastName) {
      showAlert({
        title: 'Missing Information',
        message: 'Please enter the Employee ID, First Name, and Last Name.',
        type: 'warning',
      });
      return;
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      showAlert({
        title: 'Invalid Email Address',
        message: 'Please enter a valid email address or leave the email box blank.',
        type: 'warning',
      });
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      employee_id: cleanEmployeeId,
      first_name: cleanFirstName,
      middle_name: cleanMiddleName,
      last_name: cleanLastName,
      suffix: cleanSuffix,
      position: cleanInput(formData.position, 100),
      department: cleanInput(formData.department, 100),
      email: cleanEmail,
      contact_number: cleanPhone,
      can_handle_classes: Boolean(formData.can_handle_classes),
      is_active: Boolean(formData.is_active),
    };

    if (formData.photo !== null) {
      if (formData.photo === '') {
        payload.photo = null;
        payload.remove_photo = true;
      } else {
        payload.photo = formData.photo;
      }
    }

    try {
      if (editingTeacher) {
        const res = await apiClient.put<Teacher>(`${TEACHERS_ENDPOINT}${editingTeacher.id}/`, payload);
        setTeacherList((prev) => prev.map((t) => (t.id === editingTeacher.id ? res.data : t)));
        showAlert({
          title: 'Profile Saved',
          message: `Updated details for ${cleanFirstName} ${cleanLastName}.`,
          type: 'success',
        });
      } else {
        const res = await apiClient.post<Teacher>(TEACHERS_ENDPOINT, payload);
        setTeacherList((prev) => [res.data, ...prev]);
        showAlert({
          title: 'Teacher Added',
          message: `${cleanFirstName} ${cleanLastName} has been added to the directory.`,
          type: 'success',
        });
      }
      setIsModalOpen(false);
      void loadTeacherList(currentPage, pageSize, search, departmentFilter, true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Could Not Save',
        message: extractApiError(err, 'Unable to save this teacher record. Please check the details and try again.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDeviceBinding = (teacher: Teacher) => {
    showConfirm({
      title: 'Reset Phone Lock',
      message: `Unlink the current mobile phone and biometric key lock for ${teacher.full_name}? Their next Phone Fingerprint / Biometric & Campus GPS Time In will automatically pair their new phone.`,
      confirmLabel: 'Reset Phone Lock',
      isDestructive: false,
      onConfirm: async () => {
        setResettingDeviceId(teacher.id);
        try {
          const res = await apiClient.post<{ message?: string }>(
            `${TEACHERS_ENDPOINT}${teacher.id}/reset-device/`,
            { teacher_id: teacher.id }
          );
          setTeacherList((prev) =>
            prev.map((item) =>
              item.id === teacher.id
                ? { ...item, bound_device_id: null, device_model: null, device_bound_at: null }
                : item
            )
          );
          if (inspectingTeacher?.id === teacher.id) {
            setInspectingTeacher((prev) =>
              prev ? { ...prev, bound_device_id: null, device_model: null, device_bound_at: null } : null
            );
          }
          showAlert({
            title: 'Phone Lock Cleared',
            message: res.data?.message || `Cleared the bound phone for ${teacher.full_name}.`,
            type: 'success',
          });
        } catch (err: unknown) {
          showAlert({
            title: 'Reset Failed',
            message: extractApiError(err, 'Could not reset the phone lock for this teacher.'),
            type: 'error',
          });
        } finally {
          setResettingDeviceId(null);
        }
      },
    });
  };

  const promptDelete = (teacher: Teacher) => {
    showConfirm({
      title: 'Remove Teacher',
      message: `Permanently remove ${teacher.full_name || teacher.first_name} (${teacher.employee_id}) from the AttendSure teacher directory?`,
      confirmLabel: 'Remove Teacher',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`${TEACHERS_ENDPOINT}${teacher.id}/`);
          setTeacherList((prev) => prev.filter((t) => t.id !== teacher.id));
          if (inspectingTeacher?.id === teacher.id) setInspectingTeacher(null);
          showAlert({
            title: 'Teacher Removed',
            message: `Removed ${teacher.full_name || teacher.first_name} from the directory.`,
            type: 'info',
          });
          void loadTeacherList(currentPage, pageSize, search, departmentFilter, true, true);
        } catch (err: unknown) {
          showAlert({
            title: 'Could Not Remove',
            message: extractApiError(err, 'Unable to remove this teacher record right now.'),
            type: 'error',
          });
        }
      },
    });
  };

  const styles = useMemo(
    () => ({
      page: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 16,
        padding: 'clamp(12px, 2.2vw, 20px)',
        maxWidth: 1400,
        margin: '0 auto',
        fontFamily: fonts.sans,
      },
      headerCard: {
        ...ui.card,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap' as const,
        gap: 12,
      },
      statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 205px), 1fr))',
        gap: 12,
      },
      controlsBar: {
        ...ui.card,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
      },
      controlsTopRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        gap: 10,
      },
      searchWrap: {
        position: 'relative' as const,
        flex: '1 1 220px',
        maxWidth: 320,
      },
      searchInput: {
        ...ui.input,
        paddingLeft: 34,
        backgroundColor: tokens.bgSurfaceSubtle,
      },
      deptSelect: {
        ...ui.input,
        width: 'auto',
        minWidth: 210,
        backgroundColor: tokens.bgSurfaceSubtle,
        cursor: 'pointer',
      },
      filterPillsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap' as const,
      },
      tableCard: {
        ...ui.card,
        padding: 0,
        overflow: 'hidden',
      },
      actionBtn: {
        width: 30,
        height: 30,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderStyle: 'solid' as const,
        borderColor: tokens.borderSubtle,
        backgroundColor: tokens.bgSurfaceSubtle,
        color: tokens.textSecondary,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      },
      modalBodySurface: {
        backgroundColor: tokens.bgSurface,
        color: tokens.textPrimary,
        margin: -20,
        padding: 20,
        fontFamily: fonts.sans,
      },
      formGrid2: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10,
      },
      nameGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
        gap: 10,
      },
    }),
    [tokens, fonts, radius, ui]
  );

  const filterPillOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: `All (${teacherList.length})` },
    { key: 'ACTIVE', label: `Active (${activeTeachersCount})` },
    { key: 'INACTIVE', label: `Inactive (${Math.max(0, teacherList.length - activeTeachersCount)})` },
    { key: 'BOUND', label: `Phone Linked (${boundPhonesCount})` },
    { key: 'UNBOUND', label: `Unlinked (${Math.max(0, teacherList.length - boundPhonesCount)})` },
  ];

  const activeSchoolName = school.school_name?.trim() || 'AttendSure School Campus';
  const inspectingQrValue = inspectingTeacher
    ? `ATTENDSURE:TEACHER:${inspectingTeacher.employee_id}`
    : '';

  return (
    <div style={styles.page}>
      <div style={styles.headerCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <AttendSureBrandBadge size={42} mode={mode} />
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: fonts.size.lg,
                fontWeight: fonts.weight.extrabold,
                color: tokens.textPrimary,
                fontFamily: fonts.display,
              }}
            >
              Teachers Directory
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: fonts.size.xs, color: tokens.textSecondary }}>
              Manage teacher profiles, class list assignments, and 1-to-1 mobile Time In / Out phone bindings.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {lastUpdated && (
            <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontFamily: fonts.mono }}>
              Synced {lastUpdated}
            </span>
          )}
          {selectedTeacherIds.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setSelectedTeacherIds([])}>
              {selectedTeacherIds.length} Selected &times; Clear
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleManualRefresh} loading={refreshing} icon={<RefreshCw size={13} />}>
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            icon={<Printer size={13} />}
          >
            {selectedTeacherIds.length > 0
              ? `Print / Export (${selectedTeacherIds.length})`
              : 'Print / Export Schedules & Directory'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv} icon={<Download size={13} />}>
            Export CSV
          </Button>
          {canManageTeachers && (
            <Button variant="primary" size="sm" onClick={handleOpenCreate} icon={<Plus size={14} />}>
              Add Teacher
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '10px 14px',
            borderRadius: radius.lg,
            backgroundColor: tokens.dangerLight,
            border: `1px solid ${brand.danger}`,
            color: brand.danger,
            fontSize: fonts.size.sm,
            fontWeight: fonts.weight.bold,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            {errorMessage}
          </span>
          <Button variant="secondary" size="sm" onClick={handleManualRefresh}>
            Try Again
          </Button>
        </div>
      )}

      <div style={styles.statsGrid}>
        <StatsCard
          label="Total Teachers"
          value={(totalCount || teacherList.length).toLocaleString()}
          helpText="Registered classroom & school teachers"
          badge={<Users size={17} color={brand.primary} />}
        />
        <StatsCard
          label="Active Teachers"
          value={activeTeachersCount.toLocaleString()}
          valueColor={brand.success}
          helpText="Cleared for daily mobile GPS Time In / Out"
          badge={<ShieldCheck size={17} color={brand.success} />}
        />
        <StatsCard
          label="Mobile Phones Linked"
          value={`${boundPhonesCount} / ${teacherList.length}`}
          valueColor={brand.primary}
          helpText="1-to-1 bound for Phone Fingerprint / Biometric & Campus GPS"
          badge={<Smartphone size={17} color={brand.primary} />}
        />
        <StatsCard
          label="Departments"
          value={uniqueDepartmentCount.toLocaleString()}
          valueColor={brand.secondary}
          helpText="Active school academic units"
          badge={<Building2 size={17} color={brand.secondary} />}
        />
      </div>

      <div style={styles.controlsBar}>
        <div style={styles.controlsTopRow}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
            <div style={styles.searchWrap}>
              <Search
                size={14}
                color={tokens.textMuted}
                style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
              <input
                type="text"
                aria-label="Search teachers"
                placeholder="Search by name, Employee ID, or role..."
                value={search}
                maxLength={80}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <select
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={styles.deptSelect}
            >
              <option value="">All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontWeight: fonts.weight.semibold }}>
            Showing {displayedTeachers.length} of {teacherList.length} loaded
          </span>
        </div>

        <div style={styles.filterPillsRow}>
          {filterPillOptions.map((pill) => {
            const active = statusFilter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setStatusFilter(pill.key)}
                style={{
                  padding: '5px 11px',
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: active ? brand.primary : tokens.borderStrong,
                  backgroundColor: active ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                  color: active ? brand.primary : tokens.textSecondary,
                  fontSize: fonts.size.xs,
                  fontWeight: fonts.weight.bold,
                  cursor: 'pointer',
                }}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.tableCard}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 38, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible teachers"
                    checked={
                      displayedTeachers.length > 0 &&
                      displayedTeachers.every((t) => selectedTeacherIds.includes(t.id))
                    }
                    onChange={(e) => {
                      const pageIds = displayedTeachers.map((t) => t.id);
                      if (e.target.checked) {
                        setSelectedTeacherIds((prev) => Array.from(new Set([...prev, ...pageIds])));
                      } else {
                        setSelectedTeacherIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ ...ui.th, width: 54 }}>Photo</th>
                <th style={ui.th}>Employee ID</th>
                <th style={ui.th}>Full Name</th>
                <th style={ui.th}>Position &amp; Department</th>
                <th style={ui.th}>Contact Details</th>
                <th style={ui.th}>Mobile Time In / Out Phone</th>
                <th style={ui.th}>Status</th>
                <th style={{ ...ui.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && teacherList.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 44, textAlign: 'center', color: tokens.textMuted }}>
                    <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 8px', display: 'block', color: brand.primary }} />
                    <span style={{ fontSize: fonts.size.sm, fontWeight: fonts.weight.semibold }}>Loading teacher directory...</span>
                  </td>
                </tr>
              ) : displayedTeachers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 44, textAlign: 'center', color: tokens.textMuted }}>
                    <Users size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }} />
                    <div style={{ fontSize: fonts.size.base, fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                      No teachers found
                    </div>
                    <div style={{ fontSize: fonts.size.xs, marginTop: 4 }}>
                      Try clearing your search or switching the department filter.
                    </div>
                  </td>
                </tr>
              ) : (
                displayedTeachers.map((teacher) => {
                  const avatarUrl = getSafeAvatarUrl(teacher);
                  const isPhoneLinked = Boolean(teacher.bound_device_id && teacher.bound_device_id.trim());
                  return (
                    <tr key={teacher.id}>
                      <td style={{ ...ui.td, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${teacher.full_name}`}
                          checked={selectedTeacherIds.includes(teacher.id)}
                          onChange={() => toggleTeacherSelection(teacher.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={ui.td}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: tokens.primaryLight,
                            color: brand.primary,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: `1px solid ${tokens.borderSubtle}`,
                            fontWeight: fonts.weight.extrabold,
                            fontSize: fonts.size.xs,
                            flexShrink: 0,
                          }}
                        >
                          {avatarUrl ? (
                            <img src={avatarUrl} alt={teacher.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            getInitials(teacher.full_name || teacher.first_name)
                          )}
                        </div>
                      </td>

                      <td style={ui.td}>
                        <button
                          type="button"
                          onClick={() => void handleCopy(teacher.employee_id, `emp-${teacher.id}`)}
                          title="Copy Employee ID"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: radius.sm,
                            border: `1px solid ${tokens.borderSubtle}`,
                            backgroundColor: tokens.bgSurfaceSubtle,
                            color: tokens.textPrimary,
                            fontFamily: fonts.mono,
                            fontSize: fonts.size.xs,
                            fontWeight: fonts.weight.bold,
                            cursor: 'pointer',
                          }}
                        >
                          {copiedKey === `emp-${teacher.id}` ? <Check size={11} color={brand.success} /> : <Copy size={11} color={tokens.textMuted} />}
                          <span>{teacher.employee_id}</span>
                        </button>
                      </td>

                      <td style={ui.td}>
                        <div style={{ fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>{teacher.full_name}</div>
                        {(teacher.can_handle_classes ?? teacher.can_teach) && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              marginTop: 3,
                              fontSize: '0.66rem',
                              fontWeight: fonts.weight.bold,
                              color: brand.secondary,
                            }}
                          >
                            <BookOpen size={10} /> Handles Class Lists
                          </span>
                        )}
                      </td>

                      <td style={ui.td}>
                        <div style={{ fontWeight: fonts.weight.semibold, color: tokens.textPrimary }}>{teacher.position || 'Teacher'}</div>
                        <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary, marginTop: 2 }}>
                          {teacher.department || 'Unassigned Department'}
                        </div>
                      </td>

                      <td style={ui.td}>
                        <div style={{ fontSize: fonts.size.sm, color: tokens.textPrimary }}>{teacher.email || '—'}</div>
                        <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 2 }}>{teacher.contact_number || '—'}</div>
                      </td>

                      <td style={ui.td}>
                        {isPhoneLinked ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={ui.badge(tokens.primaryLight, brand.primary)}>
                              <Smartphone size={11} />
                              {teacher.device_model || 'Phone Linked'}
                            </span>
                            {canResetPhoneLock && (
                              <button
                                type="button"
                                disabled={resettingDeviceId === teacher.id}
                                onClick={() => handleResetDeviceBinding(teacher)}
                                title="Unlink current phone so teacher can pair a replacement phone"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  padding: '3px 7px',
                                  borderRadius: radius.sm,
                                  border: `1px solid ${tokens.borderStrong}`,
                                  backgroundColor: tokens.bgSurfaceSubtle,
                                  color: tokens.textSecondary,
                                  fontSize: '0.66rem',
                                  fontWeight: fonts.weight.bold,
                                  cursor: 'pointer',
                                }}
                              >
                                <RotateCcw size={10} />
                                {resettingDeviceId === teacher.id ? 'Resetting...' : 'Reset Lock'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>Pairs on first mobile Time In</span>
                        )}
                      </td>

                      <td style={ui.td}>
                        <span style={ui.badge(teacher.is_active ? tokens.successLight : tokens.dangerLight, teacher.is_active ? brand.success : brand.danger)}>
                          {teacher.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      <td style={{ ...ui.td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setInspectingTeacher(teacher)}
                            style={styles.actionBtn}
                            title="View Digital Teacher Pass"
                            aria-label={`View digital pass for ${teacher.full_name}`}
                          >
                            <QrCode size={14} />
                          </button>

                          {canManageTeachers && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(teacher)}
                                style={styles.actionBtn}
                                title="Edit Teacher Profile"
                                aria-label={`Edit ${teacher.full_name}`}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => promptDelete(teacher)}
                                style={{ ...styles.actionBtn, color: brand.danger }}
                                title="Remove Teacher"
                                aria-label={`Remove ${teacher.full_name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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
          itemLabel="teachers"
          style={{
            backgroundColor: tokens.bgSurface,
            borderTop: `1px solid ${tokens.borderSubtle}`,
          }}
        />
      </div>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingTeacher ? `Edit Teacher: ${editingTeacher.full_name}` : 'Add New Teacher'}
          maxWidth="580px"
        >
          <div style={styles.modalBodySurface}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AvatarUploadField
                previewUrl={photoPreview}
                displayName={`${formData.first_name} ${formData.last_name}`.trim() || 'Teacher'}
                label="Directory Profile Photo"
                helpText="Optional JPG, PNG, or WebP (max 2 MB). Biometric verification stays strictly on the teacher's phone."
                size={56}
                disabled={saving}
                onSelectPhoto={(_file, dataUri) => {
                  setPhotoPreview(dataUri);
                  setFormData((prev) => ({ ...prev, photo: dataUri }));
                }}
                onRemovePhoto={() => {
                  setPhotoPreview(null);
                  setFormData((prev) => ({ ...prev, photo: '' }));
                }}
                onValidationError={(msg) => showAlert({ title: 'Invalid Image', message: msg, type: 'error' })}
              />

              <div style={styles.formGrid2}>
                <div>
                  <label htmlFor="teacher-emp-id" style={ui.label}>Employee ID *</label>
                  <input
                    id="teacher-emp-id"
                    type="text"
                    required
                    maxLength={50}
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })}
                    style={{
                      ...ui.input,
                      fontFamily: fonts.mono,
                      borderColor: liveErrors.employee_id
                        ? brand.danger
                        : fieldVerified.employee_id
                          ? brand.success
                          : tokens.borderStrong,
                    }}
                    placeholder="e.g. EMP-2026-014"
                  />
                  {liveErrors.employee_id && (
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', fontWeight: 700, color: brand.danger }}>
                      {liveErrors.employee_id}
                    </span>
                  )}
                </div>
                <div>
                  <label htmlFor="teacher-email" style={ui.label}>Email Address</label>
                  <input
                    id="teacher-email"
                    type="email"
                    maxLength={150}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{
                      ...ui.input,
                      borderColor: liveErrors.email
                        ? brand.danger
                        : fieldVerified.email
                          ? brand.success
                          : tokens.borderStrong,
                    }}
                    placeholder="name@school.edu"
                  />
                  {liveErrors.email && (
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', fontWeight: 700, color: brand.danger }}>
                      {liveErrors.email}
                    </span>
                  )}
                </div>
              </div>

              <StaffNameFields
                values={formData}
                onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
                idPrefix="teacher"
                gridStyle={styles.nameGrid}
              />

              <StaffDepartmentPositionFields
                department={formData.department}
                position={formData.position}
                onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
                departmentOptions={departmentOptions}
                positionGroups={positionGroups}
                order="position-first"
                idPrefix="teacher"
                gridStyle={styles.formGrid2}
              />

              <div style={styles.formGrid2}>
                <StaffContactField
                  id="teacher-contact"
                  value={formData.contact_number}
                  onChange={(val) => setFormData((prev) => ({ ...prev, contact_number: val }))}
                  error={liveErrors.contact_number}
                  verified={fieldVerified.contact_number}
                />
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
                  <StaffTeachingToggle
                    variant="inline"
                    checked={formData.can_handle_classes}
                    onChange={(checked) => setFormData((prev) => ({ ...prev, can_handle_classes: checked }))}
                  />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: fonts.size.sm, fontWeight: fonts.weight.semibold, color: tokens.textPrimary, cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} style={{ accentColor: brand.success }} />
                    Active teacher account
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${tokens.borderSubtle}` }}>
                <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" type="submit" loading={saving} disabled={saving || hasLiveErrors || checkingCount > 0}>
                  {editingTeacher ? 'Save Changes' : 'Add Teacher'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {inspectingTeacher && (
        <Modal
          isOpen={Boolean(inspectingTeacher)}
          onClose={() => setInspectingTeacher(null)}
          title="Digital Teacher ID Pass"
          maxWidth="420px"
        >
          <div style={styles.modalBodySurface}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: '100%', maxWidth: 310, backgroundColor: tokens.bgSurface, border: `2px solid ${brand.primary}`, borderRadius: radius.xl, overflow: 'hidden', boxShadow: tokens.cardShadow }}>
                <div style={{ backgroundColor: brand.buttonBg, color: tokens.onPrimary, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                  <AttendSureBrandBadge size={34} mode="light" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: fonts.size.sm, fontWeight: fonts.weight.extrabold, letterSpacing: '0.4px' }}>
                      ATTENDSURE TEACHER PASS
                    </div>
                    <div style={{ fontSize: fonts.size.xs, color: tokens.onPrimary, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {activeSchoolName}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px 14px' }}>
                  <div
                    style={{
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      margin: '0 auto 10px',
                      overflow: 'hidden',
                      border: `2px solid ${brand.primary}`,
                      backgroundColor: tokens.primaryLight,
                      color: brand.primary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: fonts.weight.extrabold,
                      fontSize: fonts.size.lg,
                    }}
                  >
                    {getSafeAvatarUrl(inspectingTeacher) ? (
                      <img src={getSafeAvatarUrl(inspectingTeacher)!} alt={inspectingTeacher.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getInitials(inspectingTeacher.full_name || inspectingTeacher.first_name)
                    )}
                  </div>

                  <div style={{ fontSize: fonts.size.md, fontWeight: fonts.weight.extrabold, color: tokens.textPrimary }}>
                    {inspectingTeacher.full_name}
                  </div>
                  <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>{inspectingTeacher.position}</div>
                  <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>{inspectingTeacher.department}</div>

                  {inspectingQrValue && (
                    <div style={{ margin: '12px auto', width: 120, height: 120, padding: 6, backgroundColor: QR_COLORS.background, borderRadius: radius.md, border: `1px solid ${tokens.borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <QrCodeSvg value={inspectingQrValue} size={108} label={`Teacher verification QR code for ${inspectingTeacher.full_name}`} style={{ width: '100%', height: '100%' }} />
                    </div>
                  )}

                  <div style={{ fontSize: fonts.size.sm, fontFamily: fonts.mono, fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                    ID: {inspectingTeacher.employee_id}
                  </div>
                </div>

                <div style={{ backgroundColor: tokens.bgSurfaceSubtle, padding: '10px 12px', borderTop: `1px solid ${tokens.borderSubtle}`, fontSize: fonts.size.xs, color: tokens.textSecondary, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                    Mobile Time In / Out: {inspectingTeacher.bound_device_id ? inspectingTeacher.device_model || 'Linked Phone Active' : 'Pairs on first mobile Time In'}
                  </div>
                  <div style={{ color: tokens.textMuted }}>
                    Phone Fingerprint / Biometric &amp; Campus GPS only. Zero biometric data ever leaves the teacher&apos;s phone.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {canResetPhoneLock && inspectingTeacher.bound_device_id && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => handleResetDeviceBinding(inspectingTeacher)}
                    loading={resettingDeviceId === inspectingTeacher.id}
                    icon={<RotateCcw size={14} />}
                  >
                    Reset Phone Lock
                  </Button>
                )}
                <Button variant="primary" size="md" onClick={() => setInspectingTeacher(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      <PrintableExportModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="Print & Download Teacher Directory, Schedules & Packets"
        defaultPackType="TEACHER_DIRECTORY"
        allowedPackTypes={['TEACHER_DIRECTORY', 'CLASS_SCHEDULE', 'COMPLETE_TEACHER_PACKET']}
        initialScope={selectedTeacherIds.length > 0 ? 'SELECTED' : 'ALL'}
        preselectedTeacherIds={selectedTeacherIds}
        teacherOptions={teacherOptions}
        isSchoolLeader={true}
      />
    </div>
  );
};

export default TeachersTab;
