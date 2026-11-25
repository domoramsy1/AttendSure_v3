// AttendSure - Core Mobile Type Definitions (3NF & Teachers/Staff Only)
// File: mobile/src/types/index.ts

export type UserRole = 'ADMIN' | 'PRINCIPAL' | 'DEPT_HEAD' | 'TEACHER';

export interface DeviceIdentity {
  deviceId: string;
  deviceModel?: string;
  modelName?: string | null;
  brand?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  isPhysicalDevice?: boolean;
}

export interface AttendanceLog {
  id?: number | string;
  enrollment_id?: number;
  student_id?: number;
  student_name?: string;
  lrn?: string;
  schedule_id?: number;
  subject_code?: string;
  section?: string;
  attendance_date?: string;
  status?: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED' | string;
  scan_method?: 'CAMERA_QR' | 'MANUAL' | string;
  scanned_at?: string;
}

export interface SchoolProfile {
  id?: number | string;
  school_id: string;
  school_name: string;
  region?: string;
  division?: string;
  district?: string;
  address?: string;
  contact_number?: string;
  email?: string;
  principal_name?: string;
  principal_title?: string;
  school_logo?: string | null;
  left_logo?: string | null;
  right_logo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number | null;
  updated_at?: string;
}

export interface TeacherProfileObject {
  id?: number;
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  position?: string;
  department?: string;
  photo?: string | null;
  photo_url?: string | null;
  qr_token?: string;
  bound_device_id?: string | null;
}

export interface UserAccount {
  id: number | string;
  user_id?: number | string;
  username: string;
  email?: string;
  role?: UserRole | string;
  system_role?: UserRole | string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  contact_number?: string;
  position?: string;
  department?: string;
  employee_id?: string;
  teacher_id?: number | string | null;
  teacher_name?: string;
  teacher?: TeacherProfileObject;
  qr_token?: string;
  photo?: string | null;
  photo_url?: string | null;
  bound_device_id?: string | null;
  has_bound_device?: boolean;
  has_biometric_enrolled?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  token?: string;
}

export type AuthenticatedUser = UserAccount;

export interface UpdateProfilePayload {
  first_name: string;
  last_name: string;
  middle_name?: string;
  suffix?: string;
  email: string;
  contact_number: string;
  position?: string;
  department?: string;
  password?: string;
}

export interface AuthResponse {
  token: string;
  access?: string;
  refresh?: string;
  user_id: number;
  username: string;
  role: UserRole;
  teacher_id: number | null;
  teacher_name: string;
  is_superuser: boolean;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  email?: string;
  contact_number?: string;
  position?: string;
  department?: string;
  photo?: string | null;
  school_profile?: SchoolProfile | null;
}

export interface GeofenceConfig {
  campus_name?: string;
  name?: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  loafing_grace_minutes?: number;
  duty_start_time?: string;
  duty_end_time?: string;
  is_configured?: boolean;
}

export interface CampusPingPayload {
  device_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  is_mock_location: boolean;
}

export interface CampusPingResponse {
  ok?: boolean;
  zone_status?: 'INSIDE' | 'AUTHORIZED_OUTSIDE' | 'LOAFING_ALERT' | 'OFF_DUTY' | 'THROTTLED';
  distance_meters?: number;
  radius_meters?: number;
  is_inside?: boolean;
  loafing_incident_id?: number | null;
  server_time?: string;
  message?: string;
  isQueuedOffline?: boolean;
}
