/**
 * AttendSure - User Accounts & Role-Based Access Control (RBAC)
 * File: frontend/src/components/tabs/UsersTab.tsx
 *
 * Key Capabilities:
 * 1. Explicit support for Admin, Faculty/Admin, Principal, Dept Head, Faculty, and Guard.
 * 2. Dual-Role toggle lets Principals, Dept Heads, and Admins also teach classes.
 * 3. Live field validation (username availability, email format, password complexity).
 * 4. Self-lockout guard prevents the active admin from deleting or suspending their own account.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
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
  Mail,
  Eye,
  EyeOff,
  Lock,
  Copy,
  Check,
  BookOpen,
  CheckCircle2,
  Clock,
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SystemUser {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  current_role?: string;
  role_display?: string;
  is_teaching?: boolean;
  can_teach?: boolean;
  is_profile_completed?: boolean;
  faculty_id?: number | null;
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

// Standardized RBAC Security Roles (Including Faculty / Admin Dual Role)
const RBAC_ROLES = [
  { value: 'ADMIN', label: 'System Administrator', color: '#6366f1', bg: '#e0e7ff' },
  { value: 'FACULTY_ADMIN', label: 'Faculty / System Admin (Dual Role)', color: '#4f46e5', bg: '#eef2ff' },
  { value: 'PRINCIPAL', label: 'School Principal', color: '#059669', bg: '#d1fae5' },
  { value: 'DEPT_HEAD', label: 'Department Head', color: '#0284c7', bg: '#e0f2fe' },
  { value: 'FACULTY', label: 'Classroom Faculty / Teacher', color: '#0d9488', bg: '#ccfbf1' },
  { value: 'GUARD', label: 'Gate Security / Guard', color: '#d97706', bg: '#fef3c7' },
];

const INITIAL_FORM = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  role: 'FACULTY',
  is_teaching: true,
  is_active: true,
  password: '',
  photo: null as string | null,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UsersTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();

  // Active logged-in username to prevent self-deletion
  const currentLoggedUsername = (localStorage.getItem('attendsure_username') || '').trim().toLowerCase();

  // --- Table & Filter State ---
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  // --- CRUD Modal Dialog States ---
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAbortController = useRef<AbortController | null>(null);
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = isModalOpen;

  // --- Live Validation State ---
  const [liveErrors, setLiveErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
  }>({});
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  // 1. Live Format & Password Strength Check (Instant as you type)
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

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
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

  // 2. Live Database Duplicate Check for Username (Debounced 400ms)
  useEffect(() => {
    const cleanUser = formData.username.trim();
    if (!isModalOpen || cleanUser.length < 3 || /\s/.test(cleanUser)) return;

    const timer = setTimeout(async () => {
      try {
        setIsCheckingUsername(true);
        const res = await apiClient.get('/validate-field/', {
          params: {
            field: 'username',
            value: cleanUser,
            exclude_id: editingUser?.id,
          },
        });
        if (!res.data.valid) {
          setLiveErrors((prev) => ({ ...prev, username: res.data.message }));
        } else {
          setLiveErrors((prev) => ({
            ...prev,
            username: prev.username?.includes('already') ? undefined : prev.username,
          }));
        }
      } catch {
        // Ignore network errors during silent check
      } finally {
        setIsCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formData.username, editingUser, isModalOpen]);

  const hasLiveErrors = Boolean(liveErrors.username || liveErrors.email || liveErrors.password);

  // ============================================================================
  // CLIPBOARD HELPER
  // ============================================================================

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

  // ============================================================================
  // DATABASE DATA FETCHING & LIVE POLLING
  // ============================================================================

  const fetchUsers = useCallback(async (query = '', silent = false) => {
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }
    const controller = new AbortController();
    activeAbortController.current = controller;

    try {
      if (!silent) setLoading(true);
      setError(null);

      const res = await apiClient.get<PaginatedResponse<SystemUser> | SystemUser[]>('/users/', {
        params: {
          search: query.trim() || undefined,
        },
        signal: controller.signal,
      });

      const raw = res.data;
      const items: SystemUser[] = Array.isArray(raw)
        ? raw
        : raw && 'results' in raw && Array.isArray(raw.results)
        ? raw.results
        : [];
      setUsers(items);
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }
      if (!silent) {
        setError('Unable to load user accounts. System Administrator privileges are required.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchUsers(search, false), 300);
    return () => clearTimeout(timeout);
  }, [search, fetchUsers]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchUsers(search, true);
      }
    }, 3000);

    return () => clearInterval(liveInterval);
  }, [search, fetchUsers]);

  // ============================================================================
  // PHOTO UPLOAD HANDLER
  // ============================================================================

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAlert({
        title: 'Unsupported Image Format',
        message: 'Only JPG, PNG, and WebP images are permitted.',
        type: 'error',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      showAlert({
        title: 'File Too Large',
        message: 'Profile picture must be 2.5 MB or smaller.',
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

  // ============================================================================
  // CRUD ACTIONS
  // ============================================================================

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData(INITIAL_FORM);
    setLiveErrors({});
    setPhotoPreview(null);
    setShowPassword(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: SystemUser) => {
    const rawRole = (user.current_role || user.role || 'FACULTY').toUpperCase();
    const isTeach =
      user.is_teaching !== undefined
        ? Boolean(user.is_teaching)
        : user.can_teach !== undefined
        ? Boolean(user.can_teach)
        : rawRole !== 'GUARD' && rawRole !== 'ADMIN';

    const effectiveDropdownRole =
      rawRole === 'ADMIN' && isTeach ? 'FACULTY_ADMIN' : rawRole;

    setEditingUser(user);
    setLiveErrors({});
    setFormData({
      username: user.username || '',
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: effectiveDropdownRole,
      is_teaching: isTeach,
      is_active: user.is_active ?? true,
      password: '',
      photo: null,
    });
    setPhotoPreview(user.photo_url || user.photo || null);
    setShowPassword(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasLiveErrors) {
      showAlert({
        title: 'Validation Error',
        message: 'Please resolve the highlighted field errors before saving.',
        type: 'error',
      });
      return;
    }

    const cleanUsername = formData.username.trim().replace(/\s+/g, '');
    if (!cleanUsername) {
      showAlert({
        title: 'Invalid Username',
        message: 'Username cannot be empty or contain spaces.',
        type: 'error',
      });
      return;
    }

    if (!editingUser && formData.password.trim().length < 8) {
      showAlert({
        title: 'Weak Password',
        message: 'Initial password must be at least 8 characters long.',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const isFacultyAdmin = formData.role === 'FACULTY_ADMIN';
      const finalBackendRole = isFacultyAdmin ? 'ADMIN' : formData.role;
      const finalIsTeaching =
        isFacultyAdmin || formData.role === 'FACULTY'
          ? true
          : formData.role === 'GUARD'
          ? false
          : formData.is_teaching;

      const payload: Record<string, any> = {
        username: cleanUsername,
        email: formData.email.trim().toLowerCase(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        role: finalBackendRole,
        is_teaching: finalIsTeaching,
        is_active: formData.is_active,
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim();
      }

      if (formData.photo !== null) {
        payload.photo = formData.photo === '' ? null : formData.photo;
      }

      if (editingUser) {
        const res = await apiClient.put<SystemUser>(`/users/${editingUser.id}/`, payload);
        setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? res.data : u)));
        showAlert({
          title: 'Account Updated',
          message: `Saved changes for @${cleanUsername}.`,
          type: 'success',
        });
      } else {
        const res = await apiClient.post<SystemUser>('/users/', payload);
        setUsers((prev) => [res.data, ...prev]);
        showAlert({
          title: 'User Created & Synced to Faculty',
          message: `Account @${cleanUsername} created. It now reflects in the Faculty tab, and the user will complete their profile upon first login.`,
          type: 'success',
        });
      }
      setIsModalOpen(false);
      fetchUsers(search, true);
    } catch (err: any) {
      const errMsg =
        err.response?.data?.username?.[0] ||
        err.response?.data?.password?.[0] ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.detail ||
        err.response?.data?.error ||
        'Failed to save user account.';
      showAlert({
        title: 'Operation Failed',
        message: errMsg,
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const promptDelete = (user: SystemUser) => {
    if (user.username.trim().toLowerCase() === currentLoggedUsername) {
      showAlert({
        title: 'Action Blocked',
        message: 'You cannot delete your own active administrator account.',
        type: 'error',
      });
      return;
    }

    showConfirm({
      title: 'Delete System Account',
      message: `Permanently delete user account "@${user.username}"?`,
      confirmLabel: 'Delete Account',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/users/${user.id}/`);
          setUsers((prev) => prev.filter((u) => u.id !== user.id));
          showAlert({
            title: 'Account Deleted',
            message: `User @${user.username} has been removed.`,
            type: 'info',
          });
        } catch (err: any) {
          showAlert({
            title: 'Delete Failed',
            message: err?.response?.data?.detail || 'Failed to delete user account.',
            type: 'error',
          });
        }
      },
    });
  };

  const getRoleBadge = (user: SystemUser) => {
    const baseRole = (user.role || 'FACULTY').toUpperCase();
    const isTeach = Boolean(user.is_teaching ?? user.can_teach ?? baseRole === 'FACULTY');
    const lookupRole = baseRole === 'ADMIN' && isTeach ? 'FACULTY_ADMIN' : baseRole;

    const matched = RBAC_ROLES.find((r) => r.value === lookupRole) || {
      label: lookupRole,
      color: '#475569',
      bg: '#f1f5f9',
    };

    const showSecondaryFacultyBadge =
      (baseRole === 'PRINCIPAL' || baseRole === 'DEPT_HEAD') && isTeach;

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 9px',
            borderRadius: 12,
            fontSize: '0.72rem',
            fontWeight: 800,
            color: matched.color,
            backgroundColor: matched.bg,
            border: `1px solid ${matched.color}30`,
          }}
        >
          <Shield size={11} color={matched.color} />
          {matched.label}
        </span>

        {showSecondaryFacultyBadge && (
          <span
            title="Holds dual role: Leadership + Classroom Faculty"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 10,
              fontSize: '0.68rem',
              fontWeight: 700,
              color: '#0d9488',
              backgroundColor: '#f0fdfa',
              border: '1px solid #99f6e4',
            }}
          >
            <BookOpen size={10} color="#0d9488" />
            + Faculty
          </span>
        )}
      </div>
    );
  };

  // Client-side search and role filter
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
    const matchesSearch =
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      name.includes(q);

    if (!roleFilter) return matchesSearch;

    const baseRole = (u.role || 'FACULTY').toUpperCase();
    const isTeach = Boolean(u.is_teaching ?? u.can_teach ?? baseRole === 'FACULTY');
    const effectiveRole = baseRole === 'ADMIN' && isTeach ? 'FACULTY_ADMIN' : baseRole;

    if (roleFilter === 'FACULTY') {
      return matchesSearch && (effectiveRole === 'FACULTY' || isTeach);
    }
    return matchesSearch && (effectiveRole === roleFilter || baseRole === roleFilter);
  });

  // Telemetry Counters
  const activeCount = users.filter((u) => u.is_active).length;
  const leadershipCount = users.filter((u) =>
    ['ADMIN', 'FACULTY_ADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes((u.current_role || u.role || '').toUpperCase())
  ).length;
  const pendingProfileCount = users.filter((u) => u.is_profile_completed === false).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Telemetry Summary Cards */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL SYSTEM ACCOUNTS</div>
          <div style={statValue}>{users.length}</div>
          <div style={statHelp}>Linked to Faculty &amp; Staff Directory</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>ACTIVE ACCOUNTS</div>
          <div style={{ ...statValue, color: '#059669' }}>{activeCount}</div>
          <div style={statHelp}>Authorized for portal &amp; mobile login</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>ADMIN, PRINCIPAL &amp; DEPT HEAD</div>
          <div style={{ ...statValue, color: '#0284c7' }}>{leadershipCount}</div>
          <div style={statHelp}>Includes dual-role Faculty / Admin users</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>PENDING PROFILE SETUP</div>
          <div style={{ ...statValue, color: '#d97706' }}>{pendingProfileCount}</div>
          <div style={statHelp}>Awaiting user completion on login</div>
        </div>
      </div>

      {/* 2. Header Control Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={selectPill}
          >
            <option value="">All Security Roles</option>
            {RBAC_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="primary"
          size="md"
          type="button"
          onClick={handleOpenCreate}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} />
          Add User Account
        </Button>
      </div>

      {/* 3. Main Users Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="User Accounts & Security"
          subtitle="Create accounts for Admin, Faculty/Admin, Principal, Dept Head, and Faculty. Created users automatically appear in the Faculty tab."
          searchPlaceholder="Search by username, full name, or email..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          error={error}
          data={filteredUsers}
          keyExtractor={(u) => u.id}
          columns={[
            {
              header: 'User Identity',
              render: (u) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={avatarBox}>
                    {u.photo_url || u.photo ? (
                      <img
                        src={u.photo_url || u.photo || ''}
                        alt={u.username}
                        style={avatarImg}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <User size={20} color="#94a3b8" />
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                      {u.first_name || u.last_name
                        ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                        : u.username}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace' }}>
                        @{u.username}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(u.username, `user-${u.id}`)}
                        title="Copy Username"
                        style={copyMiniBtn}
                      >
                        {copiedKey === `user-${u.id}` ? <Check size={11} color="#059669" /> : <Copy size={11} color="#94a3b8" />}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Email Address',
              render: (u) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', color: '#334155' }}>
                  <Mail size={13} color="#64748b" />
                  {u.email ? (
                    <span>{u.email}</span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Pending user setup</span>
                  )}
                </div>
              ),
            },
            {
              header: 'Security Role & Duties',
              render: (u) => getRoleBadge(u),
            },
            {
              header: 'Profile Setup',
              render: (u) => {
                const completed = u.is_profile_completed ?? Boolean(u.first_name && u.last_name);
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: completed ? '#059669' : '#d97706',
                    }}
                  >
                    {completed ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                    {completed ? 'Completed' : 'Pending User Setup'}
                  </span>
                );
              },
            },
            {
              header: 'Status',
              render: (u) => (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 12,
                    fontSize: '0.70rem',
                    fontWeight: 800,
                    letterSpacing: '0.3px',
                    backgroundColor: u.is_active ? '#ecfdf5' : '#fef2f2',
                    color: u.is_active ? '#059669' : '#dc2626',
                    border: `1px solid ${u.is_active ? '#a7f3d0' : '#fecaca'}`,
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
                      title="Edit User & Role"
                      style={{ ...actionBtn, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
                    >
                      <Pencil size={13} color="#0284c7" />
                    </button>

                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => promptDelete(u)}
                      title={isSelf ? 'Cannot delete your own active account' : 'Delete User'}
                      style={{
                        ...actionBtn,
                        backgroundColor: '#fff1f2',
                        borderColor: '#fecdd3',
                        opacity: isSelf ? 0.35 : 1,
                        cursor: isSelf ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={13} color="#e11d48" />
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      </div>

      {/* 4. MODAL: CREATE & EDIT USER (WITH LIVE VALIDATION) */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Edit Account: @${editingUser.username}` : 'Create System Account'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Portrait Photo Upload Area */}
          <div style={photoUploadContainer}>
            <div style={photoPreviewBox}>
              {photoPreview ? (
                <img src={photoPreview} alt="Avatar Preview" style={photoPreviewImg} />
              ) : (
                <User size={30} color="#94a3b8" />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0f172a' }}>
                Profile Picture (Optional)
              </span>
              <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                User can also upload their own photo when completing their profile.
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
                    <X size={13} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Username / Employee ID with Live Validation */}
          <div>
            <label style={labelStyle}>Username / Employee ID *</label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={{
                ...inputStyle,
                borderColor: liveErrors.username ? '#dc2626' : formData.username.length >= 3 ? '#059669' : '#cbd5e1',
              }}
              placeholder="e.g. EMP-2026-001 or maria_santos"
            />
            {isCheckingUsername && (
              <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3, display: 'block' }}>
                Checking availability...
              </span>
            )}
            {!isCheckingUsername && liveErrors.username && (
              <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, marginTop: 3, display: 'block' }}>
                {liveErrors.username}
              </span>
            )}
            {!isCheckingUsername && !liveErrors.username && formData.username.length >= 3 && (
              <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, marginTop: 3, display: 'block' }}>
                ✓ Username is available
              </span>
            )}
          </div>

          {/* First & Last Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name (User can complete later)</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
                placeholder="First name"
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name (User can complete later)</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={inputStyle}
                placeholder="Last name"
              />
            </div>
          </div>

          {/* Email Address with Live Validation */}
          <div>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Mail size={12} color="#64748b" /> Email Address
              </span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{
                ...inputStyle,
                borderColor: liveErrors.email ? '#dc2626' : '#cbd5e1',
              }}
              placeholder="user@attendsure.edu.ph"
            />
            {liveErrors.email && (
              <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, marginTop: 3, display: 'block' }}>
                {liveErrors.email}
              </span>
            )}
          </div>

          {/* Security Role */}
          <div>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Shield size={12} color="#0284c7" /> RBAC Permission Tier *
              </span>
            </label>
            <select
              value={formData.role}
              onChange={(e) => {
                const newRole = e.target.value;
                setFormData({
                  ...formData,
                  role: newRole,
                  is_teaching:
                    newRole === 'FACULTY' || newRole === 'FACULTY_ADMIN'
                      ? true
                      : newRole === 'GUARD' || newRole === 'ADMIN'
                      ? false
                      : true,
                });
              }}
              style={inputStyle}
            >
              {RBAC_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dual-Role Checkbox for Principal, Dept Head, or Admin */}
          {(formData.role === 'PRINCIPAL' || formData.role === 'DEPT_HEAD' || formData.role === 'ADMIN') && (
            <label style={checkboxCard}>
              <input
                type="checkbox"
                checked={formData.is_teaching}
                onChange={(e) => setFormData({ ...formData, is_teaching: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: '#0284c7', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0f172a' }}>
                  Also serves as Classroom Faculty (Dual Role)
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Enables the "My Assigned Classes" tab for this {formData.role.replace('_', ' ')} so they can manage their own teaching load.
                </span>
              </div>
            </label>
          )}

          {/* Account Active / Suspended Switch (When Editing) */}
          {editingUser && editingUser.username.trim().toLowerCase() !== currentLoggedUsername && (
            <label style={checkboxCard}>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: '#059669', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#0f172a' }}>
                  Account Active (Permit Login)
                </span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Uncheck to suspend this user's access immediately while keeping their historical DTR and attendance records.
                </span>
              </div>
            </label>
          )}

          {/* Password Field with Show/Hide Toggle & Live Strength Indicator */}
          <div>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={12} color="#64748b" />{' '}
                {editingUser ? 'Reset Password (Optional, min 8 chars)' : 'Temporary Password (Min 8 chars) *'}
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required={!editingUser}
                minLength={8}
                placeholder={editingUser ? 'Leave blank to keep current password' : 'Minimum 8 characters (letters + numbers)'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{
                  ...inputStyle,
                  paddingRight: 38,
                  borderColor: liveErrors.password ? '#dc2626' : formData.password.length >= 8 ? '#059669' : '#cbd5e1',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {liveErrors.password && (
              <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, marginTop: 3, display: 'block' }}>
                {liveErrors.password}
              </span>
            )}
            {!liveErrors.password && formData.password.length >= 8 && (
              <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, marginTop: 3, display: 'block' }}>
                ✓ Strong password
              </span>
            )}
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
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              {editingUser ? 'Save Updates' : 'Create User Account'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UsersTab;

// ============================================================================
// STYLES
// ============================================================================

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '14px 16px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 4,
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
  marginTop: 4,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
};

const selectPill: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: '0.80rem',
  color: '#334155',
  outline: 'none',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
};

const avatarBox: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  backgroundColor: '#f1f5f9',
  border: '1px solid #e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const avatarImg: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
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
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const checkboxCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 12px',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  cursor: 'pointer',
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

const photoPreviewBox: React.CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: '50%',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
};

const photoPreviewImg: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const uploadBtnLabel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  backgroundColor: '#0284c7',
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
  padding: '5px 8px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.72rem',
  fontWeight: 600,
  cursor: 'pointer',
};