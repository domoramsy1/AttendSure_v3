import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { apiClient } from '../api/client';
import { TabType } from '../navigation/MainTabNavigator';

interface MenuScreenProps {
  onSelectScreen: (screen: TabType) => void;
}

const isSafeImageUrl = (url?: string | null): url is string => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!clean || clean === 'null' || clean === 'undefined' || clean === 'none') return false;
  if (clean.startsWith('javascript:') || clean.startsWith('vbscript:')) return false;
  if (clean.startsWith('data:') && !clean.startsWith('data:image/')) return false;
  return (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('/') ||
    clean.startsWith('data:image/')
  );
};

export const MenuScreen: React.FC<MenuScreenProps> = ({ onSelectScreen }) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { isDark, palette, toggleDarkMode } = useThemeMode();

  const [subTab, setSubTab] = useState<'STATS' | 'SIGNALS' | 'ACCOUNT'>('STATS');
  const [photoError, setPhotoError] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [classesList, setClassesList] = useState<any[]>([]);

  const loadProfileMetrics = useCallback(async () => {
    try {
      const [ovRes, clsRes] = await Promise.allSettled([
        apiClient.get('dashboard/overview/'),
        apiClient.get('classroom/class_list/'),
      ]);
      if (ovRes.status === 'fulfilled') setOverview(ovRes.value.data);
      if (clsRes.status === 'fulfilled' && Array.isArray(clsRes.value.data)) {
        setClassesList(clsRes.value.data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadProfileMetrics();
  }, [loadProfileMetrics]);

  const userRole = String(user?.role || user?.system_role || 'FACULTY').toUpperCase();
  const displayName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.username ||
    'Faculty Member';
  const employeeId = user?.employee_id || user?.faculty_id || user?.username || 'ID-001';
  const department = user?.department || 'Junior High School';
  const email = user?.email || `${user?.username || 'faculty'}@attendsure.edu.ph`;

  const photoUri: string | null =
    typeof user?.photo === 'string' && isSafeImageUrl(user.photo) && !photoError
      ? user.photo
      : null;

  const attendanceRate = overview?.attendance_rate ?? 100;
  const scansToday = overview?.classroom_scans_today ?? 0;
  const totalStudents = overview?.total_students ?? 0;
  const pushAlertsToday = overview?.push_alerts_today ?? 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: palette.background }]}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Royal Blue Profile Hero Card */}
      <View
        style={[
          styles.heroHeader,
          {
            backgroundColor: palette.headerBg,
            paddingTop: Math.max(insets.top, 14),
          },
        ]}
      >
        <View style={styles.heroTopBar}>
          <Text style={styles.heroScreenTitle}>Profile</Text>
          <View style={styles.heroTopActions}>
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={toggleDarkMode}
              accessibilityLabel="Toggle dark mode"
            >
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={() => onSelectScreen('settings')}
            >
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Centered Rounded Square Avatar with Camera Badge */}
        <View style={styles.avatarCenterWrap}>
          <View style={styles.avatarOuterFrame}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.avatarSquircle}
                onError={() => setPhotoError(true)}
              />
            ) : (
              <View style={[styles.avatarSquircle, styles.avatarFallback]}>
                <Ionicons name="person" size={44} color="#3B5BDB" />
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={() => onSelectScreen('scanner')}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.heroUserName}>{displayName}</Text>
          <Text style={styles.heroUserSub}>
            {department.toUpperCase()} • ID {employeeId}
          </Text>

          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>
              {userRole === 'PARENT' ? 'Parent Account' : 'Verified Faculty Adviser'}
            </Text>
          </View>
        </View>

        {/* 3-Column Glass Stats Banner */}
        <View style={[styles.glassStatsRow, { backgroundColor: palette.headerSurface }]}>
          <View style={styles.glassStatCol}>
            <Text style={styles.glassStatVal}>{scansToday}</Text>
            <Text style={styles.glassStatLabel}>QR Scans</Text>
          </View>
          <View style={styles.glassDivider} />
          <View style={styles.glassStatCol}>
            <Text style={styles.glassStatVal}>{attendanceRate}%</Text>
            <Text style={styles.glassStatLabel}>Attendance</Text>
          </View>
          <View style={styles.glassDivider} />
          <View style={styles.glassStatCol}>
            <Text style={styles.glassStatVal}>{classesList.length || 1}</Text>
            <Text style={styles.glassStatLabel}>Classes</Text>
          </View>
        </View>
      </View>

      <View style={styles.bodyContent}>
        {/* Dual Action Buttons Row */}
        <View style={styles.dualBtnRow}>
          <TouchableOpacity
            style={[styles.primaryPillBtn, { backgroundColor: palette.primary }]}
            onPress={() => onSelectScreen('settings')}
            activeOpacity={0.85}
          >
            <Ionicons name="pencil-outline" size={16} color="#FFFFFF" />
            <Text style={styles.primaryPillBtnText}>Edit profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryPillBtn, { backgroundColor: palette.primarySoft }]}
            onPress={() => onSelectScreen('scanner')}
            activeOpacity={0.85}
          >
            <Ionicons name="scan-outline" size={16} color={palette.primary} />
            <Text style={[styles.secondaryPillBtnText, { color: palette.primary }]}>
              Face check-in
            </Text>
          </TouchableOpacity>
        </View>

        {/* Segmented Control: Stats | Signals | Account */}
        <View style={[styles.segmentedTrack, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {(['STATS', 'SIGNALS', 'ACCOUNT'] as const).map((tabKey) => {
            const active = subTab === tabKey;
            return (
              <TouchableOpacity
                key={tabKey}
                style={[
                  styles.segmentBtn,
                  active && [styles.segmentBtnActive, { backgroundColor: palette.background, borderColor: palette.border }],
                ]}
                onPress={() => setSubTab(tabKey)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? palette.primary : palette.textSecondary },
                  ]}
                >
                  {tabKey === 'STATS' ? 'Stats' : tabKey === 'SIGNALS' ? 'Signals' : 'Account'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* TAB 1: STATS & RECORD DETAILS */}
        {subTab === 'STATS' && (
          <>
            <View style={styles.pastelGrid}>
              <View style={[styles.pastelStatCard, { backgroundColor: palette.pastelOrangeBg, borderColor: palette.border }]}>
                <View style={styles.pastelCardHeader}>
                  <View style={[styles.pastelIconWrap, { backgroundColor: 'rgba(234, 88, 12, 0.14)' }]}>
                    <Ionicons name="flame-outline" size={18} color={palette.pastelOrangeIcon} />
                  </View>
                  <Text style={[styles.pastelEyebrow, { color: palette.textSecondary }]}>ACTIVE LEARNERS</Text>
                </View>
                <Text style={[styles.pastelBigNumber, { color: palette.pastelOrangeIcon }]}>
                  {totalStudents} <Text style={styles.pastelUnit}>students</Text>
                </Text>
              </View>

              <View style={[styles.pastelStatCard, { backgroundColor: palette.pastelYellowBg, borderColor: palette.border }]}>
                <View style={styles.pastelCardHeader}>
                  <View style={[styles.pastelIconWrap, { backgroundColor: 'rgba(202, 138, 4, 0.14)' }]}>
                    <Ionicons name="flash-outline" size={18} color={palette.pastelYellowIcon} />
                  </View>
                  <Text style={[styles.pastelEyebrow, { color: palette.textSecondary }]}>QR SCANS TODAY</Text>
                </View>
                <Text style={[styles.pastelBigNumber, { color: palette.pastelYellowIcon }]}>
                  {scansToday} <Text style={styles.pastelUnit}>scans</Text>
                </Text>
              </View>

              <View style={[styles.pastelStatCard, { backgroundColor: palette.pastelPurpleBg, borderColor: palette.border }]}>
                <View style={styles.pastelCardHeader}>
                  <View style={[styles.pastelIconWrap, { backgroundColor: 'rgba(126, 34, 206, 0.14)' }]}>
                    <Ionicons name="ribbon-outline" size={18} color={palette.pastelPurpleIcon} />
                  </View>
                  <Text style={[styles.pastelEyebrow, { color: palette.textSecondary }]}>PUSH ALERTS</Text>
                </View>
                <Text style={[styles.pastelBigNumber, { color: palette.pastelPurpleIcon }]}>
                  {pushAlertsToday} <Text style={styles.pastelUnit}>sent</Text>
                </Text>
              </View>

              <View style={[styles.pastelStatCard, { backgroundColor: palette.pastelBlueBg, borderColor: palette.border }]}>
                <View style={styles.pastelCardHeader}>
                  <View style={[styles.pastelIconWrap, { backgroundColor: 'rgba(2, 132, 199, 0.14)' }]}>
                    <Ionicons name="stats-chart-outline" size={18} color={palette.pastelBlueIcon} />
                  </View>
                  <Text style={[styles.pastelEyebrow, { color: palette.textSecondary }]}>ATTENDANCE RATE</Text>
                </View>
                <Text style={[styles.pastelBigNumber, { color: palette.pastelBlueIcon }]}>
                  {attendanceRate}%
                </Text>
              </View>
            </View>

            {/* Profile Details Card */}
            <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.cardEyebrow, { color: palette.textMuted }]}>FACULTY RECORD</Text>
              <Text style={[styles.cardMainTitle, { color: palette.textPrimary }]}>Profile details</Text>

              <View style={[styles.detailRow, { borderBottomColor: palette.border }]}>
                <Text style={[styles.detailLabel, { color: palette.textMuted }]}>EMAIL</Text>
                <Text style={[styles.detailVal, { color: palette.textPrimary }]}>{email}</Text>
              </View>
              <View style={[styles.detailRow, { borderBottomColor: palette.border }]}>
                <Text style={[styles.detailLabel, { color: palette.textMuted }]}>EMPLOYEE ID</Text>
                <Text style={[styles.detailVal, { color: palette.textPrimary }]}>{employeeId}</Text>
              </View>
              <View style={[styles.detailRow, { borderBottomColor: palette.border }]}>
                <Text style={[styles.detailLabel, { color: palette.textMuted }]}>DEPARTMENT</Text>
                <Text style={[styles.detailVal, { color: palette.textPrimary }]}>{department}</Text>
              </View>
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.detailLabel, { color: palette.textMuted }]}>ROLE</Text>
                <Text style={[styles.detailVal, { color: palette.textPrimary }]}>{userRole}</Text>
              </View>
            </View>

            {/* Classes and Subjects Pill Card */}
            <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.cardEyebrow, { color: palette.textMuted }]}>ACADEMICS</Text>
              <Text style={[styles.cardMainTitle, { color: palette.textPrimary }]}>Classes and subjects</Text>
              <Text style={[styles.subGroupLabel, { color: palette.textMuted }]}>ASSIGNED SUBJECTS</Text>

              <View style={styles.subjectPillsWrap}>
                {classesList.length > 0 ? (
                  classesList.map((cls, idx) => (
                    <View
                      key={String(cls.id || idx)}
                      style={[styles.subjectChip, { backgroundColor: palette.surfaceSubtle }]}
                    >
                      <Text style={[styles.subjectChipText, { color: palette.textPrimary }]}>
                        {cls.subject_title || cls.subject_name || cls.name} ({cls.section_name || cls.name})
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={[styles.subjectChip, { backgroundColor: palette.surfaceSubtle }]}>
                    <Text style={[styles.subjectChipText, { color: palette.textPrimary }]}>
                      Advisory Class List Ready
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        {/* TAB 2: CAMPUS SIGNALS */}
        {subTab === 'SIGNALS' && (
          <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.cardEyebrow, { color: palette.textMuted }]}>CAMPUS SIGNALS</Text>
            <Text style={[styles.cardMainTitle, { color: palette.textPrimary }]}>What the portal is tracking</Text>

            <View style={styles.signalsDualRow}>
              <TouchableOpacity
                style={[styles.signalBox, { backgroundColor: palette.pastelGreenBg }]}
                onPress={() => onSelectScreen('class_list')}
              >
                <View style={styles.signalBoxTop}>
                  <View style={[styles.signalIconCard, { backgroundColor: palette.surface }]}>
                    <Ionicons name="qr-code-outline" size={18} color={palette.pastelGreenIcon} />
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.pastelGreenIcon} />
                </View>
                <Text style={[styles.signalBigPct, { color: palette.pastelGreenIcon }]}>{attendanceRate}%</Text>
                <Text style={[styles.signalBoxTitle, { color: palette.textPrimary }]}>Class Presence</Text>
                <Text style={[styles.signalBoxDesc, { color: palette.textSecondary }]}>
                  Verified via USB QR code scanner on faculty PC or laptop.
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.signalBox, { backgroundColor: palette.pastelBlueBg }]}
                onPress={() => onSelectScreen('scanner')}
              >
                <View style={styles.signalBoxTop}>
                  <View style={[styles.signalIconCard, { backgroundColor: palette.surface }]}>
                    <Ionicons name="locate-outline" size={18} color={palette.pastelBlueIcon} />
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={palette.pastelBlueIcon} />
                </View>
                <Text style={[styles.signalBigPct, { color: palette.pastelBlueIcon }]}>GPS</Text>
                <Text style={[styles.signalBoxTitle, { color: palette.textPrimary }]}>Face &amp; Boundary</Text>
                <Text style={[styles.signalBoxDesc, { color: palette.textSecondary }]}>
                  On-device facial recognition inside the campus GPS area.
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TAB 3: ACCOUNT & HELP MENU */}
        {subTab === 'ACCOUNT' && (
          <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.accountCardHeader}>
              <View style={[styles.menuIconSquare, { backgroundColor: palette.surfaceSubtle }]}>
                <Ionicons name="person-circle-outline" size={22} color={palette.primary} />
              </View>
              <View>
                <Text style={[styles.cardEyebrow, { color: palette.textMuted, marginBottom: 0 }]}>ACCOUNT</Text>
                <Text style={[styles.cardMainTitle, { color: palette.textPrimary, marginBottom: 0 }]}>
                  Account &amp; help
                </Text>
              </View>
            </View>

            {/* Dark Mode Toggle Row */}
            <View style={[styles.menuRowItem, { borderBottomColor: palette.border }]}>
              <View style={[styles.menuIconSquare, { backgroundColor: palette.pastelPurpleBg }]}>
                <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={19} color={palette.pastelPurpleIcon} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.textPrimary }]}>Dark mode</Text>
                <Text style={[styles.menuRowSub, { color: palette.textSecondary }]}>
                  {isDark ? 'On: soft dark surfaces active' : 'Off: pastel light surfaces active'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleDarkMode}
                trackColor={{ false: '#CBD5E1', true: '#3B5BDB' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity
              style={[styles.menuRowItem, { borderBottomColor: palette.border }]}
              onPress={() => onSelectScreen('settings')}
            >
              <View style={[styles.menuIconSquare, { backgroundColor: palette.surfaceSubtle }]}>
                <Ionicons name="settings-outline" size={19} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.textPrimary }]}>Settings</Text>
                <Text style={[styles.menuRowSub, { color: palette.textSecondary }]}>
                  Password, privacy and preferences
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRowItem, { borderBottomColor: palette.border }]}
              onPress={() => onSelectScreen('scanner')}
            >
              <View style={[styles.menuIconSquare, { backgroundColor: palette.surfaceSubtle }]}>
                <Ionicons name="scan-outline" size={19} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.textPrimary }]}>Face verification</Text>
                <Text style={[styles.menuRowSub, { color: palette.textSecondary }]}>
                  Tap to verify face and campus GPS check-in
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRowItem, { borderBottomColor: palette.border }]}
              onPress={() => onSelectScreen('dtr')}
            >
              <View style={[styles.menuIconSquare, { backgroundColor: palette.surfaceSubtle }]}>
                <Ionicons name="time-outline" size={19} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.textPrimary }]}>Daily Time Record (Form 48)</Text>
                <Text style={[styles.menuRowSub, { color: palette.textSecondary }]}>
                  Monthly faculty attendance and undertime logs
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRowItem, { borderBottomColor: palette.border }]}
              onPress={() => onSelectScreen('reports')}
            >
              <View style={[styles.menuIconSquare, { backgroundColor: palette.surfaceSubtle }]}>
                <Ionicons name="download-outline" size={19} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.textPrimary }]}>Downloads &amp; Reports</Text>
                <Text style={[styles.menuRowSub, { color: palette.textSecondary }]}>
                  DepEd SF1, SF2, SF4 and PDF exports
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRowItem, { borderBottomColor: palette.border }]}
              onPress={() => onSelectScreen('calendar')}
            >
              <View style={[styles.menuIconSquare, { backgroundColor: palette.surfaceSubtle }]}>
                <Ionicons name="calendar-outline" size={19} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.textPrimary }]}>School calendar</Text>
                <Text style={[styles.menuRowSub, { color: palette.textSecondary }]}>
                  Class suspensions, holidays and events
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRowItem, { borderBottomWidth: 0 }]}
              onPress={logout}
            >
              <View style={[styles.menuIconSquare, { backgroundColor: palette.dangerBg }]}>
                <Ionicons name="log-out-outline" size={19} color={palette.dangerText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuRowTitle, { color: palette.dangerText }]}>Log out</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.dangerText} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroHeader: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroScreenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroTopActions: {
    flexDirection: 'row',
    gap: 10,
  },
  heroIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCenterWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  avatarOuterFrame: {
    width: 96,
    height: 96,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    padding: 4,
    position: 'relative',
    marginBottom: 12,
  },
  avatarSquircle: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: '#DBE4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2B4ACB',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroUserName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  heroUserSub: {
    fontSize: 12.5,
    color: '#DBE4FF',
    marginTop: 4,
    fontWeight: '600',
  },
  rolePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3B5BDB',
  },
  glassStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  glassStatCol: {
    alignItems: 'center',
    flex: 1,
  },
  glassStatVal: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  glassStatLabel: {
    fontSize: 11.5,
    color: '#DBE4FF',
    marginTop: 2,
    fontWeight: '600',
  },
  glassDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },
  dualBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
  },
  primaryPillBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
  },
  secondaryPillBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  segmentedTrack: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: 18,
    borderWidth: 1,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  pastelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pastelStatCard: {
    width: '48.2%',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  pastelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  pastelIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastelEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    flex: 1,
  },
  pastelBigNumber: {
    fontSize: 24,
    fontWeight: '900',
  },
  pastelUnit: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  cardMainTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  detailVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  subGroupLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  subjectPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  signalsDualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  signalBox: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
  },
  signalBoxTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  signalIconCard: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalBigPct: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  signalBoxTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  signalBoxDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  accountCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  menuRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuIconSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  menuRowSub: {
    fontSize: 12,
    marginTop: 2,
  },
});

export default MenuScreen;