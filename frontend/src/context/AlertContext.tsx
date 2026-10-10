/**
 * AttendSure V3 - Global Modern Alert & Confirmation System
 * File: frontend/src/context/AlertContext.tsx
 */

import React, { createContext, useContext, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  X,
  Loader2,
} from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertOptions {
  title: string;
  message: string;
  type?: AlertType;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  showConfirm: (options: ConfirmOptions) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertData, setAlertData] = useState<AlertOptions | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmOptions | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const showAlert = (options: AlertOptions) => {
    setAlertData(options);
  };

  const showConfirm = (options: ConfirmOptions) => {
    setConfirmData(options);
  };

  const handleConfirmAction = async () => {
    if (!confirmData) return;
    try {
      setIsConfirmLoading(true);
      await confirmData.onConfirm();
      setConfirmData(null);
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const handleAlertAction = () => {
    if (alertData?.onAction) {
      alertData.onAction();
    }
    setAlertData(null);
  };

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={24} color="#059669" />;
      case 'error':
        return <XCircle size={24} color="#dc2626" />;
      case 'warning':
        return <AlertTriangle size={24} color="#d97706" />;
      case 'info':
      default:
        return <Info size={24} color="#0284c7" />;
    }
  };

  const getAlertColorTheme = (type: AlertType) => {
    switch (type) {
      case 'success':
        return { bg: '#ecfdf5', border: '#a7f3d0', headerColor: '#065f46' };
      case 'error':
        return { bg: '#fef2f2', border: '#fecaca', headerColor: '#991b1b' };
      case 'warning':
        return { bg: '#fffbeb', border: '#fde68a', headerColor: '#92400e' };
      case 'info':
      default:
        return { bg: '#f0f9ff', border: '#bae6fd', headerColor: '#075985' };
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {/* 1. INFORMATIONAL / ACTION ALERT MODAL */}
      {alertData && (
        <div style={overlayStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  ...iconContainerStyle,
                  backgroundColor: getAlertColorTheme(alertData.type || 'info').bg,
                  border: `1px solid ${getAlertColorTheme(alertData.type || 'info').border}`,
                }}
              >
                {getAlertIcon(alertData.type || 'info')}
              </div>

              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  {alertData.title}
                </h3>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                  {alertData.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAlertData(null)}
                style={closeBtnStyle}
                title="Close"
              >
                <X size={16} color="#64748b" />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              {alertData.actionLabel ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAlertData(null)}
                    style={secondaryBtnStyle}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={handleAlertAction}
                    style={primaryBtnStyle}
                  >
                    {alertData.actionLabel}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setAlertData(null)}
                  style={primaryBtnStyle}
                >
                  Okay
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. CONFIRMATION DIALOG MODAL */}
      {confirmData && (
        <div style={overlayStyle}>
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  ...iconContainerStyle,
                  backgroundColor: confirmData.isDestructive ? '#fef2f2' : '#eff6ff',
                  border: `1px solid ${confirmData.isDestructive ? '#fecaca' : '#bfdbfe'}`,
                }}
              >
                {confirmData.isDestructive ? (
                  <AlertTriangle size={24} color="#dc2626" />
                ) : (
                  <Info size={24} color="#0284c7" />
                )}
              </div>

              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  {confirmData.title}
                </h3>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                  {confirmData.message}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                disabled={isConfirmLoading}
                onClick={() => setConfirmData(null)}
                style={secondaryBtnStyle}
              >
                {confirmData.cancelLabel || 'Cancel'}
              </button>

              <button
                type="button"
                disabled={isConfirmLoading}
                onClick={handleConfirmAction}
                style={{
                  ...primaryBtnStyle,
                  backgroundColor: confirmData.isDestructive ? '#dc2626' : '#0284c7',
                }}
              >
                {isConfirmLoading ? (
                  <Loader2 className="animate-spin" size={14} style={{ marginRight: 6 }} />
                ) : null}
                {confirmData.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalBoxStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  backgroundColor: '#ffffff',
  borderRadius: 12,
  padding: 18,
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  border: '1px solid #e2e8f0',
};

const iconContainerStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: '#0284c7',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  padding: '7px 16px',
  fontSize: '0.80rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  color: '#334155',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '7px 14px',
  fontSize: '0.80rem',
  fontWeight: 600,
  cursor: 'pointer',
};