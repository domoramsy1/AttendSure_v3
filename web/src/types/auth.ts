// AttendSure Web - Auth
// File: D:\AttendSure_V3\web\src\types\auth.ts

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  role: 'TEACHER' | 'DEPT_HEAD' | 'PRINCIPAL' | 'ADMIN';
  password: string;
  confirm_password: string;
}

export interface AuthResponse {
  token: string;
  access?: string;
  refresh?: string;
  user_id: number;
  username: string;
  role: string;
  teacher_id: number | string | null;
  teacher_name: string;
  is_superuser: boolean;
}
