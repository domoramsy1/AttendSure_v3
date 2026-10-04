// ============================================================================
// ATTENDSURE V3: CORE SHARED DATA TYPES
// Standardized interfaces for classes, sections, school terms, and user sessions.
// ============================================================================

/**
 * User authentication session state stored on the client.
 */
export interface UserSession {
  token: string;
  username: string;
  staff_name: string;
  role: string;
  user_id?: number;
  staff_id?: string | null;
  is_superuser?: boolean;
}

/**
 * Standard class section item used across dropdowns, tables, and reports.
 */
export interface SectionItem {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  adviser_name: string;
  display_label: string;
  room_number?: string;
  capacity?: number;
  track_strand?: string;
  adviser_id?: number | null;
  grade_level_id?: number;
  academic_year_id?: number;
}

/**
 * Academic year / school term definition.
 */
export interface AcademicYearItem {
  id: number;
  code: string;
  start_date: string;
  end_date: string;
  first_friday_june?: string;
  is_active: boolean;
}

/**
 * Educational grade level or student year group.
 */
export interface GradeLevelItem {
  id: number;
  code: string;
  name: string;
  tier?: string;
  level_order: number;
}

/**
 * Dynamic school profile and configuration details.
 */
export interface SchoolProfileItem {
  id?: number;
  school_id: string;
  school_name: string;
  region?: string;
  division?: string;
  district?: string;
  principal_name?: string;
  principal_title?: string;
  left_logo?: string | null;
  right_logo?: string | null;
  school_seal_photo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geofence_radius_meters?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Real-time daily attendance rate summary for a class section.
 */
export interface SectionAttendanceSummary {
  section_id: number;
  section_name: string;
  enrolled: number;
  present: number;
  rate: number;
}