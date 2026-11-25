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
import { extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';

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
 */
const sanitizeMessage = (msg: unknown): string => {
  if (msg === null || msg === undefined) return '';
  if (typeof msg === 'string') {
    const trimmed = msg.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.includes('Traceback (most recent call last)')) {
      return 'Something went wrong on the server. Please try again.';
    }
    return trimmed;
  }
  if (typeof msg === 'number' || typeof msg === 'boolean') return String(msg);
  return extractApiError(msg, 'An unexpected notice was received. Please try again.');
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
  const { tokens, brand } = useTheme();
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

    const focusTimeout = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

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
      color: brand.primary,
      buttonBg: brand.buttonBg,
      bgColor: brand.primarySoft,
      borderColor: tokens.borderSubtle,
      defaultTitle: 'Notice',
    },
    success: {
      icon: CheckCircle2,
      color: tokens.success,
      buttonBg: brand.success,
      bgColor: tokens.successBg,
      borderColor: tokens.borderSubtle,
      defaultTitle: 'Saved Successfully',
    },
    warning: {
      icon: AlertTriangle,
      color: tokens.warning,
      buttonBg: brand.warning,
      bgColor: tokens.warningBg,
      borderColor: tokens.borderSubtle,
      defaultTitle: 'Action Needed',
    },
    error: {
      icon: XCircle,
      color: tokens.danger,
      buttonBg: brand.danger,
      bgColor: tokens.dangerBg,
      borderColor: tokens.borderSubtle,
      defaultTitle: 'Notice',
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
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: tokens.bgSurface,
          borderRadius: 12,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.14)',
          border: `1px solid ${tokens.borderSubtle}`,
          overflow: 'hidden',
        }}
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
                  color: tokens.textPrimary,
                  marginBottom: 6,
                }}
              >
                {title || config.defaultTitle}
              </div>
              <div
                style={{
                  fontSize: '0.82rem',
                  color: tokens.textSecondary,
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
              style={{ ...closeBtnStyle, color: tokens.textMuted }}
              title="Close"
              aria-label="Close dialog"
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
              borderTop: `1px solid ${tokens.borderSubtle}`,
            }}
          >
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={() => {
                  onAction();
                  handleClose();
                }}
                style={{ ...actionBtnStyle, backgroundColor: brand.buttonBg }}
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
                backgroundColor: actionLabel ? tokens.bgSurfaceSubtle : config.buttonBg,
                color: actionLabel ? tokens.textPrimary : tokens.onPrimary,
                borderRadius: 6,
                border: actionLabel ? `1px solid ${tokens.borderInput}` : 'none',
                fontSize: '0.80rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
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
  color: 'var(--on-primary)',
  borderRadius: 6,
  border: 'none',
  fontSize: '0.80rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'opacity 0.15s ease',
};