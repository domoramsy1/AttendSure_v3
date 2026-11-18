// File: mobile/src/api/endpoints.ts

export const ENDPOINTS = {
  // Health & Connectivity
  HEALTH_DB: 'health/db/',

  // Authentication & Session
  LOGIN: 'auth/login/',
  CURRENT_USER: 'me/',
  SCHOOL_PROFILE: 'settings/school/',

  // Faculty Campus GPS & Facial Attendance
  TELEMETRY_HEARTBEAT: 'telemetry/heartbeat/',
  CAMPUS_GEOFENCE: 'geofence/',

  // Classroom USB QR & Class List
  ATTENDANCE_LOGS: 'classroom/logs/',
  CLASS_LIST: 'classroom/class_list/',
  ADVISER_MATRIX: 'classroom/adviser-matrix/',
  CLASSROOM_BATCH_SCAN: 'classroom/batch-scan/',

  // Exit Passes, Alerts & Reports
  EXIT_PASSES: 'gate-passes/',
  NOTIFICATIONS: 'notifications/',
  SYSTEM_STATUS: 'system/status/',
  EMPLOYEE_DTR: 'reports/dtr/',
};