import React from 'react';
import { theme } from '../../theme/tokens';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'dark' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: theme.colors.primary, color: theme.colors.textWhite };
      case 'secondary':
        return { backgroundColor: theme.colors.surfaceSubtle, color: theme.colors.textPrimary, border: `1px solid ${theme.colors.border}` };
      case 'danger':
        return { backgroundColor: theme.colors.danger, color: theme.colors.textWhite };
      case 'dark':
        return { backgroundColor: '#334155', color: theme.colors.textWhite };
      case 'ghost':
        return { backgroundColor: 'transparent', color: theme.colors.textPrimary };
    }
  };

  const sizeStyles: React.CSSProperties = size === 'sm'
    ? { padding: '5px 10px', fontSize: '0.8rem' }
    : { padding: '8px 14px', fontSize: '0.875rem' };

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        fontWeight: 600,
        borderRadius: theme.radius.sm,
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s ease-in-out',
        ...sizeStyles,
        ...getVariantStyles(),
        ...style,
      }}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
};