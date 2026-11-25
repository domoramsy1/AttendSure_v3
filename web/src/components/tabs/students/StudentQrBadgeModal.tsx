// AttendSure Web - Student QR ID Card Preview & Print Modal
// File: D:\AttendSure_V3\web\src\components\tabs\students\StudentQrBadgeModal.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { QR_COLORS } from '../../../theme/tokens';
import { ProfileAvatar } from '../../common/ProfileAvatar';
import { QrCodeSvg, buildQrSvgDataUri } from '../../common/QrCodeSvg';
import {
  buildStudentQrPassPrintPayload,
  printHtmlWithPageSetup,
} from '../../../utils/reportExporters';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { Printer, ShieldCheck } from 'lucide-react';
import { maskQrToken, type StudentRecord } from './types';

interface StudentQrBadgeModalProps {
  student: StudentRecord | null;
  schoolName: string;
  onClose: () => void;
}

export const StudentQrBadgeModal: React.FC<StudentQrBadgeModalProps> = ({
  student,
  schoolName,
  onClose,
}) => {
  const { tokens, brand, fonts } = useTheme();
  if (!student) return null;

  return (
    <Modal isOpen={Boolean(student)} onClose={onClose} title="Student QR ID Card">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          style={{
            width: 292,
            backgroundColor: tokens.bgSurface,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: brand.primary,
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ backgroundColor: brand.buttonBg, color: tokens.onPrimary, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: fonts.size.xs, fontWeight: 800 }}>
              <ShieldCheck size={14} /> OFFICIAL STUDENT QR PASS
            </div>
            <div style={{ fontSize: '0.64rem', opacity: 0.9, marginTop: 2 }}>{schoolName}</div>
          </div>

          <div style={{ padding: '16px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <ProfileAvatar photoUrl={student.photo_url || student.photo} name={student.full_name} size={56} iconSize={26} />
            </div>
            <div style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>
              {student.full_name}
            </div>
            <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>
              {student.current_section || 'Enrolled Student'}
            </div>
            <div
              style={{
                margin: '8px auto',
                padding: '3px 10px',
                backgroundColor: tokens.bgSurfaceSubtle,
                borderRadius: 6,
                fontFamily: fonts.mono,
                fontWeight: 700,
                fontSize: fonts.size.sm,
                display: 'inline-block',
              }}
            >
              LRN: {student.lrn}
            </div>
            <div
              style={{
                width: 124,
                height: 124,
                margin: '8px auto',
                padding: 6,
                backgroundColor: QR_COLORS.background,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: tokens.borderSubtle,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCodeSvg
                value={student.qr_payload || student.lrn}
                size={112}
                label={`QR code for ${student.full_name}`}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => {
              printHtmlWithPageSetup(
                buildStudentQrPassPrintPayload({
                  studentName: student.full_name,
                  lrn: student.lrn,
                  sectionLabel: student.current_section || 'Enrolled Student',
                  schoolName,
                  qrDataUri: buildQrSvgDataUri(student.qr_payload || student.lrn, 180),
                  photoUrl: student.photo_url || student.photo,
                  statusLabel: student.qr_token ? `Active (${maskQrToken(student.qr_token)})` : 'LRN Mode',
                })
              );
            }}
            icon={<Printer size={14} />}
          >
            Print Pass
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentQrBadgeModal;
