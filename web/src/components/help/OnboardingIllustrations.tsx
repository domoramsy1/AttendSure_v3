// AttendSure Web - Lightweight Animated SVG Onboarding Illustrations
// File: D:\AttendSure_V3\web\src\components\help\OnboardingIllustrations.tsx

import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import type { OnboardingIllustrationKey } from './onboardingSteps';

interface OnboardingIllustrationProps {
  kind: OnboardingIllustrationKey;
  width?: number;
  height?: number;
}

const ANIMATION_CSS = `
@keyframes attendsureScanBeam {
  0%, 100% { transform: translateY(0px); opacity: 0.92; }
  50% { transform: translateY(58px); opacity: 1; }
}
@keyframes attendsureGpsPulse {
  0% { transform: scale(0.72); opacity: 0.72; }
  70% { transform: scale(1.22); opacity: 0.14; }
  100% { transform: scale(1.3); opacity: 0; }
}
@keyframes attendsureFloat {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}
@keyframes attendsureSyncArrow {
  0% { transform: translateY(5px); opacity: 0.25; }
  50% { transform: translateY(-3px); opacity: 1; }
  100% { transform: translateY(5px); opacity: 0.25; }
}
@keyframes attendsureBellSwing {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(10deg); }
  40% { transform: rotate(-10deg); }
  60% { transform: rotate(6deg); }
  80% { transform: rotate(-5deg); }
}
.as-anim-beam { animation: attendsureScanBeam 2.4s ease-in-out infinite; }
.as-anim-pulse { transform-origin: 120px 76px; animation: attendsureGpsPulse 2.2s ease-out infinite; }
.as-anim-float { animation: attendsureFloat 3s ease-in-out infinite; }
.as-anim-sync { animation: attendsureSyncArrow 1.8s ease-in-out infinite; }
.as-anim-bell { transform-origin: 120px 52px; animation: attendsureBellSwing 2.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .as-anim-beam,
  .as-anim-pulse,
  .as-anim-float,
  .as-anim-sync,
  .as-anim-bell {
    animation: none !important;
  }
}
`;

