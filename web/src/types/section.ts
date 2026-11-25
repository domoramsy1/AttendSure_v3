// AttendSure Core Shared Data Types
// File: D:\AttendSure_V3\web\src\types\section.ts

export interface UserSession {
  token: string;
  username: string;
  teacher_name: string;
  role: string;
  user_id?: number;
  teacher_id?: number | string | null;
  is_superuser?: boolean;
}

export interface SectionItem {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  adviser_name: string;
  display_label: string;
  room_name?: string;
  room_number?: string;
  capacity?: number;
  track_strand?: string;
  adviser_id?: number | null;
  grade_level_id?: number;
  academic_year_id?: number;
}

export interface AcademicYearItem {
  id: number;
  name?: string;
  code: string;
  start_date: string;
  end_date: string;
  first_friday_june?: string;
  is_active: boolean;
}

export interface GradeLevelItem {
  id: number;
  code: string;
  name: string;
  tier?: string;
  level_number?: number;
  level_order: number;
}

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

export interface SectionAttendanceSummary {
  section_id: number;
  section_name: string;
  enrolled: number;
  present: number;
  rate: number;
}
