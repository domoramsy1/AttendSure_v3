from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import FacultyProfile, UserProfile

User = get_user_model()


def resolve_faculty_for_user(user) -> FacultyProfile | None:
    """Resolves the active FacultyProfile linked to a signed-in user in at most 1 SQL query."""
    if not user or not getattr(user, "is_authenticated", False):
        return None

    cached_id = getattr(user, "_resolved_faculty_id", None)
    if cached_id is not None:
        if cached_id == 0:
            return None
        found = (
            FacultyProfile.objects.select_related("account", "department_ref", "position_ref")
            .filter(id=cached_id, is_active=True)
            .first()
        )
        if found:
            return found

    profile = (
        UserProfile.objects.select_related(
            "faculty",
            "faculty__department_ref",
            "faculty__position_ref",
        )
        .filter(user=user)
        .first()
    )

    # Parents must never resolve to a FacultyProfile
    if profile and profile.role == "PARENT":
        setattr(user, "_resolved_faculty_id", 0)
        return None

    if profile and profile.faculty_id and profile.faculty and profile.faculty.is_active:
        setattr(user, "_resolved_faculty_id", profile.faculty.id)
        return profile.faculty

    by_account = (
        FacultyProfile.objects.select_related("account", "department_ref", "position_ref")
        .filter(account__user=user, is_active=True)
        .first()
    )
    if by_account:
        setattr(user, "_resolved_faculty_id", by_account.id)
        return by_account

    clean_email = str(getattr(user, "email", "") or "").strip()
    clean_username = str(getattr(user, "username", "") or "").strip()
    lookup = Q(employee_id__iexact=clean_username)
    if clean_email:
        lookup = lookup | Q(email__iexact=clean_email)

    matched = (
        FacultyProfile.objects.select_related("account", "department_ref", "position_ref")
        .filter(lookup, is_active=True)
        .first()
    )
    setattr(user, "_resolved_faculty_id", matched.id if matched else 0)
    return matched


def get_faculty_section_ids(faculty: FacultyProfile | None) -> set[int]:
    """Returns all active Section IDs advised or scheduled under a faculty member."""
    if not faculty:
        return set()

    from apps.school.models import ClassPeriod, Section

    advised_ids = set(
        Section.objects.filter(adviser_id=faculty.id, is_active=True).values_list("id", flat=True)
    )
    scheduled_ids = set(
        ClassPeriod.objects.filter(faculty_id=faculty.id, is_active=True).values_list(
            "section_id", flat=True
        )
    )
    return advised_ids | scheduled_ids


def get_faculty_student_ids(faculty: FacultyProfile | None) -> set[int]:
    """Returns all enrolled Student IDs belonging to sections handled by a faculty member."""
    section_ids = get_faculty_section_ids(faculty)
    if not section_ids:
        return set()

    from apps.students.models import Enrollment

    return set(
        Enrollment.objects.filter(
            section_id__in=section_ids,
            status="ENROLLED",
            student__is_active=True,
        ).values_list("student_id", flat=True)
    )