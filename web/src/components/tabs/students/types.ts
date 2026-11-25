// AttendSure Web - Shared Student Directory Types & Helpers
// File: D:\AttendSure_V3\web\src\components\tabs\students\types.ts

export interface StudentRecord {
  id: number;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name: string;
  sex: string;
  birthdate?: string;
  mother_tongue?: string;
  ethnic_group?: string;
  religion?: string;
  house_street_sitio?: string;
  barangay?: string;
  municipality_city?: string;
  province?: string;
  father_name?: string;
  mother_maiden_name?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  guardian_contact: string;
  qr_token?: string;
  qr_payload?: string;
  current_section?: string;
  current_section_id?: number | null;
  section_id?: number;
  enrollment_status?: 'ENROLLED' | 'TRANSFERRED_IN' | 'TRANSFERRED_OUT' | 'DROPPED';
  grade_level_name?: string;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

export interface GradeLevelItem {
  id: number;
  code: string;
  name: string;
}

export interface SectionItem {
  id: number;
  name: string;
  code?: string;
  display_label?: string;
  grade_level?: number | { id: number; name: string };
  grade_level_name?: string;
  adviser_id?: number | null;
  is_adviser?: boolean;
  scheduled_subjects_count?: number;
}

export interface MetricsData {
  total: number;
  active: number;
  paired: number;
  total_sections: number;
}

export interface CsvImportSummary {
  ok: boolean;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  errors: Array<{ row: number; lrn: string; reason: string }>;
}

export type ModalFormTab = 'BASIC' | 'ADDRESS' | 'GUARDIAN' | 'DEPED';

export interface StudentFormData {
  lrn: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  sex: string;
  birthdate: string;
  grade_level_id: string;
  section_id: string;
  enrollment_status: 'ENROLLED' | 'TRANSFERRED_IN' | 'TRANSFERRED_OUT' | 'DROPPED';
  qr_token: string;
  photo: string | null;
  house_street_sitio: string;
  barangay: string;
  municipality_city: string;
  province: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_contact: string;
  mother_tongue: string;
  ethnic_group: string;
  religion: string;
}

export const maskQrToken = (token?: string): string => {
  const clean = String(token || '').trim();
  if (!clean) return '';
  return clean.length <= 4 ? 'Linked' : `••••${clean.slice(-4)}`;
};
