export interface SectionItem {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  adviser_name: string;
  display_label: string;
}

export interface UserSession {
  token: string;
  username: string;
  staff_name: string;
  role: string;
}