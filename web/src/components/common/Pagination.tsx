/**
 * AttendSure - Reusable Server Pagination Bar & Safe CSV Exporter
 * File: frontend/src/components/common/Pagination.tsx
 *
 * Enhancements:
 * 1. FULL SCALE OPTIONS: Supports 25, 50, 100, 250, 500, 1000, and All (10,000 ceiling).
 * 2. SHARED CSV EXPORTER: Provides `exportToCsv` with OWASP CSV Formula Injection protection.
 * 3. FORM SAFE: Explicit type="button" prevents accidental parent form submissions.
 * 4. ASYNC PROTECTION: Freezes controls during active data fetches.
 */

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/** Safe upper ceiling representing "All" records without exhausting server RAM */
export const ALL_ROWS_SIZE = 10000;

export const DEFAULT_PAGE_SIZE_OPTIONS: number[] = [
  25,
  50,
  100,
  250,
  500,
  1000,
  ALL_ROWS_SIZE,
];

/**
 * Cybersecurity Helper: Sanitizes a cell value to prevent CSV Formula Injection
 * in Microsoft Excel and Google Sheets (blocks cells starting with =, +, -, or @).
 */
export const sanitizeCsvCell = (val: string | number | boolean | undefined | null): string => {
  const clean = String(val ?? '').replace(/"/g, '""').trim();
  if (/^[=+\-@]/.test(clean)) {
    return `"'${clean}"`;
  }
  return `"${clean}"`;
};

/**
 * Reusable CSV Downloader for any table tab.
 */
export const exportToCsv = (
  filename: string,
  headers: string[],
  rows: (string | number | boolean | undefined | null)[][]
): boolean => {
  if (!rows || rows.length === 0) return false;

  const csvLines = [
    headers.map((h) => sanitizeCsvCell(h)).join(','),
    ...rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')),
  ];

  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
};

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemLabel = 'records',
  disabled = false,
  className,
  style,
}) => {
  if (totalCount === 0) return null;

  const isAllSelected = pageSize >= ALL_ROWS_SIZE;
  const safeTotalPages = isAllSelected ? 1 : Math.max(1, totalPages);
  const safeCurrentPage = isAllSelected ? 1 : Math.min(Math.max(1, currentPage), safeTotalPages);

  const startRecord = isAllSelected ? 1 : (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = isAllSelected ? totalCount : Math.min(safeCurrentPage * pageSize, totalCount);

  const isPrevDisabled = disabled || isAllSelected || safeCurrentPage <= 1;
  const isNextDisabled = disabled || isAllSelected || safeCurrentPage >= safeTotalPages;

  return (
    <div className={className} style={{ ...containerStyle, ...style }}>
      <div style={{ fontSize: '0.80rem', color: '#475569' }}>
        Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of{' '}
        <strong>{totalCount}</strong> {itemLabel}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Rows per page:</span>
            <select
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                ...selectStyle,
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt >= ALL_ROWS_SIZE ? 'All' : opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={isPrevDisabled}
          aria-label="First page"
          title="First Page"
          style={{
            ...btnStyle,
            opacity: isPrevDisabled ? 0.35 : 1,
            cursor: isPrevDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={isPrevDisabled}
          aria-label="Previous page"
          title="Previous Page"
          style={{
            ...btnStyle,
            opacity: isPrevDisabled ? 0.35 : 1,
            cursor: isPrevDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page Position Indicator */}
        <span
          style={{
            fontSize: '0.80rem',
            fontWeight: 600,
            padding: '0 8px',
            color: '#0f172a',
            userSelect: 'none',
          }}
        >
          Page {safeCurrentPage} of {safeTotalPages}
        </span>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={isNextDisabled}
          aria-label="Next page"
          title="Next Page"
          style={{
            ...btnStyle,
            opacity: isNextDisabled ? 0.35 : 1,
            cursor: isNextDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={16} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={isNextDisabled}
          aria-label="Last page"
          title="Last Page"
          style={{
            ...btnStyle,
            opacity: isNextDisabled ? 0.35 : 1,
            cursor: isNextDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  boxSizing: 'border-box',
  gap: 12,
  flexWrap: 'wrap',
};

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  backgroundColor: '#ffffff',
  color: '#334155',
  transition: 'all 0.15s ease',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#0f172a',
  backgroundColor: '#ffffff',
  outline: 'none',
};