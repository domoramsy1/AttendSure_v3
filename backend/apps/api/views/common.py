"""
AttendSure - Real Database Common Resolvers & Security Helpers
File: backend/apps/api/views/common.py
"""

import base64
import hashlib
import hmac
import logging
import math
import os
from django.conf import settings
from django.db.models import Q
from rest_framework import permissions

logger = logging.getLogger(__name__)


def safe_photo_url(photo_field, request=None):
    """Returns the real storage URL for an uploaded image file."""
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('data:image/', 'http://', 'https://')):
                return val
            clean_path = val if val.startswith('/') else f'/{val}'
            if request:
                return request.build_absolute_uri(clean_path)
            return clean_path

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
    """Loads and returns real institution logos from disk storage."""
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


def format_full_student_name(student) -> str:
    """Formats student names directly from database columns."""
    if not student:
        return ""
    if hasattr(student, 'full_name') and isinstance(student.full_name, str) and student.full_name.strip():
        return student.full_name.strip()
    last = getattr(student, 'last_name', '') or ''
    first = getattr(student, 'first_name', '') or ''
    mid = f" {student.middle_name[:1]}." if getattr(student, 'middle_name', None) else ""
    suf = f" {student.suffix}" if getattr(student, 'suffix', None) else ""
    return f"{last}, {first}{mid}{suf}".strip(" ,")


def format_deduped_section_label(grade_name, section_name) -> str:
    g = str(grade_name or '').strip()
    s = str(section_name or '').strip()
    if not g:
        return s
    if not s or g.lower().endswith(s.lower()) or f"- {s.lower()}" in g.lower():
        return g
    return f"{g} - {s}"


def get_user_role(user) -> str:
    """Extracts the actual role assigned in the UserProfile database table."""
    if not user or not user.is_authenticated:
        return ''
    if getattr(user, 'is_superuser', False):
        return 'ADMIN'
    profile = getattr(user, 'profile', None)
    if profile and getattr(profile, 'role', None):
        return str(profile.role).upper()
    role = getattr(user, 'role', None) or getattr(user, 'system_role', None)
    if role:
        return str(role).strip().upper()
    if getattr(user, 'is_staff', False):
        return 'ADMIN'
    return 'FACULTY'


def is_regular_faculty(role: str) -> bool:
    return str(role or '').upper() in {'FACULTY', 'FACULTY', 'EMPLOYEE'}


def is_leadership_role(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return get_user_role(user) in {'ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD'}


def resolve_faculty_for_user(user):
    """
    Connects a User to their authentic FacultyProfile database row.
    Uses account__user to query through UserProfile correctly.
    """
    if not user or not user.is_authenticated:
        return None

    from apps.academics.models import FacultyProfile, UserProfile

    # 1. Direct one-to-one link via UserProfile.faculty
    try:
        user_prof = getattr(user, 'profile', None) or UserProfile.objects.filter(user=user).first()
        if user_prof and user_prof.faculty_id and user_prof.faculty:
            return user_prof.faculty
    except Exception:
        pass

    # 2. Correct reverse relationship query
    faculty = FacultyProfile.objects.filter(account__user=user, is_active=True).first()
    if faculty:
        return faculty

    # 3. Exact employee ID lookup
    if getattr(user, 'username', None):
        faculty = FacultyProfile.objects.filter(
            Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username),
            is_active=True,
        ).first()
        if faculty:
            return faculty

    # 4. Exact institutional email match
    if getattr(user, 'email', None):
        faculty = FacultyProfile.objects.filter(email__iexact=user.email, is_active=True).first()
        if faculty:
            return faculty

    return None


def get_faculty_section_ids(faculty) -> set:
    if not faculty:
        return set()
    from apps.academics.models import Section, Schedule
    advised_ids = set(Section.objects.filter(adviser=faculty).values_list('id', flat=True))
    teaching_ids = set(Schedule.objects.filter(faculty=faculty).values_list('section_id', flat=True))
    return advised_ids | teaching_ids


def get_faculty_student_ids(faculty) -> set:
    section_ids = get_faculty_section_ids(faculty)
    if not section_ids:
        return set()
    from apps.academics.models import Enrollment
    return set(
        Enrollment.objects.filter(
            section_id__in=section_ids,
            student__is_active=True
        )
        .exclude(status__in=['DROPPED', 'TRANSFERRED_OUT', 'INACTIVE'])
        .values_list('student_id', flat=True)
        .distinct()
    )


def get_student_active_section(student):
    if not student:
        return None
    from apps.academics.models import Enrollment
    enr = (
        Enrollment.objects.filter(student=student)
        .exclude(status__in=['DROPPED', 'TRANSFERRED_OUT', 'INACTIVE'])
        .select_related('section', 'section__grade_level')
        .order_by('-id')
        .first()
    )
    return enr.section if enr else None


def get_school_metadata(request=None) -> dict:
    from apps.academics.models import SchoolProfile
    school = SchoolProfile.objects.select_related('principal_faculty').first()

    if not school:
        return {
            'school_id': '',
            'school_name': '',
            'region': '',
            'division': '',
            'district': '',
            'academic_year': '',
            'school_address': '',
            'school_contact': '',
            'school_email': '',
            'website': '',
            'school_head': '',
            'principal_title': '',
            'superintendent_name': '',
            'left_logo': None,
            'right_logo': None,
            'school_logo': None,
            'is_configured': False,
        }

    school_head = str(school.principal_name or '').strip()
    if not school_head and school.principal_faculty:
        school_head = getattr(school.principal_faculty, 'full_name', str(school.principal_faculty))

    return {
        'school_id': str(school.school_id or '').strip(),
        'school_name': str(school.school_name or '').strip(),
        'region': str(school.region or '').strip(),
        'division': str(school.division or '').strip(),
        'district': str(school.district or '').strip(),
        'academic_year': str(getattr(school, 'academic_year', '') or '').strip(),
        'school_address': str(school.address or '').strip(),
        'school_contact': str(school.contact_number or '').strip(),
        'school_email': str(school.email or '').strip(),
        'website': str(getattr(school, 'website', '') or '').strip(),
        'school_head': school_head.upper() if school_head else '',
        'principal_title': str(school.principal_title or '').strip(),
        'superintendent_name': str(getattr(school, 'superintendent_name', '') or '').strip(),
        'left_logo': resolve_logo_field(school.left_logo, request),
        'right_logo': resolve_logo_field(school.right_logo, request),
        'school_logo': resolve_logo_field(school.school_logo, request),
        'is_configured': bool(school.school_name and school.school_id),
    }


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
        return getattr(request.user, 'is_superuser', False) or get_user_role(request.user) == 'ADMIN'
# Backward-compatibility aliases for legacy imports
is_regular_teacher = is_regular_faculty
get_teacher_section_ids = get_faculty_section_ids
get_teacher_student_ids = get_faculty_student_ids
