/**
 * AttendSure - User Profile View & Edit Modal
 * File: frontend/src/components/profile/ProfileModal.tsx
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { Mail, Phone, Lock, Building, Briefcase, Camera, X, Loader2 } from 'lucide-react';

export interface ProfileUpdatePayload {
  full_name?: string;
  photo?: string | null;
  [key: string]: unknown;
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: ProfileUpdatePayload) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onProfileUpdated }) => {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    username: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    email: '',
    contact_number: '',
    position: '',
    department: '',
    password: '',
    photo: null as string | null,
  });

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    apiClient
      .get('/me/')
      .then((res) => {
        const u = res.data;
        setFormData({
          username: u.username || '',
          first_name: u.first_name || '',
          middle_name: u.middle_name || '',
          last_name: u.last_name || '',
          suffix: u.suffix || '',
          email: u.email || '',
          contact_number: u.contact_number || '',
          position: u.position || '',
          department: u.department || '',
          password: '',
          photo: null,
        });
        setPhotoPreview(u.photo_url || u.photo || null);
      })
      .catch((err) => {
        showAlert({
          title: 'Error',
          message: err.response?.data?.detail || 'Failed to load user profile.',
          type: 'error',
        });
      })
      .finally(() => setLoading(false));
  }, [isOpen, showAlert]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showAlert({
        title: 'Unsupported Format',
        message: 'Only JPG, PNG, and WebP images are allowed.',
        type: 'error',
      });
      return;
    }

    if (file.size > 2.5 * 1024 * 1024) {
      showAlert({
        title: 'File Too Large',
        message: 'Profile photos must be 2.5 MB or smaller.',
        type: 'error',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Str = reader.result as string;
      setPhotoPreview(base64Str);
      setFormData((prev) => ({ ...prev, photo: base64Str }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload: Record<string, any> = {
      first_name: formData.first_name.trim(),
      middle_name: formData.middle_name.trim(),
      last_name: formData.last_name.trim(),
      suffix: formData.suffix.trim(),
      email: formData.email.trim(),
      contact_number: formData.contact_number.trim(),
    };

    if (formData.password && formData.password.trim().length >= 8) {
      payload.password = formData.password.trim();
    }

    if (formData.photo !== null) {
      payload.photo = formData.photo === '' ? null : formData.photo;
    }

    try {
      const res = await apiClient.put('/me/', payload);
      showAlert({
        title: 'Profile Updated',
        message: 'Your profile changes have been saved.',
        type: 'success',
      });

      if (onProfileUpdated) {
        onProfileUpdated(res.data);
      }
      onClose();
    } catch (err: any) {
      showAlert({
        title: 'Update Failed',
        message: err.response?.data?.error || err.response?.data?.detail || 'Failed to update profile.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="My User Profile">
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading details...</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Photo Section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 10, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', backgroundColor: '#e2e8f0', flexShrink: 0 }}>
              {photoPreview ? (
                <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  No Pic
                </div>
              )}
            </div>
            <div>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.74rem',
                  padding: '4px 10px',
                  backgroundColor: '#0284c7',
                  color: '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                <Camera size={12} /> Change Photo
                <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
              </label>
              {photoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview(null);
                    setFormData((prev) => ({ ...prev, photo: '' }));
                  }}
                  style={{ marginLeft: 8, fontSize: '0.74rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={12} style={{ verticalAlign: 'middle' }} /> Remove
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input
                required
                type="text"
                style={inputStyle}
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input
                required
                type="text"
                style={inputStyle}
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Middle Name</label>
              <input
                type="text"
                style={inputStyle}
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Suffix</label>
              <input
                type="text"
                style={inputStyle}
                value={formData.suffix}
                onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                placeholder="Jr., III..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><Mail size={12} style={{ verticalAlign: 'middle' }} /> Email</label>
              <input
                type="email"
                style={inputStyle}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}><Phone size={12} style={{ verticalAlign: 'middle' }} /> Contact Number</label>
              <input
                type="text"
                style={inputStyle}
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><Briefcase size={12} style={{ verticalAlign: 'middle' }} /> Position</label>
              <input type="text" style={{ ...inputStyle, backgroundColor: '#f1f5f9' }} value={formData.position} disabled />
            </div>
            <div>
              <label style={labelStyle}><Building size={12} style={{ verticalAlign: 'middle' }} /> Department</label>
              <input type="text" style={{ ...inputStyle, backgroundColor: '#f1f5f9' }} value={formData.department} disabled />
            </div>
          </div>

          <div>
            <label style={labelStyle}><Lock size={12} style={{ verticalAlign: 'middle' }} /> New Password (Leave blank to keep current)</label>
            <input
              type="password"
              placeholder="Min 8 characters"
              style={inputStyle}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
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

export default ProfileModal;