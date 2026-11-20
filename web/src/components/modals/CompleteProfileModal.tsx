/**
 * AttendSure - First-Time Profile Completion Modal
 * File: web/src/components/modals/CompleteProfileModal.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { UserCheck, ShieldCheck, Loader2, Camera, X } from 'lucide-react';

export interface CompletedProfileUser {
  full_name?: string;
  username?: string;
  photo?: string | null;
  photo_url?: string | null;
  [key: string]: unknown;
}

interface CompleteProfileModalProps {
  isOpen: boolean;
  onCompleted: (updatedUser: CompletedProfileUser) => void;
}

const sanitizeField = (raw: string, maxLen = 100): string =>
  String(raw || '').replace(/[\u0000-\u001F\u007F<>]/g, '').slice(0, maxLen);

const sanitizePassword = (raw: string): string =>
  String(raw || '').replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 128);

export const CompleteProfileModal: React.FC<CompleteProfileModalProps> = ({ isOpen, onCompleted }) => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    contact_number: '',
    department: 'Junior High School',
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
        setFormData((prev) => ({
          ...prev,
          first_name: sanitizeField(u.first_name || '', 100),
          middle_name: sanitizeField(u.middle_name || '', 100),
          last_name: sanitizeField(u.last_name || '', 100),
          suffix: sanitizeField(u.suffix || '', 12),
          contact_number: sanitizeField(u.contact_number || '', 13),
          department: sanitizeField(u.department || 'Junior High School', 100) || 'Junior High School',
          password: '',
          photo: null,
        }));
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
        showAlert({ title: 'Notice', message: extractApiError(err, 'Could not pre-load profile details.'), type: 'warning' });
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

  const cleanPhone = formData.contact_number.trim().replace(/[\s-]/g, '');
  const isPhoneValid = /^(09|\+639)\d{9}$/.test(cleanPhone);
  const isPasswordValid =
    !formData.password ||
    (formData.password.length >= 8 && /[A-Za-z]/.test(formData.password) && /[0-9]/.test(formData.password));
  const isFormValid =
    formData.first_name.trim().length >= 2 &&
    formData.last_name.trim().length >= 2 &&
    isPhoneValid &&
    isPasswordValid;

  const setField = (key: Exclude<keyof typeof formData, 'photo'>, val: string) => {
    const clean = key === 'password' ? sanitizePassword(val) : sanitizeField(val, key === 'contact_number' ? 13 : 100);
    setFormData((p) => ({ ...p, [key]: clean }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || saving) return;

    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    setSaving(true);
    try {
      const payload: Record<string, string | null> = {
        first_name: sanitizeField(formData.first_name, 100).trim(),
        middle_name: sanitizeField(formData.middle_name, 100).trim(),
        last_name: sanitizeField(formData.last_name, 100).trim(),
        suffix: sanitizeField(formData.suffix, 12).trim(),
        contact_number: cleanPhone,
        department: sanitizeField(formData.department, 100).trim(),
      };
      const cleanPw = sanitizePassword(formData.password).trim();
      if (cleanPw.length >= 8) payload.password = cleanPw;
      if (formData.photo !== null) {
        payload.photo = formData.photo === '' ? null : isSafeImageUrl(formData.photo) ? formData.photo : null;
      }

      const res = await apiClient.put(API_ROUTES.accounts.me, payload, { signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      showAlert({ title: 'Profile Completed', message: 'Your faculty record is now active.', type: 'success' });
      onCompleted(res.data);
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
      showAlert({ title: 'Error', message: extractApiError(err, 'Failed to update profile.'), type: 'error' });
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const responsiveGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
    gap: 10,
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Complete Your Profile Information">
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.textMuted }}>
          <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 6px', display: 'block', color: brand.primary }} />
          Loading profile...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              ...ui.subtleBox,
              backgroundColor: tokens.infoLight,
              borderColor: brand.secondary,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <ShieldCheck size={20} color={brand.secondary} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: fonts.size.sm, color: tokens.textPrimary }}>
              Please complete your personal details to activate your DTR and class list access.
            </span>
          </div>

          <div style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 48,
                height: 48,
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
                <img src={photoPreview} alt="Profile preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>No Pic</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={ui.btnPrimary}>
                <Camera size={12} /> Upload Photo (Optional)
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
              <label style={ui.label}>First Name *</label>
              <input
                required
                maxLength={100}
                style={ui.input}
                value={formData.first_name}
                onChange={(e) => setField('first_name', e.target.value)}
              />
            </div>
            <div>
              <label style={ui.label}>Last Name *</label>
              <input
                required
                maxLength={100}
                style={ui.input}
                value={formData.last_name}
                onChange={(e) => setField('last_name', e.target.value)}
              />
            </div>
          </div>

          <div style={responsiveGrid}>
            <div>
              <label style={ui.label}>Middle Name</label>
              <input
                maxLength={100}
                style={ui.input}
                value={formData.middle_name}
                onChange={(e) => setField('middle_name', e.target.value)}
              />
            </div>
            <div>
              <label style={ui.label}>Suffix</label>
              <select style={ui.input} value={formData.suffix} onChange={(e) => setField('suffix', e.target.value)}>
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

          <div style={responsiveGrid}>
            <div>
              <label style={ui.label}>Contact Number (11 Digits) *</label>
              <input
                required
                maxLength={13}
                placeholder="09171234567"
                style={ui.input}
                value={formData.contact_number}
                onChange={(e) => setField('contact_number', e.target.value)}
              />
            </div>
            <div>
              <label style={ui.label}>Department *</label>
              <select required style={ui.input} value={formData.department} onChange={(e) => setField('department', e.target.value)}>
                <option value="Junior High School">Junior High School</option>
                <option value="Senior High School">Senior High School</option>
                <option value="Office of the Principal / Administration">Administration</option>
              </select>
            </div>
          </div>

          <div>
            <label style={ui.label}>New Password (Optional, min 8 chars with letters &amp; numbers)</label>
            <input
              type="password"
              maxLength={128}
              autoComplete="new-password"
              style={ui.input}
              value={formData.password}
              onChange={(e) => setField('password', e.target.value)}
            />
            {!isPasswordValid && (
              <span style={{ fontSize: '0.72rem', color: brand.danger, marginTop: 4, display: 'block' }}>
                Password must be at least 8 characters and contain both letters and numbers.
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="primary" size="md" type="submit" disabled={saving || !isFormValid}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
              <span>{saving ? 'Saving...' : 'Complete & Activate Profile'}</span>
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default CompleteProfileModal;