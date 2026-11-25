// AttendSure Web - Searchable In-App User Manual Modal
// File: D:\AttendSure_V3\web\src\components\help\UserManualModal.tsx

import React, { useMemo, useState, useEffect } from 'react';
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
    'teacher-time-in-out': true,
    'student-attendance-qr': true,
  });
  const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return USER_MANUAL_SECTIONS.filter((section) => {
      if (selectedRole !== 'ALL' && !section.roles.includes(selectedRole)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        section.title,
        section.summary,
        section.tip || '',
        ...section.highlights,
        ...section.steps.flatMap((s) => [s.heading, s.detail]),
        ...(section.faqs || []).flatMap((f) => [f.question, f.answer]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, selectedRole]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFaq = (key: string) => {
    setExpandedFaqs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    filteredSections.forEach((s) => {
      next[s.id] = true;
    });
    setExpandedSections(next);
  };

  const handlePrintManual = () => {
    const sectionsHtml = filteredSections
      .map((sec) => {
        const stepsHtml = sec.steps
          .map(
            (st, idx) =>
              `<li style="margin-bottom:6px;"><strong>${idx + 1}. ${escapeHtml(st.heading)}:</strong> ${escapeHtml(st.detail)}</li>`
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
            <h2 style="margin:0 0 4px;font-size:15px;color:${SEAL_COLORS.navy};">${sec.number}. ${escapeHtml(sec.title)}</h2>
            <p style="margin:0 0 8px;color:${SEAL_COLORS.ink};">${escapeHtml(sec.summary)}</p>
            <ol style="margin:0;padding-left:18px;list-style:none;">${stepsHtml}</ol>
            ${tipHtml}
            ${faqsHtml}
          </section>
        `;
      })
      .join('');

    const fullHtml = `
      <div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:${SEAL_COLORS.ink};">
        <div style="border-bottom:2px solid ${SEAL_COLORS.navy};padding-bottom:10px;margin-bottom:16px;">
          <h1 style="margin:0;font-size:20px;color:${SEAL_COLORS.navy};">AttendSure User Manual</h1>
          <div style="color:${SEAL_COLORS.ink};margin-top:4px;">${escapeHtml(schoolName)} &bull; Guide for ${escapeHtml(
            selectedRole === 'ALL' ? 'All School Roles' : getProfileDisplayName(selectedRole)
          )}</div>
        </div>
        ${sectionsHtml}
      </div>
    `;

    printHtmlWithPageSetup({
      title: 'AttendSure User Manual',
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
        backgroundColor: 'rgba(15, 23, 42, 0.56)',
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
          height: 'min(90vh, 840px)',
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
        {/* Top Banner */}
        <div
          style={{
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
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
            <div>
              <h2
                id="attendsure-manual-heading"
                style={{
                  margin: 0,
                  fontSize: fonts.size.lg,
                  fontWeight: fonts.weight.extrabold,
                  color: tokens.textPrimary,
                  fontFamily: fonts.display,
                }}
              >
                AttendSure User Manual &amp; Quick Guide
              </h2>
              <div style={{ fontSize: fonts.size.xs, color: tokens.textSecondary, marginTop: 2 }}>
                Clear, step-by-step instructions in everyday English &bull; Signed in as{' '}
                <strong>{getProfileDisplayName(userProfile)}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onStartTour();
              }}
              icon={<Play size={13} />}
            >
              Start Animated Walkthrough
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrintManual}
              icon={<Printer size={13} />}
            >
              Print Manual
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close User Manual"
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.md,
                border: `1px solid ${tokens.borderStrong}`,
                backgroundColor: tokens.bgSurface,
                color: tokens.textSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search & Role Filters */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            backgroundColor: tokens.bgSurface,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search
                size={15}
                color={tokens.textMuted}
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                aria-label="Search user manual"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics (e.g. QR scan, GPS, offline, Form 48, reset phone lock)..."
                style={{
                  ...ui.input,
                  paddingLeft: 34,
                  backgroundColor: tokens.bgSurfaceSubtle,
                }}
              />
            </div>

            <Button variant="secondary" size="sm" onClick={handleExpandAll}>
              Expand All ({filteredSections.length})
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {MANUAL_ROLE_OPTIONS.map((opt) => {
              const active = selectedRole === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSelectedRole(opt.key)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: radius.pill,
                    border: `1px solid ${active ? brand.primary : tokens.borderStrong}`,
                    backgroundColor: active ? tokens.primaryLight : tokens.bgSurfaceSubtle,
                    color: active ? brand.primary : tokens.textSecondary,
                    fontSize: fonts.size.xs,
                    fontWeight: fonts.weight.bold,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Sections */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            backgroundColor: tokens.bgSurfaceSubtle,
          }}
        >
          {filteredSections.length === 0 ? (
            <div
              style={{
                ...ui.card,
                textAlign: 'center',
                padding: 36,
                color: tokens.textMuted,
              }}
            >
              <HelpCircle size={28} style={{ margin: '0 auto 8px', display: 'block' }} />
              <div style={{ fontSize: fonts.size.base, fontWeight: fonts.weight.bold, color: tokens.textPrimary }}>
                No matching guide sections found
              </div>
              <div style={{ fontSize: fonts.size.sm, marginTop: 4 }}>
                Try another keyword or switch the role filter back to &ldquo;All Roles&rdquo;.
              </div>
            </div>
          ) : (
            filteredSections.map((section) => {
              const isExpanded = Boolean(searchQuery.trim()) || Boolean(expandedSections[section.id]);
              return (
                <div
                  key={section.id}
                  style={{
                    ...ui.card,
                    padding: 0,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isExpanded}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      border: 'none',
                      backgroundColor: tokens.bgSurface,
                      color: tokens.textPrimary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
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
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: fonts.size.md,
                            fontWeight: fonts.weight.extrabold,
                            color: tokens.textPrimary,
                          }}
                        >
                          {section.title}
                        </div>
                        <div
                          style={{
                            fontSize: fonts.size.sm,
                            color: tokens.textSecondary,
                            marginTop: 2,
                            lineHeight: 1.45,
                          }}
                        >
                          {section.summary}
                        </div>
                      </div>
                    </div>
                    <span style={{ color: tokens.textMuted, flexShrink: 0 }}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        padding: '0 16px 16px 56px',
                        borderTop: `1px solid ${tokens.borderSubtle}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                      }}
                    >
                      {/* Key Highlights */}
                      <div
                        style={{
                          marginTop: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        {section.highlights.map((hl, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              fontSize: fonts.size.sm,
                              color: tokens.textPrimary,
                              lineHeight: 1.45,
                            }}
                          >
                            <CheckCircle2
                              size={14}
                              color={brand.success}
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                            <span>{hl}</span>
                          </div>
                        ))}
                      </div>

                      {/* Step-by-Step Instructions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {section.steps.map((step, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: '10px 12px',
                              borderRadius: radius.md,
                              backgroundColor: tokens.bgSurfaceSubtle,
                              border: `1px solid ${tokens.borderSubtle}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: fonts.size.sm,
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
                                marginTop: 3,
                                lineHeight: 1.5,
                              }}
                            >
                              {step.detail}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Tip Box */}
                      {section.tip && (
                        <div
                          style={{
                            padding: '10px 12px',
                            borderRadius: radius.md,
                            backgroundColor: tokens.infoLight,
                            border: `1px solid ${tokens.borderSubtle}`,
                            fontSize: fonts.size.sm,
                            color: tokens.textPrimary,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            lineHeight: 1.45,
                          }}
                        >
                          <Sparkles size={14} color={brand.primary} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>
                            <strong>Helpful Tip: </strong>
                            {section.tip}
                          </span>
                        </div>
                      )}

                      {/* Expandable FAQ / Troubleshooting Cards */}
                      {section.faqs && section.faqs.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                          {section.faqs.map((faq, fIdx) => {
                            const faqKey = `${section.id}-faq-${fIdx}`;
                            const open = Boolean(searchQuery.trim()) || Boolean(expandedFaqs[faqKey]);
                            return (
                              <div
                                key={faqKey}
                                style={{
                                  borderRadius: radius.md,
                                  border: `1px solid ${tokens.borderStrong}`,
                                  backgroundColor: tokens.bgSurface,
                                  overflow: 'hidden',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleFaq(faqKey)}
                                  aria-expanded={open}
                                  style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    color: tokens.textPrimary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: fonts.size.sm,
                                    fontWeight: fonts.weight.bold,
                                  }}
                                >
                                  <span>{faq.question}</span>
                                  {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
                                {open && (
                                  <div
                                    style={{
                                      padding: '0 12px 12px',
                                      fontSize: fonts.size.sm,
                                      color: tokens.textSecondary,
                                      lineHeight: 1.55,
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
      </div>
    </div>
  );
};

export default UserManualModal;
