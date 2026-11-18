"""
AttendSure - Shared Database Resolvers, GPS Boundary Check & Security Helpers
File: backend/apps/api/views/common.py
"""

import base64
import hashlib
import logging
import math
import os
from django.conf import settings
from django.db.models import Q
from rest_framework import permissions

logger = logging.getLogger(__name__)


def safe_photo_url(photo_field, request=None):
    """Returns a valid storage URL for student, faculty, or school logo photos."""
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('data:image/', 'http://', 'https://', '/media/')):
                return request.build_absolute_uri(val) if (request and val.startswith('/media/')) else val
            clean_path = val if val.startswith('/') else f'/{val}'
            return request.build_absolute_uri(clean_path) if request else clean_path

        if hasattr(photo_field, 'url'):
            try:
                url = photo_field.url
                if url:
                    return request.build_absolute_uri(url) if request else url
            except Exception:
                pass

        if hasattr(photo_field, 'name') and photo_field.name:
            val_name = str(photo_field.name).strip()
            if not val_name:
                return None
            if val_name.startswith(('data:image/', 'http://', 'https://', '/media/')):
                return val_name
            media_url = f"{settings.MEDIA_URL}{val_name}" if not val_name.startswith('/') else val_name
            return request.build_absolute_uri(media_url) if request else media_url
    except Exception as exc:
        logger.warning('Failed to resolve photo URL: %s', exc)
    return None


def resolve_logo_field(val, request=None):
    """Resolves school logos to a valid full URL or saves Base64 data to disk."""
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('none', 'null', 'undefined'):
        return None

    if val_str.startswith('upload_') and '/' not in val_str:
        candidate = os.path.join(settings.MEDIA_ROOT, val_str)
        if not os.path.exists(candidate):
            return None

    if val_str.startswith(('http://', 'https://')):
        return val_str

    if val_str.startswith(('/media/', 'media/', 'school_logos/')):
        if val_str.startswith('school_logos/'):
            clean_rel = f'{settings.MEDIA_URL}{val_str}'
        else:
            clean_rel = val_str
        if not clean_rel.startswith('/'):
            clean_rel = f'/{clean_rel}'
        return request.build_absolute_uri(clean_rel) if request else clean_rel

    if val_str.startswith('data:image/') or val_str.startswith(('/9j/', 'iVBORw0KGgo')):
        try:
            if ';base64,' in val_str:
                format_part, img_str = val_str.split(';base64,', 1)
                ext = 'jpg' if ('jpeg' in format_part or 'pjpeg' in format_part) else format_part.split('/')[-1].split(';')[0].lower()
            else:
                img_str, ext = val_str, 'png'

            if ext not in {'png', 'jpg', 'jpeg', 'webp'}:
                ext = 'png'

            decoded_bytes = base64.b64decode(img_str, validate=True)
            if len(decoded_bytes) <= 5 * 1024 * 1024:
                file_hash = hashlib.sha256(decoded_bytes).hexdigest()[:16]
                filename = f'logo_{file_hash}.{ext}'
                target_dir = os.path.join(settings.MEDIA_ROOT, 'school_logos')
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                if not os.path.exists(target_path):
                    with open(target_path, 'wb') as f:
                        f.write(decoded_bytes)

                media_url = f'{settings.MEDIA_URL}school_logos/{filename}'
                if not media_url.startswith('/'):
                    media_url = f'/{media_url}'
                return request.build_absolute_uri(media_url) if request else media_url
        except Exception as exc:
            logger.error('Failed to decode logo to disk: %s', exc)
    return None


def format_full_student_name(student) -> str:
    """Formats student names directly from database columns."""
    if not student:
        return ''
    if hasattr(student, 'full_name') and isinstance(student.full_name, str) and student.full_name.strip():
        return student.full_name.strip()
    last = getattr(student, 'last_name', '') or ''
    first = getattr(student, 'first_name', '') or ''
    mid = f' {student.middle_name[:1]}.' if getattr(student, 'middle_name', None) else ''
    suf = f' {student.suffix}' if getattr(student, 'suffix', None) else ''
    return f'{last}, {first}{mid}{suf}'.strip(' ,')