export const OnboardingIllustration: React.FC<OnboardingIllustrationProps> = ({
  kind,
  width = 240,
  height = 148,
}) => {
  const { tokens, brand } = useTheme();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '6px 0',
      }}
    >
      <style>{ANIMATION_CSS}</style>
      <svg
        width={width}
        height={height}
        viewBox="0 0 240 148"
        fill="none"
        role="img"
        aria-hidden="true"
      >
        {/* Soft background pill */}
        <rect
          x="10"
          y="8"
          width="220"
          height="132"
          rx="20"
          fill={tokens.bgSurfaceSubtle}
          stroke={tokens.borderSubtle}
          strokeWidth="1.5"
        />

        {kind === 'qr-scan' && (
          <g>
            {/* Student QR ID Card */}
            <rect
              x="66"
              y="26"
              width="108"
              height="96"
              rx="12"
              fill={tokens.bgSurface}
              stroke={brand.primary}
              strokeWidth="2"
            />
            <rect x="82" y="40" width="24" height="24" rx="3" stroke={brand.primary} strokeWidth="3" />
            <rect x="88" y="46" width="12" height="12" rx="1.5" fill={brand.primary} />
            <rect x="134" y="40" width="24" height="24" rx="3" stroke={brand.primary} strokeWidth="3" />
            <rect x="140" y="46" width="12" height="12" rx="1.5" fill={brand.primary} />
            <rect x="82" y="84" width="24" height="24" rx="3" stroke={brand.primary} strokeWidth="3" />
            <rect x="88" y="90" width="12" height="12" rx="1.5" fill={brand.primary} />
            <rect x="115" y="44" width="10" height="10" rx="2" fill={tokens.textMuted} />
            <rect x="115" y="62" width="10" height="18" rx="2" fill={brand.secondary} />
            <rect x="134" y="76" width="24" height="10" rx="2" fill={tokens.textMuted} />
            <rect x="134" y="94" width="14" height="14" rx="2" fill={brand.primary} />
            {/* Animated scanning laser line */}
            <g className="as-anim-beam">
              <rect x="54" y="40" width="132" height="4" rx="2" fill={brand.success} />
              <rect x="64" y="44" width="112" height="12" rx="2" fill={tokens.successLight} opacity="0.6" />
            </g>
            {/* Verified check badge */}
            <circle cx="176" cy="34" r="14" fill={brand.success} />
            <path
              d="M170 34.5L174.2 38.5L182.5 30"
              stroke={tokens.onPrimary}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {kind === 'campus-gps' && (
          <g>
            {/* Pulsing outer campus geofence ring */}
            <circle
              className="as-anim-pulse"
              cx="120"
              cy="76"
              r="42"
              fill={tokens.successLight}
              stroke={brand.success}
              strokeWidth="2"
            />
            <circle
              cx="120"
              cy="76"
              r="34"
              fill={tokens.primaryLight}
              stroke={brand.primary}
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            {/* Pin */}
            <g className="as-anim-float">
              <path
                d="M120 40C106.7 40 96 50.5 96 63.5C96 80 120 104 120 104C120 104 144 80 144 63.5C144 50.5 133.3 40 120 40Z"
                fill={brand.primary}
              />
              <circle cx="120" cy="63" r="9" fill={tokens.onPrimary} />
              <circle cx="120" cy="63" r="4.5" fill={brand.success} />
            </g>
            {/* Health indicator pills */}
            <rect x="30" y="106" width="54" height="18" rx="9" fill={tokens.bgSurface} stroke={brand.success} strokeWidth="1.5" />
            <circle cx="42" cy="115" r="4" fill={brand.success} />
            <rect x="50" y="112" width="24" height="6" rx="3" fill={tokens.textMuted} opacity="0.6" />
            <rect x="156" y="106" width="54" height="18" rx="9" fill={tokens.bgSurface} stroke={brand.secondary} strokeWidth="1.5" />
            <circle cx="168" cy="115" r="4" fill={brand.secondary} />
            <rect x="176" y="112" width="24" height="6" rx="3" fill={tokens.textMuted} opacity="0.6" />
          </g>
        )}

        {kind === 'offline-sync' && (
          <g>
            {/* Phone card on left */}
            <rect x="36" y="34" width="56" height="84" rx="10" fill={tokens.bgSurface} stroke={brand.primary} strokeWidth="2" />
            <rect x="46" y="48" width="36" height="10" rx="4" fill={tokens.primaryLight} />
            <rect x="46" y="64" width="36" height="10" rx="4" fill={tokens.successLight} />
            <rect x="46" y="80" width="26" height="10" rx="4" fill={tokens.warningLight} />
            <circle cx="64" cy="106" r="3" fill={tokens.textMuted} />
            {/* Animated sync arrows */}
            <g className="as-anim-sync">
              <path
                d="M104 68H134M126 60L134 68L126 76"
                stroke={brand.success}
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M134 86H104M112 78L104 86L112 94"
                stroke={brand.secondary}
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            {/* Cloud server on right */}
            <g className="as-anim-float">
              <path
                d="M156 96H196C203.7 96 210 89.7 210 82C210 75 204.8 69.2 198 68.2C195.8 57.8 186.6 50 175.5 50C163.1 50 153 60.1 153 72.5C146.9 73.7 142.5 79.1 142.5 85.5C142.5 91.4 147.2 96 156 96Z"
                fill={tokens.bgSurface}
                stroke={brand.primary}
                strokeWidth="2.2"
              />
              <path
                d="M168 76L174 82L186 70"
                stroke={brand.success}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        )}

        {kind === 'phone-lock' && (
          <g>
            {/* Phone outline */}
            <rect x="78" y="22" width="84" height="104" rx="14" fill={tokens.bgSurface} stroke={brand.primary} strokeWidth="2.2" />
            <rect x="106" y="30" width="28" height="4" rx="2" fill={tokens.borderStrong} />
            {/* On-device shield & lock */}
            <g className="as-anim-float">
              <path
                d="M120 44L144 53V72C144 87.5 133.5 100.5 120 105C106.5 100.5 96 87.5 96 72V53L120 44Z"
                fill={tokens.primaryLight}
                stroke={brand.primary}
                strokeWidth="2.2"
              />
              <rect x="111" y="70" width="18" height="15" rx="3.5" fill={brand.primary} />
              <path
                d="M115 70V65.5C115 62.5 117.2 60 120 60C122.8 60 125 62.5 125 65.5V70"
                stroke={brand.primary}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </g>
            {/* Green privacy dot */}
            <circle cx="158" cy="40" r="12" fill={brand.success} />
            <path
              d="M153 40.3L156.5 43.8L163.5 36.8"
              stroke={tokens.onPrimary}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {kind === 'exit-pass' && (
          <g>
            {/* Official Exit Pass & Guide card */}
            <rect x="42" y="36" width="156" height="80" rx="14" fill={tokens.bgSurface} stroke={brand.secondary} strokeWidth="2" />
            <rect x="58" y="84" width="124" height="10" rx="5" fill={tokens.primaryLight} />
            <rect x="74" y="100" width="92" height="7" rx="3.5" fill={tokens.borderSubtle} />
            {/* Swinging bell badge */}
            <g className="as-anim-bell">
              <circle cx="120" cy="52" r="22" fill={brand.primary} />
              <path
                d="M120 41C114.8 41 111 44.8 111 50V56L108 59V61H132V59L129 56V50C129 44.8 125.2 41 120 41Z"
                fill={tokens.onPrimary}
              />
              <circle cx="120" cy="64" r="2.8" fill={brand.warning} />
            </g>
            <circle cx="144" cy="36" r="8" fill={brand.success} />
          </g>
        )}

        {kind === 'reports-pack' && (
          <g>
            {/* Back report sheet */}
            <rect x="58" y="24" width="92" height="102" rx="10" fill={tokens.bgSurface} stroke={tokens.borderStrong} strokeWidth="1.8" />
            {/* Front report sheet */}
            <g className="as-anim-float">
              <rect x="82" y="30" width="96" height="96" rx="10" fill={tokens.bgSurface} stroke={brand.primary} strokeWidth="2.2" />
              <rect x="96" y="44" width="44" height="8" rx="4" fill={brand.primary} />
              <rect x="96" y="60" width="68" height="6" rx="3" fill={tokens.borderStrong} />
              <rect x="96" y="72" width="54" height="6" rx="3" fill={tokens.borderStrong} />
              <rect x="96" y="88" width="22" height="22" rx="5" fill={tokens.successLight} stroke={brand.success} strokeWidth="1.5" />
              <path d="M102 99L106 103L113 95" stroke={brand.success} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="126" y="92" width="38" height="6" rx="3" fill={tokens.primaryLight} />
              <rect x="126" y="102" width="28" height="6" rx="3" fill={tokens.borderSubtle} />
            </g>
          </g>
        )}

        {(kind === 'school-setup' || kind === 'welcome') && (
          <g>
            {/* School campus building */}
            <g className="as-anim-float">
              <path
                d="M120 26L176 54V116H64V54L120 26Z"
                fill={tokens.bgSurface}
                stroke={brand.primary}
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M54 58L120 24L186 58"
                stroke={brand.primary}
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Clock / emblem */}
              <circle cx="120" cy="56" r="11" fill={tokens.primaryLight} stroke={brand.primary} strokeWidth="2" />
              <path d="M120 51V56L124 58" stroke={brand.primary} strokeWidth="2" strokeLinecap="round" />
              {/* Door */}
              <rect x="108" y="84" width="24" height="32" rx="4" fill={brand.primary} />
              {/* Windows */}
              <rect x="78" y="76" width="18" height="18" rx="3" fill={tokens.infoLight} stroke={brand.secondary} strokeWidth="1.5" />
              <rect x="144" y="76" width="18" height="18" rx="3" fill={tokens.infoLight} stroke={brand.secondary} strokeWidth="1.5" />
            </g>
            {/* Verified check badge */}
            <circle cx="182" cy="40" r="13" fill={brand.success} />
            <path
              d="M176.5 40.5L180.2 44.2L187.8 36.6"
              stroke={tokens.onPrimary}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
