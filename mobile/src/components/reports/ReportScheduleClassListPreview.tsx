// AttendSure Mobile - Schedule & Class List Report Previews
// File: D:\AttendSure_V3\mobile\src\components\reports\ReportScheduleClassListPreview.tsx

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import type { PackScope } from './ReportPackScopeFilter';

interface SchedulePreviewProps {
  packScope: PackScope;
  isAdmin: boolean;
  pickedSectionIds: number[];
  pickedTeacherIds: number[];
  scheduleData: any;
  cleanSearch: string;
}

export const ReportSchedulePreview: React.FC<SchedulePreviewProps> = ({
  packScope,
  isAdmin,
  pickedSectionIds,
  pickedTeacherIds,
  scheduleData,
  cleanSearch,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  if (
    packScope === 'SELECTED' &&
    pickedSectionIds.length === 0 &&
    (!isAdmin || pickedTeacherIds.length === 0)
  ) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>
          Tap one or more class sections or teachers above, or switch to All.
        </Text>
      </View>
    );
  }

  if (!scheduleData || !(scheduleData.teacher_schedules || []).length) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>No class schedules found for the selected filter.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {(scheduleData.teacher_schedules as any[])
        .filter(
          (ts) =>
            !cleanSearch ||
            String(ts.teacher_name || '').toLowerCase().includes(cleanSearch) ||
            (ts.periods || []).some(
              (p: any) =>
                String(p.subject_title || '').toLowerCase().includes(cleanSearch) ||
                String(p.section_label || '').toLowerCase().includes(cleanSearch)
            )
        )
        .map((ts: any) => (
          <View key={`sched-t-${ts.teacher_id}`} style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>
              {ts.teacher_name} ({ts.employee_id}) • {ts.total_weekly_hours} hrs/wk
            </Text>
            {Array.isArray(ts.advisory_sections) && ts.advisory_sections.length > 0 && (
              <Text style={styles.subLine}>Class Adviser: {ts.advisory_sections.join(', ')}</Text>
            )}
            {(ts.periods || []).length === 0 ? (
              <Text style={styles.emptyText}>No active subject periods assigned.</Text>
            ) : (
              (ts.periods || []).map((p: any) => (
                <View key={`per-${p.id}`} style={styles.periodRow}>
                  <Text style={styles.rowTitle}>
                    {p.subject_code} — {p.subject_title}
                  </Text>
                  <Text style={styles.rowSub}>
                    {p.section_label} • {p.room_name}
                  </Text>
                  <Text style={styles.rowTime}>
                    {p.time_range} ({p.day_label})
                  </Text>
                </View>
              ))
            )}
          </View>
        ))}
    </View>
  );
};

interface ClassListPreviewProps {
  packScope: PackScope;
  pickedSectionIds: number[];
  classListData: any;
  cleanSearch: string;
}

export const ReportClassListPreview: React.FC<ClassListPreviewProps> = ({
  packScope,
  pickedSectionIds,
  classListData,
  cleanSearch,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  if (packScope === 'SELECTED' && pickedSectionIds.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>
          Tap one or more class sections above, or switch to All.
        </Text>
      </View>
    );
  }

  if (!classListData || !(classListData.class_lists || []).length) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>No class lists found for the selected filter.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {(classListData.class_lists as any[]).map((cl: any) => {
        const matchingStudents = (cl.students || []).filter(
          (st: any) =>
            !cleanSearch ||
            String(st.full_name || '').toLowerCase().includes(cleanSearch) ||
            String(st.lrn || '').toLowerCase().includes(cleanSearch)
        );
        return (
          <View key={`cl-${cl.section_id}`} style={styles.card}>
            <Text style={styles.sectionHeaderTitle}>
              {cl.section_label} ({cl.total_count} Students)
            </Text>
            <Text style={styles.subLine}>
              Adviser: {cl.adviser_name} • Room: {cl.room_name} • Male: {cl.male_count} / Female:{' '}
              {cl.female_count}
            </Text>
            {matchingStudents.length === 0 ? (
              <Text style={styles.emptyText}>No students match your search.</Text>
            ) : (
              matchingStudents.map((st: any) => (
                <View key={`st-${cl.section_id}-${st.student_id}`} style={styles.studentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{st.full_name}</Text>
                    <Text style={styles.rowSub}>
                      LRN: {st.lrn} • {st.sex}
                    </Text>
                  </View>
                  <Text style={styles.studentStatus}>{st.today_status}</Text>
                </View>
              ))
            )}
          </View>
        );
      })}
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
    subLine: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: fonts.xs,
      color: palette.textMuted,
      textAlign: 'center',
      paddingVertical: 8,
    },
    periodRow: {
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      gap: 2,
    },
    studentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      gap: 8,
    },
    rowTitle: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
    },
    rowSub: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
    },
    rowTime: {
      fontSize: fonts.xs,
      color: palette.primary,
      fontWeight: fonts.weight.semibold,
    },
    studentStatus: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.primary,
    },
  });
