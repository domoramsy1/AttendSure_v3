# backend/apps/students/selectors.py
from django.db.models import Prefetch, Q
from django.utils import timezone

from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from common.qr_signer import sign_student_qr
from apps.accounts.selectors import get_faculty_student_ids, resolve_faculty_for_user
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.messaging.models import Notification
from apps.school.selectors import format_section_label
from .models import Enrollment, Student


def get_students_for_user(*, user, search: str = "", section_id: int | None = None):
    role = get_user_role(user)
    active_enrollments = Prefetch(
        "enrollments",
        queryset=Enrollment.objects.select_related(
            "section",
            "section__grade_level",
            "section__school_year",
            "section__room",
        ).order_by("-section__school_year__is_active", "-id"),
    )

    qs = (
        Student.objects.select_related("location", "parent_user")
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
        qs = qs.filter(enrollments__section_id=section_id, enrollments__status="ENROLLED")
    if role == "PARENT":
        return qs.filter(parent_user=user, is_active=True).distinct()
    if not is_school_leader(user):
        faculty_member = resolve_faculty_for_user(user)
        qs = qs.filter(id__in=get_faculty_student_ids(faculty_member)) if faculty_member else qs.none()
    return qs.distinct()


def get_signed_qr_cards(*, section_id: int | None = None, request=None) -> list[dict]:
    enr_qs = Enrollment.objects.filter(status="ENROLLED", student__is_active=True).select_related(
        "student", "section", "section__grade_level"
    )
    if section_id:
        enr_qs = enr_qs.filter(section_id=section_id)

    cards = []
    for enr in enr_qs.order_by("section__grade_level__level_order", "section__name", "student__last_name")[:500]:
        st = enr.student
        sec = enr.section
        cards.append(
            {
                "id": st.id,
                "student_id": st.id,
                "lrn": st.lrn,
                "full_name": st.full_name,
                "sex": st.sex,
                "section_id": sec.id if sec else None,
                "section_name": sec.name if sec else "",
                "grade_level": sec.grade_level.name if (sec and sec.grade_level) else "",
                "section_label": format_section_label(
                    sec.grade_level.name if (sec and sec.grade_level) else "",
                    sec.name if sec else "",
                ),
                "photo_url": build_media_url(st.photo, request),
                "parent_contact": st.parent_contact,
                "qr_token": st.qr_token,
                "qr_payload": sign_student_qr(st.lrn, st.qr_token),
            }
        )
    return cards


def get_parent_portal_data(*, user, request=None) -> dict:
    today = timezone.localdate()
    children_qs = (
        Student.objects.filter(parent_user=user, is_active=True)
        .select_related("location")
        .prefetch_related(
            Prefetch(
                "enrollments",
                queryset=Enrollment.objects.filter(status="ENROLLED")
                .select_related("section", "section__grade_level", "section__adviser")
                .order_by("-id"),
            )
        )
        .order_by("first_name")
    )
    children = list(children_qs)
    child_ids = [c.id for c in children]

    daily_map = dict(
        DailyAttendance.objects.filter(student_id__in=child_ids, attendance_date=today).values_list(
            "student_id", "status"
        )
    )
    recent_scans_by_student: dict[int, list[dict]] = {}
    for log in (
        ClassAttendance.objects.filter(student_id__in=child_ids)
        .select_related("class_period__subject")
        .order_by("-scanned_at")[:60]
    ):
        bucket = recent_scans_by_student.setdefault(log.student_id, [])
        if len(bucket) < 10:
            bucket.append(
                {
                    "id": log.id,
                    "date": str(log.attendance_date),
                    "time": timezone.localtime(log.scanned_at).strftime("%I:%M %p"),
                    "subject": log.class_period.subject.title
                    if (log.class_period and log.class_period.subject)
                    else "Class",
                    "status": log.status,
                }
            )

    active_passes_by_student: dict[int, list[dict]] = {}
    for ep in ExitPass.objects.filter(student_id__in=child_ids).order_by("-created_at")[:30]:
        active_passes_by_student.setdefault(ep.student_id, []).append(
            {
                "id": ep.id,
                "pass_number": ep.pass_number,
                "pass_type": ep.pass_type,
                "reason": ep.reason,
                "status": ep.status,
                "valid_until": timezone.localtime(ep.valid_until).strftime("%Y-%m-%d %I:%M %p"),
            }
        )

    children_payload = []
    for child in children:
        enrs = list(child.enrollments.all())
        enr = enrs[0] if enrs else None
        sec = enr.section if enr else None
        children_payload.append(
            {
                "id": child.id,
                "lrn": child.lrn,
                "full_name": child.full_name,
                "first_name": child.first_name,
                "sex": child.sex,
                "photo_url": build_media_url(child.photo, request),
                "section": format_section_label(
                    sec.grade_level.name if (sec and sec.grade_level) else "",
                    sec.name if sec else "",
                ),
                "adviser_name": sec.adviser.full_name if (sec and sec.adviser) else "Unassigned",
                "adviser_id": sec.adviser_id if sec else None,
                "today_status": daily_map.get(child.id, "UNSCANNED"),
                "qr_payload": sign_student_qr(child.lrn, child.qr_token),
                "recent_attendance": recent_scans_by_student.get(child.id, []),
                "exit_passes": active_passes_by_student.get(child.id, []),
            }
        )

    notifications = [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "category": n.category,
            "is_read": n.is_read,
            "created_at": timezone.localtime(n.created_at).strftime("%Y-%m-%d %I:%M %p"),
        }
        for n in Notification.objects.filter(recipient=user).order_by("-created_at")[:40]
    ]

    return {
        "children": children_payload,
        "students": children_payload,
        "notifications": notifications,
        "unread_notifications": sum(1 for n in notifications if not n["is_read"]),
    }