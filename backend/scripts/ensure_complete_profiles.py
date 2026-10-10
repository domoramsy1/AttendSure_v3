import os
import sys
import random
from pathlib import Path

# Setup Django runtime environment
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from django.conf import settings
from django.contrib.auth.models import User
from apps.academics.models import Student, FacultyProfile, UserProfile
from PIL import Image, ImageDraw, ImageFont

# Distinct, modern color palettes for generated profile avatars
AVATAR_PALETTES = [
    ("#1e3a8a", "#3b82f6"),  # Blue
    ("#065f46", "#10b981"),  # Emerald
    ("#701a75", "#d946ef"),  # Fuchsia
    ("#831843", "#f43f5e"),  # Rose
    ("#0f172a", "#64748b"),  # Slate
    ("#7c2d12", "#f97316"),  # Amber
    ("#312e81", "#6366f1"),  # Indigo
    ("#14532d", "#22c55e"),  # Forest Green
]


def create_avatar_file(target_path: str, initials: str, size: int = 256):
    """Draws a clean, centered monogram avatar image and saves it to disk."""
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    
    bg_color, accent_color = random.choice(AVATAR_PALETTES)
    
    img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer circle base
    draw.ellipse([(8, 8), (size - 8, size - 8)], fill=bg_color, outline=accent_color, width=4)
    
    initials_text = (initials or "U")[:2].upper()
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None
    
    bbox = draw.textbbox((0, 0), initials_text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    # Scale text via bitmap upscaling for clear typography
    txt_img = Image.new("RGBA", (text_w + 4, text_h + 4), (0, 0, 0, 0))
    txt_draw = ImageDraw.Draw(txt_img)
    txt_draw.text((2, 2), initials_text, fill=(255, 255, 255, 255), font=font)
    
    scaled_w = int(size * 0.44)
    scaled_h = int((text_h / max(1, text_w)) * scaled_w) if text_w > 0 else int(size * 0.44)
    txt_img = txt_img.resize((scaled_w, max(scaled_h, int(size * 0.36))), Image.Resampling.NEAREST)
    
    paste_x = (size - scaled_w) // 2
    paste_y = (size - txt_img.height) // 2
    img.paste(txt_img, (paste_x, paste_y), txt_img)
    
    img.convert("RGB").save(target_path, "JPEG", quality=92)


def sync_students():
    """Ensures every student has an existing photo file and complete details."""
    student_fields = {f.name for f in Student._meta.get_fields()}
    students = Student.objects.all()
    count_updated = 0
    
    for s in students:
        changed = False
        initials = f"{s.first_name[:1]}{s.last_name[:1]}"
        photo_rel_path = f"students/photos/std_{s.lrn or s.id}.jpg"
        abs_path = os.path.join(settings.MEDIA_ROOT, photo_rel_path)
        
        # 1. Guarantee physical photo exists on disk
        if not s.photo or not os.path.exists(abs_path):
            create_avatar_file(abs_path, initials)
            s.photo = photo_rel_path
            changed = True
            
        # 2. Fill required address and contact fields safely
        if 'parent_contact' in student_fields and not s.parent_contact:
            s.parent_contact = "09" + "".join([str(random.randint(0, 9)) for _ in range(9)])
            changed = True
            
        if 'house_street_sitio' in student_fields and not getattr(s, 'house_street_sitio', None):
            s.house_street_sitio = "Zone 4, Lapasan"
            changed = True
        elif 'house_street' in student_fields and not getattr(s, 'house_street', None):
            s.house_street = "Zone 4, Lapasan"
            changed = True
            
        if 'barangay' in student_fields and not getattr(s, 'barangay', None):
            s.barangay = "Lapasan"
            changed = True
            
        if 'municipality_city' in student_fields and not getattr(s, 'municipality_city', None):
            s.municipality_city = "Cagayan de Oro City"
            changed = True
            
        if 'province' in student_fields and not getattr(s, 'province', None):
            s.province = "Misamis Oriental"
            changed = True
            
        if 'mother_tongue' in student_fields and not getattr(s, 'mother_tongue', None):
            s.mother_tongue = "Bisaya"
            changed = True
            
        if 'religion' in student_fields and not getattr(s, 'religion', None):
            s.religion = "Roman Catholic"
            changed = True

        if changed:
            s.save()
            count_updated += 1
            
    print(f"[✓] Students: Processed {students.count()} profiles ({count_updated} records/photos synchronized).")


def sync_faculty():
    """Ensures every faculty profile has an avatar and complete records."""
    faculty_fields = {f.name for f in FacultyProfile._meta.get_fields()}
    faculties = FacultyProfile.objects.all()
    count_updated = 0
    
    for f in faculties:
        changed = False
        initials = f"{f.first_name[:1]}{f.last_name[:1]}"
        photo_rel_path = f"faculty/photos/faculty_{f.employee_id or f.id}.jpg"
        abs_path = os.path.join(settings.MEDIA_ROOT, photo_rel_path)
        
        # 1. Guarantee physical photo exists on disk
        if not f.photo or not os.path.exists(abs_path):
            create_avatar_file(abs_path, initials)
            f.photo = photo_rel_path
            changed = True
            
        # 2. Fill baseline required employment details
        if 'position' in faculty_fields and not f.position:
            f.position = "Teacher III"
            changed = True
            
        if 'department' in faculty_fields and not f.department:
            f.department = "Junior High School"
            changed = True
            
        if 'contact_number' in faculty_fields and not f.contact_number:
            f.contact_number = "09" + "".join([str(random.randint(0, 9)) for _ in range(9)])
            changed = True
            
        if 'email' in faculty_fields and not f.email and f.first_name and f.last_name:
            clean_first = f.first_name.lower().replace(" ", "")
            clean_last = f.last_name.lower().replace(" ", "")
            f.email = f"{clean_first}.{clean_last}@attendsure.edu.ph"
            changed = True
            
        if changed:
            f.save()
            count_updated += 1
            
    print(f"[✓] Faculty: Processed {faculties.count()} profiles ({count_updated} records/photos synchronized).")


def sync_users():
    """Ensures all system user accounts have profiles and photos."""
    user_profile_fields = {f.name for f in UserProfile._meta.get_fields()}
    users = User.objects.all()
    count_updated = 0
    
    for u in users:
        profile, _ = UserProfile.objects.get_or_create(user=u)
        changed = False
        
        name_first = u.first_name or u.username
        name_last = u.last_name or ""
        initials = f"{name_first[:1]}{name_last[:1]}" if name_last else name_first[:2]
        
        # Check if user is linked to a faculty member with an existing photo
        linked_faculty = getattr(profile, 'faculty', None) or getattr(u, 'facultyprofile', None)
        if linked_faculty and linked_faculty.photo and hasattr(linked_faculty.photo, 'path') and os.path.exists(linked_faculty.photo.path):
            user_photo_path = str(linked_faculty.photo)
        else:
            photo_rel_path = f"users/photos/user_{u.id}.jpg"
            abs_path = os.path.join(settings.MEDIA_ROOT, photo_rel_path)
            if not os.path.exists(abs_path):
                create_avatar_file(abs_path, initials)
            user_photo_path = photo_rel_path
            
        if 'photo' in user_profile_fields and (not profile.photo or not os.path.exists(os.path.join(settings.MEDIA_ROOT, str(profile.photo)))):
            profile.photo = user_photo_path
            profile.save(update_fields=['photo'])
            changed = True
            
        if 'role' in user_profile_fields and not profile.role:
            profile.role = 'ADMIN' if u.is_superuser else 'TEACHER'
            profile.save(update_fields=['role'])
            changed = True
            
        if changed:
            count_updated += 1
            
    print(f"[✓] Users: Processed {users.count()} user accounts ({count_updated} profiles synchronized).")


if __name__ == "__main__":
    print("=" * 60)
    print("AttendSure: Synchronizing Complete Profiles & Profile Photos")
    print("=" * 60)
    sync_students()
    sync_faculty()
    sync_users()
    print("=" * 60)
    print("All profile pictures generated and stored successfully.")
    print("=" * 60)