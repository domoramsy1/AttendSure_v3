// AttendSure Web - Students Filter & Action Bar
// File: D:\AttendSure_V3\web\src\components\tabs\students\StudentsFilterBar.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { Download, Loader2, Plus, Printer, Search, Upload } from 'lucide-react';
import type { SectionItem } from './types';

interface StudentsFilterBarProps {
  sections: SectionItem[];
  selectedSectionFilter: string;
  onSectionFilterChange: (value: string) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  selectedStudentCount: number;
  onClearSelection: () => void;
  totalCount: number;
  isExporting: boolean;
  canBulkImport: boolean;
  canAddStudent: boolean;
  onOpenPrintModal: () => void;
  onExportCsv: () => void;
  onOpenCsvImport: () => void;
  onOpenCreate: () => void;
}

export const StudentsFilterBar: React.FC<StudentsFilterBarProps> = ({
  sections,
  selectedSectionFilter,
  onSectionFilterChange,
  searchQuery,
  onSearchQueryChange,
  selectedStudentCount,
  onClearSelection,
  totalCount,
  isExporting,
  canBulkImport,
  canAddStudent,
  onOpenPrintModal,
  onExportCsv,
  onOpenCsvImport,
  onOpenCreate,
}) => {
  const { tokens, brand, ui } = useTheme();

  return (
    <div
      style={{
        ...ui.card,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '12px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <select
          aria-label="Filter by class section"
          value={selectedSectionFilter}
          onChange={(e) => onSectionFilterChange(e.target.value)}
          style={{ ...ui.input, width: 'auto', minWidth: 220, fontWeight: 700, cursor: 'pointer' }}
        >
          <option value="ALL">All Class Sections</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.grade_level_name ? `${sec.grade_level_name} - ` : ''}
              {sec.name}
            </option>
          ))}
        </select>

        <div style={{ position: 'relative', width: 250 }}>
          <Search
            size={14}
            color={tokens.textMuted}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            maxLength={60}
            placeholder="Search student name or LRN..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            style={{ ...ui.input, paddingLeft: 32 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {selectedStudentCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            style={{
              ...ui.btnSecondary,
              backgroundColor: tokens.primaryLight,
              borderColor: brand.primary,
              color: brand.primary,
            }}
          >
            <span>{selectedStudentCount} Selected &times; Clear</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenPrintModal}
          disabled={totalCount === 0}
          style={{ ...ui.btnSecondary, borderColor: brand.primary, color: brand.primary }}
        >
          <Printer size={14} color={brand.primary} />
          <span>
            {selectedStudentCount > 0
              ? `Print Class List & QR (${selectedStudentCount})`
              : 'Print / Export Class List & QR'}
          </span>
        </button>

        <button
          type="button"
          onClick={onExportCsv}
          disabled={isExporting || totalCount === 0}
          style={ui.btnSecondary}
        >
          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          <span>Export CSV ({totalCount.toLocaleString()})</span>
        </button>

        {canBulkImport && (
          <button type="button" onClick={onOpenCsvImport} style={ui.btnSecondary}>
            <Upload size={14} color={brand.primary} />
            <span>Import CSV Class List</span>
          </button>
        )}

        {canAddStudent && (
          <button type="button" onClick={onOpenCreate} style={ui.btnPrimary}>
            <Plus size={15} />
            <span>Add Student</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default StudentsFilterBar;
