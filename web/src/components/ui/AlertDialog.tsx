/**
 * AttendSure - Resilient Modal Dialog
 * File: web/src/components/ui/AlertDialog.tsx
 *
 * Cybersecurity & Stability Hardening:
 * 1. Safe Child Parsing: Safely converts objects, errors, and arrays to text to prevent React rendering crashes.
 * 2. Focus & Escape Handling: Automatically focuses primary action and supports Escape dismissal.
 * 3. Quick Workflow (Auto-Close): Automatically dismisses non-critical success alerts after 3.5 seconds.
 * 4. Overflow Protection: Adds scroll constraints so long error messages never clip action buttons.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  X,
  ArrowRight,
} from 'lucide-react';

export type AlertType = 'info' | 'success' | 'warning' | 'error';

export interface AlertDialogProps {
  isOpen: boolean;
  title?: string;
  message: string | unknown;
  type?: AlertType;
  confirmLabel?: string;
  actionLabel?: string;
  autoClose?: boolean; // Defaults to true for success, false for error/warning
  autoCloseDuration?: number; // Milliseconds (default: 3500ms)
  onAction?: () => void;
  onClose: () => void;
}

/**
 * Defensive Sanitizer: Ensures message is always rendered as a safe, readable string.
 * Prevents React rendering crashes when Django or Axios returns error objects or arrays.
 */
const sanitizeMessage = (msg: unknown): string => {
  if (msg === null || msg === undefined) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg);
  if (msg instanceof Error) return msg.message;
  try {
    return JSON.stringify(msg);
  } catch {
    return 'An unexpected system notification was received.';
  }
};

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmLabel = 'Understood',
  actionLabel,
  autoClose,
  autoCloseDuration = 3500,
  onAction,
  onClose,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    onClose();
  }, [onClose]);

  // Handle Escape key and auto-focus for accessibility
  useEffect(() => {
    if (!isOpen) return;

    // Focus primary action button immediately
    const focusTimeout = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto-dismiss success notifications to speed up operator actions
    const shouldAutoClose = autoClose ?? (type === 'success' && !actionLabel);
    if (shouldAutoClose) {
      autoCloseTimerRef.current = setTimeout(() => {
        handleClose();
      }, autoCloseDuration);
    }

    return () => {
      clearTimeout(focusTimeout);
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, type, actionLabel, autoClose, autoCloseDuration, handleClose]);

  if (!isOpen) return null;

  const config = {
    info: {
      icon: Info,
      color: '#0284c7',
      bgColor: '#e0f2fe',
      borderColor: '#bae6fd',
      defaultTitle: 'Notice',
    },
    success: {
      icon: CheckCircle2,
      color: '#059669',
      bgColor: '#d1fae5',
      borderColor: '#a7f3d0',
      defaultTitle: 'Operation Successful',
    },
    warning: {
      icon: AlertTriangle,
      color: '#d97706',
      bgColor: '#fef3c7',
      borderColor: '#fde68a',
      defaultTitle: 'Action Required',
    },
    error: {
      icon: XCircle,
      color: '#dc2626',
      bgColor: '#fee2e2',
      borderColor: '#fecaca',
      defaultTitle: 'System Alert',
    },
  }[type];

  const IconComponent = config.icon;
  const safeMessage = sanitizeMessage(message);

  return (
    <div
      style={overlayStyle}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
    >
      <div
        style={modalBoxStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Color Line */}
        <div style={{ height: 4, backgroundColor: config.color, width: '100%' }} />

        <div style={{ padding: '20px 22px 18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Status Icon */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: config.bgColor,
                border: `1px solid ${config.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <IconComponent size={22} color={config.color} />
            </div>

            {/* Content Text */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div
                id="alert-dialog-title"
                style={{
                  fontSize: '0.96rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  marginBottom: 6,
                }}
              >
                {title || config.defaultTitle}
              </div>
              <div
                style={{
                  fontSize: '0.82rem',
                  color: '#475569',
                  lineHeight: 1.5,
                  maxHeight: '40vh',
                  overflowY: 'auto',
                  wordBreak: 'break-word',
                  paddingRight: 4,
                }}
              >
                {safeMessage}
              </div>
            </div>

            {/* Top Close Button */}
            <button
              type="button"
              onClick={handleClose}
              style={closeBtnStyle}
              title="Close"
              aria-label="Close dialog"
              onMouseEnter={(e) => (e.currentTarget.style.color = '#334155')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Action Button Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 18,
              paddingTop: 12,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={() => {
                  onAction();
                  handleClose();
                }}
                style={actionBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0369a1')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0284c7')}
              >
                <span>{actionLabel}</span>
                <ArrowRight size={13} />
              </button>
            )}

            <button
              ref={confirmBtnRef}
              type="button"
              onClick={handleClose}
              style={{
                padding: '7px 16px',
                backgroundColor: actionLabel ? '#f1f5f9' : config.color,
                color: actionLabel ? '#475569' : '#ffffff',
                borderRadius: 6,
                border: actionLabel ? '1px solid #e2e8f0' : 'none',
                fontSize: '0.80rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
  backgroundColor: 'rgba(15, 23, 42, 0.55)',
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
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  border: '1px solid #e2e8f0',
  overflow: 'hidden',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const actionBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderRadius: 6,
  border: 'none',
  fontSize: '0.80rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 0.15s ease',
};