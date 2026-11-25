/**
 * AttendSure Mobile - Authorized Exit Passes & Locator Slips (100% Web Parity)
 * File: mobile/src/screens/GatePassScreen.tsx
 *
 * Includes searchable Student & Teacher pickers, Pass Type presets, Proof/Attachment
 * photo upload & preview, Edit/Delete CRUD, Mark Returned, Approve, and Cancel actions.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { canApproveOrCancelLocatorSlip, canIssueStudentExitPass } from '../utils/permissions';
import { confirmAction, isCanceledError, resolveMediaUrl, showNotice } from '../utils/helpers';
import { getServerBaseUrl } from '../services/configService';
import ImageUploadField from '../components/common/ImageUploadField';
import ChipRow from '../components/common/ChipRow';

const PASSES_CACHE_KEY = 'attendsure_cached_exit_passes_v4';

export interface ExitPassItem {
  id: number;
  pass_number: string;
  pass_scope: 'STUDENT' | 'TEACHER';
  student?: number | null;
  teacher?: number | null;
  person_name: string;
  section_name?: string;
  pass_type?: string;
  destination: string;
  reason: string;
  attachment?: string | null;
  attachment_url?: string | null;
  issued_by_name?: string;
  issued_at: string;
  valid_until: string;
  returned_at?: string | null;
  is_cancelled?: boolean;
  pass_status: 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'CANCELLED';
  guardian_notice?: string;
}

interface StudentChoice {
  id: number;
  lrn: string;
  full_name: string;
  section_name?: string;
}

interface TeacherChoice {
  id: number;
  employee_id: string;
  full_name: string;
  department?: string;
}

interface GatePassScreenProps {
  onBack?: () => void;
}

const STUDENT_PASS_TYPES = [
  'Clinic / Medical Clearance',
  'Parent Pickup',
  'Official Activity',
  'Emergency Family Matter',
] as const;

const TEACHER_PASS_TYPES = [
  'Official Travel Order',
  'Division Seminar',
  'Official Errand',
  'DepEd Meeting',
] as const;

export const GatePassScreen: React.FC<GatePassScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const isLeader = canApproveOrCancelLocatorSlip(user);
  const allowStudentPass = canIssueStudentExitPass(user);

  const [passes, setPasses] = useState<ExitPassItem[]>([]);
  const [studentChoices, setStudentChoices] = useState<StudentChoice[]>([]);
  const [teacherChoices, setTeacherChoices] = useState<TeacherChoice[]>([]);
  const [serverBase, setServerBase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedPass, setSelectedPass] = useState<ExitPassItem | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [editingPass, setEditingPass] = useState<ExitPassItem | null>(null);
  const [passScope, setPassScope] = useState<'STUDENT' | 'TEACHER'>(
    allowStudentPass ? 'STUDENT' : 'TEACHER'
  );
  const [studentPickerSearch, setStudentPickerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    student_id: '',
    teacher_id: user?.teacher_id ? String(user.teacher_id) : '',
    pass_type: 'Clinic / Medical Clearance',
    destination: '',
    reason: '',
    duration_hours: '2',
  });

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPasses = useCallback(async (silent = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) {
      if (isMountedRef.current) setLoading(true);
      try {
        const [cached, base] = await Promise.all([
          AsyncStorage.getItem(PASSES_CACHE_KEY),
          getServerBaseUrl(),
        ]);
        if (isMountedRef.current && !controller.signal.aborted) {
          if (base) setServerBase(base);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) setPasses(parsed);
          }
        }
      } catch {}
    }

    try {
      const [passRes, stuRes, teaRes] = await Promise.allSettled([
        apiClient.get<{ results?: ExitPassItem[] } | ExitPassItem[]>(ENDPOINTS.EXIT_PASSES, {
          signal: controller.signal,
        }),
        allowStudentPass
          ? apiClient.get(ENDPOINTS.STUDENT_DROPDOWN, { signal: controller.signal })
          : Promise.resolve({ data: [] }),
        isLeader
          ? apiClient.get(ENDPOINTS.TEACHERS_DROPDOWN, { signal: controller.signal })
          : Promise.resolve({ data: [] }),
      ]);

      if (!isMountedRef.current || controller.signal.aborted) return;

      if (passRes.status === 'fulfilled' && passRes.value?.data) {
        const data = passRes.value.data;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : [];
        setPasses(list);
        AsyncStorage.setItem(PASSES_CACHE_KEY, JSON.stringify(list)).catch(() => {});
      }

      if (stuRes.status === 'fulfilled' && stuRes.value?.data) {
        const raw = stuRes.value.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
        setStudentChoices(list);
      }

      if (teaRes.status === 'fulfilled' && teaRes.value?.data) {
        const raw = teaRes.value.data;
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
        setTeacherChoices(list);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current || isCanceledError(err)) return;
      if (!silent) {
        showNotice('Notice', getFriendlyErrorMessage(err, 'Could not load exit passes right now.'));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [allowStudentPass, isLeader]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchPasses(false);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchPasses]);

  const filteredPasses = useMemo(() => {
    const q = cleanText(searchQuery, 80).toLowerCase();
    return passes.filter((p) => {
      const matchesStatus = statusFilter === 'ALL' || p.pass_status === statusFilter;
      const hay = `${p.pass_number || ''} ${p.person_name || ''} ${p.pass_type || ''} ${p.destination || ''} ${p.reason || ''}`.toLowerCase();
      return matchesStatus && (!q || hay.includes(q));
    });
  }, [passes, statusFilter, searchQuery]);

  const filteredStudentChoices = useMemo(() => {
    const q = studentPickerSearch.trim().toLowerCase();
    if (!q) return studentChoices.slice(0, 30);
    return studentChoices
      .filter((s) =>
        `${s.full_name} ${s.lrn} ${s.section_name || ''}`.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [studentChoices, studentPickerSearch]);

  const openCreateModal = () => {
    const nextScope: 'STUDENT' | 'TEACHER' = allowStudentPass ? 'STUDENT' : 'TEACHER';
    setEditingPass(null);
    setPassScope(nextScope);
    setStudentPickerSearch('');
    setAttachmentBase64(null);
    setAttachmentPreview(null);
    setForm({
      student_id: '',
      teacher_id: user?.teacher_id ? String(user.teacher_id) : '',
      pass_type: nextScope === 'STUDENT' ? STUDENT_PASS_TYPES[0] : TEACHER_PASS_TYPES[0],
      destination: '',
      reason: '',
      duration_hours: '2',
    });
    setShowIssueModal(true);
  };

  const openEditModal = (pass: ExitPassItem) => {
    setEditingPass(pass);
    setPassScope(pass.pass_scope);
    setStudentPickerSearch('');
    setAttachmentBase64(null);
    setAttachmentPreview(pass.attachment_url || pass.attachment || null);
    setForm({
      student_id: pass.student ? String(pass.student) : '',
      teacher_id: pass.teacher ? String(pass.teacher) : '',
      pass_type:
        pass.pass_type ||
        (pass.pass_scope === 'STUDENT' ? STUDENT_PASS_TYPES[0] : TEACHER_PASS_TYPES[0]),
      destination: pass.destination || '',
      reason: pass.reason || '',
      duration_hours: '2',
    });
    setSelectedPass(null);
    setShowIssueModal(true);
  };

  const handleIssueSubmit = async () => {
    let parsedStudentId: number | null = null;
    if (!editingPass && passScope === 'STUDENT') {
      const cleanId = cleanText(form.student_id, 12);
      parsedStudentId = Number.parseInt(cleanId, 10);
      if (!cleanId || !Number.isFinite(parsedStudentId) || parsedStudentId <= 0) {
        showNotice('Required', 'Please select a student from the list.');
        return;
      }
    }

    const cleanedDest = cleanText(form.destination, 160);
    const cleanedReason = cleanText(form.reason, 300);
    if (!cleanedDest || !cleanedReason) {
      showNotice('Required', 'Please enter both destination and reason.');
      return;
    }

    const parsedHours = Number.parseInt(cleanText(form.duration_hours, 2), 10);
    const hours = Math.max(1, Math.min(12, Number.isFinite(parsedHours) ? parsedHours : 2));
    const expiry = new Date(Date.now() + hours * 3600000);

    setSubmitting(true);
    try {
      const payload: Record<string, string | number | null> = {
        pass_scope: passScope,
        pass_type: cleanText(form.pass_type, 80),
        destination: cleanedDest,
        reason: cleanedReason,
      };
      if (!editingPass) {
        payload.valid_until = expiry.toISOString();
        if (passScope === 'STUDENT' && parsedStudentId !== null) {
          payload.student_id = parsedStudentId;
        } else if (form.teacher_id) {
          payload.teacher_id = Number(form.teacher_id);
        } else if (user?.teacher_id) {
          payload.teacher_id = Number(user.teacher_id);
        }
      }
      if (attachmentBase64) {
        payload.attachment = attachmentBase64;
      }

      if (editingPass) {
        await apiClient.patch(
          `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(editingPass.id))}/`,
          payload
        );
        showNotice('Updated', `Exit pass ${editingPass.pass_number} updated.`);
      } else {
        await apiClient.post(ENDPOINTS.EXIT_PASSES, payload);
        showNotice('Exit Pass Issued', 'The authorized exit pass is now active.');
      }

      if (!isMountedRef.current) return;
      setShowIssueModal(false);
      setEditingPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Could Not Save Pass', getFriendlyErrorMessage(err, 'Unable to save exit pass.'));
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const handleMarkReturned = async (pass: ExitPassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(
        `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/mark-returned/`
      );
      if (!isMountedRef.current) return;
      showNotice('Returned', 'Return to campus has been recorded.');
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showNotice('Error', getFriendlyErrorMessage(err, 'Could not mark pass as returned.'));
      }
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleApprovePass = async (pass: ExitPassItem) => {
    if (actionBusy || !isLeader) return;
    setActionBusy(true);
    try {
      await apiClient.post(
        `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/approve/`
      );
      if (!isMountedRef.current) return;
      showNotice('Approved', `Official Locator Slip ${pass.pass_number} has been approved.`);
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showNotice('Error', getFriendlyErrorMessage(err, 'Could not approve this locator slip.'));
      }
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleCancelPass = async (pass: ExitPassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(
        `${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/cancel/`
      );
      if (!isMountedRef.current) return;
      showNotice('Cancelled', `Pass ${pass.pass_number} has been cancelled.`);
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        showNotice('Error', getFriendlyErrorMessage(err, 'Could not cancel this pass.'));
      }
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleDeletePass = (pass: ExitPassItem) => {
    const run = async () => {
      setActionBusy(true);
      try {
        await apiClient.delete(`${ENDPOINTS.EXIT_PASSES}${encodeURIComponent(String(pass.id))}/`);
        if (!isMountedRef.current) return;
        showNotice('Deleted', `Exit pass ${pass.pass_number} removed.`);
        setSelectedPass(null);
        void fetchPasses(true);
      } catch (err: unknown) {
        if (isMountedRef.current) {
          showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete pass.'));
        }
      } finally {
        if (isMountedRef.current) setActionBusy(false);
      }
    };
    confirmAction('Delete Pass', `Delete exit pass ${pass.pass_number}?`, 'Delete', () => void run());
  };

  const getStatusStyle = (st: ExitPassItem['pass_status']) => {
    if (st === 'ACTIVE') return { bg: palette.successLight, text: palette.success };
    if (st === 'OVERDUE') return { bg: palette.dangerLight, text: palette.danger };
    if (st === 'RETURNED') return { bg: palette.infoLight, text: palette.info };
    return { bg: palette.surfaceSubtle, text: palette.textMuted };
  };

  const passTypePresets = passScope === 'STUDENT' ? STUDENT_PASS_TYPES : TEACHER_PASS_TYPES;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={20} color={palette.primary} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerTitle}>Authorized Exit Passes</Text>
            <Text style={styles.headerSubtitle}>Student &amp; Teacher Campus Permits</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.newBtn} onPress={openCreateModal}>
          <Ionicons name="add" size={16} color={palette.onPrimary} />
          <Text style={styles.newBtnText}>{allowStudentPass ? 'New Pass' : 'Locator Slip'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={palette.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pass number, name, destination..."
          placeholderTextColor={palette.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          maxLength={80}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color={palette.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        <ChipRow
          options={['ACTIVE', 'OVERDUE', 'RETURNED', 'CANCELLED', 'ALL'].map((st) => ({
            key: st,
            label: st,
          }))}
          selected={statusFilter}
          onSelect={setStatusFilter}
        />
      </View>

      {loading && passes.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.centerText}>Loading exit passes...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPasses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchPasses(true);
              }}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={38} color={palette.textMuted} />
              <Text style={styles.emptyTitle}>No exit passes here right now</Text>
              <Text style={styles.emptySub}>
                Tap &ldquo;{allowStudentPass ? 'New Pass' : 'Locator Slip'}&rdquo; at the top right to issue an approved campus exit or travel slip.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const pillColors = getStatusStyle(item.pass_status);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => setSelectedPass(item)}
              >
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.passCode}>{item.pass_number}</Text>
                    <Text style={styles.holderType}>
                      {item.pass_scope} EXIT PASS{item.pass_type ? ` • ${item.pass_type}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pillColors.bg }]}>
                    <Text style={[styles.statusPillText, { color: pillColors.text }]}>
                      {item.pass_status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.holderName}>{item.person_name || 'Pass Holder'}</Text>
                <Text style={styles.reasonText} numberOfLines={2}>
                  {item.destination} — {item.reason}
                </Text>

                <View style={styles.cardBottom}>
                  <Text style={styles.dateText}>
                    Valid until:{' '}
                    {item.valid_until && !Number.isNaN(Date.parse(item.valid_until))
                      ? new Date(item.valid_until).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </Text>
                  <Text style={styles.cardAction}>
                    {item.attachment_url || item.attachment ? 'Proof • ' : ''}View Pass &gt;
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Create / Edit Exit Pass Modal */}
      <Modal
        visible={showIssueModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIssueModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>
                {editingPass ? `Edit Pass ${editingPass.pass_number}` : 'Issue Authorized Exit Pass'}
              </Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!editingPass && allowStudentPass && (
                <View style={styles.switchRow}>
                  <TouchableOpacity
                    style={[styles.switchBtn, passScope === 'STUDENT' && styles.switchBtnActive]}
                    onPress={() => {
                      setPassScope('STUDENT');
                      setForm((p) => ({ ...p, pass_type: STUDENT_PASS_TYPES[0] }));
                    }}
                  >
                    <Text
                      style={[styles.switchText, passScope === 'STUDENT' && styles.switchTextActive]}
                    >
                      Student Pass
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.switchBtn, passScope === 'TEACHER' && styles.switchBtnActive]}
                    onPress={() => {
                      setPassScope('TEACHER');
                      setForm((p) => ({ ...p, pass_type: TEACHER_PASS_TYPES[0] }));
                    }}
                  >
                    <Text
                      style={[styles.switchText, passScope === 'TEACHER' && styles.switchTextActive]}
                    >
                      Official Locator Slip
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Searchable Student Picker */}
              {!editingPass && allowStudentPass && passScope === 'STUDENT' && (
                <>
                  <Text style={styles.inputLabel}>Select Student *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Type student name or LRN to filter..."
                    placeholderTextColor={palette.textMuted}
                    value={studentPickerSearch}
                    onChangeText={setStudentPickerSearch}
                  />
                  <ChipRow
                    options={filteredStudentChoices.map((st) => ({
                      key: String(st.id),
                      label: `${st.full_name} (${st.section_name || st.lrn})`,
                    }))}
                    selected={form.student_id}
                    onSelect={(id) => setForm((p) => ({ ...p, student_id: id }))}
                    contentContainerStyle={{ paddingVertical: 6 }}
                  />
                </>
              )}

              {/* Teacher Picker for School Leaders issuing Official Locator Slips */}
              {!editingPass && passScope === 'TEACHER' && isLeader && teacherChoices.length > 0 && (
                <>
                  <Text style={styles.inputLabel}>Select Teacher *</Text>
                  <ChipRow
                    options={teacherChoices.map((t) => ({
                      key: String(t.id),
                      label: t.full_name,
                    }))}
                    selected={form.teacher_id}
                    onSelect={(id) => setForm((p) => ({ ...p, teacher_id: id }))}
                    contentContainerStyle={{ paddingVertical: 6 }}
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Pass Type</Text>
              <ChipRow
                options={passTypePresets.map((pt) => ({ key: pt, label: pt }))}
                selected={form.pass_type}
                onSelect={(pt) => setForm((p) => ({ ...p, pass_type: pt }))}
                contentContainerStyle={{ paddingVertical: 4 }}
              />

              <Text style={styles.inputLabel}>Destination *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="e.g. School Clinic, Division Office"
                placeholderTextColor={palette.textMuted}
                maxLength={160}
                value={form.destination}
                onChangeText={(val) => setForm({ ...form, destination: val })}
              />

              <Text style={styles.inputLabel}>Official Reason *</Text>
              <TextInput
                style={[styles.inputField, { height: 70, textAlignVertical: 'top', paddingTop: 8 }]}
                placeholder="Enter reason for leaving campus..."
                placeholderTextColor={palette.textMuted}
                multiline
                maxLength={300}
                value={form.reason}
                onChangeText={(val) => setForm({ ...form, reason: val })}
              />

              {!editingPass && (
                <>
                  <Text style={styles.inputLabel}>Allowed Duration (Hours, 1 to 12)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="2"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="numeric"
                    maxLength={2}
                    value={form.duration_hours}
                    onChangeText={(val) => setForm({ ...form, duration_hours: val })}
                  />
                </>
              )}

              <ImageUploadField
                label="Supporting Document / Proof Photo (Optional)"
                helperText="Attach travel order, clinic slip, or parent letter image."
                value={attachmentBase64 || attachmentPreview}
                serverBase={serverBase}
                variant="proof"
                onChange={(dataUrl) => {
                  setAttachmentBase64(dataUrl);
                  setAttachmentPreview(dataUrl);
                }}
                onRemove={() => {
                  setAttachmentBase64(null);
                  setAttachmentPreview(null);
                }}
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.65 }]}
                onPress={() => void handleIssueSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {editingPass ? 'Save Pass Changes' : 'Issue Exit Pass'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pass Slip Detail Modal */}
      <Modal
        visible={Boolean(selectedPass)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPass(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Exit Pass Details</Text>
              <TouchableOpacity onPress={() => setSelectedPass(null)}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedPass && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.qrArea}>
                  <View style={styles.qrQuietZone}>
                    <QRCode
                      value={`ATTENDSURE-PASS:${cleanText(selectedPass.pass_number, 64)}`}
                      size={155}
                      color={QR_COLORS.foreground}
                      backgroundColor={QR_COLORS.background}
                    />
                  </View>
                  <Text style={styles.qrHint}>
                    {selectedPass.guardian_notice ||
                      'This official pass protects the holder from false alerts until the scheduled return time.'}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pass Number:</Text>
                  <Text style={styles.infoVal}>{selectedPass.pass_number}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Holder:</Text>
                  <Text style={styles.infoVal}>{selectedPass.person_name}</Text>
                </View>
                {selectedPass.pass_type ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Pass Type:</Text>
                    <Text style={styles.infoVal}>{selectedPass.pass_type}</Text>
                  </View>
                ) : null}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Destination:</Text>
                  <Text style={styles.infoVal}>{selectedPass.destination}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reason:</Text>
                  <Text style={styles.infoVal}>{selectedPass.reason}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status:</Text>
                  <Text style={styles.infoVal}>{selectedPass.pass_status}</Text>
                </View>

                {resolveMediaUrl(selectedPass.attachment_url || selectedPass.attachment, serverBase) ? (
                  <View style={styles.proofBox}>
                    <Text style={styles.infoLabel}>Attached Proof Document:</Text>
                    <Image
                      source={{
                        uri: resolveMediaUrl(
                          selectedPass.attachment_url || selectedPass.attachment,
                          serverBase
                        )!,
                      }}
                      style={styles.proofImage}
                      contentFit="contain"
                    />
                  </View>
                ) : null}

                {(selectedPass.pass_status === 'ACTIVE' || selectedPass.pass_status === 'OVERDUE') && (
                  <TouchableOpacity
                    style={[styles.confirmExitBtn, actionBusy && { opacity: 0.6 }]}
                    onPress={() => void handleMarkReturned(selectedPass)}
                    disabled={actionBusy}
                  >
                    <Ionicons name="checkmark-circle" size={16} color={palette.onPrimary} />
                    <Text style={styles.confirmExitBtnText}>Mark Returned to Campus</Text>
                  </TouchableOpacity>
                )}

                {isLeader &&
                  selectedPass.pass_scope === 'TEACHER' &&
                  (selectedPass.pass_status === 'ACTIVE' || selectedPass.pass_status === 'OVERDUE') && (
                    <TouchableOpacity
                      style={[
                        styles.confirmExitBtn,
                        { backgroundColor: palette.success, marginTop: 8 },
                        actionBusy && { opacity: 0.6 },
                      ]}
                      onPress={() => void handleApprovePass(selectedPass)}
                      disabled={actionBusy}
                    >
                      <Ionicons name="shield-checkmark-outline" size={16} color={palette.onPrimary} />
                      <Text style={styles.confirmExitBtnText}>Approve Official Locator Slip</Text>
                    </TouchableOpacity>
                  )}

                {isLeader && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.confirmExitBtn, { flex: 1, marginTop: 0, backgroundColor: palette.primarySoft }]}
                      onPress={() => openEditModal(selectedPass)}
                      disabled={actionBusy}
                    >
                      <Ionicons name="create-outline" size={15} color={palette.primary} />
                      <Text style={[styles.confirmExitBtnText, { color: palette.primary }]}>Edit</Text>
                    </TouchableOpacity>
                    {selectedPass.pass_status === 'ACTIVE' && (
                      <TouchableOpacity
                        style={[styles.confirmExitBtn, { flex: 1, marginTop: 0, backgroundColor: palette.warning }]}
                        onPress={() => void handleCancelPass(selectedPass)}
                        disabled={actionBusy}
                      >
                        <Text style={styles.confirmExitBtnText}>Cancel Pass</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.confirmExitBtn, { width: 46, marginTop: 0, backgroundColor: palette.danger }]}
                      onPress={() => handleDeletePass(selectedPass)}
                      disabled={actionBusy}
                      accessibilityLabel="Delete Exit Pass"
                    >
                      <Ionicons name="trash-outline" size={16} color={palette.onPrimary} />
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    headerSubtitle: { fontSize: fonts.xs, color: palette.textSecondary },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.buttonBg,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    newBtnText: { color: palette.onPrimary, fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 14,
      marginTop: 10,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary },
    filterRow: { paddingHorizontal: 14, paddingVertical: 10 },
    filterChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 99,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    filterChipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    filterChipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    filterChipTextActive: { color: palette.onPrimary },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
    centerText: { fontSize: fonts.sm, color: palette.textSecondary },
    listContent: { paddingHorizontal: 14, paddingBottom: 115, gap: 10 },
    emptyBox: { alignItems: 'center', paddingVertical: 44, gap: 6 },
    emptyTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    emptySub: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center' },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 6,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    passCode: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    holderType: { fontSize: fonts.xxs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusPillText: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold },
    holderName: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    reasonText: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
    cardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    dateText: { fontSize: fonts.xs, color: palette.textMuted },
    cardAction: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      justifyContent: 'center',
      padding: 16,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderRadius: 18,
      padding: 16,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: palette.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    modalHeading: { fontSize: fonts.lg, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    switchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    switchBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
    },
    switchBtnActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    switchText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textSecondary },
    switchTextActive: { color: palette.onPrimary },
    pickerChip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    pickerChipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    pickerChipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    pickerChipTextActive: { color: palette.onPrimary },
    inputLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
      marginTop: 8,
      marginBottom: 4,
    },
    inputField: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    submitBtn: {
      backgroundColor: palette.buttonBg,
      height: 46,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    submitBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
    qrArea: { alignItems: 'center', marginBottom: 12 },
    qrQuietZone: {
      backgroundColor: QR_COLORS.background,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 8,
    },
    qrHint: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center' },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 10,
    },
    infoLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    infoVal: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
      flex: 1,
      textAlign: 'right',
    },
    proofBox: {
      marginTop: 10,
      gap: 6,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    proofImage: {
      width: '100%',
      height: 150,
      borderRadius: 8,
    },
    confirmExitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 10,
      backgroundColor: palette.buttonBg,
      marginTop: 12,
    },
    confirmExitBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
  });

export default GatePassScreen;
