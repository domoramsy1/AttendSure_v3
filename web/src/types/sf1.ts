export interface SF1Learner {
  lrn: string;
  name: string;
  sex: 'Male' | 'Female';
  birthdate: string;
  age: number | string;
  mother_tongue: string;
  ethnic_group: string;
  religion: string;
  address: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  guardian_rel: string;
  parent_contact: string;
  remarks: string;
}

export interface SF1ReportResponse {
  school_id: string;
  school_name: string;
  academic_year: string;
  section_name: string;
  grade_level: string;
  region?: string;
  division?: string;
  district?: string;
  adviser_name?: string;
  principal_name?: string;
  total_male: number;
  total_female: number;
  total_combined: number;
  males: SF1Learner[];
  females: SF1Learner[];
}