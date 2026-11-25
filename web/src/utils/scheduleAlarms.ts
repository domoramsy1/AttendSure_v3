// AttendSure Web - Schedule Alarms Utility
// File: D:\AttendSure_V3\web\src\utils\scheduleAlarms.ts

/**
 * AttendSure Web - Teacher Time In/Out & Class Period Alarm Sound + Reminder Engine
 * File: web/src/utils/scheduleAlarms.ts
 *
 * Uses built-in Web Audio API synthesis (zero external audio files or CDN calls)
 * plus optional browser desktop alerts to ring when it is time for:
 * 1. Teacher TIME IN (start of school duty)
 * 2. Teacher TIME OUT (end of school duty)
 * 3. Scheduled Class Period start
 */

export type AlarmKind = 'TIME_IN' | 'TIME_OUT' | 'CLASS_PERIOD';

export interface ActiveAlarmEvent {
  id: string;
  kind: AlarmKind;
  title: string;
  subtitle: string;
  timeLabel: string;
  detail: string;
  actionLabel: string;
  targetTab: 'classroom-scanner' | 'geofence' | 'dtr';
}

export interface AlarmClassSlot {
  id: number;
  subject_code: string;
  subject_title: string;
  section_name: string;
  grade_level?: string;
  room_number?: string;
  room?: string;
  start_time: string;
  end_time: string;
  day_of_week?: string;
}

export interface AlarmScheduleSnapshot {
  dutyStartTime: string;
  dutyEndTime: string;
  isTimedInToday: boolean;
  classes: AlarmClassSlot[];
}

const ALARM_ENABLED_KEY = 'attendsure_web_alarms_enabled';
const ALARM_DISMISSED_PREFIX = 'attendsure_web_dismissed_alarms_';

let sharedAudioCtx: AudioContext | null = null;
let alarmLoopHandle: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function unlockWebAlarmAudio(): void {
  getAudioContext();
}

const MELODIES: Record<AlarmKind, { freqs: number[]; noteSec: number; gapSec: number; wave: OscillatorType }> = {
  TIME_IN: {
    freqs: [587.33, 739.99, 880, 1174.66],
    noteSec: 0.16,
    gapSec: 0.05,
    wave: 'triangle',
  },
  TIME_OUT: {
    freqs: [1046.5, 880, 783.99, 523.25],
    noteSec: 0.18,
    gapSec: 0.05,
    wave: 'sine',
  },
  CLASS_PERIOD: {
    freqs: [880, 1108.73, 880, 1318.51, 1318.51],
    noteSec: 0.15,
    gapSec: 0.05,
    wave: 'triangle',
  },
};

export function playWebAlarmChime(kind: AlarmKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const pattern = MELODIES[kind] || MELODIES.CLASS_PERIOD;
    let cursor = ctx.currentTime + 0.02;

    for (const freq of pattern.freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = pattern.wave;
      osc.frequency.setValueAtTime(freq, cursor);

      gain.gain.setValueAtTime(0.001, cursor);
      gain.gain.linearRampToValueAtTime(0.22, cursor + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, cursor + pattern.noteSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(cursor);
      osc.stop(cursor + pattern.noteSec + 0.01);
      cursor += pattern.noteSec + pattern.gapSec;
    }
  } catch {
    // Browser autoplay policy may block before user interaction
  }
}

export function startWebAlarmLoop(kind: AlarmKind): void {
  stopWebAlarmLoop();
  playWebAlarmChime(kind);
  alarmLoopHandle = setInterval(() => {
    playWebAlarmChime(kind);
  }, 3400);
}

export function stopWebAlarmLoop(): void {
  if (alarmLoopHandle) {
    clearInterval(alarmLoopHandle);
    alarmLoopHandle = null;
  }
}

export function sendBrowserDesktopAlert(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (window.Notification.permission === 'granted') {
      new window.Notification(title, { body, silent: false });
    }
  } catch {
    // Ignore restricted desktop notification contexts
  }
}

export async function requestBrowserAlertPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return await window.Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function getWebAlarmsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ALARM_ENABLED_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setWebAlarmsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ALARM_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {}
}

