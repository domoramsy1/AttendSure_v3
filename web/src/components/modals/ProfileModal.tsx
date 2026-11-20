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
import { useAlert } from '../../context/AlertContext';
import { Camera, X, Loader2 } from 'lucide-react';

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
  const fileReaderRef = useRef<FileReader | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      submitAbortRef.current?.abort();
      fileReaderRef.current?.abort();
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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2.5 * 1024 * 1024) {
      showAlert({ title: 'Invalid Image', message: 'Use JPG, PNG, or WebP under 2.5 MB.', type: 'error' });
      e.target.value = '';
      return;
    }
    fileReaderRef.current?.abort();
    const reader = new FileReader();
    fileReaderRef.current = reader;
    reader.onloadend = () => {
      if (!mountedRef.current || reader.readyState !== FileReader.DONE) return;
      const b64 = typeof reader.result === 'string' ? reader.result : '';
      if (!isSafeImageUrl(b64)) {
        showAlert({ title: 'Invalid Image', message: 'Could not verify the selected image file.', type: 'error' });
        return;
      }
      setPhotoPreview(b64);
      setFormData((p) => ({ ...p, photo: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

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
    if (cleanPw) {
      payload.password = cleanPw;
      if (cleanCurrentPw) {
        payload.current_password = cleanCurrentPw;
      }
    }
    if (formData.photo !== null) {
      payload.photo = formData.photo === '' ? null : isSafeImageUrl(formData.photo) ? formData.photo : null;
    }

    try {
      const res = await apiClient.put(API_ROUTES.accounts.me, payload, { signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (res.data?.token) {
        localStorage.setItem('attendsure_token', res.data.token);
      }
      showAlert({ title: 'Saved', message: 'Profile updated.', type: 'success' });
      onProfileUpdated?.(res.data);
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
          <div style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                overflow: 'hidden',
                backgroundColor: tokens.bgSurface,
                border: `1px solid ${tokens.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {photoPreview && isSafeImageUrl(photoPreview) ? (
                <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '0.7rem', color: tokens.textMuted }}>No Pic</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={ui.btnPrimary}>
                <Camera size={12} /> Change Photo
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoSelect} style={{ display: 'none' }} />
              </label>
              {photoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview(null);
                    setFormData((p) => ({ ...p, photo: '' }));
                  }}
                  style={{
                    color: brand.danger,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.74rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <X size={12} /> Remove
                </button>
              )}
            </div>
          </div>

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
              <input type="email" maxLength={150} style={ui.input} value={formData.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div>
              <label style={ui.label}>Contact Number</label>
              <input maxLength={30} style={ui.input} value={formData.contact_number} onChange={(e) => setField('contact_number', e.target.value)} />
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
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ProfileModal;