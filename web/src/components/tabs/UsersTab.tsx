/**
 * AttendSure V3 - User Accounts & Security
 * File: frontend/src/components/tabs/UsersTab.tsx
 *
 * Key Highlights:
 * 1. REAL PHOTOS ONLY: No colored circles or letter monograms. Displays real photo or neutral placeholder.
 * 2. FULL CRUD: Create system accounts, view role tiers, update credentials/photos, delete accounts.
 * 3. LIVE DATABASE SYNC: 3-second background polling updates active user accounts without browser refresh.
 * 4. MODERN ALERTS: Uses AlertContext and custom modal dialogs instead of window.alert / window.confirm.
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
  AlertTriangle,
  AlertCircle,
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

// Standardized RBAC Security Roles
const RBAC_ROLES = [
  { value: 'ADMIN', label: 'System Administrator', color: '#6366f1', bg: '#e0e7ff' },
  { value: 'PRINCIPAL', label: 'School Principal', color: '#059669', bg: '#d1fae5' },
  { value: 'DEPT_HEAD', label: 'Department Head', color: '#0284c7', bg: '#e0f2fe' },
  { value: 'TEACHER', label: 'Faculty / Teacher', color: '#0d9488', bg: '#ccfbf1' },
  { value: 'GUARD', label: 'Gate Security / Guard', color: '#d97706', bg: '#fef3c7' },
];

const INITIAL_FORM = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  role: 'TEACHER',
  password: '',
  photo: null as string | null,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UsersTab: React.FC = () => {
  const { showAlert } = useAlert();

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

  // --- Custom Confirmation Dialog State (replaces window.confirm) ---
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    isDestructive: boolean;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    isDestructive: false,
    action: async () => {},
  });

  // Guard flag: prevents silent background polling from interrupting open modals
  const isInteracting = useRef<boolean>(false);
  isInteracting.current = isModalOpen || confirmDialog.isOpen;

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

  const fetchUsers = useCallback(
    async (query = '', roleVal = '', silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);

        const res = await apiClient.get<PaginatedResponse<SystemUser> | SystemUser[]>('/users/', {
          params: {
            search: query.trim() || undefined,
            role: roleVal || undefined,
          },
        });

        const raw = res.data;
        const items: SystemUser[] = Array.isArray(raw)
          ? raw
          : raw && 'results' in raw && Array.isArray(raw.results)
          ? raw.results
          : [];
        setUsers(items);
      } catch (err: any) {
        if (!silent) {
          setError(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to fetch user accounts. Admin access required.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  // Debounced search and role filter watcher
  useEffect(() => {
    const timeout = setTimeout(() => fetchUsers(search, roleFilter, false), 300);
    return () => clearTimeout(timeout);
  }, [search, roleFilter, fetchUsers]);

  // LIVE ZERO-REFRESH POLLING: Syncs fresh data from PostgreSQL every 3 seconds
  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchUsers(search, roleFilter, true);
      }
    }, 3000);

    return () => clearInterval(liveInterval);
  }, [search, roleFilter, fetchUsers]);

  // ============================================================================
  // PHOTO UPLOAD HANDLER (REAL PHOTOS ONLY)
  // ============================================================================

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAlert({
        title: 'Invalid Image Format',
        message: 'Only JPG, PNG, and WebP images are permitted.',
        type: 'error',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      showAlert({
        title: 'File Too Large',
        message: 'Profile picture must be smaller than 2.5 MB.',
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

  // --- 1. CREATE (Add User) ---
  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData(INITIAL_FORM);
    setPhotoPreview(null);
    setShowPassword(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  // --- 2. UPDATE (Edit User) ---
  const handleOpenEdit = (user: SystemUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username || '',
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.current_role || user.role || 'TEACHER',
      password: '',
      photo: user.photo || null,
    });
    setPhotoPreview(user.photo_url || user.photo || null);
    setShowPassword(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        role: formData.role,
      };

      if (formData.password) {
        payload.password = formData.password;
      }

      if (formData.photo !== null) {
        payload.photo = formData.photo;
      }

      if (editingUser) {
        const res = await apiClient.put<SystemUser>(`/users/${editingUser.id}/`, payload);
        setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? res.data : u)));
        showAlert({
          title: 'Account Updated',
          message: `Saved changes for user @${formData.username}.`,
          type: 'info',
        });
      } else {
        const res = await apiClient.post<SystemUser>('/users/', payload);
        setUsers((prev) => [res.data, ...prev]);
        showAlert({
          title: 'User Created',
          message: `System account @${formData.username} created successfully.`,
          type: 'info',
        });
      }
      setIsModalOpen(false);
      fetchUsers(search, roleFilter, true);
    } catch (err: any) {
      showAlert({
        title: 'Operation Failed',
        message: err.response?.data?.detail || err.response?.data?.error || 'Failed to save user account.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // --- 3. DELETE (Remove User) ---
  const promptDelete = (user: SystemUser) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete System Account',
      message: `Permanently delete user account "${user.username}"? This action cannot be undone.`,
      confirmLabel: 'Delete Account',
      isDestructive: true,
      action: async () => {
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

  const getRoleBadge = (roleCode?: string) => {
    const matched = RBAC_ROLES.find((r) => r.value === roleCode) || {
      label: roleCode || 'User',
      color: '#475569',
      bg: '#f1f5f9',
    };
    return (
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

    const matchesRole = roleFilter
      ? (u.current_role || u.role) === roleFilter
      : true;

    return matchesSearch && matchesRole;
  });

  return (
    <>
      {/* 1. Header Control Bar */}
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
          Add User
        </Button>
      </div>

      {/* 2. Main Users Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="User Accounts & Security"
          subtitle="Manage access roles, credentials, and institutional staff identity."
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
                  {/* REAL PHOTO ONLY: Neutral outline placeholder if missing */}
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
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
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
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unassigned</span>
                  )}
                </div>
              ),
            },
            {
              header: 'Security Role',
              render: (u) => getRoleBadge(u.current_role || u.role),
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
              render: (u) => (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {/* Edit User Account */}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(u)}
                    title="Edit User"
                    style={{ ...actionBtn, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
                  >
                    <Pencil size={13} color="#0284c7" />
                  </button>

                  {/* Delete Account */}
                  <button
                    type="button"
                    onClick={() => promptDelete(u)}
                    title="Delete User"
                    style={{ ...actionBtn, backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}
                  >
                    <Trash2 size={13} color="#e11d48" />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* 3. MODAL: CREATE & EDIT USER */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Edit Account: @${editingUser.username}` : 'Create System Account'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Real Portrait Photo Upload Area */}
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
                Profile Picture
              </span>
              <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                JPEG, PNG, or WebP under 2.5 MB. Stored directly to the media database.
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePhotoSelect}
                />
                <label
                  onClick={() => fileInputRef.current?.click()}
                  style={uploadBtnLabel}
                >
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

          {/* Username */}
          <div>
            <label style={labelStyle}>Username *</label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              style={inputStyle}
              placeholder="e.g. jdoe_admin"
            />
          </div>

          {/* First & Last Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
                placeholder="First name"
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={inputStyle}
                placeholder="Last name"
              />
            </div>
          </div>

          {/* Email Address */}
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
              style={inputStyle}
              placeholder="user@attendsure.edu.ph"
            />
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
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              style={inputStyle}
            >
              {RBAC_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Password Field */}
          <div>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={12} color="#64748b" /> Password {editingUser ? '(Leave blank to retain current)' : '*'}
              </span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required={!editingUser}
                placeholder={editingUser ? '••••••••' : 'Enter strong password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ ...inputStyle, paddingRight: 38 }}
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
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              {editingUser ? 'Save Updates' : 'Create User'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. MODAL: MODERN CONFIRMATION DIALOG */}
      <Modal
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        title={confirmDialog.title}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: confirmDialog.isDestructive ? '#fee2e2' : '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {confirmDialog.isDestructive ? (
                <AlertTriangle size={20} color="#dc2626" />
              ) : (
                <AlertCircle size={20} color="#0284c7" />
              )}
            </div>
            <div style={{ fontSize: '0.84rem', color: '#334155', lineHeight: 1.5, marginTop: 4 }}>
              {confirmDialog.message}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button
              variant="secondary"
              size="md"
              type="button"
              disabled={saving}
              onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="button"
              disabled={saving}
              onClick={async () => {
                await confirmDialog.action();
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              }}
              style={
                confirmDialog.isDestructive
                  ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }
                  : {}
              }
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : confirmDialog.confirmLabel}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default UsersTab;

// ============================================================================
// STYLES
// ============================================================================

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  marginBottom: 16,
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