def format_deduped_section_label(grade_name, section_name) -> str:
    g = str(grade_name or '').strip()
    s = str(section_name or '').strip()
    if not g:
        return s
    if not s or g.lower().endswith(s.lower()) or f'- {s.lower()}' in g.lower():
        return g
    return f'{g} - {s}'


def get_user_role(user) -> str:
    """Returns the role assigned in UserProfile."""
    if not user or not user.is_authenticated:
        return ''
    if getattr(user, 'is_superuser', False):
        return 'ADMIN'
    profile = getattr(user, 'profile', None)
    if profile and getattr(profile, 'role', None):
        return str(profile.role).upper()
    if getattr(user, 'is_staff', False):
        return 'ADMIN'
    return 'FACULTY'


def is_regular_faculty(role: str) -> bool:
    return str(role or '').upper() in {'FACULTY', 'EMPLOYEE'}


def is_leadership_role(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return get_user_role(user) in {'ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD'}


def resolve_faculty_for_user(user):
    """Connects a Django User to their linked FacultyProfile row cleanly."""
    if not user or not user.is_authenticated:
        return None

    from apps.academics.models import FacultyProfile, UserProfile

    user_prof = getattr(user, 'profile', None) or UserProfile.objects.filter(user=user).select_related('faculty').first()
    if user_prof and user_prof.faculty_id and user_prof.faculty:
        return user_prof.faculty

    faculty = FacultyProfile.objects.filter(account__user=user, is_active=True).first()
    if faculty:
        return faculty

    if getattr(user, 'username', None):
        faculty = FacultyProfile.objects.filter(
            Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username),
            is_active=True,
        ).first()
        if faculty:
            return faculty

    if getattr(user, 'email', None):
        faculty = FacultyProfile.objects.filter(email__iexact=user.email, is_active=True).first()
        if faculty:
            return faculty

    return None


def _get_active_campus_center():
    """Returns (latitude, longitude, radius_meters) from active campus settings."""
    from apps.academics.models import GeofenceSetting, SchoolProfile

    geofence = GeofenceSetting.objects.filter(is_active=True).first()
    if geofence and geofence.latitude is not None and geofence.longitude is not None:
        return float(geofence.latitude), float(geofence.longitude), int(geofence.radius_meters or 150)

    school = SchoolProfile.objects.first()
    if school and school.latitude is not None and school.longitude is not None:
        return float(school.latitude), float(school.longitude), int(school.geofence_radius_meters or 150)

    return None, None, 150


def calculate_distance_meters(lat1, lon1, lat2=None, lon2=None) -> float:
    """Calculates physical distance in meters using the Haversine formula."""
    try:
        u_lat = float(lat1)
        u_lon = float(lon1)
        if lat2 is None or lon2 is None:
            c_lat, c_lon, _ = _get_active_campus_center()
            if c_lat is None or c_lon is None:
                return 0.0
        else:
            c_lat = float(lat2)
            c_lon = float(lon2)
    except (TypeError, ValueError):
        return float('inf')

    earth_radius = 6371000.0
    phi1 = math.radians(c_lat)
    phi2 = math.radians(u_lat)
    d_phi = math.radians(u_lat - c_lat)
    d_lambda = math.radians(u_lon - c_lon)

    a = (math.sin(d_phi / 2.0) ** 2) + math.cos(phi1) * math.cos(phi2) * (math.sin(d_lambda / 2.0) ** 2)
    return earth_radius * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)))


