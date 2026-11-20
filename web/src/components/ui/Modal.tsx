/**
 * AttendSure - Accessible Theme-Adaptive Dialog Modal
 * File: web/src/components/ui/Modal.tsx
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '540px',
}) => {
  const { tokens, fonts, radius } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth,
          backgroundColor: tokens.bgSurface,
          color: tokens.textPrimary,
          borderRadius: radius.lg,
          border: `1px solid ${tokens.borderSubtle}`,
          boxShadow: tokens.cardShadow,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          fontFamily: fonts.sans,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: tokens.bgSurfaceSubtle,
            gap: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: fonts.size.md,
              fontWeight: fonts.weight.extrabold,
              color: tokens.textPrimary,
            }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: tokens.textMuted,
              padding: 4,
              borderRadius: radius.sm,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', color: tokens.textPrimary }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
