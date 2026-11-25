/**
 * AttendSure Mobile - Teacher Time In/Out & Class Period Alarm Scheduler
 * File: mobile/src/services/scheduleAlarmService.ts
 *
 * Monitors school duty Time In / Time Out hours and today's assigned class periods,
 * triggering device alarm sound/vibration and an in-app popup modal with Snooze & Dismiss.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AlarmToneKind } from './soundService';

export interface MobileAlarmEvent {
  id: string;
  kind: AlarmToneKind;
  title: string;
  subtitle: string;
  timeLabel: string;
  detail: string;
  actionLabel: string;
  targetTab: 'scanner' | 'geofence' | 'dtr';
}

export interface MobileAlarmPeriod {
  id: number;
  subject_code: string;
  subject_name: string;
  section_name: string;
  room?: string;
  start_time: string;
  end_time: string;
  day_of_week?: string;
}

export interface MobileAlarmSnapshot {
  dutyStartTime: string;
  dutyEndTime: string;
  isTimedInToday: boolean;
  periods: MobileAlarmPeriod[];
}

const ENABLED_STORAGE_KEY = 'attendsure_mobile_alarms_enabled';
const DISMISSED_PREFIX = 'attendsure_mobile_dismissed_alarms_';

export function getLocalDateStamp(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseTimeToMinutes(hhmm?: string): number | null {
  if (!hhmm) return null;
  const parts = String(hhmm).trim().split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatMinutes12h(totalMins: number): string {
  const h24 = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatDayOfWeekLabel(dayOfWeek: string | undefined): string {
  const clean = String(dayOfWeek || 'ALL_WEEKDAYS').trim().toUpperCase();
  if (clean === 'ALL_WEEKDAYS' || clean === 'ALL' || clean === 'MON-FRI' || clean === 'WEEKDAYS') {
    return 'Mon-Fri';
  }
  if (clean === 'MWF' || clean === 'TTH') return clean;
  const singleDayLabels: Record<string, string> = {
    '1': 'Mon',
    '2': 'Tue',
    '3': 'Wed',
    '4': 'Thu',
    '5': 'Fri',
    '6': 'Sat',
    '7': 'Sun',
  };
  return singleDayLabels[clean] || clean;
}

export function periodRunsOnJsDay(dayOfWeek: string | undefined, jsDay: number): boolean {
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const clean = String(dayOfWeek || 'ALL_WEEKDAYS').trim().toUpperCase();
  if (clean === 'ALL_WEEKDAYS' || clean === 'ALL' || clean === 'MON-FRI' || clean === 'WEEKDAYS') {
    return isoDay >= 1 && isoDay <= 5;
  }
  if (clean === 'MWF') return isoDay === 1 || isoDay === 3 || isoDay === 5;
  if (clean === 'TTH') return isoDay === 2 || isoDay === 4;
  if (/^[1-7]$/.test(clean)) return Number(clean) === isoDay;
  return isoDay >= 1 && isoDay <= 5;
}

export async function getMobileAlarmsEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ENABLED_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export async function setMobileAlarmsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export async function getDismissedMobileAlarms(dateStamp: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(`${DISMISSED_PREFIX}${dateStamp}`);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export async function markMobileAlarmDismissed(dateStamp: string, alarmId: string): Promise<void> {
  try {
    const current = await getDismissedMobileAlarms(dateStamp);
    current.add(alarmId);
    await AsyncStorage.setItem(`${DISMISSED_PREFIX}${dateStamp}`, JSON.stringify(Array.from(current)));
  } catch {}
}

export function fireOptionalLocalAlert(title: string, body: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (window.Notification.permission === 'granted') {
        new window.Notification(title, { body, silent: false });
      }
    } catch {}
  }
}

export async function evaluateDueMobileAlarm(
  snapshot: MobileAlarmSnapshot,
  now: Date = new Date()
): Promise<MobileAlarmEvent | null> {
  const dateStamp = getLocalDateStamp(now);
  const dismissed = await getDismissedMobileAlarms(dateStamp);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const jsDay = now.getDay();
  const isWeekday = jsDay >= 1 && jsDay <= 5;

  const startMins = parseTimeToMinutes(snapshot.dutyStartTime);
  if (isWeekday && startMins !== null && !snapshot.isTimedInToday) {
    const alarmId = `TIME_IN_${dateStamp}_${snapshot.dutyStartTime}`;
    if (!dismissed.has(alarmId) && nowMins >= startMins && nowMins <= startMins + 2) {
      return {
        id: alarmId,
        kind: 'TIME_IN',
        title: 'Time to TIME IN',
        subtitle: 'Teacher Duty Hours Starting',
        timeLabel: formatMinutes12h(startMins),
        detail: 'Your teacher duty starts now. Record your Teacher Time In inside the school campus circle.',
        actionLabel: 'Open Teacher Time In / Out',
        targetTab: 'scanner',
      };
    }
  }

  const endMins = parseTimeToMinutes(snapshot.dutyEndTime);
  if (isWeekday && endMins !== null && snapshot.isTimedInToday) {
    const alarmId = `TIME_OUT_${dateStamp}_${snapshot.dutyEndTime}`;
    if (!dismissed.has(alarmId) && nowMins >= endMins && nowMins <= endMins + 2) {
      return {
        id: alarmId,
        kind: 'TIME_OUT',
        title: 'Time to TIME OUT',
        subtitle: 'Teacher Duty Hours Ending',
        timeLabel: formatMinutes12h(endMins),
        detail: 'Your school duty ends now. Record your Teacher Time Out before leaving campus.',
        actionLabel: 'Open Teacher Time In / Out',
        targetTab: 'scanner',
      };
    }
  }

  for (const period of snapshot.periods) {
    if (!periodRunsOnJsDay(period.day_of_week, jsDay)) continue;
    const pStart = parseTimeToMinutes(period.start_time);
    if (pStart === null) continue;
    const alarmId = `PERIOD_${dateStamp}_${period.id}_${period.start_time}`;
    if (!dismissed.has(alarmId) && nowMins >= pStart && nowMins <= pStart + 2) {
      const pEnd = parseTimeToMinutes(period.end_time);
      const timeRange =
        pEnd !== null ? `${formatMinutes12h(pStart)} – ${formatMinutes12h(pEnd)}` : formatMinutes12h(pStart);
      return {
        id: alarmId,
        kind: 'CLASS_PERIOD',
        title: `Class Period Now: ${period.subject_name || period.subject_code}`,
        subtitle: period.section_name || 'Assigned Section',
        timeLabel: timeRange,
        detail: `Room: ${period.room || 'Assigned Room'} • Open Student QR Scanner to record student attendance.`,
        actionLabel: 'Open Student QR Scanner',
        targetTab: 'scanner',
      };
    }
  }

  return null;
}

export function buildTestMobileAlarm(kind: AlarmToneKind): MobileAlarmEvent {
  const now = new Date();
  const label = formatMinutes12h(now.getHours() * 60 + now.getMinutes());
  if (kind === 'TIME_IN') {
    return {
      id: `TEST_TIME_IN_${Date.now()}`,
      kind: 'TIME_IN',
      title: 'Time to TIME IN',
      subtitle: 'Teacher Attendance Alarm',
      timeLabel: label,
      detail: 'School duty is starting. Record your Teacher Time In inside the school geofence circle.',
      actionLabel: 'Open Teacher Time In / Out',
      targetTab: 'scanner',
    };
  }
  if (kind === 'TIME_OUT') {
    return {
      id: `TEST_TIME_OUT_${Date.now()}`,
      kind: 'TIME_OUT',
      title: 'Time to TIME OUT',
      subtitle: 'Teacher Attendance Alarm',
      timeLabel: label,
      detail: 'School duty has ended. Record your Teacher Time Out before leaving the school boundary.',
      actionLabel: 'Open Teacher Time In / Out',
      targetTab: 'scanner',
    };
  }
  return {
    id: `TEST_PERIOD_${Date.now()}`,
    kind: 'CLASS_PERIOD',
    title: 'Class Period Starting Now',
    subtitle: 'Student Attendance Reminder',
    timeLabel: label,
    detail: 'Your scheduled class period is starting. Open the phone camera QR scanner for student attendance.',
    actionLabel: 'Open Student QR Scanner',
    targetTab: 'scanner',
  };
}
