// AttendSure Web - Shared Campus Alert Labels & Phone Health Formatters
// File: D:\AttendSure_V3\web\src\utils\alertLabels.ts

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

export const CAMPUS_ALERT_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Alert Types' },
  { value: 'TEACHER_OUTSIDE_GEOFENCE', label: 'Teacher Outside Campus' },
  { value: 'TEACHER_SIGNAL_LOST', label: 'Teacher Phone Signal Lost' },
  { value: 'STUDENT_CUTTING_CLASS', label: 'Student Cutting Class' },
  { value: 'EXPIRED_EXIT_PASS', label: 'Expired Exit Pass' },
];

export function getCampusAlertLabel(rawType?: string | null): string {
  const code = String(rawType || '').trim().toUpperCase() as CampusAlertType;
  if (code in CAMPUS_ALERT_TYPE_LABELS) {
    return CAMPUS_ALERT_TYPE_LABELS[code];
  }
  return code ? code.replace(/_/g, ' ') : 'Campus Alert';
}

export function getCampusAlertStatusLabel(status: string, incidentType?: string): string {
  if (status === 'CONFIRMED_LOAFING') {
    if (incidentType === 'STUDENT_CUTTING_CLASS') return 'Confirmed Cutting';
    if (incidentType === 'TEACHER_SIGNAL_LOST') return 'Confirmed Signal Lost';
    return 'Confirmed Alert';
  }
  if (status === 'OPEN') return 'Open Alert';
  if (status === 'RETURNED') return 'Returned';
  if (status === 'EXCUSED') return 'Excused';
  return status;
}

export function formatPhoneNetworkLabel(networkType?: string | null): string {
  const code = String(networkType || '').trim().toUpperCase();
  if (code === 'WIFI') return 'Wi-Fi';
  if (code === 'CELLULAR') return 'Mobile Data';
  if (code === 'NONE') return 'No Signal';
  return 'Unknown';
}

export function formatPhoneBatteryLabel(
  batteryPercent?: number | null,
  isCharging?: boolean | null
): string {
  if (typeof batteryPercent !== 'number' || !Number.isFinite(batteryPercent)) {
    return '—';
  }
  return `${Math.round(batteryPercent)}%${isCharging ? ' Charging' : ''}`;
}
