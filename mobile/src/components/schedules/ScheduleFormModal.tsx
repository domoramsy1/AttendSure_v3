/**
 * AttendSure Mobile - Universal Academic Setup Add / Edit Modal
 * File: mobile/src/components/schedules/ScheduleFormModal.tsx
 */

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import ChipRow from '../common/ChipRow';
import type {
  DeptFormState,
  GradeFormState,
  HolidayFormState,
  PeriodFormState,
  RoomFormState,
  ScheduleSubTab,
  SectionFormState,
  SubjectFormState,
  YearFormState,
} from './types';

const DAY_OPTIONS = [
  { key: 'ALL_WEEKDAYS', label: 'Mon–Fri' },
  { key: 'MWF', label: 'MWF' },
  { key: 'TTH', label: 'TTh' },
  { key: '1', label: 'Mon' },
  { key: '2', label: 'Tue' },
  { key: '3', label: 'Wed' },
  { key: '4', label: 'Thu' },
  { key: '5', label: 'Fri' },
] as const;

const SUBJECT_CATEGORIES = ['CORE', 'APPLIED', 'SPECIALIZED', 'ELECTIVE'] as const;
const ROOM_TYPES = ['CLASSROOM', 'LABORATORY', 'OFFICE', 'LIBRARY', 'GYM'] as const;
const GRADE_STAGES = ['JHS', 'SHS', 'ELEM'] as const;
const HOLIDAY_TYPES = ['HOLIDAY', 'SUSPENSION', 'EVENT'] as const;

export interface ScheduleFormModalProps {
  visible: boolean;
  subTab: ScheduleSubTab;
  addLabel: string;
  isEditing: boolean;
  saving: boolean;
  conflictWarn: string;
  sections: any[];
  subjects: any[];
  teachers: any[];
  grades: any[];
  rooms: any[];
  periodForm: PeriodFormState;
  setPeriodForm: React.Dispatch<React.SetStateAction<PeriodFormState>>;
  sectionForm: SectionFormState;
  setSectionForm: React.Dispatch<React.SetStateAction<SectionFormState>>;
  subjectForm: SubjectFormState;
  setSubjectForm: React.Dispatch<React.SetStateAction<SubjectFormState>>;
  roomForm: RoomFormState;
  setRoomForm: React.Dispatch<React.SetStateAction<RoomFormState>>;
  gradeForm: GradeFormState;
  setGradeForm: React.Dispatch<React.SetStateAction<GradeFormState>>;
  yearForm: YearFormState;
  setYearForm: React.Dispatch<React.SetStateAction<YearFormState>>;
  deptForm: DeptFormState;
  setDeptForm: React.Dispatch<React.SetStateAction<DeptFormState>>;
  holidayForm: HolidayFormState;
  setHolidayForm: React.Dispatch<React.SetStateAction<HolidayFormState>>;
  onClose: () => void;
  onSave: () => void;
}

