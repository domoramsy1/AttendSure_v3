/**
 * AttendSure - Standardized Filter & Search Toolbar
 * File: web/src/components/common/FilterToolbar.tsx
 */

import React from 'react';
import { Search, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export interface FilterToolbarProps {
  searchQuery: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  resultCount?: number;
  resultLabel?: string;
  rightSlot?: React.ReactNode;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filters,
  resultCount,
  resultLabel = 'records',
  rightSlot,
}) => {
  const { tokens, brand, fonts } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        padding: '10px 14px',
        backgroundColor: tokens.bgSurface,
        borderRadius: 10,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: tokens.borderSubtle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 11px',
            borderRadius: 8,
            backgroundColor: tokens.bgInput,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: tokens.borderInput,
            minWidth: 220,
            maxWidth: 340,
            flex: 1,
          }}
        >
          <Search size={14} color={tokens.textMuted} />
          <input
            type="text"
            value={searchQuery}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: tokens.textPrimary,
              fontSize: fonts.size.sm,
              width: '100%',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                color: tokens.textMuted,
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {filters}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {typeof resultCount === 'number' && (
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 9999,
              backgroundColor: tokens.primaryLight,
              color: brand.primary,
              fontSize: fonts.size.xs,
              fontWeight: 800,
            }}
          >
            {resultCount} {resultLabel}
          </span>
        )}
        {rightSlot}
      </div>
    </div>
  );
};

export default FilterToolbar;
