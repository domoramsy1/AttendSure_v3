// AttendSure Web - Shared 12-Hour Time & DateTime Formatting Utilities
// File: D:\AttendSure_V3\web\src\utils\timeFormat.ts

export interface FormatTimeOptions {
  includeSeconds?: boolean;
  fallback?: string;
}

export interface FormatDateTimeOptions extends FormatTimeOptions {
  includeDate?: boolean;
  monthFormat?: 'short' | 'long';
}

export interface FormatTimeRangeOptions extends FormatTimeOptions {
  separator?: string;
}

const PURE_TIME_24H_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const PURE_TIME_12H_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i;
const SPACE_DATETIME_12H_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i;

const pad2 = (n: number): string => String(n).padStart(2, '0');

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

const parseDateValue = (value: Date | string | number): Date | null => {
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

  const space12h = SPACE_DATETIME_12H_RE.exec(raw);
  if (space12h) {
    const year = Number(space12h[1]);
    const month = Number(space12h[2]);
    const day = Number(space12h[3]);
    const hour12 = Number(space12h[4]);
    const minute = Number(space12h[5]);
    const second = Number(space12h[6] || 0);
    const meridiem = space12h[7].toUpperCase();
    if (hour12 >= 1 && hour12 <= 12 && minute <= 59 && second <= 59) {
      const hour24 =
        meridiem === 'AM' ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
      const dt = new Date(year, month - 1, day, hour24, minute, second);
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
 * Formats a Date, ISO datetime string, or "HH:MM" / "HH:MM:SS" wall-clock time string
 * into explicit 12-hour AM/PM format (e.g. "7:30 AM" or "4:45:12 PM").
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

  const parsed = parseDateValue(value);
  if (!parsed) return fallback;

  return parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
}

/**
 * Formats a Date or datetime string into readable local date + 12-hour AM/PM time
 * (e.g. "Nov 25, 2026, 7:30 AM").
 */
export function formatDateTime12h(
  value: Date | string | number | null | undefined,
  options: FormatDateTimeOptions = {}
): string {
  const {
    includeSeconds = false,
    includeDate = true,
    monthFormat = 'short',
    fallback = '—',
  } = options;
  if (value === null || value === undefined) return fallback;

  const parsed = parseDateValue(value);
  if (!parsed) {
    // If caller passed a plain time string, still format cleanly in 12-hour AM/PM
    if (typeof value === 'string') {
      const maybeTime = formatTime12h(value, { includeSeconds, fallback: '' });
      if (maybeTime) return maybeTime;
    }
    return fallback;
  }

  if (!includeDate) {
    return formatTime12h(parsed, { includeSeconds, fallback });
  }

  const datePart = parsed.toLocaleDateString('en-US', {
    month: monthFormat,
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  });
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
 * Safely extracts an "HH:MM" string for HTML <input type="time"> controls and API payloads.
 */
export function toTimeInputValue(
  value: unknown,
  fallback = ''
): string {
  if (value === null || value === undefined || value === '') return fallback;
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
