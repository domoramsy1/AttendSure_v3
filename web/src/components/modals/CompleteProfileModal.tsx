import React, { useState } from 'react';
import apiClient from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';

interface Props {
  isOpen: boolean;
  onCompleted: (updatedUser: any) => void;
}

export const CompleteProfileModal: React.FC<Props> = ({ isOpen, onCompleted }) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiClient.put('/me/', formData);
      showAlert({
        title: 'Profile Completed',
        message: 'Your official faculty record is now active.',
        type: 'success',
      });
      onCompleted(res.data);
    } catch (err: any) {
      showAlert({
        title: 'Error',
        message: err.response?.data?.error || 'Failed to complete profile.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Complete Your Profile Information">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
          Please complete your information so you can be assigned classes and tracked in school attendance.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>First Name *</label>
            <input
              required
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Last Name *</label>
            <input
              required
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 10 }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Middle Name</label>
            <input
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={formData.middle_name}
              onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>Contact Number *</label>
            <input
              required
              placeholder="09171234567"
              style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>New Password (Optional)</label>
          <input
            type="password"
            placeholder="Change temporary password"
            style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
        </div>

        <Button variant="primary" size="md" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save & Activate Account'}
        </Button>
      </form>
    </Modal>
  );
};