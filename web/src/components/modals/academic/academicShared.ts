// AttendSure Web - Academic Shared Component
// File: D:\AttendSure_V3\web\src\components\modals\academic\academicShared.ts

/**
 * AttendSure - Shared Helpers, Types & Styles for Academic Setup Sub-Forms
 * File: web/src/components/modals/academic/academicShared.ts
 */

import type React from 'react';

export type AcademicSubTab =
  | 'SECTIONS'
  | 'SCHEDULE'
  | 'ROOMS'
  | 'SUBJECTS'
  | 'GRADES'
  | 'YEARS'
  | 'HOLIDAYS';

export interface AcademicThemeTokens {
  bgSurface: string;
  bgSurfaceSubtle: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
}

export interface AcademicNamedRef {
  id: number;
  name?: string;
  code?: string;
  full_name?: string;
}

export interface AcademicTeacherOption {
  id: number;
  name?: string;
  full_name?: string;
  employee_id?: string;
  advised_sections?: string[];
  can_handle_classes?: boolean;
}

export interface AcademicGradeItem {
  id: number;
  code: string;
  name: string;
  stage?: string;
  level_order?: number;
}

export interface AcademicRoomItem {
  id: number;
  name: string;
  building?: string;
  capacity?: number;
}

export interface AcademicSubjectItem {
  id: number;
  code: string;
  title: string;
  units?: number;
}

export interface AcademicYearItem {
  id: number;
  code: string;
  start_date?: string;
  baseline_cutoff_date?: string;
  end_date?: string;
  is_active?: boolean;
}

export interface AcademicHolidayItem {
  id: number;
  date: string;
  type?: string;
  reason?: string;
  title?: string;
}

export interface AcademicSectionItem {
  id: number;
  name: string;
  section_name?: string;
  grade_level?: number | AcademicNamedRef | null;
  grade_level_id?: number | null;
  grade_level_name?: string;
  adviser?: number | AcademicNamedRef | null;
  adviser_id?: number | null;
  adviser_name?: string;
  adviser_full_name?: string;
  room_number?: string;
  room_name?: string;
  capacity?: number;
}

export interface AcademicScheduleItem {
  id: number;
  section?: number | AcademicNamedRef | null;
  section_id?: number | null;
  section_name?: string;
  subject?: number | AcademicNamedRef | null;
  subject_id?: number | null;
  subject_code?: string;
  teacher?: number | AcademicNamedRef | null;
  teacher_id?: number | null;
  teacher_name?: string;
  room?: number | AcademicNamedRef | null;
  room_id?: number | null;
  start_time?: string;
  end_time?: string;
  day_of_week?: string;
  days_of_week?: string;
}

export const DAY_SCHEDULE_OPTIONS = [
  { value: 'ALL_WEEKDAYS', label: 'Monday to Friday' },
  { value: 'MWF', label: 'Monday, Wednesday, Friday (MWF)' },
  { value: 'TTH', label: 'Tuesday, Thursday (TTH)' },
  { value: '1', label: 'Monday Only' },
  { value: '2', label: 'Tuesday Only' },
  { value: '3', label: 'Wednesday Only' },
  { value: '4', label: 'Thursday Only' },
  { value: '5', label: 'Friday Only' },
  { value: '6', label: 'Saturday Only' },
  { value: '7', label: 'Sunday Only' },
];

export const sanitizeAcademicField = (raw: string, maxLength = 100): string =>
  Array.from(String(raw || ''))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127 && ch !== '<' && ch !== '>';
    })
    .join('')
    .slice(0, maxLength);

export const extractTeacherId = (item: AcademicScheduleItem | null | undefined): string => {
  if (!item) return '';
  const candidate =
    item.teacher_id ??
    (typeof item.teacher === 'object' && item.teacher ? item.teacher.id : item.teacher) ??
    '';
  return candidate !== null && candidate !== undefined ? String(candidate) : '';
};

export const extractTeacherName = (
  item: AcademicScheduleItem | null | undefined,
  teacherList: AcademicTeacherOption[]
): string => {
  if (!item) return 'Unassigned';
  const directName =
    item.teacher_name ||
    (typeof item.teacher === 'object' && item.teacher
      ? item.teacher.full_name || item.teacher.name
      : null);
  if (directName && String(directName).trim()) return String(directName).trim();

  const tid = extractTeacherId(item);
  if (tid) {
    const match = teacherList.find((t) => String(t.id) === tid);
    if (match) return match.full_name || match.name || 'Unassigned';
  }
  return 'Unassigned';
};

export const formCardStyle = (tokens: AcademicThemeTokens): React.CSSProperties => ({
  padding: 12,
  borderRadius: 8,
  backgroundColor: tokens.bgSurfaceSubtle,
  border: `1px solid ${tokens.borderSubtle}`,
});

export const labelStyle = (tokens: AcademicThemeTokens): React.CSSProperties => ({
  display: 'block',
  fontSize: '0.70rem',
  fontWeight: 700,
  color: tokens.textSecondary,
  marginBottom: 3,
});

export const inputStyle = (tokens: AcademicThemeTokens): React.CSSProperties => ({
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: `1px solid ${tokens.borderStrong}`,
  backgroundColor: tokens.bgSurface,
  color: tokens.textPrimary,
  fontSize: '0.78rem',
  boxSizing: 'border-box',
  outline: 'none',
});

export const tableContainerStyle = (tokens: AcademicThemeTokens): React.CSSProperties => ({
  maxHeight: 240,
  overflowY: 'auto',
  backgroundColor: tokens.bgSurface,
  border: `1px solid ${tokens.borderSubtle}`,
  borderRadius: 8,
});

export const alertBoxStyle = (bg: string, color: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderRadius: 6,
  backgroundColor: bg,
  color,
  fontSize: '0.78rem',
  fontWeight: 600,
});
