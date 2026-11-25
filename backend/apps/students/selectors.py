# AttendSure Backend - Students Read Queries
# File: D:\AttendSure_V3\backend\apps\students\selectors.py

from django.db.models import Count, Prefetch, Q

from apps.accounts.selectors import (
    get_teacher_section_ids,
    get_teacher_student_ids,
    resolve_teacher_for_user,
)
from apps.school.selectors import format_section_label
from common.media import build_media_url
from common.permissions import is_school_leader
from common.qr_signer import sign_student_qr
from .models import ACTIVE_ENROLLMENT_STATUSES, Enrollment, Student


def get_students_for_user(*, user, search: str = "", section_id: int | None = None):
    active_enrollments = Prefetch(
        "enrollments",
        queryset=Enrollment.objects.select_related(
            "section",
            "section__grade_level",
            "section__school_year",
        )
        .annotate(
            active_periods_count=Count(
                "section__class_periods",
                filter=Q(section__class_periods__is_active=True),
                distinct=True,
            )
        )
        .order_by("-section__school_year__is_active", "-id"),
    )

    qs = (
        Student.objects.select_related("location")
        .prefetch_related(active_enrollments)
        .order_by("last_name", "first_name")
    )

    if search:
        qs = qs.filter(
            Q(lrn__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )
    if section_id:
        qs = qs.filter(
            enrollments__section_id=section_id,
            enrollments__status__in=ACTIVE_ENROLLMENT_STATUSES,
        )
    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        if not teacher or not teacher.can_handle_classes:
            return qs.none()
        qs = qs.filter(id__in=get_teacher_student_ids(teacher))
    return qs.distinct()


def get_enrollments_for_user(*, user, section_id: int | None = None):
    qs = Enrollment.objects.select_related(
        "student",
        "section",
        "section__grade_level",
        "section__school_year",
    ).order_by("-id")
    if section_id:
        qs = qs.filter(section_id=section_id)
    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        qs = qs.filter(section_id__in=get_teacher_section_ids(teacher)) if teacher else qs.none()
    return qs


def get_signed_qr_cards(*, user=None, section_id: int | None = None, request=None) -> list[dict]:
    enr_qs = Enrollment.objects.filter(
        status__in=ACTIVE_ENROLLMENT_STATUSES, student__is_active=True
    ).select_related("student", "section", "section__grade_level")
    if user and not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        enr_qs = enr_qs.filter(section_id__in=get_teacher_section_ids(teacher)) if teacher else enr_qs.none()
    if section_id:
        enr_qs = enr_qs.filter(section_id=section_id)

    cards = []
    for enr in enr_qs.order_by(
        "section__grade_level__level_number", "section__name", "student__last_name"
    )[:500]:
        st = enr.student
        sec = enr.section
        cards.append(
            {
                "id": st.id,
                "student_id": st.id,
                "enrollment_id": enr.id,
                "lrn": st.lrn,
                "full_name": st.full_name,
                "gender": st.gender,
                "sex": st.gender,
                "section_id": sec.id if sec else None,
                "section_name": sec.name if sec else "",
                "grade_level": sec.grade_level.name if (sec and sec.grade_level) else "",
                "section_label": format_section_label(
                    sec.grade_level.name if (sec and sec.grade_level) else "",
                    sec.name if sec else "",
                ),
                "photo_url": build_media_url(st.photo, request),
                "guardian_contact": st.guardian_contact,
                "qr_token": st.qr_token,
                "qr_payload": sign_student_qr(st.lrn, st.qr_token),
            }
        )
    return cards
