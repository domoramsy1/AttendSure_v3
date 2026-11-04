/**
 * AttendSure - Gate Log Inspection & Camera Snapshot Modal
 * File: web/src/components/modals/GateLogInspectionModal.tsx
 */

import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { StatusBadge } from '../common/StatusBadge';
import type { GateLogItem } from '../tabs/GateLogsTab';

interface GateLogInspectionModalProps {
  log: GateLogItem | null;
  onClose: () => void;
}

export const GateLogInspectionModal: React.FC<GateLogInspectionModalProps> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <Modal isOpen={Boolean(log)} onClose={onClose} title="Gate Transaction Verification">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            backgroundColor: 'var(--bg-surface-subtle, #f1f5f9)',
            borderRadius: 10,
          }}
        >
          <ProfileAvatar name={log.name} size={48} iconSize={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
              {log.name}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
              Identifier: <strong style={{ fontFamily: 'monospace' }}>{log.identifier}</strong>
            </div>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary, #64748b)', marginTop: 1 }}>
              Type: {log.person_type}
            </div>
          </div>
        </div>

        {log.snapshot_url && (
          <div style={{ width: '100%', height: 220, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' }}>
            <img
              src={log.snapshot_url}
              alt="Gate Snapshot"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={fieldInfoBox}>
            <span style={fieldInfoLabel}>DIRECTION</span>
            <StatusBadge status={log.direction} type="DIRECTION" />
          </div>
          <div style={fieldInfoBox}>
            <span style={fieldInfoLabel}>SCAN METHOD</span>
            <strong style={{ fontSize: '0.80rem', color: 'var(--text-primary, #0f172a)' }}>
              {log.scan_method}
            </strong>
          </div>
          <div style={fieldInfoBox}>
            <span style={fieldInfoLabel}>TERMINAL</span>
            <strong style={{ fontSize: '0.80rem', color: 'var(--text-primary, #0f172a)' }}>
              {log.kiosk}
            </strong>
          </div>
          <div style={fieldInfoBox}>
            <span style={fieldInfoLabel}>RECORDED TIME</span>
            <strong style={{ fontSize: '0.80rem', color: 'var(--text-primary, #0f172a)' }}>
              {log.scan_time}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const fieldInfoBox: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '8px 12px',
  backgroundColor: 'var(--bg-surface-subtle, #f1f5f9)',
  borderRadius: 8,
};

const fieldInfoLabel: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  color: 'var(--text-muted, #94a3b8)',
  letterSpacing: '0.4px',
};

export default GateLogInspectionModal;