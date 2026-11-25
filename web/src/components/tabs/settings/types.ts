/**
 * AttendSure - Shared Types & Helpers for Settings Sub-Panels
 * File: web/src/components/tabs/settings/types.ts
 */

export interface TeacherOption {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  department: string;
  contact_number?: string;
  email?: string;
  photo_url?: string | null;
}

export interface MaintenanceHealthStatus {
  database: 'ONLINE' | 'OFFLINE';
  dbLatencyMs: number;
  teachersOnline: number;
  teachersTotal: number;
  openLoafingIncidents: number;
  activeExitPasses: number;
  lastChecked: string;
}

export interface ActivityRecord {
  id: number;
  created_at?: string;
  timestamp?: string;
  time_only?: string;
  date_only?: string;
  user?: string;
  performed_by?: string;
  actor_username?: string;
  actor_name?: string;
  action: string;
  action_label?: string;
  table_name?: string;
  target_model?: string;
  record_id?: number;
  target_id?: number;
  module?: string;
  changes?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  changed_fields?: string[] | null;
  details?: string;
  ip_address?: string;
  client_ip?: string;
  user_agent?: string;
  status?: string;
}

export interface SchoolSettingsFormData {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  academic_year: string;
  address: string;
  contact_number: string;
  email: string;
  website: string;
  principal_teacher: string | number;
  principal_name: string;
  principal_title: string;
  principal_photo_url: string | null;
  principal_employee_id: string;
  principal_department: string;
  principal_contact_number: string;
  principal_email: string;
  superintendent_name: string;
  school_logo: string | null;
  left_logo: string | null;
  right_logo: string | null;
  latitude: string;
  longitude: string;
  geofence_radius_meters: number;
}

export interface FreshLogosState {
  school_logo: boolean;
  left_logo: boolean;
  right_logo: boolean;
}

export const sanitizeSettingsInput = (raw: string, maxLength = 200): string =>
  Array.from(String(raw || ''))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127 && ch !== '<' && ch !== '>';
    })
    .join('')
    .trim()
    .slice(0, maxLength);
