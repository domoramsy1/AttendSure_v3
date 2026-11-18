from datetime import datetime
from django.db.models import Q
from common.permissions import is_school_leader
from .models import AuditLog, TeacherProfile, UserProfile


def resolve_teacher_for_user(user) -> TeacherProfile | None:
    if not user or not user.is_authenticated:
        return None
    profile = getattr(user, "profile", None) or UserProfile.objects.filter(user=user).select_related("teacher").first()
    if profile and profile.teacher_id:
        return profile.teacher
    if user.username:
        teacher = TeacherProfile.objects.filter(employee_id__iexact=user.username, is_active=True).first()
        if teacher:
            return teacher
    if user.email:
        return TeacherProfile.objects.filter(email__iexact=user.email, is_active=True).first()
    return None


def get_teacher_section_ids(teacher: TeacherProfile | None) -> set[int]:
    if not teacher:
        return set()
    from apps.school.models import ClassPeriod, Section

    advised = set(Section.objects.filter(adviser=teacher).values_list("id", flat=True))
    taught = set(ClassPeriod.objects.filter(teacher=teacher).values_list("section_id", flat=True))
    return advised | taught


def get_teacher_student_ids(teacher: TeacherProfile | None) -> set[int]:
    section_ids = get_teacher_section_ids(teacher)
    if not section_ids:
        return set()
    from apps.students.models import Enrollment

    return set(
        Enrollment.objects.filter(section_id__in=section_ids, student__is_active=True)
        .exclude(status__in=["DROPPED", "TRANSFERRED_OUT"])
        .values_list("student_id", flat=True)
    )


def get_audit_logs_queryset(*, user, search: str = "", action: str = "ALL", date_str: str = ""):
    qs = (
        AuditLog.objects.select_related("performed_by")
        .defer("old_data", "new_data")
        .order_by("-created_at")
    )
    if not is_school_leader(user):
        qs = qs.filter(performed_by=user)
    if action and action.upper() != "ALL":
        qs = qs.filter(action__iexact=action)
    if date_str:
        try:
            qs = qs.filter(created_at__date=datetime.strptime(date_str, "%Y-%m-%d").date())
        except ValueError:
            pass
    if search:
        qs = qs.filter(
            Q(action__icontains=search)
            | Q(table_name__icontains=search)
            | Q(client_ip__icontains=search)
            | Q(performed_by__username__icontains=search)
            | Q(performed_by__first_name__icontains=search)
            | Q(performed_by__last_name__icontains=search)
        )
    return qs[:250]