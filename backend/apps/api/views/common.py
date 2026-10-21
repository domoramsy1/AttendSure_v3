import base64
import hashlib
import os
import logging
from django.conf import settings
from django.db.models import Q
from rest_framework import permissions
from apps.academics.models import UserProfile, FacultyProfile, Section, Schedule, Enrollment

logger = logging.getLogger(__name__)

def safe_photo_url(photo_field, request=None):
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('http://', 'https://', 'data:image/')):
                return val
            if val.startswith('/media/') and request:
                return request.build_absolute_uri(val)
            return val
        if hasattr(photo_field, 'name') and photo_field.name:
            val_name = str(photo_field.name).strip()
            if val_name.startswith(('data:image/', 'http://', 'https://')):
                return val_name
            url = photo_field.url
            return request.build_absolute_uri(url) if request else url
    except Exception:
        return None
    return None

def resolve_logo_field(val, request=None):
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
                format_part, img_str = val_str.split(';base64,')
                ext = 'jpg' if 'jpeg' in format_part or 'pjpeg' in format_part else format_part.split('/')[-1].split(';')[0].lower()
            else:
                img_str, ext = val_str, 'png'

            decoded_bytes = base64.b64decode(img_str, validate=True)
            if len(decoded_bytes) <= 10 * 1024 * 1024:
                file_hash = hashlib.md5(decoded_bytes).hexdigest()[:12]
                filename = f"logo_{file_hash}.{ext}"
                target_dir = os.path.join(settings.MEDIA_ROOT, 'school_logos')
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                if not os.path.exists(target_path):
                    with open(target_path, 'wb') as f:
                        f.write(decoded_bytes)

                media_url = f"{settings.MEDIA_URL}school_logos/{filename}"
                return request.build_absolute_uri(media_url) if request else media_url
        except Exception as e:
            logger.error("Failed to decode logo to disk: %s", e)
    return val_str

def format_full_student_name(st):
    if not st:
        return ""
    if hasattr(st, 'full_name') and isinstance(st.full_name, str):
        return st.full_name
    mid = f" {st.middle_name}" if getattr(st, 'middle_name', None) else ""
    suf = f" {st.suffix}" if getattr(st, 'suffix', None) else ""
    return f"{st.last_name}, {st.first_name}{mid}{suf}".strip(" ,")

def format_deduped_section_label(grade_name, section_name):
    g = str(grade_name or '').strip()
    s = str(section_name or '').strip()
    if not g: return s
    if not s or g.lower().endswith(s.lower()) or f"- {s.lower()}" in g.lower():
        return g
    return f"{g} - {s}"

def get_user_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'ADMIN'
    profile = getattr(user, 'profile', None) or getattr(user, 'userprofile', None)
    if profile and hasattr(profile, 'role') and profile.role:
        return str(profile.role).upper()
    return 'FACULTY'

def is_regular_teacher(role):
    return str(role or '').upper() in ['TEACHER', 'FACULTY']

def is_leadership_role(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return get_user_role(user) in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']

def resolve_faculty_for_user(user):
    if not user or not user.is_authenticated:
        return None
    user_prof, _ = UserProfile.objects.get_or_create(user=user)
    faculty = getattr(user_prof, 'faculty', None) or getattr(user, 'facultyprofile', None)
    if not faculty and user.email:
        faculty = FacultyProfile.objects.filter(email__iexact=user.email, is_active=True).first()
    if not faculty and user.first_name and user.last_name:
        faculty = FacultyProfile.objects.filter(first_name__iexact=user.first_name, last_name__iexact=user.last_name, is_active=True).first()
    if not faculty:
        faculty = FacultyProfile.objects.filter(Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username), is_active=True).first()
    if not faculty:
        faculty, _ = FacultyProfile.objects.get_or_create(
            employee_id=str(user.username).strip().upper(),
            defaults={'first_name': user.first_name or user.username.capitalize(), 'last_name': user.last_name or 'Faculty', 'email': user.email or '', 'position': 'Teacher', 'department': 'Academic Department', 'is_active': True, 'can_teach': True}
        )
    return faculty

def get_teacher_section_ids(faculty) -> set:
    if not faculty:
        return set()
    advised = set(Section.objects.filter(adviser=faculty).values_list('id', flat=True))
    scheduled = set(Schedule.objects.filter(faculty=faculty).exclude(section__isnull=True).values_list('section_id', flat=True))
    return advised.union(scheduled)

def get_teacher_student_ids(faculty) -> set:
    sec_ids = get_teacher_section_ids(faculty)
    if not sec_ids:
        return set()
    return set(Enrollment.objects.filter(section_id__in=sec_ids, status__in=['ENROLLED', 'ACTIVE']).values_list('student_id', flat=True).distinct())

class IsSystemAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) == 'ADMIN')

class IsAcademicManagerPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        return role in (['ADMIN', 'PRINCIPAL'] if request.method == 'DELETE' else ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD'])

class IsAdviserOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if is_leadership_role(request.user):
            return True
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return False
        if getattr(obj, 'adviser_id', None) == faculty.id:
            return True
        return Schedule.objects.filter(section=obj, faculty=faculty).exists()
