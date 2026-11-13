/**
 * AttendSure V3 - Mobile Classroom Attendance Camera Scanner
 * File: mobile/src/screens/ScannerScreen.tsx
 * Optical camera only. OTG barcode gun handling is reserved for the web application.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Vibration,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../constants/theme';

interface VerifiedStudent {
  student_id: number;
  student_name: string;
  lrn: string;
  section: string;
  authorization_role: string;
  scanned_at: string;
  photo_url?: string | null;
  gate_status_note?: string;
  is_duplicate?: boolean;
}

export const ScannerScreen: React.FC = () => {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [torchOn, setTorchOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeStudent, setActiveStudent] = useState<VerifiedStudent | null>(null);
  const [scannedHistory, setScannedHistory] = useState<VerifiedStudent[]>([]);
  const [showHistorySheet, setShowHistorySheet] = useState(false);

  // Fast scanning locks: prevent redundant camera frame triggers
  const isProcessingRef = useRef(false);
  const lastScannedCodeRef = useRef('');
  const lastScannedTimeRef = useRef(0);
  const laserAnim = useRef(new Animated.Value(0)).current;

  // Viewfinder laser line animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [laserAnim]);

  // Cybersecurity: Clean and validate QR code data before dispatching
  const sanitizeScanInput = (raw: string): string | null => {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.trim().replace(/[\r\n\t]/g, '');

    // Allow only alphanumeric identifiers, dashes, and underscores (3 to 64 characters)
    const validPattern = /^[a-zA-Z0-9\-_:]{3,64}$/;
    if (!validPattern.test(clean)) return null;
    return clean;
  };

  const handleProcessCode = useCallback(
    async (rawCode: string) => {
      const cleanCode = sanitizeScanInput(rawCode);
      const now = Date.now();

      // Drop malicious, malformed, or rapid duplicate camera triggers
      if (!cleanCode) return;
      if (isProcessingRef.current) return;
      if (cleanCode === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 4000) {
        return;
      }

      isProcessingRef.current = true;
      lastScannedCodeRef.current = cleanCode;
      lastScannedTimeRef.current = now;
      setLoading(true);

      try {
        const deviceUuid = `MOBILE-${Platform.OS}-${user?.username || 'STAFF'}`;
        const res = await apiClient.post('academics/classroom-scan/', {
          code: cleanCode,
          device_uuid: deviceUuid,
        });

        if (res.data?.success) {
          const student: VerifiedStudent = {
            student_id: res.data.student_id,
            student_name: res.data.student_name,
            lrn: res.data.lrn,
            section: res.data.section,
            authorization_role: res.data.authorization_role || 'Faculty',
            scanned_at: res.data.scanned_at,
            photo_url: res.data.photo_url || null,
            gate_status_note: res.data.gate_status_note,
            is_duplicate: Boolean(res.data.is_duplicate),
          };

          setActiveStudent(student);

          if (student.is_duplicate) {
            Vibration.vibrate(120);
          } else {
            Vibration.vibrate([0, 50, 40, 50]);
            setScannedHistory((prev) => [
              student,
              ...prev.filter((item) => item.lrn !== student.lrn),
            ]);
          }
        }
      } catch (err: any) {
        Vibration.vibrate(250);
        const errorMessage =
          err?.response?.data?.error ||
          'Attendance could not be recorded. Ensure the student is enrolled in this section.';
        Alert.alert('Attendance Alert', errorMessage);
      } finally {
        setLoading(false);
        // Small delay before unlocking camera frames to keep processing smooth
        setTimeout(() => {
          isProcessingRef.current = false;
        }, 1200);
      }
    },
    [user]
  );

  if (!permission) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <Ionicons name="camera-outline" size={56} color={COLORS.primary} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionDesc}>
            The mobile application uses your phone camera to scan student ID cards for classroom attendance.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.btnTextWhite}>Allow Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const laserTranslate = laserAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Classroom Scanner</Text>
          <Text style={styles.headerSubtitle}>Optical Camera Attendance Mode</Text>
        </View>

        <TouchableOpacity
          style={[styles.actionIconBtn, torchOn && styles.actionIconBtnActive]}
          onPress={() => setTorchOn(!torchOn)}
        >
          <Ionicons
            name={torchOn ? 'flash' : 'flash-outline'}
            size={18}
            color={torchOn ? '#f59e0b' : '#334155'}
          />
        </TouchableOpacity>
      </View>

      {/* Main Camera Viewport */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'code128', 'ean13'],
          }}
          onBarcodeScanned={({ data }) => {
            if (data) {
              handleProcessCode(data);
            }
          }}
        />

        {/* Viewfinder Target */}
        <View style={styles.viewfinderCenter}>
          <View style={styles.targetWindow}>
            <Animated.View
              style={[
                styles.laserLine,
                { transform: [{ translateY: laserTranslate }] },
              ]}
            />
          </View>
          <Text style={styles.viewfinderHint}>Align Student QR Code inside frame</Text>
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color="#ffffff" />
            <Text style={styles.loadingOverlayText}>Checking record...</Text>
          </View>
        )}
      </View>

      {/* Verified Student Confirmation Card */}
      {activeStudent && (
        <View style={styles.verifiedCard}>
          <View style={styles.verifiedRow}>
            <View style={styles.avatarWrap}>
              {activeStudent.photo_url ? (
                <Image source={{ uri: activeStudent.photo_url }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={24} color="#ffffff" />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.verifiedHeaderLine}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {activeStudent.student_name}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: activeStudent.is_duplicate ? '#fef3c7' : '#ecfdf5' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: activeStudent.is_duplicate ? '#d97706' : '#059669' },
                    ]}
                  >
                    {activeStudent.is_duplicate ? 'ALREADY SCANNED' : 'PRESENT'}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionText}>
                LRN: {activeStudent.lrn} &bull; {activeStudent.section}
              </Text>
              <Text style={styles.authBadge}>
                Recorded by {activeStudent.authorization_role} at {activeStudent.scanned_at}
              </Text>
            </View>

            <TouchableOpacity onPress={() => setActiveStudent(null)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom Bar: Scanned Count & Class List */}
      <View style={styles.bottomBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="people-outline" size={16} color="#64748b" />
          <Text style={styles.bottomBarText}>
            Class List Scanned Today:{' '}
            <Text style={{ fontWeight: '800', color: COLORS.primary }}>
              {scannedHistory.length}
            </Text>
          </Text>
        </View>

        {scannedHistory.length > 0 && (
          <TouchableOpacity onPress={() => setShowHistorySheet(!showHistorySheet)}>
            <Text style={styles.viewHistoryText}>
              {showHistorySheet ? 'Hide List' : 'View Class List'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Class List Drawer */}
      {showHistorySheet && (
        <View style={styles.historyDrawer}>
          <Text style={styles.drawerTitle}>Class List Scans ({scannedHistory.length})</Text>
          <FlatList
            data={scannedHistory}
            keyExtractor={(item) => item.lrn}
            style={{ maxHeight: 180 }}
            renderItem={({ item }) => (
              <View style={styles.historyItem}>
                <Text style={styles.historyName}>{item.student_name}</Text>
                <Text style={styles.historyTime}>{item.scanned_at}</Text>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#003460' },
  headerSubtitle: { fontSize: 11, color: '#64748b' },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconBtnActive: { backgroundColor: '#fef3c7' },
  cameraContainer: { flex: 1, position: 'relative', backgroundColor: '#000000' },
  viewfinderCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  targetWindow: {
    width: 220,
    height: 220,
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  laserLine: {
    width: '100%',
    height: 2,
    backgroundColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  viewfinderHint: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  loadingOverlayText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  verifiedCard: {
    position: 'absolute',
    bottom: 52,
    left: 12,
    right: 12,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#004b87',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44 },
  verifiedHeaderLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  studentName: { fontSize: 14, fontWeight: '800', color: '#0f172a', flex: 1 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 9.5, fontWeight: '800' },
  sectionText: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginTop: 1 },
  authBadge: { fontSize: 10, color: '#64748b', marginTop: 2 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  bottomBarText: { fontSize: 12, color: '#64748b' },
  viewHistoryText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  historyDrawer: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  drawerTitle: { fontSize: 11.5, fontWeight: '800', color: '#64748b', marginBottom: 6 },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyName: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
  historyTime: { fontSize: 11, color: '#94a3b8' },
  permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  permissionTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 14 },
  permissionDesc: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 18,
  },
  btnTextWhite: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});

export default ScannerScreen;