def verify_campus_gps(latitude, longitude, accuracy_meters=None, is_mock_location=False) -> dict:
    """
    Verifies whether a faculty mobile phone is inside the campus boundary,
    including anti-spoofing and an indoor GPS drift buffer.
    """
    if is_mock_location:
        return {
            'is_valid': False,
            'is_inside': False,
            'distance_meters': None,
            'allowed_radius': 0,
            'reason': 'Fake or mock GPS location detected. Disable mock location apps to proceed.',
        }

    try:
        u_lat = float(latitude)
        u_lon = float(longitude)
    except (TypeError, ValueError):
        return {
            'is_valid': False,
            'is_inside': False,
            'distance_meters': None,
            'allowed_radius': 0,
            'reason': 'Invalid or missing GPS coordinates.',
        }

    if not (-90.0 <= u_lat <= 90.0) or not (-180.0 <= u_lon <= 180.0) or (u_lat == 0.0 and u_lon == 0.0):
        return {
            'is_valid': False,
            'is_inside': False,
            'distance_meters': None,
            'allowed_radius': 0,
            'reason': 'GPS coordinates are outside valid earth bounds.',
        }

    c_lat, c_lon, radius = _get_active_campus_center()
    if c_lat is None or c_lon is None:
        return {
            'is_valid': True,
            'is_inside': True,
            'distance_meters': 0.0,
            'allowed_radius': radius,
            'reason': 'Campus boundary not yet configured; check allowed.',
        }

    distance = calculate_distance_meters(u_lat, u_lon, c_lat, c_lon)

    try:
        drift_buffer = min(max(float(accuracy_meters or 0), 0.0), 35.0)
    except (TypeError, ValueError):
        drift_buffer = 0.0

    is_inside = distance <= (radius + drift_buffer)
    return {
        'is_valid': True,
        'is_inside': is_inside,
        'distance_meters': round(distance, 1),
        'allowed_radius': radius,
        'reason': 'Within campus boundary.' if is_inside else f'Outside campus boundary ({round(distance)}m away; limit is {radius}m).',
    }


def is_within_campus_geofence(latitude, longitude, accuracy_meters=None, is_mock_location=False) -> bool:
    """Boolean shortcut for campus GPS verification."""
    return verify_campus_gps(latitude, longitude, accuracy_meters, is_mock_location)['is_inside']


def get_client_ip(request) -> str:
    """Safely extracts the client IP from reverse proxy headers or local network."""
    if not request:
        return '127.0.0.1'
    cf_ip = request.META.get('HTTP_CF_CONNECTING_IP')
    if cf_ip:
        return cf_ip.strip()
    xff = request.META.get('HTTP_X_FORWARDED_FOR')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


class IsAcademicManagerPermission(permissions.BasePermission):
    """
    Allows authenticated users to view academic records, while restricting
    create/edit/delete changes to school leadership and registrars.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_leadership_role(request.user) or get_user_role(request.user) == 'REGISTRAR'


class IsSystemAdminRole(permissions.BasePermission):
    """Restricts access strictly to System Administrators and Superusers."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return bool(
            request.user.is_superuser
            or get_user_role(request.user) in {'ADMIN', 'SUPERADMIN'}
        )


IsLeadershipOrReadOnly = IsAcademicManagerPermission
IsAdminOrReadOnly = IsAcademicManagerPermission
IsLeadershipUser = IsSystemAdminRole
IsSchoolAdmin = IsSystemAdminRole
IsPrincipalOrAdmin = IsAcademicManagerPermission


class IsFacultyOrLeadership(permissions.BasePermission):
    """Allows access to verified faculty, advisers, and school leadership."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if is_leadership_role(request.user):
            return True
        return resolve_faculty_for_user(request.user) is not None


IsFacultyUser = IsFacultyOrLeadership


def get_active_academic_year():
    """Returns the currently active AcademicYear or the latest record."""
    from apps.academics.models import AcademicYear
    return AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()


def get_faculty_section_ids(faculty) -> set:
    if not faculty:
        return set()
    from apps.academics.models import Schedule, Section
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
            student__is_active=True,
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