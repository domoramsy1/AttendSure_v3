from django.contrib.auth.models import User
from django.core.cache import cache
from django.db.models import Q

from common.media import build_media_url
from common.permissions import get_user_role
from apps.school.models import ClassPeriod, Section
from apps.students.models import Enrollment
from .models import TeacherProfile, UserProfile


def resolve_teacher_for_user(user: User | None) -> TeacherProfile | None:
    if not user or not getattr(user, "is_authenticated", False):
        return None

    cache_key = f"accounts:teacher_for_user:{user.id}"
    cached_id = cache.get(cache_key)
    if cached_id is not None:
        if cached_id == 0:
            return None
        found = TeacherProfile.objects.select_related("account").filter(id=cached_id, is_active=True).first()
        if found:
            return found

    profile = UserProfile.objects.select_related("teacher").filter(user=user).first()
    if profile and getattr(profile, "teacher", None):
        teacher = profile.teacher
        if teacher and teacher.is_active:
            cache.set(cache_key, teacher.id, timeout=60)
            return teacher

    by_account = TeacherProfile.objects.select_related("account").filter(account__user=user, is_active=True).first()
    if by_account:
        cache.set(cache_key, by_account.id, timeout=60)
        return by_account

    by_username = (
        TeacherProfile.objects.select_related("account")
        .filter(Q(employee_id__iexact=user.username) | Q(email__iexact=user.email), is_active=True)
        .first()
    )
    if by_username:
        cache.set(cache_key, by_username.id, timeout=60)
        return by_username

    cache.set(cache_key, 0, timeout=30)
    return None


def get_teacher_section_ids(teacher: TeacherProfile | None) -> set[int]:
    if not teacher:
        return set()

    cache_key = f"accounts:teacher_sections:{teacher.id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return set(cached)

    advisory_ids = set(
        Section.objects.filter(adviser=teacher, is_active=True).values_list("id", flat=True)
    )
    period_sec_ids = set(
        ClassPeriod.objects.filter(teacher=teacher, is_active=True, section__is_active=True)
        .exclude(section_id__isnull=True)
        .values_list("section_id", flat=True)
    )
    combined = advisory_ids | period_sec_ids
    cache.set(cache_key, list(combined), timeout=30)
    return combined


def get_teacher_student_ids(teacher: TeacherProfile | None) -> set[int]:
    if not teacher:
        return set()

    section_ids = get_teacher_section_ids(teacher)
    if not section_ids:
        return set()

    return set(
        Enrollment.objects.filter(
            section_id__in=section_ids,
            status="ENROLLED",
            student__is_active=True,
        ).values_list("student_id", flat=True)
    )


def build_user_session_payload(user: User, request=None) -> dict:
    """Builds the authenticated user session payload from real PostgreSQL profile & teacher data."""
    profile = UserProfile.objects.select_related("teacher").filter(user=user).first()
    teacher = resolve_teacher_for_user(user)
    role = get_user_role(user)

    section_ids = get_teacher_section_ids(teacher) if teacher else set()
    period_count = (
        ClassPeriod.objects.filter(teacher=teacher, is_active=True).count()
        if teacher
        else 0
    )
    assigned_class_count = len(section_ids) + period_count

    can_teach = bool(
        (teacher and getattr(teacher, "can_teach", False))
        or assigned_class_count > 0
        or role == "FACULTY"
    )

    if teacher:
        full_name = teacher.full_name or user.get_full_name() or user.username
        employee_id = teacher.employee_id or user.username
        department = teacher.department or ""
        position = teacher.position or ""
        contact_number = teacher.contact_number or ""
        email = teacher.email or user.email or ""
        photo_raw = teacher.photo or (getattr(profile, "photo", None) if profile else None)
    else:
        full_name = user.get_full_name() or user.username
        employee_id = user.username
        department = "Parent / Guardian" if role == "PARENT" else ""
        position = "Parent / Guardian" if role == "PARENT" else ""
        contact_number = getattr(profile, "phone_number", "") if profile else ""
        email = user.email or ""
        photo_raw = getattr(profile, "photo", None) if profile else None

    photo_url = build_media_url(photo_raw, request)

    return {
        "id": user.id,
        "user_id": user.id,
        "username": user.username,
        "employee_id": employee_id,
        "first_name": user.first_name,
        "middle_name": teacher.middle_name if teacher else "",
        "last_name": user.last_name,
        "suffix": teacher.suffix if teacher else "",
        "full_name": full_name,
        "faculty_name": full_name,
        "email": email,
        "contact_number": contact_number,
        "department": department,
        "position": position,
        "role": role,
        "current_role": role,
        "can_teach": can_teach,
        "is_teaching": can_teach,
        "assigned_class_count": assigned_class_count,
        "is_profile_completed": bool(
            getattr(profile, "is_profile_completed", True) if profile else True
        ),
        "faculty_id": teacher.id if teacher else None,
        "photo": photo_url,
        "photo_url": photo_url,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
    }