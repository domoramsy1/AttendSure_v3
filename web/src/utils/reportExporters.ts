/**
 * AttendSure - Offline-Proof Local PDF, Word, Excel, JSON & Audit Export Helpers
 * File: web/src/utils/reportExporters.ts
 */

import apiClient from '../api/client';
import { API_ROUTES, escapeHtml } from '../api/routes';
import { PAPER_SIZES, type PageOrientation, type PageSetupConfig } from '../types/pageSetup';

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

/**
 * Detects whether a captured canvas slice contains visible non-background ink
 * so completely blank trailing slices are never added as empty PDF pages.
 */
const canvasHasVisibleInk = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bgRgb: [number, number, number]
): boolean => {
  if (width <= 0 || height <= 0) return false;
  try {
    const sampleStepX = Math.max(1, Math.floor(width / 120));
    const sampleStepY = Math.max(1, Math.floor(height / 120));
    const data = ctx.getImageData(0, 0, width, height).data;
    let nonBgCount = 0;
    for (let y = 0; y < height; y += sampleStepY) {
      for (let x = 0; x < width; x += sampleStepX) {
        const idx = (y * width + x) * 4;
        const a = data[idx + 3];
        if (a < 10) continue;
        const dr = Math.abs(data[idx] - bgRgb[0]);
        const dg = Math.abs(data[idx + 1] - bgRgb[1]);
        const db = Math.abs(data[idx + 2] - bgRgb[2]);
        if (dr + dg + db > 24) {
          nonBgCount += 1;
          if (nonBgCount >= 6) return true;
        }
      }
    }
    return false;
  } catch {
    return true;
  }
};

const hexToRgbTuple = (hex?: string): [number, number, number] => {
  const clean = String(hex || '#ffffff').replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 255,
      parseInt(clean[1] + clean[1], 16) || 255,
      parseInt(clean[2] + clean[2], 16) || 255,
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 255,
      parseInt(clean.slice(2, 4), 16) || 255,
      parseInt(clean.slice(4, 6), 16) || 255,
    ];
  }
  return [255, 255, 255];
};

const fillPdfPageBackground = (
  doc: { setFillColor: (r: number, g: number, b: number) => void; rect: (x: number, y: number, w: number, h: number, style: string) => void },
  wIn: number,
  hIn: number,
  bgRgb: [number, number, number]
) => {
  if (bgRgb[0] === 255 && bgRgb[1] === 255 && bgRgb[2] === 255) return;
  doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
  doc.rect(0, 0, wIn, hIn, 'F');
};

