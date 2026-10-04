import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  RotateCw,
  FileText,
  Maximize2,
  SlidersHorizontal,
  Palette,
  BookmarkCheck,
  Copy,
  ListOrdered,
} from 'lucide-react';
import { PAPER_SIZES, MARGIN_PRESETS } from '../../types/pageSetup';
import type {
  PageSetupConfig,
  PaperSizeKey,
  PageOrientation,
  LayoutMode,
  MarginPresetKey,
  HeaderRepeatMode,
} from '../../types/pageSetup';

interface PageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: PageSetupConfig;
  onLiveChange?: (config: PageSetupConfig) => void;
  onApply: (config: PageSetupConfig, setAsDefault: boolean) => void;
  reportTitle?: string;
}

const PRESET_COLORS = [
  { label: 'Standard White', value: '#ffffff' },
  { label: 'Soft Ivory', value: '#fdfbf7' },
  { label: 'Clean Slate', value: '#f8fafc' },
  { label: 'Document Cream', value: '#fffdf5' },
];

export const PageSetupModal: React.FC<PageSetupModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onLiveChange,
  onApply,
  reportTitle = 'Report',
}) => {
  const [draft, setDraft] = useState<PageSetupConfig>(currentConfig);
  const [setAsDefault, setSetAsDefault] = useState<boolean>(false);
  const initialConfigRef = useRef<PageSetupConfig>(currentConfig);

  useEffect(() => {
    if (isOpen) {
      setDraft(currentConfig);
      initialConfigRef.current = currentConfig;
      setSetAsDefault(false);
    }
  }, [isOpen, currentConfig]);

  if (!isOpen) return null;

  const updateDraft = (newDraft: PageSetupConfig) => {
    setDraft(newDraft);
    onLiveChange?.(newDraft);
  };

  const handleOrientationChange = (orientation: PageOrientation) => {
    updateDraft({ ...draft, orientation });
  };

  const handleLayoutModeChange = (layoutMode: LayoutMode) => {
    updateDraft({ ...draft, layoutMode });
  };

  const handleHeaderRepeatChange = (headerRepeat: HeaderRepeatMode) => {
    updateDraft({ ...draft, headerRepeat });
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

  const handleCancel = () => {
    onLiveChange?.(initialConfigRef.current);
    onClose();
  };

  const handleSave = () => {
    onApply(draft, setAsDefault);
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalContainerStyle}>
        {/* Header */}
        <div style={modalHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={iconBadgeStyle}>
              <SlidersHorizontal size={18} color="#0284c7" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                Page Setup
              </h2>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>
                Configure document layout for {reportTitle}
              </p>
            </div>
          </div>
          <button onClick={handleCancel} style={closeButtonStyle}>
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={modalBodyStyle}>
          {/* 1. Layout Mode (Pages vs Pageless) */}
          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Layout Format</label>
            <div style={buttonToggleGridStyle}>
              <button
                type="button"
                onClick={() => handleLayoutModeChange('pages')}
                style={{
                  ...toggleCardStyle,
                  borderColor: draft.layoutMode === 'pages' ? '#0284c7' : '#cbd5e1',
                  backgroundColor: draft.layoutMode === 'pages' ? '#f0f9ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color={draft.layoutMode === 'pages' ? '#0284c7' : '#64748b'} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Pages</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: '#64748b' }}>
                  Divided sheets with headers, footers &amp; paper bounds.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleLayoutModeChange('pageless')}
                style={{
                  ...toggleCardStyle,
                  borderColor: draft.layoutMode === 'pageless' ? '#0284c7' : '#cbd5e1',
                  backgroundColor: draft.layoutMode === 'pageless' ? '#f0f9ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Maximize2 size={16} color={draft.layoutMode === 'pageless' ? '#0284c7' : '#64748b'} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Pageless</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: '#64748b' }}>
                  Continuous fluid layout without page break lines.
                </p>
              </button>
            </div>
          </div>

          {/* 2. Header Repetition (Every Page vs. First Page Only) */}
          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Header on Subsequent Pages</label>
            <div style={buttonToggleGridStyle}>
              <button
                type="button"
                disabled={draft.layoutMode === 'pageless'}
                onClick={() => handleHeaderRepeatChange('all_pages')}
                style={{
                  ...toggleCardStyle,
                  opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                  borderColor: (draft.headerRepeat || 'all_pages') === 'all_pages' ? '#0284c7' : '#cbd5e1',
                  backgroundColor: (draft.headerRepeat || 'all_pages') === 'all_pages' ? '#f0f9ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Copy size={16} color={(draft.headerRepeat || 'all_pages') === 'all_pages' ? '#0284c7' : '#64748b'} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>Every Page</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: '#64748b' }}>
                  Complete official header (logos &amp; metadata) appears on every page.
                </p>
              </button>

              <button
                type="button"
                disabled={draft.layoutMode === 'pageless'}
                onClick={() => handleHeaderRepeatChange('first_page_only')}
                style={{
                  ...toggleCardStyle,
                  opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                  borderColor: draft.headerRepeat === 'first_page_only' ? '#0284c7' : '#cbd5e1',
                  backgroundColor: draft.headerRepeat === 'first_page_only' ? '#f0f9ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ListOrdered size={16} color={draft.headerRepeat === 'first_page_only' ? '#0284c7' : '#64748b'} />
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>First Page Only</span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: '#64748b' }}>
                  Complete header on 1st page only. Following pages start with table header (# to Remarks).
                </p>
              </button>
            </div>
          </div>

          {/* 3. Orientation */}
          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Orientation</label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                disabled={draft.layoutMode === 'pageless'}
                onClick={() => handleOrientationChange('landscape')}
                style={{
                  ...optionCardStyle,
                  opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                  borderColor: draft.orientation === 'landscape' ? '#0284c7' : '#cbd5e1',
                  backgroundColor: draft.orientation === 'landscape' ? '#f0f9ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RotateCw size={15} color={draft.orientation === 'landscape' ? '#0284c7' : '#64748b'} />
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>Landscape</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Official DepEd SF1 / SF2</span>
              </button>

              <button
                type="button"
                disabled={draft.layoutMode === 'pageless'}
                onClick={() => handleOrientationChange('portrait')}
                style={{
                  ...optionCardStyle,
                  opacity: draft.layoutMode === 'pageless' ? 0.5 : 1,
                  borderColor: draft.orientation === 'portrait' ? '#0284c7' : '#cbd5e1',
                  backgroundColor: draft.orientation === 'portrait' ? '#f0f9ff' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={15} color={draft.orientation === 'portrait' ? '#0284c7' : '#64748b'} />
                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#0f172a' }}>Portrait</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Standard upright page</span>
              </button>
            </div>
          </div>

          {/* 4. Paper Size Selection */}
          <div style={sectionGroupStyle}>
            <label style={sectionLabelStyle}>Paper Size</label>
            <select
              disabled={draft.layoutMode === 'pageless'}
              value={draft.paperSize}
              onChange={(e) => handlePaperSizeChange(e.target.value as PaperSizeKey)}
              style={selectDropdownStyle}
            >
              {Object.entries(PAPER_SIZES).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.name} — {item.description}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Page Background Color */}
          <div style={sectionGroupStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Palette size={15} color="#475569" />
              <label style={{ ...sectionLabelStyle, marginBottom: 0 }}>Page Background Color</label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                    border: draft.pageColor === c.value ? '2px solid #0284c7' : '1px solid #cbd5e1',
                    backgroundColor: c.value,
                    cursor: 'pointer',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: '#0f172a',
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: c.value,
                      border: '1px solid #94a3b8',
                      display: 'inline-block',
                    }}
                  />
                  {c.label}
                </button>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Custom:</span>
                <input
                  type="color"
                  value={draft.pageColor}
                  onChange={(e) => handlePageColorChange(e.target.value)}
                  style={colorPickerInputStyle}
                />
              </div>
            </div>
          </div>

          {/* 6. Margins Configuration */}
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
                    border: draft.marginPreset === presetKey ? '1px solid #0284c7' : '1px solid #cbd5e1',
                    backgroundColor: draft.marginPreset === presetKey ? '#0284c7' : '#ffffff',
                    color: draft.marginPreset === presetKey ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                  }}
                >
                  {MARGIN_PRESETS[presetKey].label}
                </button>
              ))}
            </div>

            <div style={marginInputsGridStyle}>
              <div>
                <label style={miniLabelStyle}>Top (in)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="3"
                  value={draft.margins.top}
                  onChange={(e) => handleCustomMarginChange('top', parseFloat(e.target.value))}
                  style={numericInputStyle}
                />
              </div>
              <div>
                <label style={miniLabelStyle}>Bottom (in)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="3"
                  value={draft.margins.bottom}
                  onChange={(e) => handleCustomMarginChange('bottom', parseFloat(e.target.value))}
                  style={numericInputStyle}
                />
              </div>
              <div>
                <label style={miniLabelStyle}>Left (in)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="3"
                  value={draft.margins.left}
                  onChange={(e) => handleCustomMarginChange('left', parseFloat(e.target.value))}
                  style={numericInputStyle}
                />
              </div>
              <div>
                <label style={miniLabelStyle}>Right (in)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="3"
                  value={draft.margins.right}
                  onChange={(e) => handleCustomMarginChange('right', parseFloat(e.target.value))}
                  style={numericInputStyle}
                />
              </div>
            </div>
          </div>

          {/* 7. Default Persistence Option */}
          <div style={defaultCheckboxContainerStyle}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#0284c7' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookmarkCheck size={16} color="#0284c7" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                  Set as default for all reports
                </span>
              </div>
            </label>
            <p style={{ margin: '4px 0 0 26px', fontSize: '0.7rem', color: '#64748b' }}>
              Saves these dimensions across SF1, SF2, and future generated registers.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div style={modalFooterStyle}>
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
  );
};

// ==========================================
// STYLES
// ==========================================
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.28)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 16,
};

const modalContainerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  backgroundColor: '#ffffff',
  borderRadius: 12,
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
};

const iconBadgeStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  backgroundColor: '#e0f2fe',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const closeButtonStyle: React.CSSProperties = {
  border: 'none',
  backgroundColor: 'transparent',
  color: '#64748b',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 6,
  display: 'flex',
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

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const buttonToggleGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
};

const toggleCardStyle: React.CSSProperties = {
  border: '1.5px solid #cbd5e1',
  borderRadius: 8,
  padding: '10px 12px',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
};

const optionCardStyle: React.CSSProperties = {
  flex: 1,
  border: '1.5px solid #cbd5e1',
  borderRadius: 8,
  padding: '10px 12px',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  transition: 'all 0.15s ease',
};

const selectDropdownStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#0f172a',
  outline: 'none',
};

const colorPickerInputStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  cursor: 'pointer',
  backgroundColor: 'transparent',
};

const marginInputsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 10,
};

const miniLabelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  color: '#64748b',
  marginBottom: 4,
  display: 'block',
};

const numericInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#0f172a',
  textAlign: 'center',
};

const defaultCheckboxContainerStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
};

const modalFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  padding: '14px 20px',
  borderTop: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#475569',
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
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer',
};