/**
 * AttendSure V3 - User Profile & Account Settings Modal
 * File: frontend/src/components/modals/ProfileModal.tsx
 *
 * Capabilities:
 * - Profile photo upload with client-side 2MB constraint and immediate preview.
 * - Dynamic server-relative media URL resolution.
 * - Password modification with eye visibility toggle.
 * - Synchronizes updated identity with localStorage and parent states.
 * - Non-blocking inline error and success feedback banners.
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Camera,
  Trash2,
  Upload,
  User,
  Mail,
  Phone,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated: (updated: { full_name: string; photo?: string | null }) => void;
}

const resolvePhotoSource = (rawSrc?: string | null): string | null => {
  if (!rawSrc || typeof rawSrc !== 'string') return null;
  const trimmed = rawSrc.trim();
  if (!trimmed) return null;

  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/media/') || trimmed.startsWith('media/')) {
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const backendPort = window.location.port === '8000' ? '' : ':8000';
    return `${protocol}//${hostname}${backendPort}${cleanPath}`;
  }

  return trimmed;
};

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    role: '',
    first_name: '',
    last_name: '',
    email: '',
    contact_number: '',
    password: '',
    photo: null as string | null,
  });

  useEffect(() => {
    if (!isOpen) return;
    setSuccessMsg(null);
    setErrorMsg(null);
    setShowPassword(false);
    setLoading(true);

    apiClient
      .get('/me/')
      .then((res) => {
        setFormData({
          username: res.data.username || '',
          role: res.data.role || '',
          first_name: res.data.first_name || '',
          last_name: res.data.last_name || '',
          email: res.data.email || '',
          contact_number: res.data.contact_number || '',
          password: '',
          photo: res.data.photo || null,
        });
      })
      .catch((err) => {
        const detail =
          err.response?.data?.detail ||
          err.response?.data?.error ||
          'Failed to load profile details.';
        setErrorMsg(detail);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Photo size must be less than 2MB.');
      e.target.value = '';
      return;
    }

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        photo: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    setErrorMsg(null);
    setFormData((prev) => ({
      ...prev,
      photo: null,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload: Record<string, any> = {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        email: formData.email.trim(),
        contact_number: formData.contact_number.trim(),
      };

      if (formData.password.trim()) {
        payload.password = formData.password.trim();
      }

      if (formData.photo === null || formData.photo.startsWith('data:image')) {
        payload.photo = formData.photo;
      }

      const res = await apiClient.put('/me/', payload);
      setSuccessMsg('Profile saved successfully!');

      const updatedFullName =
        res.data.full_name ||
        `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim() ||
        formData.username;

      // Synchronize with local storage for app-wide reactivity
      localStorage.setItem('attendsure_faculty_name', updatedFullName);

      onProfileUpdated({
        full_name: updatedFullName,
        photo: res.data.photo,
      });

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      const data = err.response?.data;
      if (typeof data === 'object' && data !== null) {
        if (data.detail) {
          setErrorMsg(data.detail);
        } else if (data.error) {
          setErrorMsg(data.error);
        } else {
          const lines = Object.entries(data).map(
            ([key, val]) => `${key}: ${Array.isArray(val) ? val.join(' ') : val}`
          );
          setErrorMsg(lines.join(' | ') || 'Failed to save profile changes.');
        }
      } else {
        setErrorMsg('Failed to save profile changes. Please verify your connection.');
      }
    } finally {
      setSaving(false);
    }
  };

  const previewPhotoSrc = resolvePhotoSource(formData.photo);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Account Profile">
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0' }}>
          <Loader2 className="animate-spin" size={24} color="#0284c7" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 6,
                color: '#dc2626',
                fontSize: '0.80rem',
                lineHeight: 1.4,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 6,
                color: '#059669',
                fontSize: '0.80rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: 12,
              backgroundColor: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: '#e2e8f0',
                border: '2px solid #0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {previewPhotoSrc ? (
                <img
                  src={previewPhotoSrc}
                  alt="Profile Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Camera size={26} color="#64748b" />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={uploadPhotoBtn}>
                  <Upload size={13} />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    style={{ display: 'none' }}
                  />
                </label>

                {formData.photo && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    style={removePhotoBtn}
                    title="Remove Photo"
                  >
                    <Trash2 size={13} />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                Square photo recommended (PNG or JPG, max 2MB).
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Username</label>
              <input
                type="text"
                disabled
                value={formData.username}
                style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }}
              />
            </div>
            <div>
              <label style={labelStyle}>System Role</label>
              <input
                type="text"
                disabled
                value={formData.role}
                style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#0284c7', fontWeight: 700 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <div style={{ position: 'relative' }}>
                <User size={14} color="#94a3b8" style={inputIconStyle} />
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  style={{ ...inputStyle, paddingLeft: 32 }}
                  placeholder="First Name"
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <div style={{ position: 'relative' }}>
                <User size={14} color="#94a3b8" style={inputIconStyle} />
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  style={{ ...inputStyle, paddingLeft: 32 }}
                  placeholder="Last Name"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} color="#94a3b8" style={inputIconStyle} />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{ ...inputStyle, paddingLeft: 32 }}
                  placeholder="name@school.edu.ph"
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} color="#94a3b8" style={inputIconStyle} />
                <input
                  type="text"
                  value={formData.contact_number}
                  onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                  style={{ ...inputStyle, paddingLeft: 32 }}
                  placeholder="09171234567"
                />
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                Change Password (leave blank to keep current)
              </label>
              {formData.password && (
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0284c7',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={14} color="#94a3b8" style={inputIconStyle} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ ...inputStyle, paddingLeft: 32 }}
                placeholder="Enter at least 6 characters"
                minLength={6}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={15} style={{ marginRight: 6 }} /> : null}
              Save Changes
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ProfileModal;

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.76rem',
  fontWeight: 600,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const inputIconStyle: React.CSSProperties = {
  position: 'absolute',
  left: 10,
  top: 10,
};

const uploadPhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 10px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const removePhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 10px',
  backgroundColor: '#fee2e2',
  color: '#dc2626',
  borderRadius: 6,
  border: '1px solid #fecaca',
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};