/**
 * Generates a crisp, zero-cut, zero-blank-page PDF locally using html2canvas + jsPDF.
 * - Discrete pages (`[data-print-page="true"]` / `.sf*-sheet-page` / `.csc-print-page` / `.print-pack-page`)
 *   are each captured individually and scaled proportionally to fit cleanly inside the target sheet,
 *   guaranteeing exact page count with zero clipped footers and zero blank trailing pages.
 * - Pageless mode exports one seamless continuous sheet sized to content height.
 * - Continuous multi-page content slices cleanly and automatically discards blank remainder pages.
 */
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
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const finalName = opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`;
  const [mTop, mRight, mBottom, mLeft] = opts.marginsInches || [0, 0, 0, 0];
  const pageBg = opts.pageColor || '#ffffff';
  const bgRgb = hexToRgbTuple(pageBg);
  const availW = Math.max(1, opts.pageWidthInches - mLeft - mRight);
  const availH = Math.max(1, opts.pageHeightInches - mTop - mBottom);

  const captureNode = async (node: HTMLElement): Promise<HTMLCanvasElement> => {
    const prevShadow = node.style.boxShadow;
    const prevBorder = node.style.border;
    const prevMarginBottom = node.style.marginBottom;
    const prevRadius = node.style.borderRadius;
    node.style.boxShadow = 'none';
    node.style.border = 'none';
    node.style.marginBottom = '0px';
    node.style.borderRadius = '0px';
    try {
      return await html2canvas(node, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: pageBg,
      });
    } finally {
      node.style.boxShadow = prevShadow;
      node.style.border = prevBorder;
      node.style.marginBottom = prevMarginBottom;
      node.style.borderRadius = prevRadius;
    }
  };

  const discreteSelector =
    '[data-print-page="true"], .sf1-sheet-page, .sf2-sheet-page, .sf4-sheet-page, .csc-print-page, .print-pack-page';
  const rawNodes = opts.element.matches(discreteSelector)
    ? [opts.element]
    : Array.from(opts.element.querySelectorAll<HTMLElement>(discreteSelector));
  const pageNodes = rawNodes.filter((el) => el.offsetHeight > 8 && el.offsetWidth > 8);

  let doc: InstanceType<typeof jsPDF>;

  if (opts.pageless) {
    const canvas = await captureNode(opts.element);
    const naturalHIn = canvas.width > 0 ? (canvas.height / canvas.width) * availW : availH;
    const totalPageH = Math.max(opts.pageHeightInches, naturalHIn + mTop + mBottom);
    const orientation: PageOrientation = opts.pageWidthInches >= totalPageH ? 'landscape' : 'portrait';
    doc = new jsPDF({
      unit: 'in',
      orientation,
      format: [opts.pageWidthInches, totalPageH],
      compress: true,
    });
    fillPdfPageBackground(doc, opts.pageWidthInches, totalPageH, bgRgb);
    const imgData = canvas.toDataURL('image/jpeg', 0.96);
    doc.addImage(imgData, 'JPEG', mLeft, mTop, availW, naturalHIn, undefined, 'FAST');
  } else if (pageNodes.length > 0) {
    doc = new jsPDF({
      unit: 'in',
      orientation: opts.orientation,
      format: [opts.pageWidthInches, opts.pageHeightInches],
      compress: true,
    });

    let addedPages = 0;
    for (const node of pageNodes) {
      const canvas = await captureNode(node);
      if (canvas.width <= 2 || canvas.height <= 2) continue;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx && !canvasHasVisibleInk(ctx, canvas.width, canvas.height, bgRgb)) continue;

      if (addedPages > 0) {
        doc.addPage([opts.pageWidthInches, opts.pageHeightInches], opts.orientation);
      }
      fillPdfPageBackground(doc, opts.pageWidthInches, opts.pageHeightInches, bgRgb);

      // Scale-to-fit inside printable bounds so content is NEVER cut off or spilled to a blank page
      const scale = Math.min(availW / canvas.width, availH / canvas.height);
      const drawW = canvas.width * scale;
      const drawH = canvas.height * scale;
      const offsetX = mLeft + Math.max(0, (availW - drawW) / 2);
      const offsetY = mTop;

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      doc.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
      addedPages += 1;
    }
  } else {
    const fullCanvas = await captureNode(opts.element);
    doc = new jsPDF({
      unit: 'in',
      orientation: opts.orientation,
      format: [opts.pageWidthInches, opts.pageHeightInches],
      compress: true,
    });

    const pxPerInch = fullCanvas.width / availW;
    const sliceHeightPx = Math.max(100, Math.floor(availH * pxPerInch));

    // If total content fits within 106% of 1 page, scale neatly to 1 crisp uncut page
    if (fullCanvas.height <= sliceHeightPx * 1.06) {
      fillPdfPageBackground(doc, opts.pageWidthInches, opts.pageHeightInches, bgRgb);
      const scale = Math.min(availW / fullCanvas.width, availH / fullCanvas.height);
      const drawW = fullCanvas.width * scale;
      const drawH = fullCanvas.height * scale;
      const offsetX = mLeft + Math.max(0, (availW - drawW) / 2);
      doc.addImage(fullCanvas.toDataURL('image/jpeg', 0.96), 'JPEG', offsetX, mTop, drawW, drawH, undefined, 'FAST');
    } else {
      let yOffset = 0;
      let pageIndex = 0;
      while (yOffset < fullCanvas.height) {
        const remaining = fullCanvas.height - yOffset;
        if (remaining < 14) break;
        const currentSliceH = Math.min(sliceHeightPx, remaining);

        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = fullCanvas.width;
        sliceCanvas.height = currentSliceH;
        const sliceCtx = sliceCanvas.getContext('2d', { willReadFrequently: true });
        if (!sliceCtx) break;
        sliceCtx.fillStyle = pageBg;
        sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        sliceCtx.drawImage(
          fullCanvas,
          0,
          yOffset,
          fullCanvas.width,
          currentSliceH,
          0,
          0,
          fullCanvas.width,
          currentSliceH
        );

        if (canvasHasVisibleInk(sliceCtx, sliceCanvas.width, sliceCanvas.height, bgRgb)) {
          if (pageIndex > 0) {
            doc.addPage([opts.pageWidthInches, opts.pageHeightInches], opts.orientation);
          }
          fillPdfPageBackground(doc, opts.pageWidthInches, opts.pageHeightInches, bgRgb);
          const drawHIn = currentSliceH / pxPerInch;
          doc.addImage(
            sliceCanvas.toDataURL('image/jpeg', 0.96),
            'JPEG',
            mLeft,
            mTop,
            availW,
            Math.min(availH, drawHIn),
            undefined,
            'FAST'
          );
          pageIndex += 1;
        }
        yOffset += currentSliceH;
      }
    }
  }

  if (opts.usePicker) {
    const pdfBlob = doc.output('blob');
    await saveBlobWithOptionalPicker(
      pdfBlob,
      finalName,
      'application/pdf',
      'pdf',
      'PDF Document (*.pdf)'
    );
  } else {
    doc.save(finalName);
  }
};

/**
 * Opens a clean hidden iframe print dialog respecting PageSetupConfig paper size,
 * orientation, margins, and paper tint with zero blank trailing pages and zero cut cards.
 */
export const printHtmlWithPageSetup = (opts: {
  title: string;
  bodyHtml: string;
  pageConfig: PageSetupConfig;
  extraCss?: string;
  auditFooter?: AuditStampMeta;
}): void => {
  const paper = PAPER_SIZES[opts.pageConfig.paperSize] || PAPER_SIZES.a4;
  const isLandscape = opts.pageConfig.orientation === 'landscape';
  const widthIn = isLandscape ? paper.height : paper.width;
  const heightIn = isLandscape ? paper.width : paper.height;
  const { top, right, bottom, left } = opts.pageConfig.margins;
  const pageBg = opts.pageConfig.pageColor || '#ffffff';

  const footerHtml = opts.auditFooter
    ? `<div class="print-audit-foot">Document ID: ${escapeHtml(opts.auditFooter.trackingId)} &bull; Printed: ${escapeHtml(opts.auditFooter.printedAt)}</div>`
    : '';

  const fullHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    @page {
      size: ${widthIn}in ${heightIn}in;
      margin: ${top}in ${right}in ${bottom}in ${left}in;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: ${pageBg};
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    * { box-sizing: border-box; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr, .qr-card-item, .sig-block, .id-pass-card { break-inside: avoid; page-break-inside: avoid; }
    .print-pack-page, [data-print-page="true"] {
      width: 100% !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      box-shadow: none !important;
      background: ${pageBg} !important;
    }
    .print-pack-page:not(:last-child), [data-print-page="true"]:not(:last-child) {
      page-break-after: always;
      break-after: page;
    }
    .print-pack-page:last-child, [data-print-page="true"]:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .print-audit-foot {
      margin-top: 8px;
      font-size: 8.5px;
      color: #475569;
      text-align: right;
      break-inside: avoid;
    }
    ${opts.extraCss || ''}
  </style>
</head>
<body>
  ${opts.bodyHtml}
  ${footerHtml}
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = blobUrl;

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
      }, 2000);
    }
  };
  document.body.appendChild(iframe);
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