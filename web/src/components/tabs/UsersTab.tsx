/**
 * AttendSure - User Accounts & Access Control
 * File: web/src/components/tabs/UsersTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { isSafeImageUrl } from '../../theme/tokens';
import { useTheme } from '../../context/ThemeContext';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import {
  User,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Camera,
  X,
  Shield,
  Eye,
  EyeOff,
  Copy,
  Check,
  Phone,
  Briefcase,
  Building,
  Smartphone,
  GraduationCap,
} from 'lucide-react';

export interface SystemUser {
  id: number;
  username: string;
  employee_id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  phone_number?: string;
  department?: string;
  position?: string;
  role?: string;
  current_role?: string;
  is_teaching?: boolean;
  can_teach?: boolean;
  is_profile_completed?: boolean;
  faculty_id?: number | null;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

const RBAC_ROLES = [
  { value: 'FACULTY', label: 'Classroom Faculty' },
  { value: 'FACULTY_ADMIN', label: 'Faculty / Admin (Dual Role)' },
  { value: 'ADMIN', label: 'System Administrator' },
  { value: 'SUPERADMIN', label: 'Super Administrator' },
  { value: 'PRINCIPAL', label: 'School Principal' },
  { value: 'DEPT_HEAD', label: 'Department Head' },
  { value: 'PARENT', label: 'Parent / Guardian (Mobile App)' },
];

const DEPARTMENTS_LIST = [
  'Junior High School',
  'Senior High School',
  'English Department',
  'Science Department',
  'Mathematics Department',
  'Filipino Department',
  'Araling Panlipunan Department',
  'MAPEH Department',
  'TLE / TVL Department',
  'Values Education (EsP) Department',
  'Office of the Principal / Administration',
  'Parent / Guardian',
];

const POSITIONS_LIST = [
  'Faculty I',
  'Faculty II',
  'Faculty III',
  'Master Faculty I',
  'Master Faculty II',
  'Head Faculty I',
  'Head Faculty II',
  'Secondary School Principal IV',
  'Assistant School Principal',
  'Administrative Assistant',
  'Parent / Guardian',
];

const INITIAL_FORM = {
  username: '',
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  email: '',
  contact_number: '',
  department: 'Junior High School',
  position: 'Faculty I',
  role: 'FACULTY',
  is_teaching: true,
  is_active: true,
  password: '',
  photo: null as string | null,
};

const sanitizeInput = (raw: string, maxLength = 150): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

const extractUsers = (raw: unknown): SystemUser[] => {
  if (Array.isArray(raw)) return raw as SystemUser[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { results?: SystemUser[] }).results)) {
    return (raw as { results: SystemUser[] }).results;
  }
  return [];
};

export const UsersTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand, ui } = useTheme();
  const currentLoggedUsername = (localStorage.getItem('attendsure_username') || '').trim().toLowerCase();

  const cachedUsers = peekApiCache(API_ROUTES.accounts.users, { page_size: 'ALL' });

  const [users, setUsers] = useState<SystemUser[]>(() => extractUsers(cachedUsers));
  const [loading, setLoading] = useState<boolean>(() => !cachedUsers);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [teachingFilter, setTeachingFilter] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAbortController = useRef<AbortController | null>(null);
  const validateAbortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [liveErrors, setLiveErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
  }>({});
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  useEffect(() => {
    return () => {
      activeAbortController.current?.abort();
      validateAbortRef.current?.abort();
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // Real-time client validation
  useEffect(() => {
    const newErrors: { username?: string; email?: string; password?: string } = {};

    if (formData.username) {
      if (/\s/.test(formData.username)) {
        newErrors.username = 'Username cannot contain spaces.';
      } else if (!/^[a-zA-Z0-9_.-]+$/.test(formData.username)) {
        newErrors.username = 'Use only letters, numbers, dots, dashes, or underscores.';
      } else if (formData.username.length < 3) {
        newErrors.username = 'Username must be at least 3 characters.';
      }
    }

    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (formData.password) {
      if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters long.';
      } else if (!/[A-Za-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
        newErrors.password = 'Password must include both letters and numbers.';
      }
    }

    setLiveErrors((prev) => ({
      ...newErrors,
      username: newErrors.username || (prev.username?.includes('already') ? prev.username : undefined),
    }));
  }, [formData.username, formData.email, formData.password]);

  // Real-time server uniqueness check for username with AbortController cleanup
  useEffect(() => {
    const cleanUser = sanitizeInput(formData.username, 64);
    if (!isModalOpen || cleanUser.length < 3 || /\s/.test(cleanUser)) {
      validateAbortRef.current?.abort();
      setIsCheckingUsername(false);
      return;
    }

    const timer = setTimeout(async () => {
      validateAbortRef.current?.abort();
      const controller = new AbortController();
      validateAbortRef.current = controller;

      try {
        setIsCheckingUsername(true);
        const res = await apiClient.get(API_ROUTES.accounts.validateField, {
          params: {
            field: 'username',
            value: cleanUser,
            exclude_id: editingUser?.id,
            nocache: 1,
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (res.data?.is_taken) {
          setLiveErrors((prev) => ({ ...prev, username: res.data.message || 'Username already taken.' }));
        } else {
          setLiveErrors((prev) => ({
            ...prev,
            username: prev.username?.includes('already') ? undefined : prev.username,
          }));
        }
      } catch {
        // Ignore transient network errors or aborts during typing
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingUsername(false);
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      validateAbortRef.current?.abort();
    };
  }, [formData.username, editingUser, isModalOpen]);

  const hasLiveErrors = Boolean(liveErrors.username || liveErrors.email || liveErrors.password);

  const handleCopy = async (text: string, id: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey((prev) => (prev === id ? null : prev));
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const fetchUsers = useCallback(async (query = '', silent = false, bypassCache = false) => {
    activeAbortController.current?.abort();
    const controller = new AbortController();
    activeAbortController.current = controller;

    const cleanQuery = sanitizeInput(query, 80);
    const baseParams: Record<string, string | number | undefined> = {
      search: cleanQuery || undefined,
      page_size: 'ALL',
    };

    if (!bypassCache) {
      const warm = peekApiCache(API_ROUTES.accounts.users, baseParams);
      if (warm !== undefined) {
        setUsers(extractUsers(warm));
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }
    } else if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await apiClient.get(API_ROUTES.accounts.users, {
        params: {
          ...baseParams,
          ...(bypassCache ? { nocache: 1 } : {}),
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setUsers(extractUsers(res.data));
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.name === 'AbortError' || anyErr?.code === 'ERR_CANCELED') {
        return;
      }
      if (!silent) {
        setError(extractApiError(err, 'Unable to load user accounts. Administrator permissions required.'));
      }
    } finally {
      if (!controller.signal.aborted && !silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchUsers(search, false, false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, fetchUsers]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showAlert({
        title: 'Unsupported Image',
        message: 'Only JPG, PNG, and WebP images are allowed.',
        type: 'error',
      });
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      showAlert({
        title: 'File Too Large',
        message: 'Profile picture must be 2.5 MB or smaller.',
        type: 'error',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = typeof reader.result === 'string' ? reader.result : '';
      if (!isSafeImageUrl(b64)) {
        showAlert({
          title: 'Invalid Image',
          message: 'Selected file could not be verified as a safe image.',
          type: 'error',
        });
        return;
      }
      setPhotoPreview(b64);
      setFormData((prev) => ({ ...prev, photo: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData(INITIAL_FORM);
    setLiveErrors({});
    setPhotoPreview(null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: SystemUser) => {
    const rawRole = (user.current_role || user.role || 'FACULTY').toUpperCase();
    const isTeach =
      rawRole === 'PARENT'
        ? false
        : user.is_teaching !== undefined
          ? Boolean(user.is_teaching)
          : user.can_teach !== undefined
            ? Boolean(user.can_teach)
            : true;

    const effectiveRole = rawRole === 'ADMIN' && isTeach ? 'FACULTY_ADMIN' : rawRole;
    const safeRole = RBAC_ROLES.some((r) => r.value === effectiveRole) ? effectiveRole : 'FACULTY';
    const phoneVal = user.phone_number || user.contact_number || '';
    const existingPic = user.photo_url || user.photo || null;

    setEditingUser(user);
    setLiveErrors({});
    setFormData({
      username: user.username || '',
      employee_id: user.employee_id || user.username || '',
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      suffix: user.suffix || '',
      email: user.email || '',
      contact_number: phoneVal,
      department: user.department || (safeRole === 'PARENT' ? 'Parent / Guardian' : 'Junior High School'),
      position: user.position || (safeRole === 'PARENT' ? 'Parent / Guardian' : 'Faculty I'),
      role: safeRole,
      is_teaching: isTeach,
      is_active: user.is_active ?? true,
      password: '',
      photo: null,
    });
    setPhotoPreview(isSafeImageUrl(existingPic) ? existingPic : null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasLiveErrors) {
      showAlert({
        title: 'Form Notice',
        message: liveErrors.username || liveErrors.email || liveErrors.password || 'Please fix the highlighted errors.',
        type: 'error',
      });
      return;
    }

    const cleanUsername = sanitizeInput(formData.username, 64).replace(/\s+/g, '');
    if (!cleanUsername) {
      showAlert({
        title: 'Username Required',
        message: 'Username cannot be blank or contain spaces.',
        type: 'error',
      });
      return;
    }

    if (!editingUser && formData.password.trim().length < 8) {
      showAlert({
        title: 'Password Required',
        message: 'Initial password must be at least 8 characters long.',
        type: 'error',
      });
      return;
    }

    const isParentRole = formData.role === 'PARENT';
    const cleanPhone = sanitizeInput(formData.contact_number, 20);

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        username: cleanUsername,
        employee_id: (sanitizeInput(formData.employee_id, 40) || cleanUsername).toUpperCase(),
        first_name: sanitizeInput(formData.first_name, 100),
        middle_name: sanitizeInput(formData.middle_name, 100),
        last_name: sanitizeInput(formData.last_name, 100),
        suffix: sanitizeInput(formData.suffix, 20),
        email: sanitizeInput(formData.email, 150).toLowerCase(),
        contact_number: cleanPhone,
        phone_number: cleanPhone,
        department: isParentRole ? 'Parent / Guardian' : sanitizeInput(formData.department, 100),
        position: isParentRole ? 'Parent / Guardian' : sanitizeInput(formData.position, 100),
        role: formData.role,
        is_teaching: isParentRole ? false : formData.is_teaching,
        is_active: formData.is_active,
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim().slice(0, 128);
      }

      if (formData.photo !== null) {
        if (formData.photo === '') {
          payload.photo = null;
        } else if (isSafeImageUrl(formData.photo)) {
          payload.photo = formData.photo;
        }
      }

      if (editingUser) {
        await apiClient.put(`${API_ROUTES.accounts.users}${editingUser.id}/`, payload);
        showAlert({
          title: 'Account Saved',
          message: `Saved updates for @${cleanUsername}. Role and permissions are now synced.`,
          type: 'success',
        });
      } else {
        await apiClient.post(API_ROUTES.accounts.users, payload);
        showAlert({
          title: 'Account Registered',
          message: `@${cleanUsername} is registered. ${
            payload.is_teaching
              ? 'This faculty member now appears in the Faculty tab.'
              : 'Account is active for mobile or web portal login.'
          }`,
          type: 'success',
        });
      }

      setIsModalOpen(false);
      await fetchUsers(search, true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Save Failed',
        message: extractApiError(err, 'Failed to save user account.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const promptDelete = (user: SystemUser) => {
    if (user.username.trim().toLowerCase() === currentLoggedUsername) {
      showAlert({
        title: 'Action Denied',
        message: 'You cannot delete your own active administrator account.',
        type: 'error',
      });
      return;
    }

    showConfirm({
      title: 'Delete User Account',
      message: `Permanently delete account "@${user.username}"? Associated faculty and class list assignments will be unlinked.`,
      confirmLabel: 'Delete Account',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`${API_ROUTES.accounts.users}${user.id}/`);
          setUsers((prev) => prev.filter((u) => u.id !== user.id));
          showAlert({
            title: 'Account Removed',
            message: `User @${user.username} was deleted.`,
            type: 'info',
          });
        } catch (err: unknown) {
          showAlert({
            title: 'Delete Error',
            message: extractApiError(err, 'Unable to delete user account.'),
            type: 'error',
          });
        }
      },
    });
  };

  const filteredUsers = useMemo(() => {
    const q = sanitizeInput(search, 80).toLowerCase();
    return users.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const phone = (u.phone_number || u.contact_number || '').toLowerCase();
      const matchesSearch =
        !q ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.employee_id || '').toLowerCase().includes(q) ||
        phone.includes(q) ||
        name.includes(q);

      const matchesRole = !roleFilter || (u.current_role || u.role || '').toUpperCase() === roleFilter;

      let matchesTeaching = true;
      if (teachingFilter === 'CAN_TEACH') {
        matchesTeaching = Boolean(u.is_teaching ?? u.can_teach);
      } else if (teachingFilter === 'CANT_TEACH') {
        matchesTeaching = !Boolean(u.is_teaching ?? u.can_teach);
      }

      return matchesSearch && matchesRole && matchesTeaching;
    });
  }, [users, search, roleFilter, teachingFilter]);

  const { activeCount, canTeachCount, cantTeachCount } = useMemo(() => {
    let active = 0;
    let teach = 0;
    for (const u of users) {
      if (u.is_active) active += 1;
      if (u.is_teaching ?? u.can_teach) teach += 1;
    }
    return {
      activeCount: active,
      canTeachCount: teach,
      cantTeachCount: users.length - teach,
    };
  }, [users]);

  const errorTextStyle: React.CSSProperties = {
    fontSize: '0.70rem',
    color: brand.danger,
    fontWeight: 600,
    marginTop: 3,
    display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2.5vw, 20px)' }}>
      {/* 1. System Account Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 12 }}>
        <StatsCard
          label="TOTAL REGISTERED USERS"
          value={users.length}
          helpText="Faculty, leaders & parent accounts"
        />
        <StatsCard
          label="CAN TEACH (IN FACULTY TAB)"
          value={canTeachCount}
          valueColor={brand.primary}
          helpText="Visible in Faculty tab & class schedules"
        />
        <StatsCard
          label="NON-TEACHING & PARENTS"
          value={cantTeachCount}
          valueColor={tokens.textSecondary}
          helpText="Parents & non-teaching accounts"
        />
        <StatsCard
          label="ACTIVE ACCOUNTS"
          value={activeCount}
          valueColor={brand.success}
          helpText="Authorized for mobile & web login"
        />
      </div>

      {/* 2. Control Bar with Filters & Add Button */}
      <div
        style={{
          ...ui.card,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ ...ui.input, width: 'auto', minWidth: 170 }}
          >
            <option value="">All Roles</option>
            {RBAC_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by teaching status"
            value={teachingFilter}
            onChange={(e) => setTeachingFilter(e.target.value)}
            style={{ ...ui.input, width: 'auto', minWidth: 180 }}
          >
            <option value="">All Status</option>
            <option value="CAN_TEACH">Can Teach (In Faculty Tab)</option>
            <option value="CANT_TEACH">Non-Teaching / Parent</option>
          </select>
        </div>

        <Button
          variant="primary"
          size="md"
          type="button"
          onClick={handleOpenCreate}
          icon={<Plus size={15} />}
        >
          Register User / Faculty
        </Button>
      </div>

      {/* 3. Main Users Table */}
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          borderRadius: 12,
          border: `1px solid ${tokens.borderSubtle}`,
          boxShadow: tokens.cardShadow,
          overflow: 'hidden',
        }}
      >
        <ModuleTableLayout
          title="Users & Access Control"
          subtitle="All faculty, school leaders, and parents are registered here. Enabling 'Can Teach' automatically displays the member in the Faculty tab."
          searchPlaceholder="Search by username, name, employee ID, phone, or email..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          error={error}
          data={filteredUsers}
          keyExtractor={(u) => u.id}
          columns={[
            {
              header: 'User Profile & Identity',
              render: (u) => {
                const displayName =
                  u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ProfileAvatar photoUrl={u.photo_url || u.photo} name={displayName} size={38} iconSize={18} />
                    <div>
                      <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.86rem' }}>
                        {displayName}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: '0.72rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                          ID: {u.employee_id || u.username}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(u.username, `user-${u.id}`)}
                          title="Copy Username"
                          aria-label={`Copy username ${u.username}`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', alignItems: 'center' }}
                        >
                          {copiedKey === `user-${u.id}` ? (
                            <Check size={11} color={brand.success} />
                          ) : (
                            <Copy size={11} color={tokens.textMuted} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Role & Faculty Visibility',
              render: (u) => {
                const canTeach = Boolean(u.is_teaching ?? u.can_teach);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...ui.badge(tokens.primaryLight, brand.primary), width: 'fit-content' }}>
                      <Shield size={11} /> {u.current_role || u.role || 'FACULTY'}
                    </span>
                    <span
                      style={{
                        ...ui.badge(
                          canTeach ? tokens.successLight : tokens.bgSurfaceSubtle,
                          canTeach ? brand.success : tokens.textSecondary
                        ),
                        border: `1px solid ${canTeach ? brand.success : tokens.borderSubtle}`,
                        width: 'fit-content',
                      }}
                    >
                      {canTeach ? <GraduationCap size={11} /> : <User size={11} />}
                      {canTeach ? 'Can Teach (In Faculty Tab)' : 'Non-Teaching / Parent'}
                    </span>
                  </div>
                );
              },
            },
            {
              header: 'Department & Position',
              render: (u) => (
                <div>
                  <div style={{ fontWeight: 600, color: tokens.textPrimary, fontSize: '0.80rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Briefcase size={12} color={brand.primary} /> {u.position || 'Faculty I'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: tokens.textSecondary, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Building size={12} color={tokens.textMuted} /> {u.department || 'Junior High School'}
                  </div>
                </div>
              ),
            },
            {
              header: 'Contact & Access',
              render: (u) => {
                const phone = u.phone_number || u.contact_number || '';
                const isParent = (u.role || '').toUpperCase() === 'PARENT';
                return (
                  <div>
                    <div style={{ fontSize: '0.74rem', color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={11} color={tokens.textMuted} /> {phone || '—'}
                    </div>
                    <div style={{ fontSize: '0.70rem', color: brand.success, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Smartphone size={11} /> {isParent ? 'Parent Mobile App' : 'Mobile App & Web Portal'}
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Status',
              render: (u) => (
                <span
                  style={{
                    ...ui.badge(
                      u.is_active ? tokens.successLight : tokens.dangerLight,
                      u.is_active ? brand.success : brand.danger
                    ),
                    border: `1px solid ${u.is_active ? brand.success : brand.danger}`,
                  }}
                >
                  {u.is_active ? 'ACTIVE' : 'SUSPENDED'}
                </span>
              ),
            },
            {
              header: 'Actions',
              align: 'right',
              render: (u) => {
                const isSelf = u.username.trim().toLowerCase() === currentLoggedUsername;
                return (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(u)}
                      title="Edit User & Permissions"
                      aria-label={`Edit user ${u.username}`}
                      style={{ ...ui.btnSecondary, padding: '5px 7px' }}
                    >
                      <Pencil size={13} color={brand.primary} />
                    </button>

                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => promptDelete(u)}
                      title={isSelf ? 'Cannot delete your active account' : 'Delete Account'}
                      aria-label={`Delete user ${u.username}`}
                      style={{
                        ...ui.btnSecondary,
                        padding: '5px 7px',
                        backgroundColor: tokens.dangerLight,
                        borderColor: brand.danger,
                        opacity: isSelf ? 0.35 : 1,
                        cursor: isSelf ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={13} color={brand.danger} />
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      </div>

      {/* 4. Registration & Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Edit User: @${editingUser.username}` : 'Register User / Faculty'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 14 }}>
            <ProfileAvatar
              photoUrl={photoPreview}
              name={formData.first_name || formData.username || 'User'}
              size={52}
              iconSize={26}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: tokens.textPrimary }}>Profile Picture</span>
              <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>JPEG, PNG, or WebP under 2.5 MB.</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePhotoSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ ...ui.btnPrimary, padding: '5px 10px', fontSize: '0.72rem' }}
                >
                  <Camera size={13} />
                  <span>{photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                </button>

                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview(null);
                      setFormData((p) => ({ ...p, photo: '' }));
                    }}
                    style={{
                      ...ui.btnSecondary,
                      padding: '4px 8px',
                      fontSize: '0.70rem',
                      color: brand.danger,
                      borderColor: brand.danger,
                    }}
                  >
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
            <div>
              <label style={ui.label}>Username (Login ID) *</label>
              <input
                type="text"
                required
                maxLength={64}
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                style={{
                  ...ui.input,
                  borderColor: liveErrors.username
                    ? brand.danger
                    : formData.username.length >= 3
                      ? brand.success
                      : tokens.borderStrong,
                }}
                placeholder="Enter login username"
              />
              {liveErrors.username && <span style={errorTextStyle}>{liveErrors.username}</span>}
            </div>

            <div>
              <label style={ui.label}>Employee or Account ID *</label>
              <input
                type="text"
                required
                maxLength={40}
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })}
                style={ui.input}
                placeholder="Enter employee ID"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 10 }}>
            <div>
              <label style={ui.label}>First Name *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={ui.input}
                placeholder="First name"
              />
            </div>
            <div>
              <label style={ui.label}>Middle Name</label>
              <input
                type="text"
                maxLength={100}
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                style={ui.input}
                placeholder="Optional"
              />
            </div>
            <div>
              <label style={ui.label}>Last Name *</label>
              <input
                type="text"
                required
                maxLength={100}
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={ui.input}
                placeholder="Last name"
              />
            </div>
            <div>
              <label style={ui.label}>Suffix</label>
              <select
                value={formData.suffix}
                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                style={ui.input}
              >
                <option value="">None</option>
                <option value="Jr.">Jr.</option>
                <option value="Sr.">Sr.</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
            <div>
              <label style={ui.label}>Email Address</label>
              <input
                type="email"
                maxLength={150}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{
                  ...ui.input,
                  borderColor: liveErrors.email ? brand.danger : tokens.borderStrong,
                }}
                placeholder="Enter email address"
              />
              {liveErrors.email && <span style={errorTextStyle}>{liveErrors.email}</span>}
            </div>
            <div>
              <label style={ui.label}>Mobile Phone Number (For App Alerts &amp; Parent Linking)</label>
              <input
                type="text"
                maxLength={20}
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                style={ui.input}
                placeholder="Enter 11-digit mobile number"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={ui.label}>System Role *</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const newRole = e.target.value;
                  const isParent = newRole === 'PARENT';
                  const canTeachDefault = newRole === 'FACULTY' || newRole === 'FACULTY_ADMIN';
                  setFormData({
                    ...formData,
                    role: newRole,
                    is_teaching: isParent ? false : canTeachDefault ? true : formData.is_teaching,
                    department: isParent ? 'Parent / Guardian' : formData.department,
                    position: isParent ? 'Parent / Guardian' : formData.position,
                  });
                }}
                style={ui.input}
              >
                {RBAC_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {editingUser && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ accentColor: brand.success }}
                />
                <span>Account Active</span>
              </label>
            )}
          </div>

          {formData.role !== 'PARENT' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '10px 12px',
                backgroundColor: formData.is_teaching ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                borderRadius: 8,
                border: `1.5px solid ${formData.is_teaching ? brand.primary : tokens.borderStrong}`,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={formData.is_teaching}
                onChange={(e) => setFormData({ ...formData, is_teaching: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: brand.buttonBg, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.80rem', fontWeight: 800, color: formData.is_teaching ? brand.primary : tokens.textPrimary }}>
                  Can Teach Classes (Visible in Faculty Tab &amp; Schedules)
                </span>
                <span style={{ fontSize: '0.70rem', color: tokens.textSecondary }}>
                  {formData.is_teaching
                    ? 'Active: This faculty member will appear in the Faculty tab, sections, and class schedules.'
                    : 'Inactive: Non-teaching user. Will appear only in the Users tab.'}
                </span>
              </div>
            </label>
          )}

          {formData.role !== 'PARENT' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  style={ui.input}
                >
                  {DEPARTMENTS_LIST.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={ui.label}>Official Position / Title</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  style={ui.input}
                >
                  {POSITIONS_LIST.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label style={ui.label}>
              {editingUser ? 'Reset Password (Optional, min 8 chars with letters & numbers)' : 'Initial Password (Min 8 chars) *'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required={!editingUser}
                minLength={8}
                maxLength={128}
                placeholder={editingUser ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{
                  ...ui.input,
                  paddingRight: 36,
                  borderColor: liveErrors.password ? brand.danger : tokens.borderStrong,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: tokens.textMuted,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {liveErrors.password && <span style={errorTextStyle}>{liveErrors.password}</span>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              disabled={saving || hasLiveErrors || isCheckingUsername}
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              {editingUser ? 'Save Updates' : 'Register User'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UsersTab;
