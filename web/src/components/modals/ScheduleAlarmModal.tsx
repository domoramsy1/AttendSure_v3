// AttendSure Web - Schedule Alarm Modal
// File: D:\AttendSure_V3\web\src\components\modals\ScheduleAlarmModal.tsx

/**
 * AttendSure Web - Active Alarm & Schedule Reminder Popup Modal
 * File: web/src/components/modals/ScheduleAlarmModal.tsx
 */

import React from 'react';
import { BellRing, Clock, Volume2, ArrowRight, AlarmClockOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { ActiveAlarmEvent } from '../../utils/scheduleAlarms';
import type { NavItemKey } from '../layout/Sidebar';

interface ScheduleAlarmModalProps {
  alarm: ActiveAlarmEvent | null;
  onDismiss: () => void;
  onSnooze: () => void;
  onNavigateTab: (tab: NavItemKey) => void;
}

export const ScheduleAlarmModal: React.FC<ScheduleAlarmModalProps> = ({
  alarm,
  onDismiss,
  onSnooze,
  onNavigateTab,
}) => {
  const { tokens, brand, fonts, radius, ui } = useTheme();

  if (!alarm) return null;

  const accentColor =
    alarm.kind === 'TIME_IN'
      ? brand.success
      : alarm.kind === 'TIME_OUT'
        ? brand.warning
        : brand.primary;

  const accentSoft =
    alarm.kind === 'TIME_IN'
      ? tokens.successLight
      : alarm.kind === 'TIME_OUT'
        ? tokens.warningLight
        : tokens.primaryLight;

  return (
    <Modal isOpen={Boolean(alarm)} onClose={onDismiss} title="Schedule & Time In / Out Alarm" maxWidth="460px">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            backgroundColor: accentSoft,
            borderWidth: 2,
            borderStyle: 'solid',
            borderColor: accentColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BellRing size={32} color={accentColor} />
        </div>

        <div>
          <span style={ui.badge(accentSoft, accentColor)}>
            <Volume2 size={11} /> ALARM RINGING
          </span>
          <h3
            style={{
              margin: '8px 0 4px',
              fontSize: fonts.size.lg,
              fontWeight: 900,
              color: tokens.textPrimary,
            }}
          >
            {alarm.title}
          </h3>
          <div style={{ fontSize: fonts.size.sm, fontWeight: 700, color: tokens.textSecondary }}>
            {alarm.subtitle}
          </div>
        </div>

        <div
          style={{
            ...ui.subtleBox,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: radius.md,
          }}
        >
          <Clock size={16} color={accentColor} />
          <span style={{ fontSize: fonts.size.md, fontWeight: 900, color: tokens.textPrimary, fontFamily: fonts.mono }}>
            {alarm.timeLabel}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: fonts.size.sm, color: tokens.textSecondary, lineHeight: 1.5 }}>
          {alarm.detail}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 4 }}>
          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={() => {
              onDismiss();
              onNavigateTab(alarm.targetTab);
            }}
            icon={<ArrowRight size={15} />}
          >
            {alarm.actionLabel}
          </Button>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={onSnooze} style={{ flex: 1 }}>
              Snooze 5 min
            </Button>
            <Button
              variant="secondary"
              size="md"
              type="button"
              onClick={onDismiss}
              icon={<AlarmClockOff size={14} />}
              style={{ flex: 1 }}
            >
              Stop Alarm
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ScheduleAlarmModal;
