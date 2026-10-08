import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) => {
  if (totalCount === 0) return null;

  const startRecord = (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={containerStyle}>
      <div style={{ fontSize: '0.80rem', color: '#475569' }}>
        Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of{' '}
        <strong>{totalCount}</strong> records
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 10 }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={selectStyle}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        )}

        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          style={{ ...btnStyle, opacity: currentPage <= 1 ? 0.35 : 1 }}
          title="First Page"
        >
          <ChevronsLeft size={16} />
        </button>

        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={{ ...btnStyle, opacity: currentPage <= 1 ? 0.35 : 1 }}
          title="Previous Page"
        >
          <ChevronLeft size={16} />
        </button>

        <span style={{ fontSize: '0.80rem', fontWeight: 600, padding: '0 8px', color: '#0f172a' }}>
          Page {currentPage} of {Math.max(1, totalPages)}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={{ ...btnStyle, opacity: currentPage >= totalPages ? 0.35 : 1 }}
          title="Next Page"
        >
          <ChevronRight size={16} />
        </button>

        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          style={{ ...btnStyle, opacity: currentPage >= totalPages ? 0.35 : 1 }}
          title="Last Page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 18px',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  boxSizing: 'border-box',
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
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};