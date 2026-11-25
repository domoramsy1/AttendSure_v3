// AttendSure Mobile - Searchable In-App User Manual Screen
// File: D:\AttendSure_V3\mobile\src\screens\UserManualScreen.tsx

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import type { ThemePalette } from '../constants/theme';
import ChipRow from '../components/common/ChipRow';
import {
  MANUAL_ROLE_OPTIONS,
  USER_MANUAL_SECTIONS,
  getProfileDisplayName,
  resolveUserProfileKey,
  type ManualRoleKey,
} from '../components/help/manualContent';

interface UserManualScreenProps {
  onStartTour: () => void;
}

export const UserManualScreen: React.FC<UserManualScreenProps> = ({ onStartTour }) => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const userProfile = resolveUserProfileKey(
    user?.role || user?.system_role,
    user?.can_handle_classes ?? user?.can_teach ?? true
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<ManualRoleKey>('ALL');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'first-time-setup': true,
    'teacher-time-in-out': true,
  });
  const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({});

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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Prominent Animated Walkthrough Launcher Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="play-circle" size={24} color={palette.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Interactive Animated Walkthrough</Text>
            <Text style={styles.heroSub}>
              Tailored for {getProfileDisplayName(userProfile)}. Replay anytime in under 1 minute.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.tourBtn}
          onPress={onStartTour}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles-outline" size={16} color={palette.onPrimary} />
          <Text style={styles.tourBtnText}>Start Animated Walkthrough</Text>
        </TouchableOpacity>
      </View>

      {/* Instant Search Box */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={palette.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search manual (e.g. QR scan, GPS, offline, Form 48, reset lock)..."
          placeholderTextColor={palette.textMuted}
          maxLength={80}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={palette.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role Filter Chips */}
      <ChipRow<ManualRoleKey>
        options={MANUAL_ROLE_OPTIONS}
        selected={selectedRole}
        onSelect={setSelectedRole}
      />

      {/* Manual Sections */}
      {filteredSections.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="help-circle-outline" size={28} color={palette.textMuted} />
          <Text style={styles.emptyTitle}>No matching guide sections</Text>
          <Text style={styles.emptySub}>
            Try another keyword or switch the role filter back to All Roles.
          </Text>
        </View>
      ) : (
        filteredSections.map((section) => {
          const isOpen = Boolean(searchQuery.trim()) || Boolean(expandedSections[section.id]);
          return (
            <View key={section.id} style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.id)}
                activeOpacity={0.75}
              >
                <View style={styles.numBadge}>
                  <Text style={styles.numBadgeText}>{section.number}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionSummary}>{section.summary}</Text>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={palette.textMuted}
                />
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.sectionBody}>
                  {section.highlights.map((hl, idx) => (
                    <View key={idx} style={styles.highlightRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={palette.success}
                        style={{ marginTop: 1 }}
                      />
                      <Text style={styles.highlightText}>{hl}</Text>
                    </View>
                  ))}

                  <View style={styles.stepsWrap}>
                    {section.steps.map((step, sIdx) => (
                      <View key={sIdx} style={styles.stepBox}>
                        <Text style={styles.stepHeading}>
                          Step {sIdx + 1}: {step.heading}
                        </Text>
                        <Text style={styles.stepDetail}>{step.detail}</Text>
                      </View>
                    ))}
                  </View>

                  {section.tip && (
                    <View style={styles.tipBox}>
                      <Ionicons name="bulb-outline" size={16} color={palette.primary} />
                      <Text style={styles.tipText}>
                        <Text style={{ fontWeight: fonts.weight.extrabold }}>Tip: </Text>
                        {section.tip}
                      </Text>
                    </View>
                  )}

                  {section.faqs && section.faqs.length > 0 && (
                    <View style={styles.faqsWrap}>
                      {section.faqs.map((faq, fIdx) => {
                        const faqKey = `${section.id}-faq-${fIdx}`;
                        const faqOpen = Boolean(searchQuery.trim()) || Boolean(expandedFaqs[faqKey]);
                        return (
                          <View key={faqKey} style={styles.faqCard}>
                            <TouchableOpacity
                              style={styles.faqHeader}
                              onPress={() => toggleFaq(faqKey)}
                              activeOpacity={0.75}
                            >
                              <Text style={styles.faqQuestion}>{faq.question}</Text>
                              <Ionicons
                                name={faqOpen ? 'chevron-down' : 'chevron-forward'}
                                size={16}
                                color={palette.textMuted}
                              />
                            </TouchableOpacity>
                            {faqOpen && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background,
    },
    scrollContent: {
      padding: 14,
      paddingBottom: 120,
      gap: 12,
    },
    heroCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.primary,
      gap: 12,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    heroIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    heroSub: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    tourBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 42,
      borderRadius: 12,
      backgroundColor: palette.buttonBg,
    },
    tourBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      paddingHorizontal: 12,
      height: 44,
    },
    searchInput: {
      flex: 1,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    emptyCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 28,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    emptySub: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      textAlign: 'center',
    },
    sectionCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.border,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 13,
    },
    numBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    numBadgeText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    sectionTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    sectionSummary: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },
    sectionBody: {
      borderTopWidth: 1,
      borderTopColor: palette.border,
      padding: 13,
      gap: 10,
    },
    highlightRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
    },
    highlightText: {
      flex: 1,
      fontSize: fonts.sm,
      color: palette.textPrimary,
      lineHeight: 18,
    },
    stepsWrap: {
      gap: 8,
    },
    stepBox: {
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      padding: 10,
      gap: 3,
    },
    stepHeading: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    stepDetail: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      lineHeight: 17,
    },
    tipBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.infoLight,
      borderWidth: 1,
      borderColor: palette.border,
    },
    tipText: {
      flex: 1,
      fontSize: fonts.xs,
      color: palette.textPrimary,
      lineHeight: 17,
    },
    faqsWrap: {
      gap: 8,
    },
    faqCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surface,
      overflow: 'hidden',
    },
    faqHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: 10,
    },
    faqQuestion: {
      flex: 1,
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
      lineHeight: 18,
    },
    faqAnswer: {
      paddingHorizontal: 10,
      paddingBottom: 10,
      fontSize: fonts.xs,
      color: palette.textSecondary,
      lineHeight: 18,
    },
  });

export default UserManualScreen;
