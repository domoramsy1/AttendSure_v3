/**
 * AttendSure - Offline-Proof Local PDF, Word, Excel, JSON & Audit Export Helpers
 * File: web/src/utils/reportExporters.ts
 */

import apiClient from '../api/client';
import { API_ROUTES, escapeHtml } from '../api/routes';
import type { PageOrientation } from '../types/pageSetup';

export interface AuditStampMeta {
  printedAt: string;
  trackingId: string;
}

export const buildAuditStamp = (formCode: string, schoolId?: string): AuditStampMeta => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateFormatted = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  const dateStamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeCode = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return {
    printedAt: `${dateFormatted} at ${timeFormatted}`,
    trackingId: `DOC-${formCode.toUpperCase()}-${schoolId || 'SCH'}-${dateStamp}-${timeCode}`,
  };
};

export const logOfficialReportAudit = async (params: {
  reportName: string;
  trackingId: string;
  printedAt: string;
  action: 'VIEW' | 'PRINT' | 'PDF' | 'EXCEL' | 'WORD' | 'CSV' | 'JSON';
  sectionId?: string | number;
}): Promise<void> => {
  try {
    await apiClient.post(API_ROUTES.reports.auditLogs, {
      report_name: params.reportName,
      document_tracking_id: params.trackingId,
      section_id: params.sectionId || undefined,
      action: params.action,
      printed_at: params.printedAt,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Non-blocking when offline
  }
};

export const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const saveBlobWithOptionalPicker = async (
  blob: Blob,
  suggestedName: string,
  mimeType: string,
  extension: string,
  description: string
): Promise<void> => {
  if ('showSaveFilePicker' in window) {
    try {
      const picker = (
        window as unknown as {
          showSaveFilePicker: (opts: unknown) => Promise<{
            createWritable: () => Promise<{
              write: (b: Blob) => Promise<void>;
              close: () => Promise<void>;
            }>;
          }>;
        }
      ).showSaveFilePicker;
      const handle = await picker({
        suggestedName,
        types: [{ description, accept: { [mimeType]: [`.${extension}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
    }
  }
  triggerBlobDownload(blob, suggestedName);
};

export const exportElementToLocalPdf = async (opts: {
  element: HTMLElement;
  filename: string;
  pageWidthInches: number;
  pageHeightInches: number;
  orientation: PageOrientation;
  pageColor?: string;
  pageless?: boolean;
  marginsInches?: [number, number, number, number];
  usePicker?: boolean;
}): Promise<void> => {
  const mod = await import('html2pdf.js');
  const html2pdf = mod.default;

  const finalName = opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`;
  const marginTuple: [number, number, number, number] = opts.marginsInches || [0, 0, 0, 0];
  const formatTuple: [number, number] = [opts.pageWidthInches, opts.pageHeightInches];

  const workerOptions = {
    margin: marginTuple,
    filename: finalName,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: opts.pageColor || '#ffffff',
    },
    jsPDF: {
      unit: 'in' as const,
      format: formatTuple,
      orientation: opts.orientation,
    },
    pagebreak: opts.pageless
      ? { mode: [] as string[] }
      : { mode: ['css', 'legacy'] },
  };

  if (opts.usePicker) {
    const pdfBlob = (await html2pdf()
      .set(workerOptions)
      .from(opts.element)
      .outputPdf('blob')) as unknown as Blob;
    await saveBlobWithOptionalPicker(
      pdfBlob,
      finalName,
      'application/pdf',
      'pdf',
      'PDF Document (*.pdf)'
    );
  } else {
    await html2pdf().set(workerOptions).from(opts.element).save();
  }
};

export const exportElementToExcel = async (
  element: HTMLElement,
  baseFilename: string,
  audit: AuditStampMeta,
  usePicker = false
): Promise<void> => {
  const html = `<html><head><meta charset="utf-8"></head><body>${element.innerHTML}<br/><p style="font-size:7pt;font-family:Arial;"><strong>DOCUMENT TRACKING ID:</strong> ${escapeHtml(audit.trackingId)} &bull; <strong>PRINTED:</strong> ${escapeHtml(audit.printedAt)}</p></body></html>`;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const name = `${baseFilename}.xls`;
  if (usePicker) {
    await saveBlobWithOptionalPicker(
      blob,
      name,
      'application/vnd.ms-excel',
      'xls',
      'Excel Worksheet (*.xls)'
    );
  } else {
    triggerBlobDownload(blob, name);
  }
};

export const exportElementToWord = async (
  element: HTMLElement,
  baseFilename: string,
  audit: AuditStampMeta,
  usePicker = false
): Promise<void> => {
  const html = `<html><head><meta charset="utf-8"></head><body>${element.innerHTML}<br/><p style="font-size:7pt;font-family:Arial;"><strong>DOCUMENT TRACKING ID:</strong> ${escapeHtml(audit.trackingId)} &bull; <strong>PRINTED:</strong> ${escapeHtml(audit.printedAt)}</p></body></html>`;
  const blob = new Blob([html], { type: 'application/msword;charset=utf-8;' });
  const name = `${baseFilename}.doc`;
  if (usePicker) {
    await saveBlobWithOptionalPicker(
      blob,
      name,
      'application/msword',
      'doc',
      'Word Document (*.doc)'
    );
  } else {
    triggerBlobDownload(blob, name);
  }
};

export const exportReportJson = async (
  baseFilename: string,
  audit: AuditStampMeta,
  reportData: unknown,
  usePicker = false
): Promise<void> => {
  const payload = {
    tracking_id: audit.trackingId,
    date_and_time_printed: audit.printedAt,
    report_data: reportData,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const name = `${baseFilename}.json`;
  if (usePicker) {
    await saveBlobWithOptionalPicker(
      blob,
      name,
      'application/json',
      'json',
      'JSON Document (*.json)'
    );
  } else {
    triggerBlobDownload(blob, name);
  }
};