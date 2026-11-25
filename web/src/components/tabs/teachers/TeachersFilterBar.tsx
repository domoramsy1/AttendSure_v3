// AttendSure Web - Teachers Directory Filter Bar
// File: D:\AttendSure_V3\web\src\components\tabs\teachers\TeachersFilterBar.tsx

import React from 'react';
import { Search } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import type { StatusFilter } from './types';

interface TeachersFilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (next: string) => void;
  departmentOptions: string[];
  statusFilter: StatusFilter;
  onStatusFilterChange: (next: StatusFilter) => void;
  displayedCount: number;
  loadedCount: number;
  activeTeachersCount: number;
  boundPhonesCount: number;
}

export const TeachersFilterBar: React.FC<TeachersFilterBarProps> = ({
  search,
  onSearchChange,
  departmentFilter,
  onDepartmentFilterChange,
  departmentOptions,
  statusFilter,
  onStatusFilterChange,
  displayedCount,
  loadedCount,
  activeTeachersCount,
  boundPhonesCount,
}) => {
  const { tokens, brand, fonts, radius, ui } = useTheme();

  const filterPillOptions: { key: StatusFilter; label: string }[] = [
    { key: 'ALL', label: `All (${loadedCount})` },
    { key: 'ACTIVE', label: `Active (${activeTeachersCount})` },
    { key: 'INACTIVE', label: `Inactive (${Math.max(0, loadedCount - activeTeachersCount)})` },
    { key: 'BOUND', label: `Phone Linked (${boundPhonesCount})` },
    { key: 'UNBOUND', label: `Unlinked (${Math.max(0, loadedCount - boundPhonesCount)})` },
  ];

  return (
    <div
      style={{
        ...ui.card,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
            <Search
              size={14}
              color={tokens.textMuted}
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              aria-label="Search teachers"
              placeholder="Search by name, Employee ID, or role..."
              value={search}
              maxLength={80}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                ...ui.input,
                paddingLeft: 34,
                backgroundColor: tokens.bgSurfaceSubtle,
              }}
            />
          </div>

          <select
            aria-label="Filter by department"
            value={departmentFilter}
            onChange={(e) => onDepartmentFilterChange(e.target.value)}
            style={{
              ...ui.input,
              width: 'auto',
              minWidth: 210,
              backgroundColor: tokens.bgSurfaceSubtle,
              cursor: 'pointer',
            }}
          >
            <option value="">All Departments</option>
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: fonts.size.xs, color: tokens.textMuted, fontWeight: fonts.weight.semibold }}>
          Showing {displayedCount} of {loadedCount} loaded
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {filterPillOptions.map((pill) => {
          const active = statusFilter === pill.key;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => onStatusFilterChange(pill.key)}
              style={{
                padding: '5px 11px',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: active ? brand.primary : tokens.borderStrong,
                backgroundColor: active ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                color: active ? brand.primary : tokens.textSecondary,
                fontSize: fonts.size.xs,
                fontWeight: fonts.weight.bold,
                cursor: 'pointer',
              }}
            >
              {pill.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
