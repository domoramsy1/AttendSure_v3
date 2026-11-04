/**
 * AttendSure - Delete User Confirmation Modal
 * File: web/src/components/modals/UserDeleteModal.tsx
 */

import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface UserDeleteModalProps {
  isOpen: boolean;
  username: string;
  fullName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const UserDeleteModal: React.FC<UserDeleteModalProps> = ({
  isOpen,
  username,
  fullName,
  onClose,
  onConfirm,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete User Account">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-primary, #0f172a)' }}>
          Permanently delete user account <strong>{username}</strong> ({fullName})?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={onConfirm}
            style={{ backgroundColor: 'var(--brand-danger, #EF4444)', borderColor: 'var(--brand-danger, #EF4444)' }}
          >
            Delete Account
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UserDeleteModal;