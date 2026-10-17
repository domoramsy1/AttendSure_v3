/**
 * AttendSure - First-Time Profile Completion Modal (With Live Validation)
 * File: frontend/src/components/profile/CompleteProfileModal.tsx
 */

import React, { useState, useMemo } from 'react';
import apiClient from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import { UserCheck, ShieldCheck, Phone, Lock, Building, Loader2 } from 'lucide-react';

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
  const { showAlert } = useAlert();
  const [formData, setFormData] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    contact_number: '',
    department: 'Junior High School',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  // Live validation rules computed on every keystroke
  const liveErrors = useMemo(() => {
    const errs: { first_name?: string; last_name?: string; contact_number?: string; password?: string } = {};

    if (formData.first_name && formData.first_name.trim().length < 2) {
      errs.first_name = 'First name must be at least 2 characters.';
    }
    if (formData.last_name && formData.last_name.trim().length < 2) {
      errs.last_name = 'Last name must be at least 2 characters.';
    }

    const cleanPhone = formData.contact_number.trim().replace(/[\s-]/g, '');
    if (cleanPhone && !/^(09|\+639)\d{9}$/.test(cleanPhone)) {
      errs.contact_number = 'Enter a valid 11-digit PH mobile number (e.g. 09171234567).';
    }

    if (formData.password) {
      if (formData.password.length < 8) {
        errs.password = 'New password must be at least 8 characters.';
      } else if (!/[A-Za-z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
        errs.password = 'Password must contain both letters and numbers.';
      }
    }

    return errs;
  }, [formData]);

  const isFormValid =
    formData.first_name.trim().length >= 2 &&
    formData.last_name.trim().length >= 2 &&
    /^(09|\+639)\d{9}$/.test(formData.contact_number.trim().replace(/[\s-]/g, '')) &&
    Object.keys(liveErrors).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setSaving(true);
    const cleanContact = formData.contact_number.trim().replace(/[\s-]/g, '');
    const payload: Record<string, string> = {
      first_name: formData.first_name.trim(),
      middle_name: formData.middle_name.trim(),
      last_name: formData.last_name.trim(),
      suffix: formData.suffix.trim(),
      contact_number: cleanContact,
      department: formData.department.trim(),
    };

    if (formData.password && formData.password.trim().length >= 8) {
      payload.password = formData.password.trim();
    }

    try {
      const res = await apiClient.put('/me/', payload);
      showAlert({
        title: 'Profile Completed',
        message: 'Your official faculty record is now active and synchronized.',
        type: 'success',
      });
      onCompleted(res.data);
    } catch (err: any) {
      showAlert({
        title: 'Completion Error',
        message: err.response?.data?.error || err.response?.data?.detail || 'Failed to update profile.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Complete Your Profile Information">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ShieldCheck size={20} color="#0284c7" />
          <span style={{ fontSize: '0.80rem', color: '#1e3a8a', lineHeight: 1.3 }}>
            Your account was created by the School Administrator. Please complete your personal details to activate your DTR and class roster access.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input
              required
              type="text"
              style={{
                ...inputStyle,
                borderColor: liveErrors.first_name ? '#dc2626' : formData.first_name.trim().length >= 2 ? '#059669' : '#cbd5e1',
              }}
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              placeholder="e.g. Maria"
            />
            {liveErrors.first_name && <span style={errorTextStyle}>{liveErrors.first_name}</span>}
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input
              required
              type="text"
              style={{
                ...inputStyle,
                borderColor: liveErrors.last_name ? '#dc2626' : formData.last_name.trim().length >= 2 ? '#059669' : '#cbd5e1',
              }}
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              placeholder="e.g. Santos"
            />
            {liveErrors.last_name && <span style={errorTextStyle}>{liveErrors.last_name}</span>}
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
              placeholder="Optional"
            />
          </div>
          <div>
            <label style={labelStyle}>Suffix</label>
            <select
              style={inputStyle}
              value={formData.suffix}
              onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
            >
              <option value="">None</option>
              <option value="Jr.">Jr.</option>
              <option value="Sr.">Sr.</option>
              <option value="II">II</option>
              <option value="III">III</option>
              <option value="IV">IV</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} color="#64748b" /> Contact Number *
              </span>
            </label>
            <input
              required
              type="text"
              maxLength={13}
              placeholder="09171234567"
              style={{
                ...inputStyle,
                borderColor: liveErrors.contact_number
                  ? '#dc2626'
                  : formData.contact_number.length >= 11
                  ? '#059669'
                  : '#cbd5e1',
              }}
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
            />
            {liveErrors.contact_number && <span style={errorTextStyle}>{liveErrors.contact_number}</span>}
          </div>

          <div>
            <label style={labelStyle}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Building size={12} color="#64748b" /> Department *
              </span>
            </label>
            <select
              required
              style={inputStyle}
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            >
              <option value="Junior High School">Junior High School</option>
              <option value="Senior High School">Senior High School</option>
              <option value="English Department">English Department</option>
              <option value="Science Department">Science Department</option>
              <option value="Mathematics Department">Mathematics Department</option>
              <option value="Office of the Principal / Administration">Office of the Principal / Administration</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={12} color="#64748b" /> Personal Password (Optional, min 8 chars)
            </span>
          </label>
          <input
            type="password"
            placeholder="Leave blank to keep your current password"
            style={{
              ...inputStyle,
              borderColor: liveErrors.password ? '#dc2626' : formData.password.length >= 8 ? '#059669' : '#cbd5e1',
            }}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          {liveErrors.password && <span style={errorTextStyle}>{liveErrors.password}</span>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button variant="primary" size="md" type="submit" disabled={saving || !isFormValid}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
            <span>{saving ? 'Activating Profile...' : 'Complete & Activate Profile'}</span>
          </Button>
        </div>
      </form>
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

const errorTextStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.70rem',
  color: '#dc2626',
  fontWeight: 600,
  marginTop: 3,
};

export default CompleteProfileModal;