// AttendSure Mobile - Report Pack Scope Filter (All vs Selected Sections / Teachers)
// File: D:\AttendSure_V3\mobile\src\components\reports\ReportPackScopeFilter.tsx

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';

export type PackScope = 'ALL' | 'SELECTED';

export interface AssignedSectionOption {
  section_id: number;
  section_name: string;
  grade_level?: string;
}

export interface SelectableTeacherOption {
  id: number;
  full_name: string;
  employee_id?: string;
}

interface ReportPackScopeFilterProps {
  selectedTab: 'SCHEDULE' | 'CLASS_LIST';
  isAdmin: boolean;
  packScope: PackScope;
  onChangeScope: (scope: PackScope) => void;
  sections: AssignedSectionOption[];
  pickedSectionIds: number[];
  onToggleSection: (sectionId: number) => void;
  teachersList: SelectableTeacherOption[];
  pickedTeacherIds: number[];
  onToggleTeacher: (teacherId: number) => void;
}

export const ReportPackScopeFilter: React.FC<ReportPackScopeFilterProps> = ({
  selectedTab,
  isAdmin,
  packScope,
  onChangeScope,
  sections,
  pickedSectionIds,
  onToggleSection,
  teachersList,
  pickedTeacherIds,
  onToggleTeacher,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeaderTitle}>EXPORT &amp; PRINT SCOPE</Text>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          marginBottom: packScope === 'SELECTED' ? 10 : 0,
        }}
      >
        <TouchableOpacity
          style={[
            styles.secPill,
            { flex: 1, justifyContent: 'center', marginRight: 0 },
            packScope === 'ALL' && styles.secPillActive,
          ]}
          onPress={() => onChangeScope('ALL')}
        >
          <Text style={[styles.secPillText, packScope === 'ALL' && styles.secPillTextActive]}>
            {isAdmin ? 'All School Records' : 'All My Classes'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.secPill,
            { flex: 1, justifyContent: 'center', marginRight: 0 },
            packScope === 'SELECTED' && styles.secPillActive,
          ]}
          onPress={() => onChangeScope('SELECTED')}
        >
          <Text style={[styles.secPillText, packScope === 'SELECTED' && styles.secPillTextActive]}>
            Selected Only ({pickedSectionIds.length + (isAdmin ? pickedTeacherIds.length : 0)})
          </Text>
        </TouchableOpacity>
      </View>

      {packScope === 'SELECTED' && (
        <View style={{ gap: 8 }}>
          {sections.length > 0 && (
            <View>
              <Text style={styles.helperText}>Tap Class Sections to Include:</Text>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.inlineStrip}
                contentContainerStyle={styles.inlineStripContent}
              >
                {sections.map((sec) => {
                  const checked = pickedSectionIds.includes(sec.section_id);
                  return (
                    <TouchableOpacity
                      key={`pick-sec-${sec.section_id}`}
                      style={[styles.secPill, checked && styles.secPillActive]}
                      onPress={() => onToggleSection(sec.section_id)}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={13}
                        color={checked ? palette.onPrimary : palette.primary}
                      />
                      <Text style={[styles.secPillText, checked && styles.secPillTextActive]}>
                        {sec.section_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {isAdmin && teachersList.length > 0 && selectedTab === 'SCHEDULE' && (
            <View>
              <Text style={styles.helperText}>Or Tap Teachers to Include:</Text>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.inlineStrip}
                contentContainerStyle={styles.inlineStripContent}
              >
                {teachersList.map((t) => {
                  const checked = pickedTeacherIds.includes(t.id);
                  return (
                    <TouchableOpacity
                      key={`pick-t-${t.id}`}
                      style={[styles.secPill, checked && styles.secPillActive]}
                      onPress={() => onToggleTeacher(t.id)}
                    >
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={13}
                        color={checked ? palette.onPrimary : palette.primary}
                      />
                      <Text style={[styles.secPillText, checked && styles.secPillTextActive]}>
                        {t.full_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
    },
    sectionHeaderTitle: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
      letterSpacing: 0.4,
      marginBottom: 8,
    },
    helperText: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      marginBottom: 6,
    },
    inlineStrip: { flexGrow: 0, flexShrink: 0 },
    inlineStripContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
    secPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.border,
      marginRight: 8,
    },
    secPillActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    secPillText: {
      fontSize: fonts.xs,
      lineHeight: 16,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    secPillTextActive: { color: palette.onPrimary },
  });

export default ReportPackScopeFilter;
