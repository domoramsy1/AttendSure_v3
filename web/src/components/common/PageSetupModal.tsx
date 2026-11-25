/**
 * AttendSure - Universal Page Setup Modal
 * File: web/src/components/common/PageSetupModal.tsx
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Check,
  RotateCw,
  FileText,
  Maximize2,
  SlidersHorizontal,
  Palette,
  BookmarkCheck,
  Undo2,
} from 'lucide-react';
import { PAPER_SIZES, MARGIN_PRESETS } from '../../types/pageSetup';
import type {
  PageSetupConfig,
  PaperSizeKey,
  PageOrientation,
  LayoutMode,
  MarginPresetKey,
} from '../../types/pageSetup';
import { useTheme } from '../../context/ThemeContext';
import { PAPER_PRESET_COLORS, SEAL_COLORS } from '../../theme/tokens';

interface PageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: PageSetupConfig;
  onLiveChange?: (config: PageSetupConfig) => void;
  onApply: (config: PageSetupConfig, setAsDefault: boolean) => void;
  reportTitle?: string;
}

const PRESET_COLORS = PAPER_PRESET_COLORS;

export const PageSetupModal: React.FC<PageSetupModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onLiveChange,
  onApply,
  reportTitle = 'Report',
}) => {
  const { tokens, brand } = useTheme();
  const [draft, setDraft] = useState<PageSetupConfig>({
    ...currentConfig,
    headerRepeat: 'first_page_only',
  });
  const [setAsDefault, setSetAsDefault] = useState<boolean>(false);
  const initialConfigRef = useRef<PageSetupConfig>(currentConfig);
  const wasOpenRef = useRef<boolean>(false);

  // Only snapshot initialConfigRef and reset checkbox when modal opens (not on every live edit)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const snapshot: PageSetupConfig = {
        ...currentConfig,
        margins: { ...currentConfig.margins },
        headerRepeat: 'first_page_only',
      };
      initialConfigRef.current = snapshot;
      setDraft(snapshot);
      setSetAsDefault(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, currentConfig]);

  const updateDraft = useCallback(
    (newDraft: PageSetupConfig) => {
      const standardizedDraft: PageSetupConfig = {
        ...newDraft,
        headerRepeat: 'first_page_only',
      };
      setDraft(standardizedDraft);
      onLiveChange?.(standardizedDraft);
    },
    [onLiveChange]
  );

  const handleCancel = useCallback(() => {
    onLiveChange?.(initialConfigRef.current);
    onClose();
  }, [onLiveChange, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel]);

  if (!isOpen) return null;

  const handleOrientationChange = (orientation: PageOrientation) => {
    updateDraft({ ...draft, orientation });
  };

  const handleLayoutModeChange = (layoutMode: LayoutMode) => {
    updateDraft({ ...draft, layoutMode });
  };

  const handlePaperSizeChange = (paperSize: PaperSizeKey) => {
    updateDraft({ ...draft, paperSize });
  };

  const handlePageColorChange = (pageColor: string) => {
    updateDraft({ ...draft, pageColor });
  };

  const handleMarginPresetChange = (preset: MarginPresetKey) => {
    updateDraft({
      ...draft,
      marginPreset: preset,
      margins: { ...MARGIN_PRESETS[preset].margins },
    });
  };

  const handleCustomMarginChange = (side: keyof PageSetupConfig['margins'], val: number) => {
    updateDraft({
      ...draft,
      marginPreset: 'custom',
      margins: {
        ...draft.margins,
        [side]: Math.max(0, Number(val) || 0),
      },
    });
  };

  const handleResetToInitial = () => {
    updateDraft({
      ...initialConfigRef.current,
      margins: { ...initialConfigRef.current.margins },
    });
    setSetAsDefault(false);
  };

  const handleSave = () => {
    onApply(draft, setAsDefault);
    onClose();
  };

  const selectedPaper = PAPER_SIZES[draft.paperSize] || PAPER_SIZES.folio;
  const isLandscape = draft.orientation === 'landscape';
  const liveWidth = isLandscape ? selectedPaper.height : selectedPaper.width;
  const liveHeight = isLandscape ? selectedPaper.width : selectedPaper.height;

  const modalContainerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 580,
    backgroundColor: tokens.bgSurface,
    border: `1px solid ${tokens.borderSubtle}`,
    borderRadius: 12,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const modalHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${tokens.borderSubtle}`,
    backgroundColor: tokens.bgSurfaceSubtle,
  };

  const iconBadgeStyle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: brand.primarySoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const closeButtonStyle: React.CSSProperties = {
    border: 'none',
    backgroundColor: 'transparent',
    color: tokens.textMuted,
    cursor: 'pointer',
    padding: 4,
    borderRadius: 6,
    display: 'flex',
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    fontWeight: 700,
    color: tokens.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  };

  const dimensionBadgeStyle: React.CSSProperties = {
    fontSize: '0.70rem',
    fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    backgroundColor: tokens.bgSurfaceSubtle,
    color: brand.primary,
    padding: '2px 8px',
    borderRadius: 4,
    border: `1px solid ${tokens.borderInput}`,
  };

  const selectDropdownStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${tokens.borderInput}`,
    backgroundColor: tokens.bgInput,
    fontSize: '0.82rem',
    fontWeight: 600,
    color: tokens.textPrimary,
    outline: 'none',
  };

  const miniLabelStyle: React.CSSProperties = {
    fontSize: '0.68rem',
    fontWeight: 600,
    color: tokens.textMuted,
    marginBottom: 4,
    display: 'block',
  };

  const numericInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 6,
    border: `1px solid ${tokens.borderInput}`,
    backgroundColor: tokens.bgInput,
    fontSize: '0.8rem',
    fontWeight: 700,
    color: tokens.textPrimary,
    textAlign: 'center',
    boxSizing: 'border-box',
  };

  const defaultCheckboxContainerStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurfaceSubtle,
    border: `1px solid ${tokens.borderSubtle}`,
    borderRadius: 8,
    padding: '12px 14px',
  };

  const modalFooterStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderTop: `1px solid ${tokens.borderSubtle}`,
    backgroundColor: tokens.bgSurfaceSubtle,
    flexWrap: 'wrap',
    gap: 10,
  };

  const btnResetStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 12px',
    borderRadius: 6,
    border: `1px solid ${tokens.borderInput}`,
    backgroundColor: tokens.bgSurface,
    color: tokens.textSecondary,
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnSecondaryStyle: React.CSSProperties = {
    padding: '7px 16px',
    borderRadius: 6,
    border: `1px solid ${tokens.borderInput}`,
    backgroundColor: tokens.bgSurface,
    color: tokens.textPrimary,
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
  };

  const btnApplyStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 18px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: brand.buttonBg,
    color: tokens.onPrimary,
    fontSize: '0.8rem',
    fontWeight: 700,
    cursor: 'pointer',
  };

  return (
    <div
      style={overlayStyle}
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="page-setup-modal-title"
    >
      <div style={modalContainerStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={iconBadgeStyle}>
              <SlidersHorizontal size={18} color={brand.primary} />
            </div>
            <div>
              <h2 id="page-setup-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: tokens.textPrimary }}>
                Page Setup
              </h2>
              <p style={{ margin: 0, fontSize: '0.74rem', color: tokens.textMuted }}>
                Configure document layout for {reportTitle}
              </p>
            </div>
          </div>
          <button onClick={handleCancel} style={closeButtonStyle} aria-label="Close page setup modal" type="button">
            <X size={18} />
          </button>
        </div>

        <div style={modalBodyStyle}>
          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Layout Format</label>
            <div style={buttonToggleGridStyle}>
              <button
                type="button"
                onClick={() => handleLayoutModeChange('pages')}
                style={{
                  ...toggleCardStyle,
                  borderColor: draft.layoutMode === 'pages' ? brand.primary : tokens.borderInput,
                  backgroundColor: draft.layoutMode === 'pages' ? brand.primarySoft : tokens.bgSurfaceSubtle,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color={draft.layoutMode === 'pages' ? brand.primary : tokens.textMuted} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: tokens.textPrimary }}>Pages</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: tokens.textSecondary }}>
                  Divided sheets with Page 1 header, footers &amp; paper bounds.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleLayoutModeChange('pageless')}
                style={{
                  ...toggleCardStyle,
                  borderColor: draft.layoutMode === 'pageless' ? brand.primary : tokens.borderInput,
                  backgroundColor: draft.layoutMode === 'pageless' ? brand.primarySoft : tokens.bgSurfaceSubtle,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Maximize2 size={16} color={draft.layoutMode === 'pageless' ? brand.primary : tokens.textMuted} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: tokens.textPrimary }}>Pageless</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: tokens.textSecondary }}>
                  Continuous fluid layout with header at the top.
                </p>
              </button>
            </div>
          </div>

          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Orientation</label>
            <div style={buttonToggleGridStyle}>
              <button
                type="button"
                disabled={draft.layoutMode === 'pageless'}
                onClick={() => handleOrientationChange('landscape')}
                style={{
                  ...optionCardStyle,
                  opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                  borderColor: draft.orientation === 'landscape' ? brand.primary : tokens.borderInput,
                  backgroundColor: draft.orientation === 'landscape' ? brand.primarySoft : tokens.bgSurfaceSubtle,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RotateCw size={15} color={draft.orientation === 'landscape' ? brand.primary : tokens.textMuted} />
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: tokens.textPrimary }}>Landscape</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: tokens.textSecondary }}>Official DepEd SF1 / SF2 / SF4</span>
              </button>

              <button
                type="button"
                disabled={draft.layoutMode === 'pageless'}
                onClick={() => handleOrientationChange('portrait')}
                style={{
                  ...optionCardStyle,
                  opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                  borderColor: draft.orientation === 'portrait' ? brand.primary : tokens.borderInput,
                  backgroundColor: draft.orientation === 'portrait' ? brand.primarySoft : tokens.bgSurfaceSubtle,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={15} color={draft.orientation === 'portrait' ? brand.primary : tokens.textMuted} />
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: tokens.textPrimary }}>Portrait</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: tokens.textSecondary }}>Standard upright format</span>
              </button>
            </div>
          </div>

          <div style={sectionGroupStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              <label style={{ ...sectionLabelStyle, marginBottom: 0 }}>Paper Size</label>
              {draft.layoutMode !== 'pageless' && (
                <span style={dimensionBadgeStyle}>
                  {liveWidth.toFixed(2)}&quot; × {liveHeight.toFixed(2)}&quot; ({isLandscape ? 'Landscape' : 'Portrait'})
                </span>
              )}
            </div>
            <select
              disabled={draft.layoutMode === 'pageless'}
              value={draft.paperSize}
              onChange={(e) => handlePaperSizeChange(e.target.value as PaperSizeKey)}
              style={{
                ...selectDropdownStyle,
                opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                cursor: draft.layoutMode === 'pageless' ? 'not-allowed' : 'pointer',
              }}
            >
              {Object.entries(PAPER_SIZES).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.name} — {item.description} ({item.width}&quot; × {item.height}&quot;)
                </option>
              ))}
            </select>
          </div>

          <div style={sectionGroupStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Palette size={15} color={tokens.textSecondary} />
              <label style={{ ...sectionLabelStyle, marginBottom: 0 }}>Page Background Color</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handlePageColorChange(c.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: draft.pageColor === c.value ? `2px solid ${brand.primary}` : `1px solid ${tokens.borderInput}`,
                    backgroundColor: c.value,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: SEAL_COLORS.ink,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: c.value,
                      border: `1px solid ${SEAL_COLORS.mutedBorder}`,
                      display: 'inline-block',
                    }}
                  />
                  {c.label}
                </button>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>Custom:</span>
                <input
                  type="color"
                  value={draft.pageColor}
                  onChange={(e) => handlePageColorChange(e.target.value)}
                  style={{ ...colorPickerInputStyle, borderColor: tokens.borderInput }}
                  title="Choose custom background color"
                />
              </div>
            </div>
          </div>

          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Margins</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {(Object.keys(MARGIN_PRESETS) as MarginPresetKey[]).map((presetKey) => (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => handleMarginPresetChange(presetKey)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: draft.marginPreset === presetKey ? `1px solid ${brand.buttonBg}` : `1px solid ${tokens.borderInput}`,
                    backgroundColor: draft.marginPreset === presetKey ? brand.buttonBg : tokens.bgSurfaceSubtle,
                    color: draft.marginPreset === presetKey ? tokens.onPrimary : tokens.textPrimary,
                    cursor: 'pointer',
                  }}
                >
                  {MARGIN_PRESETS[presetKey].label}
                </button>
              ))}
            </div>

            <div style={marginInputsGridStyle}>
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                <div key={side}>
                  <label style={miniLabelStyle}>{side[0].toUpperCase() + side.slice(1)} (in)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="3"
                    value={draft.margins[side]}
                    onChange={(e) => handleCustomMarginChange(side, parseFloat(e.target.value))}
                    style={numericInputStyle}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={defaultCheckboxContainerStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: brand.buttonBg, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookmarkCheck size={16} color={brand.primary} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: tokens.textPrimary }}>
                  Set as default for all reports
                </span>
              </div>
            </label>
            <p style={{ margin: '4px 0 0 26px', fontSize: '0.7rem', color: tokens.textMuted }}>
              Saves these dimensions across SF1, SF2, SF4, and future generated reports.
            </p>
          </div>
        </div>

        <div style={modalFooterStyle}>
          <button
            type="button"
            onClick={handleResetToInitial}
            style={btnResetStyle}
            title="Reset to initial configuration"
          >
            <Undo2 size={14} />
            <span>Reset</span>
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={handleCancel} style={btnSecondaryStyle}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} style={btnApplyStyle}>
              <Check size={16} />
              <span>Apply Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageSetupModal;

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.55)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalBodyStyle: React.CSSProperties = {
  padding: '18px 20px',
  overflowY: 'auto',
  maxHeight: '75vh',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const sectionGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const buttonToggleGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 12,
};

const toggleCardStyle: React.CSSProperties = {
  borderWidth: 1.5,
  borderStyle: 'solid',
  borderRadius: 8,
  padding: '10px 12px',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const optionCardStyle: React.CSSProperties = {
  borderWidth: 1.5,
  borderStyle: 'solid',
  borderRadius: 8,
  padding: '10px 12px',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  transition: 'all 0.15s ease',
};

const colorPickerInputStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 6,
  border: '1px solid var(--border-input)',
  cursor: 'pointer',
  backgroundColor: 'transparent',
};

const marginInputsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
  gap: 10,
};