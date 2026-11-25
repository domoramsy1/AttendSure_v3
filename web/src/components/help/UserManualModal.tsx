// AttendSure Web - Searchable In-App User Manual Modal
// File: D:\AttendSure_V3\web\src\components\help\UserManualModal.tsx

import React, { useMemo, useState, useEffect, useDeferredValue } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Play,
  Printer,
  Search,
  Sparkles,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SEAL_COLORS } from '../../theme/tokens';
import { escapeHtml } from '../../api/routes';
import { printHtmlWithPageSetup } from '../../utils/reportExporters';
import { DEFAULT_PAGE_SETUP } from '../../types/pageSetup';
import { Button } from '../ui/Button';
import {
  MANUAL_ROLE_OPTIONS,
  USER_MANUAL_SECTIONS,
  getProfileDisplayName,
  type ManualRoleKey,
  type UserProfileKey,
} from './manualContent';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfileKey;
  schoolName?: string;
  onStartTour: () => void;
}

const MAX_SEARCH_LENGTH = 100;
const MAX_SCHOOL_NAME_LENGTH = 140;

const sanitizePlainText = (value: string, maxLength: number): string =>
  String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, maxLength);

const formatRoleChipLabel = (rawLabel: string): string => {
  const cleaned = sanitizePlainText(rawLabel, 40).trim();
  if (cleaned.toLowerCase() === 'teaching teacher') return 'Teacher';
  return cleaned;
};

