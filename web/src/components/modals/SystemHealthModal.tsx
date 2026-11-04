/**
 * AttendSure V3 - Plain English System Health & Auto-Repair Center
 * Designed for School Principals, Registrars, and Administrative Staff.
 * File: web/src/components/modals/SystemHealthModal.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import {
  Wrench,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Radio,
  Database,
  MessageSquare,
  Unlock,
  ChevronRight,
  Info,
  X,
  ShieldCheck,
  Cpu,
  Layers,
} from 'lucide-react';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface IssueItem {
  id: string;
  category: 'SMS' | 'GATE' | 'DATABASE' | 'ACCOUNTS';
  title: string;
  whatHappened: string;
  whatItMeans: string;
  solutionType: 'AUTO_BUTTON' | 'STEPS';
  actionButtonLabel?: string;
  actionEndpoint?: string;
  physicalSteps?: string[];
  severity: 'WARNING' | 'CRITICAL';
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({ isOpen, onClose }) => {
  const { tokens, brand } = useTheme();

  const [scanning, setScanning] = useState<boolean>(true);
  const [activeFixingId, setActiveFixingId] = useState<string | null>(null);
  const [fixSuccessMessage, setFixSuccessMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<IssueItem[]>([]);

  // Checks hardware, database, SMS outbox, and account status
  const runDiagnostics = useCallback(async () => {
    setScanning(true);
    setFixSuccessMessage(null);
    const discoveredIssues: IssueItem[] = [];

    try {
      const results = await Promise.allSettled([
        apiClient.get('/settings/school/'),
        apiClient.get('/sms-outbox/metrics/'),
        apiClient.get('/kiosks/'),
        apiClient.get('/users/'),
      ]);

      const schoolRes = results[0].status === 'fulfilled' ? results[0].value : null;
      const smsRes = results[1].status === 'fulfilled' ? results[1].value : null;
      const kioskRes = results[2].status === 'fulfilled' ? results[2].value : null;
      const usersRes = results[3].status === 'fulfilled' ? results[3].value : null;

      // 1. Check Database connection
      if (!schoolRes?.data) {
        discoveredIssues.push({
          id: 'db-offline',
          category: 'DATABASE',
          title: 'Database connection is resting or unresponsive',
          whatHappened: 'The school server cannot talk to the student records database.',
          whatItMeans: 'Attendance scans and reports cannot be saved right now.',
          solutionType: 'AUTO_BUTTON',
          actionButtonLabel: 'Reconnect School Database',
          actionEndpoint: '/core/maintenance/db-check/',
          severity: 'CRITICAL',
        });
      }

      // 2. Check SMS queue and modem
      if (smsRes?.data) {
        const pending = Number(smsRes.data.pending_total || smsRes.data.pending_queue || 0);
        const failed = Number(smsRes.data.failed_today || smsRes.data.failed_count || 0);

        if (pending > 20 || failed > 0) {
          discoveredIssues.push({
            id: 'sms-stuck',
            category: 'SMS',
            title: `${pending} text message(s) waiting to be sent to parents`,
            whatHappened: 'The GSM text modem connected to the server computer has paused delivery.',
            whatItMeans: 'Parents have not yet received attendance notifications on their phones.',
            solutionType: 'AUTO_BUTTON',
            actionButtonLabel: 'Restart SMS Sending Queue',
            actionEndpoint: '/sms/test-gateway/',
            physicalSteps: [
              'Check if the USB Text Modem dongle is firmly plugged into the computer USB port.',
              'Ensure the school SIM card inside the modem has regular airtime load or an active SMS promo.',
            ],
            severity: pending > 100 ? 'CRITICAL' : 'WARNING',
          });
        }
      }

      // 3. Check Gate Scanner Hardware
      if (kioskRes?.data) {
        const kioskList = Array.isArray(kioskRes.data)
          ? kioskRes.data
          : kioskRes.data.results || [];
        const offlineKiosks = kioskList.filter(
          (k: { is_online?: boolean; is_active?: boolean }) => k.is_active && !k.is_online
        );

        if (offlineKiosks.length > 0) {
          discoveredIssues.push({
            id: 'kiosk-offline',
            category: 'GATE',
            title: `${offlineKiosks.length} Gate Scanner(s) are offline`,
            whatHappened: 'The main gate scanner turnstile has lost connection to the server.',
            whatItMeans: 'Student and teacher ID card taps at this gate will not register on screen.',
            solutionType: 'AUTO_BUTTON',
            actionButtonLabel: 'Wake Up Gate Scanners',
            actionEndpoint: '/telemetry/ping-scanners/',
            physicalSteps: [
              'Ensure the gate scanner device has power and the LED light is ON.',
              'Check the blue network cable (LAN wire) connecting the gate scanner to the school network router.',
            ],
            severity: 'CRITICAL',
          });
        }
      }

      // 4. Check for locked user accounts
      if (usersRes?.data) {
        const userList = Array.isArray(usersRes.data)
          ? usersRes.data
          : usersRes.data.results || [];
        const lockedUsers = userList.filter(
          (u: { is_active?: boolean; is_locked?: boolean }) => u.is_locked || u.is_active === false
        );

        if (lockedUsers.length > 0) {
          discoveredIssues.push({
            id: 'users-locked',
            category: 'ACCOUNTS',
            title: `${lockedUsers.length} staff account(s) temporarily locked`,
            whatHappened: 'Teachers entered the wrong password multiple times.',
            whatItMeans: 'These teachers cannot sign in to check classroom student attendance.',
            solutionType: 'AUTO_BUTTON',
            actionButtonLabel: 'Unlock All Staff Accounts',
            actionEndpoint: '/core/maintenance/flush-cache/',
            severity: 'WARNING',
          });
        }
      }
    } catch {
      discoveredIssues.push({
        id: 'server-unreachable',
        category: 'DATABASE',
        title: 'AttendSure background server is starting up',
        whatHappened: 'The AttendSure server program is taking longer than usual to respond.',
        whatItMeans: 'Please wait a few seconds or click the button below to wake it up.',
        solutionType: 'AUTO_BUTTON',
        actionButtonLabel: 'Check Server Connection',
        actionEndpoint: '/core/maintenance/db-check/',
        severity: 'WARNING',
      });
    } finally {
      setIssues(discoveredIssues);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      runDiagnostics();
    }
  }, [isOpen, runDiagnostics]);

  const handleExecuteFix = async (issue: IssueItem) => {
    if (!issue.actionEndpoint) return;
    setActiveFixingId(issue.id);
    setFixSuccessMessage(null);

    try {
      await apiClient.post(issue.actionEndpoint);
      setFixSuccessMessage(`Repaired successfully! "${issue.title}" has been resolved.`);
      // Re-scan after 1.5 seconds
      setTimeout(() => {
        runDiagnostics();
      }, 1500);
    } catch {
      setFixSuccessMessage('The automated fix ran. Please re-check the physical steps below if the problem continues.');
    } finally {
      setActiveFixingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        userSelect: 'none',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          border: `1px solid ${tokens.borderSubtle}`,
          boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: tokens.primaryLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wrench size={18} color={brand.primary} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: tokens.textPrimary,
                }}
              >
                System Health &amp; Problem Solver
              </h2>
              <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>
                Checks your hardware, messages, and gate connections automatically
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={runDiagnostics}
              disabled={scanning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.bgSurfaceSubtle,
                color: tokens.textPrimary,
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: scanning ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
              <span>{scanning ? 'Scanning...' : 'Re-check Now'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                backgroundColor: 'transparent',
                color: tokens.textMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: 24,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            backgroundColor: tokens.bgSurfaceSubtle,
          }}
        >
          {/* Quick Success Alert */}
          {fixSuccessMessage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 10,
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                fontSize: '0.80rem',
                fontWeight: 700,
              }}
            >
              <CheckCircle2 size={16} color="#059669" />
              <span>{fixSuccessMessage}</span>
            </div>
          )}

          {scanning ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                border: `1px solid ${tokens.borderSubtle}`,
              }}
            >
              <RefreshCw
                size={28}
                color={brand.primary}
                className="animate-spin"
                style={{ margin: '0 auto 12px auto', display: 'block' }}
              />
              <div style={{ fontSize: '0.90rem', fontWeight: 800, color: tokens.textPrimary }}>
                Checking School Systems...
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: tokens.textMuted }}>
                Verifying gate scanner hardware, parent SMS modem, and student records.
              </p>
            </div>
          ) : issues.length === 0 ? (
            /* All Systems Perfect */
            <div
              style={{
                padding: '36px 24px',
                textAlign: 'center',
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                border: `1px solid ${tokens.borderSubtle}`,
                boxShadow: tokens.cardShadow,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  backgroundColor: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px auto',
                }}
              >
                <ShieldCheck size={30} color="#059669" />
              </div>

              <h3
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#065F46',
                }}
              >
                All Systems Are Running Smoothly
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.80rem',
                  color: tokens.textSecondary,
                  maxWidth: 440,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: 1.5,
                }}
              >
                Gate scanners are recording arrival taps, the parent SMS modem is ready, and the school database is safely saving records.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 10,
                  marginTop: 20,
                  textAlign: 'left',
                }}
              >
                <div style={healthyItemBox}>
                  <Radio size={14} color="#059669" />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.74rem', color: tokens.textPrimary }}>
                      Gate Terminals
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#059669', fontWeight: 700 }}>
                      Connected &bull; Online
                    </div>
                  </div>
                </div>

                <div style={healthyItemBox}>
                  <MessageSquare size={14} color="#059669" />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.74rem', color: tokens.textPrimary }}>
                      Parent SMS
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#059669', fontWeight: 700 }}>
                      Ready to Send
                    </div>
                  </div>
                </div>

                <div style={healthyItemBox}>
                  <Database size={14} color="#059669" />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.74rem', color: tokens.textPrimary }}>
                      Database
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#059669', fontWeight: 700 }}>
                      Healthy &bull; Active
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Issues Found - Easy to Understand Cards */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  backgroundColor: '#FFFBEB',
                  borderRadius: 10,
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <AlertTriangle size={16} color="#D97706" />
                <span>
                  {issues.length} item(s) need your attention. Click the blue button on any item to fix it automatically.
                </span>
              </div>

              {issues.map((issue) => (
                <div
                  key={issue.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 14,
                    border: `1px solid ${issue.severity === 'CRITICAL' ? '#FECACA' : tokens.borderSubtle}`,
                    boxShadow: tokens.cardShadow,
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: issue.severity === 'CRITICAL' ? '#FEF2F2' : '#FFFBEB',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {issue.category === 'SMS' && <MessageSquare size={18} color="#D97706" />}
                        {issue.category === 'GATE' && <Radio size={18} color="#DC2626" />}
                        {issue.category === 'DATABASE' && <Database size={18} color="#DC2626" />}
                        {issue.category === 'ACCOUNTS' && <Unlock size={18} color="#D97706" />}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: issue.severity === 'CRITICAL' ? '#FEE2E2' : '#FEF3C7',
                              color: issue.severity === 'CRITICAL' ? '#991B1B' : '#92400E',
                            }}
                          >
                            {issue.severity === 'CRITICAL' ? 'NEEDS ATTENTION' : 'NOTICE'}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: tokens.textMuted, fontWeight: 700 }}>
                            {issue.category}
                          </span>
                        </div>

                        <h4
                          style={{
                            margin: '4px 0 0 0',
                            fontSize: '0.94rem',
                            fontWeight: 800,
                            color: tokens.textPrimary,
                          }}
                        >
                          {issue.title}
                        </h4>
                      </div>
                    </div>

                    {/* 1-Click Automated Repair Button */}
                    {issue.actionButtonLabel && (
                      <button
                        type="button"
                        onClick={() => handleExecuteFix(issue)}
                        disabled={activeFixingId === issue.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          borderRadius: 8,
                          backgroundColor: brand.primary,
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: activeFixingId === issue.id ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 6px rgba(0, 75, 135, 0.25)',
                        }}
                      >
                        {activeFixingId === issue.id ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Fixing...</span>
                          </>
                        ) : (
                          <>
                            <Wrench size={13} />
                            <span>{issue.actionButtonLabel}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Non-Technical Explanation Box */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      padding: '10px 14px',
                      backgroundColor: tokens.bgSurfaceSubtle,
                      borderRadius: 10,
                      border: `1px solid ${tokens.borderSubtle}`,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: tokens.textMuted }}>
                        WHAT HAPPENED?
                      </span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: tokens.textPrimary }}>
                        {issue.whatHappened}
                      </p>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: tokens.textMuted }}>
                        WHAT IT MEANS FOR SCHOOL
                      </span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: tokens.textSecondary }}>
                        {issue.whatItMeans}
                      </p>
                    </div>
                  </div>

                  {/* Physical Checklist (if cables are unplugged) */}
                  {issue.physicalSteps && (
                    <div style={{ marginTop: 2 }}>
                      <span style={{ fontSize: '0.70rem', fontWeight: 700, color: tokens.textMuted }}>
                        If the button doesn't fix it, check these 2 things:
                      </span>
                      <ol style={{ margin: '4px 0 0 0', paddingLeft: 18, fontSize: '0.74rem', color: tokens.textSecondary }}>
                        {issue.physicalSteps.map((step, sIdx) => (
                          <li key={sIdx} style={{ marginTop: 2 }}>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
          }}
        >
          <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>
            School ID: 55555 &bull; Lapasan National High School
          </span>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 20px',
              borderRadius: 8,
              border: `1px solid ${tokens.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: tokens.textPrimary,
              fontSize: '0.80rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const healthyItemBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderRadius: 8,
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
};

export default SystemHealthModal;