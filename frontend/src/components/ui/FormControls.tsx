import React from 'react';
import { theme } from '../../theme/tokens';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const TextInput: React.FC<InputProps> = ({ label, style, ...props }) => (
  <div style={{ width: '100%' }}>
    {label && <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4, color: theme.colors.textPrimary }}>{label}</label>}
    <input
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: theme.radius.sm,
        border: `1px solid ${theme.colors.border}`,
        fontSize: '0.875rem',
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    />
  </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ label, children, style, ...props }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {label && <label style={{ fontSize: '0.875rem', fontWeight: 600, color: theme.colors.textPrimary, whiteSpace: 'nowrap' }}>{label}</label>}
    <select
      style={{
        padding: '8px 12px',
        borderRadius: theme.radius.sm,
        border: `1px solid ${theme.colors.border}`,
        fontSize: '0.875rem',
        backgroundColor: theme.colors.surface,
        outline: 'none',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  </div>
);