// AttendSure Web - Use Page Setup Hook
// File: D:\AttendSure_V3\web\src\hooks\usePageSetup.ts

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_PAGE_SETUP, MARGIN_PRESETS, PAPER_SIZES } from '../types/pageSetup';
import type {
  HeaderRepeatMode,
  LayoutMode,
  MarginPresetKey,
  PageOrientation,
  PageSetupConfig,
  PaperSizeKey,
} from '../types/pageSetup';

const GLOBAL_DEFAULT_KEY = 'attendsure_page_setup_default';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const clampMargin = (val: unknown, fallback: number): number => {
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0 || num > 4) return fallback;
  return num;
};

const sanitizePageSetup = (raw: unknown): PageSetupConfig => {
  if (!raw || typeof raw !== 'object') return DEFAULT_PAGE_SETUP;
  const r = raw as Partial<PageSetupConfig>;

  const layoutMode: LayoutMode =
    r.layoutMode === 'pages' || r.layoutMode === 'pageless'
      ? r.layoutMode
      : DEFAULT_PAGE_SETUP.layoutMode;

  const orientation: PageOrientation =
    r.orientation === 'portrait' || r.orientation === 'landscape'
      ? r.orientation
      : DEFAULT_PAGE_SETUP.orientation;

  const paperSize: PaperSizeKey =
    r.paperSize && r.paperSize in PAPER_SIZES
      ? r.paperSize
      : DEFAULT_PAGE_SETUP.paperSize;

  const marginPreset: MarginPresetKey =
    r.marginPreset && r.marginPreset in MARGIN_PRESETS
      ? r.marginPreset
      : DEFAULT_PAGE_SETUP.marginPreset;

  const headerRepeat: HeaderRepeatMode =
    r.headerRepeat === 'all_pages' || r.headerRepeat === 'first_page_only'
      ? r.headerRepeat
      : DEFAULT_PAGE_SETUP.headerRepeat;

  const pageColor =
    typeof r.pageColor === 'string' && HEX_COLOR_RE.test(r.pageColor.trim())
      ? r.pageColor.trim()
      : DEFAULT_PAGE_SETUP.pageColor;

  const rawMargins = r.margins || DEFAULT_PAGE_SETUP.margins;
  const margins = {
    top: clampMargin(rawMargins.top, DEFAULT_PAGE_SETUP.margins.top),
    bottom: clampMargin(rawMargins.bottom, DEFAULT_PAGE_SETUP.margins.bottom),
    left: clampMargin(rawMargins.left, DEFAULT_PAGE_SETUP.margins.left),
    right: clampMargin(rawMargins.right, DEFAULT_PAGE_SETUP.margins.right),
  };

  return {
    layoutMode,
    orientation,
    paperSize,
    pageColor,
    marginPreset,
    margins,
    headerRepeat,
  };
};

export const usePageSetup = (reportKey: string = 'general') => {
  const specificKey = `attendsure_page_setup_${reportKey}`;

  const loadInitial = useCallback((): PageSetupConfig => {
    try {
      const specific = localStorage.getItem(specificKey);
      if (specific) return sanitizePageSetup(JSON.parse(specific));

      const globalDefault = localStorage.getItem(GLOBAL_DEFAULT_KEY);
      if (globalDefault) return sanitizePageSetup(JSON.parse(globalDefault));
    } catch {
      // Ignore malformed storage values
    }
    return DEFAULT_PAGE_SETUP;
  }, [specificKey]);

  const [config, setConfig] = useState<PageSetupConfig>(loadInitial);

  // Sync state if localStorage changes from another tab/window
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === specificKey || e.key === GLOBAL_DEFAULT_KEY) {
        setConfig(loadInitial());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [specificKey, loadInitial]);

  const saveConfig = useCallback(
    (newConfig: PageSetupConfig, setAsGlobalDefault: boolean = false) => {
      const safe = sanitizePageSetup(newConfig);
      setConfig(safe);
      try {
        localStorage.setItem(specificKey, JSON.stringify(safe));
        if (setAsGlobalDefault) {
          localStorage.setItem(GLOBAL_DEFAULT_KEY, JSON.stringify(safe));
        }
      } catch {
        // Ignore storage quota issues
      }
    },
    [specificKey]
  );

  return { config, saveConfig };
};
