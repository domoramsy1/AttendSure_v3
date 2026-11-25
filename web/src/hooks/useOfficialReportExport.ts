/**
 * AttendSure - Unified Print, PDF, Excel, Word, CSV & JSON Export Hook for Official DepEd Reports
 * File: web/src/hooks/useOfficialReportExport.ts
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { exportToCsv } from '../components/common/Pagination';
import {
  DEFAULT_DEPED_LANDSCAPE_SETUP,
  resolvePaperDimensionsInches,
} from '../components/reports/ReportViewerShell';
import {
  buildAuditStamp,
  exportElementToExcel,
  exportElementToLocalPdf,
  exportElementToWord,
  exportReportJson,
  logOfficialReportAudit,
  saveBlobWithOptionalPicker,
  type AuditStampMeta,
} from '../utils/reportExporters';
import { useAlert } from '../context/AlertContext';
import type { PageSetupConfig } from '../types/pageSetup';

export interface OfficialReportExportOptions<TReport> {
  formCode: 'SF1' | 'SF2' | 'SF4';
  reportData: TReport | null;
  reportRef: RefObject<HTMLDivElement | null>;
  schoolId?: string;
  sectionId?: string | number;
  getBaseFilename: () => string;
  buildCsvData: () => { headers: string[]; rows: Array<Array<string | number>> };
  initialPageSetup?: PageSetupConfig;
}

const FORMULA_PREFIX_RE = /^[=+\-@\t\r|]/;

const escapeCsvCell = (val: unknown): string => {
  const raw = String(val ?? '');
  const safe = FORMULA_PREFIX_RE.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function useOfficialReportExport<TReport>({
  formCode,
  reportData,
  reportRef,
  schoolId,
  sectionId,
  getBaseFilename,
  buildCsvData,
  initialPageSetup = DEFAULT_DEPED_LANDSCAPE_SETUP,
}: OfficialReportExportOptions<TReport>) {
  const { showAlert } = useAlert();

  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [auditMeta, setAuditMeta] = useState<AuditStampMeta>(() => buildAuditStamp(formCode));
  const [pageConfig, setPageConfig] = useState<PageSetupConfig>(initialPageSetup);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState<boolean>(false);

  const { widthIn: pageWidthInches, heightIn: pageHeightInches } = useMemo(
    () => resolvePaperDimensionsInches(pageConfig),
    [pageConfig]
  );

  const refreshAuditMeta = useCallback(
    (schoolIdOverride?: string) => {
      const next = buildAuditStamp(formCode, schoolIdOverride || schoolId);
      setAuditMeta(next);
      return next;
    },
    [formCode, schoolId]
  );

  const logAudit = useCallback(
    (action: 'VIEW' | 'PRINT' | 'PDF' | 'EXCEL' | 'WORD' | 'CSV' | 'JSON', meta: AuditStampMeta) => {
      void logOfficialReportAudit({
        reportName: formCode,
        trackingId: meta.trackingId,
        printedAt: meta.printedAt,
        action,
        sectionId,
      });
    },
    [formCode, sectionId]
  );

  const stampView = useCallback(
    (schoolIdOverride?: string) => {
      const meta = refreshAuditMeta(schoolIdOverride);
      logAudit('VIEW', meta);
      return meta;
    },
    [refreshAuditMeta, logAudit]
  );

  useEffect(() => {
    const handleBeforePrint = () => {
      refreshAuditMeta();
      setIsPrinting(true);
    };
    const handleAfterPrint = () => {
      setIsPrinting(false);
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [refreshAuditMeta]);

  const handleDirectPrint = useCallback(() => {
    const meta = refreshAuditMeta();
    logAudit('PRINT', meta);
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setTimeout(() => setIsPrinting(false), 400);
    }, 180);
  }, [refreshAuditMeta, logAudit]);

  const handleExportPdf = useCallback(
    async (usePicker = false) => {
      if (!reportData || !reportRef.current) return;
      const meta = refreshAuditMeta();
      logAudit('PDF', meta);

      setIsExportingPdf(true);
      setIsPrinting(true);
      try {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await exportElementToLocalPdf({
          element: reportRef.current,
          filename: `${getBaseFilename()}.pdf`,
          pageWidthInches,
          pageHeightInches,
          orientation: pageConfig.orientation,
          pageColor: pageConfig.pageColor,
          pageless: pageConfig.layoutMode === 'pageless',
          usePicker,
        });
      } catch {
        showAlert({
          title: 'Opening Print Dialog',
          message: 'Choose "Save as PDF" in your browser print dialog.',
          type: 'info',
        });
        handleDirectPrint();
      } finally {
        setIsPrinting(false);
        setIsExportingPdf(false);
      }
    },
    [
      reportData,
      reportRef,
      refreshAuditMeta,
      logAudit,
      getBaseFilename,
      pageWidthInches,
      pageHeightInches,
      pageConfig.orientation,
      pageConfig.pageColor,
      pageConfig.layoutMode,
      showAlert,
      handleDirectPrint,
    ]
  );

  const handleExportCsv = useCallback(
    async (usePicker = false) => {
      if (!reportData) return;
      const meta = refreshAuditMeta();
      logAudit('CSV', meta);
      const { headers, rows } = buildCsvData();
      const filename = `${getBaseFilename()}.csv`;

      if (usePicker) {
        const csvString =
          '\uFEFF' +
          [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join(
            '\r\n'
          );
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        await saveBlobWithOptionalPicker(blob, filename, 'text/csv', 'csv', 'CSV Spreadsheet (*.csv)');
      } else {
        exportToCsv(filename, headers, rows);
      }
    },
    [reportData, refreshAuditMeta, logAudit, buildCsvData, getBaseFilename]
  );

  const handleExportExcel = useCallback(
    async (usePicker = false) => {
      if (!reportData || !reportRef.current) return;
      const meta = refreshAuditMeta();
      logAudit('EXCEL', meta);
      await exportElementToExcel(reportRef.current, getBaseFilename(), meta, usePicker);
    },
    [reportData, reportRef, refreshAuditMeta, logAudit, getBaseFilename]
  );

  const handleExportWord = useCallback(
    async (usePicker = false) => {
      if (!reportData || !reportRef.current) return;
      const meta = refreshAuditMeta();
      logAudit('WORD', meta);
      await exportElementToWord(reportRef.current, getBaseFilename(), meta, usePicker);
    },
    [reportData, reportRef, refreshAuditMeta, logAudit, getBaseFilename]
  );

  const handleExportJson = useCallback(
    async (usePicker = false) => {
      if (!reportData) return;
      const meta = refreshAuditMeta();
      logAudit('JSON', meta);
      await exportReportJson(getBaseFilename(), meta, reportData, usePicker);
    },
    [reportData, refreshAuditMeta, logAudit, getBaseFilename]
  );

  return {
    auditMeta,
    isExportingPdf,
    isPrinting,
    pageConfig,
    setPageConfig,
    isPageSetupOpen,
    setIsPageSetupOpen,
    pageWidthInches,
    pageHeightInches,
    refreshAuditMeta,
    stampView,
    handleDirectPrint,
    handleExportPdf,
    handleExportCsv,
    handleExportExcel,
    handleExportWord,
    handleExportJson,
  };
}
