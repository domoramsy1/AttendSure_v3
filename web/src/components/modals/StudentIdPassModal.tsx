// AttendSure Web - Student ID Pass Modal
// File: D:\AttendSure_V3\web\src\components\modals\StudentIdPassModal.tsx

/**
 * AttendSure - Digital ID & Signed QR Pass Modal
 * File: web/src/components/modals/StudentIdPassModal.tsx
 */

import React, { useRef, useState } from 'react';
import { escapeHtml } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useSchool } from '../../context/SchoolContext';
import { isSafeImageUrl } from '../../theme/tokens';
import { useCopyFeedback } from '../../utils/clipboard';
import { QrCodeSvg, buildQrSvgDataUri } from '../common/QrCodeSvg';
import { PageSetupModal } from '../common/PageSetupModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  exportElementToLocalPdf,
  printHtmlWithPageSetup,
} from '../../utils/reportExporters';
import {
  DEFAULT_PAGE_SETUP,
  PAPER_SIZES,
  type PageSetupConfig,
} from '../../types/pageSetup';
import { ShieldCheck, Copy, Check, Printer, Download, SlidersHorizontal, User as UserIcon } from 'lucide-react';
import type { StudentItem, AssignedClass } from '../tabs/MyAssignedClassesTab';

const DEFAULT_ID_PASS_PAGE_SETUP: PageSetupConfig = {
  ...DEFAULT_PAGE_SETUP,
  layoutMode: 'pages',
  orientation: 'portrait',
  paperSize: 'letter',
  pageColor: '#ffffff',
  marginPreset: 'narrow',
  margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  headerRepeat: 'first_page_only',
};

interface StudentIdPassModalProps {
  student:
    | (Partial<StudentItem> & {
        name: string;
        lrn: string;
        qr_token?: string;
        qr_payload?: string;
        photo_url?: string | null;
      })
    | null;
  selectedClass?: AssignedClass | null;
  onClose: () => void;
  onCopyLrn: (lrn: string) => void;
}

