export type LayoutMode = 'pages' | 'pageless';
export type PageOrientation = 'portrait' | 'landscape';
export type PaperSizeKey = 'legal' | 'folio' | 'letter' | 'a4' | 'a3';
export type MarginPresetKey = 'compact' | 'narrow' | 'normal' | 'none' | 'custom';
export type HeaderRepeatMode = 'all_pages' | 'first_page_only';

export interface PageMargins {
  top: number;    // inches
  bottom: number; // inches
  left: number;   // inches
  right: number;  // inches
}

export interface PaperDimension {
  name: string;
  width: number;  // inches in portrait
  height: number; // inches in portrait
  description: string;
}

export const PAPER_SIZES: Record<PaperSizeKey, PaperDimension> = {
  legal: { name: 'Legal', width: 8.5, height: 14.0, description: '8.5 × 14.0 in (Standard DepEd SF)' },
  folio: { name: 'Folio / Long Bond', width: 8.5, height: 13.0, description: '8.5 × 13.0 in (Philippine Standard)' },
  letter: { name: 'Letter', width: 8.5, height: 11.0, description: '8.5 × 11.0 in (Short Bond)' },
  a4: { name: 'A4', width: 8.27, height: 11.69, description: '210 × 297 mm (International Standard)' },
  a3: { name: 'A3', width: 11.69, height: 16.54, description: '297 × 420 mm (Large Format)' },
};

export const MARGIN_PRESETS: Record<MarginPresetKey, { label: string; margins: PageMargins }> = {
  compact: { label: 'Compact (0.25 in)', margins: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 } },
  narrow: { label: 'Narrow (0.5 in)', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } },
  normal: { label: 'Normal (1.0 in)', margins: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 } },
  none: { label: 'Zero Margins', margins: { top: 0, bottom: 0, left: 0, right: 0 } },
  custom: { label: 'Custom Margins', margins: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 } },
};

export interface PageSetupConfig {
  layoutMode: LayoutMode;
  orientation: PageOrientation;
  paperSize: PaperSizeKey;
  pageColor: string;
  marginPreset: MarginPresetKey;
  margins: PageMargins;
  headerRepeat: HeaderRepeatMode;
}

export const DEFAULT_PAGE_SETUP: PageSetupConfig = {
  layoutMode: 'pages',
  orientation: 'landscape',
  paperSize: 'legal',
  pageColor: '#ffffff',
  marginPreset: 'compact',
  margins: { top: 0.25, bottom: 0.25, left: 0.25, right: 0.25 },
  headerRepeat: 'all_pages',
};