// D:\AttendSure_V3\mobile\src\api\endpoints.ts

export const ENDPOINTS = {
  // Authentication & Session
  LOGIN: 'auth/login/',
  CURRENT_USER: 'me/',
  SCHOOL_PROFILE: 'settings/school/',

  // Telemetry & Presence
  TELEMETRY_HEARTBEAT: 'telemetry/heartbeat/',
  CAMPUS_GEOFENCE: 'geofence/',

  // Campus Gate Scanners
  GATE_LOGS: 'gate/logs/',
  GATE_SCAN: 'gate/scan/',

  // Classroom Mobile Scans
  CLASS_LIST: 'classroom/class_list/',
  CLASSROOM_BATCH_SCAN: 'classroom/batch-scan/',
  SMS_OUTBOX: 'sms-outbox/',
  EMPLOYEE_DTR: 'dtr/',
};