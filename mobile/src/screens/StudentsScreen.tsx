/**
 * AttendSure Mobile - Students Directory & Full CRUD (100% Web Parity)
 * File: mobile/src/screens/StudentsScreen.tsx
 *
 * Full parity with web StudentsTab: portrait photos, 3-tab DepEd SF1 form
 * (Basic Info, Address & Family, DepEd SF1 Profile), live LRN uniqueness check,
 * live metrics bar, section & enrollment status filters, and Student QR ID Pass.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  QR_COLORS,
  type ThemePalette,
} from '../constants/theme';
import { canDeleteStudents, canManageStudents } from '../utils/permissions';
import { confirmAction, resolveMediaUrl, showNotice } from '../utils/helpers';
import { useMobileFieldCheck } from '../hooks/useMobileFieldCheck';
import { getServerBaseUrl } from '../services/configService';
import ImageUploadField from '../components/common/ImageUploadField';
import ChipRow from '../components/common/ChipRow';

interface StudentRow {
  id: number;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name?: string;
  gender: string;
  birth_date?: string;
  mother_tongue?: string;
  ethnic_group?: string;
  religion?: string;
  house_street_sitio?: string;
  barangay?: string;
  municipality_city?: string;
  province?: string;
  father_name?: string;
  mother_maiden_name?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  guardian_contact?: string;
  photo?: string | null;
  photo_url?: string | null;
  current_section?: string;
  current_section_id?: number | null;
  grade_level_name?: string;
  section_display_label?: string;
  enrollment_status?: string;
  scheduled_subjects_count?: number;
  qr_payload?: string;
}

interface SectionOption {
  id: number;
  name: string;
  grade_level?: number;
  grade_level_name?: string;
  adviser_id?: number | null;
  adviser?: number | null;
  scheduled_subjects_count?: number;
}

type FormTab = 'BASIC' | 'FAMILY' | 'SF1';

const ENROLLMENT_STATUSES = [
  { key: 'ENROLLED', label: 'Enrolled' },
  { key: 'TRANSFERRED_IN', label: 'Transferred In' },
  { key: 'TRANSFERRED_OUT', label: 'Transferred Out' },
  { key: 'DROPPED', label: 'Dropped' },
] as const;

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Relative'] as const;

export const StudentsScreen: React.FC = () => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [serverBase, setServerBase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<number | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [formTab, setFormTab] = useState<FormTab>('BASIC');
  const [editingStudent, setEditingStudent] = useState<StudentRow | null>(null);
  const [detailStudent, setDetailStudent] = useState<StudentRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);

  const [form, setForm] = useState({
    lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    gender: 'Male',
    birth_date: '',
    section_id: '' as string,
    enrollment_status: 'ENROLLED',
    house_street_sitio: '',
    barangay: '',
    municipality_city: '',
    province: '',
    father_name: '',
    mother_maiden_name: '',
    guardian_name: '',
    guardian_relationship: 'Mother',
    guardian_contact: '',
    mother_tongue: 'Cebuano',
    ethnic_group: '',
    religion: '',
  });

  const isMounted = useRef(true);

  const advisedSectionIds = useMemo(() => {
    const tid = Number(user?.teacher_id || 0);
    if (!tid) return [];
    return sections
      .filter((s) => Number(s.adviser_id ?? s.adviser ?? 0) === tid)
      .map((s) => s.id);
  }, [sections, user?.teacher_id]);

  const allowCreate = canManageStudents(user, advisedSectionIds);
  const allowDelete = canDeleteStudents(user);

  const loadData = useCallback(async (silent = false) => {
    if (!silent && isMounted.current) setLoading(true);
    try {
      const [stuRes, secRes, base] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.STUDENTS, { params: { page_size: 250 } }),
        apiClient.get(ENDPOINTS.SECTIONS, { params: { page_size: 200 } }),
        getServerBaseUrl(),
      ]);

      if (!isMounted.current) return;

      if (base.status === 'fulfilled' && base.value) {
        setServerBase(base.value);
      }

      if (stuRes.status === 'fulfilled' && stuRes.value?.data) {
        const raw = stuRes.value.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw.results) ? raw.results : [];
        setStudents(list);
      }

      if (secRes.status === 'fulfilled' && secRes.value?.data) {
        const raw = secRes.value.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw.results) ? raw.results : [];
        setSections(list);
      }
    } catch {
      // Keep existing list offline
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void loadData(false);
    return () => {
      isMounted.current = false;
    };
  }, [loadData]);

  // Live LRN uniqueness check
  const lrnDigits = form.lrn.replace(/\D/g, '');
  const lrnCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'lrn',
    value: lrnDigits,
    minLength: 12,
    formatError:
      lrnDigits.length > 0 && lrnDigits.length !== 12
        ? 'LRN must be exactly 12 digits.'
        : undefined,
    fallbackMessage: 'LRN is already registered.',
    excludeId: editingStudent?.id,
  });

  const openAddModal = () => {
    setEditingStudent(null);
    setFormTab('BASIC');
    setPhotoBase64(null);
    setPhotoPreview(null);
    setPhotoRemoved(false);

    const defaultSecId =
      advisedSectionIds.length > 0
        ? String(advisedSectionIds[0])
        : sections.length > 0
          ? String(sections[0].id)
          : '';
    setForm({
      lrn: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      gender: 'Male',
      birth_date: '2012-01-15',
      section_id: defaultSecId,
      enrollment_status: 'ENROLLED',
      house_street_sitio: '',
      barangay: '',
      municipality_city: '',
      province: '',
      father_name: '',
      mother_maiden_name: '',
      guardian_name: '',
      guardian_relationship: 'Mother',
      guardian_contact: '',
      mother_tongue: 'Cebuano',
      ethnic_group: '',
      religion: '',
    });
    setModalOpen(true);
  };

  const openEditModal = (stu: StudentRow) => {
    setEditingStudent(stu);
    setFormTab('BASIC');
    setPhotoBase64(null);
    setPhotoPreview(stu.photo_url || stu.photo || null);
    setPhotoRemoved(false);

    setForm({
      lrn: stu.lrn || '',
      first_name: stu.first_name || '',
      middle_name: stu.middle_name || '',
      last_name: stu.last_name || '',
      suffix: stu.suffix || '',
      gender: stu.gender || 'Male',
      birth_date: stu.birth_date || '',
      section_id: stu.current_section_id ? String(stu.current_section_id) : '',
      enrollment_status:
        stu.enrollment_status && stu.enrollment_status !== 'UNASSIGNED'
          ? stu.enrollment_status
          : 'ENROLLED',
      house_street_sitio: stu.house_street_sitio || '',
      barangay: stu.barangay || '',
      municipality_city: stu.municipality_city || '',
      province: stu.province || '',
      father_name: stu.father_name || '',
      mother_maiden_name: stu.mother_maiden_name || '',
      guardian_name: stu.guardian_name || '',
      guardian_relationship: stu.guardian_relationship || 'Mother',
      guardian_contact: stu.guardian_contact || '',
      mother_tongue: stu.mother_tongue || '',
      ethnic_group: stu.ethnic_group || '',
      religion: stu.religion || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const cleanLrn = form.lrn.replace(/\D/g, '');
    if (cleanLrn.length !== 12) {
      setFormTab('BASIC');
      showNotice('Invalid LRN', 'Please enter a valid 12-digit DepEd LRN.');
      return;
    }
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setFormTab('BASIC');
      showNotice('Missing Name', 'First name and last name are required.');
      return;
    }
    if (!editingStudent && !form.birth_date.trim()) {
      setFormTab('BASIC');
      showNotice('Birth Date Required', 'Please enter the student birth date (YYYY-MM-DD).');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        lrn: cleanLrn,
        first_name: cleanText(form.first_name, 80),
        middle_name: cleanText(form.middle_name, 80),
        last_name: cleanText(form.last_name, 80),
        suffix: cleanText(form.suffix, 20),
        gender: form.gender,
        birth_date: form.birth_date.trim() || undefined,
        section_id: form.section_id ? Number(form.section_id) : null,
        enrollment_status: form.enrollment_status || 'ENROLLED',
        house_street_sitio: cleanText(form.house_street_sitio, 160),
        barangay: cleanText(form.barangay, 100),
        municipality_city: cleanText(form.municipality_city, 100),
        province: cleanText(form.province, 100),
        father_name: cleanText(form.father_name, 120),
        mother_maiden_name: cleanText(form.mother_maiden_name, 120),
        guardian_name: cleanText(form.guardian_name, 120),
        guardian_relationship: cleanText(form.guardian_relationship, 60),
        guardian_contact: cleanText(form.guardian_contact, 30),
        mother_tongue: cleanText(form.mother_tongue, 80),
        ethnic_group: cleanText(form.ethnic_group, 80),
        religion: cleanText(form.religion, 80),
      };

      if (photoRemoved) {
        payload.photo = null;
        payload.remove_photo = true;
      } else if (photoBase64) {
        payload.photo = photoBase64;
      }

      if (editingStudent) {
        await apiClient.patch(`${ENDPOINTS.STUDENTS}${editingStudent.id}/`, payload);
        showNotice('Updated', 'Student record updated successfully.');
      } else {
        await apiClient.post(ENDPOINTS.STUDENTS, payload);
        showNotice('Added', 'Student added and enrolled into their section class lists.');
      }
      setModalOpen(false);
      await loadData(true);
    } catch (err: unknown) {
      showNotice('Save Failed', getFriendlyErrorMessage(err, 'Could not save student record.'));
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const handleDelete = (stu: StudentRow) => {
    const name = stu.full_name || `${stu.first_name} ${stu.last_name}`.trim();
    const runDelete = async () => {
      try {
        await apiClient.delete(`${ENDPOINTS.STUDENTS}${stu.id}/`);
        showNotice('Deleted', `${name} was removed.`);
        setDetailStudent(null);
        await loadData(true);
      } catch (err: unknown) {
        showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete student.'));
      }
    };

    confirmAction(
      'Delete Student',
      `Delete ${name} (${stu.lrn})? This cannot be undone.`,
      'Delete',
      () => void runDelete()
    );
  };

  const metrics = useMemo(() => {
    const male = students.filter((s) => String(s.gender).toLowerCase() === 'male').length;
    const female = students.filter((s) => String(s.gender).toLowerCase() === 'female').length;
    return { total: students.length, male, female, sections: sections.length };
  }, [students, sections]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (
        selectedSectionFilter !== 'ALL' &&
        Number(s.current_section_id) !== selectedSectionFilter
      ) {
        return false;
      }
      if (statusFilter !== 'ALL' && String(s.enrollment_status || 'ENROLLED') !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${s.first_name} ${s.middle_name || ''} ${s.last_name} ${s.full_name || ''} ${s.lrn || ''} ${s.section_display_label || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [students, searchQuery, selectedSectionFilter, statusFilter]);

  const selectableSectionsForForm = useMemo(() => {
    if (canDeleteStudents(user)) return sections;
    if (advisedSectionIds.length > 0) {
      return sections.filter((s) => advisedSectionIds.includes(s.id));
    }
    return sections;
  }, [sections, user, advisedSectionIds]);

  const selectedFormSection = useMemo(
    () => sections.find((s) => String(s.id) === form.section_id) || null,
    [sections, form.section_id]
  );

  return (
    <View style={styles.container}>
      {/* Live Student Metrics Bar */}
      <View style={styles.metricsBar}>
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>{metrics.total}</Text>
          <Text style={styles.metricLabel}>Students</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>{metrics.male}</Text>
          <Text style={styles.metricLabel}>Male</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>{metrics.female}</Text>
          <Text style={styles.metricLabel}>Female</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>{metrics.sections}</Text>
          <Text style={styles.metricLabel}>Sections</Text>
        </View>
      </View>

      {/* Search + Add Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={palette.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search student name or 12-digit LRN..."
            placeholderTextColor={palette.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={palette.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {allowCreate && (
          <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.85}>
            <Ionicons name="person-add-outline" size={16} color={palette.onPrimary} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Section Filter Strip */}
      <ChipRow<number | 'ALL'>
        options={[
          { key: 'ALL', label: `All Sections (${students.length})` },
          ...sections.map((sec) => ({
            key: sec.id,
            label: sec.grade_level_name ? `${sec.grade_level_name} - ${sec.name}` : sec.name,
          })),
        ]}
        selected={selectedSectionFilter}
        onSelect={setSelectedSectionFilter}
        style={styles.filterStrip}
        contentContainerStyle={styles.filterRow}
      />

      {/* Enrollment Status Filter Strip */}
      <ChipRow
        options={[
          { key: 'ALL', label: 'All Statuses' },
          ...ENROLLMENT_STATUSES.map((st) => ({ key: st.key, label: st.label })),
        ]}
        selected={statusFilter}
        onSelect={setStatusFilter}
        style={styles.statusStrip}
        contentContainerStyle={styles.filterRow}
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.mutedText}>Loading students...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadData(true);
              }}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.mutedText}>No students matched your filter.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const fullName = item.full_name || `${item.last_name}, ${item.first_name}`;
            const canEditThis = canManageStudents(user, advisedSectionIds, item.current_section_id);
            const avatarUri = resolveMediaUrl(item.photo_url || item.photo, serverBase);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => setDetailStudent(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.avatarBox}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
                    ) : (
                      <Ionicons name="person" size={20} color={palette.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText} numberOfLines={1}>
                      {fullName}
                    </Text>
                    <Text style={styles.metaText}>
                      LRN: {item.lrn} &bull; {item.gender}
                    </Text>
                    <Text style={styles.secText}>
                      {item.section_display_label || item.current_section || 'Unassigned Section'}
                      {item.enrollment_status && item.enrollment_status !== 'ENROLLED'
                        ? ` • ${item.enrollment_status.replace(/_/g, ' ')}`
                        : ''}
                    </Text>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => setDetailStudent(item)}
                      accessibilityLabel="View Student QR ID"
                    >
                      <Ionicons name="qr-code-outline" size={16} color={palette.primary} />
                    </TouchableOpacity>
                    {canEditThis && (
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => openEditModal(item)}
                        accessibilityLabel="Edit Student"
                      >
                        <Ionicons name="create-outline" size={16} color={palette.primary} />
                      </TouchableOpacity>
                    )}
                    {allowDelete && (
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: palette.dangerLight }]}
                        onPress={() => handleDelete(item)}
                        accessibilityLabel="Delete Student"
                      >
                        <Ionicons name="trash-outline" size={16} color={palette.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                {item.guardian_name || item.guardian_contact ? (
                  <Text style={styles.guardianText}>
                    Guardian: {item.guardian_name || '—'}
                    {item.guardian_relationship ? ` (${item.guardian_relationship})` : ''}{' '}
                    {item.guardian_contact ? `• ${item.guardian_contact}` : ''}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* 3-Tab Add / Edit Student Modal (Matches Web StudentsTab 100%) */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStudent ? 'Edit Student Profile' : 'Add New Student'}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </TouchableOpacity>
            </View>

            {/* 3 Form Tabs */}
            <View style={styles.formTabBar}>
              {(
                [
                  { key: 'BASIC', label: '1. Basic Info' },
                  { key: 'FAMILY', label: '2. Address & Family' },
                  { key: 'SF1', label: '3. DepEd SF1' },
                ] as const
              ).map((t) => {
                const active = formTab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.formTabBtn, active && styles.formTabBtnActive]}
                    onPress={() => setFormTab(t.key)}
                  >
                    <Text style={[styles.formTabText, active && styles.formTabTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingBottom: 18 }}
            >
              {formTab === 'BASIC' && (
                <>
                  <ImageUploadField
                    label="Student Portrait Photo"
                    helperText="Shown on class lists, ID passes, and attendance scans."
                    value={photoRemoved ? null : photoBase64 || photoPreview}
                    serverBase={serverBase}
                    variant="avatar"
                    onChange={(dataUrl) => {
                      setPhotoBase64(dataUrl);
                      setPhotoPreview(dataUrl);
                      setPhotoRemoved(false);
                    }}
                    onRemove={() => {
                      setPhotoBase64(null);
                      setPhotoPreview(null);
                      setPhotoRemoved(true);
                    }}
                  />

                  <Text style={styles.inputLabel}>12-Digit DepEd LRN *</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={12}
                    value={form.lrn}
                    onChangeText={(v) => setForm((p) => ({ ...p, lrn: v.replace(/\D/g, '') }))}
                    placeholder="12-digit LRN"
                    placeholderTextColor={palette.textMuted}
                  />
                  {lrnCheck.warning ? <Text style={styles.warnText}>{lrnCheck.warning}</Text> : null}

                  <Text style={styles.inputLabel}>First Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.first_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, first_name: v }))}
                    placeholder="First name"
                    placeholderTextColor={palette.textMuted}
                  />

                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Middle Name</Text>
                      <TextInput
                        style={styles.input}
                        value={form.middle_name}
                        onChangeText={(v) => setForm((p) => ({ ...p, middle_name: v }))}
                        placeholder="Optional"
                        placeholderTextColor={palette.textMuted}
                      />
                    </View>
                    <View style={{ width: 92 }}>
                      <Text style={styles.inputLabel}>Suffix</Text>
                      <TextInput
                        style={styles.input}
                        value={form.suffix}
                        onChangeText={(v) => setForm((p) => ({ ...p, suffix: v }))}
                        placeholder="Jr. / III"
                        placeholderTextColor={palette.textMuted}
                      />
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Last Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={form.last_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, last_name: v }))}
                    placeholder="Last name"
                    placeholderTextColor={palette.textMuted}
                  />

                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Sex *</Text>
                      <View style={styles.rowChips}>
                        {['Male', 'Female'].map((g) => (
                          <TouchableOpacity
                            key={g}
                            style={[styles.chip, { flex: 1, alignItems: 'center' }, form.gender === g && styles.chipActive]}
                            onPress={() => setForm((p) => ({ ...p, gender: g }))}
                          >
                            <Text style={[styles.chipText, form.gender === g && styles.chipTextActive]}>
                              {g}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Birth Date *</Text>
                      <TextInput
                        style={styles.input}
                        value={form.birth_date}
                        onChangeText={(v) => setForm((p) => ({ ...p, birth_date: v }))}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={palette.textMuted}
                      />
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Section / Homeroom Assignment</Text>
                  <ChipRow
                    options={selectableSectionsForForm.map((sec) => ({
                      key: String(sec.id),
                      label: sec.grade_level_name ? `${sec.grade_level_name} - ${sec.name}` : sec.name,
                    }))}
                    selected={form.section_id}
                    onSelect={(sectionId) => setForm((p) => ({ ...p, section_id: sectionId }))}
                  />
                  {selectedFormSection && (
                    <Text style={styles.infoNote}>
                      Enrolling in this section automatically inherits its{' '}
                      {selectedFormSection.scheduled_subjects_count ?? 0} scheduled class period(s).
                    </Text>
                  )}

                  <Text style={styles.inputLabel}>Enrollment Status</Text>
                  <ChipRow
                    wrap
                    options={ENROLLMENT_STATUSES.map((st) => ({ key: st.key, label: st.label }))}
                    selected={form.enrollment_status}
                    onSelect={(status) => setForm((p) => ({ ...p, enrollment_status: status }))}
                  />
                </>
              )}

              {formTab === 'FAMILY' && (
                <>
                  <Text style={styles.inputLabel}>House # / Street / Sitio / Purok</Text>
                  <TextInput
                    style={styles.input}
                    value={form.house_street_sitio}
                    onChangeText={(v) => setForm((p) => ({ ...p, house_street_sitio: v }))}
                    placeholder="e.g. Purok 4, Zone 2"
                    placeholderTextColor={palette.textMuted}
                  />

                  <Text style={styles.inputLabel}>Barangay</Text>
                  <TextInput
                    style={styles.input}
                    value={form.barangay}
                    onChangeText={(v) => setForm((p) => ({ ...p, barangay: v }))}
                    placeholder="Barangay"
                    placeholderTextColor={palette.textMuted}
                  />

                  <View style={styles.twoCol}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Municipality / City</Text>
                      <TextInput
                        style={styles.input}
                        value={form.municipality_city}
                        onChangeText={(v) => setForm((p) => ({ ...p, municipality_city: v }))}
                        placeholder="City / Municipality"
                        placeholderTextColor={palette.textMuted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Province</Text>
                      <TextInput
                        style={styles.input}
                        value={form.province}
                        onChangeText={(v) => setForm((p) => ({ ...p, province: v }))}
                        placeholder="Province"
                        placeholderTextColor={palette.textMuted}
                      />
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Father&apos;s Full Name</Text>
                  <TextInput
                    style={styles.input}
                    value={form.father_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, father_name: v }))}
                    placeholder="Last Name, First Name, Middle Name"
                    placeholderTextColor={palette.textMuted}
                  />

                  <Text style={styles.inputLabel}>Mother&apos;s Maiden Name</Text>
                  <TextInput
                    style={styles.input}
                    value={form.mother_maiden_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, mother_maiden_name: v }))}
                    placeholder="Last Name, First Name, Middle Name"
                    placeholderTextColor={palette.textMuted}
                  />

                  <Text style={styles.inputLabel}>Guardian Name</Text>
                  <TextInput
                    style={styles.input}
                    value={form.guardian_name}
                    onChangeText={(v) => setForm((p) => ({ ...p, guardian_name: v }))}
                    placeholder="Parent or guardian name"
                    placeholderTextColor={palette.textMuted}
                  />

                  <Text style={styles.inputLabel}>Guardian Relationship</Text>
                  <ChipRow
                    wrap
                    options={RELATIONSHIPS.map((rel) => ({ key: rel, label: rel }))}
                    selected={form.guardian_relationship}
                    onSelect={(rel) => setForm((p) => ({ ...p, guardian_relationship: rel }))}
                  />

                  <Text style={styles.inputLabel}>Parent / Guardian Contact Number</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="phone-pad"
                    value={form.guardian_contact}
                    onChangeText={(v) => setForm((p) => ({ ...p, guardian_contact: v }))}
                    placeholder="09XXXXXXXXX"
                    placeholderTextColor={palette.textMuted}
                  />
                </>
              )}

              {formTab === 'SF1' && (
                <>
                  <Text style={styles.inputLabel}>Mother Tongue</Text>
                  <TextInput
                    style={styles.input}
                    value={form.mother_tongue}
                    onChangeText={(v) => setForm((p) => ({ ...p, mother_tongue: v }))}
                    placeholder="e.g. Cebuano, Tagalog, Hiligaynon"
                    placeholderTextColor={palette.textMuted}
                  />

                  <Text style={styles.inputLabel}>IP / Ethnic Group</Text>
                  <TextInput
                    style={styles.input}
                    value={form.ethnic_group}
                    onChangeText={(v) => setForm((p) => ({ ...p, ethnic_group: v }))}
                    placeholder="e.g. Higaonon (optional)"
                    placeholderTextColor={palette.textMuted}
                  />

                  <Text style={styles.inputLabel}>Religion</Text>
                  <TextInput
                    style={styles.input}
                    value={form.religion}
                    onChangeText={(v) => setForm((p) => ({ ...p, religion: v }))}
                    placeholder="e.g. Roman Catholic, Islam, Protestant"
                    placeholderTextColor={palette.textMuted}
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={() => void handleSave()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingStudent ? 'Save Student Changes' : 'Add Student'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Student Detail & QR ID Pass Modal */}
      <Modal
        visible={Boolean(detailStudent)}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailStudent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Student Profile &amp; QR ID Pass</Text>
              <TouchableOpacity onPress={() => setDetailStudent(null)}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </TouchableOpacity>
            </View>
            {detailStudent && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}
              >
                <View style={styles.detailAvatar}>
                  {resolveMediaUrl(detailStudent.photo_url || detailStudent.photo, serverBase) ? (
                    <Image
                      source={{
                        uri: resolveMediaUrl(detailStudent.photo_url || detailStudent.photo, serverBase)!,
                      }}
                      style={styles.avatarImg}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons name="person" size={34} color={palette.primary} />
                  )}
                </View>

                <Text style={[styles.nameText, { textAlign: 'center', fontSize: fonts.lg }]}>
                  {detailStudent.full_name ||
                    `${detailStudent.first_name} ${detailStudent.last_name}`}
                </Text>
                <Text style={styles.metaText}>
                  LRN: {detailStudent.lrn} &bull; {detailStudent.gender} &bull;{' '}
                  {detailStudent.section_display_label ||
                    detailStudent.current_section ||
                    'Unassigned'}
                </Text>

                <View style={styles.qrFrame}>
                  <QRCode
                    value={detailStudent.qr_payload || detailStudent.lrn}
                    size={164}
                    color={QR_COLORS.foreground}
                    backgroundColor={QR_COLORS.background}
                  />
                </View>

                <View style={styles.detailBox}>
                  {[
                    ['Birth Date', detailStudent.birth_date || '—'],
                    [
                      'Address',
                      [
                        detailStudent.house_street_sitio,
                        detailStudent.barangay,
                        detailStudent.municipality_city,
                        detailStudent.province,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—',
                    ],
                    ['Father', detailStudent.father_name || '—'],
                    ['Mother', detailStudent.mother_maiden_name || '—'],
                    [
                      'Guardian',
                      detailStudent.guardian_name
                        ? `${detailStudent.guardian_name} (${detailStudent.guardian_relationship || 'Guardian'})`
                        : '—',
                    ],
                    ['Guardian Contact', detailStudent.guardian_contact || '—'],
                    ['Mother Tongue', detailStudent.mother_tongue || '—'],
                    ['Religion / Ethnic Group', [detailStudent.religion, detailStudent.ethnic_group].filter(Boolean).join(' • ') || '—'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.detailRow}>
                      <Text style={styles.detailKey}>{k}</Text>
                      <Text style={styles.detailVal}>{v}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, { width: '100%' }]}
                  onPress={() => setDetailStudent(null)}
                >
                  <Text style={styles.saveBtnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    metricsBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 14,
      marginTop: 10,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    metricCell: { flex: 1, alignItems: 'center' },
    metricDivider: { width: 1, height: 24, backgroundColor: palette.border },
    metricValue: { fontSize: fonts.md, fontWeight: fonts.weight.black, color: palette.primary },
    metricLabel: { fontSize: fonts.xxs, color: palette.textMuted, fontWeight: fonts.weight.bold },
    toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
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
      height: 42,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: palette.buttonBg,
      paddingHorizontal: 14,
      borderRadius: 10,
      height: 42,
      justifyContent: 'center',
    },
    addBtnText: { color: palette.onPrimary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    filterStrip: { flexGrow: 0, maxHeight: 38 },
    statusStrip: { flexGrow: 0, maxHeight: 34, marginTop: 4 },
    filterRow: { paddingHorizontal: 14, gap: 6, alignItems: 'center' },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: 8,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    chipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    chipTextActive: { color: palette.onPrimary },
    miniChip: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 99,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    miniChipActive: { backgroundColor: palette.primarySoft, borderColor: palette.primary },
    miniChipText: { fontSize: fonts.xxs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    miniChipTextActive: { color: palette.primary },
    rowChips: { flexDirection: 'row', gap: 6 },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    twoCol: { flexDirection: 'row', gap: 8 },
    listContent: { padding: 14, paddingBottom: 120, gap: 10 },
    centerBox: { paddingVertical: 40, alignItems: 'center', gap: 8 },
    mutedText: { fontSize: fonts.sm, color: palette.textMuted },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 6,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
    },
    avatarImg: { width: '100%', height: '100%' },
    detailAvatar: {
      width: 74,
      height: 74,
      borderRadius: 37,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: palette.primary,
    },
    nameText: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    metaText: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    secText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary, marginTop: 1 },
    guardianText: { fontSize: fonts.xs, color: palette.textMuted },
    cardActions: { flexDirection: 'row', gap: 5 },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    formTabBar: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 10,
      backgroundColor: palette.surfaceSubtle,
      padding: 4,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
    },
    formTabBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
    },
    formTabBtnActive: { backgroundColor: palette.buttonBg },
    formTabText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary },
    formTabTextActive: { color: palette.onPrimary },
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
    warnText: { fontSize: fonts.xs, color: palette.danger, fontWeight: fonts.weight.bold },
    infoNote: { fontSize: fonts.xxs, color: palette.primary, fontWeight: fonts.weight.bold },
    saveBtn: {
      backgroundColor: palette.buttonBg,
      borderRadius: 10,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
    qrFrame: {
      backgroundColor: QR_COLORS.background,
      padding: 12,
      borderRadius: 12,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    detailBox: {
      width: '100%',
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 6,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    detailKey: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    detailVal: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.semibold,
      color: palette.textPrimary,
      flex: 1,
      textAlign: 'right',
    },
  });

export default StudentsScreen;
