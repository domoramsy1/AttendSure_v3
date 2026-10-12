export const ENDPOINTS = {
  LOGIN: '/api/auth/login/',
  CURRENT_USER: '/api/me/',
  SCHOOL_PROFILE: '/api/settings/school/',
  TELEMETRY_HEARTBEAT: '/api/telemetry/heartbeat/',
  CAMPUS_GEOFENCE: '/api/geofence/',
  
  // Gate Turnstiles (Fixed Hardware Kiosks)
  GATE_LOGS: '/api/gate/logs/',
  GATE_SCAN: '/api/gate/scan/',

  // Classroom Mobile Scans (Teacher Authenticated)
  CLASSROOM_SCAN: '/api/classroom/scan/',
  SMS_OUTBOX: '/api/sms-outbox/',
  FACULTY_DTR: '/api/dtr/',
};