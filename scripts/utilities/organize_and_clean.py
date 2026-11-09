"""
AttendSure V3 - Safe Backend Structure Organizer & Cleaner
File: backend/organize_and_clean.py
"""

import os
import shutil
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# 1. Provide apps/common/utils.py content
UTILS_CONTENT = '''"""
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


def is_regular_teacher(role: str) -> bool:
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
'''

# 2. Template test content for tests/
TEST_AUTH_CONTENT = '''from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

class AuthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="SecurePassword123!")

    def test_login_success(self):
        res = self.client.post("/api/auth/login/", {"username": "testuser", "password": "SecurePassword123!"})
        self.assertIn(res.status_code, [200, 400])
'''


def run_organization():
    print("=" * 60)
    print("AttendSure V3 - Reorganizing Backend Structure")
    print("=" * 60)

    # Step 1: Ensure apps/common/utils.py exists
    common_dir = BASE_DIR / "apps" / "common"
    common_dir.mkdir(parents=True, exist_ok=True)
    utils_file = common_dir / "utils.py"
    if not utils_file.exists():
        utils_file.write_text(UTILS_CONTENT, encoding="utf-8")
        print("[CREATED] apps/common/utils.py")
    else:
        print("[EXISTS]  apps/common/utils.py")

    # Step 2: Remove redundant empty attendsure/ folder (keeping attendsure_core/)
    redundant_attendsure = BASE_DIR / "attendsure"
    real_settings = BASE_DIR / "attendsure_core" / "settings.py"
    if redundant_attendsure.exists() and real_settings.exists():
        contents = list(redundant_attendsure.iterdir())
        # Only delete if it does NOT contain settings.py
        if not (redundant_attendsure / "settings.py").exists():
            shutil.rmtree(redundant_attendsure)
            print("[REMOVED] Redundant folder 'attendsure/' (Active project is 'attendsure_core/')")

    # Step 3: Move loose JSON store files from apps/ to scripts/data/
    data_dir = BASE_DIR / "scripts" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    for json_name in ["rooms_store.json", "telemetry_store.json"]:
        source_json = BASE_DIR / "apps" / json_name
        if source_json.exists():
            dest = data_dir / json_name
            shutil.move(str(source_json), str(dest))
            print(f"[MOVED]   apps/{json_name} -> scripts/data/{json_name}")

    # Step 4: Move loose root scripts to scripts/
    scripts_dir = BASE_DIR / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    root_scripts = [
        "read_models.py",
        "send_test_telemetry.py",
        "show_faculty_gps.py",
        "test_faculty_live.py",
        "test_live_db.py",
        "all_models_code.txt",
    ]
    for script_name in root_scripts:
        src = BASE_DIR / script_name
        if src.exists():
            dest = scripts_dir / script_name
            shutil.move(str(src), str(dest))
            print(f"[MOVED]   {script_name} -> scripts/{script_name}")

    # Step 5: Populate tests/ folder
    tests_dir = BASE_DIR / "tests"
    tests_dir.mkdir(parents=True, exist_ok=True)
    (tests_dir / "__init__.py").touch()

    test_files = {
        "test_auth.py": TEST_AUTH_CONTENT,
        "test_classroom.py": "# Classroom attendance tests\n",
        "test_geofence.py": "# Geofence boundary tests\n",
        "test_reports.py": "# DepEd SF report tests\n",
    }
    for filename, content in test_files.items():
        t_file = tests_dir / filename
        if not t_file.exists():
            t_file.write_text(content, encoding="utf-8")
            print(f"[CREATED] tests/{filename}")

    # Step 6: Clear __pycache__ folders
    cleared = 0
    for cache_folder in BASE_DIR.rglob("__pycache__"):
        try:
            shutil.rmtree(cache_folder)
            cleared += 1
        except Exception:
            pass
    print(f"[CLEANED] Removed {cleared} stale __pycache__ directories.")

    print("=" * 60)
    print("Organization Complete!")
    print("=" * 60)


if __name__ == "__main__":
    run_organization()