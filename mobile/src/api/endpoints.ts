// AttendSure Mobile - Canonical v1 API Endpoints (Full Parity with Web)
// File: mobile/src/api/endpoints.ts

export const ENDPOINTS = {
  // Health & Maintenance
  HEALTH_DB: 'v1/health/db/',
  FLUSH_CACHE: 'v1/cache/flush/',

  // Authentication, Staff Accounts, Users & Audit Logs
  LOGIN: 'v1/accounts/login/',
  LOGOUT: 'v1/accounts/logout/',
  CURRENT_USER: 'v1/accounts/me/',
  PROFILE: 'v1/accounts/profile/',
  CHANGE_PASSWORD: 'v1/accounts/change-password/',
  VALIDATE_FIELD: 'v1/accounts/validate-field/',
  RESET_DEVICE: 'v1/accounts/reset-device/',
  UNLOCK_ACCOUNTS: 'v1/accounts/unlock-accounts/',
  AUDIT_LOGS: 'v1/accounts/audit-logs/',
  TEACHERS: 'v1/accounts/teachers/',
  TEACHERS_DROPDOWN: 'v1/accounts/teachers/dropdown/',
  USERS: 'v1/accounts/users/',

  // School Profile, Academic Setup & Calendar
  SCHOOL_PROFILE: 'v1/school/settings/',
  PUBLIC_BRANDING: 'v1/school/public-branding/',
  SCHOOL_YEARS: 'v1/school/school-years/',
  GRADE_LEVELS: 'v1/school/grade-levels/',
  DEPARTMENTS: 'v1/school/departments/',
  SUBJECTS: 'v1/school/subjects/',
  ROOMS: 'v1/school/rooms/',
  SECTIONS: 'v1/school/sections/',
  PERIODS: 'v1/school/periods/',
  CHECK_CONFLICT: 'v1/school/check-conflict/',
  HOLIDAYS: 'v1/school/holidays/',

  // Students CRUD
  STUDENTS: 'v1/students/',
  STUDENT_METRICS: 'v1/students/metrics/',
  STUDENT_DROPDOWN: 'v1/students/dropdown/',

  // Teacher Campus Geofencing, Phone Biometric + GPS Time In / Out & Loafing
  CAMPUS_OVERVIEW: 'v1/campus/overview/',
  CAMPUS_BOUNDARY: 'v1/campus/boundary/',
  CAMPUS_PING: 'v1/campus/ping/',
  CAMPUS_CHECK_IN: 'v1/campus/check-in/',
  CAMPUS_LOAFING: 'v1/campus/loafing/',
  CAMPUS_LOAFING_INCIDENTS: 'v1/campus/loafing-incidents/',
  CAMPUS_LOAFING_RUN_AUDIT: 'v1/campus/loafing/run-audit/',
  CAMPUS_AUDIT: 'v1/campus/audit/',
  CAMPUS_ROLL_CALL: 'v1/campus/roll-call/',

  // Classroom Built-In Camera QR & Class Lists
  ATTENDANCE_SCAN: 'v1/attendance/scan/',
  ATTENDANCE_OFFLINE_SYNC: 'v1/attendance/offline-sync/',
  ATTENDANCE_LOGS: 'v1/attendance/records/',
  ATTENDANCE_CLASSES: 'v1/attendance/classes/',
  ADVISER_MATRIX: 'v1/attendance/adviser-matrix/',
  EXIT_PASSES: 'v1/attendance/exit-passes/',

  // Official Reports & Dashboard
  DASHBOARD_OVERVIEW: 'v1/reports/dashboard/',
  SYSTEM_STATUS: 'v1/reports/system-status/',
  EMPLOYEE_DTR: 'v1/reports/dtr/',
  REPORT_SF1: 'v1/reports/sf1/',
  REPORT_SF2: 'v1/reports/sf2/',
  REPORT_SF4: 'v1/reports/sf4/',
  REPORT_EXPORT: 'v1/reports/export/',
  REPORT_PRINT_PACK: 'v1/reports/print-pack/',
  REPORT_SDG_IMPACT: 'v1/reports/sdg-impact/',
  REPORT_DROPOUT_RISK: 'v1/reports/dropout-risk/',
  REPORT_DIVISION_EXPORT: 'v1/reports/division-export/',
} as const;
