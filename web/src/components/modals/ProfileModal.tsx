// AttendSure Web - Profile Modal
// File: D:\AttendSure_V3\web\src\components\modals\ProfileModal.tsx

/**
 * AttendSure - User Profile View & Edit Modal
 * File: web/src/components/modals/ProfileModal.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AvatarUploadField } from '../common/AvatarUploadField';
import { useAlert } from '../../context/AlertContext';
import { useFieldAvailability } from '../../hooks/useFieldAvailability';
import { Loader2 } from 'lucide-react';

export interface ProfileUpdatePayload {
  full_name?: string;
  photo?: string | null;
  photo_url?: string | null;
  token?: string;
  [key: string]: unknown;
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: ProfileUpdatePayload) => void;
}

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

const sanitizeField = (raw: string, maxLen = 100): string =>
  String(raw || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, maxLen);

const sanitizePassword = (raw: string): string =>
  String(raw || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 128);

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onProfileUpdated }) => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [profileIds, setProfileIds] = useState<{ userId?: number; teacherId?: number }>({});
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    email: '',
    contact_number: '',
    position: '',
    department: '',
    current_password: '',
    password: '',
    photo: null as string | null,
  });

  const mountedRef = useRef(true);
  const submitAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submitAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setLoading(true);
    apiClient
      .get(API_ROUTES.accounts.me, { params: { nocache: 1 }, signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted || !mountedRef.current || !res.data) return;
        const u = res.data;
        const pic = u.photo_url || u.photo || null;
        setProfileIds({
          userId: u.id ? Number(u.id) : undefined,
          teacherId: u.teacher_id ? Number(u.teacher_id) : undefined,
        });
        setFormData({
          first_name: sanitizeField(u.first_name || '', 100),
          middle_name: sanitizeField(u.middle_name || '', 100),
          last_name: sanitizeField(u.last_name || '', 100),
          suffix: sanitizeField(u.suffix || '', 12),
          email: sanitizeField(u.email || '', 150),
          contact_number: sanitizeField(u.contact_number || '', 30),
          position: sanitizeField(u.position || '', 100),
          department: sanitizeField(u.department || '', 100),
          current_password: '',
          password: '',
          photo: null,
        });
        setPhotoPreview(isSafeImageUrl(pic) ? pic : null);
      })
      .catch((err: unknown) => {
        const anyErr = err as { name?: string; code?: string };
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          anyErr?.name === 'CanceledError' ||
          anyErr?.name === 'AbortError' ||
          anyErr?.code === 'ERR_CANCELED'
        ) {
          return;
        }
        showAlert({ title: 'Error', message: extractApiError(err, 'Could not load profile details.'), type: 'error' });
      })
      .finally(() => {
        if (!controller.signal.aborted && mountedRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, showAlert]);

  const cleanEmailCheck = sanitizeField(formData.email, 150).trim().toLowerCase();
  const emailFormatErr =
    cleanEmailCheck && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmailCheck)
      ? 'Please enter a valid email address.'
      : '';
  const emailAvail = useFieldAvailability({
    enabled: isOpen && !loading && Boolean(cleanEmailCheck),
    field: 'email',
    value: cleanEmailCheck,
    formatError: emailFormatErr,
    fallbackMessage: 'This email address is already in use.',
    excludeId: profileIds.userId,
    excludeUserId: profileIds.userId,
  });

  const cleanPhoneCheck = sanitizeField(formData.contact_number, 30).trim();
  const phoneAvail = useFieldAvailability({
    enabled: isOpen && !loading && cleanPhoneCheck.replace(/\D/g, '').length >= 7,
    field: 'contact_number',
    value: cleanPhoneCheck,
    minLength: 7,
    fallbackMessage: 'This mobile number is already assigned to another staff account.',
    excludeTeacherId: profileIds.teacherId,
    excludeUserId: profileIds.userId,
  });

  const liveErrors = {
    email: emailAvail.error || undefined,
    contact_number: phoneAvail.error || undefined,
  };
  const fieldVerified = {
    email: emailAvail.verified,
    contact_number: phoneAvail.verified,
  };
  const checkingCount = (emailAvail.checking ? 1 : 0) + (phoneAvail.checking ? 1 : 0);
  const hasLiveErrors = Boolean(liveErrors.email || liveErrors.contact_number);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || checkingCount > 0) return;
    if (hasLiveErrors) {
      showAlert({
        title: 'Duplicate Information',
        message: liveErrors.email || liveErrors.contact_number || 'Please fix the highlighted errors first.',
        type: 'warning',
      });
      return;
    }

    const cleanFirst = sanitizeField(formData.first_name, 100).trim();
    const cleanLast = sanitizeField(formData.last_name, 100).trim();
    const cleanEmail = sanitizeField(formData.email, 150).trim().toLowerCase();
    const cleanPw = sanitizePassword(formData.password).trim();
    const cleanCurrentPw = sanitizePassword(formData.current_password).trim();

    if (!cleanFirst || !cleanLast) {
      showAlert({ title: 'Missing Information', message: 'First name and last name are required.', type: 'warning' });
      return;
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      showAlert({ title: 'Invalid Email', message: 'Please enter a valid email address.', type: 'warning' });
      return;
    }
    if (cleanPw && cleanPw.length < 8) {
      showAlert({
        title: 'Weak Password',
        message: 'New password must be at least 8 characters long.',
        type: 'warning',
      });
      return;
    }
    if (cleanPw && !cleanCurrentPw) {
      showAlert({
        title: 'Current Password Required',
        message: 'Please enter your current password to set a new password.',
        type: 'warning',
      });
      return;
    }

    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    setSaving(true);
    const payload: Record<string, unknown> = {
      first_name: cleanFirst,
      middle_name: sanitizeField(formData.middle_name, 100).trim(),
      last_name: cleanLast,
      suffix: SUFFIX_OPTIONS.includes(formData.suffix) ? formData.suffix : '',
      email: cleanEmail,
      contact_number: sanitizeField(formData.contact_number, 30).trim(),
    };
    if (formData.photo !== null) {
      if (formData.photo === '') {
        payload.photo = null;
        payload.remove_photo = true;
        payload.clear_photo = true;
      } else if (isSafeImageUrl(formData.photo)) {
        payload.photo = formData.photo;
      }
    }

    try {
      let rotatedToken: string | undefined;
      if (cleanPw) {
        const pwRes = await apiClient.post(
          API_ROUTES.accounts.changePassword,
          { current_password: cleanCurrentPw, new_password: cleanPw },
          { signal: controller.signal }
        );
        if (controller.signal.aborted || !mountedRef.current) return;
        if (pwRes.data?.access) {
          rotatedToken = pwRes.data.access;
          localStorage.setItem('attendsure_access', pwRes.data.access);
        }
        if (pwRes.data?.refresh) {
          localStorage.setItem('attendsure_refresh', pwRes.data.refresh);
        }
      }

      const res = await apiClient.put(API_ROUTES.accounts.me, payload, { signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (res.data?.access) {
        localStorage.setItem('attendsure_access', res.data.access);
      }
      if (res.data?.refresh) {
        localStorage.setItem('attendsure_refresh', res.data.refresh);
      }
      const mergedData = rotatedToken && !res.data?.token ? { ...res.data, token: rotatedToken } : res.data;
      showAlert({
        title: 'Saved',
        message: cleanPw ? 'Profile and password updated.' : 'Profile updated.',
        type: 'success',
      });
      onProfileUpdated?.(mergedData);
      onClose();
    } catch (err: unknown) {
      const anyErr = err as { name?: string; code?: string };
      if (
        controller.signal.aborted ||
        !mountedRef.current ||
        anyErr?.name === 'CanceledError' ||
        anyErr?.name === 'AbortError' ||
        anyErr?.code === 'ERR_CANCELED'
      ) {
        return;
      }
      showAlert({ title: 'Error', message: extractApiError(err, 'Update failed.'), type: 'error' });
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const setField = (k: Exclude<keyof typeof formData, 'photo'>, v: string) => {
    let clean = v;
    if (k === 'password' || k === 'current_password') {
      clean = sanitizePassword(v);
    } else if (k === 'email') {
      clean = sanitizeField(v, 150);
    } else if (k === 'contact_number') {
      clean = sanitizeField(v, 30);
    } else {
      clean = sanitizeField(v, 100);
    }
    setFormData((p) => ({ ...p, [k]: clean }));
  };

  const responsiveGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
    gap: 10,
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="My User Profile">
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.textMuted }}>
          <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 6px', display: 'block', color: brand.primary }} />
          Loading profile...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AvatarUploadField
            previewUrl={photoPreview}
            displayName={`${formData.first_name} ${formData.last_name}`.trim() || 'My Profile'}
            label="Profile Photo"
            size={56}
            disabled={saving}
            onSelectPhoto={(_file, dataUri) => {
              setPhotoPreview(dataUri);
              setFormData((p) => ({ ...p, photo: dataUri }));
            }}
            onRemovePhoto={() => {
              setPhotoPreview(null);
              setFormData((p) => ({ ...p, photo: '' }));
            }}
            onValidationError={(msg) => showAlert({ title: 'Invalid Image', message: msg, type: 'error' })}
          />

          <div style={responsiveGrid}>
            <div>
              <label style={ui.label}>First Name</label>
              <input required maxLength={100} style={ui.input} value={formData.first_name} onChange={(e) => setField('first_name', e.target.value)} />
            </div>
            <div>
              <label style={ui.label}>Last Name</label>
              <input required maxLength={100} style={ui.input} value={formData.last_name} onChange={(e) => setField('last_name', e.target.value)} />
            </div>
          </div>

          <div style={responsiveGrid}>
            <div>
              <label style={ui.label}>Middle Name</label>
              <input maxLength={100} style={ui.input} value={formData.middle_name} onChange={(e) => setField('middle_name', e.target.value)} />
            </div>
            <div>
              <label style={ui.label}>Suffix</label>
              <select style={ui.input} value={formData.suffix} onChange={(e) => setField('suffix', e.target.value)}>
                {SUFFIX_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s || 'None'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={responsiveGrid}>
            <div>
              <label style={ui.label}>Email</label>
              <input
                type="email"
                maxLength={150}
                style={{
                  ...ui.input,
                  borderColor: liveErrors.email
                    ? brand.danger
                    : fieldVerified.email
                      ? brand.success
                      : tokens.borderStrong,
                }}
                value={formData.email}
                onChange={(e) => setField('email', e.target.value)}
              />
              {liveErrors.email && (
                <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', fontWeight: 700, color: brand.danger }}>
                  {liveErrors.email}
                </span>
              )}
            </div>
            <div>
              <label style={ui.label}>Contact Number</label>
              <input
                maxLength={30}
                style={{
                  ...ui.input,
                  borderColor: liveErrors.contact_number
                    ? brand.danger
                    : fieldVerified.contact_number
                      ? brand.success
                      : tokens.borderStrong,
                }}
                value={formData.contact_number}
                onChange={(e) => setField('contact_number', e.target.value)}
              />
              {liveErrors.contact_number && (
                <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', fontWeight: 700, color: brand.danger }}>
                  {liveErrors.contact_number}
                </span>
              )}
            </div>
          </div>

          <div style={responsiveGrid}>
            <div>
              <label style={ui.label}>Current Password (If changing)</label>
              <input
                type="password"
                maxLength={128}
                autoComplete="current-password"
                placeholder="Current password"
                style={ui.input}
                value={formData.current_password}
                onChange={(e) => setField('current_password', e.target.value)}
              />
            </div>
            <div>
              <label style={ui.label}>New Password (Optional)</label>
              <input
                type="password"
                maxLength={128}
                autoComplete="new-password"
                placeholder="Min 8 characters"
                style={ui.input}
                value={formData.password}
                onChange={(e) => setField('password', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving || hasLiveErrors || checkingCount > 0}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ProfileModal;
