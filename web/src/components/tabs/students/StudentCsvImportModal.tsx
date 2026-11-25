// AttendSure Web - Student Bulk CSV Class List Import Modal
// File: D:\AttendSure_V3\web\src\components\tabs\students\StudentCsvImportModal.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { AlertCircle, Download, FileSpreadsheet } from 'lucide-react';
import type { CsvImportSummary, SectionItem } from './types';

interface StudentCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: SectionItem[];
  csvFile: File | null;
  importDefaultSectionId: string;
  autoCreateSections: boolean;
  importingCsv: boolean;
  importSummary: CsvImportSummary | null;
  importError: string | null;
  onSelectFile: (file: File | null) => void;
  onChangeDefaultSection: (value: string) => void;
  onChangeAutoCreate: (checked: boolean) => void;
  onDownloadTemplate: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const StudentCsvImportModal: React.FC<StudentCsvImportModalProps> = ({
  isOpen,
  onClose,
  sections,
  csvFile,
  importDefaultSectionId,
  autoCreateSections,
  importingCsv,
  importSummary,
  importError,
  onSelectFile,
  onChangeDefaultSection,
  onChangeAutoCreate,
  onDownloadTemplate,
  onSubmit,
}) => {
  const { tokens, brand, fonts, ui } = useTheme();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Import CSV Class List">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            ...ui.subtleBox,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSpreadsheet size={20} color={brand.primary} />
            <div>
              <div style={{ fontSize: fonts.size.sm, fontWeight: 800, color: tokens.textPrimary }}>
                2-Minute School Onboarding
              </div>
              <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary }}>
                Upload up to 2,000 students at once (.csv, max 5 MB). Signed QR IDs generate automatically.
              </div>
            </div>
          </div>

          <button type="button" onClick={onDownloadTemplate} style={ui.btnSecondary}>
            <Download size={13} />
            <span>Download Sample CSV Template</span>
          </button>
        </div>

        {importError && (
          <div
            style={{
              ...ui.subtleBox,
              backgroundColor: tokens.dangerLight,
              borderColor: brand.danger,
              color: brand.danger,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 600,
            }}
          >
            <AlertCircle size={15} />
            <span>{importError}</span>
          </div>
        )}

        <div>
          <label style={ui.label}>Select CSV File *</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onSelectFile(e.target.files?.[0] || null)}
            style={ui.input}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
          <div>
            <label style={ui.label}>Fallback Section (If row has no section_name)</label>
            <select
              value={importDefaultSectionId}
              onChange={(e) => onChangeDefaultSection(e.target.value)}
              style={ui.input}
            >
              <option value="">-- Use section_name from CSV --</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.grade_level_name ? `${sec.grade_level_name} - ` : ''}
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: fonts.size.sm,
                fontWeight: 600,
                color: tokens.textPrimary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoCreateSections}
                onChange={(e) => onChangeAutoCreate(e.target.checked)}
                style={{ accentColor: brand.primary }}
              />
              Auto-create new sections from CSV
            </label>
          </div>
        </div>

        {importSummary && (
          <div
            style={{
              ...ui.subtleBox,
              backgroundColor: tokens.successLight,
              borderColor: brand.success,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontWeight: 800, color: brand.success, fontSize: fonts.size.sm }}>
              Import Complete: {importSummary.created_count} Created &bull; {importSummary.updated_count} Updated &bull;{' '}
              {importSummary.skipped_count} Skipped
            </div>
            {importSummary.errors.length > 0 && (
              <div
                style={{
                  maxHeight: 130,
                  overflowY: 'auto',
                  backgroundColor: tokens.bgSurface,
                  padding: 8,
                  borderRadius: 6,
                  fontSize: fonts.size.xs,
                  color: tokens.textSecondary,
                }}
              >
                {importSummary.errors.map((errItem, idx) => (
                  <div key={`${errItem.row}-${idx}`}>
                    Row {errItem.row} ({errItem.lrn || 'No LRN'}): {errItem.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" type="submit" loading={importingCsv} disabled={!csvFile}>
            Upload &amp; Import Class List
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default StudentCsvImportModal;
