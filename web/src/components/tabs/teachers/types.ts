// AttendSure Web - Teachers Tab Shared Types & Helpers
// File: D:\AttendSure_V3\web\src\components\tabs\teachers\types.ts

import { isSafeImageUrl, sanitizeText } from '../../../theme/tokens';

export interface Teacher {
  id: number;
  user?: number;
  employee_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  full_name: string;
  position: string;
  department: string;
  contact_number?: string;
  email?: string;
  can_handle_classes?: boolean;
  can_teach?: boolean;
  bound_device_id?: string | null;
  device_model?: string | null;
  device_bound_at?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}

export interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

export type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'BOUND' | 'UNBOUND';

export interface TeacherFormState {
  employee_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  position: string;
  department: string;
  contact_number: string;
  email: string;
  can_handle_classes: boolean;
  is_active: boolean;
  photo: string | null;
}

export interface PositionGroupOption {
  category: string;
  ranks: string[];
}

export const DEFAULT_POSITION_GROUPS: PositionGroupOption[] = [
  {
    category: 'Classroom Teachers',
    ranks: [
      'Teacher I',
      'Teacher II',
      'Teacher III',
      'Special Science Teacher I',
      'Master Teacher I',
      'Master Teacher II',
      'Master Teacher III',
      'Master Teacher IV',
    ],
  },
  {
    category: 'Department Heads',
    ranks: [
      'Head Teacher I',
      'Head Teacher II',
      'Head Teacher III',
      'Head Teacher IV',
      'Head Teacher V',
      'Head Teacher VI',
    ],
  },
  {
    category: 'School Leadership',
    ranks: [
      'Assistant School Principal I',
      'Assistant School Principal II',
      'School Principal I',
      'School Principal II',
      'School Principal III',
      'School Principal IV',
      'Secondary School Principal IV',
    ],
  },
  {
    category: 'Academic & Office Support',
    ranks: [
      'Administrative Officer II',
      'Administrative Assistant',
      'School Registrar',
      'Guidance Counselor I',
      'ICT Systems Coordinator',
    ],
  },
];

export const INITIAL_FORM_DATA: TeacherFormState = {
  employee_id: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  position: 'Teacher I',
  department: 'Junior High School',
  contact_number: '',
  email: '',
  can_handle_classes: true,
  is_active: true,
  photo: null,
};

export const cleanInput = (raw: string, maxLength = 120): string => {
  const stripped = String(raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '');
  return sanitizeText(stripped, maxLength);
};

export const getSafeAvatarUrl = (teacher: Pick<Teacher, 'photo_url' | 'photo'>): string | null => {
  const candidate = teacher.photo_url || teacher.photo || null;
  return isSafeImageUrl(candidate) ? candidate : null;
};

export const getInitials = (name: string): string => {
  const words = cleanInput(name, 80)
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (words[0] || 'T').slice(0, 2).toUpperCase();
};
