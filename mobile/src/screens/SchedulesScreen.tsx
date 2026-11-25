/**
 * AttendSure Mobile - Complete Academic Setup & Class Schedules CRUD (100% Web Parity)
 * File: mobile/src/screens/SchedulesScreen.tsx
 *
 * Covers all 8 Web Academic Setup tabs:
 * Periods, Sections, Subjects, Classrooms, Grade Levels, School Years, Departments, Holidays.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
import { canManageSchoolSetup } from '../utils/permissions';
import { confirmAction, showNotice } from '../utils/helpers';
import { getServerBaseUrl } from '../services/configService';
import ChipRow from '../components/common/ChipRow';
import ScheduleListItemCard from '../components/schedules/ScheduleListItemCard';
import ScheduleFormModal from '../components/schedules/ScheduleFormModal';
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
} from '../components/schedules/types';

export const SchedulesScreen: React.FC = () => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const allowCrud = canManageSchoolSetup(user);

  const [subTab, setSubTab] = useState<ScheduleSubTab>('PERIODS');
  const [searchQuery, setSearchQuery] = useState('');
  const [serverBase, setServerBase] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [periods, setPeriods] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [schoolYears, setSchoolYears] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictWarn, setConflictWarn] = useState<string>('');

  const [periodForm, setPeriodForm] = useState<PeriodFormState>({
    section: '',
    subject: '',
    teacher: '',
    day_of_week: 'ALL_WEEKDAYS',
    start_time: '08:00',
    end_time: '09:00',
  });

  const [sectionForm, setSectionForm] = useState<SectionFormState>({
    grade_level: '',
    name: '',
    room_name: '',
    capacity: '45',
    track_strand: '',
    adviser: '',
    allow_multiple_advisories: false,
  });

  const [subjectForm, setSubjectForm] = useState<SubjectFormState>({
    code: '',
    title: '',
    grade_level: '',
    subject_category: 'CORE',
    units: '1.0',
  });

  const [roomForm, setRoomForm] = useState<RoomFormState>({
    name: '',
    building: 'Main Building',
    capacity: '45',
    room_type: 'CLASSROOM',
    is_active: true,
  });

  const [gradeForm, setGradeForm] = useState<GradeFormState>({
    level_number: '7',
    code: 'G7',
    name: 'Grade 7',
    stage: 'JHS',
  });

  const [yearForm, setYearForm] = useState<YearFormState>({
    name: '',
    start_date: '',
    end_date: '',
    is_active: false,
  });

  const [deptForm, setDeptForm] = useState<DeptFormState>({
    code: '',
    name: '',
  });

  const [holidayForm, setHolidayForm] = useState<HolidayFormState>({
    date: new Date().toISOString().slice(0, 10),
    type: 'HOLIDAY',
    title: '',
  });

  const isMounted = useRef(true);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent && isMounted.current) setLoading(true);
    try {
      const [pRes, secRes, subRes, rRes, gRes, syRes, dRes, hRes, tRes, base] =
        await Promise.allSettled([
          apiClient.get(ENDPOINTS.PERIODS, { params: { page_size: 200 } }),
          apiClient.get(ENDPOINTS.SECTIONS, { params: { page_size: 200 } }),
          apiClient.get(ENDPOINTS.SUBJECTS, { params: { page_size: 200 } }),
          apiClient.get(ENDPOINTS.ROOMS, { params: { page_size: 200 } }),
          apiClient.get(ENDPOINTS.GRADE_LEVELS, { params: { page_size: 100 } }),
          apiClient.get(ENDPOINTS.SCHOOL_YEARS, { params: { page_size: 100 } }),
          apiClient.get(ENDPOINTS.DEPARTMENTS, { params: { page_size: 100 } }),
          apiClient.get(ENDPOINTS.HOLIDAYS, { params: { page_size: 200 } }),
          apiClient.get(ENDPOINTS.TEACHERS_DROPDOWN),
          getServerBaseUrl(),
        ]);

      if (!isMounted.current) return;
      if (base.status === 'fulfilled' && base.value) setServerBase(base.value);

      const extract = (r: PromiseSettledResult<any>) => {
        if (r.status !== 'fulfilled' || !r.value?.data) return [];
        const d = r.value.data;
        return Array.isArray(d) ? d : Array.isArray(d.results) ? d.results : [];
      };

      setPeriods(extract(pRes));
      setSections(extract(secRes));
      setSubjects(extract(subRes));
      setRooms(extract(rRes));
      setGrades(extract(gRes));
      setSchoolYears(extract(syRes));
      setDepartments(extract(dRes));
      setHolidays(extract(hRes));
      setTeachers(extract(tRes).filter((t: any) => t.can_handle_classes !== false));
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void loadAll(false);
    return () => {
      isMounted.current = false;
    };
  }, [loadAll]);

  // Live conflict check for Class Period and Section Adviser
  useEffect(() => {
    if (!modalOpen) return;
    if (
      subTab === 'PERIODS' &&
      periodForm.section &&
      periodForm.teacher &&
      periodForm.start_time &&
      periodForm.end_time
    ) {
      const controller = new AbortController();
      const timer = setTimeout(async () => {
        try {
          const res = await apiClient.get(ENDPOINTS.CHECK_CONFLICT, {
            signal: controller.signal,
            params: {
              type: 'period',
              section_id: periodForm.section,
              teacher_id: periodForm.teacher,
              day_of_week: periodForm.day_of_week,
              start_time: periodForm.start_time,
              end_time: periodForm.end_time,
              ...(editingItem ? { exclude_id: editingItem.id } : {}),
            },
          });
          if (!isMounted.current || controller.signal.aborted) return;
          const d = res.data || {};
          const msgs = [d.time_error, d.section_conflict, d.teacher_conflict, d.room_conflict].filter(
            Boolean
          );
          setConflictWarn(msgs.join(' • '));
        } catch {}
      }, 300);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }

    if (subTab === 'SECTIONS' && (sectionForm.adviser || sectionForm.name.trim())) {
      const controller = new AbortController();
      const timer = setTimeout(async () => {
        try {
          const res = await apiClient.get(ENDPOINTS.CHECK_CONFLICT, {
            signal: controller.signal,
            params: {
              type: 'section',
              grade_level: sectionForm.grade_level || undefined,
              name: sectionForm.name || undefined,
              adviser_id: sectionForm.adviser || undefined,
              room_name: sectionForm.room_name || undefined,
              ...(editingItem ? { exclude_id: editingItem.id } : {}),
            },
          });
          if (!isMounted.current || controller.signal.aborted) return;
          const d = res.data || {};
          const msgs = [d.name_message, d.adviser_conflict?.message, d.room_message].filter(Boolean);
          setConflictWarn(msgs.join(' • '));
        } catch {}
      }, 300);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
    setConflictWarn('');
  }, [modalOpen, subTab, periodForm, sectionForm, editingItem]);

  const openAdd = () => {
    setEditingItem(null);
    setConflictWarn('');
    const currentYr = new Date().getFullYear();

    if (subTab === 'PERIODS') {
      setPeriodForm({
        section: sections[0] ? String(sections[0].id) : '',
        subject: subjects[0] ? String(subjects[0].id) : '',
        teacher: teachers[0] ? String(teachers[0].id) : '',
        day_of_week: 'ALL_WEEKDAYS',
        start_time: '08:00',
        end_time: '09:00',
      });
    } else if (subTab === 'SECTIONS') {
      setSectionForm({
        grade_level: grades[0] ? String(grades[0].id) : '',
        name: '',
        room_name: rooms[0]?.name || '',
        capacity: '45',
        track_strand: '',
        adviser: '',
        allow_multiple_advisories: false,
      });
    } else if (subTab === 'SUBJECTS') {
      setSubjectForm({
        code: '',
        title: '',
        grade_level: grades[0] ? String(grades[0].id) : '',
        subject_category: 'CORE',
        units: '1.0',
      });
    } else if (subTab === 'ROOMS') {
      setRoomForm({
        name: '',
        building: 'Main Building',
        capacity: '45',
        room_type: 'CLASSROOM',
        is_active: true,
      });
    } else if (subTab === 'GRADES') {
      setGradeForm({ level_number: '7', code: 'G7', name: 'Grade 7', stage: 'JHS' });
    } else if (subTab === 'YEARS') {
      setYearForm({
        name: `${currentYr}-${currentYr + 1}`,
        start_date: `${currentYr}-06-15`,
        end_date: `${currentYr + 1}-03-31`,
        is_active: schoolYears.length === 0,
      });
    } else if (subTab === 'DEPARTMENTS') {
      setDeptForm({ code: '', name: '' });
    } else {
      setHolidayForm({
        date: new Date().toISOString().slice(0, 10),
        type: 'HOLIDAY',
        title: '',
      });
    }
    setModalOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setConflictWarn('');
    if (subTab === 'PERIODS') {
      setPeriodForm({
        section: String(item.section || item.section_id || ''),
        subject: String(item.subject || item.subject_id || ''),
        teacher: String(item.teacher || item.teacher_id || ''),
        day_of_week: String(item.day_of_week || 'ALL_WEEKDAYS'),
        start_time: String(item.start_time || '08:00').slice(0, 5),
        end_time: String(item.end_time || '09:00').slice(0, 5),
      });
    } else if (subTab === 'SECTIONS') {
      setSectionForm({
        grade_level: String(item.grade_level || item.grade_level_id || ''),
        name: item.name || '',
        room_name: item.room_name || '',
        capacity: String(item.capacity ?? 45),
        track_strand: item.track_strand || '',
        adviser: item.adviser || item.adviser_id ? String(item.adviser || item.adviser_id) : '',
        allow_multiple_advisories: false,
      });
    } else if (subTab === 'SUBJECTS') {
      setSubjectForm({
        code: item.code || '',
        title: item.title || item.name || '',
        grade_level: item.grade_level ? String(item.grade_level) : '',
        subject_category: item.subject_category || 'CORE',
        units: String(item.units ?? '1.0'),
      });
    } else if (subTab === 'ROOMS') {
      setRoomForm({
        name: item.name || '',
        building: item.building || '',
        capacity: String(item.capacity ?? 45),
        room_type: item.room_type || 'CLASSROOM',
        is_active: item.is_active !== false,
      });
    } else if (subTab === 'GRADES') {
      setGradeForm({
        level_number: String(item.level_number ?? 7),
        code: item.code || '',
        name: item.name || '',
        stage: item.stage || 'JHS',
      });
    } else if (subTab === 'YEARS') {
      setYearForm({
        name: item.name || item.code || '',
        start_date: item.start_date || '',
        end_date: item.end_date || '',
        is_active: Boolean(item.is_active),
      });
    } else if (subTab === 'DEPARTMENTS') {
      setDeptForm({ code: item.code || '', name: item.name || '' });
    } else {
      setHolidayForm({
        date: item.date || '',
        type: item.type || 'HOLIDAY',
        title: item.title || item.reason || '',
      });
    }
    setModalOpen(true);
  };

  const getEndpointForTab = (t: ScheduleSubTab): string => {
    switch (t) {
      case 'PERIODS':
        return ENDPOINTS.PERIODS;
      case 'SECTIONS':
        return ENDPOINTS.SECTIONS;
      case 'SUBJECTS':
        return ENDPOINTS.SUBJECTS;
      case 'ROOMS':
        return ENDPOINTS.ROOMS;
      case 'GRADES':
        return ENDPOINTS.GRADE_LEVELS;
      case 'YEARS':
        return ENDPOINTS.SCHOOL_YEARS;
      case 'DEPARTMENTS':
        return ENDPOINTS.DEPARTMENTS;
      case 'HOLIDAYS':
        return ENDPOINTS.HOLIDAYS;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const endpoint = getEndpointForTab(subTab);
      let payload: Record<string, unknown> = {};

      if (subTab === 'PERIODS') {
        payload = {
          section: Number(periodForm.section),
          subject: Number(periodForm.subject),
          teacher: Number(periodForm.teacher),
          day_of_week: periodForm.day_of_week,
          start_time: periodForm.start_time,
          end_time: periodForm.end_time,
        };
      } else if (subTab === 'SECTIONS') {
        payload = {
          grade_level: Number(sectionForm.grade_level),
          name: cleanText(sectionForm.name, 80),
          room_name: cleanText(sectionForm.room_name, 80),
          capacity: Math.max(5, Math.min(120, Number(sectionForm.capacity) || 45)),
          track_strand: cleanText(sectionForm.track_strand, 80),
          adviser: sectionForm.adviser ? Number(sectionForm.adviser) : null,
          allow_multiple_advisories: sectionForm.allow_multiple_advisories,
        };
      } else if (subTab === 'SUBJECTS') {
        payload = {
          code: cleanText(subjectForm.code, 30).toUpperCase(),
          title: cleanText(subjectForm.title, 150),
          grade_level: subjectForm.grade_level ? Number(subjectForm.grade_level) : null,
          subject_category: subjectForm.subject_category,
          units: Number(subjectForm.units) || 1.0,
        };
      } else if (subTab === 'ROOMS') {
        payload = {
          name: cleanText(roomForm.name, 100),
          building: cleanText(roomForm.building, 100),
          capacity: Math.max(5, Math.min(300, Number(roomForm.capacity) || 45)),
          room_type: roomForm.room_type,
          is_active: roomForm.is_active,
        };
      } else if (subTab === 'GRADES') {
        payload = {
          level_number: Number(gradeForm.level_number) || 7,
          code: cleanText(gradeForm.code, 20),
          name: cleanText(gradeForm.name, 80),
          stage: gradeForm.stage,
        };
      } else if (subTab === 'YEARS') {
        payload = {
          name: cleanText(yearForm.name, 20),
          start_date: yearForm.start_date.trim() || undefined,
          end_date: yearForm.end_date.trim() || undefined,
          is_active: yearForm.is_active,
        };
      } else if (subTab === 'DEPARTMENTS') {
        payload = {
          code: cleanText(deptForm.code, 20).toUpperCase(),
          name: cleanText(deptForm.name, 100),
        };
      } else {
        payload = {
          date: holidayForm.date.trim(),
          type: holidayForm.type,
          title: cleanText(holidayForm.title, 150),
        };
      }

      if (editingItem) {
        await apiClient.patch(`${endpoint}${editingItem.id}/`, payload);
      } else {
        await apiClient.post(endpoint, payload);
      }

      setModalOpen(false);
      showNotice('Saved', 'Academic record updated.');
      await loadAll(true);
    } catch (err: unknown) {
      showNotice('Save Blocked', getFriendlyErrorMessage(err, 'Could not save record.'));
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const handleDelete = (item: any) => {
    const endpoint = getEndpointForTab(subTab);
    const label = item.title || item.name || item.subject_code || item.code || 'this record';
    const run = async () => {
      try {
        await apiClient.delete(`${endpoint}${item.id}/`);
        showNotice('Deleted', `Removed ${label}.`);
        await loadAll(true);
      } catch (err: unknown) {
        showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete item.'));
      }
    };
    confirmAction('Confirm Delete', `Delete ${label}?`, 'Delete', () => void run());
  };

  const rawActiveList = useMemo(() => {
    switch (subTab) {
      case 'PERIODS':
        return periods;
      case 'SECTIONS':
        return sections;
      case 'SUBJECTS':
        return subjects;
      case 'ROOMS':
        return rooms;
      case 'GRADES':
        return grades;
      case 'YEARS':
        return schoolYears;
      case 'DEPARTMENTS':
        return departments;
      case 'HOLIDAYS':
        return holidays;
    }
  }, [subTab, periods, sections, subjects, rooms, grades, schoolYears, departments, holidays]);

  const activeList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawActiveList;
    return rawActiveList.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
  }, [rawActiveList, searchQuery]);

  const tabMeta: Array<{ key: ScheduleSubTab; label: string; addLabel: string }> = [
    { key: 'PERIODS', label: `Periods (${periods.length})`, addLabel: 'Class Period' },
    { key: 'SECTIONS', label: `Sections (${sections.length})`, addLabel: 'Section' },
    { key: 'SUBJECTS', label: `Subjects (${subjects.length})`, addLabel: 'Subject' },
    { key: 'ROOMS', label: `Rooms (${rooms.length})`, addLabel: 'Classroom' },
    { key: 'GRADES', label: `Grades (${grades.length})`, addLabel: 'Grade Level' },
    { key: 'YEARS', label: `School Years (${schoolYears.length})`, addLabel: 'School Year' },
    { key: 'DEPARTMENTS', label: `Departments (${departments.length})`, addLabel: 'Department' },
    { key: 'HOLIDAYS', label: `Holidays (${holidays.length})`, addLabel: 'Holiday / Event' },
  ];

  const currentTabInfo = tabMeta.find((t) => t.key === subTab) || tabMeta[0];

  return (
    <View style={styles.container}>
      {/* Horizontal 8-Tab Academic Setup Bar */}
      <ChipRow<ScheduleSubTab>
        variant="tab"
        options={tabMeta}
        selected={subTab}
        onSelect={(key) => {
          setSubTab(key);
          setSearchQuery('');
        }}
        style={styles.tabStrip}
        contentContainerStyle={styles.tabRow}
      />

      {/* Search + Add Bar */}
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={palette.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Filter ${currentTabInfo.addLabel.toLowerCase()}s...`}
            placeholderTextColor={palette.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        {allowCrud && (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={16} color={palette.onPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.mutedText}>Loading academic setup...</Text>
        </View>
      ) : (
        <FlatList
          data={activeList}
          keyExtractor={(item) => `${subTab}-${item.id}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadAll(true);
              }}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.mutedText}>No records found in {currentTabInfo.addLabel}s.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ScheduleListItemCard
              subTab={subTab}
              item={item}
              serverBase={serverBase}
              allowCrud={allowCrud}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          )}
        />
      )}

      {/* Universal Add / Edit Academic Setup Modal */}
      <ScheduleFormModal
        visible={modalOpen}
        subTab={subTab}
        addLabel={currentTabInfo.addLabel}
        isEditing={Boolean(editingItem)}
        saving={saving}
        conflictWarn={conflictWarn}
        sections={sections}
        subjects={subjects}
        teachers={teachers}
        grades={grades}
        rooms={rooms}
        periodForm={periodForm}
        setPeriodForm={setPeriodForm}
        sectionForm={sectionForm}
        setSectionForm={setSectionForm}
        subjectForm={subjectForm}
        setSubjectForm={setSubjectForm}
        roomForm={roomForm}
        setRoomForm={setRoomForm}
        gradeForm={gradeForm}
        setGradeForm={setGradeForm}
        yearForm={yearForm}
        setYearForm={setYearForm}
        deptForm={deptForm}
        setDeptForm={setDeptForm}
        holidayForm={holidayForm}
        setHolidayForm={setHolidayForm}
        onClose={() => setModalOpen(false)}
        onSave={() => void handleSave()}
      />
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    tabStrip: { flexGrow: 0, maxHeight: 50, marginTop: 10 },
    tabRow: { paddingHorizontal: 14, gap: 6, alignItems: 'center' },
    toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
    searchWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: palette.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      paddingHorizontal: 10,
      height: 40,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: palette.buttonBg,
      borderRadius: 10,
      paddingHorizontal: 14,
      height: 40,
    },
    addBtnText: { color: palette.onPrimary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    listContent: { padding: 14, paddingBottom: 120, gap: 10 },
    centerBox: { paddingVertical: 40, alignItems: 'center', gap: 8 },
    mutedText: { fontSize: fonts.sm, color: palette.textMuted },
  });

export default SchedulesScreen;
