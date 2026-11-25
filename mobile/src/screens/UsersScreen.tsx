// AttendSure Mobile - Users Screen
// File: D:\AttendSure_V3\mobile\src\screens\UsersScreen.tsx

/**
 * AttendSure Mobile - User Accounts & Roles CRUD (Admin Only — 100% Web Parity)
 * File: mobile/src/screens/UsersScreen.tsx
 *
 * Full parity with web UsersTab: portrait photos, employee_id, middle_name, suffix,
 * contact_number, department, position, password visibility toggle, live field
 * uniqueness checks, role filters, and locked-account badges.
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
import { canManageUsers } from '../utils/permissions';
import { confirmAction, resolveMediaUrl, showNotice } from '../utils/helpers';
import { useMobileFieldCheck } from '../hooks/useMobileFieldCheck';
import { getServerBaseUrl } from '../services/configService';
import ImageUploadField from '../components/common/ImageUploadField';
import ChipRow from '../components/common/ChipRow';

interface UserAccountRow {
  id: number;
  username: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  employee_id?: string;
  department?: string;
  position?: string;
  role: string;
  is_active: boolean;
  is_locked?: boolean;
  can_handle_classes?: boolean;
  photo?: string | null;
  photo_url?: string | null;
}

interface DepartmentOption {
  id: number;
  name: string;
}

const ROLES = ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'TEACHER'] as const;
const POSITION_PRESETS = [
  'Teacher I',
  'Teacher II',
  'Teacher III',
  'Master Teacher I',
  'Head Teacher I',
  'School Principal',
  'System Administrator',
  'Administrative Officer',
] as const;

export const UsersScreen: React.FC = () => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const allowCrud = canManageUsers(user);

  const [users, setUsers] = useState<UserAccountRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [serverBase, setServerBase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserAccountRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState<boolean>(false);

  const [form, setForm] = useState({
    username: '',
    password: '',
    employee_id: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    email: '',
    contact_number: '',
    department: 'General Education',
    position: 'Teacher I',
    role: 'TEACHER',
    is_active: true,
    can_handle_classes: true,
  });

  const isMounted = useRef(true);

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent && isMounted.current) setLoading(true);
    try {
      const [uRes, dRes, base] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.USERS, { params: { page_size: 'ALL' } }),
        apiClient.get(ENDPOINTS.DEPARTMENTS, { params: { page_size: 100 } }),
        getServerBaseUrl(),
      ]);
      if (!isMounted.current) return;
      if (base.status === 'fulfilled' && base.value) setServerBase(base.value);

      if (uRes.status === 'fulfilled' && uRes.value?.data) {
        const raw = uRes.value.data;
        setUsers(Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []);
      }
      if (dRes.status === 'fulfilled' && dRes.value?.data) {
        const raw = dRes.value.data;
        setDepartments(Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []);
      }
    } catch {
      // Keep existing list
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    void loadUsers(false);
    return () => {
      isMounted.current = false;
    };
  }, [loadUsers]);

  // Live uniqueness checks for username, employee_id, email, contact_number
  const usernameCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'username',
    value: form.username,
    excludeId: editing?.id,
    excludeUserId: editing?.id,
  });
  const employeeIdCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'employee_id',
    value: form.employee_id,
    excludeId: editing?.id,
    excludeUserId: editing?.id,
  });
  const emailCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'email',
    value: form.email,
    excludeId: editing?.id,
    excludeUserId: editing?.id,
  });
  const contactCheck = useMobileFieldCheck({
    enabled: modalOpen,
    field: 'contact_number',
    value: form.contact_number,
    minDigits: 10,
    excludeId: editing?.id,
    excludeUserId: editing?.id,
  });

  const openAdd = () => {
    setEditing(null);
    setShowPassword(false);
    setPhotoBase64(null);
    setPhotoPreview(null);
    setPhotoRemoved(false);
    setForm({
      username: '',
      password: '',
      employee_id: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      suffix: '',
      email: '',
      contact_number: '',
      department: departments[0]?.name || 'General Education',
      position: 'Teacher I',
      role: 'TEACHER',
      is_active: true,
      can_handle_classes: true,
    });
    setModalOpen(true);
  };

  const openEdit = (u: UserAccountRow) => {
    setEditing(u);
    setShowPassword(false);
    setPhotoBase64(null);
    setPhotoPreview(u.photo_url || u.photo || null);
    setPhotoRemoved(false);
    setForm({
      username: u.username || '',
      password: '',
      employee_id: u.employee_id || '',
      first_name: u.first_name || '',
      middle_name: u.middle_name || '',
      last_name: u.last_name || '',
      suffix: u.suffix || '',
      email: u.email || '',
      contact_number: u.contact_number || '',
      department: u.department || '',
      position: u.position || '',
      role: u.role || 'TEACHER',
      is_active: u.is_active !== false,
      can_handle_classes: u.can_handle_classes !== false,
    });
    setModalOpen(true);
  };

  const isCheckingFields =
    usernameCheck.checking ||
    employeeIdCheck.checking ||
    emailCheck.checking ||
    contactCheck.checking;
  const hasFieldConflict =
    usernameCheck.isTaken ||
    employeeIdCheck.isTaken ||
    emailCheck.isTaken ||
    contactCheck.isTaken;

  const handleSave = async () => {
    if (isCheckingFields) {
      showNotice('Checking Details', 'Please wait a moment while we verify your entries.');
      return;
    }
    if (hasFieldConflict) {
      showNotice(
        'Duplicate Field',
        usernameCheck.warning ||
          employeeIdCheck.warning ||
          emailCheck.warning ||
          contactCheck.warning ||
          'Please fix duplicate fields before saving.'
      );
      return;
    }
    if (!form.username.trim()) {
      showNotice('Username Required', 'Please enter a username.');
      return;
    }
    if (!editing && form.password.trim().length < 8) {
      showNotice('Password Required', 'New user passwords must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        username: cleanText(form.username, 60),
        employee_id: cleanText(form.employee_id, 50),
        first_name: cleanText(form.first_name, 80),
        middle_name: cleanText(form.middle_name, 80),
        last_name: cleanText(form.last_name, 80),
        suffix: cleanText(form.suffix, 20),
        email: cleanText(form.email, 120),
        contact_number: cleanText(form.contact_number, 30),
        department: cleanText(form.department, 80),
        position: cleanText(form.position, 80),
        role: form.role,
        is_active: form.is_active,
        can_handle_classes: form.can_handle_classes,
      };
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }
      if (photoRemoved) {
        payload.photo = null;
        payload.remove_photo = true;
      } else if (photoBase64) {
        payload.photo = photoBase64;
      }

      if (editing) {
        await apiClient.patch(`${ENDPOINTS.USERS}${editing.id}/`, payload);
        showNotice('Updated', 'User account updated.');
      } else {
        await apiClient.post(ENDPOINTS.USERS, payload);
        showNotice('Created', 'User account created.');
      }
      setModalOpen(false);
      await loadUsers(true);
    } catch (err: unknown) {
      showNotice('Save Failed', getFriendlyErrorMessage(err, 'Could not save user account.'));
    } finally {
      if (isMounted.current) setSaving(false);
    }
  };

  const handleDelete = (u: UserAccountRow) => {
    if (Number(u.id) === Number(user?.id)) {
      showNotice('Blocked', 'You cannot delete your own active account.');
      return;
    }
    const run = async () => {
      try {
        await apiClient.delete(`${ENDPOINTS.USERS}${u.id}/`);
        showNotice('Deleted', `Removed account ${u.username}.`);
        await loadUsers(true);
      } catch (err: unknown) {
        showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete user account.'));
      }
    };
    confirmAction('Delete Account', `Delete user account ${u.username}?`, 'Delete', () => void run());
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && String(u.role).toUpperCase() !== roleFilter) return false;
      if (!q) return true;
      return `${u.username} ${u.first_name} ${u.last_name} ${u.employee_id || ''} ${u.role} ${u.department || ''} ${u.email || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [users, searchQuery, roleFilter]);

  if (!allowCrud) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.mutedText}>Administrator access is required to manage user accounts.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={palette.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search username, name, ID, role..."
            placeholderTextColor={palette.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <Ionicons name="person-add-outline" size={16} color={palette.onPrimary} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ChipRow
        options={(['ALL', ...ROLES] as const).map((r) => ({
          key: r,
          label: r === 'ALL' ? `All (${users.length})` : r,
        }))}
        selected={roleFilter}
        onSelect={setRoleFilter}
        style={styles.filterStrip}
        contentContainerStyle={styles.filterRow}
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.mutedText}>Loading user accounts...</Text>
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
                void loadUsers(true);
              }}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          renderItem={({ item }) => {
            const avatarUri = resolveMediaUrl(item.photo_url || item.photo, serverBase);
            return (
              <View style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.avatarBox}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
                    ) : (
                      <Ionicons name="person" size={20} color={palette.primary} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nameText} numberOfLines={1}>
                      {item.full_name || `${item.first_name} ${item.last_name}`.trim() || item.username}
                    </Text>
                    <Text style={styles.metaText}>
                      @{item.username} &bull; {item.role} &bull; {item.is_active ? 'Active' : 'Inactive'}
                      {item.is_locked ? ' • LOCKED' : ''}
                    </Text>
                    <Text style={styles.subText} numberOfLines={1}>
                      {[item.employee_id, item.department, item.position].filter(Boolean).join(' • ') ||
                        item.email ||
                        'No details'}
                    </Text>
                  </View>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                      <Ionicons name="create-outline" size={16} color={palette.primary} />
                    </TouchableOpacity>
                    {Number(item.id) !== Number(user?.id) && (
                      <TouchableOpacity
                        style={[styles.iconBtn, { backgroundColor: palette.dangerLight }]}
                        onPress={() => handleDelete(item)}
                      >
                        <Ionicons name="trash-outline" size={16} color={palette.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

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
                {editing ? 'Edit User Account' : 'Create User Account'}
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
                label="Account Portrait Photo"
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

              <Text style={styles.inputLabel}>Username *</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={form.username}
                onChangeText={(v) => setForm((p) => ({ ...p, username: v }))}
                placeholder="Username"
                placeholderTextColor={palette.textMuted}
              />
              {usernameCheck.warning ? <Text style={styles.warnText}>{usernameCheck.warning}</Text> : null}

              <Text style={styles.inputLabel}>
                {editing ? 'New Password (leave blank to keep current)' : 'Password (min 8 characters) *'}
              </Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  secureTextEntry={!showPassword}
                  value={form.password}
                  onChangeText={(v) => setForm((p) => ({ ...p, password: v }))}
                  placeholder="Password"
                  placeholderTextColor={palette.textMuted}
                />
                <TouchableOpacity onPress={() => setShowPassword((s) => !s)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={palette.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Employee ID</Text>
              <TextInput
                style={styles.input}
                value={form.employee_id}
                onChangeText={(v) => setForm((p) => ({ ...p, employee_id: v }))}
                placeholder="e.g. EMP-2026-001 (auto-generated if blank)"
                placeholderTextColor={palette.textMuted}
              />
              {employeeIdCheck.warning ? <Text style={styles.warnText}>{employeeIdCheck.warning}</Text> : null}

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
              {emailCheck.warning ? <Text style={styles.warnText}>{emailCheck.warning}</Text> : null}

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
                placeholder="Department"
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
                placeholder="Position Title"
                placeholderTextColor={palette.textMuted}
              />

              <Text style={styles.inputLabel}>System Role *</Text>
              <ChipRow
                wrap
                options={ROLES.map((r) => ({ key: r, label: r }))}
                selected={form.role}
                onSelect={(role) => setForm((p) => ({ ...p, role }))}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.inputLabel, { flex: 1, marginTop: 0 }]}>Account Active</Text>
                <Switch
                  value={form.is_active}
                  onValueChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                  trackColor={{ false: palette.borderStrong, true: palette.success }}
                  thumbColor={palette.onPrimary}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={[styles.inputLabel, { flex: 1, marginTop: 0 }]}>
                  Can Handle Classes (Teaching)
                </Text>
                <Switch
                  value={form.can_handle_classes}
                  onValueChange={(v) => setForm((p) => ({ ...p, can_handle_classes: v }))}
                  trackColor={{ false: palette.borderStrong, true: palette.primary }}
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
                    {editing ? 'Save User Changes' : 'Create User'}
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
    listContent: { padding: 14, paddingBottom: 120, gap: 10 },
    centerBox: { paddingVertical: 40, alignItems: 'center', gap: 8, paddingHorizontal: 20 },
    mutedText: { fontSize: fonts.sm, color: palette.textMuted, textAlign: 'center' },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
    nameText: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    metaText: { fontSize: fonts.xs, color: palette.primary, fontWeight: fonts.weight.bold, marginTop: 1 },
    subText: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    actionsRow: { flexDirection: 'row', gap: 5 },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    passwordWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      gap: 8,
    },
    passwordInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    warnText: { fontSize: fonts.xs, color: palette.danger, fontWeight: fonts.weight.bold },
    roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    chipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    chipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    chipTextActive: { color: palette.onPrimary },
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

export default UsersScreen;
