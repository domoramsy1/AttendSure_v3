// AttendSure Web - Users Tab
// File: D:\AttendSure_V3\web\src\components\tabs\UsersTab.tsx

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
import { AvatarUploadField } from '../common/AvatarUploadField';
import {
  STAFF_DEPARTMENTS_LIST,
  STAFF_POSITIONS_LIST,
} from '../common/staffConstants';
import {
  StaffContactField,
  StaffDepartmentPositionFields,
  StaffNameFields,
  StaffTeachingToggle,
} from '../common/StaffFormFields';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { canManageUsers, getCurrentUserFromStorage } from '../../utils/permissions';
import { useCopyFeedback } from '../../utils/clipboard';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import {
  User,
  Plus,
  Pencil,
  Trash2,
  Loader2,
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
  can_handle_classes?: boolean;
  can_teach?: boolean;
  is_profile_completed?: boolean;
  teacher_id?: number | null;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

const RBAC_ROLES = [
  { value: 'TEACHER', label: 'Teacher / Class Adviser' },
  { value: 'DEPT_HEAD', label: 'Department Head' },
  { value: 'PRINCIPAL', label: 'School Principal' },
  { value: 'ADMIN', label: 'System Administrator' },
];

const DEPARTMENTS_LIST = STAFF_DEPARTMENTS_LIST;
const POSITIONS_LIST = STAFF_POSITIONS_LIST;

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
  position: 'Teacher I',
  role: 'TEACHER',
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
  const canEditUsers = useMemo(() => canManageUsers(getCurrentUserFromStorage()), []);

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
  const { copiedKey, copy } = useCopyFeedback();

  const activeAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeAbortController.current?.abort();
    };
  }, []);

  const usernameFmtErr = useMemo(() => {
    if (!formData.username) return '';
    if (/\s/.test(formData.username)) return 'Username cannot contain spaces.';
    if (!/^[a-zA-Z0-9_.-]+$/.test(formData.username)) {
      return 'Use only letters, numbers, dots, dashes, or underscores.';
    }
    if (formData.username.length < 3) return 'Username must be at least 3 characters.';
    return '';
  }, [formData.username]);

  const emailFmtErr = useMemo(() => {
    const trimmed = formData.email.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return 'Please enter a valid email address.';
    }
    return '';
  }, [formData.email]);

  const passwordFmtErr = useMemo(() => {
    if (!formData.password) return '';
    if (formData.password.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Za-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      return 'Password must include both letters and numbers.';
    }
    return '';
  }, [formData.password]);

  const usernameAvail = useFieldAvailability({
    enabled: isModalOpen && Boolean(formData.username),
    field: 'username',
    value: sanitizeInput(formData.username, 64),
    minLength: 3,
    formatError: usernameFmtErr,
    fallbackMessage: 'This username is already taken.',
    excludeId: editingUser?.id,
    excludeUserId: editingUser?.id,
  });

  const empAvail = useFieldAvailability({
    enabled: isModalOpen,
    field: 'employee_id',
    value: sanitizeInput(formData.employee_id, 40),
    minLength: 2,
    fallbackMessage: 'This Employee ID is already assigned.',
    excludeTeacherId: editingUser?.teacher_id ?? undefined,
    excludeUserId: editingUser?.id,
  });

  const cleanEmailCheck = sanitizeInput(formData.email, 150).toLowerCase();
  const emailAvail = useFieldAvailability({
    enabled: isModalOpen && Boolean(cleanEmailCheck),
    field: 'email',
    value: cleanEmailCheck,
    formatError: emailFmtErr,
    fallbackMessage: 'This email address is already in use.',
    excludeId: editingUser?.id,
    excludeUserId: editingUser?.id,
  });

  const cleanPhoneCheck = sanitizeInput(formData.contact_number, 20);
  const phoneAvail = useFieldAvailability({
    enabled: isModalOpen && cleanPhoneCheck.replace(/\D/g, '').length >= 10,
    field: 'contact_number',
    value: cleanPhoneCheck,
    minLength: 10,
    fallbackMessage: 'This mobile number is already assigned to another staff account.',
    excludeTeacherId: editingUser?.teacher_id ?? undefined,
    excludeUserId: editingUser?.id,
  });

  const liveErrors = {
    username: usernameAvail.error || undefined,
    employee_id: empAvail.error || undefined,
    email: emailAvail.error || undefined,
    contact_number: phoneAvail.error || undefined,
    password: passwordFmtErr || undefined,
  };
  const fieldVerified = {
    username: usernameAvail.verified,
    employee_id: empAvail.verified,
    email: emailAvail.verified,
    contact_number: phoneAvail.verified,
  };
  const hasLiveErrors = Boolean(
    liveErrors.username ||
      liveErrors.employee_id ||
      liveErrors.email ||
      liveErrors.contact_number ||
      liveErrors.password
  );
  const isCheckingFields =
    usernameAvail.checking || empAvail.checking || emailAvail.checking || phoneAvail.checking;

  const handleCopy = async (text: string, id: string) => {
    if (!text) return;
    await copy(text, id);
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

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData(INITIAL_FORM);
    setPhotoPreview(null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: SystemUser) => {
    const rawRole = (user.current_role || user.role || 'TEACHER').toUpperCase();
    const isTeach =
      user.can_handle_classes !== undefined
        ? Boolean(user.can_handle_classes)
        : user.is_teaching !== undefined
          ? Boolean(user.is_teaching)
          : user.can_teach !== undefined
            ? Boolean(user.can_teach)
            : true;

    const safeRole = RBAC_ROLES.some((r) => r.value === rawRole) ? rawRole : 'TEACHER';
    const phoneVal = user.phone_number || user.contact_number || '';
    const existingPic = user.photo_url || user.photo || null;

    setEditingUser(user);
    setFormData({
      username: user.username || '',
      employee_id: user.employee_id || user.username || '',
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      suffix: user.suffix || '',
      email: user.email || '',
      contact_number: phoneVal,
      department: user.department || 'Junior High School',
      position: user.position || 'Teacher I',
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
    if (saving || isCheckingFields) return;

    if (hasLiveErrors) {
      showAlert({
        title: 'Form Notice',
        message:
          liveErrors.username ||
          liveErrors.employee_id ||
          liveErrors.email ||
          liveErrors.contact_number ||
          liveErrors.password ||
          'Please fix the highlighted errors.',
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
        department: sanitizeInput(formData.department, 100),
        position: sanitizeInput(formData.position, 100),
        role: formData.role,
        can_handle_classes: formData.is_teaching,
        is_teaching: formData.is_teaching,
        is_active: formData.is_active,
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim().slice(0, 128);
      }

      if (formData.photo !== null) {
        if (formData.photo === '') {
          payload.photo = null;
          payload.remove_photo = true;
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
              ? 'This teacher now appears in the Teachers tab.'
              : 'Account is active for web and mobile login.'
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
      message: `Permanently delete account "@${user.username}"? Associated teacher and class list assignments will be unlinked.`,
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
        matchesTeaching = Boolean(u.can_handle_classes ?? u.is_teaching ?? u.can_teach);
      } else if (teachingFilter === 'CANT_TEACH') {
        matchesTeaching = !Boolean(u.can_handle_classes ?? u.is_teaching ?? u.can_teach);
      }

      return matchesSearch && matchesRole && matchesTeaching;
    });
  }, [users, search, roleFilter, teachingFilter]);

  const { activeCount, canTeachCount, cantTeachCount } = useMemo(() => {
    let active = 0;
    let teach = 0;
    for (const u of users) {
      if (u.is_active) active += 1;
      if (u.can_handle_classes ?? u.is_teaching ?? u.can_teach) teach += 1;
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
          label="TOTAL REGISTERED ACCOUNTS"
          value={users.length}
          helpText="Teachers & school leadership accounts"
        />
        <StatsCard
          label="CLASSROOM TEACHERS"
          value={canTeachCount}
          valueColor={brand.primary}
          helpText="Visible in Teachers tab & class schedules"
        />
        <StatsCard
          label="NON-TEACHING ACCOUNTS"
          value={cantTeachCount}
          valueColor={tokens.textSecondary}
          helpText="Principals & administrative accounts"
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
            <option value="CAN_TEACH">Handles Classes</option>
            <option value="CANT_TEACH">Non-Teaching</option>
          </select>
        </div>

        {canEditUsers && (
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={handleOpenCreate}
            icon={<Plus size={15} />}
          >
            Register Account
          </Button>
        )}
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
          subtitle="Manage accounts for Teachers, Department Heads, Principals, and System Administrators."
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
              header: 'Role & Teaching Access',
              render: (u) => {
                const canTeach = Boolean(u.can_handle_classes ?? u.is_teaching ?? u.can_teach);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...ui.badge(tokens.primaryLight, brand.primary), width: 'fit-content' }}>
                      <Shield size={11} /> {u.current_role || u.role || 'TEACHER'}
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
                      {canTeach ? 'Handles Classes' : 'Non-Teaching'}
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
                    <Briefcase size={12} color={brand.primary} /> {u.position || 'Teacher I'}
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
                return (
                  <div>
                    <div style={{ fontSize: '0.74rem', color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Phone size={11} color={tokens.textMuted} /> {phone || '—'}
                    </div>
                    <div style={{ fontSize: '0.70rem', color: brand.success, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Smartphone size={11} /> Mobile App &amp; Web Portal
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
                if (!canEditUsers) return null;
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

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => promptDelete(u)}
                        title="Delete Account"
                        aria-label={`Delete user ${u.username}`}
                        style={{
                          ...ui.btnSecondary,
                          padding: '5px 7px',
                          backgroundColor: tokens.dangerLight,
                          borderColor: brand.danger,
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={13} color={brand.danger} />
                      </button>
                    )}
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
        title={editingUser ? `Edit Account: @${editingUser.username}` : 'Register Account'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AvatarUploadField
            previewUrl={photoPreview}
            displayName={`${formData.first_name} ${formData.last_name}`.trim() || formData.username || 'User'}
            label="Profile Picture"
            size={56}
            disabled={saving}
            onSelectPhoto={(_file, dataUri) => {
              setPhotoPreview(dataUri);
              setFormData((prev) => ({ ...prev, photo: dataUri }));
            }}
            onRemovePhoto={() => {
              setPhotoPreview(null);
              setFormData((p) => ({ ...p, photo: '' }));
            }}
            onValidationError={(msg) => showAlert({ title: 'Invalid Image', message: msg, type: 'error' })}
          />

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
                    : fieldVerified.username
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
                style={{
                  ...ui.input,
                  borderColor: liveErrors.employee_id
                    ? brand.danger
                    : fieldVerified.employee_id
                      ? brand.success
                      : tokens.borderStrong,
                }}
                placeholder="Enter employee ID"
              />
              {liveErrors.employee_id && <span style={errorTextStyle}>{liveErrors.employee_id}</span>}
            </div>
          </div>

          <StaffNameFields
            values={formData}
            onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
            idPrefix="user"
          />

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
                  borderColor: liveErrors.email
                    ? brand.danger
                    : fieldVerified.email
                      ? brand.success
                      : tokens.borderStrong,
                }}
                placeholder="Enter email address"
              />
              {liveErrors.email && <span style={errorTextStyle}>{liveErrors.email}</span>}
            </div>
            <StaffContactField
              id="user-contact"
              maxLength={20}
              placeholder="Enter 11-digit mobile number"
              value={formData.contact_number}
              onChange={(val) => setFormData((prev) => ({ ...prev, contact_number: val }))}
              error={liveErrors.contact_number}
              verified={fieldVerified.contact_number}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={ui.label}>System Role *</label>
              <select
                value={formData.role}
                onChange={(e) => {
                  const newRole = e.target.value;
                  const canTeachDefault = newRole === 'TEACHER' || newRole === 'DEPT_HEAD';
                  setFormData({
                    ...formData,
                    role: newRole,
                    is_teaching: canTeachDefault ? true : formData.is_teaching,
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

          <StaffTeachingToggle
            variant="card"
            checked={formData.is_teaching}
            onChange={(checked) => setFormData((prev) => ({ ...prev, is_teaching: checked }))}
          />

          <StaffDepartmentPositionFields
            department={formData.department}
            position={formData.position}
            onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
            departmentOptions={DEPARTMENTS_LIST}
            positionOptions={POSITIONS_LIST}
            order="department-first"
            idPrefix="user"
          />

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
              disabled={saving || hasLiveErrors || isCheckingFields}
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
