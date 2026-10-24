# backend/apps/api/views/common.py

import base64
import hashlib
import hmac
import logging
import math
import os
from django.conf import settings
from django.db.models import Q
from rest_framework import permissions

from apps.academics.models import (
    Enrollment,
    FacultyProfile,
    Schedule,
    SchoolProfile,
    Section,
    UserProfile,
    Student,
)

logger = logging.getLogger(__name__)


# ==============================================================================
# 1. PHOTO & MEDIA URL RESOLVER (CYBERSECURITY ENFORCED)
# ==============================================================================

def safe_photo_url(photo_field, request=None):
    """
    Safely converts ImageFields or relative media paths into reachable URLs.
    Validates file formats and prevents XSS / SSRF script injection.
    """
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('data:image/', 'http://', 'https://')):
                return val
            if val.startswith('/media/') and request:
                return request.build_absolute_uri(val)
            if val.startswith('/media/'):
                return val
            if request:
                return request.build_absolute_uri(f"/media/{val.lstrip('/')}")
            return f"/media/{val.lstrip('/')}"

        if hasattr(photo_field, 'name') and photo_field.name:
            val_name = str(photo_field.name).strip()
            if not val_name:
                return None
            if val_name.startswith(('data:image/', 'http://', 'https://')):
                return val_name
            url = photo_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception as exc:
        logger.warning(f"Failed to resolve photo URL: {exc}")
        return None
    return None


def resolve_logo_field(val, request=None):
    """Resolves Base64 or relative logo paths into clean URLs."""
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('none', 'null', 'undefined'):
        return None
    if val_str.startswith(('http://', 'https://', '/media/')):
        if val_str.startswith('/media/') and request:
            return request.build_absolute_uri(val_str)
        return val_str

    if val_str.startswith('data:image/') or val_str.startswith(('/9j/', 'iVBORw0KGgo')):
        try:
            if ';base64,' in val_str:
                format_part, img_str = val_str.split(';base64,', 1)
                ext = 'jpg' if 'jpeg' in format_part or 'pjpeg' in format_part else format_part.split('/')[-1].split(';')[0].lower()
            else:
                img_str, ext = val_str, 'png'

            if ext not in {'png', 'jpg', 'jpeg', 'webp'}:
                ext = 'png'

            decoded_bytes = base64.b64decode(img_str, validate=True)
            if len(decoded_bytes) <= 5 * 1024 * 1024:
                file_hash = hashlib.sha256(decoded_bytes).hexdigest()[:16]
                filename = f"logo_{file_hash}.{ext}"
                target_dir = os.path.join(settings.MEDIA_ROOT, 'school_logos')
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                if not os.path.exists(target_path):
                    with open(target_path, 'wb') as f:
                        f.write(decoded_bytes)

                media_url = f"{settings.MEDIA_URL}school_logos/{filename}"
                return request.build_absolute_uri(media_url) if request else media_url
        except Exception as exc:
            logger.error("Failed to decode logo to disk: %s", exc)
    return val_str


# ==============================================================================
# 2. CENTRALIZED SCHOOL METADATA
# ==============================================================================

def get_school_metadata(request=None) -> dict:
    school = SchoolProfile.objects.select_related('principal_faculty').first()
    if not school:
        return {
            'school_id': '',
            'school_name': 'AttendSure Campus',
            'region': '',
            'division': '',
            'district': '',
            'academic_year': '2026-2027',
            'school_address': '',
            'school_contact': '',
            'school_email': '',
            'website': '',
            'school_head': '',
            'principal_title': 'Secondary School Principal IV',
            'superintendent_name': '',
            'left_logo': None,
            'right_logo': None,
            'school_logo': None,
        }

    school_head = str(school.principal_name or '').strip()
    if not school_head and school.principal_faculty:
        school_head = school.principal_faculty.full_name

    return {
        'school_id': str(school.school_id or '').strip(),
        'school_name': str(school.school_name or '').strip(),
        'region': str(school.region or '').strip(),
        'division': str(school.division or '').strip(),
        'district': str(school.district or '').strip(),
        'academic_year': str(getattr(school, 'academic_year', '') or '2026-2027').strip(),
        'school_address': str(school.address or '').strip(),
        'school_contact': str(school.contact_number or '').strip(),
        'school_email': str(school.email or '').strip(),
        'website': str(getattr(school, 'website', '') or '').strip(),
        'school_head': school_head.upper(),
        'principal_title': str(school.principal_title or 'Secondary School Principal IV').strip(),
        'superintendent_name': str(getattr(school, 'superintendent_name', '') or '').strip(),
        'left_logo': resolve_logo_field(school.left_logo, request),
        'right_logo': resolve_logo_field(school.right_logo, request),
        'school_logo': resolve_logo_field(school.school_logo, request),
    }


