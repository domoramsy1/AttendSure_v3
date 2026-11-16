// D:\AttendSure_V3\mobile\src\api\endpoints.ts

export const ENDPOINTS = {
  // Authentication & Session
  LOGIN: 'auth/login/',
  CURRENT_USER: 'me/',
  SCHOOL_PROFILE: 'settings/school/',

  // Telemetry & Presence
  TELEMETRY_HEARTBEAT: 'telemetry/heartbeat/',
  CAMPUS_GEOFENCE: 'geofence/',

  // Campus USB QR scanner
  GATE_LOGS: 'gate/logs/',
  GATE_SCAN: 'gate/scan/',

  // Classroom Mobile Scans
  CLASS_LIST: 'classroom/class_list/',
  CLASSROOM_BATCH_SCAN: 'classroom/batch-scan/',
  NOTIFICATIONS: 'notifications/',
  EMPLOYEE_DTR: 'dtr/',
};