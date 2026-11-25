// AttendSure Web - Interactive Animated Onboarding Walkthrough
// File: D:\AttendSure_V3\web\src\components\help\OnboardingTour.tsx

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  X,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import apiClient from '../../api/client';
import { API_ROUTES } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/Button';
import { OnboardingIllustration } from './OnboardingIllustrations';
import { getOnboardingStepsForProfile } from './onboardingSteps';
import { getProfileDisplayName, type UserProfileKey } from './manualContent';

interface OnboardingTourProps {
  isOpen: boolean;
  userProfile: UserProfileKey;
  onboardingVersion?: number;
  onClose: () => void;
  onCompleted?: () => void;
  onOpenManual?: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOUR_KEYFRAMES = `
@keyframes attendsureTourCardIn {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes attendsureSpotlightRing {
  0%, 100% { box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.35); }
  50% { box-shadow: 0 0 0 9px rgba(56, 189, 248, 0.14); }
}
.as-tour-card-in { animation: attendsureTourCardIn 220ms ease-out; }
.as-spotlight-ring { animation: attendsureSpotlightRing 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .as-tour-card-in,
  .as-spotlight-ring {
    animation: none !important;
    transition: none !important;
  }
}
`;

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  isOpen,
  userProfile,
  onboardingVersion = 1,
  onClose,
  onCompleted,
  onOpenManual,
}) => {
  const { tokens, brand, fonts, radius } = useTheme();
  const steps = useMemo(() => getOnboardingStepsForProfile(userProfile), [userProfile]);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen, userProfile]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;

  const measureTarget = useCallback(() => {
    if (!isOpen || !currentStep?.targetSelector) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
    if (!el) {
      setSpotlightRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      setSpotlightRect(null);
      return;
    }
    setSpotlightRect({
      top: Math.max(4, rect.top - 5),
      left: Math.max(4, rect.left - 5),
      width: rect.width + 10,
      height: rect.height + 10,
    });
  }, [isOpen, currentStep]);

  useEffect(() => {
    measureTarget();
    if (!isOpen) return;
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [isOpen, measureTarget]);

  const markOnboardingFinished = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await apiClient.post(API_ROUTES.accounts.onboardingComplete, {
        version: onboardingVersion,
      });
    } catch {
      // Allow closing cleanly even on transient network blip
    } finally {
      setSaving(false);
      onCompleted?.();
      onClose();
    }
  }, [saving, onboardingVersion, onCompleted, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void markOnboardingFinished();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!isLast) setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!isFirst) setStepIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isFirst, isLast, steps.length, markOnboardingFinished]);

  if (!isOpen || !currentStep) return null;

  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100);

  // Position tooltip card near highlighted element when space permits, else center cleanly
  let cardPositionStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  };

  if (spotlightRect && typeof window !== 'undefined' && window.innerWidth >= 820) {
    const cardW = 430;
    const cardH = 440;
    const spaceRight = window.innerWidth - (spotlightRect.left + spotlightRect.width);
    const spaceLeft = spotlightRect.left;
    const spaceBelow = window.innerHeight - (spotlightRect.top + spotlightRect.height);

    if (spaceRight >= cardW + 28) {
      const top = Math.min(
        Math.max(20, spotlightRect.top - 16),
        Math.max(20, window.innerHeight - cardH - 20)
      );
      cardPositionStyle = {
        position: 'fixed',
        top,
        left: spotlightRect.left + spotlightRect.width + 18,
      };
    } else if (spaceBelow >= cardH + 24) {
      const left = Math.min(
        Math.max(20, spotlightRect.left + spotlightRect.width / 2 - cardW / 2),
        Math.max(20, window.innerWidth - cardW - 20)
      );
      cardPositionStyle = {
        position: 'fixed',
        top: spotlightRect.top + spotlightRect.height + 16,
        left,
      };
    } else if (spaceLeft >= cardW + 28) {
      const top = Math.min(
        Math.max(20, spotlightRect.top - 16),
        Math.max(20, window.innerHeight - cardH - 20)
      );
      cardPositionStyle = {
        position: 'fixed',
        top,
        left: Math.max(20, spotlightRect.left - cardW - 18),
      };
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendsure-tour-title"
      className="no-print"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        backgroundColor: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(2px)',
        fontFamily: fonts.sans,
      }}
    >
      <style>{TOUR_KEYFRAMES}</style>

      {/* Animated spotlight highlight ring around target navigation item */}
      {spotlightRect && (
        <div
          className="as-spotlight-ring"
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            borderRadius: radius.lg,
            border: `2.5px solid ${brand.secondary}`,
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            pointerEvents: 'none',
            transition: 'top 240ms ease, left 240ms ease, width 240ms ease, height 240ms ease',
            zIndex: 1201,
          }}
        />
      )}

      {/* Walkthrough Card */}
      <div
        key={currentStep.id}
        className="as-tour-card-in"
        style={{
          ...cardPositionStyle,
          width: 'min(92vw, 430px)',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: tokens.bgSurface,
          color: tokens.textPrimary,
          borderRadius: radius.xl,
          border: `1.5px solid ${tokens.borderStrong}`,
          boxShadow: tokens.cardShadow,
          zIndex: 1202,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Progress Strip */}
        <div
          style={{
            height: 4,
            width: '100%',
            backgroundColor: tokens.bgSurfaceSubtle,
            overflow: 'hidden',
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              backgroundColor: brand.primary,
              transition: 'width 240ms ease',
            }}
          />
        </div>

        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '14px 16px 6px',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: radius.pill,
              backgroundColor: tokens.primaryLight,
              color: brand.primary,
              fontSize: fonts.size.xs,
              fontWeight: fonts.weight.extrabold,
            }}
          >
            <Sparkles size={12} />
            {currentStep.badgeText}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: fonts.size.xs,
                fontWeight: fonts.weight.bold,
                color: tokens.textMuted,
              }}
            >
              {stepIndex + 1} / {steps.length}
            </span>
            <button
              type="button"
              onClick={() => void markOnboardingFinished()}
              aria-label="Skip guided tour"
              title="Skip guided tour"
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.sm,
                border: `1px solid ${tokens.borderSubtle}`,
                backgroundColor: tokens.bgSurfaceSubtle,
                color: tokens.textSecondary,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Animated SVG visual */}
        <div style={{ padding: '4px 16px 0' }}>
          <OnboardingIllustration kind={currentStep.illustration} />
        </div>

        {/* Content */}
        <div style={{ padding: '10px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2
            id="attendsure-tour-title"
            style={{
              margin: 0,
              fontSize: fonts.size.lg,
              fontWeight: fonts.weight.extrabold,
              color: tokens.textPrimary,
              fontFamily: fonts.display,
              lineHeight: 1.25,
            }}
          >
            {currentStep.title}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: fonts.size.base,
              color: tokens.textSecondary,
              lineHeight: 1.55,
            }}
          >
            {currentStep.description}
          </p>

          {currentStep.tip && (
            <div
              style={{
                padding: '9px 12px',
                borderRadius: radius.md,
                backgroundColor: tokens.infoLight,
                border: `1px solid ${tokens.borderSubtle}`,
                color: tokens.textPrimary,
                fontSize: fonts.size.sm,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: brand.primary }}>Quick Tip: </strong>
              {currentStep.tip}
            </div>
          )}

          {/* Step Dots */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginTop: 4,
            }}
          >
            {steps.map((step, idx) => {
              const active = idx === stepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  aria-label={`Go to step ${idx + 1}: ${step.title}`}
                  style={{
                    width: active ? 22 : 8,
                    height: 8,
                    borderRadius: radius.pill,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    backgroundColor: active ? brand.primary : tokens.borderStrong,
                    transition: 'width 200ms ease, background-color 200ms ease',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Footer controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            padding: '12px 16px 14px',
            borderTop: `1px solid ${tokens.borderSubtle}`,
            backgroundColor: tokens.bgSurfaceSubtle,
            borderBottomLeftRadius: radius.xl,
            borderBottomRightRadius: radius.xl,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => void markOnboardingFinished()}
              style={{
                border: 'none',
                background: 'none',
                color: tokens.textMuted,
                fontSize: fonts.size.sm,
                fontWeight: fonts.weight.bold,
                cursor: 'pointer',
                padding: '4px 6px',
              }}
            >
              Skip Tour
            </button>
            {onOpenManual && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenManual();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  border: 'none',
                  background: 'none',
                  color: brand.primary,
                  fontSize: fonts.size.sm,
                  fontWeight: fonts.weight.bold,
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                <BookOpen size={13} />
                Manual
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isFirst && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                icon={<ChevronLeft size={14} />}
              >
                Back
              </Button>
            )}
            {isLast ? (
              <Button
                variant="primary"
                size="sm"
                loading={saving}
                onClick={() => void markOnboardingFinished()}
                icon={<CheckCircle2 size={14} />}
              >
                Get Started
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </Button>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '6px 16px 8px',
            textAlign: 'center',
            fontSize: fonts.size.xs,
            color: tokens.textMuted,
          }}
        >
          Tailored for {getProfileDisplayName(userProfile)} &bull; Use Left/Right arrow keys or Esc
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