export const StudentIdPassModal: React.FC<StudentIdPassModalProps> = ({
  student,
  selectedClass,
  onClose,
  onCopyLrn,
}) => {
  const { tokens, brand, fonts, ui } = useTheme();
  const { school } = useSchool();
  const { copied, copy } = useCopyFeedback();
  const [pageConfig, setPageConfig] = useState<PageSetupConfig>(DEFAULT_ID_PASS_PAGE_SETUP);
  const [isPageSetupOpen, setIsPageSetupOpen] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const passCardRef = useRef<HTMLDivElement>(null);

  if (!student) return null;
  const safePhoto = isSafeImageUrl(student.photo_url) ? student.photo_url : null;
  const identifier = student.lrn || 'ID-00000';
  // Prefer digitally signed qr_payload so passes verify cleanly on built-in QR Scanners
  const qrData = student.qr_payload || identifier;
  const schoolName = school.school_name || 'Authorized School Campus';
  const subtitle = selectedClass?.section_name || 'Authorized Student';
  const signatureLabel = student.qr_payload ? 'Digitally Verified' : 'Active';

  const handleCopyIdentifier = () => {
    void copy(identifier, 'lrn');
    onCopyLrn(identifier);
  };

  const handlePrintPass = () => {
    const qrDataUri = buildQrSvgDataUri(qrData, 180);
    const photoMarkup =
      safePhoto && isSafeImageUrl(safePhoto)
        ? `<img src="${escapeHtml(safePhoto)}" alt="${escapeHtml(student.name)}" style="width:100%;height:100%;object-fit:cover;" />`
        : `<span style="font-size:22px;font-weight:800;color:#004b87;">${escapeHtml(student.name.charAt(0).toUpperCase() || 'S')}</span>`;

    const cardMarkup = `
      <div class="print-pack-page" data-print-page="true" style="display:flex;justify-content:center;align-items:flex-start;padding-top:12px;">
        <div class="id-pass-card">
          <div class="head">
            <div class="head-title">ATTENDSURE OFFICIAL PASS</div>
            <div class="head-school">${escapeHtml(schoolName)}</div>
          </div>
          <div class="body">
            <div class="avatar">${photoMarkup}</div>
            <div class="name">${escapeHtml(student.name)}</div>
            <div class="sub">${escapeHtml(subtitle)}</div>
            <div class="lrn">LRN: ${escapeHtml(identifier)}</div>
            <div class="qr-box">
              <img src="${qrDataUri}" alt="AttendSure QR Code" />
            </div>
          </div>
          <div class="foot">
            Verification Signature: <strong>${escapeHtml(signatureLabel)}</strong>
          </div>
        </div>
      </div>`;

    printHtmlWithPageSetup({
      title: `AttendSure ID Pass - ${student.name}`,
      bodyHtml: cardMarkup,
      pageConfig,
      extraCss: `
        .id-pass-card { width: 300px; border: 2px solid #004b87; border-radius: 14px; overflow: hidden; text-align: center; background: #ffffff; }
        .head { background: #004b87; color: #ffffff; padding: 12px; }
        .head-title { font-size: 11px; font-weight: 800; letter-spacing: 0.06em; }
        .head-school { font-size: 10px; opacity: 0.92; margin-top: 3px; }
        .body { padding: 16px; }
        .avatar { width: 58px; height: 58px; border-radius: 50%; margin: 0 auto 10px; border: 2px solid #cbd5e1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f8fafc; }
        .name { font-size: 16px; font-weight: 800; }
        .sub { font-size: 12px; color: #475569; margin-top: 3px; }
        .lrn { display: inline-block; margin: 10px auto; padding: 4px 10px; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; font-family: monospace; font-size: 12px; font-weight: 700; }
        .qr-box { width: 148px; height: 148px; margin: 8px auto 0; padding: 6px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; }
        .qr-box img { width: 100%; height: 100%; display: block; }
        .foot { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 9px; font-size: 11px; color: #475569; }
      `,
    });
  };

  const handleSavePdf = async () => {
    if (!passCardRef.current) return;
    setSavingPdf(true);
    try {
      const paper = PAPER_SIZES[pageConfig.paperSize] || PAPER_SIZES.letter;
      const isLandscape = pageConfig.orientation === 'landscape';
      const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '_') || 'Student';
      await exportElementToLocalPdf({
        element: passCardRef.current,
        filename: `AttendSure_ID_Pass_${safeName}.pdf`,
        pageWidthInches: isLandscape ? paper.height : paper.width,
        pageHeightInches: isLandscape ? paper.width : paper.height,
        orientation: pageConfig.orientation,
        pageColor: pageConfig.pageColor,
        pageless: pageConfig.layoutMode === 'pageless',
        marginsInches: [
          pageConfig.margins.top,
          pageConfig.margins.right,
          pageConfig.margins.bottom,
          pageConfig.margins.left,
        ],
      });
    } finally {
      setSavingPdf(false);
    }
  };

  return (
    <Modal isOpen={Boolean(student)} onClose={onClose} title="Digital QR ID Pass">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div
          ref={passCardRef}
          data-print-page="true"
          style={{
            width: 290,
            backgroundColor: tokens.bgSurface,
            border: `2px solid ${brand.primary}`,
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: tokens.cardShadow,
          }}
        >
          <div style={{ backgroundColor: brand.buttonBg, color: '#ffffff', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: fonts.size.xs, fontWeight: 800 }}>
              <ShieldCheck size={14} /> ATTENDSURE OFFICIAL PASS
            </div>
            <div style={{ fontSize: '0.62rem', opacity: 0.92, marginTop: 2 }}>
              {schoolName}
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                margin: '0 auto 10px',
                backgroundColor: tokens.bgSurfaceSubtle,
                border: `2px solid ${tokens.borderSubtle}`,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {safePhoto ? (
                <img src={safePhoto} alt={student.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <UserIcon size={26} color={tokens.textMuted} />
              )}
            </div>

            <div style={{ fontSize: fonts.size.md, fontWeight: 800, color: tokens.textPrimary }}>{student.name}</div>
            <div style={{ fontSize: fonts.size.sm, color: tokens.textSecondary, marginTop: 2 }}>
              {subtitle}
            </div>

            <button
              type="button"
              onClick={handleCopyIdentifier}
              style={{ ...ui.btnSecondary, margin: '10px auto', fontFamily: fonts.mono }}
            >
              <span>LRN: {identifier}</span>
              {copied ? <Check size={12} color={brand.success} /> : <Copy size={12} />}
            </button>

            <div
              style={{
                margin: '6px auto',
                padding: 6,
                backgroundColor: '#ffffff',
                border: `1px solid ${tokens.borderSubtle}`,
                borderRadius: 10,
                width: 124,
                height: 124,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCodeSvg
                value={qrData}
                size={112}
                label={`AttendSure QR code for ${student.name}`}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>

          <div
            style={{
              backgroundColor: tokens.bgSurfaceSubtle,
              borderTop: `1px solid ${tokens.borderSubtle}`,
              padding: 8,
              fontSize: fonts.size.xs,
              color: tokens.textSecondary,
            }}
          >
            Verification Signature:{' '}
            <strong style={{ color: student.qr_payload ? brand.success : brand.warning }}>
              {signatureLabel}
            </strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="secondary" size="sm" type="button" onClick={() => setIsPageSetupOpen(true)}>
            <SlidersHorizontal size={13} style={{ marginRight: 5 }} /> Page Setup
          </Button>
          <Button variant="secondary" size="sm" type="button" disabled={savingPdf} onClick={() => void handleSavePdf()}>
            <Download size={13} style={{ marginRight: 5 }} /> {savingPdf ? 'Saving...' : 'Save PDF'}
          </Button>
          <Button variant="primary" size="sm" type="button" onClick={handlePrintPass}>
            <Printer size={13} style={{ marginRight: 5 }} /> Print Pass
          </Button>
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <PageSetupModal
        isOpen={isPageSetupOpen}
        onClose={() => setIsPageSetupOpen(false)}
        currentConfig={pageConfig}
        onLiveChange={setPageConfig}
        onApply={(cfg) => setPageConfig(cfg)}
        reportTitle="Student QR ID Pass"
      />
    </Modal>
  );
};

export default StudentIdPassModal;
