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
  role: 'TEACHER' | 'REGISTRAR' | 'ADMIN';
  password: string;
  confirm_password: string;
}

export interface AuthResponse {
  token: string;
  user_id: number;
  username: string;
  role: string;
  staff_id: string | null;
  staff_name: string;
  is_superuser: boolean;
}