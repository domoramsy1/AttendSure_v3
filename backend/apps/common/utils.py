"""
AttendSure V3 - Core Shared Utilities
File: backend/apps/common/utils.py
"""

import base64
import hashlib
import hmac
import logging
import math
import os
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def safe_photo_url(photo_field, request=None) -> str | None:
    """Converts ImageField, FieldFile, or relative media paths to an absolute URL."""
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ("none", "null", "undefined"):
                return None
            if val.startswith(("data:image/", "http://", "https://")):
                return val
            clean_path = val if val.startswith("/") else f"/{val}"
            if request:
                return request.build_absolute_uri(clean_path)
            return clean_path

        if hasattr(photo_field, "url") and photo_field.url:
            url = photo_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception as exc:
        logger.warning(f"[safe_photo_url] Error: {exc}")
        return None
    return None


def resolve_logo_field(val, request=None) -> str | None:
    """Decodes base64 data to cached file or returns safe URI."""
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("none", "null", "undefined"):
        return None

    if val_str.startswith(("http://", "https://", "/media/")):
        if val_str.startswith("/media/") and request:
            return request.build_absolute_uri(val_str)
        return val_str

    if val_str.startswith("data:image/") or val_str.startswith(("/9j/", "iVBORw0KGgo")):
        try:
            if ";base64," in val_str:
                format_part, img_str = val_str.split(";base64,", 1)
                ext = "jpg" if "jpeg" in format_part or "pjpeg" in format_part else format_part.split("/")[-1].split(";")[0].lower()
            else:
                img_str, ext = val_str, "png"

            if ext not in {"png", "jpg", "jpeg", "webp"}:
                ext = "png"

            decoded_bytes = base64.b64decode(img_str, validate=True)
            if len(decoded_bytes) <= 5 * 1024 * 1024:
                file_hash = hashlib.sha256(decoded_bytes).hexdigest()[:16]
                filename = f"logo_{file_hash}.{ext}"
                target_dir = os.path.join(settings.MEDIA_ROOT, "school_logos")
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                if not os.path.exists(target_path):
                    with open(target_path, "wb") as f:
                        f.write(decoded_bytes)

                media_url = f"{settings.MEDIA_URL}school_logos/{filename}"
                return request.build_absolute_uri(media_url) if request else media_url
        except Exception as exc:
            logger.error(f"[resolve_logo_field] Base64 error: {exc}")
    return val_str


def calculate_haversine_distance(lat1, lon1, lat2, lon2) -> float:
    """Calculates great-circle distance in meters between GPS points."""
    try:
        if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
            return float("inf")

        f_lat1, f_lon1 = float(lat1), float(lon1)
        f_lat2, f_lon2 = float(lat2), float(lon2)

        if not (-90.0 <= f_lat1 <= 90.0 and -90.0 <= f_lat2 <= 90.0):
            return float("inf")
        if not (-180.0 <= f_lon1 <= 180.0 and -180.0 <= f_lon2 <= 180.0):
            return float("inf")

        earth_radius_m = 6371000.0
        phi1 = math.radians(f_lat1)
        phi2 = math.radians(f_lat2)
        delta_phi = math.radians(f_lat2 - f_lat1)
        delta_lambda = math.radians(f_lon2 - f_lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return round(earth_radius_m * c, 1)
    except (TypeError, ValueError):
        return float("inf")


def format_full_student_name(student) -> str:
    """Formats student names: Last, First M. Suffix"""
    if not student:
        return ""
    if hasattr(student, "full_name") and isinstance(student.full_name, str) and student.full_name.strip():
        return student.full_name.strip()
    last = getattr(student, "last_name", "") or ""
    first = getattr(student, "first_name", "") or ""
    mid = f" {student.middle_name[:1]}." if getattr(student, "middle_name", None) else ""
    suf = f" {student.suffix}" if getattr(student, "suffix", None) else ""
    return f"{last}, {first}{mid}{suf}".strip(" ,")


def format_deduped_section_label(grade_name: str, section_name: str) -> str:
    g = str(grade_name or "").strip()
    s = str(section_name or "").strip()
    if not g:
        return s
    if not s or g.lower().endswith(s.lower()) or f"- {s.lower()}" in g.lower():
        return g
    return f"{g} - {s}"


def get_user_role(user) -> str:
    if not user or not user.is_authenticated:
        return "ANONYMOUS"
    if getattr(user, "is_superuser", False):
        return "ADMIN"
    profile = getattr(user, "profile", None)
    if profile and getattr(profile, "role", None):
        return str(profile.role).upper()
    role = getattr(user, "role", None) or getattr(user, "system_role", None)
    if role:
        return str(role).strip().upper()
    if getattr(user, "is_staff", False):
        return "ADMIN"
    return "FACULTY"


def is_regular_faculty(role: str) -> bool:
    return str(role or "").upper() in {"FACULTY", "FACULTY", "EMPLOYEE", "INSTRUCTOR"}


def is_leadership_role(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    return get_user_role(user) in {"ADMIN", "SUPERADMIN", "PRINCIPAL", "DEPT_HEAD"}


def verify_hardware_secret(kiosk, raw_secret: str) -> bool:
    if not kiosk or not raw_secret or not getattr(kiosk, "secret_hash", None):
        return False
    clean_secret = str(raw_secret).strip()
    if hasattr(kiosk, "verify_secret") and kiosk.secret_hash.startswith(("pbkdf2_", "argon2", "bcrypt")):
        return kiosk.verify_secret(clean_secret)
    return hmac.compare_digest(
        str(kiosk.secret_hash).strip().encode("utf-8"),
        clean_secret.encode("utf-8")
    )