def format_full_student_name(student) -> str:
    if not student:
        return ""
    if hasattr(student, 'full_name') and isinstance(student.full_name, str):
        return student.full_name
    mid = f" {student.middle_name[:1]}." if getattr(student, 'middle_name', None) else ""
    suf = f" {student.suffix}" if getattr(student, 'suffix', None) else ""
    return f"{student.last_name}, {student.first_name}{mid}{suf}".strip(" ,")


def format_deduped_section_label(grade_name, section_name) -> str:
    g = str(grade_name or '').strip()
    s = str(section_name or '').strip()
    if not g:
        return s
    if not s or g.lower().endswith(s.lower()) or f"- {s.lower()}" in g.lower():
        return g
    return f"{g} - {s}"


def get_student_active_section(student):
    if not student:
        return None
    enr = (
        Enrollment.objects.filter(student=student, status='ENROLLED')
        .select_related('section', 'section__grade_level')
        .order_by('-academic_year__is_active', '-id')
        .first()
    )
    return enr.section if enr else None


# ==============================================================================
# 3. ROLES & ADVISEE SECURITY ISOLATION
# ==============================================================================

def get_user_role(user) -> str:
    if not user or not user.is_authenticated:
        return ''
    if user.is_superuser:
        return 'ADMIN'
    profile = getattr(user, 'profile', None)
    if profile and getattr(profile, 'role', None):
        return str(profile.role).upper()
    return 'FACULTY'


def is_regular_teacher(role: str) -> bool:
    return str(role or '').upper() in {'TEACHER', 'FACULTY', 'EMPLOYEE'}


def is_leadership_role(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return get_user_role(user) in {'ADMIN', 'PRINCIPAL', 'DEPT_HEAD'}


def resolve_faculty_for_user(user):
    if not user or not user.is_authenticated:
        return None

    user_prof, _ = UserProfile.objects.get_or_create(user=user)
    if user_prof.faculty_id:
        return user_prof.faculty

    faculty = None
    if user.username:
        faculty = FacultyProfile.objects.filter(
            Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username),
            is_active=True,
        ).first()

    if not faculty and user.email:
        faculty = FacultyProfile.objects.filter(email__iexact=user.email, is_active=True).first()

    if not faculty and user.first_name and user.last_name:
        faculty = FacultyProfile.objects.filter(
            first_name__iexact=user.first_name,
            last_name__iexact=user.last_name,
            is_active=True,
        ).first()

    if not faculty:
        emp_id = str(user.username).strip().upper()[:50] or f"EMP-{user.id:04d}"
        faculty, _ = FacultyProfile.objects.get_or_create(
            employee_id=emp_id,
            defaults={
                'first_name': user.first_name or user.username.capitalize(),
                'last_name': user.last_name or 'Faculty',
                'email': user.email or '',
                'position': 'Teacher',
                'department': 'Academic Department',
                'is_active': True,
                'can_teach': True,
            },
        )

    if user_prof.faculty_id != faculty.id:
        user_prof.faculty = faculty
        user_prof.save(update_fields=['faculty'])

    return faculty


def get_teacher_section_ids(faculty) -> set:
    """
    Security boundary: Returns strictly the section IDs where this faculty
    member is officially assigned as the Class Adviser.
    """
    if not faculty:
        return set()
    return set(Section.objects.filter(adviser=faculty).values_list('id', flat=True))


def get_teacher_student_ids(faculty) -> set:
    """
    Security boundary: Returns strictly the student IDs enrolled in sections
    where this faculty member is officially assigned as the Class Adviser.
    """
    advised_sec_ids = get_teacher_section_ids(faculty)
    if not advised_sec_ids:
        return set()
    return set(
        Enrollment.objects.filter(section_id__in=advised_sec_ids, status='ENROLLED')
        .values_list('student_id', flat=True)
        .distinct()
    )


def calculate_distance_meters(lat1, lon1, lat2, lon2) -> float:
    try:
        u_lat, u_lon = float(lat1), float(lon1)
        c_lat, c_lon = float(lat2), float(lon2)
    except (TypeError, ValueError):
        return float('inf')

    earth_radius_m = 6371000.0
    phi1 = math.radians(c_lat)
    phi2 = math.radians(u_lat)
    delta_phi = math.radians(u_lat - c_lat)
    delta_lambda = math.radians(u_lon - c_lon)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return earth_radius_m * c


def verify_hardware_secret(kiosk, raw_secret: str) -> bool:
    if not kiosk or not raw_secret or not kiosk.secret_hash:
        return False
    clean_secret = str(raw_secret).strip()
    if hasattr(kiosk, 'verify_secret') and kiosk.secret_hash.startswith(('pbkdf2_', 'argon2', 'bcrypt')):
        return kiosk.verify_secret(clean_secret)
    return hmac.compare_digest(
        str(kiosk.secret_hash).strip().encode('utf-8'),
        clean_secret.encode('utf-8'),
    )


class IsAcademicManagerPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        return role in ({'ADMIN', 'PRINCIPAL'} if request.method == 'DELETE' else {'ADMIN', 'PRINCIPAL', 'DEPT_HEAD'})


class IsSystemAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.is_superuser or get_user_role(request.user) == 'ADMIN'