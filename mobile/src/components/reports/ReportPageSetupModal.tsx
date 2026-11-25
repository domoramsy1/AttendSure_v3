// AttendSure Mobile - Report Page Setup Modal & Print CSS Helper
// File: D:\AttendSure_V3\mobile\src\components\reports\ReportPageSetupModal.tsx

import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import ChipRow from '../common/ChipRow';

export type MobilePaperKey = 'letter' | 'folio' | 'legal' | 'a4';
export type MobileOrientation = 'portrait' | 'landscape';
export type MobileMarginPreset = 'compact' | 'narrow' | 'normal';

export interface MobilePageSetup {
  paperSize: MobilePaperKey;
  orientation: MobileOrientation;
  marginPreset: MobileMarginPreset;
}

export const MOBILE_PAPER_DIMS: Record<
  MobilePaperKey,
  { label: string; width: number; height: number }
> = {
  letter: { label: 'Letter (8.5×11 in)', width: 8.5, height: 11.0 },
  folio: { label: 'Folio (8.5×13 in)', width: 8.5, height: 13.0 },
  legal: { label: 'Legal (8.5×14 in)', width: 8.5, height: 14.0 },
  a4: { label: 'A4 (8.27×11.69 in)', width: 8.27, height: 11.69 },
};

export const MOBILE_MARGIN_INCHES: Record<
  MobileMarginPreset,
  { label: string; inches: number }
> = {
  compact: { label: 'Compact (0.25 in)', inches: 0.25 },
  narrow: { label: 'Narrow (0.50 in)', inches: 0.5 },
  normal: { label: 'Normal (1.00 in)', inches: 1.0 },
};

export const applyMobilePageSetupToHtml = (rawHtml: string, setup: MobilePageSetup): string => {
  const paper = MOBILE_PAPER_DIMS[setup.paperSize] || MOBILE_PAPER_DIMS.legal;
  const wIn = setup.orientation === 'landscape' ? paper.height : paper.width;
  const hIn = setup.orientation === 'landscape' ? paper.width : paper.height;
  const mIn = (MOBILE_MARGIN_INCHES[setup.marginPreset] || MOBILE_MARGIN_INCHES.compact).inches;

  const pageCss = `<style>
    @page { size: ${wIn}in ${hIn}in; margin: ${mIn}in !important; }
    html, body { margin: 0 !important; padding: 0 !important; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr, .qr-card, .sig-grid { page-break-inside: avoid; break-inside: avoid; }
    section.sheet:not(:last-child) { page-break-after: always; break-after: page; }
    section.sheet:last-child, .page-break:last-child { page-break-after: avoid !important; break-after: avoid !important; }
  </style>`;

  if (/<\/head>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/head>/i, `${pageCss}</head>`);
  }
  return `${pageCss}${rawHtml}`;
};

interface ReportPageSetupModalProps {
  visible: boolean;
  pageSetup: MobilePageSetup;
  onChange: (next: MobilePageSetup) => void;
  onClose: () => void;
}

export const ReportPageSetupModal: React.FC<ReportPageSetupModalProps> = ({
  visible,
  pageSetup,
  onChange,
  onClose,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Page Setup</Text>
          <Text style={styles.modalSub}>
            Choose paper size, orientation, and margins so every downloaded or printed sheet fits
            cleanly with no cut or blank pages.
          </Text>

          <Text style={styles.modalLabel}>Paper Size</Text>
          <ChipRow<MobilePaperKey>
            wrap
            options={(Object.keys(MOBILE_PAPER_DIMS) as MobilePaperKey[]).map((key) => ({
              key,
              label: MOBILE_PAPER_DIMS[key].label,
            }))}
            selected={pageSetup.paperSize}
            onSelect={(paperSize) => onChange({ ...pageSetup, paperSize })}
          />

          <Text style={styles.modalLabel}>Orientation</Text>
          <ChipRow<MobileOrientation>
            wrap
            options={[
              { key: 'portrait', label: 'Portrait' },
              { key: 'landscape', label: 'Landscape' },
            ]}
            selected={pageSetup.orientation}
            onSelect={(orientation) => onChange({ ...pageSetup, orientation })}
          />

          <Text style={styles.modalLabel}>Page Margins</Text>
          <ChipRow<MobileMarginPreset>
            wrap
            options={(Object.keys(MOBILE_MARGIN_INCHES) as MobileMarginPreset[]).map((mKey) => ({
              key: mKey,
              label: MOBILE_MARGIN_INCHES[mKey].label,
            }))}
            selected={pageSetup.marginPreset}
            onSelect={(marginPreset) => onChange({ ...pageSetup, marginPreset })}
          />

          <TouchableOpacity
            style={[styles.btnPri, { width: '100%', paddingVertical: 11, marginTop: 12 }]}
            onPress={onClose}
          >
            <Text style={styles.btnPriText}>Apply Page Setup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 18,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    modalTitle: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    modalSub: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      marginTop: 4,
      marginBottom: 10,
    },
    modalLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
      marginTop: 10,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    btnPri: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.buttonBg,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      gap: 5,
      minHeight: 36,
      justifyContent: 'center',
    },
    btnPriText: {
      color: palette.onPrimary,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
  });

export default ReportPageSetupModal;
