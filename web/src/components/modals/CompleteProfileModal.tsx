/**
 * AttendSure - First-Time Profile Completion Modal
 * File: web/src/components/modals/CompleteProfileModal.tsx
 */

import React, { useState } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { UserCheck, ShieldCheck, Loader2 } from 'lucide-react';

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

export const CompleteProfileModal: React.FC<CompleteProfileModalProps> = ({ isOpen, onCompleted }) => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { showAlert } = useAlert();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    contact_number: '',
    department: 'Junior High School',
    password: '',
  });

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

  const setField = (key: keyof typeof formData, val: string) => setFormData((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim(),
        last_name: formData.last_name.trim(),
        suffix: formData.suffix.trim(),
        contact_number: cleanPhone,
        department: formData.department.trim(),
      };
      if (formData.password.trim().length >= 8) payload.password = formData.password.trim();

      const res = await apiClient.put('/v1/accounts/me/', payload);
      showAlert({ title: 'Profile Completed', message: 'Your faculty record is now active.', type: 'success' });
      onCompleted(res.data);
    } catch (err: any) {
      showAlert({ title: 'Error', message: err.response?.data?.detail || 'Failed to update profile.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Complete Your Profile Information">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...ui.subtleBox, backgroundColor: tokens.infoLight, borderColor: brand.secondary, display: 'flex', gap: 10, alignItems: 'center' }}>
          <ShieldCheck size={20} color={brand.secondary} />
          <span style={{ fontSize: fonts.size.sm, color: tokens.textPrimary }}>
            Please complete your personal details to activate your DTR and class list access.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={ui.label}>First Name *</label>
            <input required style={ui.input} value={formData.first_name} onChange={(e) => setField('first_name', e.target.value)} />
          </div>
          <div>
            <label style={ui.label}>Last Name *</label>
            <input required style={ui.input} value={formData.last_name} onChange={(e) => setField('last_name', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
          <div>
            <label style={ui.label}>Middle Name</label>
            <input style={ui.input} value={formData.middle_name} onChange={(e) => setField('middle_name', e.target.value)} />
          </div>
          <div>
            <label style={ui.label}>Suffix</label>
            <select style={ui.input} value={formData.suffix} onChange={(e) => setField('suffix', e.target.value)}>
              <option value="">None</option>
              <option value="Jr.">Jr.</option>
              <option value="Sr.">Sr.</option>
              <option value="II">II</option>
              <option value="III">III</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={ui.label}>Contact Number (11 Digits) *</label>
            <input required maxLength={13} placeholder="09171234567" style={ui.input} value={formData.contact_number} onChange={(e) => setField('contact_number', e.target.value)} />
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
          <label style={ui.label}>New Password (Optional, min 8 chars with letters & numbers)</label>
          <input type="password" style={ui.input} value={formData.password} onChange={(e) => setField('password', e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="primary" size="md" type="submit" disabled={saving || !isFormValid}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
            <span>{saving ? 'Saving...' : 'Complete & Activate Profile'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CompleteProfileModal;