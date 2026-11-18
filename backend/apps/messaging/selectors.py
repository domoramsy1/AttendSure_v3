from django.db.models import Count, OuterRef, Q, Subquery
from django.utils import timezone
from common.exceptions import AppError
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import get_teacher_student_ids, resolve_teacher_for_user
from apps.school.models import ClassPeriod
from apps.school.selectors import format_section_label
from apps.students.models import Enrollment, Student
from .models import ChatMessage


def resolve_default_teacher_for_student(student: Student) -> TeacherProfile | None:
    enr = (
        Enrollment.objects.filter(student=student, status="ENROLLED")
        .select_related("section", "section__adviser")
        .order_by("-id")
        .first()
    )
    if enr and enr.section:
        if enr.section.adviser:
            return enr.section.adviser
        period = (
            ClassPeriod.objects.filter(section=enr.section, is_active=True, teacher__isnull=False)
            .select_related("teacher")
            .first()
        )
        if period and period.teacher:
            return period.teacher
    return TeacherProfile.objects.filter(is_active=True).order_by("id").first()


def authorize_chat_thread(*, user, student_id: int, teacher_id: int | None = None):
    student = Student.objects.select_related("parent_user").filter(id=student_id, is_active=True).first()
    if not student:
        raise AppError("STUDENT_NOT_FOUND", "Student not found.", 404)

    teacher = TeacherProfile.objects.filter(id=teacher_id, is_active=True).first() if teacher_id else None
    teacher = teacher or resolve_default_teacher_for_student(student)
    if not teacher:
        raise AppError("TEACHER_NOT_FOUND", "Assigned teacher not found.", 404)

    role = get_user_role(user)
    if role == "PARENT":
        if student.parent_user_id != user.id:
            raise AppError("FORBIDDEN", "This student is not linked to your parent account.", 403)
        return student, teacher, user

    if not student.parent_user:
        raise AppError("NO_PARENT_LINKED", "This student has no linked parent account yet.", 400)

    if not is_school_leader(user):
        own_teacher = resolve_teacher_for_user(user)
        if not own_teacher or student.id not in get_teacher_student_ids(own_teacher):
            raise AppError("FORBIDDEN", "Student is not in your assigned classes.", 403)

    return student, teacher, student.parent_user


def get_chat_threads_for_user(*, user, request=None) -> list[dict]:
    role = get_user_role(user)
    latest_msg = ChatMessage.objects.filter(student=OuterRef("pk")).order_by("-created_at")

    if role == "PARENT":
        base_qs = Student.objects.filter(parent_user=user, is_active=True)
    else:
        own_teacher = resolve_teacher_for_user(user)
        if is_school_leader(user) and not own_teacher:
            base_qs = Student.objects.filter(is_active=True, parent_user__isnull=False)
        elif own_teacher:
            base_qs = Student.objects.filter(
                id__in=get_teacher_student_ids(own_teacher),
                is_active=True,
                parent_user__isnull=False,
            )
        else:
            base_qs = Student.objects.none()

    students = list(
        base_qs.select_related("parent_user")
        .annotate(
            last_body=Subquery(latest_msg.values("body")[:1]),
            last_dt=Subquery(latest_msg.values("created_at")[:1]),
            unread_total=Count(
                "chat_messages",
                filter=Q(chat_messages__is_read=False) & ~Q(chat_messages__sender=user),
            ),
        )
        .order_by("last_name", "first_name")[:150]
    )

    enrollments = {
        e.student_id: e.section
        for e in Enrollment.objects.filter(student_id__in=[s.id for s in students], status="ENROLLED")
        .select_related("section", "section__grade_level", "section__adviser")
    }

    own_teacher = resolve_teacher_for_user(user) if role != "PARENT" else None
    threads = []

    for st in students:
        sec = enrollments.get(st.id)
        teacher = own_teacher or (sec.adviser if (sec and sec.adviser) else None) or resolve_default_teacher_for_student(st)
        if not teacher or not st.parent_user:
            continue

        section_label = format_section_label(sec.grade_level.name if (sec and sec.grade_level) else "", sec.name if sec else "")
        parent_name = st.guardian_name or st.mother_maiden_name or st.father_name or st.parent_user.get_full_name() or st.parent_user.username
        photo_field = teacher.photo if role == "PARENT" else st.photo

        threads.append({
            "thread_key": f"{st.id}-{teacher.id}",
            "student_id": st.id,
            "student_name": st.full_name,
            "student_lrn": st.lrn,
            "section": section_label,
            "faculty_id": teacher.id,
            "teacher_id": teacher.id,
            "faculty_name": teacher.full_name,
            "teacher_name": teacher.full_name,
            "parent_id": st.parent_user_id,
            "parent_name": parent_name,
            "photo_url": build_media_url(photo_field, request),
            "last_message": st.last_body or "Tap to start conversation",
            "last_time": timezone.localtime(st.last_dt).strftime("%I:%M %p") if st.last_dt else "",
            "unread_count": st.unread_total or 0,
        })

    threads.sort(key=lambda item: (item["unread_count"] > 0, bool(item["last_time"])), reverse=True)
    return threads


def get_thread_messages(*, user, student_id: int, teacher_id: int | None = None) -> dict:
    student, teacher, parent_user = authorize_chat_thread(
        user=user, student_id=student_id, teacher_id=teacher_id
    )
    qs = ChatMessage.objects.filter(
        student=student, teacher=teacher, parent=parent_user
    ).select_related("sender").order_by("created_at")

    qs.filter(is_read=False).exclude(sender=user).update(is_read=True)

    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "teacher_id": teacher.id,
        "faculty_id": teacher.id,
        "teacher_name": teacher.full_name,
        "faculty_name": teacher.full_name,
        "messages": [
            {
                "id": m.id,
                "sender_id": m.sender_id,
                "sender_name": m.sender.get_full_name() or m.sender.username,
                "is_mine": m.sender_id == user.id,
                "body": m.body,
                "is_read": m.is_read,
                "created_at": timezone.localtime(m.created_at).strftime("%Y-%m-%d %I:%M %p"),
                "time_only": timezone.localtime(m.created_at).strftime("%I:%M %p"),
            }
            for m in qs[:200]
        ],
    }