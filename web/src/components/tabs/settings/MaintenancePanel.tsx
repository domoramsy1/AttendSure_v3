/**
 * AttendSure - Self-Service Maintenance & Health Diagnostics Panel
 * File: web/src/components/tabs/settings/MaintenancePanel.tsx
 */

import React from 'react';
import apiClient from '../../../api/client';
import { API_ROUTES } from '../../../api/routes';
import { useTheme } from '../../../context/ThemeContext';
import { Button } from '../../ui/Button';
import {
  HardDrive,
  KeyRound,
  Loader2,
  Radio,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { MaintenanceHealthStatus } from './types';

interface MaintenancePanelProps {
  health: MaintenanceHealthStatus;
  actionLoading: string | null;
  onRefreshDiagnostics: () => void;
  onRunAction: (
    actionKey: string,
    title: string,
    description: string,
    apiCall: () => Promise<unknown>
  ) => void;
}

export const MaintenancePanel: React.FC<MaintenancePanelProps> = ({
  health,
  actionLoading,
  onRefreshDiagnostics,
  onRunAction,
}) => {
  const { tokens, brand } = useTheme();

  const cardStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 14,
    padding: '18px 22px',
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
  };

  const statBoxStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurfaceSubtle,
    borderRadius: 8,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  };

  const actionCardStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 12,
    border: `1px solid ${tokens.borderSubtle}`,
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: tokens.cardShadow,
  };

  const actionBtnStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: color,
    color: tokens.onPrimary,
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
    width: '100%',
  });

  const actionItems = [
    {
      key: 'RUN_LOAFING_AUDIT',
      title: 'Run Student Cutting Audit',
      subtitle: 'Checks student cutting classes and overdue exit passes',
      description:
        "Scans today's period attendance and active exit passes to flag students cutting a later class period without an exit pass.",
      confirmDesc: 'Checks all active sections today for student cutting alerts and overdue exit passes.',
      btnLabel: 'Run Cutting Audit Now',
      busyLabel: 'Running Audit...',
      iconBg: tokens.warningLight,
      iconColor: brand.warning,
      btnColor: brand.buttonBg,
      Icon: ShieldAlert,
      call: () => apiClient.post(API_ROUTES.reports.systemStatus, { action: 'RUN_LOAFING_AUDIT' }),
    },
    {
      key: 'FLUSH_CACHE',
      title: 'Clean System Memory',
      subtitle: 'Clears saved cache and speeds up screens',
      description:
        'If class lists appear outdated or the portal feels slow, click to clear temporary server memory and refresh data immediately without restarting.',
      confirmDesc:
        'This safely empties temporary cache files so fresh records load from the database.',
      btnLabel: 'Clean Memory & Refresh',
      busyLabel: 'Cleaning...',
      iconBg: tokens.primaryLight,
      iconColor: brand.primary,
      btnColor: brand.buttonBg,
      Icon: RefreshCw,
      BtnIcon: HardDrive,
      call: () => apiClient.post(API_ROUTES.health.flushCache),
    },
    {
      key: 'VERIFY_STATION',
      title: 'Check Camera QR & Campus GPS',
      subtitle: 'Checks built-in camera QR and Teacher Time In / Out status',
      description:
        'Verifies that classroom built-in camera QR scanning and teacher Phone Fingerprint / Biometric & Campus GPS Time In / Time Out are online and syncing cleanly.',
      confirmDesc:
        'Checks connectivity for classroom camera QR attendance and teacher mobile GPS Time In / Time Out services.',
      btnLabel: 'Check Attendance Services',
      busyLabel: 'Checking...',
      iconBg: tokens.successLight,
      iconColor: brand.success,
      btnColor: brand.success,
      Icon: Radio,
      call: () => apiClient.get(API_ROUTES.reports.systemStatus, { params: { nocache: 1 } }),
    },
    {
      key: 'UNLOCK_ACCOUNTS',
      title: 'Unlock Teacher Accounts',
      subtitle: 'Unfreezes accounts locked by wrong passwords',
      description:
        'If a teacher or administrator is locked out after entering the wrong password 5 times, click here to clear failed attempts so they can sign in right away.',
      confirmDesc:
        'This resets failed login attempts and clears temporary lockouts for locked accounts across the school.',
      btnLabel: 'Unlock Teacher Accounts',
      busyLabel: 'Unlocking...',
      iconBg: tokens.infoLight,
      iconColor: brand.secondary,
      btnColor: brand.buttonBg,
      Icon: KeyRound,
      call: () => apiClient.post(API_ROUTES.accounts.unlockAccounts),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          ...cardStyle,
          borderLeft: `4px solid ${health.database === 'ONLINE' ? brand.success : brand.danger}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: health.database === 'ONLINE' ? brand.success : brand.danger,
                  boxShadow: `0 0 8px ${health.database === 'ONLINE' ? brand.success : brand.danger}`,
                }}
              />
              <strong style={{ fontSize: '0.94rem', color: tokens.textPrimary }}>
                {health.database === 'ONLINE'
                  ? 'System Database is Healthy & Online'
                  : 'Attention: Database Disconnected'}
              </strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: tokens.textSecondary, marginTop: 3, display: 'block' }}>
              Response time: {health.dbLatencyMs}ms &bull; Last checked at {health.lastChecked || 'Just now'}
            </span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onRefreshDiagnostics}
            icon={<RefreshCw size={13} />}
          >
            Check Status Now
          </Button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: 10,
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${tokens.borderSubtle}`,
          }}
        >
          <div style={statBoxStyle}>
            <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>
              DATABASE HEALTH
            </span>
            <div
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: health.database === 'ONLINE' ? brand.success : brand.danger,
              }}
            >
              {health.database === 'ONLINE' ? 'Active (Connected)' : 'Disconnected'}
            </div>
          </div>

          <div style={statBoxStyle}>
            <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>
              TEACHERS ON CAMPUS
            </span>
            <div
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: health.teachersOnline > 0 ? brand.primary : brand.warning,
              }}
            >
              {health.teachersOnline} of {health.teachersTotal} Timed In
            </div>
          </div>

          <div style={statBoxStyle}>
            <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>
              OPEN LOAFING &amp; CUTTING ALERTS
            </span>
            <div
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: health.openLoafingIncidents > 0 ? brand.danger : brand.success,
              }}
            >
              {health.openLoafingIncidents} Open
            </div>
          </div>

          <div style={statBoxStyle}>
            <span style={{ fontSize: '0.66rem', color: tokens.textMuted, fontWeight: 700 }}>
              ACTIVE EXIT PASSES
            </span>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: brand.primary }}>
              {health.activeExitPasses} Approved
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: 14,
        }}
      >
        {actionItems.map((item) => {
          const HeaderIcon = item.Icon;
          const ActionIcon = item.BtnIcon || item.Icon;
          const isBusy = actionLoading === item.key;
          return (
            <div key={item.key} style={actionCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: item.iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HeaderIcon size={18} color={item.iconColor} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                    {item.title}
                  </h3>
                  <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>{item.subtitle}</span>
                </div>
              </div>
              <p style={{ margin: '8px 0 14px 0', fontSize: '0.74rem', color: tokens.textSecondary, lineHeight: 1.4 }}>
                {item.description}
              </p>
              <button
                type="button"
                disabled={actionLoading !== null}
                onClick={() => onRunAction(item.key, item.title, item.confirmDesc, item.call)}
                style={actionBtnStyle(item.btnColor)}
              >
                {isBusy ? <Loader2 className="animate-spin" size={14} /> : <ActionIcon size={14} />}
                <span>{isBusy ? item.busyLabel : item.btnLabel}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
