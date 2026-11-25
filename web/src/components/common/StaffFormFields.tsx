/**
 * AttendSure - Shared Staff Form Fields (Teachers Directory & User Accounts)
 * File: web/src/components/common/StaffFormFields.tsx
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { STAFF_POSITIONS_LIST, STAFF_SUFFIX_OPTIONS } from './staffConstants';

export interface PositionGroup {
  category: string;
  ranks: string[];
}

export interface StaffNameValues {
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
}

export const StaffNameFields: React.FC<{
  values: StaffNameValues;
  onChange: (patch: Partial<StaffNameValues>) => void;
  idPrefix?: string;
  gridStyle?: React.CSSProperties;
}> = ({ values, onChange, idPrefix = 'staff', gridStyle }) => {
  const { ui } = useTheme();
  return (
    <div
      style={
        gridStyle || {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
          gap: 10,
        }
      }
    >
      <div>
        <label htmlFor={`${idPrefix}-first-name`} style={ui.label}>
          First Name *
        </label>
        <input
          id={`${idPrefix}-first-name`}
          type="text"
          required
          maxLength={100}
          value={values.first_name}
          onChange={(e) => onChange({ first_name: e.target.value })}
          style={ui.input}
          placeholder="First name"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-middle-name`} style={ui.label}>
          Middle Name
        </label>
        <input
          id={`${idPrefix}-middle-name`}
          type="text"
          maxLength={100}
          value={values.middle_name}
          onChange={(e) => onChange({ middle_name: e.target.value })}
          style={ui.input}
          placeholder="Optional"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-last-name`} style={ui.label}>
          Last Name *
        </label>
        <input
          id={`${idPrefix}-last-name`}
          type="text"
          required
          maxLength={100}
          value={values.last_name}
          onChange={(e) => onChange({ last_name: e.target.value })}
          style={ui.input}
          placeholder="Last name"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-suffix`} style={ui.label}>
          Suffix
        </label>
        <select
          id={`${idPrefix}-suffix`}
          value={values.suffix}
          onChange={(e) => onChange({ suffix: e.target.value })}
          style={ui.input}
        >
          {STAFF_SUFFIX_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt || 'None'}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export const StaffDepartmentPositionFields: React.FC<{
  department: string;
  position: string;
  onChange: (patch: { department?: string; position?: string }) => void;
  departmentOptions: string[];
  positionGroups?: PositionGroup[];
  positionOptions?: string[];
  order?: 'position-first' | 'department-first';
  idPrefix?: string;
  gridStyle?: React.CSSProperties;
}> = ({
  department,
  position,
  onChange,
  departmentOptions,
  positionGroups,
  positionOptions = STAFF_POSITIONS_LIST,
  order = 'department-first',
  idPrefix = 'staff',
  gridStyle,
}) => {
  const { ui } = useTheme();

  const departmentEl = (
    <div>
      <label htmlFor={`${idPrefix}-department`} style={ui.label}>
        Department
      </label>
      <select
        id={`${idPrefix}-department`}
        value={department}
        onChange={(e) => onChange({ department: e.target.value })}
        style={ui.input}
      >
        {departmentOptions.map((dept) => (
          <option key={dept} value={dept}>
            {dept}
          </option>
        ))}
      </select>
    </div>
  );

  const positionEl = (
    <div>
      <label htmlFor={`${idPrefix}-position`} style={ui.label}>
        {order === 'position-first' ? 'Position' : 'Official Position / Title'}
      </label>
      <select
        id={`${idPrefix}-position`}
        value={position}
        onChange={(e) => onChange({ position: e.target.value })}
        style={ui.input}
      >
        {positionGroups
          ? positionGroups.map((grp) => (
              <optgroup key={grp.category} label={grp.category}>
                {grp.ranks.map((rank) => (
                  <option key={rank} value={rank}>
                    {rank}
                  </option>
                ))}
              </optgroup>
            ))
          : positionOptions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
      </select>
    </div>
  );

  return (
    <div
      style={
        gridStyle || {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: 10,
        }
      }
    >
      {order === 'position-first' ? (
        <>
          {positionEl}
          {departmentEl}
        </>
      ) : (
        <>
          {departmentEl}
          {positionEl}
        </>
      )}
    </div>
  );
};

export const StaffContactField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  error?: string;
  verified?: boolean;
  id?: string;
  maxLength?: number;
  placeholder?: string;
}> = ({
  value,
  onChange,
  error,
  verified,
  id = 'staff-contact',
  maxLength = 30,
  placeholder = '+63 917 000 0000',
}) => {
  const { tokens, brand, ui } = useTheme();
  return (
    <div>
      <label htmlFor={id} style={ui.label}>
        Mobile Phone Number
      </label>
      <input
        id={id}
        type="tel"
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...ui.input,
          borderColor: error ? brand.danger : verified ? brand.success : tokens.borderStrong,
        }}
        placeholder={placeholder}
      />
      {error && (
        <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', fontWeight: 700, color: brand.danger }}>
          {error}
        </span>
      )}
    </div>
  );
};

export const StaffTeachingToggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  variant?: 'card' | 'inline';
  label?: string;
}> = ({
  checked,
  onChange,
  variant = 'card',
  label = 'Handles classroom schedules & class lists',
}) => {
  const { tokens, brand, fonts } = useTheme();
  if (variant === 'inline') {
    return (
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: fonts.size.sm,
          fontWeight: fonts.weight.semibold,
          color: tokens.textPrimary,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: brand.primary }}
        />
        {label}
      </label>
    );
  }

  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        backgroundColor: checked ? tokens.primaryLight : tokens.bgSurfaceSubtle,
        borderRadius: 8,
        border: `1.5px solid ${checked ? brand.primary : tokens.borderStrong}`,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: brand.buttonBg, cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '0.80rem', fontWeight: 800, color: checked ? brand.primary : tokens.textPrimary }}>
          Handles Classes (Visible in Teachers Tab &amp; Schedules)
        </span>
        <span style={{ fontSize: '0.70rem', color: tokens.textSecondary }}>
          {checked
            ? 'Active: This teacher appears in the Teachers tab, sections, and class schedules.'
            : 'Inactive: Non-teaching account.'}
        </span>
      </div>
    </label>
  );
};
