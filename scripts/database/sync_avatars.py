r"""
AttendSure - Physical Profile Avatar Generator (Zero Mock Data)
Ensures every existing Student, TeacherProfile, and UserProfile has a valid JPEG file on disk.
Run: python database\sync_avatars.py
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.conf import settings
from PIL import Image, ImageDraw, ImageFont
from apps.accounts.models import TeacherProfile, UserProfile
from apps.students.models import Student

PALETTES = [
    ("#1e3a8a", "#3b82f6"),
    ("#065f46", "#10b981"),
    ("#0f172a", "#64748b"),
    ("#312e81", "#6366f1"),
]


def draw_avatar(target_path: Path, initials: str, seed_num: int, size: int = 256) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    bg, border = PALETTES[seed_num % len(PALETTES)]
    img = Image.new("RGB", (size, size), bg)
    draw = ImageDraw.Draw(img)
    draw.ellipse([(8, 8), (size - 8, size - 8)], fill=bg, outline=border, width=6)

    label = (initials or "AS")[:2].upper()
    font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = max(1, bbox[2] - bbox[0]), max(1, bbox[3] - bbox[1])

    glyph = Image.new("RGBA", (tw + 4, th + 4), (0, 0, 0, 0))
    ImageDraw.Draw(glyph).text((2, 2), label, fill=(255, 255, 255, 255), font=font)
    scaled = glyph.resize((int(size * 0.42), int(size * 0.42)), Image.Resampling.NEAREST)
    img.paste(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2), scaled)
    img.save(target_path, "JPEG", quality=88)


def main():
    media_root = Path(settings.MEDIA_ROOT)
    st_fixed = tc_fixed = us_fixed = 0

    for st in Student.objects.only("id", "lrn", "first_name", "last_name", "photo"):
        rel = st.photo.name if (st.photo and st.photo.name) else f"students/std_{st.lrn or st.id}.jpg"
        full = media_root / rel
        if not full.is_file():
            draw_avatar(full, f"{st.first_name[:1]}{st.last_name[:1]}", st.id)
            if not st.photo or st.photo.name != rel:
                Student.objects.filter(pk=st.id).update(photo=rel)
            st_fixed += 1

    for tc in TeacherProfile.objects.only("id", "employee_id", "first_name", "last_name", "photo"):
        rel = tc.photo.name if (tc.photo and tc.photo.name) else f"faculty/fac_{tc.employee_id or tc.id}.jpg"
        full = media_root / rel
        if not full.is_file():
            draw_avatar(full, f"{tc.first_name[:1]}{tc.last_name[:1]}", tc.id)
            if not tc.photo or tc.photo.name != rel:
                TeacherProfile.objects.filter(pk=tc.id).update(photo=rel)
            tc_fixed += 1

    for prof in UserProfile.objects.select_related("user", "teacher"):
        if prof.teacher and prof.teacher.photo:
            continue
        rel = prof.avatar.name if (prof.avatar and prof.avatar.name) else f"avatars/user_{prof.user_id}.jpg"
        full = media_root / rel
        if not full.is_file():
            u = prof.user
            initials = f"{u.first_name[:1]}{u.last_name[:1]}".strip() or u.username[:2]
            draw_avatar(full, initials, prof.user_id)
            if not prof.avatar or prof.avatar.name != rel:
                UserProfile.objects.filter(pk=prof.id).update(avatar=rel)
            us_fixed += 1

    print(f"[OK] Avatars verified -> Students: {st_fixed}, Teachers: {tc_fixed}, Users: {us_fixed} created.")


if __name__ == "__main__":
    main()
