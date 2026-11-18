/**
 * AttendSure - User Profile View & Edit Modal
 * File: web/src/components/modals/ProfileModal.tsx
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { Camera, X, Loader2 } from 'lucide-react';

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
  const { tokens, brand, ui } = useTheme();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    first_name: '', middle_name: '', last_name: '', suffix: '',
    email: '', contact_number: '', position: '', department: '', password: '', photo: null as string | null,
  });

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    apiClient.get('/me/')
      .then((res) => {
        const u = res.data;
        setFormData({
          first_name: u.first_name || '', middle_name: u.middle_name || '', last_name: u.last_name || '',
          suffix: u.suffix || '', email: u.email || '', contact_number: u.contact_number || '',
          position: u.position || '', department: u.department || '', password: '', photo: null,
        });
        setPhotoPreview(u.photo_url || u.photo || null);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2.5 * 1024 * 1024) {
      showAlert({ title: 'Invalid Image', message: 'Use JPG, PNG, or WebP under 2.5 MB.', type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result as string;
      setPhotoPreview(b64);
      setFormData((p) => ({ ...p, photo: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, any> = {
      first_name: formData.first_name.trim(), middle_name: formData.middle_name.trim(),
      last_name: formData.last_name.trim(), suffix: formData.suffix.trim(),
      email: formData.email.trim(), contact_number: formData.contact_number.trim(),
    };
    if (formData.password.trim().length >= 8) payload.password = formData.password.trim();
    if (formData.photo !== null) payload.photo = formData.photo === '' ? null : formData.photo;

    try {
      const res = await apiClient.put('/me/', payload);
      showAlert({ title: 'Saved', message: 'Profile updated.', type: 'success' });
      onProfileUpdated?.(res.data);
      onClose();
    } catch (err: any) {
      showAlert({ title: 'Error', message: err.response?.data?.detail || 'Update failed.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: keyof typeof formData, v: string) => setFormData((p) => ({ ...p, [k]: v }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="My User Profile">
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: tokens.textMuted }}>Loading profile...</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...ui.subtleBox, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', backgroundColor: tokens.bgSurface, border: `1px solid ${tokens.borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {photoPreview ? <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '0.7rem', color: tokens.textMuted }}>No Pic</span>}
            </div>
            <div>
              <label style={ui.btnPrimary}>
                <Camera size={12} /> Change Photo
                <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
              </label>
              {photoPreview && (
                <button type="button" onClick={() => { setPhotoPreview(null); setField('photo', ''); }} style={{ marginLeft: 8, color: brand.danger, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.74rem' }}>
                  <X size={12} /> Remove
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={ui.label}>First Name</label><input required style={ui.input} value={formData.first_name} onChange={(e) => setField('first_name', e.target.value)} /></div>
            <div><label style={ui.label}>Last Name</label><input required style={ui.input} value={formData.last_name} onChange={(e) => setField('last_name', e.target.value)} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
            <div><label style={ui.label}>Middle Name</label><input style={ui.input} value={formData.middle_name} onChange={(e) => setField('middle_name', e.target.value)} /></div>
            <div><label style={ui.label}>Suffix</label><input style={ui.input} value={formData.suffix} onChange={(e) => setField('suffix', e.target.value)} /></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={ui.label}>Email</label><input type="email" style={ui.input} value={formData.email} onChange={(e) => setField('email', e.target.value)} /></div>
            <div><label style={ui.label}>Contact Number</label><input style={ui.input} value={formData.contact_number} onChange={(e) => setField('contact_number', e.target.value)} /></div>
          </div>

          <div>
            <label style={ui.label}>New Password (Optional)</label>
            <input type="password" placeholder="Min 8 characters" style={ui.input} value={formData.password} onChange={(e) => setField('password', e.target.value)} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={onClose}>Cancel</Button>
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