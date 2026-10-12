import React, { useEffect } from 'react';
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
  message: string;
  type?: AlertType;
  confirmLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  confirmLabel = 'Understood',
  actionLabel,
  onAction,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: '#ffffff',
          borderRadius: 14,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          animation: 'slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Strip */}
        <div style={{ height: 4, backgroundColor: config.color, width: '100%' }} />

        <div style={{ padding: '22px 24px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Type Badge Icon */}
            <div
              style={{
                width: 42,
                height: 42,
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

            {/* Content Body */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  marginBottom: 6,
                }}
              >
                {title || config.defaultTitle}
              </div>
              <p
                style={{
                  fontSize: '0.82rem',
                  color: '#475569',
                  lineHeight: 1.5,
                  margin: 0,
                  wordBreak: 'break-word',
                }}
              >
                {message}
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#334155')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Action Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 20,
              paddingTop: 14,
              borderTop: '1px solid #f1f5f9',
            }}
          >
            {actionLabel && onAction && (
              <button
                onClick={() => {
                  onAction();
                  onClose();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: '0.80rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0369a1')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0284c7')}
              >
                <span>{actionLabel}</span>
                <ArrowRight size={13} />
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
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