// Pre-compute normalized search text once for instant client-side filtering
const INDEXED_MANUAL_SECTIONS = USER_MANUAL_SECTIONS.map((section) => ({
  section,
  searchBlob: [
    section.title,
    section.summary,
    section.tip || '',
    ...section.highlights,
    ...section.steps.flatMap((s) => [s.heading, s.detail]),
    ...(section.faqs || []).flatMap((f) => [f.question, f.answer]),
  ]
    .join(' ')
    .toLowerCase(),
}));

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  schoolName = 'AttendSure School Campus',
  onStartTour,
}) => {
  const { tokens, brand, fonts, radius, ui } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<ManualRoleKey>('ALL');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'first-time-setup': true,
  });
  const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({});

  const deferredSearch = useDeferredValue(searchQuery);
  const normalizedQuery = deferredSearch.trim().toLowerCase();
  const safeSchoolName = useMemo(
    () => sanitizePlainText(schoolName, MAX_SCHOOL_NAME_LENGTH).trim() || 'AttendSure School Campus',
    [schoolName]
  );

  // Close on Escape and prevent background page scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const filteredSections = useMemo(() => {
    return INDEXED_MANUAL_SECTIONS.filter(({ section, searchBlob }) => {
      if (selectedRole !== 'ALL' && !section.roles.includes(selectedRole)) {
        return false;
      }
      if (!normalizedQuery) return true;
      return searchBlob.includes(normalizedQuery);
    }).map(({ section }) => section);
  }, [normalizedQuery, selectedRole]);

  const allVisibleExpanded = useMemo(
    () =>
      filteredSections.length > 0 &&
      filteredSections.every((sec) => Boolean(expandedSections[sec.id])),
    [filteredSections, expandedSections]
  );

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFaq = (key: string) => {
    setExpandedFaqs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleExpandAll = () => {
    const targetOpen = !allVisibleExpanded;
    setExpandedSections((prev) => {
      const next = { ...prev };
      filteredSections.forEach((sec) => {
        next[sec.id] = targetOpen;
      });
      return next;
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(sanitizePlainText(e.target.value, MAX_SEARCH_LENGTH));
  };

  const handlePrintManual = () => {
    const roleLabel =
      selectedRole === 'ALL' ? 'All School Roles' : getProfileDisplayName(selectedRole);

    const sectionsHtml = filteredSections
      .map((sec) => {
        const highlightsHtml =
          sec.highlights.length > 0
            ? `<ul style="margin:0 0 8px;padding-left:18px;">${sec.highlights
                .map((hl) => `<li style="margin-bottom:4px;">${escapeHtml(hl)}</li>`)
                .join('')}</ul>`
            : '';

        const stepsHtml = sec.steps
          .map(
            (st, idx) =>
              `<li style="margin-bottom:6px;"><strong>Step ${idx + 1} — ${escapeHtml(st.heading)}:</strong> ${escapeHtml(st.detail)}</li>`
          )
          .join('');

        const faqsHtml =
          sec.faqs && sec.faqs.length > 0
            ? `<div style="margin-top:10px;"><strong>Common Questions &amp; Quick Fixes</strong>${sec.faqs
                .map(
                  (f) =>
                    `<div style="margin-top:6px;padding:8px 10px;border:1px solid ${SEAL_COLORS.border};border-radius:6px;"><div><strong>Q: ${escapeHtml(f.question)}</strong></div><div style="margin-top:3px;">A: ${escapeHtml(f.answer)}</div></div>`
                )
                .join('')}</div>`
            : '';

        const tipHtml = sec.tip
          ? `<p style="margin-top:8px;padding:7px 10px;background:${SEAL_COLORS.surface};border-left:3px solid ${SEAL_COLORS.navy};"><strong>Tip:</strong> ${escapeHtml(sec.tip)}</p>`
          : '';

        return `
          <section style="margin-bottom:18px;page-break-inside:avoid;">
            <h2 style="margin:0 0 4px;font-size:15px;color:${SEAL_COLORS.navy};">${escapeHtml(String(sec.number))}. ${escapeHtml(sec.title)}</h2>
            <p style="margin:0 0 8px;color:${SEAL_COLORS.ink};">${escapeHtml(sec.summary)}</p>
            ${highlightsHtml}
            <ol style="margin:0;padding-left:0;list-style:none;">${stepsHtml}</ol>
            ${tipHtml}
            ${faqsHtml}
          </section>
        `;
      })
      .join('');

    const fullHtml = `
      <div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:${SEAL_COLORS.ink};">
        <div style="border-bottom:2px solid ${SEAL_COLORS.navy};padding-bottom:10px;margin-bottom:16px;">
          <h1 style="margin:0;font-size:20px;color:${SEAL_COLORS.navy};">AttendSure User Guide</h1>
          <div style="color:${SEAL_COLORS.ink};margin-top:4px;">${escapeHtml(safeSchoolName)} &bull; Guide for ${escapeHtml(roleLabel)}</div>
        </div>
        ${sectionsHtml}
      </div>
    `;

    printHtmlWithPageSetup({
      title: 'AttendSure User Guide',
      bodyHtml: fullHtml,
      pageConfig: {
        ...DEFAULT_PAGE_SETUP,
        orientation: 'portrait',
        paperSize: 'letter',
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendsure-manual-heading"
      className="no-print"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1150,
        backgroundColor: 'rgba(15, 23, 42, 0.62)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(10px, 2vw, 24px)',
        fontFamily: fonts.sans,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(96vw, 960px)',
          height: 'min(88vh, 840px)',
          maxHeight: '88vh',
          backgroundColor: tokens.bgSurface,
          color: tokens.textPrimary,
          borderRadius: radius.xl,
          border: `1px solid ${tokens.borderStrong}`,
          boxShadow: tokens.cardShadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Top Banner — locked with flexShrink: 0 */}
        <div
          style={{
            flexShrink: 0,
            padding: '16px 20px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            backgroundColor: tokens.bgSurfaceSubtle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 280px' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.lg,
                backgroundColor: tokens.primaryLight,
                color: brand.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <BookOpen size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2
                id="attendsure-manual-heading"
                style={{
                  margin: 0,
                  fontSize: fonts.size.lg,
                  lineHeight: 1.3,
                  fontWeight: fonts.weight.extrabold,
                  color: tokens.textPrimary,
                  fontFamily: fonts.display,
                }}
              >
                AttendSure User Guide
              </h2>
              <div
                style={{
                  fontSize: fonts.size.xs,
                  lineHeight: 1.4,
                  color: tokens.textSecondary,
                  marginTop: 2,
                }}
              >
                Simple step-by-step instructions &bull; Signed in as{' '}
                <strong style={{ color: tokens.textPrimary }}>
                  {getProfileDisplayName(userProfile)}
                </strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              icon={<Play size={13} />}
            >
              Start Quick Tour
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrintManual}
              icon={<Printer size={13} />}
            >
              Print Guide
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close User Guide"
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.md,
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.bgSurface,
                color: tokens.textSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search & Role Filters — locked with flexShrink: 0 */}
        <div
          style={{
            flexShrink: 0,
            padding: '14px 20px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            backgroundColor: tokens.bgSurface,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 0 }}>
              <Search
                size={15}
                color={tokens.textMuted}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                aria-label="Search user guide"
                value={searchQuery}
                onChange={handleSearchChange}
                maxLength={MAX_SEARCH_LENGTH}
                placeholder="Search help topics (e.g. QR scan, GPS, offline, DTR, phone lock)..."
                style={{
                  ...ui.input,
                  width: '100%',
                  boxSizing: 'border-box',
                  minHeight: 38,
                  paddingLeft: 36,
                  paddingRight: searchQuery ? 34 : 12,
                  backgroundColor: tokens.bgSurfaceSubtle,
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 24,
                    height: 24,
                    border: 'none',
                    borderRadius: radius.pill,
                    backgroundColor: 'transparent',
                    color: tokens.textMuted,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleExpandAll}
              disabled={filteredSections.length === 0}
            >
              {allVisibleExpanded
                ? 'Collapse All'
                : `Expand All (${filteredSections.length})`}
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {MANUAL_ROLE_OPTIONS.map((opt) => {
              const active = selectedRole === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedRole(opt.key)}
                  aria-pressed={active}
                  style={{
                    padding: '6px 12px',
                    borderRadius: radius.pill,
                    border: `1px solid ${active ? brand.primary : tokens.borderStrong}`,
                    backgroundColor: active ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                    color: active ? brand.primary : tokens.textSecondary,
                    fontSize: fonts.size.xs,
                    lineHeight: 1.3,
                    fontWeight: fonts.weight.bold,
                    cursor: 'pointer',
                  }}
                >
                  {formatRoleChipLabel(opt.label)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Topic List — display: block + minHeight: 0 prevents vertical card crushing */}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'block',
            padding: '16px 20px 24px',
            backgroundColor: tokens.bgSurfaceSubtle,
          }}
        >
          {filteredSections.length === 0 ? (
            <div
              style={{
                ...ui.card,
                height: 'auto',
                textAlign: 'center',
                padding: '36px 20px',
                color: tokens.textMuted,
              }}
            >
              <HelpCircle size={28} style={{ margin: '0 auto 10px', display: 'block' }} />
              <div
                style={{
                  fontSize: fonts.size.base,
                  fontWeight: fonts.weight.bold,
                  color: tokens.textPrimary,
                }}
              >
                No matching help topics found
              </div>
              <div style={{ fontSize: fonts.size.sm, marginTop: 6, lineHeight: 1.5 }}>
                Try another word or switch the filter back to &ldquo;All Roles&rdquo;.
              </div>
            </div>
          ) : (
            filteredSections.map((section, sectionIdx) => {
              const isExpanded = Boolean(normalizedQuery) || Boolean(expandedSections[section.id]);
              const isLast = sectionIdx === filteredSections.length - 1;

              return (
                <div
                  key={section.id}
                  style={{
                    ...ui.card,
                    height: 'auto',
                    padding: 0,
                    marginBottom: isLast ? 0 : 12,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isExpanded}
                    style={{
                      width: '100%',
                      height: 'auto',
                      minHeight: 68,
                      padding: '16px 18px',
                      border: 'none',
                      backgroundColor: tokens.bgSurface,
                      color: tokens.textPrimary,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 14,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        flex: '1 1 auto',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          marginTop: 1,
                          borderRadius: radius.pill,
                          backgroundColor: tokens.primaryLight,
                          color: brand.primary,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: fonts.size.sm,
                          fontWeight: fonts.weight.extrabold,
                          flexShrink: 0,
                        }}
                      >
                        {section.number}
                      </span>
                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: fonts.size.md,
                            lineHeight: 1.38,
                            fontWeight: fonts.weight.extrabold,
                            color: tokens.textPrimary,
                            wordBreak: 'break-word',
                          }}
                        >
                          {section.title}
                        </div>
                        <div
                          style={{
                            fontSize: fonts.size.sm,
                            color: tokens.textSecondary,
                            marginTop: 4,
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                          }}
                        >
                          {section.summary}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        color: tokens.textSecondary,
                        flexShrink: 0,
                        marginTop: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                      aria-hidden="true"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '14px 18px 18px',
                        borderTop: `1px solid ${tokens.borderSubtle}`,
                        backgroundColor: tokens.bgSurface,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                      }}
                    >
                      {/* Key Points */}
                      {section.highlights.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {section.highlights.map((hl, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                fontSize: fonts.size.sm,
                                color: tokens.textPrimary,
                                lineHeight: 1.5,
                              }}
                            >
                              <CheckCircle2
                                size={15}
                                color={brand.success}
                                style={{ marginTop: 3, flexShrink: 0 }}
                              />
                              <span style={{ flex: 1, minWidth: 0 }}>{hl}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Step-by-Step Instructions */}
                      {section.steps.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {section.steps.map((step, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: '12px 14px',
                                borderRadius: radius.md,
                                backgroundColor: tokens.bgSurfaceSubtle,
                                border: `1px solid ${tokens.borderSubtle}`,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: fonts.size.sm,
                                  lineHeight: 1.4,
                                  fontWeight: fonts.weight.extrabold,
                                  color: brand.primary,
                                }}
                              >
                                Step {idx + 1}: {step.heading}
                              </div>
                              <div
                                style={{
                                  fontSize: fonts.size.sm,
                                  color: tokens.textSecondary,
                                  marginTop: 4,
                                  lineHeight: 1.55,
                                }}
                              >
                                {step.detail}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Helpful Tip Box */}
                      {section.tip && (
                        <div
                          style={{
                            padding: '12px 14px',
                            borderRadius: radius.md,
                            backgroundColor: tokens.infoLight,
                            border: `1px solid ${tokens.borderSubtle}`,
                            fontSize: fonts.size.sm,
                            color: tokens.textPrimary,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            lineHeight: 1.5,
                          }}
                        >
                          <Sparkles
                            size={15}
                            color={brand.primary}
                            style={{ marginTop: 3, flexShrink: 0 }}
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong>Helpful Tip: </strong>
                            {section.tip}
                          </span>
                        </div>
                      )}

                      {/* Common Questions & Quick Fixes */}
                      {section.faqs && section.faqs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div
                            style={{
                              fontSize: fonts.size.xs,
                              fontWeight: fonts.weight.extrabold,
                              color: tokens.textSecondary,
                              letterSpacing: '0.03em',
                              textTransform: 'uppercase',
                            }}
                          >
                            Common Questions
                          </div>
                          {section.faqs.map((faq, fIdx) => {
                            const faqKey = `${section.id}-faq-${fIdx}`;
                            const open = Boolean(normalizedQuery) || Boolean(expandedFaqs[faqKey]);
                            return (
                              <div
                                key={faqKey}
                                style={{
                                  borderRadius: radius.md,
                                  border: `1px solid ${tokens.borderStrong}`,
                                  backgroundColor: tokens.bgSurfaceSubtle,
                                  overflow: 'hidden',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleFaq(faqKey)}
                                  aria-expanded={open}
                                  style={{
                                    width: '100%',
                                    height: 'auto',
                                    padding: '12px 14px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    color: tokens.textPrimary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: fonts.size.sm,
                                    lineHeight: 1.45,
                                    fontWeight: fonts.weight.bold,
                                  }}
                                >
                                  <span style={{ flex: 1, minWidth: 0 }}>{faq.question}</span>
                                  <span style={{ flexShrink: 0, color: tokens.textSecondary }}>
                                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </span>
                                </button>
                                {open && (
                                  <div
                                    style={{
                                      padding: '0 14px 14px',
                                      fontSize: fonts.size.sm,
                                      color: tokens.textSecondary,
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    {faq.answer}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer — locked with flexShrink: 0 */}
        <div
          style={{
            flexShrink: 0,
            padding: '10px 20px',
            borderTop: `1px solid ${tokens.borderSubtle}`,
            backgroundColor: tokens.bgSurface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: fonts.size.xs,
            color: tokens.textSecondary,
          }}
        >
          <span>
            {safeSchoolName} &bull; Showing {filteredSections.length} of{' '}
            {USER_MANUAL_SECTIONS.length} topics
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserManualModal;