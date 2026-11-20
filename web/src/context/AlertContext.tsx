/**
 * AttendSure - Global Alert & Confirmation System (Referentially Stable)
 * File: web/src/context/AlertContext.tsx
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, Loader2 } from 'lucide-react';
import { extractApiError } from '../api/routes';
import { useTheme } from './ThemeContext';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertOptions {
  title: string;
  message: string | unknown;
  type?: AlertType;
  actionLabel?: string;
  autoCloseDuration?: number;
  onAction?: () => void;
  onClose?: () => void;
}

export interface ConfirmOptions {
  title: string;
  message: string | unknown;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
}

interface AlertContextType {
  showAlert: (options: AlertOptions) => void;
  showConfirm: (options: ConfirmOptions) => void;
  closeAlert: () => void;
  closeConfirm: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

const toSafeString = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.includes('Traceback (most recent call last)')) {
      return 'Something went wrong on the server. Please try again.';
    }
    return trimmed;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return extractApiError(val, 'An unexpected error occurred. Please try again.');
};

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tokens, brand } = useTheme();
  const [alertData, setAlertData] = useState<AlertOptions | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmOptions | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const alertDataRef = useRef<AlertOptions | null>(null);
  const confirmDataRef = useRef<ConfirmOptions | null>(null);
  const confirmLoadingRef = useRef<boolean>(false);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  alertDataRef.current = alertData;
  confirmDataRef.current = confirmData;
  confirmLoadingRef.current = isConfirmLoading;

  const closeAlert = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    const current = alertDataRef.current;
    alertDataRef.current = null;
    setAlertData(null);
    current?.onClose?.();
  }, []);

  const closeConfirm = useCallback(() => {
    if (confirmLoadingRef.current) return;
    const current = confirmDataRef.current;
    confirmDataRef.current = null;
    setConfirmData(null);
    current?.onCancel?.();
  }, []);

  const showAlert = useCallback(
    (options: AlertOptions) => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }

      const normalized: AlertOptions = {
        ...options,
        title: toSafeString(options.title) || 'Notification',
        message: toSafeString(options.message),
      };
      alertDataRef.current = normalized;
      setAlertData(normalized);

      if (options.type === 'success' && !options.actionLabel) {
        const duration = options.autoCloseDuration ?? 3500;
        autoCloseTimerRef.current = setTimeout(() => {
          closeAlert();
        }, duration);
      }
    },
    [closeAlert]
  );

  const showConfirm = useCallback((options: ConfirmOptions) => {
    const normalized: ConfirmOptions = {
      ...options,
      title: toSafeString(options.title) || 'Confirm Action',
      message: toSafeString(options.message),
    };
    confirmDataRef.current = normalized;
    setConfirmData(normalized);
  }, []);

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDataRef.current && !confirmLoadingRef.current) {
          closeConfirm();
        } else if (alertDataRef.current) {
          closeAlert();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeAlert, closeConfirm]);

  const handleConfirmAction = async () => {
    const activeConfirm = confirmDataRef.current;
    if (!activeConfirm || confirmLoadingRef.current) return;
    try {
      setIsConfirmLoading(true);
      confirmLoadingRef.current = true;
      await activeConfirm.onConfirm();
      confirmDataRef.current = null;
      setConfirmData(null);
    } catch (err) {
      showAlert({
        title: 'Action Error',
        message: err,
        type: 'error',
      });
    } finally {
      confirmLoadingRef.current = false;
      setIsConfirmLoading(false);
    }
  };

  const handleAlertAction = () => {
    alertDataRef.current?.onAction?.();
    closeAlert();
  };

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 size={24} color={tokens.success} />;
      case 'error':
        return <XCircle size={24} color={tokens.danger} />;
      case 'warning':
        return <AlertTriangle size={24} color={tokens.warning} />;
      case 'info':
      default:
        return <Info size={24} color={brand.primary} />;
    }
  };

  const getAlertColorTheme = (type: AlertType) => {
    switch (type) {
      case 'success':
        return { bg: tokens.successBg, border: tokens.borderSubtle };
      case 'error':
        return { bg: tokens.dangerBg, border: tokens.borderSubtle };
      case 'warning':
        return { bg: tokens.warningBg, border: tokens.borderSubtle };
      case 'info':
      default:
        return { bg: brand.primarySoft, border: tokens.borderSubtle };
    }
  };

  const modalBoxStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 420,
    backgroundColor: tokens.bgSurface,
    borderRadius: 12,
    padding: 18,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
    border: `1px solid ${tokens.borderSubtle}`,
  };

  const primaryBtnStyle: React.CSSProperties = {
    backgroundColor: brand.buttonBg,
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
    backgroundColor: tokens.bgSurfaceSubtle,
    color: tokens.textPrimary,
    border: `1px solid ${tokens.borderInput}`,
    borderRadius: 6,
    padding: '7px 14px',
    fontSize: '0.80rem',
    fontWeight: 600,
    cursor: 'pointer',
  };

  const contextValue = useMemo(
    () => ({ showAlert, showConfirm, closeAlert, closeConfirm }),
    [showAlert, showConfirm, closeAlert, closeConfirm]
  );

  return (
    <AlertContext.Provider value={contextValue}>
      {children}

      {alertData && (
        <div style={overlayStyle} role="dialog" aria-modal="true">
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

              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {alertData.title}
                </h3>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '0.82rem',
                    color: tokens.textSecondary,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}
                >
                  {String(alertData.message)}
                </p>
              </div>

              <button
                type="button"
                onClick={closeAlert}
                style={closeBtnStyle}
                title="Close"
                aria-label="Close alert"
              >
                <X size={16} color={tokens.textMuted} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              {alertData.actionLabel ? (
                <>
                  <button type="button" onClick={closeAlert} style={secondaryBtnStyle}>
                    Dismiss
                  </button>
                  <button type="button" onClick={handleAlertAction} style={primaryBtnStyle}>
                    {alertData.actionLabel}
                  </button>
                </>
              ) : (
                <button type="button" onClick={closeAlert} style={primaryBtnStyle}>
                  Okay
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmData && (
        <div style={overlayStyle} role="dialog" aria-modal="true">
          <div style={modalBoxStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  ...iconContainerStyle,
                  backgroundColor: confirmData.isDestructive ? tokens.dangerBg : brand.primarySoft,
                  border: `1px solid ${tokens.borderSubtle}`,
                }}
              >
                {confirmData.isDestructive ? (
                  <AlertTriangle size={24} color={tokens.danger} />
                ) : (
                  <Info size={24} color={brand.primary} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {confirmData.title}
                </h3>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '0.82rem',
                    color: tokens.textSecondary,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}
                >
                  {String(confirmData.message)}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                disabled={isConfirmLoading}
                onClick={closeConfirm}
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
                  backgroundColor: confirmData.isDestructive ? '#dc2626' : brand.buttonBg,
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
  backgroundColor: 'rgba(15, 23, 42, 0.55)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
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