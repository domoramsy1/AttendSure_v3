// AttendSure - Core Mobile Type Definitions
// File: mobile/src/types/index.ts

// ==============================================================================
// 1. ROLES & DEVICE IDENTIFICATION (CYBERSECURITY CONTROLS)
// ==============================================================================

export type UserRole = 'ADMIN' | 'PRINCIPAL' | 'DEPT_HEAD' | 'FACULTY' | 'GUARD';

export interface DeviceIdentity {
  deviceId: string;
  deviceModel?: string;
  modelName?: string | null;
  brand?: string | null;
  osName?: string | null;
  osVersion?: string | null;
  isPhysicalDevice?: boolean;
}

// ==============================================================================
// 2. SCHOOL GATE LOGS & CAMPUS PROFILE
// ==============================================================================

export interface GateLog {
  id?: number | string;
  log_id?: string;
  person_type?: 'STUDENT' | 'STAFF' | string;
  identifier?: string;
  name?: string;
  direction: 'IN' | 'OUT';
  scan_method: 'RFID' | 'QR';
  kiosk_name?: string;
  kiosk_code?: string;
  scan_time: string;
  raw_time?: string;
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

// ==============================================================================
// 3. USER ACCOUNTS & PROFILES (SYNCED WITH WEB & POSTGRESQL)
// ==============================================================================

export interface FacultyProfileObject {
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  email?: string;
  contact_number?: string;
  phone?: string;
  position?: string;
  department?: string;
  photo?: string | null;
  avatar?: string | null;
  qr_token?: string;
  bound_device_id?: string | null;
}

export interface UserAccount {
  id: number | string;
  user_id?: number | string;
  username: string;
  email?: string;
  role?: UserRole | string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  contact_number?: string;
  phone?: string;
  position?: string;
  department?: string;
  faculty_id?: string;
  faculty_name?: string;
  faculty?: FacultyProfileObject;
  qr_token?: string;
  photo?: string | null;
  avatar?: string | null;
  is_staff?: boolean;
  is_superuser?: boolean;
  token?: string;
}

// Alias for seamless compatibility across AuthContext and mobile screens
export type AuthenticatedUser = UserAccount;

// Strict typing for updating profile data without sending untrusted keys
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

// ==============================================================================
// 4. AUTHENTICATION RESPONSES
// ==============================================================================

export interface AuthResponse {
  token: string;
  user_id: number;
  username: string;
  role: string;
  faculty_id: string | null;
  faculty_name: string;
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

// ==============================================================================
// 5. GEOFENCING & TELEMETRY (HARDWARE SECURITY)
// ==============================================================================

export interface GeofenceConfig {
  name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  is_configured: boolean;
}

export interface TelemetryHeartbeatPayload {
  client_device_id: string;
  latitude: number;
  longitude: number;
  battery_level: number;
  is_mock_location: boolean;
  request_id?: string;
}