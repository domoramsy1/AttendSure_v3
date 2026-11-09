/**
 * AttendSure - Add / Edit User Account Modal
 * File: web/src/components/modals/UserFormModal.tsx
 */

import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AlertCircle, Loader2 } from 'lucide-react';

interface UserFormData {
  username: string;
  employee_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  email: string;
  contact_number: string;
  department: string;
  position: string;
  role: string;
  is_teaching: boolean;
  rfid_uid: string;
  password?: string;
}

interface UserFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  formData: UserFormData;
  formError: string | null;
  saving: boolean;
  onClose: () => void;
  onChange: (field: keyof UserFormData, value: any) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  isOpen,
  isEditing,
  formData,
  formError,
  saving,
  onClose,
  onChange,
  onSubmit,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit User: ${formData.username}` : 'Add User Account'}
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {formError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--brand-danger, #EF4444)',
              fontSize: '0.78rem',
            }}
          >
            <AlertCircle size={15} />
            <span>{formError}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Username *</label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => onChange('username', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Employee ID *</label>
            <input
              type="text"
              required
              value={formData.employee_id}
              onChange={(e) => onChange('employee_id', e.target.value.toUpperCase())}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>First Name *</label>
            <input
              type="text"
              required
              value={formData.first_name}
              onChange={(e) => onChange('first_name', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name *</label>
            <input
              type="text"
              required
              value={formData.last_name}
              onChange={(e) => onChange('last_name', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>System Role *</label>
            <select
              value={formData.role}
              onChange={(e) => onChange('role', e.target.value)}
              style={inputStyle}
            >
              <option value="FACULTY">Faculty / Faculty</option>
              <option value="ADMIN">System Administrator</option>
              <option value="PRINCIPAL">School Principal</option>
              <option value="DEPT_HEAD">Department Head</option>
              <option value="GUARD">Security Guard</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onChange('email', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>RFID Card UID</label>
            <input
              type="text"
              placeholder="e.g. 8A3F29C1"
              value={formData.rfid_uid}
              onChange={(e) => onChange('rfid_uid', e.target.value.toUpperCase())}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <label style={labelStyle}>
              Password {isEditing ? '(Leave blank to keep)' : '*'}
            </label>
            <input
              type="password"
              required={!isEditing}
              value={formData.password || ''}
              onChange={(e) => onChange('password', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={15} /> : isEditing ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.74rem',
  fontWeight: 700,
  color: 'var(--text-secondary, #64748b)',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--border-strong, #cbd5e1)',
  backgroundColor: 'var(--bg-surface, #ffffff)',
  color: 'var(--text-primary, #0f172a)',
  boxSizing: 'border-box',
  outline: 'none',
};

export default UserFormModal;