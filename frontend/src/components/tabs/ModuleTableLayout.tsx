/**
 * AttendSure V3 - Standard Module Table Layout
 * File: frontend/src/components/tabs/ModuleTableLayout.tsx
 *
 * Standard layout wrapper providing:
 * 1. Consistent title, subtitle, and search filter headers.
 * 2. Support for extra actions (filters, selectors) and bottom pagination slots.
 * 3. Type-safe ReactNode imports compliant with verbatimModuleSyntax.
 * 4. Responsive table overflow wrapper for kiosk and tablet displays.
 * 5. Defensive data unwrapping for direct arrays and paginated API payloads.
 */

import React, { type ReactNode } from 'react';
import { Search, Plus, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';

export interface Column<T> {
  header: string;
  render: (item: T, index?: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string | number;
}

export interface ModuleTableLayoutProps<T> {
  title: string;
  subtitle: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  addButtonLabel?: string;
  onAdd?: () => void;
  extraActions?: ReactNode;
  pagination?: ReactNode;
  loading: boolean;
  error: string | null;
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
}

export function ModuleTableLayout<T>({
  title,
  subtitle,
  searchPlaceholder = 'Search records...',
  searchValue,
  onSearchChange,
  addButtonLabel,
  onAdd,
  extraActions,
  pagination,
  loading,
  error,
  columns,
  data,
  keyExtractor,
}: ModuleTableLayoutProps<T>) {
  // Defensive unwrapping: handles plain arrays, DRF paginated responses, or nested data
  const tableItems: T[] = Array.isArray(data)
    ? data
    : (data as any)?.results && Array.isArray((data as any).results)
    ? (data as any).results
    : (data as any)?.data && Array.isArray((data as any).data)
    ? (data as any).data
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* 1. Header Toolbar */}
      <div style={headerContainer}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
            {title}
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.80rem', color: '#64748b' }}>
            {subtitle}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search Input with Clear Button */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={15}
              color="#94a3b8"
              style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              style={searchInputStyle}
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                title="Clear search"
                style={clearSearchBtn}
              >
                <X size={13} color="#94a3b8" />
              </button>
            )}
          </div>

          {/* Optional Action Slot (Filters, Export Buttons, etc.) */}
          {extraActions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {extraActions}
            </div>
          )}

          {/* Standard Primary Action Button */}
          {addButtonLabel && onAdd && (
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={onAdd}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} />
              <span>{addButtonLabel}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Error Banner */}
      {error && (
        <div style={errorBanner}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Table Container */}
      <div style={tableContainer}>
        {loading ? (
          <div style={loadingState}>
            <Loader2 className="animate-spin" size={24} color="#0284c7" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Querying database records...</span>
          </div>
        ) : tableItems.length === 0 ? (
          <div style={emptyState}>
            No matching database records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                  {columns.map((col, idx) => (
                    <th
                      key={idx}
                      style={{
                        padding: '12px 16px',
                        textAlign: col.align || 'left',
                        width: col.width || undefined,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item, index) => {
                  const itemKey = keyExtractor(item) ?? index;
                  return (
                    <tr
                      key={itemKey}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {columns.map((col, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '12px 16px',
                            textAlign: col.align || 'left',
                            verticalAlign: 'middle',
                          }}
                        >
                          {col.render(item, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Bottom Pagination Slot */}
        {pagination && (
          <div style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
            {pagination}
          </div>
        )}
      </div>
    </div>
  );
}

export default ModuleTableLayout;

// ============================================================================
// STYLES
// ============================================================================

const headerContainer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #e2e8f0',
  flexWrap: 'wrap',
  gap: 12,
};

const searchInputStyle: React.CSSProperties = {
  padding: '8px 30px 8px 32px',
  borderRadius: '6px',
  border: '1px solid #cbd5e1',
  fontSize: '0.82rem',
  outline: 'none',
  minWidth: '240px',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};

const clearSearchBtn: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 2,
  display: 'flex',
  alignItems: 'center',
};

const errorBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 16px',
  backgroundColor: '#fef2f2',
  color: '#dc2626',
  borderBottom: '1px solid #fee2e2',
  fontSize: '0.84rem',
};

const tableContainer: React.CSSProperties = {
  backgroundColor: '#ffffff',
  overflow: 'hidden',
  minHeight: '220px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const loadingState: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '60px 20px',
  color: '#64748b',
};

const emptyState: React.CSSProperties = {
  textAlign: 'center',
  padding: '60px 20px',
  color: '#94a3b8',
  fontSize: '0.86rem',
};