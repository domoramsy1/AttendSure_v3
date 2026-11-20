/**
 * AttendSure Mobile - Exit Permits & Official Travel Passes
 * File: mobile/src/screens/GatePassScreen.tsx
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
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import {
  cleanText,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';

const PASSES_CACHE_KEY = 'attendsure_cached_exit_passes';

export interface GatePassItem {
  id: number;
  pass_number: string;
  bearer_type: 'STUDENT' | 'FACULTY';
  student?: number | null;
  student_name?: string;
  student_lrn?: string;
  faculty?: number | null;
  faculty_name?: string;
  faculty_emp_id?: string;
  pass_type: string;
  reason: string;
  valid_from: string;
  valid_to: string;
  status: 'PENDING' | 'ACTIVE' | 'USED' | 'DECLINED' | 'EXPIRED';
  attachment_url?: string | null;
  adviser_name?: string;
}

interface GatePassScreenProps {
  onBack?: () => void;
}

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

const showNotice = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const GatePassScreen: React.FC<GatePassScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const userRole = String(user?.role || user?.system_role || 'FACULTY').trim().toUpperCase();
  const isPrincipalOrAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD'].includes(userRole);
  const canIssuePass = userRole !== 'PARENT';
  const canConfirmExit = [
    'ADMIN',
    'SUPERADMIN',
    'PRINCIPAL',
    'DEPT_HEAD',
    'FACULTY',
    'ADVISER',
    'STAFF',
    'EMPLOYEE',
  ].includes(userRole);

  const [passes, setPasses] = useState<GatePassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedPass, setSelectedPass] = useState<GatePassItem | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [passTarget, setPassTarget] = useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [reviewingPass, setReviewingPass] = useState<GatePassItem | null>(null);

  const [form, setForm] = useState({
    student_id: '',
    pass_type: 'Medical / Health Emergency',
    reason: '',
    duration_hours: '4',
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
        const cached = await AsyncStorage.getItem(PASSES_CACHE_KEY);
        if (cached && isMountedRef.current && !controller.signal.aborted) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) setPasses(parsed);
        }
      } catch {}
    }

    try {
      const res = await apiClient.get<{ results?: GatePassItem[] } | GatePassItem[]>(
        'gate-passes/',
        { signal: controller.signal }
      );
      if (!isMountedRef.current || controller.signal.aborted) return;
      const data = res.data;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : [];
      setPasses(list);
      AsyncStorage.setItem(PASSES_CACHE_KEY, JSON.stringify(list)).catch(() => {});
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
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchPasses(false);
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [fetchPasses]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchPasses(true);
  };

  const filteredPasses = useMemo(() => {
    const q = cleanText(searchQuery, 80).toLowerCase();
    return passes.filter((p) => {
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const passNum = (p.pass_number || '').toLowerCase();
      const holder = (p.student_name || p.faculty_name || '').toLowerCase();
      const reason = (p.reason || '').toLowerCase();
      const matchesSearch = !q || passNum.includes(q) || holder.includes(q) || reason.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [passes, statusFilter, searchQuery]);

  const handleIssueSubmit = async () => {
    let parsedStudentId: number | null = null;
    if (passTarget === 'STUDENT') {
      const cleanStudentId = cleanText(form.student_id, 12);
      if (!cleanStudentId) {
        showNotice('Required', 'Please enter the Student ID Number.');
        return;
      }
      parsedStudentId = Number.parseInt(cleanStudentId, 10);
      if (
        !Number.isFinite(parsedStudentId) ||
        parsedStudentId <= 0 ||
        String(parsedStudentId) !== cleanStudentId
      ) {
        showNotice('Invalid Student ID', 'Please enter a valid numeric Student ID.');
        return;
      }
    }

    const cleanedReason = cleanText(form.reason, 300);
    if (!cleanedReason) {
      showNotice('Required', 'Please enter a valid reason or destination.');
      return;
    }

    const parsedHours = Number.parseInt(cleanText(form.duration_hours, 2), 10);
    const hours = Math.max(1, Math.min(12, Number.isFinite(parsedHours) ? parsedHours : 4));
    const now = new Date();
    const expiry = new Date(now.getTime() + hours * 3600000);

    setSubmitting(true);
    try {
      const payload: Record<string, string | number> = {
        bearer_type: passTarget,
        pass_type: cleanText(form.pass_type, 80),
        reason: cleanedReason,
        valid_from: now.toISOString(),
        valid_to: expiry.toISOString(),
      };

      if (passTarget === 'STUDENT' && parsedStudentId !== null) {
        payload.student = parsedStudentId;
      }

      await apiClient.post('gate-passes/', payload);
      if (!isMountedRef.current) return;

      showNotice(
        'Saved',
        passTarget === 'FACULTY'
          ? 'Your travel pass request was sent to the Principal or School Admin for review.'
          : 'Student exit pass created and school office notified.'
      );

      setShowIssueModal(false);
      setForm({
        student_id: '',
        pass_type: 'Medical / Health Emergency',
        reason: '',
        duration_hours: '4',
      });
      void fetchPasses(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice(
        'Could Not Submit',
        getFriendlyErrorMessage(err, 'Unable to submit the pass request. Please try again.')
      );
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  };

  const handleApprovePass = async (pass: GatePassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(`gate-passes/${encodeURIComponent(String(pass.id))}/approve/`);
      if (!isMountedRef.current) return;
      showNotice('Approved', 'Travel pass approved and now active.');
      setReviewingPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Error', getFriendlyErrorMessage(err, 'Could not approve this pass.'));
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const executeDeclinePass = async (pass: GatePassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(`gate-passes/${encodeURIComponent(String(pass.id))}/decline/`, {
        reason: 'Declined after document review.',
      });
      if (!isMountedRef.current) return;
      showNotice('Declined', 'Pass request has been marked as declined.');
      setReviewingPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Error', getFriendlyErrorMessage(err, 'Could not decline this pass.'));
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleDeclinePass = (pass: GatePassItem) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Decline this travel pass request?')) {
        void executeDeclinePass(pass);
      }
      return;
    }
    Alert.alert('Decline Pass', 'Decline this travel pass request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Decline',
        style: 'destructive',
        onPress: () => void executeDeclinePass(pass),
      },
    ]);
  };

  const handleConfirmExit = async (pass: GatePassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.post(`gate-passes/${encodeURIComponent(String(pass.id))}/mark-used/`);
      if (!isMountedRef.current) return;
      showNotice('Pass Used', 'Departure recorded and pass marked as used.');
      setSelectedPass(null);
      void fetchPasses(true);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Error', getFriendlyErrorMessage(err, 'Could not update pass status.'));
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const executeDeletePass = async (pass: GatePassItem) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await apiClient.delete(`gate-passes/${encodeURIComponent(String(pass.id))}/`);
      if (!isMountedRef.current) return;
      setPasses((prev) => prev.filter((item) => item.id !== pass.id));
      setSelectedPass(null);
      showNotice('Deleted', `Pass #${pass.pass_number} has been removed.`);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice('Delete Failed', getFriendlyErrorMessage(err, 'Could not remove this pass.'));
    } finally {
      if (isMountedRef.current) setActionBusy(false);
    }
  };

  const handleDeletePass = (pass: GatePassItem) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Delete pass #${pass.pass_number}?`)) {
        void executeDeletePass(pass);
      }
      return;
    }
    Alert.alert('Delete Pass', `Permanently delete pass #${pass.pass_number}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void executeDeletePass(pass) },
    ]);
  };

  const getStatusStyle = (st: GatePassItem['status']) => {
    if (st === 'ACTIVE') return { bg: palette.successLight, text: palette.success };
    if (st === 'PENDING') return { bg: palette.warningLight, text: palette.warning };
    if (st === 'DECLINED') return { bg: palette.dangerLight, text: palette.danger };
    return { bg: palette.surfaceSubtle, text: palette.textMuted };
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={onBack}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={palette.primary} />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerTitle}>Exit &amp; Travel Passes</Text>
            <Text style={styles.headerSubtitle}>Student Permits &amp; Official Travel</Text>
          </View>
        </View>

        {canIssuePass && (
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => {
              setPassTarget('STUDENT');
              setShowIssueModal(true);
            }}
          >
            <Ionicons name="add" size={16} color={palette.onPrimary} />
            <Text style={styles.newBtnText}>New Pass</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={palette.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pass number, name, or reason..."
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

      {/* Filter Row */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {['ACTIVE', 'PENDING', 'ALL', 'USED', 'DECLINED'].map((st) => {
            const active = statusFilter === st;
            return (
              <TouchableOpacity
                key={st}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(st)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {st === 'PENDING' ? 'Pending Review' : st}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Passes List */}
      {loading && passes.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.centerText}>Loading passes...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPasses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[palette.primary]}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="document-text-outline" size={38} color={palette.textMuted} />
              <Text style={styles.emptyTitle}>No passes found</Text>
              <Text style={styles.emptySub}>
                Approved and pending student exit or faculty travel passes appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const holderName =
              item.bearer_type === 'STUDENT' ? item.student_name : item.faculty_name;
            const isPending = item.status === 'PENDING';
            const pillColors = getStatusStyle(item.status);

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() =>
                  isPending && isPrincipalOrAdmin ? setReviewingPass(item) : setSelectedPass(item)
                }
              >
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.passCode}>{item.pass_number}</Text>
                    <Text style={styles.holderType}>{item.bearer_type} PASS</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pillColors.bg }]}>
                    <Text style={[styles.statusPillText, { color: pillColors.text }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.holderName}>{holderName || 'Pass Holder'}</Text>
                <Text style={styles.reasonText} numberOfLines={2}>
                  {item.reason}
                </Text>

                <View style={styles.cardBottom}>
                  <Text style={styles.dateText}>
                    Valid until:{' '}
                    {item.valid_to && !Number.isNaN(Date.parse(item.valid_to))
                      ? new Date(item.valid_to).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </Text>
                  {isPending && isPrincipalOrAdmin ? (
                    <Text style={[styles.cardAction, { color: palette.warning }]}>
                      Review Request &gt;
                    </Text>
                  ) : (
                    <Text style={styles.cardAction}>View Pass &gt;</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* MODAL 1: Create Pass */}
      <Modal
        visible={showIssueModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIssueModal(false)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Create Exit or Travel Pass</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.switchRow}>
                <TouchableOpacity
                  style={[styles.switchBtn, passTarget === 'STUDENT' && styles.switchBtnActive]}
                  onPress={() => setPassTarget('STUDENT')}
                >
                  <Text
                    style={[styles.switchText, passTarget === 'STUDENT' && styles.switchTextActive]}
                  >
                    Student Exit Pass
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.switchBtn, passTarget === 'FACULTY' && styles.switchBtnActive]}
                  onPress={() => setPassTarget('FACULTY')}
                >
                  <Text
                    style={[styles.switchText, passTarget === 'FACULTY' && styles.switchTextActive]}
                  >
                    Faculty Travel Pass
                  </Text>
                </TouchableOpacity>
              </View>

              {passTarget === 'STUDENT' ? (
                <>
                  <Text style={styles.inputLabel}>Student ID Number *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Enter Student ID"
                    placeholderTextColor={palette.textMuted}
                    keyboardType="numeric"
                    maxLength={12}
                    value={form.student_id}
                    onChangeText={(val) => setForm({ ...form, student_id: val })}
                  />
                </>
              ) : (
                <Text style={styles.noticeText}>
                  Your travel pass request will be sent to the Principal or School Admin for review.
                </Text>
              )}

              <Text style={styles.inputLabel}>Reason &amp; Destination *</Text>
              <TextInput
                style={[styles.inputField, { height: 72, textAlignVertical: 'top', paddingTop: 8 }]}
                placeholder="State destination and purpose..."
                placeholderTextColor={palette.textMuted}
                multiline
                maxLength={300}
                value={form.reason}
                onChangeText={(val) => setForm({ ...form, reason: val })}
              />

              <Text style={styles.inputLabel}>Supporting Proof (Optional)</Text>
              <View style={styles.proofBox}>
                <Ionicons name="document-attach-outline" size={18} color={palette.primary} />
                <Text style={styles.proofText}>
                  Supporting files can be attached from the school web portal if needed.
                </Text>
              </View>

              <Text style={styles.inputLabel}>Allowed Duration (Hours, 1 to 12)</Text>
              <TextInput
                style={styles.inputField}
                placeholder="4"
                placeholderTextColor={palette.textMuted}
                keyboardType="numeric"
                maxLength={2}
                value={form.duration_hours}
                onChangeText={(val) => setForm({ ...form, duration_hours: val })}
              />

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.65 }]}
                onPress={() => void handleIssueSubmit()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Pass Request</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Principal / Admin Review */}
      <Modal
        visible={Boolean(reviewingPass)}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewingPass(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Review Travel Pass</Text>
              <TouchableOpacity onPress={() => setReviewingPass(null)}>
                <Ionicons name="close" size={22} color={palette.textPrimary} />
              </TouchableOpacity>
            </View>

            {reviewingPass && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.detailTitle}>
                  Applicant: {reviewingPass.faculty_name || reviewingPass.student_name || 'Applicant'}
                </Text>
                <Text style={styles.detailDesc}>Reason: {reviewingPass.reason}</Text>

                <View style={styles.docBox}>
                  <Text style={styles.docBoxLabel}>SUPPORTING DOCUMENT</Text>
                  {reviewingPass.attachment_url ? (
                    <Text style={styles.docBoxStatus}>Proof document attached on record.</Text>
                  ) : (
                    <Text style={[styles.docBoxStatus, { color: palette.danger }]}>
                      No attachment provided.
                    </Text>
                  )}
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.declineBtn, actionBusy && { opacity: 0.6 }]}
                    onPress={() => handleDeclinePass(reviewingPass)}
                    disabled={actionBusy}
                  >
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn, actionBusy && { opacity: 0.6 }]}
                    onPress={() => void handleApprovePass(reviewingPass)}
                    disabled={actionBusy}
                  >
                    <Text style={styles.approveBtnText}>Approve Pass</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Pass QR Slip */}
      <Modal
        visible={Boolean(selectedPass)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPass(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Pass Slip</Text>
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
                      size={180}
                      color="#003460"
                      backgroundColor="#ffffff"
                    />
                  </View>
                  <Text style={styles.qrHint}>
                    Show this pass code to your adviser or school office before leaving campus.
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pass Number:</Text>
                  <Text style={styles.infoVal}>{selectedPass.pass_number}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pass Holder:</Text>
                  <Text style={styles.infoVal}>
                    {selectedPass.bearer_type === 'STUDENT'
                      ? selectedPass.student_name
                      : selectedPass.faculty_name}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Issued By:</Text>
                  <Text style={styles.infoVal}>{selectedPass.adviser_name || 'Class Adviser'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reason:</Text>
                  <Text style={styles.infoVal}>{selectedPass.reason}</Text>
                </View>

                {canConfirmExit && selectedPass.status === 'ACTIVE' && (
                  <TouchableOpacity
                    style={[styles.confirmExitBtn, actionBusy && { opacity: 0.6 }]}
                    onPress={() => void handleConfirmExit(selectedPass)}
                    disabled={actionBusy}
                  >
                    <Ionicons name="checkmark-circle" size={16} color={palette.onPrimary} />
                    <Text style={styles.confirmExitBtnText}>Mark Pass as Used</Text>
                  </TouchableOpacity>
                )}

                {canIssuePass && (isPrincipalOrAdmin || selectedPass.status !== 'USED') && (
                  <TouchableOpacity
                    style={[
                      styles.confirmExitBtn,
                      { backgroundColor: palette.danger, marginTop: 8 },
                      actionBusy && { opacity: 0.6 },
                    ]}
                    onPress={() => handleDeletePass(selectedPass)}
                    disabled={actionBusy}
                  >
                    <Ionicons name="trash-outline" size={16} color={palette.onPrimary} />
                    <Text style={styles.confirmExitBtnText}>Delete Pass</Text>
                  </TouchableOpacity>
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
      backgroundColor: palette.buttonBg,
      paddingVertical: 7,
      paddingHorizontal: 11,
      borderRadius: 10,
      gap: 4,
    },
    newBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.surface,
      marginHorizontal: 12,
      marginTop: 10,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 6,
    },
    searchInput: { flex: 1, fontSize: fonts.sm, color: palette.textPrimary, padding: 0 },
    filterRow: { paddingHorizontal: 12, paddingVertical: 8 },
    filterChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
    },
    filterChipActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    filterChipText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    filterChipTextActive: { color: palette.onPrimary },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    centerText: { fontSize: fonts.sm, color: palette.textSecondary, marginTop: 6 },
    emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary, marginTop: 8 },
    emptySub: { fontSize: fonts.xs, color: palette.textSecondary, textAlign: 'center', marginTop: 4 },
    listContent: { paddingHorizontal: 12, paddingBottom: 110, gap: 8 },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    passCode: { fontSize: fonts.xs, fontFamily: fonts.mono, fontWeight: fonts.weight.extrabold, color: palette.primary },
    holderType: { fontSize: 9.5, fontWeight: fonts.weight.bold, color: palette.textMuted },
    statusPill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
    statusPillText: { fontSize: 9.5, fontWeight: fonts.weight.extrabold },
    holderName: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary, marginTop: 4 },
    reasonText: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 2 },
    cardBottom: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    dateText: { fontSize: fonts.xs, color: palette.textSecondary },
    cardAction: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary },
    modalBg: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'center', padding: 16 },
    modalCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
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
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    modalHeading: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    switchRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    switchBtn: {
      flex: 1,
      paddingVertical: 9,
      alignItems: 'center',
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    switchBtnActive: { backgroundColor: palette.buttonBg, borderColor: palette.buttonBg },
    switchText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary },
    switchTextActive: { color: palette.onPrimary },
    noticeText: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      backgroundColor: palette.surfaceSubtle,
      padding: 10,
      borderRadius: 8,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    inputLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary, marginTop: 8, marginBottom: 4 },
    inputField: {
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: fonts.sm,
      color: palette.textPrimary,
      backgroundColor: palette.surfaceSubtle,
    },
    proofBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      backgroundColor: palette.primarySoft,
      borderRadius: 8,
    },
    proofText: { flex: 1, fontSize: fonts.xs, color: palette.textPrimary, fontWeight: fonts.weight.semibold },
    submitBtn: {
      backgroundColor: palette.buttonBg,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 14,
    },
    submitBtnText: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.onPrimary },
    detailTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    detailDesc: { fontSize: fonts.sm, color: palette.textSecondary, marginTop: 4 },
    docBox: {
      marginVertical: 12,
      padding: 10,
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
    },
    docBoxLabel: { fontSize: fonts.xxs, fontWeight: fonts.weight.extrabold, color: palette.textMuted },
    docBoxStatus: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.primary, marginTop: 4 },
    btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    actionBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
    declineBtn: { backgroundColor: palette.dangerBg },
    declineBtnText: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    approveBtn: { backgroundColor: palette.isDark ? '#15803d' : palette.success },
    approveBtnText: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    qrArea: { alignItems: 'center', marginVertical: 10 },
    qrQuietZone: {
      backgroundColor: '#ffffff',
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    qrHint: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 8, textAlign: 'center' },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    infoLabel: { fontSize: fonts.xs, color: palette.textSecondary },
    infoVal: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textPrimary,
      maxWidth: '65%',
      textAlign: 'right',
    },
    confirmExitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: palette.buttonBg,
      paddingVertical: 12,
      borderRadius: 10,
      marginTop: 14,
    },
    confirmExitBtnText: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.onPrimary },
  });

export default GatePassScreen;
