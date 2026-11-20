/**
 * AttendSure - Faculty Directory & Mobile Device Binding Manager
 * File: web/src/components/tabs/FacultyTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { isSafeImageUrl, sanitizeText } from '../../theme/tokens';
import { AttendSureBrandBadge } from '../branding/BrandAssets';
import { QrCodeSvg } from '../common/QrCodeSvg';
import { StatsCard } from '../common/StatsCard';
import { Pagination, ALL_ROWS_SIZE, exportToCsv } from '../common/Pagination';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  User,
  Users,
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
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Building2,
  RotateCcw,
  AlertCircle,
  BookOpen,
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

interface FacultyFormState {
  employee_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  position: string;
  department: string;
  contact_number: string;
  email: string;
  can_teach: boolean;
  is_active: boolean;
  photo: string | null;
}

const FACULTY_ENDPOINT = API_ROUTES.accounts.faculty;
const FACULTY_DROPDOWN_ENDPOINT = API_ROUTES.accounts.facultyDropdown;
const CACHE_STORAGE_KEY = 'attendsure_faculty_directory_cache';

const DEFAULT_POSITION_GROUPS = [
  {
    category: 'Classroom Faculty',
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
    ],
  },
];

const DEFAULT_DEPARTMENTS = [
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

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV'];

const INITIAL_FORM_DATA: FacultyFormState = {
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  position: 'Faculty I',
  department: 'Junior High School',
  contact_number: '',
  email: '',
  can_teach: true,
  is_active: true,
  photo: null,
};

const LEADERSHIP_ROLES = new Set(['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL', 'DEPT_HEAD']);
const DEVICE_RESET_ROLES = new Set(['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL']);

const cleanInput = (raw: string, maxLength = 120): string => {
  const stripped = String(raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '');
  return sanitizeText(stripped, maxLength);
};

const getSafeAvatarUrl = (faculty: Pick<Faculty, 'photo_url' | 'photo'>): string | null => {
  const candidate = faculty.photo_url || faculty.photo || null;
  return isSafeImageUrl(candidate) ? candidate : null;
};

const getInitials = (name: string): string => {
  const words = cleanInput(name, 80)
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || 'F').slice(0, 2).toUpperCase();
};

const getUserScopedCacheKey = (): string => {
  const scope = localStorage.getItem('attendsure_user_id') || localStorage.getItem('attendsure_username') || 'default';
  return `${CACHE_STORAGE_KEY}_${scope}`;
};

const readCachedFacultyList = (): { items: Faculty[]; count: number } | null => {
  try {
    const raw = localStorage.getItem(getUserScopedCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: Faculty[]; count?: number; savedAt?: number };
    if (!Array.isArray(parsed.items)) return null;
    return {
      items: parsed.items,
      count: typeof parsed.count === 'number' ? parsed.count : parsed.items.length,
    };
  } catch {
    return null;
  }
};

const writeCachedFacultyList = (items: Faculty[], count: number): void => {
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

export const FacultyTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const { mode, tokens, brand, fonts, radius, ui } = useTheme();
  const { school, refreshSchool } = useSchool();

  const currentRole = (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const canManageFaculty = LEADERSHIP_ROLES.has(currentRole);
  const canResetPhoneLock = DEVICE_RESET_ROLES.has(currentRole);

  const initialCache = useMemo(() => {
    const apiHit = peekApiCache<PaginatedResponse<Faculty> | Faculty[]>(FACULTY_ENDPOINT, {
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
    return readCachedFacultyList();
  }, []);

  const [facultyList, setFacultyList] = useState<Faculty[]>(() => initialCache?.items || []);
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
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [inspectingFaculty, setInspectingFaculty] = useState<Faculty | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [resettingDeviceId, setResettingDeviceId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FacultyFormState>(INITIAL_FORM_DATA);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileReaderRef = useRef<FileReader | null>(null);
  const mountedRef = useRef<boolean>(true);
  const activeAbortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSearchRef = useRef<string>(search);
  const hasLoadedItemsRef = useRef<boolean>((initialCache?.items.length || 0) > 0);
  const isInteractingRef = useRef<boolean>(false);
  isInteractingRef.current = isModalOpen || Boolean(inspectingFaculty);

  const handleCopy = useCallback(async (text: string, key: string) => {
    const cleanValue = cleanInput(text, 120);
    if (!cleanValue) return;

    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(cleanValue);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied) {
      try {
        const helper = document.createElement('textarea');
        helper.value = cleanValue;
        helper.style.position = 'fixed';
        helper.style.left = '-99999px';
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        copied = document.execCommand('copy');
        helper.remove();
      } catch {
        copied = false;
      }
    }

    if (copied) {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopiedKey(key);
      copyTimerRef.current = setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const loadFacultyList = useCallback(
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
          apiClient.get<PaginatedResponse<Faculty> | Faculty[]>(FACULTY_ENDPOINT, {
            params: {
              page: isAll ? 1 : page,
              page_size: isAll ? 'ALL' : size,
              search: cleanQuery || undefined,
              department: cleanDept || undefined,
              ...(bypassCache ? { nocache: 1 } : {}),
            },
            signal: controller.signal,
          }),
          apiClient.get<Faculty[]>(FACULTY_DROPDOWN_ENDPOINT, {
            params: { include_all: 1 },
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        if (listOutcome.status === 'fulfilled') {
          const payload = listOutcome.value.data;
          if (payload && !Array.isArray(payload) && Array.isArray(payload.results)) {
            setFacultyList(payload.results);
            hasLoadedItemsRef.current = payload.results.length > 0;
            setTotalCount(payload.count);
            setTotalPages(isAll ? 1 : payload.total_pages || Math.ceil(payload.count / size) || 1);
            setCurrentPage(isAll ? 1 : payload.current_page || page);
            if (!cleanQuery && !cleanDept && page === 1) {
              writeCachedFacultyList(payload.results, payload.count);
            }
          } else if (Array.isArray(payload)) {
            setFacultyList(payload);
            hasLoadedItemsRef.current = payload.length > 0;
            setTotalCount(payload.length);
            setTotalPages(1);
            setCurrentPage(1);
            if (!cleanQuery && !cleanDept) {
              writeCachedFacultyList(payload, payload.length);
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
                'Could not load the faculty directory right now. Please check your connection and try again.'
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

  // Clean up pending requests, readers, and timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeAbortRef.current?.abort();
      fileReaderRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Reload when search (debounced), department filter, or page size changes
  useEffect(() => {
    const searchChanged = prevSearchRef.current !== search;
    prevSearchRef.current = search;
    const delay = searchChanged ? 280 : 0;
    const timer = setTimeout(() => {
      setCurrentPage(1);
      void loadFacultyList(1, pageSize, search, departmentFilter, false, false);
    }, delay);
    return () => clearTimeout(timer);
  }, [search, departmentFilter, pageSize, loadFacultyList]);

  // Gentle background refresh only while page is visible and user is not inside a modal
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && !isInteractingRef.current) {
        void loadFacultyList(currentPage, pageSize, search, departmentFilter, true, true);
      }
    }, 15000);
    return () => clearInterval(intervalId);
  }, [currentPage, pageSize, search, departmentFilter, loadFacultyList]);

  // Merge built-in departments with any live database departments
  const departmentOptions = useMemo(() => {
    const combined = new Set<string>(DEFAULT_DEPARTMENTS);
    directoryDepartments.forEach((d) => combined.add(d));
    facultyList.forEach((f) => {
      if (f.department?.trim()) combined.add(f.department.trim());
    });
    if (formData.department.trim()) combined.add(formData.department.trim());
    return Array.from(combined).sort((a, b) => a.localeCompare(b));
  }, [directoryDepartments, facultyList, formData.department]);

  // Preserve any custom position already stored in the database when editing
  const positionGroups = useMemo(() => {
    const knownRanks = new Set(DEFAULT_POSITION_GROUPS.flatMap((g) => g.ranks));
    const currentPos = formData.position.trim();
    if (!currentPos || knownRanks.has(currentPos)) {
      return DEFAULT_POSITION_GROUPS;
    }
    return [
      { category: 'Current Assignment', ranks: [currentPos] },
      ...DEFAULT_POSITION_GROUPS,
    ];
  }, [formData.position]);

  const displayedFaculty = useMemo(() => {
    return facultyList.filter((item) => {
      if (statusFilter === 'ACTIVE') return item.is_active;
      if (statusFilter === 'INACTIVE') return !item.is_active;
      if (statusFilter === 'BOUND') return Boolean(item.bound_device_id);
      if (statusFilter === 'UNBOUND') return !item.bound_device_id;
      return true;
    });
  }, [facultyList, statusFilter]);

  const activeFacultyCount = useMemo(
    () => facultyList.filter((f) => f.is_active).length,
    [facultyList]
  );

  const boundPhonesCount = useMemo(
    () => facultyList.filter((f) => Boolean(f.bound_device_id && f.bound_device_id.trim())).length,
    [facultyList]
  );

  const uniqueDepartmentCount = useMemo(() => {
    const source = directoryDepartments.length > 0 ? directoryDepartments : facultyList.map((f) => f.department);
    return new Set(source.filter(Boolean)).size;
  }, [directoryDepartments, facultyList]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setCurrentPage(nextPage);
    void loadFacultyList(nextPage, pageSize, search, departmentFilter, false, false);
  };

  const handlePageSizeChange = (nextSize: number) => {
    if (nextSize === pageSize) return;
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleManualRefresh = () => {
    void refreshSchool();
    void loadFacultyList(currentPage, pageSize, search, departmentFilter, false, true);
  };

  const handleExportCsv = () => {
    const suffix = pageSize >= ALL_ROWS_SIZE ? 'All' : `Page${currentPage}_${pageSize}rows`;
    const exported = exportToCsv(
      `AttendSure_Faculty_${suffix}.csv`,
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
      displayedFaculty.map((f) => [
        f.employee_id,
        f.full_name,
        f.position,
        f.department,
        f.can_teach ? 'YES' : 'NO',
        f.email || '',
        f.contact_number || '',
        f.bound_device_id ? f.device_model || 'Linked Phone' : 'Not Linked',
        f.is_active ? 'ACTIVE' : 'INACTIVE',
      ])
    );

    if (exported) {
      showAlert({
        title: 'CSV Downloaded',
        message: `Saved ${displayedFaculty.length} faculty records to a CSV file.`,
        type: 'success',
      });
    } else {
      showAlert({
        title: 'Nothing to Export',
        message: 'There are no faculty records matching your current filters.',
        type: 'info',
      });
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAlert({
        title: 'Unsupported Image',
        message: 'Please choose a JPG, PNG, or WebP photo.',
        type: 'error',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      showAlert({
        title: 'Photo Too Large',
        message: 'Profile photos must be 2.5 MB or smaller.',
        type: 'error',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    fileReaderRef.current?.abort();
    const reader = new FileReader();
    fileReaderRef.current = reader;
    reader.onloadend = () => {
      if (!mountedRef.current || reader.readyState !== FileReader.DONE) return;
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!isSafeImageUrl(result)) {
        showAlert({
          title: 'Invalid Image',
          message: 'Could not verify the selected image file.',
          type: 'error',
        });
        return;
      }
      setPhotoPreview(result);
      setFormData((prev) => ({ ...prev, photo: result }));
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
      can_teach: faculty.can_teach ?? true,
      is_active: faculty.is_active ?? true,
      photo: null,
    });
    setPhotoPreview(getSafeAvatarUrl(faculty));
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const cleanEmployeeId = cleanInput(formData.employee_id, 50).toUpperCase();
    const cleanFirstName = cleanInput(formData.first_name, 100);
    const cleanMiddleName = cleanInput(formData.middle_name, 100);
    const cleanLastName = cleanInput(formData.last_name, 100);
    const cleanSuffix = SUFFIX_OPTIONS.includes(formData.suffix) ? formData.suffix : '';
    const cleanEmail = cleanInput(formData.email, 150).toLowerCase();
    const cleanPhone = cleanInput(formData.contact_number, 30).replace(/[^\d+\-()\s]/g, '').replace(/[\s()-]/g, '');

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
      can_teach: Boolean(formData.can_teach),
      is_active: Boolean(formData.is_active),
    };

    if (formData.photo !== null) {
      payload.photo = formData.photo === '' ? null : formData.photo;
    }

    try {
      if (editingFaculty) {
        const res = await apiClient.put<Faculty>(`${FACULTY_ENDPOINT}${editingFaculty.id}/`, payload);
        setFacultyList((prev) => prev.map((f) => (f.id === editingFaculty.id ? res.data : f)));
        showAlert({
          title: 'Profile Saved',
          message: `Updated details for ${cleanFirstName} ${cleanLastName}.`,
          type: 'success',
        });
      } else {
        const res = await apiClient.post<Faculty>(FACULTY_ENDPOINT, payload);
        setFacultyList((prev) => [res.data, ...prev]);
        showAlert({
          title: 'Faculty Added',
          message: `${cleanFirstName} ${cleanLastName} has been added to the directory.`,
          type: 'success',
        });
      }
      setIsModalOpen(false);
      void loadFacultyList(currentPage, pageSize, search, departmentFilter, true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Could Not Save',
        message: extractApiError(err, 'Unable to save this faculty record. Please check the details and try again.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDeviceBinding = (faculty: Faculty) => {
    showConfirm({
      title: 'Reset Phone Lock',
      message: `Unlink the current mobile phone for ${faculty.full_name}? Their next GPS & facial check-in will automatically pair their new phone.`,
      confirmLabel: 'Reset Phone Lock',
      isDestructive: false,
      onConfirm: async () => {
        setResettingDeviceId(faculty.id);
        try {
          const res = await apiClient.post<{ message?: string }>(`${FACULTY_ENDPOINT}${faculty.id}/reset-device/`, {
            faculty_id: faculty.id,
          });
          setFacultyList((prev) =>
            prev.map((item) =>
              item.id === faculty.id
                ? { ...item, bound_device_id: null, device_model: null, device_bound_at: null }
                : item
            )
          );
          if (inspectingFaculty?.id === faculty.id) {
            setInspectingFaculty((prev) =>
              prev ? { ...prev, bound_device_id: null, device_model: null, device_bound_at: null } : null
            );
          }
          showAlert({
            title: 'Phone Lock Cleared',
            message: res.data?.message || `Cleared the bound phone for ${faculty.full_name}.`,
            type: 'success',
          });
        } catch (err: unknown) {
          showAlert({
            title: 'Reset Failed',
            message: extractApiError(err, 'Could not reset the phone lock for this faculty member.'),
            type: 'error',
          });
        } finally {
          setResettingDeviceId(null);
        }
      },
    });
  };

  const promptDelete = (faculty: Faculty) => {
    showConfirm({
      title: 'Remove Faculty Member',
      message: `Permanently remove ${faculty.full_name || faculty.first_name} (${faculty.employee_id}) from the AttendSure faculty directory?`,
      confirmLabel: 'Remove Faculty',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`${FACULTY_ENDPOINT}${faculty.id}/`);
          setFacultyList((prev) => prev.filter((f) => f.id !== faculty.id));
          if (inspectingFaculty?.id === faculty.id) setInspectingFaculty(null);
          showAlert({
            title: 'Faculty Removed',
            message: `Removed ${faculty.full_name || faculty.first_name} from the directory.`,
            type: 'info',
          });
          void loadFacultyList(currentPage, pageSize, search, departmentFilter, true, true);
        } catch (err: unknown) {
          showAlert({
            title: 'Could Not Remove',
            message: extractApiError(err, 'Unable to remove this faculty record right now.'),
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
    { key: 'ALL', label: `All (${facultyList.length})` },
    { key: 'ACTIVE', label: `Active (${activeFacultyCount})` },
    { key: 'INACTIVE', label: `Inactive (${Math.max(0, facultyList.length - activeFacultyCount)})` },
    { key: 'BOUND', label: `Phone Linked (${boundPhonesCount})` },
    { key: 'UNBOUND', label: `Unlinked (${Math.max(0, facultyList.length - boundPhonesCount)})` },
  ];

  const activeSchoolName = school.school_name?.trim() || 'AttendSure School Campus';

  const inspectingQrValue = inspectingFaculty
    ? `ATTENDSURE-FACULTY:${inspectingFaculty.employee_id}`
    : '';

  return (
    <div style={styles.page}>
      {/* Top Directory Header */}
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
              Faculty Directory
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: fonts.size.xs, color: tokens.textSecondary }}>
              Manage faculty profiles, class list assignments, and 1-to-1 mobile check-in phone bindings.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {lastUpdated && (
            <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontFamily: fonts.mono }}>
              Synced {lastUpdated}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleManualRefresh}
            loading={refreshing}
            icon={<RefreshCw size={13} />}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            icon={<Download size={13} />}
          >
            Export CSV
          </Button>
          {canManageFaculty && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              icon={<Plus size={14} />}
            >
              Add Faculty
            </Button>
          )}
        </div>
      </div>

      {/* Recoverable Network Error Banner */}
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

      {/* Telemetry Summary Cards */}
      <div style={styles.statsGrid}>
        <StatsCard
          label="Total Faculty"
          value={(totalCount || facultyList.length).toLocaleString()}
          helpText="Registered classroom & support personnel"
          badge={<Users size={17} color={brand.primary} />}
        />
        <StatsCard
          label="Active Faculty"
          value={activeFacultyCount.toLocaleString()}
          valueColor={brand.success}
          helpText="Cleared for daily mobile GPS check-in"
          badge={<ShieldCheck size={17} color={brand.success} />}
        />
        <StatsCard
          label="Mobile Phones Linked"
          value={`${boundPhonesCount} / ${facultyList.length}`}
          valueColor={brand.primary}
          helpText="1-to-1 bound for face & GPS verification"
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

      {/* Search, Department Selector & Status Filter Pills */}
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
                aria-label="Search faculty"
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
            Showing {displayedFaculty.length} of {facultyList.length} loaded
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

      {/* Faculty Directory Table */}
      <div style={styles.tableCard}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ ...ui.th, width: 54 }}>Photo</th>
                <th style={ui.th}>Employee ID</th>
                <th style={ui.th}>Full Name</th>
                <th style={ui.th}>Position &amp; Department</th>
                <th style={ui.th}>Contact Details</th>
                <th style={ui.th}>Mobile Check-In Phone</th>
                <th style={ui.th}>Status</th>
                <th style={{ ...ui.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && facultyList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 44, textAlign: 'center', color: tokens.textMuted }}>
                    <Loader2
                      className="animate-spin"
                      size={24}
                      style={{ margin: '0 auto 8px', display: 'block', color: brand.primary }}
                    />
                    <span style={{ fontSize: fonts.size.sm, fontWeight: fonts.weight.semibold }}>
                      Loading faculty directory...
                    </span>
                  </td>
                </tr>
              ) : displayedFaculty.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 44, textAlign: 'center', color: tokens.textMuted }}>
                    <Users size={26} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }} />
                    <div style={{ fontSize: fonts.size.base, fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                      No faculty members found
                    </div>
                    <div style={{ fontSize: fonts.size.xs, marginTop: 4 }}>
                      Try clearing your search or switching the department filter.
                    </div>
                  </td>
                </tr>
              ) : (
                displayedFaculty.map((faculty) => {
                  const avatarUrl = getSafeAvatarUrl(faculty);
                  const isPhoneLinked = Boolean(faculty.bound_device_id && faculty.bound_device_id.trim());
                  return (
                    <tr key={faculty.id}>
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
                            <img
                              src={avatarUrl}
                              alt={faculty.full_name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            getInitials(faculty.full_name || faculty.first_name)
                          )}
                        </div>
                      </td>

                      <td style={ui.td}>
                        <button
                          type="button"
                          onClick={() => void handleCopy(faculty.employee_id, `emp-${faculty.id}`)}
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
                          {copiedKey === `emp-${faculty.id}` ? (
                            <Check size={11} color={brand.success} />
                          ) : (
                            <Copy size={11} color={tokens.textMuted} />
                          )}
                          <span>{faculty.employee_id}</span>
                        </button>
                      </td>

                      <td style={ui.td}>
                        <div style={{ fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                          {faculty.full_name}
                        </div>
                        {faculty.can_teach && (
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
                        <div style={{ fontWeight: fonts.weight.semibold, color: tokens.textPrimary }}>
                          {faculty.position || 'Faculty'}
                        </div>
                        <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary, marginTop: 2 }}>
                          {faculty.department || 'Unassigned Department'}
                        </div>
                      </td>

                      <td style={ui.td}>
                        <div style={{ fontSize: fonts.size.sm, color: tokens.textPrimary }}>
                          {faculty.email || '—'}
                        </div>
                        <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 2 }}>
                          {faculty.contact_number || '—'}
                        </div>
                      </td>

                      <td style={ui.td}>
                        {isPhoneLinked ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={ui.badge(tokens.primaryLight, brand.primary)}>
                              <Smartphone size={11} />
                              {faculty.device_model || 'Phone Linked'}
                            </span>
                            {canResetPhoneLock && (
                              <button
                                type="button"
                                disabled={resettingDeviceId === faculty.id}
                                onClick={() => handleResetDeviceBinding(faculty)}
                                title="Unlink current phone so faculty can pair a replacement phone"
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
                                {resettingDeviceId === faculty.id ? 'Resetting...' : 'Reset Lock'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>
                            Pairs on first mobile check-in
                          </span>
                        )}
                      </td>

                      <td style={ui.td}>
                        <span
                          style={ui.badge(
                            faculty.is_active ? tokens.successLight : tokens.dangerLight,
                            faculty.is_active ? brand.success : brand.danger
                          )}
                        >
                          {faculty.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>

                      <td style={{ ...ui.td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setInspectingFaculty(faculty)}
                            style={styles.actionBtn}
                            title="View Digital Faculty Pass"
                            aria-label={`View digital pass for ${faculty.full_name}`}
                          >
                            <QrCode size={14} />
                          </button>

                          {canManageFaculty && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(faculty)}
                                style={styles.actionBtn}
                                title="Edit Faculty Profile"
                                aria-label={`Edit ${faculty.full_name}`}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => promptDelete(faculty)}
                                style={{ ...styles.actionBtn, color: brand.danger }}
                                title="Remove Faculty Member"
                                aria-label={`Remove ${faculty.full_name}`}
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
          itemLabel="faculty members"
          style={{
            backgroundColor: tokens.bgSurface,
            borderTop: `1px solid ${tokens.borderSubtle}`,
          }}
        />
      </div>

      {/* Add / Edit Faculty Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingFaculty ? `Edit Faculty: ${editingFaculty.full_name}` : 'Add New Faculty Member'}
          maxWidth="580px"
        >
          <div style={styles.modalBodySurface}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Profile Photo Picker */}
              <div
                style={{
                  ...ui.subtleBox,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      backgroundColor: tokens.bgSurface,
                      border: `1.5px solid ${tokens.borderStrong}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {photoPreview && isSafeImageUrl(photoPreview) ? (
                      <img
                        src={photoPreview}
                        alt="Profile preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User size={22} color={tokens.textMuted} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: fonts.size.sm, fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                      Directory Profile Photo
                    </div>
                    <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>
                      Optional JPG, PNG, or WebP (max 2.5 MB). Facial check-in runs privately on-device.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    ref={fileInputRef}
                    onChange={handlePhotoSelect}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    icon={<Camera size={13} />}
                  >
                    Choose Photo
                  </Button>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: brand.danger,
                        fontSize: fonts.size.xs,
                        fontWeight: fonts.weight.bold,
                        cursor: 'pointer',
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Employee ID & Contact Email */}
              <div style={styles.formGrid2}>
                <div>
                  <label htmlFor="faculty-emp-id" style={ui.label}>
                    Employee ID *
                  </label>
                  <input
                    id="faculty-emp-id"
                    type="text"
                    required
                    maxLength={50}
                    value={formData.employee_id}
                    onChange={(e) =>
                      setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })
                    }
                    style={{ ...ui.input, fontFamily: fonts.mono }}
                    placeholder="e.g. EMP-2026-014"
                  />
                </div>

                <div>
                  <label htmlFor="faculty-email" style={ui.label}>
                    Email Address
                  </label>
                  <input
                    id="faculty-email"
                    type="email"
                    maxLength={150}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={ui.input}
                    placeholder="name@school.edu"
                  />
                </div>
              </div>

              {/* Name Fields */}
              <div style={styles.nameGrid}>
                <div>
                  <label htmlFor="faculty-first-name" style={ui.label}>
                    First Name *
                  </label>
                  <input
                    id="faculty-first-name"
                    type="text"
                    required
                    maxLength={100}
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    style={ui.input}
                  />
                </div>

                <div>
                  <label htmlFor="faculty-middle-name" style={ui.label}>
                    Middle Name
                  </label>
                  <input
                    id="faculty-middle-name"
                    type="text"
                    maxLength={100}
                    value={formData.middle_name}
                    onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                    style={ui.input}
                  />
                </div>

                <div>
                  <label htmlFor="faculty-last-name" style={ui.label}>
                    Last Name *
                  </label>
                  <input
                    id="faculty-last-name"
                    type="text"
                    required
                    maxLength={100}
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    style={ui.input}
                  />
                </div>

                <div>
                  <label htmlFor="faculty-suffix" style={ui.label}>
                    Suffix
                  </label>
                  <select
                    id="faculty-suffix"
                    value={formData.suffix}
                    onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                    style={ui.input}
                  >
                    {SUFFIX_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt || 'None'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Position & Department */}
              <div style={styles.formGrid2}>
                <div>
                  <label htmlFor="faculty-position" style={ui.label}>
                    Position
                  </label>
                  <select
                    id="faculty-position"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    style={ui.input}
                  >
                    {positionGroups.map((grp) => (
                      <optgroup key={grp.category} label={grp.category}>
                        {grp.ranks.map((rank) => (
                          <option key={rank} value={rank}>
                            {rank}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="faculty-department" style={ui.label}>
                    Department
                  </label>
                  <select
                    id="faculty-department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    style={ui.input}
                  >
                    {departmentOptions.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone Number & Role Toggles */}
              <div style={styles.formGrid2}>
                <div>
                  <label htmlFor="faculty-contact" style={ui.label}>
                    Mobile Phone Number
                  </label>
                  <input
                    id="faculty-contact"
                    type="tel"
                    maxLength={30}
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    style={ui.input}
                    placeholder="+63 917 000 0000"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: fonts.size.sm,
                      fontWeight: fonts.weight.semibold,
                      color: tokens.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.can_teach}
                      onChange={(e) => setFormData({ ...formData, can_teach: e.target.checked })}
                      style={{ accentColor: brand.primary }}
                    />
                    Handles classroom schedules &amp; class lists
                  </label>

                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: fonts.size.sm,
                      fontWeight: fonts.weight.semibold,
                      color: tokens.textPrimary,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      style={{ accentColor: brand.success }}
                    />
                    Active faculty member
                  </label>
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 8,
                  paddingTop: 12,
                  borderTop: `1px solid ${tokens.borderSubtle}`,
                }}
              >
                <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="md" type="submit" loading={saving}>
                  {editingFaculty ? 'Save Changes' : 'Add Faculty'}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Digital Faculty Pass Modal */}
      {inspectingFaculty && (
        <Modal
          isOpen={Boolean(inspectingFaculty)}
          onClose={() => setInspectingFaculty(null)}
          title="Digital Faculty Pass"
          maxWidth="420px"
        >
          <div style={styles.modalBodySurface}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 310,
                  backgroundColor: tokens.bgSurface,
                  border: `2px solid ${brand.primary}`,
                  borderRadius: radius.xl,
                  overflow: 'hidden',
                  boxShadow: tokens.cardShadow,
                }}
              >
                <div
                  style={{
                    backgroundColor: brand.buttonBg,
                    color: '#ffffff',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                  }}
                >
                  <AttendSureBrandBadge size={34} mode="light" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: fonts.size.sm, fontWeight: fonts.weight.extrabold, letterSpacing: '0.4px' }}>
                      ATTENDSURE FACULTY PASS
                    </div>
                    <div
                      style={{
                        fontSize: fonts.size.xs,
                        color: '#e0f2fe',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
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
                    {getSafeAvatarUrl(inspectingFaculty) ? (
                      <img
                        src={getSafeAvatarUrl(inspectingFaculty)!}
                        alt={inspectingFaculty.full_name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      getInitials(inspectingFaculty.full_name || inspectingFaculty.first_name)
                    )}
                  </div>

                  <div style={{ fontSize: fonts.size.md, fontWeight: fonts.weight.extrabold, color: tokens.textPrimary }}>
                    {inspectingFaculty.full_name}
                  </div>
                  <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>
                    {inspectingFaculty.position}
                  </div>
                  <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>
                    {inspectingFaculty.department}
                  </div>

                  {inspectingQrValue && (
                    <div
                      style={{
                        margin: '12px auto',
                        width: 120,
                        height: 120,
                        padding: 6,
                        backgroundColor: '#ffffff',
                        borderRadius: radius.md,
                        border: `1px solid ${tokens.borderSubtle}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <QrCodeSvg
                        value={inspectingQrValue}
                        size={108}
                        label={`Faculty verification QR code for ${inspectingFaculty.full_name}`}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                  )}

                  <div
                    style={{
                      fontSize: fonts.size.sm,
                      fontFamily: fonts.mono,
                      fontWeight: fonts.weight.bold,
                      color: tokens.textPrimary,
                    }}
                  >
                    ID: {inspectingFaculty.employee_id}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: tokens.bgSurfaceSubtle,
                    padding: '10px 12px',
                    borderTop: `1px solid ${tokens.borderSubtle}`,
                    fontSize: fonts.size.xs,
                    color: tokens.textSecondary,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                    Mobile Check-In:{' '}
                    {inspectingFaculty.bound_device_id
                      ? inspectingFaculty.device_model || 'Linked Phone Active'
                      : 'Pairs on first mobile check-in'}
                  </div>
                  <div style={{ color: tokens.textMuted }}>
                    On-device facial recognition &amp; campus GPS only. No raw face photos are stored on the server.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {canResetPhoneLock && inspectingFaculty.bound_device_id && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => handleResetDeviceBinding(inspectingFaculty)}
                    loading={resettingDeviceId === inspectingFaculty.id}
                    icon={<RotateCcw size={14} />}
                  >
                    Reset Phone Lock
                  </Button>
                )}
                <Button variant="primary" size="md" onClick={() => setInspectingFaculty(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FacultyTab;
