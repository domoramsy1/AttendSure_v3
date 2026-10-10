/**
 * AttendSure V3 - Reusable Server Pagination Bar
 * File: frontend/src/components/common/Pagination.tsx
 *
 * Enhancements:
 * 1. FORM SAFE: Explicit type="button" prevents accidental parent form submissions.
 * 2. ASYNC PROTECTION: Added 'disabled' prop to freeze controls during active data fetches.
 * 3. CONFIGURABLE SIZES: Added customizable 'pageSizeOptions' with fallback to [15, 25, 50, 100].
 * 4. ACCESSIBILITY: Added aria-labels and not-allowed cursor states for disabled buttons.
 * 5. DUAL EXPORT: Provides both named and default exports for maximum compatibility.
 */

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
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
  pageSizeOptions = [15, 25, 50, 100],
  disabled = false,
  className,
  style,
}) => {
  if (totalCount === 0) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);

  const startRecord = (safeCurrentPage - 1) * pageSize + 1;
  const endRecord = Math.min(safeCurrentPage * pageSize, totalCount);

  const isPrevDisabled = disabled || safeCurrentPage <= 1;
  const isNextDisabled = disabled || safeCurrentPage >= safeTotalPages;

  return (
    <div className={className} style={{ ...containerStyle, ...style }}>
      <div style={{ fontSize: '0.80rem', color: '#475569' }}>
        Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of{' '}
        <strong>{totalCount}</strong> records
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Per page:</span>
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
                  {opt}
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
  padding: '10px 18px',
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
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  outline: 'none',
};