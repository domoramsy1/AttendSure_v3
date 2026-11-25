// AttendSure Web - Digital Teacher ID Pass Preview Modal
// File: D:\AttendSure_V3\web\src\components\tabs\teachers\TeacherIdPassModal.tsx

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { QR_COLORS } from '../../../theme/tokens';
import { AttendSureBrandBadge } from '../../branding/BrandAssets';
import { QrCodeSvg } from '../../common/QrCodeSvg';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { getInitials, getSafeAvatarUrl, type Teacher } from './types';

interface TeacherIdPassModalProps {
  teacher: Teacher | null;
  schoolName: string;
  canResetPhoneLock: boolean;
  resettingDeviceId: number | null;
  onResetDeviceBinding: (teacher: Teacher) => void;
  onClose: () => void;
}

export const TeacherIdPassModal: React.FC<TeacherIdPassModalProps> = ({
  teacher,
  schoolName,
  canResetPhoneLock,
  resettingDeviceId,
  onResetDeviceBinding,
  onClose,
}) => {
  const { tokens, brand, fonts, radius } = useTheme();

  if (!teacher) return null;

  const avatarUrl = getSafeAvatarUrl(teacher);
  const qrValue = `ATTENDSURE:TEACHER:${teacher.employee_id}`;

  return (
    <Modal
      isOpen={Boolean(teacher)}
      onClose={onClose}
      title="Digital Teacher ID Pass"
      maxWidth="420px"
    >
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          color: tokens.textPrimary,
          margin: -20,
          padding: 20,
          fontFamily: fonts.sans,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div
            style={{
              width: '100%',
              maxWidth: 310,
              backgroundColor: tokens.bgSurface,
              border: `2px solid ${brand.primary}`,
              borderRadius: radius.xl,
              overflow: 'hidden',
              boxShadow: tokens.cardShadow,
            }}
          >
            <div
              style={{
                backgroundColor: brand.buttonBg,
                color: tokens.onPrimary,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
              }}
            >
              <AttendSureBrandBadge size={34} mode="light" />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fonts.size.sm,
                    fontWeight: fonts.weight.extrabold,
                    letterSpacing: '0.4px',
                  }}
                >
                  ATTENDSURE TEACHER PASS
                </div>
                <div
                  style={{
                    fontSize: fonts.size.xs,
                    color: tokens.onPrimary,
                    opacity: 0.85,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {schoolName}
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 14px' }}>
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: '50%',
                  margin: '0 auto 10px',
                  overflow: 'hidden',
                  border: `2px solid ${brand.primary}`,
                  backgroundColor: tokens.primaryLight,
                  color: brand.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: fonts.weight.extrabold,
                  fontSize: fonts.size.lg,
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={teacher.full_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  getInitials(teacher.full_name || teacher.first_name)
                )}
              </div>

              <div style={{ fontSize: fonts.size.md, fontWeight: fonts.weight.extrabold, color: tokens.textPrimary }}>
                {teacher.full_name}
              </div>
              <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>
                {teacher.position}
              </div>
              <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted }}>{teacher.department}</div>

              <div
                style={{
                  margin: '12px auto',
                  width: 120,
                  height: 120,
                  padding: 6,
                  backgroundColor: QR_COLORS.background,
                  borderRadius: radius.md,
                  border: `1px solid ${tokens.borderSubtle}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <QrCodeSvg
                  value={qrValue}
                  size={108}
                  label={`Teacher verification QR code for ${teacher.full_name}`}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              <div
                style={{
                  fontSize: fonts.size.sm,
                  fontFamily: fonts.mono,
                  fontWeight: fonts.weight.bold,
                  color: tokens.textPrimary,
                }}
              >
                ID: {teacher.employee_id}
              </div>
            </div>

            <div
              style={{
                backgroundColor: tokens.bgSurfaceSubtle,
                padding: '10px 12px',
                borderTop: `1px solid ${tokens.borderSubtle}`,
                fontSize: fonts.size.xs,
                color: tokens.textSecondary,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                Mobile Time In / Out:{' '}
                {teacher.bound_device_id
                  ? teacher.device_model || 'Linked Phone Active'
                  : 'Pairs on first mobile Time In'}
              </div>
              <div style={{ color: tokens.textMuted }}>
                On-device phone lock &amp; Campus GPS only. Zero face photos or private keys ever leave the teacher&apos;s phone.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {canResetPhoneLock && teacher.bound_device_id && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => onResetDeviceBinding(teacher)}
                loading={resettingDeviceId === teacher.id}
                icon={<RotateCcw size={14} />}
              >
                Reset Phone Lock
              </Button>
            )}
            <Button variant="primary" size="md" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
