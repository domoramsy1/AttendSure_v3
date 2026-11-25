/**
 * AttendSure Mobile - Shared Academic Setup Types
 * File: mobile/src/components/schedules/types.ts
 */

export type ScheduleSubTab =
  | 'PERIODS'
  | 'SECTIONS'
  | 'SUBJECTS'
  | 'ROOMS'
  | 'GRADES'
  | 'YEARS'
  | 'DEPARTMENTS'
  | 'HOLIDAYS';

export interface PeriodFormState {
  section: string;
  subject: string;
  teacher: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface SectionFormState {
  grade_level: string;
  name: string;
  room_name: string;
  capacity: string;
  track_strand: string;
  adviser: string;
  allow_multiple_advisories: boolean;
}

export interface SubjectFormState {
  code: string;
  title: string;
  grade_level: string;
  subject_category: string;
  units: string;
}

export interface RoomFormState {
  name: string;
  building: string;
  capacity: string;
  room_type: string;
  is_active: boolean;
}

export interface GradeFormState {
  level_number: string;
  code: string;
  name: string;
  stage: string;
}

export interface YearFormState {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface DeptFormState {
  code: string;
  name: string;
}

export interface HolidayFormState {
  date: string;
  type: string;
  title: string;
}
