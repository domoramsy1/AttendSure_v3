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

    # Parents must never resolve to a TeacherProfile
    if get_user_role(user) == "PARENT":
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

    lookup = Q()
    clean_username = str(getattr(user, "username", "") or "").strip()
    clean_email = str(getattr(user, "email", "") or "").strip()
    if clean_username:
        lookup |= Q(employee_id__iexact=clean_username)
    if clean_email:
        lookup |= Q(email__iexact=clean_email)

    if lookup:
        by_identity = (
            TeacherProfile.objects.select_related("account")
            .filter(lookup, is_active=True)
            .first()
        )
        if by_identity:
            cache.set(cache_key, by_identity.id, timeout=60)
            return by_identity

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
            status__in=["ENROLLED", "TRANSFERRED_IN"],
            student__is_active=True,
        ).values_list("student_id", flat=True)
    )


def build_user_session_payload(user: User, request=None) -> dict:
    """Delegates to accounts.services.build_user_session_payload to keep one canonical session format."""
    from .services import build_user_session_payload as _canonical_payload

    return _canonical_payload(user, request=request)