/**
 * AttendSure - Digital ID & QR Pass Modal
 * File: web/src/components/modals/StudentIdPassModal.tsx
 */

import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ShieldCheck, Copy, Check, Printer, User as UserIcon } from 'lucide-react';
import type { StudentItem, AssignedClass } from '../tabs/MyAssignedClassesTab';

interface StudentIdPassModalProps {
  student: (Partial<StudentItem> & { name: string; lrn: string; qr_token?: string; photo_url?: string | null }) | null;
  selectedClass?: AssignedClass | null;
  onClose: () => void;
  onCopyLrn: (lrn: string) => void;
}

export const StudentIdPassModal: React.FC<StudentIdPassModalProps> = ({ student, selectedClass, onClose, onCopyLrn }) => {
  const { tokens, brand, fonts, ui } = useTheme();
  const [copied, setCopied] = useState(false);

  if (!student) return null;
  const safePhoto = isSafeImageUrl(student.photo_url) ? student.photo_url : null;
  const identifier = student.lrn || 'ID-00000';

  return (
    <Modal isOpen={Boolean(student)} onClose={onClose} title="Digital QR ID Pass">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 290, backgroundColor: tokens.bgSurface, border: `2px solid ${brand.primary}`, borderRadius: 14, overflow: 'hidden', boxShadow: tokens.cardShadow }}>
          <div style={{ backgroundColor: brand.primary, color: '#fff', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: fonts.size.xs, fontWeight: 800 }}>
              <ShieldCheck size={14} /> ATTENDSURE OFFICIAL PASS
            </div>
            <div style={{ fontSize: '0.62rem', opacity: 0.9, marginTop: 2 }}>Macasandig National High School</div>
          </div>

          <div style={{ padding: 16 }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 10px', backgroundColor: tokens.bgSurfaceSubtle, border: `2px solid ${tokens.borderSubtle}`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {safePhoto ? <img src={safePhoto} alt={student.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={26} color={tokens.textMuted} />}
            </div>

            <div style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>{student.name}</div>
            <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>{selectedClass?.section_name || 'Authorized Member'}</div>

            <button
              type="button"
              onClick={() => { onCopyLrn(identifier); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ ...ui.btnSecondary, margin: '10px auto', fontFamily: fonts.mono }}
            >
              <span>ID: {identifier}</span>
              {copied ? <Check size={12} color={brand.success} /> : <Copy size={12} />}
            </button>

            <div style={{ margin: '6px auto', padding: 6, backgroundColor: '#ffffff', border: `1px solid ${tokens.borderSubtle}`, borderRadius: 10, width: 124, height: 124 }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(identifier)}`}
                alt="QR Code"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>

          <div style={{ backgroundColor: tokens.bgSurfaceSubtle, borderTop: `1px solid ${tokens.borderSubtle}`, padding: 8, fontSize: fonts.size.xs, color: tokens.textSecondary }}>
            QR Token: <strong style={{ color: student.qr_token ? brand.success : brand.warning }}>{student.qr_token || 'Active'}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>Close</Button>
          <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
            <Printer size={14} style={{ marginRight: 6 }} /> Print Pass
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentIdPassModal;