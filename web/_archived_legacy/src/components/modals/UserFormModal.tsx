/**
 * AttendSure - Add / Edit User Account Modal
 * File: web/src/components/modals/UserFormModal.tsx
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';
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
  qr_token: string;
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
  isOpen, isEditing, formData, formError, saving, onClose, onChange, onSubmit,
}) => {
  const { tokens, brand, ui } = useTheme();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? `Edit User: ${formData.username}` : 'Add User Account'}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {formError && (
          <div style={{ ...ui.subtleBox, backgroundColor: tokens.dangerLight, color: brand.danger, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} /> <span>{formError}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={ui.label}>Username *</label><input required style={ui.input} value={formData.username} onChange={(e) => onChange('username', e.target.value)} /></div>
          <div><label style={ui.label}>Employee ID *</label><input required style={ui.input} value={formData.employee_id} onChange={(e) => onChange('employee_id', e.target.value.toUpperCase())} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={ui.label}>First Name *</label><input required style={ui.input} value={formData.first_name} onChange={(e) => onChange('first_name', e.target.value)} /></div>
          <div><label style={ui.label}>Last Name *</label><input required style={ui.input} value={formData.last_name} onChange={(e) => onChange('last_name', e.target.value)} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={ui.label}>System Role *</label>
            <select style={ui.input} value={formData.role} onChange={(e) => onChange('role', e.target.value)}>
              <option value="FACULTY">Faculty Member</option>
              <option value="ADMIN">System Administrator</option>
              <option value="PRINCIPAL">School Principal</option>
              <option value="DEPT_HEAD">Department Head</option>
              <option value="PARENT">Parent Account</option>
            </select>
          </div>
          <div><label style={ui.label}>Email</label><input type="email" style={ui.input} value={formData.email} onChange={(e) => onChange('email', e.target.value)} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={ui.label}>QR Token</label><input style={ui.input} value={formData.qr_token} onChange={(e) => onChange('qr_token', e.target.value)} /></div>
          <div><label style={ui.label}>Password {isEditing ? '(Optional)' : '*'}</label><input type="password" required={!isEditing} style={ui.input} value={formData.password || ''} onChange={(e) => onChange('password', e.target.value)} /></div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" type="submit" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" size={15} /> : isEditing ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default UserFormModal;