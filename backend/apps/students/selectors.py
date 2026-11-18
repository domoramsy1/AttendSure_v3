from django.db.models import Count, Q
from django.utils import timezone
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from common.phone import normalize_ph_phone
from common.qr_signer import sign_student_qr
from apps.accounts.selectors import get_teacher_student_ids, resolve_teacher_for_user
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.messaging.models import Notification
from apps.school.selectors import format_section_label
from .models import Enrollment, Student


def get_students_for_user(*, user, search: str = "", section_id: int | None = None):
    role = get_user_role(user)
    qs = Student.objects.prefetch_related("enrollments__section", "enrollments__school_year").order_by(
        "last_name", "first_name"
    )
    if search:
        qs = qs.filter(Q(lrn__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
    if section_id:
        qs = qs.filter(enrollments__section_id=section_id, enrollments__status="ENROLLED")
    if role == "PARENT":
        return qs.filter(parent_user=user, is_active=True).distinct()
    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        qs = qs.filter(id__in=get_teacher_student_ids(teacher)) if teacher else qs.none()
    return qs.distinct()


def get_signed_qr_cards(*, section_id: int | None = None, request=None) -> list[dict]:
    qs = Enrollment.objects.filter(status="ENROLLED", student__is_active=True).select_related(
        "student", "section", "section__grade_level"
    )
    if section_id:
        qs = qs.filter(section_id=section_id)
    return [
        {
            "student_id": enr.student.id,
            "lrn": enr.student.lrn,
            "full_name": enr.student.full_name,
            "grade_section": format_section_label(
                enr.section.grade_level.name if enr.section.grade_level else "", enr.section.name
            ),
            "qr_token": enr.student.qr_token,
            "qr_payload": sign_student_qr(enr.student.lrn, enr.student.qr_token),
            "photo_url": build_media_url(enr.student.photo, request),
        }
        for enr in qs.order_by("student__last_name", "student__first_name")[:500]
    ]


def get_parent_portal_data(*, user, request=None) -> dict:
    today = timezone.localdate()
    profile = getattr(user, "profile", None)
    phone = normalize_ph_phone(profile.phone_number if profile else "")
    if phone:
        Student.objects.filter(parent_contact=phone, parent_user__isnull=True).update(parent_user=user)

    children = list(Student.objects.filter(parent_user=user, is_active=True).order_by("first_name"))
    child_ids = [c.id for c in children]

    enrollments = {
        e.student_id: e
        for e in Enrollment.objects.filter(student_id__in=child_ids, status="ENROLLED").select_related(
            "section", "section__grade_level", "section__adviser"
        )
    }
    daily_map = {
        d.student_id: d for d in DailyAttendance.objects.filter(student_id__in=child_ids, attendance_date=today)
    }

    scans_by_child: dict[int, list] = {}
    for log in (
        ClassAttendance.objects.filter(student_id__in=child_ids, attendance_date=today)
        .select_related("class_period__subject", "recorded_by")
        .order_by("-scanned_at")
    ):
        scans_by_child.setdefault(log.student_id, []).append({
            "id": log.id,
            "subject_code": log.class_period.subject.code if log.class_period else "CLASS",
            "subject_title": log.class_period.subject.title if log.class_period else "Class",
            "teacher_name": log.recorded_by.full_name if log.recorded_by else "",
            "status": log.status,
            "scanned_at": timezone.localtime(log.scanned_at).strftime("%I:%M %p"),
        })

    passes_by_child: dict[int, list] = {}
    for ep in ExitPass.objects.filter(student_id__in=child_ids).select_related("issued_by").order_by("-created_at")[:20]:
        passes_by_child.setdefault(ep.student_id, []).append({
            "id": ep.id,
            "pass_number": ep.pass_number,
            "reason": ep.reason,
            "status": ep.status,
            "valid_until": timezone.localtime(ep.valid_until).strftime("%I:%M %p"),
        })

    children_payload = []
    for child in children:
        enr = enrollments.get(child.id)
        sec = enr.section if enr else None
        daily = daily_map.get(child.id)
        children_payload.append({
            "id": child.id,
            "lrn": child.lrn,
            "full_name": child.full_name,
            "photo_url": build_media_url(child.photo, request),
            "section": format_section_label(sec.grade_level.name if (sec and sec.grade_level) else "", sec.name if sec else "Unassigned"),
            "adviser_name": sec.adviser.full_name if (sec and sec.adviser) else "",
            "today_status": daily.status if daily else "UNSCANNED",
            "subject_scans_today": scans_by_child.get(child.id, []),
            "exit_passes": passes_by_child.get(child.id, []),
        })

    alerts = list(
        Notification.objects.filter(Q(recipient=user) | Q(student_id__in=child_ids)).order_by("-created_at")[:50]
    )
    return {
        "parent_name": user.get_full_name() or user.username,
        "children_count": len(children_payload),
        "children": children_payload,
        "unread_notifications": sum(1 for a in alerts if not a.is_read),
        "notifications": [
            {
                "id": a.id,
                "title": a.title,
                "message": a.message,
                "category": a.category,
                "is_read": a.is_read,
                "created_at": timezone.localtime(a.created_at).strftime("%Y-%m-%d %I:%M %p"),
            }
            for a in alerts
        ],
    }