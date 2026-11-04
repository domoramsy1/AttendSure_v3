/**
 * AttendSure - Unified Digital ID & Gate Turnstile Pass Modal
 * Supports both Student and Faculty identification credentials.
 * File: web/src/components/modals/StudentIdPassModal.tsx
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ShieldCheck, Copy, Check, Printer, User as UserIcon } from 'lucide-react';
import type { StudentItem, AssignedClass } from '../tabs/MyAssignedClassesTab';

interface StudentIdPassModalProps {
  student: (Partial<StudentItem> & { name: string; lrn: string; rfid_uid?: string; photo_url?: string | null }) | null;
  selectedClass?: AssignedClass | null;
  onClose: () => void;
  onCopyLrn: (lrn: string) => void;
}

const isSafeImageUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/') ||
    clean.startsWith('blob:')
  );
};

export const StudentIdPassModal: React.FC<StudentIdPassModalProps> = ({
  student,
  selectedClass,
  onClose,
  onCopyLrn,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!student) return null;

  const safePhoto = isSafeImageUrl(student.photo_url) ? student.photo_url : null;
  const identifier = student.lrn || 'ID-00000';

  const handleCopy = () => {
    onCopyLrn(identifier);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={Boolean(student)} onClose={onClose} title="Digital Pass & Gate Turnstile QR">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '6px 0' }}>
        <div
          id="printable-id-card"
          style={{
            width: 300,
            backgroundColor: '#FFFFFF',
            border: '2px solid #004B87',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0, 75, 135, 0.12)',
            boxSizing: 'border-box',
          }}
        >
          {/* Card Header */}
          <div style={{ backgroundColor: '#004B87', color: '#FFFFFF', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.70rem', fontWeight: 800 }}>
              <ShieldCheck size={14} color="#38bdf8" />
              <span>ATTENDSURE OFFICIAL PASS</span>
            </div>
            <div style={{ fontSize: '0.60rem', color: '#E0F2FE', marginTop: 2 }}>
              Lapasan National High School &bull; Gate Clearance
            </div>
          </div>

          {/* Card Body */}
          <div style={{ padding: '16px 14px' }}>
            <div style={{ margin: '0 auto 10px auto', display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  backgroundColor: '#F1F5F9',
                  border: '2px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {safePhoto ? (
                  <img
                    src={safePhoto}
                    alt={student.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <UserIcon size={28} color="#94A3B8" />
                )}
              </div>
            </div>

            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
              {student.name}
            </div>

            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569', marginTop: 4 }}>
              {selectedClass?.section_name || 'Authorized Member'}
            </div>

            {/* Identifier Badge with Copy Button */}
            <div
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                margin: '10px 0',
                padding: '4px 10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: '#0F172A',
                cursor: 'pointer',
              }}
              title="Click to copy identifier"
            >
              <span>ID: {identifier}</span>
              {copied ? <Check size={11} color="#10B981" /> : <Copy size={11} color="#94A3B8" />}
            </div>

            {/* High-Contrast QR Code for Gate Kiosks */}
            <div
              style={{
                margin: '8px auto',
                padding: 6,
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                width: 124,
                height: 124,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(identifier)}`}
                alt="Gate Pass QR"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>

          {/* Footer NFC / RFID State */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderTop: '1px solid #E2E8F0',
              padding: '8px 12px',
              fontSize: '0.68rem',
              color: '#475569',
            }}
          >
            Card UID:{' '}
            <strong style={{ color: student.rfid_uid ? '#10B981' : '#F59E0B' }}>
              {student.rfid_uid || 'No Card Linked'}
            </strong>
          </div>
        </div>

        {/* Modal Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%', justifyContent: 'center' }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
            <Printer size={15} style={{ marginRight: 6 }} />
            Print Pass
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentIdPassModal;