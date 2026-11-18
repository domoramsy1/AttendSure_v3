/**
 * AttendSure - Users & Security Access Management
 * File: web/src/components/tabs/UsersTab.tsx
 *
 * Architecture & Cybersecurity:
 * 1. Single Point Registration: All staff, faculty, leadership, and parents are enrolled here.
 * 2. Automated Directory Filtering: Users with "Can Teach" enabled automatically appear
 *    in the Faculty tab; non-teaching users show only in the Users tab.
 * 3. Mobile App & Portal Integration: Links mobile phone numbers for parent push alerts and app linking.
 * 4. Password Security: Passwords hashed securely on the server with real-time complexity checks.
 * 5. Simple English Terms: Clean labels with Lucide SVG icons (zero mock data).
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

export const UsersTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();
  const currentLoggedUsername = (localStorage.getItem('attendsure_username') || '').trim().toLowerCase();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
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

  const [liveErrors, setLiveErrors] = useState<{
    username?: string;
    email?: string;
    password?: string;
  }>({});
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  // Real-time field validation
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

  // Real-time server check for username availability
  useEffect(() => {
    const cleanUser = formData.username.trim();
    if (!isModalOpen || cleanUser.length < 3 || /\s/.test(cleanUser)) return;

    const timer = setTimeout(async () => {
      try {
        setIsCheckingUsername(true);
        const res = await apiClient.get('/auth/validate/', {
          params: {
            field: 'username',
            value: cleanUser,
            exclude_id: editingUser?.id,
          },
        });
        if (res.data?.is_taken) {
          setLiveErrors((prev) => ({ ...prev, username: res.data.message || 'Username already taken.' }));
        } else {
          setLiveErrors((prev) => ({
            ...prev,
            username: prev.username?.includes('already') ? undefined : prev.username,
          }));
        }
      } catch {
      } finally {
        setIsCheckingUsername(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formData.username, editingUser, isModalOpen]);

  const hasLiveErrors = Boolean(liveErrors.username || liveErrors.email || liveErrors.password);

  const handleCopy = async (text: string, id: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  };

  const fetchUsers = useCallback(async (query = '', silent = false) => {
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }
    const controller = new AbortController();
    activeAbortController.current = controller;

    try {
      if (!silent) setLoading(true);
      setError(null);

      const res = await apiClient.get('/users/', {
        params: { search: query.trim() || undefined, page_size: 'ALL' },
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
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (!silent) {
        setError('Unable to load user accounts. Administrator permissions required.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchUsers(search, false), 300);
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
      const b64 = reader.result as string;
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
    const phoneVal = user.phone_number || user.contact_number || '';

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
      department: user.department || (rawRole === 'PARENT' ? 'Parent / Guardian' : 'Junior High School'),
      position: user.position || (rawRole === 'PARENT' ? 'Parent / Guardian' : 'Faculty I'),
      role: effectiveRole,
      is_teaching: isTeach,
      is_active: user.is_active ?? true,
      password: '',
      photo: null,
    });
    setPhotoPreview(user.photo_url || user.photo || null);
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasLiveErrors) {
      showAlert({
        title: 'Form Notice',
        message: 'Please resolve the highlighted field errors before saving.',
        type: 'error',
      });
      return;
    }

    const cleanUsername = formData.username.trim().replace(/\s+/g, '');
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
    const cleanPhone = formData.contact_number.trim();

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        username: cleanUsername,
        employee_id: (formData.employee_id.trim() || cleanUsername).toUpperCase(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim(),
        last_name: formData.last_name.trim(),
        suffix: formData.suffix.trim(),
        email: formData.email.trim().toLowerCase(),
        contact_number: cleanPhone,
        phone_number: cleanPhone,
        department: isParentRole ? 'Parent / Guardian' : formData.department.trim(),
        position: isParentRole ? 'Parent / Guardian' : formData.position.trim(),
        role: formData.role,
        is_teaching: isParentRole ? false : formData.is_teaching,
        is_active: formData.is_active,
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim();
      }

      if (formData.photo !== null) {
        payload.photo = formData.photo === '' ? null : formData.photo;
      }

      if (editingUser) {
        await apiClient.put(`/users/${editingUser.id}/`, payload);
        showAlert({
          title: 'Account Saved',
          message: `Saved updates for @${cleanUsername}. Role and permissions are now synced.`,
          type: 'success',
        });
      } else {
        await apiClient.post('/users/', payload);
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
      fetchUsers(search, true);
    } catch (err: any) {
      const errMsg =
        err.response?.data?.username?.[0] ||
        err.response?.data?.employee_id?.[0] ||
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Failed to save user account.';
      showAlert({
        title: 'Save Failed',
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
          await apiClient.delete(`/users/${user.id}/`);
          setUsers((prev) => prev.filter((u) => u.id !== user.id));
          showAlert({
            title: 'Account Removed',
            message: `User @${user.username} was deleted.`,
            type: 'info',
          });
        } catch {
          showAlert({
            title: 'Delete Error',
            message: 'Unable to delete user account.',
            type: 'error',
          });
        }
      },
    });
  };

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      const phone = (u.phone_number || u.contact_number || '').toLowerCase();
      const matchesSearch =
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(12px, 2.5vw, 20px)' }}>
      {/* 1. System Account Summary */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL REGISTERED USERS</div>
          <div style={statValue}>{users.length}</div>
          <div style={statHelp}>Faculty, leaders &amp; parent accounts</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>CAN TEACH (IN FACULTY TAB)</div>
          <div style={{ ...statValue, color: '#004b87' }}>{canTeachCount}</div>
          <div style={statHelp}>Visible in Faculty tab &amp; class schedules</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>NON-TEACHING &amp; PARENTS</div>
          <div style={{ ...statValue, color: '#64748b' }}>{cantTeachCount}</div>
          <div style={statHelp}>Parents &amp; non-teaching accounts</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>ACTIVE ACCOUNTS</div>
          <div style={{ ...statValue, color: '#059669' }}>{activeCount}</div>
          <div style={statHelp}>Authorized for mobile &amp; web login</div>
        </div>
      </div>

      {/* 2. Control Bar with Filters & Add Button */}
      <div style={controlBar}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={selectPill}
          >
            <option value="">All Roles</option>
            {RBAC_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <select
            value={teachingFilter}
            onChange={(e) => setTeachingFilter(e.target.value)}
            style={selectPill}
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
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: '#004b87', borderColor: '#004b87' }}
        >
          <Plus size={15} />
          Register User / Faculty
        </Button>
      </div>

      {/* 3. Main Users Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
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
                render: (u) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={avatarBox}>
                      {u.photo_url || u.photo ? (
                        <img src={u.photo_url || u.photo || ''} alt={u.username} style={avatarImg} />
                      ) : (
                        <User size={18} color="#94a3b8" />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.86rem' }}>
                        {u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                          ID: {u.employee_id || u.username}
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
                header: 'Role & Faculty Visibility',
                render: (u) => {
                  const canTeach = Boolean(u.is_teaching ?? u.can_teach);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ ...rolePillStyle, backgroundColor: '#eff6ff', color: '#004b87' }}>
                        <Shield size={11} /> {u.current_role || u.role || 'FACULTY'}
                      </span>
                      <span
                        style={{
                          ...rolePillStyle,
                          backgroundColor: canTeach ? '#ecfdf5' : '#f1f5f9',
                          color: canTeach ? '#047857' : '#64748b',
                          border: `1px solid ${canTeach ? '#a7f3d0' : '#e2e8f0'}`,
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
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.80rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Briefcase size={12} color="#004b87" /> {u.position || 'Faculty I'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Building size={12} color="#94a3b8" /> {u.department || 'Junior High School'}
                    </div>
                  </div>
                ),
              },
              {
                header: 'Contact & Mobile App',
                render: (u) => {
                  const phone = u.phone_number || u.contact_number || '';
                  const isParent = (u.role || '').toUpperCase() === 'PARENT';
                  return (
                    <div>
                      <div style={{ fontSize: '0.74rem', color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} color="#64748b" /> {phone || '—'}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: '#059669', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Smartphone size={11} /> {isParent ? 'Parent Mobile App' : 'Mobile QR & Web Portal'}
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
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.68rem',
                      fontWeight: 800,
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
                        title="Edit User & Permissions"
                        style={actionBtn}
                      >
                        <Pencil size={13} color="#004b87" />
                      </button>

                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => promptDelete(u)}
                        title={isSelf ? 'Cannot delete your active account' : 'Delete Account'}
                        style={{
                          ...actionBtn,
                          backgroundColor: '#fef2f2',
                          borderColor: '#fee2e2',
                          opacity: isSelf ? 0.35 : 1,
                          cursor: isSelf ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Trash2 size={13} color="#dc2626" />
                      </button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      </div>

      {/* 4. Registration & Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingUser ? `Edit User: @${editingUser.username}` : 'Register User / Faculty'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Photo Upload */}
          <div style={photoUploadContainer}>
            <div style={photoPreviewBox}>
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" style={photoPreviewImg} />
              ) : (
                <User size={28} color="#94a3b8" />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                Profile Picture
              </span>
              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                JPEG, PNG, or WebP under 2.5 MB.
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
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoPreview(null);
                      setFormData((p) => ({ ...p, photo: '' }));
                    }}
                    style={removePhotoBtn}
                  >
                    <X size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Credentials: Username & Employee ID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Username (Login ID) *</label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                style={{
                  ...inputStyle,
                  borderColor: liveErrors.username ? '#dc2626' : formData.username.length >= 3 ? '#059669' : '#cbd5e1',
                }}
                placeholder="Enter login username"
              />
              {liveErrors.username && <span style={errorTextStyle}>{liveErrors.username}</span>}
            </div>

            <div>
              <label style={labelStyle}>Employee or Account ID *</label>
              <input
                type="text"
                required
                value={formData.employee_id}
                onChange={(e) => setFormData({ ...formData, employee_id: e.target.value.toUpperCase() })}
                style={inputStyle}
                placeholder="Enter employee ID"
              />
            </div>
          </div>

          {/* Full Name Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
                placeholder="First name"
              />
            </div>
            <div>
              <label style={labelStyle}>Middle Name</label>
              <input
                type="text"
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                style={inputStyle}
                placeholder="Optional"
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={inputStyle}
                placeholder="Last name"
              />
            </div>
            <div>
              <label style={labelStyle}>Suffix</label>
              <input
                type="text"
                value={formData.suffix}
                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                style={inputStyle}
                placeholder="Jr., III..."
              />
            </div>
          </div>

          {/* Contact Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
            <div>
              <label style={labelStyle}>Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={inputStyle}
                placeholder="Enter email address"
              />
            </div>
            <div>
              <label style={labelStyle}>Mobile Phone Number (For App Alerts &amp; Parent Linking)</label>
              <input
                type="text"
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                style={inputStyle}
                placeholder="Enter 11-digit mobile number"
              />
            </div>
          </div>

          {/* Role & Teaching Clearance */}
          <div>
            <label style={labelStyle}>System Role *</label>
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
              style={inputStyle}
            >
              {RBAC_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* "Can Teach" Checkbox (Hidden for Parent role) */}
          {formData.role !== 'PARENT' && (
            <label style={teachingCardStyle(formData.is_teaching)}>
              <input
                type="checkbox"
                checked={formData.is_teaching}
                onChange={(e) => setFormData({ ...formData, is_teaching: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: '#004b87', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '0.80rem', fontWeight: 800, color: formData.is_teaching ? '#004b87' : '#0f172a' }}>
                  Can Teach Classes (Visible in Faculty Tab &amp; Schedules)
                </span>
                <span style={{ fontSize: '0.70rem', color: '#64748b' }}>
                  {formData.is_teaching
                    ? 'Active: This faculty member will appear in the Faculty tab, sections, and class schedules.'
                    : 'Inactive: Non-teaching user. Will appear only in the Users tab.'}
                </span>
              </div>
            </label>
          )}

          {/* Department & Position */}
          {formData.role !== 'PARENT' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={labelStyle}>Department</label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  style={inputStyle}
                >
                  {DEPARTMENTS_LIST.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Official Position / Title</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  style={inputStyle}
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

          {/* Password */}
          <div>
            <label style={labelStyle}>
              {editingUser ? 'Reset Password (Optional, min 8 chars)' : 'Initial Password (Min 8 chars) *'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required={!editingUser}
                minLength={8}
                placeholder={editingUser ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ ...inputStyle, paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={eyeToggleBtn}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
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
              style={{ backgroundColor: '#004b87', borderColor: '#004b87' }}
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
  padding: '12px 16px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  color: '#64748b',
  marginBottom: 4,
  letterSpacing: '0.4px',
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
  marginTop: 3,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 10,
};

const selectPill: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: '0.78rem',
  color: '#334155',
  outline: 'none',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
};

const avatarBox: React.CSSProperties = {
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

const rolePillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 7px',
  borderRadius: 10,
  fontSize: '0.68rem',
  fontWeight: 700,
  width: 'fit-content',
};

const actionBtn: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '5px 7px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const teachingCardStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 12px',
  backgroundColor: isActive ? '#f0f9ff' : '#f8fafc',
  borderRadius: 8,
  border: `1.5px solid ${isActive ? '#004b87' : '#cbd5e1'}`,
  cursor: 'pointer',
});

const photoUploadContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 12px',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};

const photoPreviewBox: React.CSSProperties = {
  width: 52,
  height: 52,
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
  backgroundColor: '#004b87',
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
  padding: '4px 8px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.70rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const eyeToggleBtn: React.CSSProperties = {
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
};

const errorTextStyle: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#dc2626',
  fontWeight: 600,
  marginTop: 3,
  display: 'block',
};

export default UsersTab;