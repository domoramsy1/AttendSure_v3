/**
 * AttendSure - Centralized Plain-English API Routes & Safe Input Helpers
 * File: web/src/api/routes.ts
 */

export const API_ROUTES = {
  health: {
    db: '/v1/health/db/',
    flushCache: '/v1/cache/flush/',
  },
  accounts: {
    login: '/v1/accounts/login/',
    demoStatus: '/v1/accounts/demo-status/',
    demoLogin: '/v1/accounts/demo-login/',
    refreshToken: '/v1/accounts/token/refresh/',
    me: '/v1/accounts/me/',
    profile: '/v1/accounts/profile/',
    changePassword: '/v1/accounts/change-password/',
    validateField: '/v1/accounts/validate-field/',
    resetDevice: '/v1/accounts/reset-device/',
    unlockAccounts: '/v1/accounts/unlock-accounts/',
    auditLogs: '/v1/accounts/audit-logs/',
    departments: '/v1/accounts/departments/',
    teachers: '/v1/accounts/teachers/',
    teachersDropdown: '/v1/accounts/teachers/dropdown/',
    users: '/v1/accounts/users/',
  },
  school: {
    publicBranding: '/v1/school/public-branding/',
    settings: '/v1/school/settings/',
    holidays: '/v1/school/holidays/',
    rooms: '/v1/school/rooms/',
    gradeLevels: '/v1/school/grade-levels/',
    schoolYears: '/v1/school/school-years/',
    departments: '/v1/school/departments/',
    subjects: '/v1/school/subjects/',
    sections: '/v1/school/sections/',
    periods: '/v1/school/periods/',
    checkConflict: '/v1/school/check-conflict/',
  },
  students: {
    list: '/v1/students/',
    bulkImport: '/v1/students/bulk-import/',
    metrics: '/v1/students/metrics/',
    dropdown: '/v1/students/dropdown/',
    qrCards: '/v1/students/qr-cards/',
    enrollments: '/v1/students/enrollments/',
  },
  attendance: {
    scan: '/v1/attendance/scan/',
    offlineSync: '/v1/attendance/offline-sync/',
    records: '/v1/attendance/records/',
    classes: '/v1/attendance/classes/',
    adviserMatrix: '/v1/attendance/adviser-matrix/',
    exitPasses: '/v1/attendance/exit-passes/',
    loafingAudit: '/v1/attendance/loafing-audit/',
  },
  campus: {
    overview: '/v1/campus/overview/',
    boundary: '/v1/campus/boundary/',
    checkIn: '/v1/campus/check-in/',
    ping: '/v1/campus/ping/',
    audit: '/v1/campus/audit/',
    loafing: '/v1/campus/loafing/',
    loafingIncidents: '/v1/campus/loafing-incidents/',
    loafingAudit: '/v1/campus/loafing/run-audit/',
    rollCall: '/v1/campus/roll-call/',
  },
  reports: {
    dashboard: '/v1/reports/dashboard/',
    sf1: '/v1/reports/sf1/',
    sf2: '/v1/reports/sf2/',
    sf4: '/v1/reports/sf4/',
    dtr: '/v1/reports/dtr/',
    export: '/v1/reports/export/',
    printPack: '/v1/reports/print-pack/',
    divisionExport: '/v1/reports/division-export/',
    auditLogs: '/v1/reports/audit-logs/',
    dropoutRisk: '/v1/reports/dropout-risk/',
    sdgImpact: '/v1/reports/sdg-impact/',
    systemStatus: '/v1/reports/system-status/',
  },
} as const;

export const escapeHtml = (raw: unknown): string => {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const isSafeUserFacingText = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return false;
  if (/traceback|exception|file ".*\.py"|syntaxerror|typeerror|integrityerror/i.test(trimmed)) {
    return false;
  }
  return true;
};

export const extractApiError = (
  err: unknown,
  fallback = 'Request could not be completed. Please try again.'
): string => {
  const anyErr = err as {
    response?: { data?: Record<string, unknown> | string; status?: number };
    message?: string;
  };
  const data = anyErr?.response?.data;
  if (typeof data === 'string' && isSafeUserFacingText(data)) {
    return data.trim().slice(0, 220);
  }
  if (data && typeof data === 'object') {
    for (const key of ['message', 'error', 'detail']) {
      const val = data[key];
      if (typeof val === 'string' && isSafeUserFacingText(val)) {
        return val.trim().slice(0, 220);
      }
    }
    const details =
      data.details && typeof data.details === 'object'
        ? (data.details as Record<string, unknown>)
        : data;
    for (const val of Object.values(details)) {
      if (Array.isArray(val) && typeof val[0] === 'string' && isSafeUserFacingText(val[0])) {
        return val[0].trim().slice(0, 220);
      }
      if (typeof val === 'string' && isSafeUserFacingText(val)) {
        return val.trim().slice(0, 220);
      }
    }
  }
  if (anyErr?.response?.status && anyErr.response.status >= 500) {
    return fallback;
  }
  if (
    typeof anyErr?.message === 'string' &&
    isSafeUserFacingText(anyErr.message) &&
    !anyErr.message.startsWith('Request failed with status')
  ) {
    return anyErr.message.trim().slice(0, 220);
  }
  return fallback;
};
