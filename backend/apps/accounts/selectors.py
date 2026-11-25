from django.contrib.auth import get_user_model

from .models import TeacherProfile

User = get_user_model()


def resolve_teacher_for_user(user) -> TeacherProfile | None:
    """Resolves the active 1-to-1 TeacherProfile linked to a signed-in user in at most 1 SQL query."""
    if not user or not getattr(user, "is_authenticated", False):
        return None

    cached = getattr(user, "_resolved_teacher_profile", None)
    if cached is not None:
        return None if cached is False else cached

    teacher = (
        TeacherProfile.objects.select_related("user", "department", "position")
        .filter(user_id=user.id, user__is_active=True)
        .first()
    )
    setattr(user, "_resolved_teacher_profile", teacher if teacher else False)
    return teacher


def get_teacher_section_ids(teacher: TeacherProfile | None) -> set[int]:
    """Returns all active Section IDs advised or taught by a teacher."""
    if not teacher:
        return set()

    from apps.school.models import ClassPeriod, Section

    advised_ids = set(
        Section.objects.filter(adviser_id=teacher.id, is_active=True).values_list("id", flat=True)
    )
    scheduled_ids = set(
        ClassPeriod.objects.filter(teacher_id=teacher.id, is_active=True).values_list(
            "section_id", flat=True
        )
    )
    return advised_ids | scheduled_ids


def get_teacher_enrollment_ids(teacher: TeacherProfile | None) -> set[int]:
    """Returns all active Enrollment IDs belonging to sections handled by a teacher."""
    section_ids = get_teacher_section_ids(teacher)
    if not section_ids:
        return set()

    from apps.students.models import Enrollment

    return set(
        Enrollment.objects.filter(
            section_id__in=section_ids,
            status__in=["ENROLLED", "TRANSFERRED_IN"],
            student__is_active=True,
        ).values_list("id", flat=True)
    )


def get_teacher_student_ids(teacher: TeacherProfile | None) -> set[int]:
    """Returns all enrolled Student IDs belonging to sections handled by a teacher."""
    section_ids = get_teacher_section_ids(teacher)
    if not section_ids:
        return set()

    from apps.students.models import Enrollment

    return set(
        Enrollment.objects.filter(
            section_id__in=section_ids,
            status__in=["ENROLLED", "TRANSFERRED_IN"],
            student__is_active=True,
        ).values_list("student_id", flat=True)
    )
