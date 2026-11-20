/**
 * AttendSure - Standard Module Table Layout
 * File: web/src/components/tabs/ModuleTableLayout.tsx
 */

import { type ReactNode } from 'react';
import { Search, Plus, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { useTheme } from '../../context/ThemeContext';

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
  const { tokens, brand } = useTheme();

  const tableItems: T[] = Array.isArray(data)
    ? data
    : (data as { results?: T[] })?.results && Array.isArray((data as { results?: T[] }).results)
    ? ((data as { results?: T[] }).results as T[])
    : (data as { data?: T[] })?.data && Array.isArray((data as { data?: T[] }).data)
    ? ((data as { data?: T[] }).data as T[])
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          backgroundColor: tokens.bgSurface,
          borderBottom: `1px solid ${tokens.borderSubtle}`,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: tokens.textPrimary, letterSpacing: '-0.3px' }}>
            {title}
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.80rem', color: tokens.textMuted }}>
            {subtitle}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={15}
              color={tokens.textMuted}
              style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              style={{
                padding: '8px 30px 8px 32px',
                borderRadius: 6,
                border: `1px solid ${tokens.borderInput}`,
                fontSize: '0.82rem',
                outline: 'none',
                minWidth: 220,
                color: tokens.textPrimary,
                backgroundColor: tokens.bgInput,
              }}
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                title="Clear search"
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} color={tokens.textMuted} />
              </button>
            )}
          </div>

          {extraActions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {extraActions}
            </div>
          )}

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

      {/* Error Banner */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            backgroundColor: tokens.dangerBg,
            color: tokens.danger,
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            fontSize: '0.84rem',
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Table Container */}
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          overflow: 'hidden',
          minHeight: '220px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '60px 20px',
              color: tokens.textSecondary,
            }}
          >
            <Loader2 className="animate-spin" size={24} color={brand.primary} />
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Loading records...</span>
          </div>
        ) : tableItems.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: tokens.textMuted,
              fontSize: '0.86rem',
            }}
          >
            No matching records found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: tokens.bgSurfaceSubtle,
                    borderBottom: `1px solid ${tokens.borderSubtle}`,
                    color: tokens.textSecondary,
                    fontWeight: 700,
                  }}
                >
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
                        borderBottom: `1px solid ${tokens.borderSubtle}`,
                        color: tokens.textPrimary,
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

        {pagination && (
          <div style={{ borderTop: `1px solid ${tokens.borderSubtle}`, backgroundColor: tokens.bgSurface }}>
            {pagination}
          </div>
        )}
      </div>
    </div>
  );
}

export default ModuleTableLayout;