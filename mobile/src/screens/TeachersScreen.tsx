// AttendSure Mobile - Teachers Screen
// File: D:\AttendSure_V3\mobile\src\screens\TeachersScreen.tsx

/**
 * AttendSure Mobile - Teachers & Staff Directory + Full CRUD (100% Web Parity)
 * File: mobile/src/screens/TeachersScreen.tsx
 *
 * Full parity with web TeachersTab: portrait photos, department & position chips,
 * suffix, active status switch, live duplicate field validation (employee_id,
 * email, contact_number), status/teaching/bound-phone filters, and inspection modal.
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
  Switch,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
import { canManageTeachers, canResetBoundDevice } from '../utils/permissions';
import { confirmAction, resolveMediaUrl, showNotice } from '../utils/helpers';
import { useMobileFieldCheck } from '../hooks/useMobileFieldCheck';
import { getServerBaseUrl } from '../services/configService';
import ImageUploadField from '../components/common/ImageUploadField';
import ChipRow from '../components/common/ChipRow';

interface TeacherRow {
  id: number;
  username?: string;
  employee_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  position?: string;
  department?: string;
  role?: string;
  photo?: string | null;
  photo_url?: string | null;
  can_handle_classes?: boolean;
  is_active?: boolean;
  bound_device_id?: string | null;
  device_model?: string | null;
  device_bound_at?: string | null;
}

interface DepartmentOption {
  id: number;
  code: string;
  name: string;
}

const POSITION_PRESETS = [
  'Teacher I',
  'Teacher II',
  'Teacher III',
  'Master Teacher I',
  'Master Teacher II',
  'Head Teacher I',
  'School Principal',
  'Administrative Officer',
] as const;

type FilterType = 'ALL' | 'ACTIVE' | 'TEACHING' | 'NON_TEACHING' | 'BOUND_PHONE';

export const TeachersScreen: React.FC = () => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const allowCrud = canManageTeachers(user);
  const allowResetPhone = canResetBoundDevice(user);

  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [serverBase, setServerBase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterType>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [inspectTeacher, setInspectTeacher] = useState<TeacherRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);

  const [form, setForm] = useState({
    employee_id: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    email: '',
    contact_number: '',
    position: 'Teacher I',
    department: 'General Education',
    can_handle_classes: true,
    is_active: true,
  });

  const isMounted = useRef(true);

  const loadTeachers = useCallback(async (silent = false) => {
    if (!silent && isMounted.current) setLoading(true);
    try {
      const [tRes, dRes, base] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.TEACHERS, { params: { page_size: 200 } }),
        apiClient.get(ENDPOINTS.DEPARTMENTS, { params: { page_size: 100 } }),
        getServerBaseUrl(),
      ]);
      if (!isMounted.current) return;
      if (base.status === 'fulfilled' && base.value) setServerBase(base.value);

      if (tRes.status === 'fulfilled' && tRes.value?.data) {
        const raw = tRes.value.data;
        setTeachers(Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []);
      }
      if (dRes.status === 'fulfilled' && dRes.value?.data) {
        const raw = dRes.value.data;
        setDepartments(Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []);
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
    void loadTeachers(false);
    return () => {
      isMounted.current = false;
    };
  }, [loadTeachers]);

  // Live duplicate checks for Employee ID, Email, Contact Number
  const employeeIdCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'employee_id',
    value: form.employee_id,
    excludeId: editing?.id,
    excludeTeacherId: editing?.id,
  });
  const emailCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'email',
    value: form.email,
    excludeId: editing?.id,
    excludeTeacherId: editing?.id,
  });
  const contactCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'contact_number',
    value: form.contact_number,
    minDigits: 10,
    excludeId: editing?.id,
    excludeTeacherId: editing?.id,
  });

  const openAdd = () => {
    setEditing(null);
    setPhotoBase64(null);
    setPhotoPreview(null);
    setPhotoRemoved(false);
    setForm({
      employee_id: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      email: '',
      contact_number: '',
      position: 'Teacher I',
      department: departments[0]?.name || 'General Education',
      can_handle_classes: true,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (t: TeacherRow) => {
    setEditing(t);
    setPhotoBase64(null);
    setPhotoPreview(t.photo_url || t.photo || null);
    setPhotoRemoved(false);
    setForm({
      employee_id: t.employee_id || '',
      first_name: t.first_name || '',
      middle_name: t.middle_name || '',
      last_name: t.last_name || '',
      suffix: t.suffix || '',
      email: t.email || '',
      contact_number: t.contact_number || '',
      position: t.position || 'Teacher I',
      department: t.department || '',
      can_handle_classes: t.can_handle_classes !== false,
      is_active: t.is_active !== false,
    });
    setModalOpen(true);
  };

  const isCheckingFields =
    employeeIdCheck.checking || emailCheck.checking || contactCheck.checking;
  const hasFieldConflict = employeeIdCheck.isTaken || emailCheck.isTaken || contactCheck.isTaken;

  const handleSave = async () => {
    if (isCheckingFields) {
      showNotice('Checking Details', 'Please wait a moment while we verify your entries.');
      return;
    }
    if (hasFieldConflict) {
      showNotice(
        'Duplicate Field',
        employeeIdCheck.warning || emailCheck.warning || contactCheck.warning || 'Please fix duplicate fields before saving.'
      );
      return;
    }
    if (!form.employee_id.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      showNotice('Missing Fields', 'Employee ID, first name, and last name are required.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        employee_id: cleanText(form.employee_id, 50),
        first_name: cleanText(form.first_name, 80),
        middle_name: cleanText(form.middle_name, 80),
        last_name: cleanText(form.last_name, 80),
        suffix: cleanText(form.suffix, 20),
        email: cleanText(form.email, 120),
        contact_number: cleanText(form.contact_number, 30),
        position: cleanText(form.position, 80),
        department: cleanText(form.department, 80),
        can_handle_classes: form.can_handle_classes,
        is_active: form.is_active,
      };
      if (photoRemoved) {
        payload.photo = null;
        payload.remove_photo = true;
      } else if (photoBase64) {
        payload.photo = photoBase64;
      }

      if (editing) {
        await apiClient.patch(`${ENDPOINTS.TEACHERS}${editing.id}/`, payload);
        showNotice('Updated', 'Teacher profile updated.');
      } else {
        await apiClient.post(ENDPOINTS.TEACHERS, payload);
        showNotice('Created', 'Teacher profile added.');
      }
      setModalOpen(false);
      await loadTeachers(true);
    } catch (err: unknown) {
      showNotice('Save Failed', getFriendlyErrorMessage(err, 'Could not save teacher profile.'));
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const handleResetPhone = (t: TeacherRow) => {
    const name = t.full_name || `${t.first_name} ${t.last_name}`;
    const run = async () => {
      try {
        await apiClient.post(ENDPOINTS.RESET_DEVICE, { teacher_id: t.id });
        showNotice('Phone Reset', `${name} can now pair a new phone on their next Time In.`);
        setInspectTeacher(null);
        await loadTeachers(true);
      } catch (err: unknown) {
        showNotice('Reset Failed', getFriendlyErrorMessage(err, 'Could not reset phone binding.'));
      }
    };
    confirmAction('Reset Bound Phone', `Unlink bound phone for ${name}?`, 'Unlink', () => void run());
  };

  const handleDelete = (t: TeacherRow) => {
    const name = t.full_name || `${t.first_name} ${t.last_name}`;
    const run = async () => {
      try {
        await apiClient.delete(`${ENDPOINTS.TEACHERS}${t.id}/`);
        showNotice('Deleted', `${name} was removed.`);
        setInspectTeacher(null);
        await loadTeachers(true);
      } catch (err: unknown) {
        showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete teacher.'));
      }
    };
    confirmAction('Delete Teacher', `Delete ${name}?`, 'Delete', () => void run());
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers.filter((t) => {
      if (filterMode === 'ACTIVE' && t.is_active === false) return false;
      if (filterMode === 'TEACHING' && t.can_handle_classes === false) return false;
      if (filterMode === 'NON_TEACHING' && t.can_handle_classes !== false) return false;
      if (filterMode === 'BOUND_PHONE' && !t.bound_device_id) return false;
      if (!q) return true;
      const text = `${t.full_name || ''} ${t.first_name} ${t.last_name} ${t.employee_id} ${t.department || ''} ${t.position || ''} ${t.email || ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [teachers, searchQuery, filterMode]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={palette.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search teacher name, ID, department..."
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

      {/* Filter Strip */}
      <ChipRow<FilterType>
        options={[
          { key: 'ALL', label: `All (${teachers.length})` },
          { key: 'ACTIVE', label: 'Active' },
          { key: 'TEACHING', label: 'Teaching' },
          { key: 'NON_TEACHING', label: 'Non-Teaching' },
          { key: 'BOUND_PHONE', label: 'Bound Phone' },
        ]}
        selected={filterMode}
        onSelect={setFilterMode}
        style={styles.filterStrip}
        contentContainerStyle={styles.filterRow}
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.mutedText}>Loading teachers...</Text>
        </View>
      ) : (
        <FlatList
          style={styles.listFlex}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadTeachers(true);
              }}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.mutedText}>No teachers matched your filter.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const name = item.full_name || `${item.first_name} ${item.last_name}`.trim();
            const avatarUri = resolveMediaUrl(item.photo_url || item.photo, serverBase);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => setInspectTeacher(item)}
              >
                <View style={styles.cardTop}>
                  <View style={styles.avatarBox}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
                    ) : (
                      <Ionicons name="person" size={20} color={palette.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.metaText}>
                      {item.employee_id} &bull; {item.position || 'Teacher'}
                    </Text>
                    <Text style={styles.subMeta}>
                      {item.department || 'No Department'} &bull;{' '}
                      {item.can_handle_classes !== false ? 'Teaching' : 'Non-Teaching'}
                      {item.is_active === false ? ' • Inactive' : ''}
                    </Text>
                  </View>
                  <View style={styles.actionsRow}>
                    {allowResetPhone && item.bound_device_id ? (
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: palette.warningLight }]}
                        onPress={() => handleResetPhone(item)}
                        accessibilityLabel="Reset Bound Phone"
                      >
                        <Ionicons name="phone-portrait-outline" size={16} color={palette.warning} />
                      </TouchableOpacity>
                    ) : null}
                    {allowCrud && (
                      <>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => openEdit(item)}
                          accessibilityLabel="Edit Teacher"
                        >
                          <Ionicons name="create-outline" size={16} color={palette.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.iconBtn, { backgroundColor: palette.dangerLight }]}
                          onPress={() => handleDelete(item)}
                          accessibilityLabel="Delete Teacher"
                        >
                          <Ionicons name="trash-outline" size={16} color={palette.danger} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>

                <View style={styles.phoneRow}>
                  <Ionicons
                    name={item.bound_device_id ? 'shield-checkmark-outline' : 'phone-portrait-outline'}
                    size={13}
                    color={item.bound_device_id ? palette.success : palette.textMuted}
                  />
                  <Text
                    style={[
                      styles.phoneText,
                      { color: item.bound_device_id ? palette.success : palette.textMuted },
                    ]}
                  >
                    {item.bound_device_id
                      ? `Bound Phone: ${item.device_model || 'Linked'}`
                      : 'Pairs on first mobile Time In'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Teacher Profile Inspection Modal */}
      <Modal
        visible={Boolean(inspectTeacher)}
        transparent
        animationType="fade"
        onRequestClose={() => setInspectTeacher(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Teacher Profile Details</Text>
              <TouchableOpacity onPress={() => setInspectTeacher(null)}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </TouchableOpacity>
            </View>
            {inspectTeacher && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 10 }}>
                <View style={styles.detailAvatar}>
                  {resolveMediaUrl(inspectTeacher.photo_url || inspectTeacher.photo, serverBase) ? (
                    <Image
                      source={{
                        uri: resolveMediaUrl(inspectTeacher.photo_url || inspectTeacher.photo, serverBase)!,
                      }}
                      style={styles.avatarImg}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons name="person" size={34} color={palette.primary} />
                  )}
                </View>
                <Text style={[styles.nameText, { fontSize: fonts.lg, textAlign: 'center' }]}>
                  {inspectTeacher.full_name || `${inspectTeacher.first_name} ${inspectTeacher.last_name}`}
                </Text>
                <Text style={styles.metaText}>
                  {inspectTeacher.employee_id} &bull; {inspectTeacher.position || 'Teacher'}
                </Text>

                <View style={styles.detailBox}>
                  {[
                    ['Username', inspectTeacher.username ? `@${inspectTeacher.username}` : '—'],
                    ['Department', inspectTeacher.department || '—'],
                    ['System Role', inspectTeacher.role || 'TEACHER'],
                    ['Teaching Assignment', inspectTeacher.can_handle_classes !== false ? 'Classroom Teacher' : 'Non-Teaching'],
                    ['Account Status', inspectTeacher.is_active !== false ? 'Active' : 'Inactive'],
                    ['Email', inspectTeacher.email || '—'],
                    ['Contact Number', inspectTeacher.contact_number || '—'],
                    ['Bound Phone', inspectTeacher.bound_device_id ? inspectTeacher.device_model || 'Paired' : 'Not paired yet'],
                  ].map(([k, v]) => (
                    <View key={k} style={styles.detailRow}>
                      <Text style={styles.detailKey}>{k}</Text>
                      <Text style={styles.detailVal}>{v}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                  {allowResetPhone && inspectTeacher.bound_device_id && (
                    <TouchableOpacity
                      style={[styles.saveBtn, { flex: 1, backgroundColor: palette.warning }]}
                      onPress={() => handleResetPhone(inspectTeacher)}
                    >
                      <Text style={styles.saveBtnText}>Unlink Phone</Text>
                    </TouchableOpacity>
                  )}
                  {allowCrud && (
                    <TouchableOpacity
                      style={[styles.saveBtn, { flex: 1 }]}
                      onPress={() => {
                        const target = inspectTeacher;
                        setInspectTeacher(null);
                        openEdit(target);
                      }}
                    >
                      <Text style={styles.saveBtnText}>Edit Profile</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add / Edit Teacher Modal */}
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
                {editing ? 'Edit Teacher Profile' : 'Add Teacher'}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={22} color={palette.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingBottom: 16 }}
            >
              <ImageUploadField
                label="Teacher Portrait Photo"
                helperText="Displayed across directory, geofence monitor, and schedules."
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

              <Text style={styles.inputLabel}>Employee ID *</Text>
              <TextInput
                style={styles.input}
                value={form.employee_id}
                onChangeText={(v) => setForm((p) => ({ ...p, employee_id: v }))}
                placeholder="e.g. EMP-2026-010"
                placeholderTextColor={palette.textMuted}
              />
              {employeeIdCheck.warning ? (
                <Text style={styles.warnText}>{employeeIdCheck.warning}</Text>
              ) : null}

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
                    placeholder="Jr. / PhD"
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

              <Text style={styles.inputLabel}>Position Title</Text>
              <ChipRow
                options={POSITION_PRESETS.map((pos) => ({ key: pos, label: pos }))}
                selected={form.position}
                onSelect={(pos) => setForm((p) => ({ ...p, position: pos }))}
              />
              <TextInput
                style={styles.input}
                value={form.position}
                onChangeText={(v) => setForm((p) => ({ ...p, position: v }))}
                placeholder="Or enter custom position"
                placeholderTextColor={palette.textMuted}
              />

              <Text style={styles.inputLabel}>Department</Text>
              {departments.length > 0 && (
                <ChipRow
                  options={departments.map((d) => ({ key: d.name, label: d.name }))}
                  selected={form.department}
                  onSelect={(dept) => setForm((p) => ({ ...p, department: dept }))}
                />
              )}
              <TextInput
                style={styles.input}
                value={form.department}
                onChangeText={(v) => setForm((p) => ({ ...p, department: v }))}
                placeholder="Mathematics / Science / Administration"
                placeholderTextColor={palette.textMuted}
              />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={(v) => setForm((p) => ({ ...p, email: v }))}
                placeholder="teacher@school.edu.ph"
                placeholderTextColor={palette.textMuted}
              />
              {emailCheck.warning ? (
                <Text style={styles.warnText}>{emailCheck.warning}</Text>
              ) : null}

              <Text style={styles.inputLabel}>Mobile Contact</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                value={form.contact_number}
                onChangeText={(v) => setForm((p) => ({ ...p, contact_number: v }))}
                placeholder="09XXXXXXXXX"
                placeholderTextColor={palette.textMuted}
              />
              {contactCheck.warning ? (
                <Text style={styles.warnText}>{contactCheck.warning}</Text>
              ) : null}

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Classroom Teacher (Can Handle Classes)</Text>
                  <Text style={styles.switchSub}>Turn off for non-teaching accounts</Text>
                </View>
                <Switch
                  value={form.can_handle_classes}
                  onValueChange={(v) => setForm((p) => ({ ...p, can_handle_classes: v }))}
                  trackColor={{ false: palette.borderStrong, true: palette.primary }}
                  thumbColor={palette.onPrimary}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Active Teacher Profile</Text>
                  <Text style={styles.switchSub}>Inactive accounts cannot sign in or Time In</Text>
                </View>
                <Switch
                  value={form.is_active}
                  onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                  trackColor={{ false: palette.borderStrong, true: palette.success }}
                  thumbColor={palette.onPrimary}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (saving || isCheckingFields || hasFieldConflict) && { opacity: 0.6 },
                ]}
                onPress={() => void handleSave()}
                disabled={saving || isCheckingFields || hasFieldConflict}
              >
                {saving || isCheckingFields ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editing ? 'Save Changes' : 'Create Teacher'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    toolbar: { flexShrink: 0, flexDirection: 'row', gap: 8, padding: 14, paddingBottom: 8 },
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
    filterStrip: { flexGrow: 0, flexShrink: 0, paddingVertical: 4, marginBottom: 4 },
    filterRow: { paddingHorizontal: 14, gap: 8, alignItems: 'center' },
    listFlex: { flex: 1 },
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
    listContent: { padding: 14, paddingBottom: 120, gap: 10 },
    centerBox: { paddingVertical: 40, alignItems: 'center', gap: 8 },
    mutedText: { fontSize: fonts.sm, color: palette.textMuted },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
    metaText: { fontSize: fonts.xs, color: palette.primary, fontWeight: fonts.weight.bold, marginTop: 1 },
    subMeta: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    actionsRow: { flexDirection: 'row', gap: 5 },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    phoneText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold },
    twoCol: { flexDirection: 'row', gap: 8 },
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
    warnText: { fontSize: fonts.xs, color: palette.danger, fontWeight: fonts.weight.bold },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    switchTitle: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    switchSub: { fontSize: fonts.xxs, color: palette.textSecondary },
    saveBtn: {
      backgroundColor: palette.buttonBg,
      borderRadius: 10,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
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

export default TeachersScreen;
