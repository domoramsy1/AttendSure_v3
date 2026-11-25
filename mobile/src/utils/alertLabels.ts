// AttendSure Mobile - Shared Campus Alert Labels & Phone Health Formatters
// File: D:\AttendSure_V3\mobile\src\utils\alertLabels.ts

export type CampusAlertType =
  | 'TEACHER_OUTSIDE_GEOFENCE'
  | 'TEACHER_SIGNAL_LOST'
  | 'STUDENT_CUTTING_CLASS'
  | 'EXPIRED_EXIT_PASS';

export const CAMPUS_ALERT_TYPE_LABELS: Record<CampusAlertType, string> = {
  TEACHER_OUTSIDE_GEOFENCE: 'Teacher Outside Campus',
  TEACHER_SIGNAL_LOST: 'Teacher Phone Signal Lost',
  STUDENT_CUTTING_CLASS: 'Student Cutting Class',
  EXPIRED_EXIT_PASS: 'Expired Exit Pass',
};

export const MOBILE_ALERT_FILTER_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'ALL', label: 'All Alerts' },
  { key: 'TEACHER_OUTSIDE_GEOFENCE', label: 'Outside Campus' },
  { key: 'TEACHER_SIGNAL_LOST', label: 'Phone Signal Lost' },
  { key: 'STUDENT_CUTTING_CLASS', label: 'Student Cutting' },
  { key: 'EXPIRED_EXIT_PASS', label: 'Expired Pass' },
];

export function getCampusAlertTypeLabel(rawType?: string | null): string {
  const code = String(rawType || '').trim().toUpperCase() as CampusAlertType;
  if (code in CAMPUS_ALERT_TYPE_LABELS) {
    return CAMPUS_ALERT_TYPE_LABELS[code];
  }
  return code ? code.replace(/_/g, ' ') : 'Campus Alert';
}

export function getCampusAlertStatusLabel(status?: string | null, incidentType?: string | null): string {
  const cleanStatus = String(status || '').trim().toUpperCase();
  const cleanType = String(incidentType || '').trim().toUpperCase();
  if (cleanStatus === 'CONFIRMED_LOAFING') {
    if (cleanType === 'STUDENT_CUTTING_CLASS') return 'CONFIRMED CUTTING';
    if (cleanType === 'TEACHER_SIGNAL_LOST') return 'CONFIRMED SIGNAL LOST';
    return 'CONFIRMED ALERT';
  }
  if (cleanStatus === 'EXCUSED') return 'EXCUSED';
  if (cleanStatus === 'RESOLVED') return 'RESOLVED';
  return cleanStatus || 'OPEN';
}

export interface TeacherPhoneHealthFields {
  battery_percent?: number | null;
  is_charging?: boolean | null;
  is_low_power_mode?: boolean | null;
  network_type?: string | null;
  is_gps_enabled?: boolean | null;
  app_state?: string | null;
  ping_source?: string | null;
}

export function formatNetworkLabel(networkType?: string | null): string {
  const code = String(networkType || '').trim().toUpperCase();
  if (code === 'WIFI') return 'Wi-Fi';
  if (code === 'CELLULAR') return 'Mobile Data';
  if (code === 'NONE') return 'No Signal';
  return 'Unknown Net';
}

export function formatBatteryLabel(
  batteryPercent?: number | null,
  isCharging?: boolean | null
): string {
  if (typeof batteryPercent !== 'number' || !Number.isFinite(batteryPercent)) {
    return 'Battery —';
  }
  return `${Math.round(batteryPercent)}%${isCharging ? ' Charging' : ''}`;
}
