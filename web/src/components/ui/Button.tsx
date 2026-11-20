import React from 'react';
import { useTheme } from '../../context/ThemeContext';
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
  const { mode, tokens, brand, radius } = useTheme();

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: brand.buttonBg,
          color: '#ffffff',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: brand.buttonBg,
          boxShadow: '0 2px 8px rgba(0, 75, 135, 0.22)',
        };
      case 'secondary':
        return {
          backgroundColor: tokens.bgSurfaceSubtle,
          color: tokens.textPrimary,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: tokens.borderStrong,
        };
      case 'danger':
        return {
          backgroundColor: mode === 'dark' ? '#dc2626' : brand.danger,
          color: '#ffffff',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: mode === 'dark' ? '#ef4444' : brand.danger,
        };
      case 'dark':
        return {
          backgroundColor: '#1e293b',
          color: '#ffffff',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#334155',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: tokens.textPrimary,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'transparent',
        };
    }
  };

  const sizeStyles: React.CSSProperties =
    size === 'sm'
      ? { padding: '5px 10px', fontSize: '0.78rem' }
      : { padding: '8px 14px', fontSize: '0.86rem' };

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        fontWeight: 700,
        borderRadius: radius.md,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
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