// AttendSure Mobile - Interactive Animated Onboarding Guide Modal
// File: D:\AttendSure_V3\mobile\src\components\help\OnboardingGuideModal.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  AccessibilityInfo,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import { OnboardingIllustration } from './OnboardingIllustrations';
import { getMobileOnboardingSteps } from './onboardingSteps';
import { getProfileDisplayName, type UserProfileKey } from './manualContent';

interface OnboardingGuideModalProps {
  visible: boolean;
  userProfile: UserProfileKey;
  onboardingVersion?: number;
  onClose: () => void;
  onOpenManual?: () => void;
}

export const OnboardingGuideModal: React.FC<OnboardingGuideModalProps> = ({
  visible,
  userProfile,
  onboardingVersion = 1,
  onClose,
  onOpenManual,
}) => {
  const insets = useSafeAreaInsets();
  const { updateUser } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const steps = useMemo(() => getMobileOnboardingSteps(userProfile), [userProfile]);

  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(Boolean(enabled));
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setStepIndex(0);
    }
  }, [visible, userProfile]);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }
    fadeAnim.setValue(0.25);
    slideAnim.setValue(12);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 210,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 210,
        useNativeDriver: true,
      }),
    ]).start();
  }, [stepIndex, visible, reduceMotion, fadeAnim, slideAnim]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= steps.length - 1;
  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100);

  const handleFinishOrSkip = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await apiClient.post(ENDPOINTS.ONBOARDING_COMPLETE, {
        version: onboardingVersion,
      });
    } catch {
      // Close smoothly even if offline; next online sync can refresh
    } finally {
      await updateUser({
        onboarding_completed: true,
        onboarding_version: onboardingVersion,
        needs_onboarding: false,
      });
      setSaving(false);
      onClose();
    }
  };

  if (!visible || !currentStep) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={() => void handleFinishOrSkip()}
    >
      <View
        style={[
          styles.backdrop,
          {
            paddingTop: Math.max(insets.top + 12, 24),
            paddingBottom: Math.max(insets.bottom + 12, 24),
          },
        ]}
      >
        <View style={styles.card}>
          {/* Top Progress Strip */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          {/* Top Bar */}
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Ionicons name="sparkles-outline" size={13} color={palette.primary} />
              <Text style={styles.badgeText} numberOfLines={1}>
                {currentStep.badgeText}
              </Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.stepCounter}>
                {stepIndex + 1} / {steps.length}
              </Text>
              <TouchableOpacity
                onPress={() => void handleFinishOrSkip()}
                style={styles.closeBtn}
                accessibilityLabel="Skip onboarding guide"
              >
                <Ionicons name="close" size={18} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Animated Step Body */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
                gap: 12,
              }}
            >
              <OnboardingIllustration
                kind={currentStep.illustration}
                reduceMotion={reduceMotion}
              />

              <Text style={styles.title}>{currentStep.title}</Text>
              <Text style={styles.description}>{currentStep.description}</Text>

              {currentStep.tip && (
                <View style={styles.tipBox}>
                  <Ionicons name="bulb-outline" size={16} color={palette.primary} />
                  <Text style={styles.tipText}>{currentStep.tip}</Text>
                </View>
              )}
            </Animated.View>

            {/* Step Dots */}
            <View style={styles.dotsRow}>
              {steps.map((step, idx) => {
                const active = idx === stepIndex;
                return (
                  <TouchableOpacity
                    key={step.id}
                    onPress={() => setStepIndex(idx)}
                    accessibilityLabel={`Step ${idx + 1}: ${step.title}`}
                    style={[styles.dot, active && styles.dotActive]}
                  />
                );
              })}
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <TouchableOpacity
                onPress={() => void handleFinishOrSkip()}
                style={styles.textBtn}
              >
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              {onOpenManual && (
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    onOpenManual();
                  }}
                  style={styles.manualLinkBtn}
                >
                  <Ionicons name="book-outline" size={14} color={palette.primary} />
                  <Text style={styles.manualLinkText}>Manual</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.footerRight}>
              {!isFirst && (
                <TouchableOpacity
                  onPress={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                  style={styles.backBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chevron-back" size={16} color={palette.textPrimary} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
              )}
              {isLast ? (
                <TouchableOpacity
                  onPress={() => void handleFinishOrSkip()}
                  disabled={saving}
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={palette.onPrimary} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={16} color={palette.onPrimary} />
                      <Text style={styles.primaryBtnText}>Get Started</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                  style={styles.primaryBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Next</Text>
                  <Ionicons name="chevron-forward" size={16} color={palette.onPrimary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.roleCaption}>
            Guide tailored for {getProfileDisplayName(userProfile)}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.62)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '92%',
      backgroundColor: palette.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      overflow: 'hidden',
    },
    progressTrack: {
      height: 4,
      width: '100%',
      backgroundColor: palette.surfaceSubtle,
    },
    progressFill: {
      height: '100%',
      backgroundColor: palette.primary,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
      gap: 8,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: palette.primarySoft,
      flexShrink: 1,
    },
    badgeText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    stepCounter: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textMuted,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: palette.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bodyScroll: {
      flexGrow: 0,
    },
    bodyContent: {
      paddingHorizontal: 18,
      paddingBottom: 14,
      gap: 12,
    },
    title: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      lineHeight: 23,
    },
    description: {
      fontSize: fonts.base,
      color: palette.textSecondary,
      lineHeight: 20,
    },
    tipBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 11,
      borderRadius: 12,
      backgroundColor: palette.infoLight,
      borderWidth: 1,
      borderColor: palette.border,
    },
    tipText: {
      flex: 1,
      fontSize: fonts.sm,
      color: palette.textPrimary,
      lineHeight: 18,
    },
    dotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 4,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.borderStrong,
    },
    dotActive: {
      width: 22,
      backgroundColor: palette.primary,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.surfaceSubtle,
      gap: 8,
    },
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    footerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    textBtn: {
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    skipText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.textMuted,
    },
    manualLinkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    manualLinkText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.primary,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    backBtnText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: palette.buttonBg,
    },
    primaryBtnText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
    },
    roleCaption: {
      textAlign: 'center',
      fontSize: fonts.xxs,
      color: palette.textMuted,
      paddingVertical: 6,
      backgroundColor: palette.surface,
    },
  });

export default OnboardingGuideModal;
