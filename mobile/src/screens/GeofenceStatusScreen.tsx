// AttendSure Mobile - Geofence Status Screen
// File: D:\AttendSure_V3\mobile\src\screens\GeofenceStatusScreen.tsx

/**
 * AttendSure Mobile - Live Campus Geofence, Phone Health Telemetry & Alert Monitor
 * Consumes the single shared TeacherDutyLocationContext so no duplicate GPS timers run.
 * Includes TEACHER_SIGNAL_LOST ("Teacher Phone Signal Lost") filtering and phone health indicators.
 * File: mobile/src/screens/GeofenceStatusScreen.tsx
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
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';
import { useTeacherDutyLocation } from '../context/TeacherDutyLocationContext';
import { getFriendlyErrorMessage, isSafeUrl, type ThemePalette } from '../constants/theme';
import { canEditGeofence, canResetBoundDevice, canResolveLoafing } from '../utils/permissions';
import { formatScanTime, formatTime12h, formatTimeRange12h, toTimeInputValue } from '../utils/formatters';
import { confirmAction, showNotice } from '../utils/helpers';
import {
  formatBatteryLabel,
  formatNetworkLabel,
  getCampusAlertStatusLabel,
  getCampusAlertTypeLabel,
  MOBILE_ALERT_FILTER_OPTIONS,
} from '../utils/alertLabels';
import { getServerBaseUrl } from '../services/configService';
import ChipRow from '../components/common/ChipRow';
import type { TabType } from '../navigation/MainTabNavigator';

interface GeofenceStatusScreenProps {
  onNavigate?: (tab: TabType) => void;
}

interface LoafingAlertRow {
  id: number;
  incident_type: string;
  status: string;
  person_name?: string;
  detected_at: string;
  detected_time?: string;
  remarks?: string;
}

function bearingRadians(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r1 = (lat1 * Math.PI) / 180.0;
  const r2 = (lat2 * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const y = Math.sin(dLon) * Math.cos(r2);
  const x = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dLon);
  return Math.atan2(y, x);
}

function formatDistanceLabel(meters: number | null): string {
  if (meters === null) return '—';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export const GeofenceStatusScreen: React.FC<GeofenceStatusScreenProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { palette, fonts } = useThemeMode();
  const {
    liveCoords,
    boundary,
    liveTeachers,
    isOnDuty: onDuty,
    zoneStatus,
    distanceMeters,
    accuracyMeters,
    mockBlocked,
    gpsError,
    lastPingTime,
    pinging,
    loadingOverview,
    refreshCampusOverview,
    checkCampusNow,
  } = useTeacherDutyLocation();

  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const allowEditBoundary = canEditGeofence(user);
  const allowResolveAlerts = canResolveLoafing(user);
  const allowResetPhone = canResetBoundDevice(user);

  const [campusAuditLogs, setCampusAuditLogs] = useState<any[]>([]);
  const [showAuditHistory, setShowAuditHistory] = useState<boolean>(false);
  const [serverBase, setServerBase] = useState<string>('');
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [savingBoundary, setSavingBoundary] = useState<boolean>(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [runningAudit, setRunningAudit] = useState<boolean>(false);
  const [alertStatusFilter, setAlertStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('OPEN');
  const [alertTypeFilter, setAlertTypeFilter] = useState<string>('ALL');
  const [reviewRemarksByAlert, setReviewRemarksByAlert] = useState<Record<number, string>>({});
  const [boundaryForm, setBoundaryForm] = useState({
    campus_name: '',
    latitude: '',
    longitude: '',
    radius_meters: '150',
    duty_start_time: '07:30',
    duty_end_time: '16:30',
    loafing_grace_minutes: '10',
  });
  const [alerts, setAlerts] = useState<LoafingAlertRow[]>([]);
  const [localErrorBanner, setLocalErrorBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const errorBanner = localErrorBanner || gpsError;

  const loadAlertsAndHistory = useCallback(async () => {
    try {
      const [loafingRes, auditRes, base] = await Promise.allSettled([
        apiClient.get(ENDPOINTS.CAMPUS_LOAFING, { params: { page_size: 80 } }),
        apiClient.get(ENDPOINTS.CAMPUS_AUDIT),
        getServerBaseUrl(),
        refreshCampusOverview(),
      ]);

      if (!isMountedRef.current) return;
      if (base.status === 'fulfilled' && base.value) setServerBase(base.value);

      if (loafingRes.status === 'fulfilled' && loafingRes.value?.data) {
        const raw = Array.isArray(loafingRes.value.data)
          ? loafingRes.value.data
          : loafingRes.value.data?.results || [];
        setAlerts(raw.slice(0, 80));
      }

      if (auditRes.status === 'fulfilled' && auditRes.value?.data) {
        const raw = auditRes.value.data;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.history)
            ? raw.history
            : Array.isArray(raw?.logs)
              ? raw.logs
              : Array.isArray(raw?.results)
                ? raw.results
                : [];
        setCampusAuditLogs(list.slice(0, 20));
      }
      setLocalErrorBanner(null);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        setLocalErrorBanner(getFriendlyErrorMessage(err, 'Could not load campus alerts right now.'));
      }
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [refreshCampusOverview]);

  useEffect(() => {
    isMountedRef.current = true;
    void loadAlertsAndHistory();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadAlertsAndHistory]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((al) => {
      const st = String(al.status || 'OPEN').trim().toUpperCase();
      if (alertStatusFilter === 'OPEN' && st !== 'OPEN') return false;
      if (alertStatusFilter === 'RESOLVED' && st === 'OPEN') return false;
      if (
        alertTypeFilter !== 'ALL' &&
        String(al.incident_type || '').trim().toUpperCase() !== alertTypeFilter
      ) {
        return false;
      }
      return true;
    });
  }, [alerts, alertStatusFilter, alertTypeFilter]);

  const radarGeometry = useMemo(() => {
    const size = 276;
    const cx = size / 2;
    const cy = size / 2;
    const boundaryRadiusPx = 98;
    const radiusM = boundary?.radius_meters || 150;
    const hasBoundary =
      boundary?.latitude !== null &&
      boundary?.latitude !== undefined &&
      boundary?.longitude !== null &&
      boundary?.longitude !== undefined;

    let teacherX = cx;
    let teacherY = cy;
    let hasTeacherPoint = false;
    let isInside = false;

    if (hasBoundary && liveCoords && distanceMeters !== null) {
      hasTeacherPoint = true;
      const driftBuffer = Math.min(Math.max(accuracyMeters || 0, 0), 35);
      isInside = distanceMeters <= radiusM + driftBuffer;
      const angle = bearingRadians(
        boundary!.latitude!,
        boundary!.longitude!,
        liveCoords.latitude,
        liveCoords.longitude
      );
      const ratio = distanceMeters / Math.max(radiusM, 1);
      const distPx = isInside
        ? Math.min(boundaryRadiusPx - 10, ratio * (boundaryRadiusPx - 10))
        : Math.min(
            cx - 18,
            boundaryRadiusPx + 14 + Math.min(14, Math.log10(Math.max(ratio, 1)) * 12)
          );
      teacherX = cx + Math.sin(angle) * distPx;
      teacherY = cy - Math.cos(angle) * distPx;
    }

    return {
      size,
      cx,
      cy,
      boundaryRadiusPx,
      hasTeacherPoint,
      teacherX,
      teacherY,
      isInside,
    };
  }, [boundary, liveCoords, distanceMeters, accuracyMeters]);

  const statusMeta = useMemo(() => {
    if (mockBlocked) {
      return { label: 'MOCK LOCATION ACTIVE', color: palette.danger, bg: palette.dangerLight };
    }
    if (zoneStatus === 'INSIDE') {
      return { label: 'ON CAMPUS', color: palette.success, bg: palette.successLight };
    }
    if (zoneStatus === 'AUTHORIZED_OUTSIDE') {
      return { label: 'OFFICIAL EXIT PASS', color: palette.info, bg: palette.infoLight };
    }
    if (zoneStatus === 'LOAFING_ALERT') {
      return { label: 'OUTSIDE CAMPUS ALERT', color: palette.danger, bg: palette.dangerLight };
    }
    const driftBuffer = Math.min(Math.max(accuracyMeters || 0, 0), 35);
    if (
      !onDuty &&
      distanceMeters !== null &&
      boundary &&
      distanceMeters > boundary.radius_meters + driftBuffer
    ) {
      return { label: 'OUTSIDE CAMPUS (OFF DUTY)', color: palette.warning, bg: palette.warningLight };
    }
    return { label: 'OFF DUTY', color: palette.textMuted, bg: palette.surfaceSubtle };
  }, [mockBlocked, zoneStatus, onDuty, distanceMeters, accuracyMeters, boundary, palette]);

  const openEditBoundaryModal = () => {
    setBoundaryForm({
      campus_name: boundary?.campus_name || 'Main School Campus',
      latitude: boundary?.latitude !== null && boundary?.latitude !== undefined ? String(boundary.latitude) : '',
      longitude: boundary?.longitude !== null && boundary?.longitude !== undefined ? String(boundary.longitude) : '',
      radius_meters: String(boundary?.radius_meters || 150),
      duty_start_time: boundary?.duty_start_time || '07:30',
      duty_end_time: boundary?.duty_end_time || '16:30',
      loafing_grace_minutes: String(boundary?.loafing_grace_minutes ?? 10),
    });
    setEditModalOpen(true);
  };

  const handleSaveBoundary = async () => {
    const latNum = Number(boundaryForm.latitude);
    const lngNum = Number(boundaryForm.longitude);
    const radNum = Number(boundaryForm.radius_meters);
    const graceNum = Math.max(0, Math.min(120, Number(boundaryForm.loafing_grace_minutes) || 10));

    if (
      !Number.isFinite(latNum) ||
      latNum < -90 ||
      latNum > 90 ||
      !Number.isFinite(lngNum) ||
      lngNum < -180 ||
      lngNum > 180
    ) {
      showNotice('Invalid Coordinates', 'Enter valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    if (!Number.isFinite(radNum) || radNum < 20 || radNum > 5000) {
      showNotice('Invalid Radius', 'Campus radius must be between 20 and 5000 meters.');
      return;
    }
    setSavingBoundary(true);
    try {
      await apiClient.put(ENDPOINTS.CAMPUS_BOUNDARY, {
        campus_name: boundaryForm.campus_name.trim() || 'Main School Campus',
        latitude: Number(latNum.toFixed(6)),
        longitude: Number(lngNum.toFixed(6)),
        radius_meters: Math.round(radNum),
        duty_start_time: toTimeInputValue(boundaryForm.duty_start_time, '07:30'),
        duty_end_time: toTimeInputValue(boundaryForm.duty_end_time, '16:30'),
        loafing_grace_minutes: Math.round(graceNum),
      });
      setEditModalOpen(false);
      showNotice('Updated', 'Campus boundary center, radius, and duty hours saved.');
      await loadAlertsAndHistory();
    } catch (err: unknown) {
      showNotice('Save Failed', getFriendlyErrorMessage(err, 'Could not update campus boundary.'));
    } finally {
      if (isMountedRef.current) setSavingBoundary(false);
    }
  };

  const handleResetTeacherPhone = (teacherId: number, teacherName: string) => {
    confirmAction(
      'Reset Bound Phone',
      `Unlink the 1-to-1 bound phone for ${teacherName}?`,
      'Unlink',
      async () => {
        try {
          await apiClient.post(ENDPOINTS.RESET_DEVICE, { teacher_id: teacherId });
          showNotice(
            'Phone Unlinked',
            `${teacherName} can now pair a new phone on their next Time In.`
          );
          await loadAlertsAndHistory();
        } catch (err: unknown) {
          showNotice('Reset Failed', getFriendlyErrorMessage(err, 'Could not reset bound phone.'));
        }
      }
    );
  };

  const handleRunCampusAudit = async () => {
    if (runningAudit || !allowResolveAlerts) return;
    setRunningAudit(true);
    try {
      const res = await apiClient.post(ENDPOINTS.CAMPUS_LOAFING_RUN_AUDIT, {});
      const data = res.data || {};
      const cuttingCount = Number(data.created_cutting_incidents ?? 0);
      const expiredCount = Number(data.created_expired_pass_incidents ?? 0);
      const signalLostCount = Number(
        data.created_signal_lost_incidents ?? data.created_silent_teacher_incidents ?? 0
      );
      showNotice(
        'Campus Audit Complete',
        `New alerts found — Student Cutting: ${cuttingCount}, Expired Exit Passes: ${expiredCount}, Teacher Phone Signal Lost: ${signalLostCount}.`
      );
      await loadAlertsAndHistory();
    } catch (err: unknown) {
      showNotice('Audit Failed', getFriendlyErrorMessage(err, 'Could not run campus audit right now.'));
    } finally {
      if (isMountedRef.current) setRunningAudit(false);
    }
  };

  const handleResolveAlert = async (
    incidentId: number,
    nextStatus: 'EXCUSED' | 'CONFIRMED_LOAFING'
  ) => {
    setResolvingId(incidentId);
    try {
      const customNote = (reviewRemarksByAlert[incidentId] || '').trim();
      await apiClient.post(`${ENDPOINTS.CAMPUS_LOAFING_INCIDENTS}${incidentId}/resolve/`, {
        status: nextStatus,
        remarks:
          customNote ||
          (nextStatus === 'EXCUSED'
            ? 'Excused by school leader via mobile app.'
            : 'Confirmed via mobile campus monitor.'),
      });
      setReviewRemarksByAlert((prev) => {
        const next = { ...prev };
        delete next[incidentId];
        return next;
      });
      await loadAlertsAndHistory();
    } catch (err: unknown) {
      showNotice('Update Failed', getFriendlyErrorMessage(err, 'Could not update alert status.'));
    } finally {
      if (isMountedRef.current) setResolvingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>CAMPUS GEOFENCE MONITOR</Text>
        <Text style={styles.headerTitle}>{boundary?.campus_name || 'School Campus Boundary'}</Text>
        <Text style={styles.headerSub}>
          Duty Window:{' '}
          {formatTimeRange12h(
            boundary?.duty_start_time || '07:30',
            boundary?.duty_end_time || '16:30',
            { separator: ' – ' }
          )}{' '}
          • Allowed Radius: {boundary?.radius_meters ?? 150}m
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadAlertsAndHistory();
            }}
            colors={[palette.primary]}
            tintColor={palette.primary}
          />
        }
      >
        {errorBanner ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={18} color={palette.danger} />
            <Text style={styles.errorText}>{errorBanner}</Text>
          </View>
        ) : null}

        {/* Big Geofencing Circle & School Boundary Center Visual */}
        <View style={styles.card}>
          <View style={styles.cardRowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>SCHOOL BOUNDARY CIRCLE &amp; CENTER</Text>
              <Text style={styles.radarSubText}>
                {boundary?.latitude !== null &&
                boundary?.latitude !== undefined &&
                boundary?.longitude !== null &&
                boundary?.longitude !== undefined
                  ? `Center: ${boundary.latitude.toFixed(5)}°, ${boundary.longitude.toFixed(5)}° • Radius: ${boundary.radius_meters}m`
                  : 'Loading school center coordinates...'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          </View>

          <View style={styles.radarContainer}>
            <Svg width={radarGeometry.size} height={radarGeometry.size}>
              <Circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={radarGeometry.boundaryRadiusPx + 24}
                fill="none"
                stroke={palette.border}
                strokeWidth={1}
                strokeDasharray="4,5"
              />
              <Circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={radarGeometry.boundaryRadiusPx}
                fill={palette.primarySoft}
                fillOpacity={0.55}
                stroke={palette.primary}
                strokeWidth={3.5}
              />
              <Circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={radarGeometry.boundaryRadiusPx * 0.5}
                fill="none"
                stroke={palette.primary}
                strokeOpacity={0.38}
                strokeWidth={1.2}
                strokeDasharray="5,5"
              />
              <Line
                x1={radarGeometry.cx}
                y1={radarGeometry.cy - radarGeometry.boundaryRadiusPx}
                x2={radarGeometry.cx}
                y2={radarGeometry.cy + radarGeometry.boundaryRadiusPx}
                stroke={palette.primary}
                strokeOpacity={0.2}
                strokeWidth={1}
              />
              <Line
                x1={radarGeometry.cx - radarGeometry.boundaryRadiusPx}
                y1={radarGeometry.cy}
                x2={radarGeometry.cx + radarGeometry.boundaryRadiusPx}
                y2={radarGeometry.cy}
                stroke={palette.primary}
                strokeOpacity={0.2}
                strokeWidth={1}
              />
              <SvgText x={radarGeometry.cx} y={13} fill={palette.textMuted} fontSize={10} fontWeight="700" textAnchor="middle">
                N
              </SvgText>
              <SvgText x={radarGeometry.cx} y={radarGeometry.size - 4} fill={palette.textMuted} fontSize={10} fontWeight="700" textAnchor="middle">
                S
              </SvgText>
              <SvgText x={10} y={radarGeometry.cy + 3} fill={palette.textMuted} fontSize={10} fontWeight="700" textAnchor="middle">
                W
              </SvgText>
              <SvgText x={radarGeometry.size - 10} y={radarGeometry.cy + 3} fill={palette.textMuted} fontSize={10} fontWeight="700" textAnchor="middle">
                E
              </SvgText>
              <SvgText
                x={radarGeometry.cx}
                y={radarGeometry.cy - radarGeometry.boundaryRadiusPx + 14}
                fill={palette.primary}
                fontSize={9.5}
                fontWeight="800"
                textAnchor="middle"
              >
                {`${boundary?.radius_meters ?? 150}m GEOFENCE`}
              </SvgText>

              {radarGeometry.hasTeacherPoint && (
                <Line
                  x1={radarGeometry.cx}
                  y1={radarGeometry.cy}
                  x2={radarGeometry.teacherX}
                  y2={radarGeometry.teacherY}
                  stroke={
                    radarGeometry.isInside
                      ? palette.success
                      : zoneStatus === 'LOAFING_ALERT'
                        ? palette.danger
                        : palette.warning
                  }
                  strokeWidth={2}
                  strokeDasharray="4,4"
                />
              )}

              <Circle cx={radarGeometry.cx} cy={radarGeometry.cy} r={17} fill={palette.primary} fillOpacity={0.18} />
              <Circle
                cx={radarGeometry.cx}
                cy={radarGeometry.cy}
                r={8}
                fill={palette.primary}
                stroke={palette.onPrimary}
                strokeWidth={2.5}
              />
              <SvgText
                x={radarGeometry.cx}
                y={radarGeometry.cy + 27}
                fill={palette.textPrimary}
                fontSize={9}
                fontWeight="800"
                textAnchor="middle"
              >
                SCHOOL CENTER
              </SvgText>

              {radarGeometry.hasTeacherPoint && (
                <>
                  <Circle
                    cx={radarGeometry.teacherX}
                    cy={radarGeometry.teacherY}
                    r={12}
                    fill={
                      radarGeometry.isInside
                        ? palette.success
                        : zoneStatus === 'LOAFING_ALERT'
                          ? palette.danger
                          : palette.warning
                    }
                    fillOpacity={0.25}
                  />
                  <Circle
                    cx={radarGeometry.teacherX}
                    cy={radarGeometry.teacherY}
                    r={6.5}
                    fill={
                      radarGeometry.isInside
                        ? palette.success
                        : zoneStatus === 'LOAFING_ALERT'
                          ? palette.danger
                          : palette.warning
                    }
                    stroke={palette.onPrimary}
                    strokeWidth={2}
                  />
                </>
              )}
            </Svg>
          </View>

          <View style={styles.radarLegendRow}>
            <View style={styles.radarLegendItem}>
              <View style={[styles.legendDot, { backgroundColor: palette.primary }]} />
              <Text style={styles.radarLegendText}>School Boundary Center</Text>
            </View>
            <View style={styles.radarLegendItem}>
              <View
                style={[
                  styles.legendDot,
                  {
                    backgroundColor: radarGeometry.isInside
                      ? palette.success
                      : zoneStatus === 'LOAFING_ALERT'
                        ? palette.danger
                        : palette.warning,
                  },
                ]}
              />
              <Text style={styles.radarLegendText}>
                You ({formatDistanceLabel(distanceMeters)})
              </Text>
            </View>
          </View>
        </View>

        {/* Live Distance & Zone Card */}
        <View style={styles.card}>
          <View style={styles.cardRowBetween}>
            <Text style={styles.cardLabel}>LIVE BOUNDARY METRICS</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          </View>

          {loadingOverview && !boundary ? (
            <ActivityIndicator size="small" color={palette.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.metricRow}>
              <View style={styles.metricCol}>
                <Text style={styles.metricVal}>{formatDistanceLabel(distanceMeters)}</Text>
                <Text style={styles.metricLabel}>Distance to Center</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCol}>
                <Text style={styles.metricVal}>
                  {boundary ? `${boundary.radius_meters} m` : '—'}
                </Text>
                <Text style={styles.metricLabel}>Campus Radius</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricCol}>
                <Text style={styles.metricVal}>
                  {accuracyMeters !== null ? `±${accuracyMeters}m` : '—'}
                </Text>
                <Text style={styles.metricLabel}>GPS Accuracy</Text>
              </View>
            </View>
          )}

          <View style={styles.heartbeatBanner}>
            <Ionicons name="radio-outline" size={16} color={palette.success} />
            <Text style={styles.heartbeatText}>
              {onDuty
                ? `Campus GPS check is active while you are timed in on duty${lastPingTime ? ` • Last checked ${lastPingTime}` : ''}`
                : `Background GPS tracking is off while you are off duty. Time In to start tracking${lastPingTime ? ` • Last checked ${lastPingTime}` : ''}`}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, pinging && { opacity: 0.7 }]}
            onPress={() => void checkCampusNow(true)}
            disabled={pinging}
            activeOpacity={0.85}
          >
            {pinging ? (
              <ActivityIndicator size="small" color={palette.onPrimary} />
            ) : (
              <>
                <Ionicons name="locate-outline" size={17} color={palette.onPrimary} />
                <Text style={styles.primaryBtnText}>Check My Campus Location</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.quickBtnRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => onNavigate?.('scanner')}>
              <Ionicons name="finger-print-outline" size={15} color={palette.primary} />
              <Text style={styles.secondaryBtnText}>Teacher Time In / Out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => onNavigate?.('gate_pass')}>
              <Ionicons name="clipboard-outline" size={15} color={palette.primary} />
              <Text style={styles.secondaryBtnText}>Exit Passes</Text>
            </TouchableOpacity>
          </View>

          {allowEditBoundary && (
            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: 8 }]}
              onPress={openEditBoundaryModal}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={15} color={palette.primary} />
              <Text style={styles.secondaryBtnText}>Edit Campus Circle &amp; Center</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Campus Alerts Card with Status Filter, Type Filter, Run Audit & Review Notes */}
        <View style={styles.card}>
          <View style={styles.cardRowBetween}>
            <Text style={styles.cardLabel}>
              CAMPUS ALERTS ({filteredAlerts.length}
              {alertTypeFilter !== 'ALL' || alertStatusFilter !== 'ALL' ? ` of ${alerts.length}` : ''})
            </Text>
            {allowResolveAlerts && (
              <TouchableOpacity
                style={[styles.auditRunBtn, runningAudit && { opacity: 0.65 }]}
                onPress={() => void handleRunCampusAudit()}
                disabled={runningAudit}
                activeOpacity={0.85}
              >
                {runningAudit ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <>
                    <Ionicons name="shield-checkmark-outline" size={13} color={palette.onPrimary} />
                    <Text style={styles.auditRunBtnText}>Run Campus Audit</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          <ChipRow<'ALL' | 'OPEN' | 'RESOLVED'>
            options={[
              { key: 'OPEN', label: 'Open' },
              { key: 'RESOLVED', label: 'Resolved' },
              { key: 'ALL', label: 'All Statuses' },
            ]}
            selected={alertStatusFilter}
            onSelect={setAlertStatusFilter}
          />

          <ChipRow
            options={MOBILE_ALERT_FILTER_OPTIONS.map((opt) => ({
              key: opt.key,
              label: opt.label,
            }))}
            selected={alertTypeFilter}
            onSelect={setAlertTypeFilter}
          />

          {filteredAlerts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="shield-checkmark-outline" size={28} color={palette.success} />
              <Text style={styles.emptyText}>
                {alertStatusFilter === 'OPEN' && alertTypeFilter === 'ALL'
                  ? 'No open campus alerts right now.'
                  : 'No alerts match this filter.'}
              </Text>
            </View>
          ) : (
            filteredAlerts.map((al) => {
              const typeLabel = getCampusAlertTypeLabel(al.incident_type);
              const statusLabel = getCampusAlertStatusLabel(al.status, al.incident_type);
              const isSignalLost =
                String(al.incident_type || '').toUpperCase() === 'TEACHER_SIGNAL_LOST';
              const isOpen = String(al.status || 'OPEN').toUpperCase() === 'OPEN';
              const badgeBg = !isOpen
                ? palette.successLight
                : isSignalLost
                  ? palette.warningLight
                  : palette.dangerLight;
              const badgeText = !isOpen
                ? palette.success
                : isSignalLost
                  ? palette.warning
                  : palette.danger;

              return (
                <View
                  key={String(al.id)}
                  style={[styles.alertRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle}>{typeLabel}</Text>
                      <Text style={styles.alertSub}>
                        {al.person_name || 'Alert'} •{' '}
                        {al.detected_time || formatScanTime(al.detected_at)}
                      </Text>
                      {al.remarks ? (
                        <Text style={styles.alertRemarks} numberOfLines={3}>
                          {al.remarks}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                      <Text style={[styles.statusBadgeText, { color: badgeText }]}>
                        {statusLabel}
                      </Text>
                    </View>
                  </View>
                  {allowResolveAlerts && isOpen && (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        style={styles.reviewRemarksInput}
                        value={reviewRemarksByAlert[al.id] || ''}
                        onChangeText={(val) =>
                          setReviewRemarksByAlert((prev) => ({ ...prev, [al.id]: val }))
                        }
                        placeholder="Optional review remarks..."
                        placeholderTextColor={palette.textMuted}
                        maxLength={240}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[
                            styles.secondaryBtn,
                            { height: 34, backgroundColor: palette.successLight, borderColor: palette.success },
                          ]}
                          disabled={resolvingId === al.id}
                          onPress={() => void handleResolveAlert(al.id, 'EXCUSED')}
                        >
                          <Text style={[styles.secondaryBtnText, { color: palette.success }]}>
                            Excuse
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.secondaryBtn,
                            { height: 34, backgroundColor: palette.dangerLight, borderColor: palette.danger },
                          ]}
                          disabled={resolvingId === al.id}
                          onPress={() => void handleResolveAlert(al.id, 'CONFIRMED_LOAFING')}
                        >
                          <Text style={[styles.secondaryBtnText, { color: palette.danger }]}>
                            Confirm
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Live Teachers GPS Directory Card with Phone Health Indicators */}
        {liveTeachers.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>LIVE TEACHERS ON CAMPUS ({liveTeachers.length})</Text>
            {liveTeachers.map((t) => {
              const rawImg = t.photo_url || t.photo || null;
              const imgCandidate =
                typeof rawImg === 'string' && rawImg.trim()
                  ? rawImg.startsWith('http') || rawImg.startsWith('data:')
                    ? rawImg.trim()
                    : serverBase
                      ? `${serverBase.replace(/\/+$/, '')}/${rawImg.replace(/^\/+/, '')}`
                      : ''
                  : '';
              const avatarUri = isSafeUrl(imgCandidate) ? imgCandidate : null;
              const isSignalLostRow = Boolean(
                t.has_signal_lost ||
                  t.status === 'SIGNAL_LOST' ||
                  t.zone_status === 'SIGNAL_LOST'
              );
              const inside = !isSignalLostRow && Boolean(t.is_inside);
              const isLoafingRow =
                !isSignalLostRow &&
                (t.zone_status === 'LOAFING_ALERT' || t.status === 'PERIMETER_BREACH');
              const isAuthPassRow =
                !isSignalLostRow &&
                (t.zone_status === 'AUTHORIZED_OUTSIDE' || t.status === 'AUTHORIZED_LEAVE');
              const isAwayOffDuty =
                !isSignalLostRow &&
                !inside &&
                !isLoafingRow &&
                !isAuthPassRow &&
                t.latitude !== null &&
                t.latitude !== undefined;
              const badgeBg = isSignalLostRow
                ? palette.warningLight
                : inside
                  ? palette.successLight
                  : isLoafingRow
                    ? palette.dangerLight
                    : isAuthPassRow
                      ? palette.infoLight
                      : isAwayOffDuty
                        ? palette.warningLight
                        : palette.surfaceSubtle;
              const badgeColor = isSignalLostRow
                ? palette.warning
                : inside
                  ? palette.success
                  : isLoafingRow
                    ? palette.danger
                    : isAuthPassRow
                      ? palette.info
                      : isAwayOffDuty
                        ? palette.warning
                        : palette.textMuted;
              const friendlyStatus = isSignalLostRow
                ? 'SIGNAL LOST'
                : inside
                  ? 'ON CAMPUS'
                  : isLoafingRow
                    ? 'OUTSIDE CAMPUS'
                    : isAuthPassRow
                      ? 'OFFICIAL EXIT PASS'
                      : isAwayOffDuty
                        ? 'OUTSIDE (OFF DUTY)'
                        : 'OFF DUTY';

              const hasPhoneHealth =
                t.battery_percent !== null && t.battery_percent !== undefined
                  ? true
                  : Boolean(t.network_type && t.network_type !== 'UNKNOWN') ||
                    t.is_gps_enabled === false;
              const isLowBattery =
                typeof t.battery_percent === 'number' && t.battery_percent <= 20;
              const netCode = String(t.network_type || '').toUpperCase();
              const netIcon: keyof typeof Ionicons.glyphMap =
                netCode === 'WIFI'
                  ? 'wifi-outline'
                  : netCode === 'CELLULAR'
                    ? 'cellular-outline'
                    : netCode === 'NONE'
                      ? 'cloud-offline-outline'
                      : 'radio-outline';
              const batteryIcon: keyof typeof Ionicons.glyphMap = t.is_charging
                ? 'battery-charging-outline'
                : isLowBattery
                  ? 'battery-dead-outline'
                  : 'battery-half-outline';

              return (
                <View key={String(t.teacher_id || t.id)} style={styles.teacherRowCard}>
                  <View style={styles.teacherRowTop}>
                    <View style={styles.teacherAvatarCircle}>
                      {avatarUri ? (
                        <Image
                          source={{ uri: avatarUri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                      ) : (
                        <Ionicons name="person" size={18} color={palette.primary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertTitle} numberOfLines={1}>
                        {t.teacher_name || t.full_name || 'Teacher'}
                      </Text>
                      <Text style={styles.alertSub}>
                        {t.distance_meters !== null && t.distance_meters !== undefined
                          ? `${formatDistanceLabel(t.distance_meters)} away • `
                          : ''}
                        {t.last_seen === 'No ping yet'
                          ? 'Not checked in yet'
                          : t.last_seen || 'Not checked in yet'}
                        {t.is_online ? ' • Online' : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
                          {friendlyStatus}
                        </Text>
                      </View>
                      {allowResetPhone &&
                        Boolean(t.has_bound_device || t.is_device_bound || t.bound_device_id) && (
                          <TouchableOpacity
                            onPress={() =>
                              handleResetTeacherPhone(
                                Number(t.teacher_id || t.id),
                                String(t.teacher_name || t.full_name || 'Teacher')
                              )
                            }
                          >
                            <Text style={styles.resetPhoneText}>Reset Phone</Text>
                          </TouchableOpacity>
                        )}
                    </View>
                  </View>

                  {/* Phone Health Indicators Row */}
                  {(Boolean(t.is_clocked_in) || hasPhoneHealth) && (
                    <View style={styles.healthPillRow}>
                      {typeof t.battery_percent === 'number' && (
                        <View
                          style={[
                            styles.healthPill,
                            {
                              backgroundColor: isLowBattery
                                ? palette.dangerLight
                                : t.is_charging
                                  ? palette.successLight
                                  : palette.surfaceSubtle,
                              borderColor: isLowBattery ? palette.danger : palette.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={batteryIcon}
                            size={12}
                            color={
                              isLowBattery
                                ? palette.danger
                                : t.is_charging
                                  ? palette.success
                                  : palette.textSecondary
                            }
                          />
                          <Text
                            style={[
                              styles.healthPillText,
                              {
                                color: isLowBattery
                                  ? palette.danger
                                  : t.is_charging
                                    ? palette.success
                                    : palette.textSecondary,
                              },
                            ]}
                          >
                            {formatBatteryLabel(t.battery_percent, t.is_charging)}
                          </Text>
                        </View>
                      )}

                      {t.network_type && t.network_type !== 'UNKNOWN' && (
                        <View
                          style={[
                            styles.healthPill,
                            {
                              backgroundColor:
                                netCode === 'NONE' ? palette.warningLight : palette.surfaceSubtle,
                              borderColor: netCode === 'NONE' ? palette.warning : palette.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={netIcon}
                            size={12}
                            color={netCode === 'NONE' ? palette.warning : palette.primary}
                          />
                          <Text
                            style={[
                              styles.healthPillText,
                              {
                                color:
                                  netCode === 'NONE' ? palette.warning : palette.textSecondary,
                              },
                            ]}
                          >
                            {formatNetworkLabel(t.network_type)}
                          </Text>
                        </View>
                      )}

                      {typeof t.is_gps_enabled === 'boolean' && (
                        <View
                          style={[
                            styles.healthPill,
                            {
                              backgroundColor: t.is_gps_enabled
                                ? palette.successLight
                                : palette.dangerLight,
                              borderColor: t.is_gps_enabled ? palette.success : palette.danger,
                            },
                          ]}
                        >
                          <Ionicons
                            name={t.is_gps_enabled ? 'location-outline' : 'location-sharp'}
                            size={12}
                            color={t.is_gps_enabled ? palette.success : palette.danger}
                          />
                          <Text
                            style={[
                              styles.healthPillText,
                              { color: t.is_gps_enabled ? palette.success : palette.danger },
                            ]}
                          >
                            {t.is_gps_enabled ? 'GPS On' : 'GPS Off'}
                          </Text>
                        </View>
                      )}

                      {t.is_low_power_mode === true && (
                        <View
                          style={[
                            styles.healthPill,
                            { backgroundColor: palette.warningLight, borderColor: palette.warning },
                          ]}
                        >
                          <Ionicons name="leaf-outline" size={12} color={palette.warning} />
                          <Text style={[styles.healthPillText, { color: palette.warning }]}>
                            Battery Saver
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Campus Location Check History Card */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardRowBetween}
            onPress={() => setShowAuditHistory((prev) => !prev)}
          >
            <Text style={styles.cardLabel}>
              RECENT CAMPUS LOCATION CHECKS ({campusAuditLogs.length})
            </Text>
            <Ionicons
              name={showAuditHistory ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={palette.textMuted}
            />
          </TouchableOpacity>
          {showAuditHistory &&
            (campusAuditLogs.length === 0 ? (
              <Text style={styles.emptyText}>No campus location checks recorded yet today.</Text>
            ) : (
              campusAuditLogs.map((log: any, idx: number) => (
                <View key={String(log.id || idx)} style={styles.alertRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>{log.teacher_name || 'Location Check'}</Text>
                    <Text style={styles.alertSub}>
                      {log.details || `${log.zone_status || log.status || 'Checked'}`}{' '}
                      {log.time_only || log.recorded_time || log.timestamp
                        ? `• ${log.time_only || log.recorded_time || log.timestamp}`
                        : ''}
                    </Text>
                  </View>
                </View>
              ))
            ))}
        </View>
      </ScrollView>

      {/* Edit Campus Boundary Modal (Admin & Principal) */}
      <Modal
        visible={editModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={{ maxHeight: '88%' }}
            contentContainerStyle={{ justifyContent: 'center' }}
          >
            <View style={[styles.card, { borderColor: palette.borderStrong }]}>
              <View style={styles.cardRowBetween}>
                <Text style={[styles.alertTitle, { fontSize: fonts.lg }]}>
                  Edit School Boundary Circle
                </Text>
                <TouchableOpacity onPress={() => setEditModalOpen(false)}>
                  <Ionicons name="close" size={22} color={palette.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.alertSub, { marginTop: 4 }]}>Campus Name</Text>
              <TextInput
                style={styles.modalInput}
                value={boundaryForm.campus_name}
                onChangeText={(v) => setBoundaryForm((p) => ({ ...p, campus_name: v }))}
                placeholder="School Campus Name"
                placeholderTextColor={palette.textMuted}
              />
              <Text style={[styles.alertSub, { marginTop: 6 }]}>Center Latitude (°N)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="decimal-pad"
                value={boundaryForm.latitude}
                onChangeText={(v) => setBoundaryForm((p) => ({ ...p, latitude: v }))}
                placeholder="8.4858"
                placeholderTextColor={palette.textMuted}
              />
              <Text style={[styles.alertSub, { marginTop: 6 }]}>Center Longitude (°E)</Text>
              <TextInput
                style={styles.modalInput}
                keyboardType="decimal-pad"
                value={boundaryForm.longitude}
                onChangeText={(v) => setBoundaryForm((p) => ({ ...p, longitude: v }))}
                placeholder="124.6567"
                placeholderTextColor={palette.textMuted}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertSub, { marginTop: 6 }]}>Radius (Meters)</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="number-pad"
                    value={boundaryForm.radius_meters}
                    onChangeText={(v) => setBoundaryForm((p) => ({ ...p, radius_meters: v }))}
                    placeholder="150"
                    placeholderTextColor={palette.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertSub, { marginTop: 6 }]}>Grace Minutes</Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="number-pad"
                    value={boundaryForm.loafing_grace_minutes}
                    onChangeText={(v) =>
                      setBoundaryForm((p) => ({
                        ...p,
                        loafing_grace_minutes: v.replace(/\D/g, ''),
                      }))
                    }
                    placeholder="10"
                    placeholderTextColor={palette.textMuted}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertSub, { marginTop: 6 }]}>Duty Start</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={boundaryForm.duty_start_time}
                    onChangeText={(v) => setBoundaryForm((p) => ({ ...p, duty_start_time: v }))}
                    placeholder="07:30 or 7:30 AM"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text style={[styles.alertSub, { marginTop: 3 }]}>
                    12-hr: {formatTime12h(boundaryForm.duty_start_time)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertSub, { marginTop: 6 }]}>Duty End</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={boundaryForm.duty_end_time}
                    onChangeText={(v) => setBoundaryForm((p) => ({ ...p, duty_end_time: v }))}
                    placeholder="16:30 or 4:30 PM"
                    placeholderTextColor={palette.textMuted}
                  />
                  <Text style={[styles.alertSub, { marginTop: 3 }]}>
                    12-hr: {formatTime12h(boundaryForm.duty_end_time)}
                  </Text>
                </View>
              </View>
              {liveCoords && (
                <TouchableOpacity
                  style={[styles.secondaryBtn, { marginTop: 8 }]}
                  onPress={() =>
                    setBoundaryForm((p) => ({
                      ...p,
                      latitude: liveCoords.latitude.toFixed(6),
                      longitude: liveCoords.longitude.toFixed(6),
                    }))
                  }
                >
                  <Ionicons name="locate-outline" size={15} color={palette.primary} />
                  <Text style={styles.secondaryBtnText}>Use My Current GPS as Center</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 10 }, savingBoundary && { opacity: 0.65 }]}
                disabled={savingBoundary}
                onPress={() => void handleSaveBoundary()}
              >
                {savingBoundary ? (
                  <ActivityIndicator size="small" color={palette.onPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>Save School Boundary</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      backgroundColor: palette.headerBg,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 18,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    headerEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      opacity: 0.8,
      letterSpacing: 0.8,
    },
    headerTitle: {
      fontSize: fonts.xl,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      marginTop: 2,
    },
    headerSub: {
      fontSize: fonts.xs,
      color: palette.onPrimary,
      opacity: 0.88,
      marginTop: 4,
    },
    scrollContent: { padding: 16, paddingBottom: 136, gap: 14 },
    radarSubText: {
      fontSize: fonts.xxs,
      color: palette.textSecondary,
      marginTop: 2,
      fontWeight: fonts.weight.semibold,
    },
    radarContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    radarLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    radarLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    radarLegendText: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.bold,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: palette.dangerLight,
      borderWidth: 1,
      borderColor: palette.danger,
    },
    errorText: {
      flex: 1,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.danger,
    },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 12,
    },
    cardRowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardLabel: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textMuted,
      letterSpacing: 0.5,
    },
    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusBadgeText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
    },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.surfaceSubtle,
      borderRadius: 12,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: palette.border,
    },
    metricCol: { flex: 1, alignItems: 'center' },
    metricDivider: { width: 1, height: 28, backgroundColor: palette.borderStrong },
    metricVal: {
      fontSize: fonts.lg,
      fontWeight: fonts.weight.black,
      color: palette.textPrimary,
    },
    metricLabel: {
      fontSize: fonts.xxs,
      color: palette.textSecondary,
      marginTop: 2,
      fontWeight: fonts.weight.semibold,
    },
    heartbeatBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    heartbeatText: {
      flex: 1,
      fontSize: fonts.xs,
      color: palette.textSecondary,
      lineHeight: 16,
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 12,
      backgroundColor: palette.buttonBg,
    },
    primaryBtnText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
    },
    quickBtnRow: { flexDirection: 'row', gap: 10 },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    secondaryBtnText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    emptyBox: {
      alignItems: 'center',
      paddingVertical: 16,
      gap: 6,
    },
    emptyText: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.semibold,
    },
    alertRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
    alertTitle: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    alertSub: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      marginTop: 2,
    },
    alertRemarks: {
      fontSize: fonts.xs,
      color: palette.textMuted,
      marginTop: 4,
      lineHeight: 16,
    },
    auditRunBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.buttonBg,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    auditRunBtnText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
    },
    reviewRemarksInput: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 36,
      fontSize: fonts.xs,
      color: palette.textPrimary,
    },
    teacherRowCard: {
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      gap: 8,
    },
    teacherRowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    teacherAvatarCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    resetPhoneText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.bold,
      color: palette.warning,
    },
    healthPillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      paddingLeft: 46,
    },
    healthPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
    },
    healthPillText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.bold,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      padding: 16,
    },
    modalInput: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      color: palette.textPrimary,
    },
  });

export default GeofenceStatusScreen;