export const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
  visible,
  subTab,
  addLabel,
  isEditing,
  saving,
  conflictWarn,
  sections,
  subjects,
  teachers,
  grades,
  rooms,
  periodForm,
  setPeriodForm,
  sectionForm,
  setSectionForm,
  subjectForm,
  setSubjectForm,
  roomForm,
  setRoomForm,
  gradeForm,
  setGradeForm,
  yearForm,
  setYearForm,
  deptForm,
  setDeptForm,
  holidayForm,
  setHolidayForm,
  onClose,
  onSave,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isEditing ? 'Edit' : 'Add'} {addLabel}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={palette.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
          >
            {conflictWarn ? (
              <View style={styles.warnBox}>
                <Ionicons name="warning-outline" size={16} color={palette.warning} />
                <Text style={styles.warnText}>{conflictWarn}</Text>
              </View>
            ) : null}

            {subTab === 'PERIODS' && (
              <>
                <Text style={styles.inputLabel}>Section *</Text>
                <ChipRow
                  options={sections.map((s) => ({
                    key: String(s.id),
                    label: s.grade_level_name ? `${s.grade_level_name} - ${s.name}` : s.name,
                  }))}
                  selected={periodForm.section}
                  onSelect={(val) => setPeriodForm((p) => ({ ...p, section: val }))}
                />

                <Text style={styles.inputLabel}>Subject *</Text>
                <ChipRow
                  options={subjects.map((sub) => ({ key: String(sub.id), label: sub.code }))}
                  selected={periodForm.subject}
                  onSelect={(val) => setPeriodForm((p) => ({ ...p, subject: val }))}
                />

                <Text style={styles.inputLabel}>Assigned Teacher *</Text>
                <ChipRow
                  options={teachers.map((t) => ({
                    key: String(t.id),
                    label: t.full_name || `${t.first_name} ${t.last_name}`,
                  }))}
                  selected={periodForm.teacher}
                  onSelect={(val) => setPeriodForm((p) => ({ ...p, teacher: val }))}
                />

                <Text style={styles.inputLabel}>Days</Text>
                <ChipRow
                  wrap
                  options={DAY_OPTIONS}
                  selected={periodForm.day_of_week}
                  onSelect={(val) => setPeriodForm((p) => ({ ...p, day_of_week: val }))}
                />

                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Start Time (HH:MM)</Text>
                    <TextInput
                      style={styles.input}
                      value={periodForm.start_time}
                      onChangeText={(v) => setPeriodForm((p) => ({ ...p, start_time: v }))}
                      placeholder="08:00"
                      placeholderTextColor={palette.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>End Time (HH:MM)</Text>
                    <TextInput
                      style={styles.input}
                      value={periodForm.end_time}
                      onChangeText={(v) => setPeriodForm((p) => ({ ...p, end_time: v }))}
                      placeholder="09:00"
                      placeholderTextColor={palette.textMuted}
                    />
                  </View>
                </View>
              </>
            )}

            {subTab === 'SECTIONS' && (
              <>
                <Text style={styles.inputLabel}>Grade Level *</Text>
                <ChipRow
                  options={grades.map((g) => ({ key: String(g.id), label: g.name }))}
                  selected={sectionForm.grade_level}
                  onSelect={(val) => setSectionForm((p) => ({ ...p, grade_level: val }))}
                />

                <Text style={styles.inputLabel}>Section Name *</Text>
                <TextInput
                  style={styles.input}
                  value={sectionForm.name}
                  onChangeText={(v) => setSectionForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. Newton"
                  placeholderTextColor={palette.textMuted}
                />

                <Text style={styles.inputLabel}>Room Assignment</Text>
                {rooms.length > 0 && (
                  <ChipRow
                    options={rooms.map((r) => ({ key: r.name, label: r.name }))}
                    selected={sectionForm.room_name}
                    onSelect={(val) => setSectionForm((p) => ({ ...p, room_name: val }))}
                  />
                )}
                <TextInput
                  style={styles.input}
                  value={sectionForm.room_name}
                  onChangeText={(v) => setSectionForm((p) => ({ ...p, room_name: v }))}
                  placeholder="e.g. Room 101"
                  placeholderTextColor={palette.textMuted}
                />

                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Max Capacity</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      value={sectionForm.capacity}
                      onChangeText={(v) =>
                        setSectionForm((p) => ({ ...p, capacity: v.replace(/\D/g, '') }))
                      }
                      placeholder="45"
                      placeholderTextColor={palette.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Track / Strand (SHS)</Text>
                    <TextInput
                      style={styles.input}
                      value={sectionForm.track_strand}
                      onChangeText={(v) => setSectionForm((p) => ({ ...p, track_strand: v }))}
                      placeholder="STEM / HUMSS"
                      placeholderTextColor={palette.textMuted}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Homeroom Adviser</Text>
                <ChipRow
                  options={[
                    { key: '', label: 'Unassigned' },
                    ...teachers.map((t) => {
                      const count = Array.isArray(t.advised_sections)
                        ? t.advised_sections.length
                        : 0;
                      const base = t.full_name || `${t.first_name} ${t.last_name}`;
                      return {
                        key: String(t.id),
                        label: count > 0 ? `${base} (${count})` : base,
                      };
                    }),
                  ]}
                  selected={sectionForm.adviser}
                  onSelect={(val) => setSectionForm((p) => ({ ...p, adviser: val }))}
                />

                <View style={styles.switchRow}>
                  <Text style={[styles.inputLabel, { flex: 1, marginTop: 0 }]}>
                    Allow second advisory class (DepEd double-shift / multigrade exception)
                  </Text>
                  <Switch
                    value={sectionForm.allow_multiple_advisories}
                    onValueChange={(v) =>
                      setSectionForm((p) => ({ ...p, allow_multiple_advisories: v }))
                    }
                    trackColor={{ false: palette.borderStrong, true: palette.primary }}
                    thumbColor={palette.onPrimary}
                  />
                </View>
              </>
            )}

            {subTab === 'SUBJECTS' && (
              <>
                <Text style={styles.inputLabel}>Subject Code *</Text>
                <TextInput
                  style={styles.input}
                  autoCapitalize="characters"
                  value={subjectForm.code}
                  onChangeText={(v) => setSubjectForm((p) => ({ ...p, code: v }))}
                  placeholder="e.g. MATH7"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Subject Title *</Text>
                <TextInput
                  style={styles.input}
                  value={subjectForm.title}
                  onChangeText={(v) => setSubjectForm((p) => ({ ...p, title: v }))}
                  placeholder="e.g. Mathematics 7"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Grade Level (Optional)</Text>
                <ChipRow
                  options={[
                    { key: '', label: 'All Grades' },
                    ...grades.map((g) => ({ key: String(g.id), label: g.name })),
                  ]}
                  selected={subjectForm.grade_level}
                  onSelect={(val) => setSubjectForm((p) => ({ ...p, grade_level: val }))}
                />
                <Text style={styles.inputLabel}>Category</Text>
                <ChipRow
                  wrap
                  options={SUBJECT_CATEGORIES.map((cat) => ({ key: cat, label: cat }))}
                  selected={subjectForm.subject_category}
                  onSelect={(val) => setSubjectForm((p) => ({ ...p, subject_category: val }))}
                />
                <Text style={styles.inputLabel}>Units</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={subjectForm.units}
                  onChangeText={(v) => setSubjectForm((p) => ({ ...p, units: v }))}
                  placeholder="1.0"
                  placeholderTextColor={palette.textMuted}
                />
              </>
            )}

            {subTab === 'ROOMS' && (
              <>
                <Text style={styles.inputLabel}>Classroom / Room Name *</Text>
                <TextInput
                  style={styles.input}
                  value={roomForm.name}
                  onChangeText={(v) => setRoomForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. Room 101"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Building Name</Text>
                <TextInput
                  style={styles.input}
                  value={roomForm.building}
                  onChangeText={(v) => setRoomForm((p) => ({ ...p, building: v }))}
                  placeholder="e.g. Rizal Building"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Room Type</Text>
                <ChipRow
                  wrap
                  options={ROOM_TYPES.map((rt) => ({ key: rt, label: rt }))}
                  selected={roomForm.room_type}
                  onSelect={(val) => setRoomForm((p) => ({ ...p, room_type: val }))}
                />
                <Text style={styles.inputLabel}>Seating Capacity</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={roomForm.capacity}
                  onChangeText={(v) =>
                    setRoomForm((p) => ({ ...p, capacity: v.replace(/\D/g, '') }))
                  }
                  placeholder="45"
                  placeholderTextColor={palette.textMuted}
                />
                <View style={styles.switchRow}>
                  <Text style={[styles.inputLabel, { flex: 1, marginTop: 0 }]}>Room Active</Text>
                  <Switch
                    value={roomForm.is_active}
                    onValueChange={(v) => setRoomForm((p) => ({ ...p, is_active: v }))}
                    trackColor={{ false: palette.borderStrong, true: palette.success }}
                    thumbColor={palette.onPrimary}
                  />
                </View>
              </>
            )}

            {subTab === 'GRADES' && (
              <>
                <Text style={styles.inputLabel}>Grade Level Number *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={gradeForm.level_number}
                  onChangeText={(v) =>
                    setGradeForm((p) => ({ ...p, level_number: v.replace(/\D/g, '') }))
                  }
                  placeholder="7"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Grade Code</Text>
                <TextInput
                  style={styles.input}
                  value={gradeForm.code}
                  onChangeText={(v) => setGradeForm((p) => ({ ...p, code: v }))}
                  placeholder="G7"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Grade Name *</Text>
                <TextInput
                  style={styles.input}
                  value={gradeForm.name}
                  onChangeText={(v) => setGradeForm((p) => ({ ...p, name: v }))}
                  placeholder="Grade 7"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Education Stage</Text>
                <ChipRow
                  wrap
                  options={GRADE_STAGES.map((st) => ({ key: st, label: st }))}
                  selected={gradeForm.stage}
                  onSelect={(val) => setGradeForm((p) => ({ ...p, stage: val }))}
                />
              </>
            )}

            {subTab === 'YEARS' && (
              <>
                <Text style={styles.inputLabel}>School Year Name *</Text>
                <TextInput
                  style={styles.input}
                  value={yearForm.name}
                  onChangeText={(v) => setYearForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. 2026-2027"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={yearForm.start_date}
                  onChangeText={(v) => setYearForm((p) => ({ ...p, start_date: v }))}
                  placeholder="2026-06-15"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>End Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={yearForm.end_date}
                  onChangeText={(v) => setYearForm((p) => ({ ...p, end_date: v }))}
                  placeholder="2027-03-31"
                  placeholderTextColor={palette.textMuted}
                />
                <View style={styles.switchRow}>
                  <Text style={[styles.inputLabel, { flex: 1, marginTop: 0 }]}>
                    Set as Active School Year
                  </Text>
                  <Switch
                    value={yearForm.is_active}
                    onValueChange={(v) => setYearForm((p) => ({ ...p, is_active: v }))}
                    trackColor={{ false: palette.borderStrong, true: palette.success }}
                    thumbColor={palette.onPrimary}
                  />
                </View>
              </>
            )}

            {subTab === 'DEPARTMENTS' && (
              <>
                <Text style={styles.inputLabel}>Department Code *</Text>
                <TextInput
                  style={styles.input}
                  autoCapitalize="characters"
                  value={deptForm.code}
                  onChangeText={(v) => setDeptForm((p) => ({ ...p, code: v }))}
                  placeholder="e.g. MATH"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Department Name *</Text>
                <TextInput
                  style={styles.input}
                  value={deptForm.name}
                  onChangeText={(v) => setDeptForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. Mathematics Department"
                  placeholderTextColor={palette.textMuted}
                />
              </>
            )}

            {subTab === 'HOLIDAYS' && (
              <>
                <Text style={styles.inputLabel}>Date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.input}
                  value={holidayForm.date}
                  onChangeText={(v) => setHolidayForm((p) => ({ ...p, date: v }))}
                  placeholder="2026-11-30"
                  placeholderTextColor={palette.textMuted}
                />
                <Text style={styles.inputLabel}>Notice Type *</Text>
                <ChipRow
                  wrap
                  options={HOLIDAY_TYPES.map((ht) => ({ key: ht, label: ht }))}
                  selected={holidayForm.type}
                  onSelect={(val) => setHolidayForm((p) => ({ ...p, type: val }))}
                />
                <Text style={styles.inputLabel}>Holiday / Event Title *</Text>
                <TextInput
                  style={styles.input}
                  value={holidayForm.title}
                  onChangeText={(v) => setHolidayForm((p) => ({ ...p, title: v }))}
                  placeholder="e.g. Bonifacio Day / Typhoon Class Suspension"
                  placeholderTextColor={palette.textMuted}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>Save {addLabel}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      padding: 14,
    },
    modalSheet: {
      maxHeight: '90%',
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    inputLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary, marginTop: 4 },
    input: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    twoCol: { flexDirection: 'row', gap: 10 },
    warnBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.warningLight,
      borderWidth: 1,
      borderColor: palette.warning,
    },
    warnText: { flex: 1, fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.warning },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    saveBtn: {
      backgroundColor: palette.buttonBg,
      borderRadius: 10,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
  });

export default ScheduleFormModal;
