/**
 * AttendSure - Centralized Plain-English API Routes & Security Helpers
 * File: web/src/api/routes.ts
 */

export const API_ROUTES = {
  health: {
    db: '/v1/health/db/',
    flushCache: '/v1/cache/flush/',
  },
  accounts: {
    login: '/v1/accounts/login/',
    refreshToken: '/v1/accounts/token/refresh/',
    me: '/v1/accounts/me/',
    validateField: '/v1/accounts/validate-field/',
    pushToken: '/v1/accounts/push-token/',
    resetDevice: '/v1/accounts/reset-device/',
    auditLogs: '/v1/accounts/audit-logs/',
    teachers: '/v1/accounts/teachers/',
    teachersDropdown: '/v1/accounts/teachers/dropdown/',
    users: '/v1/accounts/users/',
  },
  school: {
    settings: '/v1/school/settings/',
    holidays: '/v1/school/holidays/',
    rooms: '/v1/school/rooms/',
    gradeLevels: '/v1/school/grade-levels/',
    schoolYears: '/v1/school/school-years/',
    subjects: '/v1/school/subjects/',
    sections: '/v1/school/sections/',
    periods: '/v1/school/periods/',
  },
  students: {
    list: '/v1/students/',
    metrics: '/v1/students/metrics/',
    dropdown: '/v1/students/dropdown/',
    qrCards: '/v1/students/qr-cards/',
    enrollments: '/v1/students/enrollments/',
    parentPortal: '/v1/students/parent-portal/',
  },
  attendance: {
    scan: '/v1/attendance/scan/',
    offlineSync: '/v1/attendance/offline-sync/',
    records: '/v1/attendance/records/',
    classes: '/v1/attendance/classes/',
    adviserMatrix: '/v1/attendance/adviser-matrix/',
    exitPasses: '/v1/attendance/exit-passes/',
  },
  campus: {
    boundary: '/v1/campus/boundary/',
    checkIn: '/v1/campus/check-in/',
    audit: '/v1/campus/audit/',
    anomalies: '/v1/campus/anomalies/',
    rollCall: '/v1/campus/roll-call/',
  },
  messaging: {
    notifications: '/v1/messaging/notifications/',
    markRead: '/v1/messaging/notifications/mark-read/',
    threads: '/v1/messaging/threads/',
    messages: '/v1/messaging/messages/',
  },
  reports: {
    dashboard: '/v1/reports/dashboard/',
    sf1: '/v1/reports/sf1/',
    sf2: '/v1/reports/sf2/',
    sf4: '/v1/reports/sf4/',
    dtr: '/v1/reports/dtr/',
    dropoutRisk: '/v1/reports/dropout-risk/',
    sdgImpact: '/v1/reports/sdg-impact/',
    systemStatus: '/v1/reports/system-status/',
  },
} as const;

/** Escapes untrusted strings before inserting into Leaflet/DOM HTML templates (XSS defense). */
export const escapeHtml = (raw: unknown): string => {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/** Extracts readable plain-English error messages from DRF / custom exception payloads. */
export const extractApiError = (err: unknown, fallback = 'Request could not be completed.'): string => {
  const anyErr = err as {
    response?: { data?: Record<string, unknown> | string };
    message?: string;
  };
  const data = anyErr?.response?.data;
  if (typeof data === 'string' && data.trim()) return data.slice(0, 220);
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.error === 'string' && data.error) return data.error;
    if (typeof data.detail === 'string' && data.detail) return data.detail;
    if (data.details && typeof data.details === 'object') {
      const firstVal = Object.values(data.details as Record<string, unknown>)[0];
      if (Array.isArray(firstVal) && firstVal.length > 0) return String(firstVal[0]);
      if (typeof firstVal === 'string') return firstVal;
    }
  }
  return anyErr?.message || fallback;
};