"""Shared Manila timezone date-bound and 12-hour time formatting helpers."""

from __future__ import annotations

from datetime import date, datetime, time as dt_time, timedelta
import re

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime, parse_time

_TIME_12H_RE = re.compile(
    r"^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s*$",
    re.IGNORECASE,
)


def parse_local_date(raw_date: str | date | datetime | None) -> date | None:
    """Parse a date, datetime, or YYYY-MM-DD string into a local calendar date."""
    if raw_date is None:
        return None
    if isinstance(raw_date, datetime):
        local_dt = timezone.localtime(raw_date) if timezone.is_aware(raw_date) else raw_date
        return local_dt.date()
    if isinstance(raw_date, date):
        return raw_date
    raw_str = str(raw_date).strip()
    if not raw_str:
        return None
    parsed = parse_date(raw_str)
    if parsed is not None:
        return parsed
    parsed_dt = parse_datetime(raw_str)
    if parsed_dt is not None:
        local_dt = timezone.localtime(parsed_dt) if timezone.is_aware(parsed_dt) else parsed_dt
        return local_dt.date()
    return None


def local_day_bounds(target_date: date | datetime | None = None) -> tuple[datetime, datetime]:
    """Return timezone-aware [start, end) bounds for a full Asia/Manila calendar day.

    Using ``field__gte=start_dt, field__lt=end_dt`` instead of ``field__date=...``
    keeps database B-tree indexes active and prevents early-morning Manila events
    (12:00 AM - 7:59 AM PHT, which fall on the prior UTC day) from being missed.
    """
    if target_date is None:
        day = timezone.localdate()
    elif isinstance(target_date, datetime):
        local_dt = timezone.localtime(target_date) if timezone.is_aware(target_date) else target_date
        day = local_dt.date()
    else:
        day = target_date
    start_dt = timezone.make_aware(datetime.combine(day, dt_time.min))
    end_dt = start_dt + timedelta(days=1)
    return start_dt, end_dt


def parse_local_date_bounds(
    raw_date: str | date | datetime | None,
) -> tuple[datetime, datetime] | None:
    """Parse a raw date input and return its local_day_bounds, or None if invalid."""
    parsed = parse_local_date(raw_date)
    if parsed is None:
        return None
    return local_day_bounds(parsed)


def local_month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    """Return timezone-aware [start, end) bounds for a full local calendar month."""
    start_day = date(year, month, 1)
    next_month_day = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    start_dt = timezone.make_aware(datetime.combine(start_day, dt_time.min))
    end_dt = timezone.make_aware(datetime.combine(next_month_day, dt_time.min))
    return start_dt, end_dt


def _coerce_time_parts(value: datetime | dt_time | str | None) -> tuple[int, int, int] | None:
    """Extract (hour_24, minute, second) from a datetime, time, or time string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        local_dt = timezone.localtime(value) if timezone.is_aware(value) else value
        return local_dt.hour, local_dt.minute, local_dt.second
    if isinstance(value, dt_time):
        return value.hour, value.minute, value.second

    raw = str(value).strip()
    if not raw or raw in {"—", "-", "--", "N/A", "None"}:
        return None

    match_12h = _TIME_12H_RE.match(raw)
    if match_12h:
        hour = int(match_12h.group(1))
        minute = int(match_12h.group(2))
        second = int(match_12h.group(3) or 0)
        meridiem = match_12h.group(4).upper()
        if 1 <= hour <= 12 and 0 <= minute <= 59 and 0 <= second <= 59:
            hour_24 = 0 if (hour == 12 and meridiem == "AM") else (
                12 if (hour == 12 and meridiem == "PM") else (hour + 12 if meridiem == "PM" else hour)
            )
            return hour_24, minute, second
        return None

    parsed_t = parse_time(raw)
    if parsed_t is not None:
        return parsed_t.hour, parsed_t.minute, parsed_t.second

    parsed_dt = parse_datetime(raw)
    if parsed_dt is not None:
        local_dt = timezone.localtime(parsed_dt) if timezone.is_aware(parsed_dt) else parsed_dt
        return local_dt.hour, local_dt.minute, local_dt.second

    return None


def format_time_12h(
    value: datetime | dt_time | str | None,
    *,
    include_seconds: bool = False,
    zero_pad_hour: bool = False,
    fallback: str = "—",
) -> str:
    """Format a datetime, time, or time string into 12-hour AM/PM format (e.g. 7:30 AM)."""
    parts = _coerce_time_parts(value)
    if parts is None:
        return fallback
    hour_24, minute, second = parts
    meridiem = "AM" if hour_24 < 12 else "PM"
    hour_12 = hour_24 % 12 or 12
    hour_str = f"{hour_12:02d}" if zero_pad_hour else str(hour_12)
    if include_seconds:
        return f"{hour_str}:{minute:02d}:{second:02d} {meridiem}"
    return f"{hour_str}:{minute:02d} {meridiem}"


def format_datetime_12h(
    value: datetime | str | None,
    *,
    include_seconds: bool = False,
    date_format: str = "%b %d, %Y",
    separator: str = " ",
    zero_pad_hour: bool = False,
    fallback: str = "—",
) -> str:
    """Format a datetime or ISO string into local date + 12-hour AM/PM time."""
    if value is None:
        return fallback
    dt_obj: datetime | None
    if isinstance(value, datetime):
        dt_obj = value
    else:
        raw = str(value).strip()
        if not raw or raw in {"—", "-", "--", "N/A", "None"}:
            return fallback
        dt_obj = parse_datetime(raw)
        if dt_obj is None:
            return fallback
    local_dt = timezone.localtime(dt_obj) if timezone.is_aware(dt_obj) else dt_obj
    date_part = local_dt.strftime(date_format)
    time_part = format_time_12h(
        local_dt,
        include_seconds=include_seconds,
        zero_pad_hour=zero_pad_hour,
        fallback="",
    )
    if not time_part:
        return fallback
    return f"{date_part}{separator}{time_part}"


def format_time_range_12h(
    start_value: datetime | dt_time | str | None,
    end_value: datetime | dt_time | str | None,
    *,
    include_seconds: bool = False,
    separator: str = " - ",
    fallback: str = "—",
) -> str:
    """Format a start/end time pair into a 12-hour range (e.g. 7:30 AM - 8:30 AM)."""
    start_text = format_time_12h(start_value, include_seconds=include_seconds, fallback="")
    end_text = format_time_12h(end_value, include_seconds=include_seconds, fallback="")
    if start_text and end_text:
        return f"{start_text}{separator}{end_text}"
    return start_text or end_text or fallback