export function getLocalDateStamp(dateObj: Date = new Date()): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDismissedAlarmIds(dateStamp: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${ALARM_DISMISSED_PREFIX}${dateStamp}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markAlarmDismissed(dateStamp: string, alarmId: string): void {
  try {
    const current = getDismissedAlarmIds(dateStamp);
    current.add(alarmId);
    localStorage.setItem(`${ALARM_DISMISSED_PREFIX}${dateStamp}`, JSON.stringify(Array.from(current)));
  } catch {}
}

export function parseTimeToMinutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const parts = String(hhmm).trim().split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const mins = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
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

export function periodRunsToday(dayOfWeek: string | undefined, jsDay: number): boolean {
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

export function evaluateDueWebAlarm(
  snapshot: AlarmScheduleSnapshot,
  now: Date = new Date()
): ActiveAlarmEvent | null {
  const dateStamp = getLocalDateStamp(now);
  const dismissed = getDismissedAlarmIds(dateStamp);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const jsDay = now.getDay();
  const isWeekday = jsDay >= 1 && jsDay <= 5;

  // 1. Teacher TIME IN reminder (weekdays, if not timed in yet, within [start, start + 2 min])
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
        detail:
          'School duty is starting now. Record your Teacher Time In inside the school campus boundary.',
        actionLabel: 'Open Campus Geofence',
        targetTab: 'geofence',
      };
    }
  }

  // 2. Teacher TIME OUT reminder (weekdays, if timed in, within [end, end + 2 min])
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
        detail:
          'School duty hours have ended. Please record your Teacher Time Out before leaving campus.',
        actionLabel: 'View My DTR',
        targetTab: 'dtr',
      };
    }
  }

  // 3. Class Period start reminder (for classes scheduled today, within [periodStart, periodStart + 2 min])
  for (const cls of snapshot.classes) {
    if (!periodRunsToday(cls.day_of_week, jsDay)) continue;
    const pStart = parseTimeToMinutes(cls.start_time);
    if (pStart === null) continue;
    const alarmId = `PERIOD_${dateStamp}_${cls.id}_${cls.start_time}`;
    if (!dismissed.has(alarmId) && nowMins >= pStart && nowMins <= pStart + 2) {
      const pEnd = parseTimeToMinutes(cls.end_time);
      const range = pEnd !== null ? `${formatMinutes12h(pStart)} – ${formatMinutes12h(pEnd)}` : formatMinutes12h(pStart);
      return {
        id: alarmId,
        kind: 'CLASS_PERIOD',
        title: `Class Period Now: ${cls.subject_title || cls.subject_code}`,
        subtitle: `${cls.grade_level ? `${cls.grade_level} - ` : ''}${cls.section_name}`,
        timeLabel: range,
        detail: `Room: ${cls.room_number || cls.room || 'Assigned Room'} • Open the Classroom QR Scanner to record student attendance.`,
        actionLabel: 'Open Classroom Scanner',
        targetTab: 'classroom-scanner',
      };
    }
  }

  return null;
}

export function buildTestWebAlarm(kind: AlarmKind): ActiveAlarmEvent {
  const now = new Date();
  const timeLabel = formatMinutes12h(now.getHours() * 60 + now.getMinutes());
  if (kind === 'TIME_IN') {
    return {
      id: `TEST_TIME_IN_${Date.now()}`,
      kind: 'TIME_IN',
      title: 'Time to TIME IN',
      subtitle: 'Teacher Attendance Reminder (Test Alarm)',
      timeLabel,
      detail: 'Your teacher duty starts now. Record your Teacher Time In inside the school campus circle.',
      actionLabel: 'Open Campus Geofence',
      targetTab: 'geofence',
    };
  }
  if (kind === 'TIME_OUT') {
    return {
      id: `TEST_TIME_OUT_${Date.now()}`,
      kind: 'TIME_OUT',
      title: 'Time to TIME OUT',
      subtitle: 'Teacher Attendance Reminder (Test Alarm)',
      timeLabel,
      detail: 'Your teacher duty ends now. Record your Teacher Time Out before leaving the campus boundary.',
      actionLabel: 'View My DTR',
      targetTab: 'dtr',
    };
  }
  return {
    id: `TEST_PERIOD_${Date.now()}`,
    kind: 'CLASS_PERIOD',
    title: 'Class Period Starting Now',
    subtitle: 'Classroom Student Attendance Reminder (Test Alarm)',
    timeLabel,
    detail: 'Your scheduled class period is starting. Open the built-in camera QR scanner to record student attendance.',
    actionLabel: 'Open Classroom Scanner',
    targetTab: 'classroom-scanner',
  };
}
