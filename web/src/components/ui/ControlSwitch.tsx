/**
 * AttendSure - Precision Segmented Control Switch & Toggle Switch
 * File: web/src/components/ui/ControlSwitch.tsx
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

export interface SwitchOption<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
  badge?: number | string;
  title?: string;
}

interface ControlSwitchProps<T extends string> {
  options: ReadonlyArray<SwitchOption<T>>;
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  compactIconsOnly?: boolean;
  ariaLabel?: string;
}

export function ControlSwitch<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  compactIconsOnly = false,
  ariaLabel = 'View Switcher',
}: ControlSwitchProps<T>) {
  const { tokens, brand, fonts } = useTheme();

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 3,
        borderRadius: compactIconsOnly ? 9999 : 10,
        backgroundColor: tokens.bgSurfaceSubtle,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: tokens.borderSubtle,
        flexShrink: 0,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.title || opt.label || opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: compactIconsOnly ? 0 : size === 'sm' ? '4px 10px' : '6px 12px',
              width: compactIconsOnly ? 28 : undefined,
              height: compactIconsOnly ? 28 : undefined,
              borderRadius: compactIconsOnly ? '50%' : 7,
              borderWidth: 0,
              borderStyle: 'none',
              backgroundColor: active ? brand.buttonBg : 'transparent',
              color: active ? tokens.onPrimary : tokens.textSecondary,
              boxShadow: active ? '0 1px 4px rgba(0, 0, 0, 0.18)' : 'none',
              fontFamily: fonts.sans,
              fontSize: size === 'sm' ? fonts.size.xs : fonts.size.sm,
              fontWeight: active ? 800 : 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.icon}
            {!compactIconsOnly && opt.label && <span>{opt.label}</span>}
            {opt.badge !== undefined && opt.badge !== '' && Number(opt.badge) > 0 && (
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 9999,
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  backgroundColor: active ? 'rgba(255,255,255,0.22)' : tokens.primaryLight,
                  color: active ? tokens.onPrimary : brand.primary,
                }}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  const { tokens, brand, fonts } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {(label || description) && (
        <div>
          {label && (
            <div style={{ fontSize: fonts.size.base, fontWeight: 700, color: tokens.textPrimary }}>
              {label}
            </div>
          )}
          {description && (
            <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 2 }}>
              {description}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          position: 'relative',
          width: 42,
          height: 24,
          borderRadius: 9999,
          borderWidth: 0,
          borderStyle: 'none',
          backgroundColor: checked ? brand.buttonBg : tokens.borderStrong,
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: 2,
          transition: 'background-color 0.18s ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: tokens.onPrimary,
            transform: checked ? 'translateX(18px)' : 'translateX(0)',
            transition: 'transform 0.18s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </button>
    </div>
  );
};

export default ControlSwitch;