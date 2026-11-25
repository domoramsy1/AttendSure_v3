// AttendSure Web - Shared Geofence Types & Helpers
// File: D:\AttendSure_V3\web\src\components\tabs\geofence\types.ts

export interface TeacherBoundaryStatus {
  id: number;
  teacher_id?: number;
  teacher_name: string;
  full_name?: string;
  employee_id: string;
  position: string | null;
  department?: string | null;
  zone_status?: 'INSIDE' | 'AUTHORIZED_OUTSIDE' | 'LOAFING_ALERT' | 'SIGNAL_LOST' | 'OFF_DUTY';
  status: string;
  is_clocked_in?: boolean;
  is_online?: boolean;
  has_signal_lost?: boolean;
  is_inside?: boolean;
  is_inside_geofence?: boolean;
  distance: string | number | null;
  distance_meters?: number | null;
  accuracy_meters?: number | null;
  last_seen: string | null;
  device_model?: string | null;
  bound_device_id?: string | null;
  battery_percent?: number | null;
  is_charging?: boolean | null;
  is_low_power_mode?: boolean | null;
  network_type?: 'WIFI' | 'CELLULAR' | 'NONE' | 'UNKNOWN' | string | null;
  is_gps_enabled?: boolean | null;
  app_state?: 'ACTIVE' | 'BACKGROUND' | 'UNKNOWN' | string | null;
  ping_source?: 'FOREGROUND' | 'BACKGROUND_TASK' | 'OFFLINE_QUEUE' | string | null;
  photo?: string | null;
  photo_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface GeofenceOverviewData {
  campus_name?: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  center_latitude?: number | null;
  center_longitude?: number | null;
  radius_meters: number | null;
  loafing_grace_minutes?: number;
  duty_start_time?: string;
  duty_end_time?: string;
  enforce_geofence_checkin?: boolean;
  verified_inside: number;
  online_users_count?: number;
  offline_users_count?: number;
  incidents_today: number;
  open_incidents_count?: number;
  teacher_list: TeacherBoundaryStatus[];
  loafing_incidents?: Array<{
    id: number;
    person_name: string;
    incident_type: string;
    remarks: string;
    status: string;
    detected_at?: string;
  }>;
}

export interface AuditRecord {
  id: number | string;
  teacher_id?: number;
  teacher_name: string;
  employee_id?: string;
  timestamp: string;
  time_only: string;
  date_only: string;
  latitude?: number;
  longitude?: number;
  distance?: string | number | null;
  distance_meters?: number | null;
  accuracy_meters?: number | null;
  status?: string;
  is_inside: boolean;
  is_inside_geofence?: boolean;
  device_id?: string | null;
  details?: string;
}

export const formatMeters = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return '—';
  const rawStr = typeof val === 'string' ? val.trim() : '';
  if (typeof val === 'string' && (!rawStr || rawStr === 'null' || rawStr === 'undefined')) {
    return '—';
  }
  const numeric =
    typeof val === 'number'
      ? val
      : Number(rawStr.replace(/\s*m$/i, ''));
  if (Number.isFinite(numeric)) {
    if (numeric >= 1000) {
      return `${(numeric / 1000).toFixed(2)} km`;
    }
    return `${Math.round(numeric)}m`;
  }
  return rawStr || '—';
};
