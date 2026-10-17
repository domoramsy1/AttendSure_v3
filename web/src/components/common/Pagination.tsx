/**
 * AttendSure - Reusable Server Pagination Bar & Safe CSV Exporter
 * File: web/src/components/common/Pagination.tsx
 *
 * Cybersecurity & Stability Hardening:
 * 1. OWASP CSV Formula Injection Defense: Neutralizes cells starting with =, +, -, @, |, \t, \r.
 * 2. Asynchronous Memory Cleanup: Delays URL.revokeObjectURL by 1s to prevent premature download aborts.
 * 3. Strict Numeric Math: Guards against NaN / divide-by-zero during rapid page size switching.
 * 4. WCAG Accessible Controls: Adds aria-label descriptors to all buttons and select inputs.
 */

import React, { useId } from 'react';
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
 * Cybersecurity Helper: Sanitizes cell values to prevent CSV Formula / DDE Injection
 * in Microsoft Excel, LibreOffice, and Google Sheets.
 * Blocks: =, +, -, @, |, \t, \r
 */
export const sanitizeCsvCell = (val: string | number | boolean | undefined | null): string => {
  if (val === null || val === undefined) return '""';
  
  // Escape internal double quotes by doubling them per RFC 4180
  const clean = String(val).replace(/"/g, '""').trim();
  
  // Neutralize formula trigger characters with a leading single quote
  if (/^[=+\-@\t\r|]/.test(clean)) {
    return `"'${clean}"`;
  }
  
  return `"${clean}"`;
};

/**
 * Reusable CSV Downloader for any table module.
 * Embeds UTF-8 BOM (\uFEFF) for proper display of special characters in Excel.
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

  // UTF-8 BOM prefix ensures correct rendering in Excel
  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.display = 'none';
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);

  // Defer revocation by 1 second to ensure browser has completed file stream
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);

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
  const selectId = useId();

  if (totalCount <= 0) return null;

  // Defensive Numeric Guards
  const safePageSize = Math.max(1, Number(pageSize) || 25);
  const isAllSelected = safePageSize >= ALL_ROWS_SIZE;
  const safeTotalPages = isAllSelected ? 1 : Math.max(1, Number(totalPages) || 1);
  const safeCurrentPage = isAllSelected
    ? 1
    : Math.min(Math.max(1, Number(currentPage) || 1), safeTotalPages);

  const startRecord = isAllSelected ? 1 : (safeCurrentPage - 1) * safePageSize + 1;
  const endRecord = isAllSelected ? totalCount : Math.min(safeCurrentPage * safePageSize, totalCount);

  const isPrevDisabled = disabled || isAllSelected || safeCurrentPage <= 1;
  const isNextDisabled = disabled || isAllSelected || safeCurrentPage >= safeTotalPages;

  return (
    <div className={className} style={{ ...containerStyle, ...style }} role="navigation" aria-label="Pagination Navigation">
      <div style={{ fontSize: '0.80rem', color: '#475569' }}>
        Showing <strong>{startRecord.toLocaleString()}</strong> to <strong>{endRecord.toLocaleString()}</strong> of{' '}
        <strong>{totalCount.toLocaleString()}</strong> {itemLabel}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <label htmlFor={selectId} style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Rows per page:
            </label>
            <select
              id={selectId}
              value={safePageSize}
              disabled={disabled}
              aria-label="Rows per page selector"
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                if (!isNaN(nextSize) && nextSize > 0) {
                  onPageSizeChange(nextSize);
                }
              }}
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
          aria-label="Go to first page"
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
          aria-label="Go to previous page"
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
          aria-label="Go to next page"
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
          aria-label="Go to last page"
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