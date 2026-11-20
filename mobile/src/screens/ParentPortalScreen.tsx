/**
 * AttendSure Mobile - Real-Time Parent & Guardian Safety Portal
 * File: mobile/src/screens/ParentPortalScreen.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { AttendSureLogo } from '../branding/BrandLogos';
import { getServerBaseUrl } from '../services/configService';
import { registerPushTokenWithBackend } from '../services/pushService';
import {
  isSafeUrl,
  cleanText,
  getFriendlyErrorMessage,
  type ThemePalette,
} from '../constants/theme';
import type { TabType } from '../navigation/MainTabNavigator';

const PARENT_PORTAL_CACHE_KEY = 'attendsure_cached_parent_portal';

interface SubjectScanItem {
  id: number;
  subject_code: string;
  subject_title: string;
  faculty_name?: string;
  status: string;
  scanned_at: string;
}

interface ChildExitPassItem {
  id: number;
  pass_number: string;
  reason: string;
  status: string;
  valid_until: string;
}

interface ParentChildData {
  id: number;
  lrn: string;
  full_name: string;
  photo_url?: string | null;
  section: string;
  adviser_name: string;
  today_status: string;
  subject_scans_today: SubjectScanItem[];
  exit_passes: ChildExitPassItem[];
}

interface ParentAlertItem {
  id: number;
  title: string;
  message: string;
  category: string;
  is_read: boolean;
  created_at: string;
}

interface ParentPortalResponse {
  parent_name: string;
  children_count: number;
  children: ParentChildData[];
  unread_notifications: number;
  notifications: ParentAlertItem[];
}

interface ParentPortalScreenProps {
  onNavigate?: (tab: TabType) => void;
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

export const ParentPortalScreen: React.FC<ParentPortalScreenProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { palette, fonts, isDark } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [portalData, setPortalData] = useState<ParentPortalResponse | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [markingRead, setMarkingRead] = useState<boolean>(false);
  const [serverBase, setServerBase] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  const normalizeChildList = useCallback((rawChildren: unknown): ParentChildData[] => {
    if (!Array.isArray(rawChildren)) return [];
    return rawChildren.map((item: Record<string, any>) => ({
      id: Number(item.id || 0),
      lrn: cleanText(item.lrn, 30),
      full_name: cleanText(item.full_name, 140),
      photo_url: typeof item.photo_url === 'string' ? item.photo_url : null,
      section: cleanText(item.section, 100) || 'Unassigned',
      adviser_name: cleanText(item.adviser_name, 120),
      today_status: cleanText(item.today_status, 30).toUpperCase() || 'UNSCANNED',
      subject_scans_today: Array.isArray(item.subject_scans_today)
        ? item.subject_scans_today.map((sc: Record<string, any>) => ({
            id: Number(sc.id || 0),
            subject_code: cleanText(sc.subject_code, 30) || 'CLASS',
            subject_title: cleanText(sc.subject_title, 100) || 'Class Period',
            faculty_name: cleanText(sc.faculty_name || sc.adviser_name || '', 120),
            status: cleanText(sc.status, 20).toUpperCase() || 'PRESENT',
            scanned_at: cleanText(sc.scanned_at, 30),
          }))
        : [],
      exit_passes: Array.isArray(item.exit_passes)
        ? item.exit_passes.map((ep: Record<string, any>) => ({
            id: Number(ep.id || 0),
            pass_number: cleanText(ep.pass_number, 50),
            reason: cleanText(ep.reason, 200),
            status: cleanText(ep.status, 20).toUpperCase(),
            valid_until: cleanText(ep.valid_until, 30),
          }))
        : [],
    }));
  }, []);

  const fetchPortal = useCallback(
    async (fromCacheFirst = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (fromCacheFirst) {
        try {
          const [cachedRaw, base] = await Promise.all([
            AsyncStorage.getItem(PARENT_PORTAL_CACHE_KEY),
            getServerBaseUrl(),
          ]);
          if (isMountedRef.current && !controller.signal.aborted) {
            if (base) setServerBase(base);
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw) as ParentPortalResponse;
              setPortalData(parsed);
              if (parsed.children?.length > 0) {
                setSelectedChildId((prev) => prev ?? parsed.children[0].id);
              }
            }
          }
        } catch {}
      }

      try {
        const res = await apiClient.get<Record<string, any>>('v1/students/parent-portal/', {
          signal: controller.signal,
        });
        if (!isMountedRef.current || controller.signal.aborted) return;

        const d = res.data || {};
        const children = normalizeChildList(d.children);
        const notifications: ParentAlertItem[] = Array.isArray(d.notifications)
          ? d.notifications.map((n: Record<string, any>) => ({
              id: Number(n.id || 0),
              title: cleanText(n.title, 150),
              message: cleanText(n.message, 300),
              category: cleanText(n.category, 30).toUpperCase(),
              is_read: Boolean(n.is_read),
              created_at: cleanText(n.created_at, 40),
            }))
          : [];

        const payload: ParentPortalResponse = {
          parent_name: cleanText(d.parent_name || user?.full_name || user?.username, 120),
          children_count: children.length,
          children,
          unread_notifications:
            typeof d.unread_notifications === 'number'
              ? d.unread_notifications
              : notifications.filter((a) => !a.is_read).length,
          notifications,
        };

        setPortalData(payload);
        setErrorBanner(null);
        if (children.length > 0) {
          setSelectedChildId((prev) =>
            prev && children.some((c) => c.id === prev) ? prev : children[0].id
          );
        }
        AsyncStorage.setItem(PARENT_PORTAL_CACHE_KEY, JSON.stringify(payload)).catch(() => {});
      } catch (err: unknown) {
        if (!isMountedRef.current || isCanceledError(err)) return;
        setErrorBanner(getFriendlyErrorMessage(err, 'Showing saved attendance updates.'));
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [normalizeChildList, user?.full_name, user?.username]
  );

  useEffect(() => {
    isMountedRef.current = true;
    void fetchPortal(true);
    registerPushTokenWithBackend().catch(() => {});

    const liveTimer = setInterval(() => {
      if (isMountedRef.current) {
        void fetchPortal(false);
      }
    }, 20000);

    return () => {
      isMountedRef.current = false;
      clearInterval(liveTimer);
      abortRef.current?.abort();
    };
  }, [fetchPortal]);

  const handleMarkAllRead = async () => {
    if (!portalData || markingRead || portalData.unread_notifications === 0) return;
    setMarkingRead(true);
    try {
      const unreadIds = portalData.notifications.filter((n) => !n.is_read).map((n) => n.id);
      await apiClient.post('v1/messaging/notifications/mark-read/', { ids: unreadIds });
      if (!isMountedRef.current) return;
      setPortalData((prev) =>
        prev
          ? {
              ...prev,
              unread_notifications: 0,
              notifications: prev.notifications.map((n) => ({ ...n, is_read: true })),
            }
          : null
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice(
        'Update Notice',
        getFriendlyErrorMessage(err, 'Could not mark alerts as read right now.')
      );
    } finally {
      if (isMountedRef.current) {
        setMarkingRead(false);
      }
    }
  };

  const resolveSafePhoto = useCallback(
    (rawUrl?: string | null): string | null => {
      if (!rawUrl || typeof rawUrl !== 'string') return null;
      const trimmed = rawUrl.trim();
      if (!trimmed) return null;
      const candidate =
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:')
          ? trimmed
          : serverBase
            ? `${serverBase.replace(/\/+$/, '')}/${trimmed.replace(/^\/+/, '')}`
            : '';
      return isSafeUrl(candidate) ? candidate : null;
    },
    [serverBase]
  );

  const getStatusColors = (status: string) => {
    const code = status.toUpperCase();
    if (code === 'PRESENT') return { bg: palette.successLight, text: palette.success, label: 'IN CLASS TODAY' };
    if (code === 'LATE') return { bg: palette.warningLight, text: palette.warning, label: 'ARRIVED LATE' };
    if (code === 'CUTTING' || code === 'ABSENT') {
      return { bg: palette.dangerLight, text: palette.danger, label: code };
    }
    return { bg: palette.surfaceSubtle, text: palette.textMuted, label: 'NOT SCANNED YET' };
  };

  const activeChild = useMemo(() => {
    if (!portalData?.children?.length) return null;
    return (
      portalData.children.find((c) => c.id === selectedChildId) || portalData.children[0]
    );
  }, [portalData, selectedChildId]);

  const childPhotoUri = resolveSafePhoto(activeChild?.photo_url);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <AttendSureLogo size={34} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.topTitle} numberOfLines={1}>
              Parent Safety Portal
            </Text>
            <Text style={styles.topSub} numberOfLines={1}>
              Real-time classroom QR &amp; exit pass updates
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            setRefreshing(true);
            void fetchPortal(false);
          }}
          accessibilityLabel="Refresh child attendance"
        >
          <Ionicons name="refresh-outline" size={18} color={palette.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchPortal(false);
            }}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
      >
        {/* Welcome Banner */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>GUARDIAN ACCOUNT</Text>
          <Text style={styles.heroName} numberOfLines={1}>
            {portalData?.parent_name || user?.full_name || 'Parent / Guardian'}
          </Text>
          <View style={styles.heroPillsRow}>
            <View style={styles.heroPill}>
              <Ionicons name="school-outline" size={13} color={palette.onPrimary} />
              <Text style={styles.heroPillText}>
                {portalData?.children_count ?? 0} Linked{' '}
                {(portalData?.children_count ?? 0) === 1 ? 'Child' : 'Children'}
              </Text>
            </View>
            <View style={styles.heroPill}>
              <Ionicons name="notifications-outline" size={13} color={palette.onPrimary} />
              <Text style={styles.heroPillText}>
                {portalData?.unread_notifications ?? 0} New Push Alerts
              </Text>
            </View>
          </View>
        </View>

        {errorBanner ? (
          <View style={styles.warningBanner}>
            <Ionicons name="information-circle-outline" size={16} color={palette.warning} />
            <Text style={styles.warningBannerText}>{errorBanner}</Text>
          </View>
        ) : null}

        {loading && !portalData ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.mutedText}>Loading your child&apos;s attendance...</Text>
          </View>
        ) : !portalData || portalData.children.length === 0 ? (
          <View style={styles.card}>
            <View style={styles.centerBox}>
              <Ionicons name="people-outline" size={40} color={palette.textMuted} />
              <Text style={styles.cardTitle}>No Linked Student Yet</Text>
              <Text style={[styles.mutedText, { textAlign: 'center', marginTop: 4 }]}>
                Ask your child&apos;s class adviser or school admin to match your mobile number to
                your child&apos;s student record.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* Child Selector Pills (when parent has 2+ children) */}
            {portalData.children.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              >
                {portalData.children.map((child) => {
                  const isSelected = activeChild?.id === child.id;
                  return (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childTabPill,
                        isSelected && {
                          backgroundColor: palette.buttonBg,
                          borderColor: palette.buttonBg,
                        },
                      ]}
                      onPress={() => setSelectedChildId(child.id)}
                    >
                      <Text
                        style={[
                          styles.childTabText,
                          { color: isSelected ? palette.onPrimary : palette.textPrimary },
                        ]}
                      >
                        {child.full_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Selected Child Summary Card */}
            {activeChild && (
              <View style={styles.card}>
                <View style={styles.childHeaderRow}>
                  <View style={styles.avatarCircle}>
                    {childPhotoUri ? (
                      <Image
                        source={{ uri: childPhotoUri }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={26} color={palette.primary} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.childName}>{activeChild.full_name}</Text>
                    <Text style={styles.childMeta}>
                      {activeChild.section} • LRN: {activeChild.lrn}
                    </Text>
                    {activeChild.adviser_name ? (
                      <Text style={styles.childAdviser}>
                        Class Adviser: {activeChild.adviser_name}
                      </Text>
                    ) : null}
                  </View>

                  {(() => {
                    const badge = getStatusColors(activeChild.today_status);
                    return (
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                          {badge.label}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                <View style={styles.quickActionsRow}>
                  <TouchableOpacity
                    style={styles.quickBtn}
                    onPress={() => onNavigate?.('chat')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={palette.primary} />
                    <Text style={styles.quickBtnText}>Message Faculty</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickBtn}
                    onPress={() => onNavigate?.('gate_pass')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="clipboard-outline" size={16} color={palette.primary} />
                    <Text style={styles.quickBtnText}>View Exit Passes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Today's Classroom QR Scans */}
            {activeChild && (
              <View style={styles.card}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardTitle}>Today&apos;s Subject QR Scans</Text>
                  <Text style={styles.countMeta}>
                    {activeChild.subject_scans_today.length} Logged
                  </Text>
                </View>

                {activeChild.subject_scans_today.length === 0 ? (
                  <Text style={styles.mutedText}>
                    No classroom QR scans recorded yet today. You will receive a mobile push alert
                    as soon as your child scans into class.
                  </Text>
                ) : (
                  activeChild.subject_scans_today.map((scan) => {
                    const badge = getStatusColors(scan.status);
                    return (
                      <View key={scan.id} style={styles.scanRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.scanSubject}>
                            {scan.subject_code} — {scan.subject_title}
                          </Text>
                          <Text style={styles.scanSubMeta}>
                            Scanned at {scan.scanned_at}
                            {scan.faculty_name ? ` • ${scan.faculty_name}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {scan.status}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* Child Exit Passes */}
            {activeChild && activeChild.exit_passes.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Recent Campus Exit Passes</Text>
                {activeChild.exit_passes.slice(0, 5).map((ep) => (
                  <View key={ep.id} style={styles.scanRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.scanSubject}>{ep.pass_number}</Text>
                      <Text style={styles.scanSubMeta}>
                        {ep.reason} • Until {ep.valid_until}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: palette.infoLight }]}>
                      <Text style={[styles.statusBadgeText, { color: palette.info }]}>
                        {ep.status}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Real-Time Push Alerts */}
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardTitle}>Recent Push Alerts</Text>
                {portalData.unread_notifications > 0 && (
                  <TouchableOpacity
                    onPress={() => void handleMarkAllRead()}
                    disabled={markingRead}
                  >
                    <Text style={{ fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary }}>
                      {markingRead ? 'Updating...' : 'Mark All Read'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {portalData.notifications.length === 0 ? (
                <Text style={styles.mutedText}>No push alerts received yet.</Text>
              ) : (
                portalData.notifications.slice(0, 12).map((notif) => (
                  <View
                    key={notif.id}
                    style={[
                      styles.alertItem,
                      !notif.is_read && {
                        backgroundColor: palette.primarySoft,
                        borderRadius: 10,
                        paddingHorizontal: 10,
                      },
                    ]}
                  >
                    <View style={styles.alertTopRow}>
                      <Text style={styles.alertTitle}>{notif.title}</Text>
                      <Text style={styles.alertTime}>{notif.created_at}</Text>
                    </View>
                    <Text style={styles.alertBody}>{notif.message}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    topTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    topSub: { fontSize: fonts.xs, color: palette.textSecondary },
    refreshBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: { padding: 16, paddingBottom: 120, gap: 12 },
    heroCard: {
      backgroundColor: palette.headerBg,
      borderRadius: 20,
      padding: 18,
    },
    heroEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      opacity: 0.82,
      letterSpacing: 0.7,
    },
    heroName: {
      fontSize: fonts.xl,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      marginTop: 2,
    },
    heroPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    heroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: palette.headerSurface,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    heroPillText: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.onPrimary },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.warningLight,
      borderWidth: 1,
      borderColor: palette.warning,
    },
    warningBannerText: { flex: 1, fontSize: fonts.xs, color: palette.textPrimary },
    childTabPill: {
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    childTabText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    childHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatarCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: palette.primarySoft,
      borderWidth: 1.5,
      borderColor: palette.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    childName: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    childMeta: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 2 },
    childAdviser: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary, marginTop: 2 },
    statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
    statusBadgeText: { fontSize: 9.5, fontWeight: fonts.weight.extrabold },
    quickActionsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    quickBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
    },
    quickBtnText: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.primary },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    countMeta: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textMuted },
    scanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      gap: 8,
    },
    scanSubject: { fontSize: fonts.sm, fontWeight: fonts.weight.bold, color: palette.textPrimary },
    scanSubMeta: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 2 },
    alertItem: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    alertTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    alertTitle: { flex: 1, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    alertTime: { fontSize: fonts.xxs, color: palette.textMuted },
    alertBody: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 3, lineHeight: 16 },
    centerBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8 },
    mutedText: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
  });

export default ParentPortalScreen;