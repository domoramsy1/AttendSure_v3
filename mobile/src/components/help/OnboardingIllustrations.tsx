// AttendSure Mobile - Animated Vector Onboarding Illustrations (React Native Animated + SVG)
// File: D:\AttendSure_V3\mobile\src\components\help\OnboardingIllustrations.tsx

import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, Path, G } from 'react-native-svg';
import { useThemeMode } from '../../context/ThemeContext';
import type { OnboardingIllustrationKey } from './onboardingSteps';

interface OnboardingIllustrationProps {
  kind: OnboardingIllustrationKey;
  reduceMotion?: boolean;
}

export const OnboardingIllustration: React.FC<OnboardingIllustrationProps> = ({
  kind,
  reduceMotion = false,
}) => {
  const { palette } = useThemeMode();
  const beamAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      beamAnim.setValue(0.5);
      pulseAnim.setValue(0);
      floatAnim.setValue(0);
      return;
    }

    const beamLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(beamAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(beamAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    beamLoop.start();
    pulseLoop.start();
    floatLoop.start();

    return () => {
      beamLoop.stop();
      pulseLoop.stop();
      floatLoop.stop();
    };
  }, [reduceMotion, beamAnim, pulseAnim, floatAnim]);

  const beamTranslateY = beamAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-26, 26],
  });

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1.32],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0],
  });

  const floatTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  return (
    <View
      style={[
        styles.stage,
        {
          backgroundColor: palette.surfaceSubtle,
          borderColor: palette.border,
        },
      ]}
    >
      {/* Pulsing ring backdrop for GPS / Exit Pass steps */}
      {(kind === 'campus-gps' || kind === 'exit-pass') && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseCircle,
            {
              borderColor: kind === 'campus-gps' ? palette.success : palette.primary,
              backgroundColor: kind === 'campus-gps' ? palette.successLight : palette.primarySoft,
              opacity: reduceMotion ? 0.25 : pulseOpacity,
              transform: [{ scale: reduceMotion ? 1 : pulseScale }],
            },
          ]}
        />
      )}

      <Animated.View style={{ transform: [{ translateY: kind === 'qr-scan' ? 0 : floatTranslateY }] }}>
        <Svg width={210} height={132} viewBox="0 0 210 132">
          {kind === 'qr-scan' && (
            <G>
              <Rect
                x={55}
                y={16}
                width={100}
                height={100}
                rx={12}
                fill={palette.surface}
                stroke={palette.primary}
                strokeWidth={2.2}
              />
              <Rect x={70} y={30} width={22} height={22} rx={3} stroke={palette.primary} strokeWidth={3} fill="none" />
              <Rect x={76} y={36} width={10} height={10} rx={1.5} fill={palette.primary} />
              <Rect x={118} y={30} width={22} height={22} rx={3} stroke={palette.primary} strokeWidth={3} fill="none" />
              <Rect x={124} y={36} width={10} height={10} rx={1.5} fill={palette.primary} />
              <Rect x={70} y={78} width={22} height={22} rx={3} stroke={palette.primary} strokeWidth={3} fill="none" />
              <Rect x={76} y={84} width={10} height={10} rx={1.5} fill={palette.primary} />
              <Rect x={100} y={56} width={12} height={16} rx={2} fill={palette.secondary} />
              <Rect x={118} y={66} width={22} height={10} rx={2} fill={palette.textMuted} />
              <Rect x={118} y={84} width={14} height={14} rx={2} fill={palette.primary} />
              <Circle cx={158} cy={24} r={13} fill={palette.success} />
              <Path
                d="M152 24.5 L156 28.5 L164 20.5"
                stroke={palette.onPrimary}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </G>
          )}

          {kind === 'campus-gps' && (
            <G>
              <Circle
                cx={105}
                cy={66}
                r={36}
                fill={palette.primarySoft}
                stroke={palette.primary}
                strokeWidth={2}
                strokeDasharray="6,4"
              />
              <Path
                d="M105 32 C92 32 82 42 82 54.5 C82 70 105 93 105 93 C105 93 128 70 128 54.5 C128 42 118 32 105 32 Z"
                fill={palette.primary}
              />
              <Circle cx={105} cy={54} r={8.5} fill={palette.onPrimary} />
              <Circle cx={105} cy={54} r={4.2} fill={palette.success} />
              <Rect x={20} y={96} width={48} height={16} rx={8} fill={palette.surface} stroke={palette.success} strokeWidth={1.5} />
              <Circle cx={30} cy={104} r={3.5} fill={palette.success} />
              <Rect x={142} y={96} width={48} height={16} rx={8} fill={palette.surface} stroke={palette.secondary} strokeWidth={1.5} />
              <Circle cx={152} cy={104} r={3.5} fill={palette.secondary} />
            </G>
          )}

          {kind === 'offline-sync' && (
            <G>
              <Rect x={22} y={24} width={52} height={82} rx={10} fill={palette.surface} stroke={palette.primary} strokeWidth={2} />
              <Rect x={31} y={38} width={34} height={9} rx={4} fill={palette.primarySoft} />
              <Rect x={31} y={53} width={34} height={9} rx={4} fill={palette.successLight} />
              <Rect x={31} y={68} width={24} height={9} rx={4} fill={palette.warningLight} />
              <Path
                d="M84 58 H118 M110 50 L118 58 L110 66"
                stroke={palette.success}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d="M118 76 H84 M92 68 L84 76 L92 84"
                stroke={palette.secondary}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d="M140 88 H178 C185 88 190 82 190 75 C190 69 185 63 179 62 C177 52 169 45 159 45 C147 45 138 54 138 66 C132 67 128 72 128 78 C128 84 133 88 140 88 Z"
                fill={palette.surface}
                stroke={palette.primary}
                strokeWidth={2.2}
              />
              <Path
                d="M150 69 L156 75 L168 63"
                stroke={palette.success}
                strokeWidth={2.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </G>
          )}

          {kind === 'phone-lock' && (
            <G>
              <Rect x={65} y={14} width={80} height={104} rx={14} fill={palette.surface} stroke={palette.primary} strokeWidth={2.2} />
              <Rect x={92} y={22} width={26} height={4} rx={2} fill={palette.borderStrong} />
              <Path
                d="M105 36 L128 45 V63 C128 78 118 90 105 95 C92 90 82 78 82 63 V45 L105 36 Z"
                fill={palette.primarySoft}
                stroke={palette.primary}
                strokeWidth={2.2}
              />
              <Rect x={96} y={61} width={18} height={14} rx={3.5} fill={palette.primary} />
              <Path
                d="M100 61 V57 C100 54 102 52 105 52 C108 52 110 54 110 57 V61"
                stroke={palette.primary}
                strokeWidth={2.4}
                strokeLinecap="round"
                fill="none"
              />
              <Circle cx={142} cy={32} r={12} fill={palette.success} />
              <Path
                d="M137 32.5 L140.5 36 L147.5 29"
                stroke={palette.onPrimary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </G>
          )}

          {kind === 'exit-pass' && (
            <G>
              <Rect x={34} y={32} width={142} height={74} rx={14} fill={palette.surface} stroke={palette.secondary} strokeWidth={2} />
              <Rect x={50} y={76} width={110} height={9} rx={4.5} fill={palette.primarySoft} />
              <Rect x={66} y={90} width={78} height={6} rx={3} fill={palette.border} />
              <Circle cx={105} cy={46} r={20} fill={palette.primary} />
              <Path
                d="M105 36 C100 36 96.5 39.5 96.5 44.5 V50 L93.5 53 V55 H116.5 V53 L113.5 50 V44.5 C113.5 39.5 110 36 105 36 Z"
                fill={palette.onPrimary}
              />
              <Circle cx={105} cy={58} r={2.5} fill={palette.warning} />
              <Circle cx={127} cy={31} r={7.5} fill={palette.success} />
            </G>
          )}

          {kind === 'reports-pack' && (
            <G>
              <Rect x={48} y={18} width={84} height={94} rx={10} fill={palette.surface} stroke={palette.borderStrong} strokeWidth={1.8} />
              <Rect x={72} y={24} width={88} height={90} rx={10} fill={palette.surface} stroke={palette.primary} strokeWidth={2.2} />
              <Rect x={85} y={38} width={40} height={7} rx={3.5} fill={palette.primary} />
              <Rect x={85} y={52} width={62} height={6} rx={3} fill={palette.borderStrong} />
              <Rect x={85} y={64} width={48} height={6} rx={3} fill={palette.borderStrong} />
              <Rect x={85} y={80} width={20} height={20} rx={5} fill={palette.successLight} stroke={palette.success} strokeWidth={1.5} />
              <Path
                d="M90 90 L94 94 L101 86"
                stroke={palette.success}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Rect x={112} y={84} width={34} height={6} rx={3} fill={palette.primarySoft} />
              <Rect x={112} y={94} width={24} height={5} rx={2.5} fill={palette.border} />
            </G>
          )}

          {(kind === 'school-setup' || kind === 'welcome') && (
            <G>
              <Path
                d="M105 22 L156 48 V108 H54 V48 L105 22 Z"
                fill={palette.surface}
                stroke={palette.primary}
                strokeWidth={2.2}
                strokeLinejoin="round"
              />
              <Path
                d="M44 52 L105 20 L166 52"
                stroke={palette.primary}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Circle cx={105} cy={52} r={10} fill={palette.primarySoft} stroke={palette.primary} strokeWidth={1.8} />
              <Path d="M105 47 V52 L109 54" stroke={palette.primary} strokeWidth={1.8} strokeLinecap="round" fill="none" />
              <Rect x={94} y={78} width={22} height={30} rx={4} fill={palette.primary} />
              <Rect x={66} y={70} width={16} height={16} rx={3} fill={palette.infoLight} stroke={palette.secondary} strokeWidth={1.4} />
              <Rect x={128} y={70} width={16} height={16} rx={3} fill={palette.infoLight} stroke={palette.secondary} strokeWidth={1.4} />
              <Circle cx={162} cy={34} r={12} fill={palette.success} />
              <Path
                d="M157 34.5 L160.5 38 L167.5 31"
                stroke={palette.onPrimary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </G>
          )}
        </Svg>
      </Animated.View>

      {/* Moving laser beam overlay for QR Scan */}
      {kind === 'qr-scan' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanBeam,
            {
              backgroundColor: palette.success,
              transform: [{ translateY: beamTranslateY }],
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    height: 152,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  pulseCircle: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
  },
  scanBeam: {
    position: 'absolute',
    width: 118,
    height: 3.5,
    borderRadius: 2,
    opacity: 0.9,
  },
});

export default OnboardingIllustration;
