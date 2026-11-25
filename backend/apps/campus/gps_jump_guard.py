from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import math
import re
from typing import Any, Optional

from django.core.cache import cache
from django.utils import timezone

EARTH_RADIUS_METERS = 6_371_000.0
MAX_NORMAL_SPEED_METERS_PER_SECOND = 45.0  # 162 km/h
MIN_SUSPICIOUS_JUMP_METERS = 200.0
MAX_COMPARE_WINDOW_SECONDS = 300.0  # Check jumps within the last 5 minutes
CONFIRM_MATCH_DISTANCE_METERS = 100.0
CONFIRM_WINDOW_SECONDS = 120
SAFE_KEY_PATTERN = re.compile(r"[^A-Za-z0-9_-]")


@dataclass(frozen=True)
class JumpCheckResult:
    should_save: bool
    status: str
    message: str
    moved_meters: float
    speed_meters_per_second: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "should_save": self.should_save,
            "ignored": not self.should_save,
            "status": self.status,
            "message": self.message,
            "moved_meters": self.moved_meters,
            "speed_meters_per_second": self.speed_meters_per_second,
        }


def measure_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Measure surface distance in meters between two GPS points."""
    rad_lat1 = math.radians(lat1)
    rad_lat2 = math.radians(lat2)
    diff_lat = math.radians(lat2 - lat1)
    diff_lon = math.radians(lon2 - lon1)

    sin_lat = math.sin(diff_lat / 2.0)
    sin_lon = math.sin(diff_lon / 2.0)

    raw_part = (
        sin_lat * sin_lat
        + math.cos(rad_lat1) * math.cos(rad_lat2) * sin_lon * sin_lon
    )
    safe_part = min(1.0, max(0.0, raw_part))
    return 2.0 * EARTH_RADIUS_METERS * math.atan2(
        math.sqrt(safe_part),
        math.sqrt(1.0 - safe_part),
    )


def _to_safe_float(value: Any) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return None
    else:
        return None

    if not math.isfinite(number):
        return None
    return number


def _are_valid_coordinates(latitude: Optional[float], longitude: Optional[float]) -> bool:
    if latitude is None or longitude is None:
        return False
    if latitude < -90.0 or latitude > 90.0:
        return False
    if longitude < -180.0 or longitude > 180.0:
        return False
    if latitude == 0.0 and longitude == 0.0:
        return False
    return True


def _make_aware_datetime(value: datetime) -> datetime:
    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())
    return value


def _build_waiting_cache_key(teacher_id: Any, device_id: Optional[str]) -> str:
    clean_teacher = SAFE_KEY_PATTERN.sub("", str(teacher_id))[:32] or "0"
    clean_device = SAFE_KEY_PATTERN.sub("", str(device_id or "phone"))[:64] or "phone"
    return f"attendsure:gps_jump_wait:{clean_teacher}:{clean_device}"


def _read_waiting_jump(cache_key: str) -> Optional[dict[str, float]]:
    try:
        stored = cache.get(cache_key)
    except Exception:
        return None

    if not isinstance(stored, dict):
        return None

    lat = _to_safe_float(stored.get("latitude"))
    lon = _to_safe_float(stored.get("longitude"))
    ts = _to_safe_float(stored.get("timestamp"))
    if not _are_valid_coordinates(lat, lon) or ts is None:
        return None

    return {"latitude": lat, "longitude": lon, "timestamp": ts}


def _save_waiting_jump(cache_key: str, latitude: float, longitude: float, now: datetime) -> None:
    payload = {
        "latitude": latitude,
        "longitude": longitude,
        "timestamp": now.timestamp(),
    }
    try:
        cache.set(cache_key, payload, timeout=CONFIRM_WINDOW_SECONDS)
    except Exception:
        return


def _clear_waiting_jump(cache_key: str) -> None:
    try:
        cache.delete(cache_key)
    except Exception:
        return


def check_teacher_gps_jump(
    *,
    teacher_id: Any,
    device_id: Optional[str],
    new_latitude: Any,
    new_longitude: Any,
    last_latitude: Any = None,
    last_longitude: Any = None,
    last_recorded_at: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> JumpCheckResult:
    """Check whether a new teacher GPS ping is a sudden impossible jump."""
    current_time = _make_aware_datetime(now or timezone.now())
    lat = _to_safe_float(new_latitude)
    lon = _to_safe_float(new_longitude)

    if not _are_valid_coordinates(lat, lon):
        return JumpCheckResult(
            should_save=False,
            status="INVALID_LOCATION",
            message="GPS coordinates are not valid.",
            moved_meters=0.0,
            speed_meters_per_second=0.0,
        )

    cache_key = _build_waiting_cache_key(teacher_id, device_id)
    prev_lat = _to_safe_float(last_latitude)
    prev_lon = _to_safe_float(last_longitude)

    if not _are_valid_coordinates(prev_lat, prev_lon) or last_recorded_at is None:
        _clear_waiting_jump(cache_key)
        return JumpCheckResult(
            should_save=True,
            status="OK",
            message="No recent location to compare against.",
            moved_meters=0.0,
            speed_meters_per_second=0.0,
        )

    previous_time = _make_aware_datetime(last_recorded_at)
    elapsed_seconds = (current_time - previous_time).total_seconds()

    if elapsed_seconds <= 0.0:
        return JumpCheckResult(
            should_save=False,
            status="OLD_READING",
            message="Ignored an older GPS ping.",
            moved_meters=0.0,
            speed_meters_per_second=0.0,
        )

    moved_meters = measure_distance_meters(prev_lat, prev_lon, lat, lon)

    if elapsed_seconds > MAX_COMPARE_WINDOW_SECONDS:
        _clear_waiting_jump(cache_key)
        return JumpCheckResult(
            should_save=True,
            status="OK",
            message="Time gap is long enough for normal travel.",
            moved_meters=round(moved_meters, 1),
            speed_meters_per_second=round(moved_meters / elapsed_seconds, 1),
        )

    speed_mps = moved_meters / max(elapsed_seconds, 1.0)
    looks_like_impossible_jump = (
        moved_meters >= MIN_SUSPICIOUS_JUMP_METERS
        and speed_mps > MAX_NORMAL_SPEED_METERS_PER_SECOND
    )

    if looks_like_impossible_jump:
        waiting_jump = _read_waiting_jump(cache_key)
        if waiting_jump is not None:
            waiting_age = current_time.timestamp() - waiting_jump["timestamp"]
            gap_from_waiting = measure_distance_meters(
                waiting_jump["latitude"],
                waiting_jump["longitude"],
                lat,
                lon,
            )

            if (
                0.0 <= waiting_age <= CONFIRM_WINDOW_SECONDS
                and gap_from_waiting <= CONFIRM_MATCH_DISTANCE_METERS
            ):
                _clear_waiting_jump(cache_key)
                return JumpCheckResult(
                    should_save=True,
                    status="CONFIRMED_AFTER_JUMP",
                    message="Second matching GPS ping confirmed the new location.",
                    moved_meters=round(moved_meters, 1),
                    speed_meters_per_second=round(speed_mps, 1),
                )

        _save_waiting_jump(cache_key, lat, lon, current_time)
        return JumpCheckResult(
            should_save=False,
            status="GPS_JUMP_IGNORED",
            message="Ignored a sudden indoor GPS jump. Waiting for one more reading to confirm.",
            moved_meters=round(moved_meters, 1),
            speed_meters_per_second=round(speed_mps, 1),
        )

    _clear_waiting_jump(cache_key)
    return JumpCheckResult(
        should_save=True,
        status="OK",
        message="GPS ping is normal.",
        moved_meters=round(moved_meters, 1),
        speed_meters_per_second=round(speed_mps, 1),
    )


def check_ping_against_last_record(
    *,
    teacher_id: Any,
    device_id: Optional[str],
    new_latitude: Any,
    new_longitude: Any,
    last_ping: Any,
    now: Optional[datetime] = None,
) -> JumpCheckResult:
    """Helper that reads fields from the teacher's latest saved GPS ping row."""
    if last_ping is None:
        return check_teacher_gps_jump(
            teacher_id=teacher_id,
            device_id=device_id,
            new_latitude=new_latitude,
            new_longitude=new_longitude,
            now=now,
        )

    last_time = getattr(last_ping, "recorded_at", None) or getattr(last_ping, "created_at", None)
    return check_teacher_gps_jump(
        teacher_id=teacher_id,
        device_id=device_id,
        new_latitude=new_latitude,
        new_longitude=new_longitude,
        last_latitude=getattr(last_ping, "latitude", None),
        last_longitude=getattr(last_ping, "longitude", None),
        last_recorded_at=last_time,
        now=now,
    )