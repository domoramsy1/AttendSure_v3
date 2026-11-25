// AttendSure Mobile - Shared 12-Hour Time, DateTime & Distance Formatters
// File: D:\AttendSure_V3\mobile\src\utils\formatters.ts

export interface FormatTimeOptions {
  includeSeconds?: boolean;
  fallback?: string;
}

export interface FormatDateTimeOptions extends FormatTimeOptions {
  includeYear?: boolean;
}

export interface FormatTimeRangeOptions extends FormatTimeOptions {
  separator?: string;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PURE_TIME_24H_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const PURE_TIME_12H_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i;
const SPACE_DATETIME_12H_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Pure-math 12-hour formatter that never relies on Android/iOS device 24-hour locale settings.
 */
const formatParts12h = (
  hour24: number,
  minute: number,
  second: number,
  includeSeconds: boolean
): string => {
  const safeHour = ((hour24 % 24) + 24) % 24;
  const meridiem = safeHour >= 12 ? 'PM' : 'AM';
  const hour12 = safeHour % 12 || 12;
  if (includeSeconds) {
    return `${hour12}:${pad2(minute)}:${pad2(second)} ${meridiem}`;
  }
  return `${hour12}:${pad2(minute)} ${meridiem}`;
};

const parseMobileDate = (value: Date | string | number): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const raw = String(value).trim();
  if (!raw || raw === '—' || raw === '-' || raw === '--' || raw.toLowerCase() === 'n/a') {
    return null;
  }

  const space12 = SPACE_DATETIME_12H_RE.exec(raw);
  if (space12) {
    const year = Number(space12[1]);
    const month = Number(space12[2]);
    const day = Number(space12[3]);
    const h12 = Number(space12[4]);
    const minute = Number(space12[5]);
    const second = Number(space12[6] || 0);
    const mer = space12[7].toUpperCase();
    if (h12 >= 1 && h12 <= 12 && minute <= 59 && second <= 59) {
      const h24 = mer === 'AM' ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
      const dt = new Date(year, month - 1, day, h24, minute, second);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
  }

  const normalized =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) && !raw.includes('T')
      ? raw.replace(' ', 'T')
      : raw;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Formats a Date, ISO string, or "HH:MM" / "HH:MM:SS" time string into explicit 12-hour AM/PM format
 * (e.g. "7:30 AM", "4:45:12 PM") independent of device clock settings.
 */
export function formatTime12h(
  value: Date | string | number | null | undefined,
  options: FormatTimeOptions = {}
): string {
  const { includeSeconds = false, fallback = '—' } = options;
  if (value === null || value === undefined) return fallback;

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw || raw === '—' || raw === '-' || raw === '--') return fallback;

    const match12 = PURE_TIME_12H_RE.exec(raw);
    if (match12) {
      const h12 = Number(match12[1]);
      const m = Number(match12[2]);
      const s = Number(match12[3] || 0);
      const mer = match12[4].toUpperCase();
      if (h12 >= 1 && h12 <= 12 && m <= 59 && s <= 59) {
        const h24 = mer === 'AM' ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
        return formatParts12h(h24, m, s, includeSeconds);
      }
      return fallback;
    }

    const match24 = PURE_TIME_24H_RE.exec(raw);
    if (match24) {
      const h24 = Number(match24[1]);
      const m = Number(match24[2]);
      const s = Number(match24[3] || 0);
      if (h24 >= 0 && h24 <= 23 && m <= 59 && s <= 59) {
        return formatParts12h(h24, m, s, includeSeconds);
      }
      return fallback;
    }
  }

  const parsed = parseMobileDate(value);
  if (parsed) {
    return formatParts12h(parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), includeSeconds);
  }

  // Fallback regex for unusual runtime timestamp strings
  if (typeof value === 'string') {
    const fallbackMatch = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (fallbackMatch) {
      const h = Number(fallbackMatch[1]);
      const m = Number(fallbackMatch[2]);
      const s = Number(fallbackMatch[3] || 0);
      if (h >= 0 && h <= 23 && m <= 59 && s <= 59) {
        return formatParts12h(h, m, s, includeSeconds);
      }
    }
  }

  return fallback;
}

/**
 * Formats a Date or datetime string into explicit local date + 12-hour AM/PM time
 * (e.g. "Nov 25, 2026, 7:30 AM").
 */
export function formatDateTime12h(
  value: Date | string | number | null | undefined,
  options: FormatDateTimeOptions = {}
): string {
  const { includeSeconds = false, includeYear = true, fallback = '—' } = options;
  if (value === null || value === undefined) return fallback;

  const parsed = parseMobileDate(value);
  if (!parsed) {
    if (typeof value === 'string') {
      const timeOnly = formatTime12h(value, { includeSeconds, fallback: '' });
      if (timeOnly) return timeOnly;
    }
    return fallback;
  }

  const monthName = MONTHS_SHORT[parsed.getMonth()] || 'Jan';
  const day = parsed.getDate();
  const year = parsed.getFullYear();
  const datePart = includeYear ? `${monthName} ${day}, ${year}` : `${monthName} ${day}`;
  const timePart = formatParts12h(
    parsed.getHours(),
    parsed.getMinutes(),
    parsed.getSeconds(),
    includeSeconds
  );
  return `${datePart}, ${timePart}`;
}

/**
 * Formats a start/end time pair into a 12-hour AM/PM range (e.g. "7:30 AM - 8:30 AM").
 */
export function formatTimeRange12h(
  startValue: Date | string | number | null | undefined,
  endValue: Date | string | number | null | undefined,
  options: FormatTimeRangeOptions = {}
): string {
  const { includeSeconds = false, separator = ' - ', fallback = '—' } = options;
  const startStr = formatTime12h(startValue, { includeSeconds, fallback: '' });
  const endStr = formatTime12h(endValue, { includeSeconds, fallback: '' });
  if (startStr && endStr) return `${startStr}${separator}${endStr}`;
  return startStr || endStr || fallback;
}

/**
 * Safely extracts an "HH:MM" 24-hour API value from a backend time string or 12-hour input.
 */
export function toTimeInputValue(value: string | null | undefined, fallback = ''): string {
  if (!value) return fallback;
  const raw = String(value).trim();
  const match24 = PURE_TIME_24H_RE.exec(raw);
  if (match24) {
    const h = Number(match24[1]);
    const m = Number(match24[2]);
    if (h >= 0 && h <= 23 && m <= 59) {
      return `${pad2(h)}:${pad2(m)}`;
    }
  }
  const match12 = PURE_TIME_12H_RE.exec(raw);
  if (match12) {
    const h12 = Number(match12[1]);
    const m = Number(match12[2]);
    const mer = match12[4].toUpperCase();
    if (h12 >= 1 && h12 <= 12 && m <= 59) {
      const h24 = mer === 'AM' ? (h12 === 12 ? 0 : h12) : h12 === 12 ? 12 : h12 + 12;
      return `${pad2(h24)}:${pad2(m)}`;
    }
  }
  return fallback;
}

/**
 * Safely parses Django ISO, UTC, or SQLite date strings into human-readable 12-hour time.
 */
export function formatScanTime(rawDate?: string | null): string {
  return formatTime12h(rawDate, { fallback: '--:--' });
}

/**
 * Formats distance with appropriate units (meters vs kilometers).
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || Number.isNaN(meters)) {
    return 'Determining distance...';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}
