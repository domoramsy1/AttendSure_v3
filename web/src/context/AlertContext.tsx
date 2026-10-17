/**
 * AttendSure - Global Modern Alert & Confirmation System
 * File: web/src/context/AlertContext.tsx
 *
 * Cybersecurity & Stability Hardening:
 * 1. Safe Type Parsing: Converts raw objects/arrays to clean text to prevent UI render crashes.
 * 2. Unhandled Exception Shield: Encapsulates async confirmations in try-catch-finally.
 * 3. Keyboard & Focus Trap Protection: Adds native Escape key dismiss handlers.
 * 4. Fast Auto-Dismiss: Closes non-critical success notifications automatically after 3.5 seconds.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
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
  message: string | unknown;
  type?: AlertType;
  actionLabel?: string;
  autoCloseDuration?: number; // Milliseconds (defaults to 3500ms for success)
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

/**
 * Defensive Sanitizer: Ensures message is always a safe, readable string.
 * Prevents React child injection crashes from raw backend error dictionaries.
 */
const toSafeString = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Error) return val.message;
  try {
    return JSON.stringify(val);
  } catch {
    return 'An unexpected system event occurred.';
  }
};

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [alertData, setAlertData] = useState<AlertOptions | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmOptions | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeAlert = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (alertData?.onClose) {
      alertData.onClose();
    }
    setAlertData(null);
  }, [alertData]);

  const closeConfirm = useCallback(() => {
    if (isConfirmLoading) return;
    if (confirmData?.onCancel) {
      confirmData.onCancel();
    }
    setConfirmData(null);
  }, [confirmData, isConfirmLoading]);

  const showAlert = useCallback(
    (options: AlertOptions) => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }

      setAlertData({
        ...options,
        title: toSafeString(options.title) || 'Notification',
        message: toSafeString(options.message),
      });

      // Auto-dismiss success notifications to keep workflows fast
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
    setConfirmData({
      ...options,
      title: toSafeString(options.title) || 'Confirm Action',
      message: toSafeString(options.message),
    });
  }, []);

  // Keyboard navigation safeguard (Escape key closes modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmData && !isConfirmLoading) {
          closeConfirm();
        } else if (alertData) {
          closeAlert();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alertData, confirmData, isConfirmLoading, closeAlert, closeConfirm]);

  const handleConfirmAction = async () => {
    if (!confirmData || isConfirmLoading) return;
    try {
      setIsConfirmLoading(true);
      await confirmData.onConfirm();
      setConfirmData(null);
    } catch (err) {
      console.error('[AlertContext] Confirm action failed:', err);
      // Display error modal if confirmation action throws
      showAlert({
        title: 'Action Error',
        message: err,
        type: 'error',
      });
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const handleAlertAction = () => {
    if (alertData?.onAction) {
      alertData.onAction();
    }
    closeAlert();
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
        return { bg: '#ecfdf5', border: '#a7f3d0' };
      case 'error':
        return { bg: '#fef2f2', border: '#fecaca' };
      case 'warning':
        return { bg: '#fffbeb', border: '#fde68a' };
      case 'info':
      default:
        return { bg: '#f0f9ff', border: '#bae6fd' };
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, closeAlert, closeConfirm }}>
      {children}

      {/* 1. INFORMATIONAL / ACTION ALERT MODAL */}
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
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  {alertData.title}
                </h3>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '0.82rem',
                    color: '#475569',
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
                <X size={16} color="#64748b" />
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

      {/* 2. CONFIRMATION DIALOG MODAL */}
      {confirmData && (
        <div style={overlayStyle} role="dialog" aria-modal="true">
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

              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  {confirmData.title}
                </h3>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: '0.82rem',
                    color: '#475569',
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

// ============================================================================
// STYLES
// ============================================================================

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