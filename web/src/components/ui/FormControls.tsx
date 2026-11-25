// AttendSure Web - Form Controls Component
// File: D:\AttendSure_V3\web\src\components\ui\FormControls.tsx

/**
 * AttendSure - Accessible Theme-Adaptive Form Controls
 * File: web/src/components/ui/FormControls.tsx
 */

import React, { useId } from 'react';
import { useTheme } from '../../context/ThemeContext';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const TextInput: React.FC<InputProps> = ({ label, id, style, ...props }) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const { tokens, radius } = useTheme();

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 700,
            marginBottom: 4,
            color: tokens.textPrimary,
          }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        style={{
          width: '100%',
          padding: '9px 12px',
          borderRadius: radius.sm,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: tokens.borderInput,
          backgroundColor: tokens.bgInput,
          color: tokens.textPrimary,
          fontSize: '0.875rem',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease, background-color 0.15s ease',
          ...style,
        }}
        {...props}
      />
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select: React.FC<SelectProps> = ({ label, id, children, style, ...props }) => {
  const generatedId = useId();
  const selectId = id || generatedId;
  const { tokens, radius } = useTheme();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: tokens.textPrimary,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        style={{
          padding: '8px 12px',
          borderRadius: radius.sm,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: tokens.borderInput,
          fontSize: '0.875rem',
          backgroundColor: tokens.bgInput,
          color: tokens.textPrimary,
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
};
