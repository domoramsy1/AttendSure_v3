"""
AttendSure V3 - Profile Photo & Avatar Synchronizer
Ensures physical profile avatar image files exist on disk without generating fake data.
File: D:\\AttendSure_V3\\scripts\\sync_profiles.py
"""

import os
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from apps.academics.models import Student, FacultyProfile, UserProfile
from PIL import Image, ImageDraw, ImageFont

User = get_user_model()


def make_avatar(target_path: str, initials: str, size: int = 256):
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    img = Image.new("RGB", (size, size), (30, 58, 138))  # Solid Navy Blue
    draw = ImageDraw.Draw(img)

    text = (initials or "U")[:2].upper()
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

    # Render centered initials
    draw.text(((size - tw) // 2, (size - th) // 2), text, fill=(255, 255, 255), font=font)
    img.save(target_path, "JPEG", quality=90)


def sync_photos():
    print("[*] Synchronizing physical photo avatars (No mock data)...")

    # 1. Students
    for s in Student.objects.all():
        initials = f"{s.first_name[:1]}{s.last_name[:1]}"
        rel_path = f"students/std_{s.lrn or s.id}.jpg"
        abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        if not s.photo or not os.path.exists(abs_path):
            make_avatar(abs_path, initials)
            s.photo = rel_path
            s.save(update_fields=['photo'])

    # 2. Faculty
    for f in FacultyProfile.objects.all():
        initials = f"{f.first_name[:1]}{f.last_name[:1]}"
        rel_path = f"faculty/faculty_{f.employee_id or f.id}.jpg"
        abs_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        if not f.photo or not os.path.exists(abs_path):
            make_avatar(abs_path, initials)
            f.photo = rel_path
            f.save(update_fields=['photo'])

    print("[✓] All missing physical profile avatars synchronized successfully.")


if __name__ == '__main__':
    sync_photos()