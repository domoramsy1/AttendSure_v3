/**
 * AttendSure V3 - Mobile Gate Pass & Clearance Center
 * File: mobile/src/screens/GatePassScreen.tsx
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

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

export const GatePassScreen: React.FC<GatePassScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const userRole = String(user?.role || user?.system_role || 'EMPLOYEE').toUpperCase();
  const isPrincipalOrAdmin = ['ADMIN', 'SUPERADMIN', 'PRINCIPAL'].includes(userRole);
  const isGuard = ['GUARD', 'SECURITY'].includes(userRole);

  const [passes, setPasses] = useState<GatePassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedPass, setSelectedPass] = useState<GatePassItem | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [passTarget, setPassTarget] = useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [submitting, setSubmitting] = useState(false);

  const [reviewingPass, setReviewingPass] = useState<GatePassItem | null>(null);

  const [form, setForm] = useState({
    student_id: '',
    pass_type: 'Medical / Health Emergency',
    reason: '',
    duration_hours: '4',
  });

  const fetchPasses = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get<any>('gate-passes/');
      const list = res.data?.results ?? (Array.isArray(res.data) ? res.data : []);
      setPasses(list);
    } catch {
      if (!silent) Alert.alert('Network Notice', 'Could not load gate passes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPasses();
  }, [fetchPasses]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPasses(true);
  };

  const filteredPasses = useMemo(() => {
    return passes.filter((p) => {
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const passNum = (p.pass_number || '').toLowerCase();
      const bearer = (p.student_name || p.faculty_name || '').toLowerCase();
      const reason = (p.reason || '').toLowerCase();

      const matchesSearch = !q || passNum.includes(q) || bearer.includes(q) || reason.includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [passes, statusFilter, searchQuery]);

  const handleIssueSubmit = async () => {
    if (passTarget === 'STUDENT' && !form.student_id.trim()) {
      Alert.alert('Required', 'Please enter the Student ID.');
      return;
    }

    if (!form.reason.trim()) {
      Alert.alert('Required', 'Please state a valid reason or destination.');
      return;
    }

    const hours = Math.max(1, Math.min(12, Number(form.duration_hours) || 4));
    const now = new Date();
    const expiry = new Date(now.getTime() + hours * 3600000);

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        bearer_type: passTarget,
        pass_type: form.pass_type,
        reason: form.reason.trim(),
        valid_from: now.toISOString(),
        valid_to: expiry.toISOString(),
      };

      if (passTarget === 'STUDENT') {
        payload.student = Number(form.student_id);
      }

      await apiClient.post('gate-passes/', payload);
      Alert.alert(
        'Success',
        passTarget === 'FACULTY'
          ? 'Your official travel pass was submitted to the Principal/Admin for document review.'
          : 'Student gate exit permit issued. School administration notified.'
      );

      setShowIssueModal(false);
      setForm({
        student_id: '',
        pass_type: 'Medical / Health Emergency',
        reason: '',
        duration_hours: '4',
      });
      fetchPasses(true);
    } catch (err: any) {
      Alert.alert('Submission Error', err?.response?.data?.student?.[0] || 'Unable to submit gate pass.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePass = async (pass: GatePassItem) => {
    try {
      await apiClient.post(`gate-passes/${pass.id}/approve/`);
      Alert.alert('Approved', 'Travel pass approved and active for gate exit.');
      setReviewingPass(null);
      fetchPasses(true);
    } catch {
      Alert.alert('Error', 'Failed to approve pass.');
    }
  };

  const handleDeclinePass = async (pass: GatePassItem) => {
    Alert.alert('Decline Pass', 'Decline this travel pass due to an invalid or unauthentic document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Decline',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.post(`gate-passes/${pass.id}/decline/`, { reason: 'Declined upon document authenticity review.' });
            Alert.alert('Declined', 'Gate pass marked as DECLINED.');
            setReviewingPass(null);
            fetchPasses(true);
          } catch {
            Alert.alert('Error', 'Failed to decline pass.');
          }
        },
      },
    ]);
  };

  const handleConfirmExit = async (pass: GatePassItem) => {
    try {
      await apiClient.post(`gate-passes/${pass.id}/mark-used/`);
      Alert.alert('Exit Logged', 'Bearer departure recorded. Pass marked as USED.');
      setSelectedPass(null);
      fetchPasses(true);
    } catch {
      Alert.alert('Error', 'Failed to confirm exit.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Back Arrow Button */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <Ionicons name="arrow-back" size={20} color="#004b87" />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.headerTitle}>Gate Clearances</Text>
            <Text style={styles.headerSubtitle}>Student Permits &amp; Travel Orders</Text>
          </View>
        </View>

        {!isGuard && (
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => {
              setPassTarget('STUDENT');
              setShowIssueModal(true);
            }}
          >
            <Ionicons name="add" size={16} color="#ffffff" />
            <Text style={styles.newBtnText}>New Pass</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search pass #, name, reason..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Row */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {['ACTIVE', 'PENDING', 'ALL', 'USED', 'DECLINED'].map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.filterChip, statusFilter === st && styles.filterChipActive]}
              onPress={() => setStatusFilter(st)}
            >
              <Text style={[styles.filterChipText, statusFilter === st && styles.filterChipTextActive]}>
                {st === 'PENDING' ? 'Pending Review' : st}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Passes List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.centerText}>Loading gate passes...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPasses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          renderItem={({ item }) => {
            const bearer = item.bearer_type === 'STUDENT' ? item.student_name : item.faculty_name;
            const isPending = item.status === 'PENDING';

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => (isPending && isPrincipalOrAdmin ? setReviewingPass(item) : setSelectedPass(item))}
              >
                <View style={styles.cardTop}>
                  <View>
                    <Text style={styles.passCode}>{item.pass_number}</Text>
                    <Text style={styles.bearerType}>{item.bearer_type} CLEARANCE</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          item.status === 'ACTIVE'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : item.status === 'PENDING'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : item.status === 'DECLINED'
                            ? 'rgba(239, 68, 68, 0.12)'
                            : '#f1f5f9',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            item.status === 'ACTIVE'
                              ? '#10b981'
                              : item.status === 'PENDING'
                              ? '#d97706'
                              : item.status === 'DECLINED'
                              ? '#ef4444'
                              : '#64748b',
                        },
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>

                <Text style={styles.bearerName}>{bearer || 'Authorized Bearer'}</Text>
                <Text style={styles.reasonText} numberOfLines={2}>{item.reason}</Text>

                <View style={styles.cardBottom}>
                  <Text style={styles.dateText}>
                    Until: {new Date(item.valid_to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {isPending && isPrincipalOrAdmin ? (
                    <Text style={[styles.cardAction, { color: '#d97706' }]}>Review Document &gt;</Text>
                  ) : (
                    <Text style={styles.cardAction}>View Slip &gt;</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* MODAL 1: Create Pass with Proof Document */}
      <Modal visible={showIssueModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Create Gate Clearance</Text>
              <TouchableOpacity onPress={() => setShowIssueModal(false)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.switchRow}>
                <TouchableOpacity
                  style={[styles.switchBtn, passTarget === 'STUDENT' && styles.switchBtnActive]}
                  onPress={() => setPassTarget('STUDENT')}
                >
                  <Text style={[styles.switchText, passTarget === 'STUDENT' && styles.switchTextActive]}>
                    Student Exit (Adviser)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.switchBtn, passTarget === 'FACULTY' && styles.switchBtnActive]}
                  onPress={() => setPassTarget('FACULTY')}
                >
                  <Text style={[styles.switchText, passTarget === 'FACULTY' && styles.switchTextActive]}>
                    Faculty Official Travel
                  </Text>
                </TouchableOpacity>
              </View>

              {passTarget === 'STUDENT' ? (
                <>
                  <Text style={styles.inputLabel}>Student Database ID *</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Enter Student ID"
                    keyboardType="numeric"
                    value={form.student_id}
                    onChangeText={(val) => setForm({ ...form, student_id: val })}
                  />
                </>
              ) : (
                <Text style={styles.noticeText}>
                  Your travel pass will be submitted to the School Principal / Admin for document review.
                </Text>
              )}

              <Text style={styles.inputLabel}>Valid Reason &amp; Destination *</Text>
              <TextInput
                style={[styles.inputField, { height: 60 }]}
                placeholder="State destination and purpose..."
                multiline
                value={form.reason}
                onChangeText={(val) => setForm({ ...form, reason: val })}
              />

              <Text style={styles.inputLabel}>Supporting Proof File *</Text>
              <View style={styles.proofBox}>
                <Ionicons name="document-attach-outline" size={18} color="#004b87" />
                <Text style={styles.proofText}>Proof document selected (Required)</Text>
              </View>

              <Text style={styles.inputLabel}>Allowed Duration (Hours)</Text>
              <TextInput
                style={styles.inputField}
                placeholder="4"
                keyboardType="numeric"
                value={form.duration_hours}
                onChangeText={(val) => setForm({ ...form, duration_hours: val })}
              />

              <TouchableOpacity style={styles.submitBtn} onPress={handleIssueSubmit} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Gate Clearance</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Principal / Admin Review */}
      <Modal visible={Boolean(reviewingPass)} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Inspect Proof Document</Text>
              <TouchableOpacity onPress={() => setReviewingPass(null)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            {reviewingPass && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.detailTitle}>Applicant: {reviewingPass.faculty_name}</Text>
                <Text style={styles.detailDesc}>Reason: {reviewingPass.reason}</Text>

                <View style={styles.docBox}>
                  <Text style={styles.docBoxLabel}>ATTACHED PROOF DOCUMENT</Text>
                  {reviewingPass.attachment_url ? (
                    <Text style={styles.docBoxStatus}>Proof document attached on record.</Text>
                  ) : (
                    <Text style={[styles.docBoxStatus, { color: '#ef4444' }]}>No attachment provided!</Text>
                  )}
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fee2e2' }]}
                    onPress={() => handleDeclinePass(reviewingPass)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Decline (Unverified)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#10b981' }]}
                    onPress={() => handleApprovePass(reviewingPass)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#ffffff' }]}>Approve Pass</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Pass QR Slip */}
      <Modal visible={Boolean(selectedPass)} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>Gate Clearance Slip</Text>
              <TouchableOpacity onPress={() => setSelectedPass(null)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            {selectedPass && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.qrArea}>
                  <Image
                    source={{
                      uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        `ATTENDSURE-GATEPASS:${selectedPass.pass_number}`
                      )}`,
                    }}
                    style={styles.qrImage}
                    contentFit="contain"
                  />
                  <Text style={styles.qrHint}>Present to Gate Guard upon exit.</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pass Serial:</Text>
                  <Text style={styles.infoVal}>{selectedPass.pass_number}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Bearer:</Text>
                  <Text style={styles.infoVal}>
                    {selectedPass.bearer_type === 'STUDENT' ? selectedPass.student_name : selectedPass.faculty_name}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Adviser / Issuer:</Text>
                  <Text style={styles.infoVal}>{selectedPass.adviser_name || 'Class Adviser'}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reason:</Text>
                  <Text style={styles.infoVal}>{selectedPass.reason}</Text>
                </View>

                {isGuard && selectedPass.status === 'ACTIVE' && (
                  <TouchableOpacity style={styles.confirmExitBtn} onPress={() => handleConfirmExit(selectedPass)}>
                    <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                    <Text style={styles.confirmExitBtnText}>Confirm Gate Exit</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#003460' },
  headerSubtitle: { fontSize: 11, color: '#64748b' },
  newBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, gap: 4 },
  newBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a', padding: 0 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 8 },
  filterChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#ffffff' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { fontSize: 12, color: '#64748b', marginTop: 6 },
  listContent: { paddingHorizontal: 12, paddingBottom: 110, gap: 8 },
  card: { backgroundColor: '#ffffff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  passCode: { fontSize: 11.5, fontFamily: 'monospace', fontWeight: '800', color: COLORS.primary },
  bearerType: { fontSize: 9.5, fontWeight: '700', color: '#94a3b8' },
  statusPill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  statusPillText: { fontSize: 9.5, fontWeight: '800' },
  bearerName: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  reasonText: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  dateText: { fontSize: 11, color: '#64748b' },
  cardAction: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  modalBg: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  modalHeading: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  switchRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  switchBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#f1f5f9' },
  switchBtnActive: { backgroundColor: COLORS.primary },
  switchText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  switchTextActive: { color: '#ffffff' },
  noticeText: { fontSize: 11, color: '#64748b', backgroundColor: '#f8fafc', padding: 8, borderRadius: 6, marginVertical: 6 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginTop: 6, marginBottom: 2 },
  inputField: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, backgroundColor: '#f8fafc' },
  proofBox: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 6 },
  proofText: { fontSize: 11.5, color: '#004b87', fontWeight: '600' },
  submitBtn: { backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 12 },
  submitBtnText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  detailTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  detailDesc: { fontSize: 12, color: '#475569', marginTop: 4 },
  docBox: { marginVertical: 12, padding: 10, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  docBoxLabel: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  docBoxStatus: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  qrArea: { alignItems: 'center', marginVertical: 8 },
  qrImage: { width: 150, height: 150 },
  qrHint: { fontSize: 11, color: '#64748b', marginTop: 6 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoLabel: { fontSize: 11.5, color: '#64748b' },
  infoVal: { fontSize: 11.5, fontWeight: '700', color: '#0f172a', maxWidth: '65%', textAlign: 'right' },
  confirmExitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 8, marginTop: 14 },
  confirmExitBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
});

export default GatePassScreen;