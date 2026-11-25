# AttendSure Backend - Attendance Read Queries
# File: D:\AttendSure_V3\backend\apps\attendance\selectors.py

from datetime import datetime, time as dt_time
from django.db.models import Count, Q
from django.utils import timezone

from apps.accounts.selectors import (
    get_teacher_enrollment_ids,
    get_teacher_section_ids,
    resolve_teacher_for_user,
)
from apps.school.models import ClassPeriod, SchoolHoliday, Section, period_runs_on_weekday
from apps.school.selectors import format_section_label
from apps.students.models import ACTIVE_ENROLLMENT_STATUSES, Enrollment
from common.media import build_media_url
from common.permissions import is_school_leader
from common.qr_signer import sign_student_qr
from common.time_utils import format_time_12h, format_time_range_12h, local_day_bounds
from .models import ClassAttendance, DailyAttendance, ExitPass


def format_class_list_items(
    enrollments,
    request=None,
    period_logs=None,
    daily_logs=None,
    period_id=None,
    period_record_ids=None,
) -> list[dict]:
    period_logs = period_logs or {}
    daily_logs = daily_logs or {}
    period_record_ids = period_record_ids or {}
    items = []
    for enr in enrollments:
        st = enr.student
        items.append(
            {
                "id": st.id,
                "student_id": st.id,
                "enrollment_id": enr.id,
                "lrn": st.lrn,
                "full_name": st.full_name,
                "name": st.full_name,
                "gender": st.gender,
                "sex": st.gender,
                "photo_url": build_media_url(st.photo, request),
                "attendance_status": (
                    (period_logs.get((period_id, enr.id)) if period_id else period_logs.get(enr.id))
                    or daily_logs.get(enr.id)
                    or "UNSCANNED"
                ),
                "attendance_record_id": (
                    period_record_ids.get((period_id, enr.id))
                    if period_id
                    else period_record_ids.get(enr.id)
                ),
                "guardian_contact": st.guardian_contact,
                "qr_token": st.qr_token,
                "qr_payload": sign_student_qr(st.lrn, st.qr_token),
            }
        )
    return items


def get_assigned_classes_with_class_lists(
    *,
    user,
    view_all: bool = False,
    include_students: bool = True,
    request=None,
) -> list[dict]:
    teacher = resolve_teacher_for_user(user)
    leader = is_school_leader(user)
    today = timezone.localdate()

    periods_qs = ClassPeriod.objects.none()
    extra_sections_qs = Section.objects.none()

    if teacher and not view_all:
        own_periods = ClassPeriod.objects.filter(
            Q(teacher=teacher) | Q(section__adviser=teacher),
            is_active=True,
        ).distinct()
        own_advisory = Section.objects.filter(adviser=teacher, is_active=True)

        if own_periods.exists() or own_advisory.exists():
            periods_qs = own_periods
            extra_sections_qs = own_advisory
        elif leader:
            periods_qs = ClassPeriod.objects.filter(is_active=True)
            extra_sections_qs = Section.objects.filter(is_active=True)
    elif leader:
        periods_qs = ClassPeriod.objects.filter(is_active=True)
        extra_sections_qs = Section.objects.filter(is_active=True)

    periods = list(
        periods_qs.select_related(
            "section", "section__grade_level", "subject", "teacher", "teacher__user"
        ).order_by("start_time")
    )
    covered_section_ids = {p.section_id for p in periods if p.section_id}
    extra_sections = list(
        extra_sections_qs.exclude(id__in=covered_section_ids)
        .select_related("grade_level")
        .order_by("grade_level__level_number", "name")
    )

    all_section_ids = covered_section_ids | {s.id for s in extra_sections}
    if not all_section_ids:
        return []

    if not include_students:
        counts_by_sec = dict(
            Enrollment.objects.filter(
                section_id__in=all_section_ids,
                status__in=ACTIVE_ENROLLMENT_STATUSES,
                student__is_active=True,
            )
            .values("section_id")
            .annotate(cnt=Count("id"))
            .values_list("section_id", "cnt")
        )
        results = []
        for p in periods:
            if not p.section:
                continue
            start_s = str(p.start_time)[:5] if p.start_time else ""
            end_s = str(p.end_time)[:5] if p.end_time else ""
            cnt = counts_by_sec.get(p.section_id, 0)
            results.append(
                {
                    "id": p.id,
                    "schedule_id": p.id,
                    "section_id": p.section_id,
                    "name": p.section.name,
                    "section_name": p.section.name,
                    "grade_level": p.section.grade_level.name if p.section.grade_level else "",
                    "subject_code": p.subject.code if p.subject else "",
                    "subject_title": p.subject.title if p.subject else "",
                    "room": p.section.room_name,
                    "day_of_week": p.day_of_week,
                    "start_time": start_s,
                    "end_time": end_s,
                    "time_display": format_time_range_12h(p.start_time, p.end_time, fallback=""),
                    "total_students": cnt,
                    "students": [],
                    "is_adviser": bool(teacher and p.section.adviser_id == teacher.id),
                }
            )
        return results

    enrollments = list(
        Enrollment.objects.filter(
            section_id__in=all_section_ids,
            status__in=ACTIVE_ENROLLMENT_STATUSES,
            student__is_active=True,
        )
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    )
    enr_by_sec: dict[int, list[Enrollment]] = {}
    all_enr_ids = []
    for enr in enrollments:
        enr_by_sec.setdefault(enr.section_id, []).append(enr)
        all_enr_ids.append(enr.id)

    period_logs = {}
    period_record_ids = {}
    for row in ClassAttendance.objects.filter(
        attendance_date=today,
        enrollment_id__in=all_enr_ids,
    ).values("id", "class_period_id", "enrollment_id", "status"):
        key = (row["class_period_id"], row["enrollment_id"])
        period_logs[key] = row["status"]
        period_record_ids[key] = row["id"]

    daily_logs = dict(
        DailyAttendance.objects.filter(
            attendance_date=today,
            enrollment_id__in=all_enr_ids,
        ).values_list("enrollment_id", "status")
    )

    results = []
    for p in periods:
        if not p.section:
            continue
        class_list = format_class_list_items(
            enr_by_sec.get(p.section_id, []),
            request=request,
            period_logs=period_logs,
            daily_logs=daily_logs,
            period_id=p.id,
            period_record_ids=period_record_ids,
        )
        start_s = str(p.start_time)[:5] if p.start_time else ""
        end_s = str(p.end_time)[:5] if p.end_time else ""
        results.append(
            {
                "id": p.id,
                "schedule_id": p.id,
                "section_id": p.section_id,
                "name": p.section.name,
                "section_name": p.section.name,
                "grade_level": p.section.grade_level.name if p.section.grade_level else "",
                "subject_code": p.subject.code if p.subject else "",
                "subject_name": p.subject.title if p.subject else "",
                "subject_title": p.subject.title if p.subject else "",
                "room": p.section.room_name,
                "day_of_week": p.day_of_week,
                "start_time": start_s,
                "end_time": end_s,
                "time_display": format_time_range_12h(p.start_time, p.end_time, fallback=""),
                "total_students": len(class_list),
                "students": class_list,
                "is_adviser": bool(teacher and p.section.adviser_id == teacher.id),
            }
        )

    for sec in extra_sections:
        class_list = format_class_list_items(
            enr_by_sec.get(sec.id, []), request=request, daily_logs=daily_logs
        )
        results.append(
            {
                "id": sec.id,
                "schedule_id": sec.id,
                "section_id": sec.id,
                "name": sec.name,
                "section_name": sec.name,
                "grade_level": sec.grade_level.name if sec.grade_level else "",
                "subject_code": "ADV",
                "subject_name": "Advisory Homeroom",
                "subject_title": "Advisory Homeroom",
                "room": sec.room_name,
                "day_of_week": "ALL_WEEKDAYS",
                "start_time": "",
                "end_time": "",
                "time_display": "Homeroom",
                "total_students": len(class_list),
                "students": class_list,
                "is_adviser": bool(teacher and sec.adviser_id == teacher.id),
            }
        )

    return results


def get_section_class_list(*, user, section_id: int | None = None, request=None) -> list[dict]:
    if not section_id:
        return get_assigned_classes_with_class_lists(user=user, request=request)

    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        if not teacher or section_id not in get_teacher_section_ids(teacher):
            return []

    today = timezone.localdate()
    enrollments = list(
        Enrollment.objects.filter(
            section_id=section_id,
            status__in=ACTIVE_ENROLLMENT_STATUSES,
            student__is_active=True,
        )
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    )
    enr_ids = [e.id for e in enrollments]

    period_logs = dict(
        ClassAttendance.objects.filter(enrollment_id__in=enr_ids, attendance_date=today).values_list(
            "enrollment_id", "status"
        )
    )
    daily_logs = dict(
        DailyAttendance.objects.filter(enrollment_id__in=enr_ids, attendance_date=today).values_list(
            "enrollment_id", "status"
        )
    )
    return format_class_list_items(
        enrollments, request=request, period_logs=period_logs, daily_logs=daily_logs
    )


def get_adviser_matrix(*, user, section_id: int | None = None, target_date=None, request=None) -> dict:
    today = timezone.localdate()
    active_date = target_date or today
    active_weekday = active_date.isoweekday()
    now_time = timezone.localtime().time()
    is_past_date = active_date < today
    is_future_date = active_date > today
    is_holiday = SchoolHoliday.objects.filter(holiday_date=active_date).exists()
    teacher = resolve_teacher_for_user(user)
    leader = is_school_leader(user)

    advisory_ids = (
        set(Section.objects.filter(adviser=teacher, is_active=True).values_list("id", flat=True))
        if teacher
        else set()
    )

    if leader:
        sections_qs = (
            Section.objects.filter(is_active=True)
            .select_related("grade_level")
            .order_by("grade_level__level_number", "name")
        )
    elif teacher:
        sections_qs = (
            Section.objects.filter(id__in=get_teacher_section_ids(teacher), is_active=True)
            .select_related("grade_level")
            .order_by("grade_level__level_number", "name")
        )
    else:
        sections_qs = Section.objects.none()

    available = [
        {
            "id": s.id,
            "name": s.name,
            "grade_level": s.grade_level.name if s.grade_level else "",
            "is_adviser": s.id in advisory_ids,
        }
        for s in sections_qs
    ]

    target = (
        sections_qs.filter(id=section_id).first()
        if section_id
        else (sections_qs.filter(id__in=advisory_ids).first() or sections_qs.first())
    )
    if not target:
        return {
            "date": str(active_date),
            "is_holiday": is_holiday,
            "has_advisory_class": False,
            "is_adviser": False,
            "available_sections": available,
            "schedules": [],
            "matrix": [],
        }

    periods = [
        p
        for p in ClassPeriod.objects.filter(section=target, is_active=True)
        .select_related("subject", "teacher", "teacher__user")
        .order_by("start_time")
        if period_runs_on_weekday(p.day_of_week, active_weekday)
    ]
    period_ids = [p.id for p in periods]
    enrollments = list(
        Enrollment.objects.filter(
            section=target,
            status__in=ACTIVE_ENROLLMENT_STATUSES,
            student__is_active=True,
        )
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    )
    enr_ids = [e.id for e in enrollments]

    log_map: dict[tuple[int, int], tuple[str, str]] = {}
    first_seen_map: dict[int, str] = {}
    earliest_present_time: dict[int, dt_time] = {}
    started_period_ids: set[int] = set()

    on_campus_enr_ids = set(
        DailyAttendance.objects.filter(
            attendance_date=active_date,
            enrollment_id__in=enr_ids,
            status__in=["PRESENT", "LATE"],
        ).values_list("enrollment_id", flat=True)
    )

    attendance_rows = (
        ClassAttendance.objects.filter(
            attendance_date=active_date,
            enrollment_id__in=enr_ids,
            class_period_id__in=period_ids,
        )
        .values(
            "enrollment_id",
            "class_period_id",
            "status",
            "scanned_at",
            "class_period__subject__code",
            "class_period__start_time",
        )
        .order_by("scanned_at")
    )

    for row in attendance_rows:
        started_period_ids.add(row["class_period_id"])
        t_str = format_time_12h(row["scanned_at"], fallback="") if row["scanned_at"] else ""
        st_code = row["status"]
        log_map[(row["enrollment_id"], row["class_period_id"])] = (st_code, t_str)

        if st_code in ("PRESENT", "LATE"):
            on_campus_enr_ids.add(row["enrollment_id"])
            p_start = row["class_period__start_time"]
            if p_start is not None:
                prev_start = earliest_present_time.get(row["enrollment_id"])
                if prev_start is None or p_start < prev_start:
                    earliest_present_time[row["enrollment_id"]] = p_start
            if row["enrollment_id"] not in first_seen_map:
                subj_code = row["class_period__subject__code"] or "CLASS"
                first_seen_map[row["enrollment_id"]] = f"{t_str} ({subj_code})" if t_str else subj_code

    # Fetch non-cancelled STUDENT ExitPass rows overlapping active_date in 1 bulk query (zero N+1)
    day_start, day_end = local_day_bounds(active_date)
    student_passes_by_enr: dict[int, list[ExitPass]] = {}
    if enr_ids:
        for ep in ExitPass.objects.filter(
            pass_scope="STUDENT",
            enrollment_id__in=enr_ids,
            is_cancelled=False,
            issued_at__lt=day_end,
            valid_until__gte=day_start,
        ):
            student_passes_by_enr.setdefault(ep.enrollment_id, []).append(ep)

    current_tz = timezone.get_current_timezone()
    period_bounds: dict[int, tuple[datetime, datetime]] = {}
    for p in periods:
        if p.start_time and p.end_time:
            period_bounds[p.id] = (
                timezone.make_aware(datetime.combine(active_date, p.start_time), current_tz),
                timezone.make_aware(datetime.combine(active_date, p.end_time), current_tz),
            )

    def _period_covered_by_exit_pass(enr_passes: list[ExitPass], pid: int) -> bool:
        bounds = period_bounds.get(pid)
        if not bounds or not enr_passes:
            return False
        p_start_dt, p_end_dt = bounds
        return any(
            ep.issued_at <= p_end_dt
            and ep.valid_until >= p_start_dt
            and (ep.returned_at is None or ep.returned_at >= p_start_dt)
            for ep in enr_passes
        )

    matrix = []
    total_periods = len(periods)

    for idx, enr in enumerate(enrollments, start=1):
        st = enr.student
        attended = cutting = 0
        in_campus = enr.id in on_campus_enr_ids
        first_seen_start = earliest_present_time.get(enr.id)
        enr_passes = student_passes_by_enr.get(enr.id, [])
        subj_cells = []

        for p in periods:
            rec = log_map.get((enr.id, p.id))
            covered_by_pass = _period_covered_by_exit_pass(enr_passes, p.id)
            is_subsequent = bool(
                first_seen_start is not None
                and p.start_time is not None
                and p.start_time > first_seen_start
            )
            if rec:
                st_status, scan_t = rec
                if st_status in ("PRESENT", "LATE", "EXCUSED"):
                    attended += 1
                elif st_status == "ABSENT":
                    if covered_by_pass:
                        st_status = "EXCUSED"
                        attended += 1
                    elif in_campus and not is_holiday and is_subsequent:
                        st_status = "CUTTING"
                        cutting += 1
            else:
                scan_t = ""
                if covered_by_pass:
                    st_status = "EXCUSED"
                    attended += 1
                else:
                    period_elapsed = (
                        p.id in started_period_ids
                        or is_past_date
                        or (not is_future_date and bool(p.start_time and now_time >= p.start_time))
                    )
                    if in_campus and not is_holiday and period_elapsed and is_subsequent:
                        st_status = "CUTTING"
                        cutting += 1
                    else:
                        st_status = "UNSCANNED"

            subj_cells.append(
                {
                    "schedule_id": p.id,
                    "subject_code": p.subject.code if p.subject else "SUB",
                    "status": st_status,
                    "time": scan_t,
                }
            )

        campus_status = first_seen_map.get(enr.id) or ("Present Today" if in_campus else "Not Seen Yet")

        matrix.append(
            {
                "number": idx,
                "student_id": st.id,
                "enrollment_id": enr.id,
                "student_name": st.full_name,
                "lrn": st.lrn,
                "photo_url": build_media_url(st.photo, request),
                "campus_status": campus_status,
                "presence_state": "ACTIVE" if in_campus else "NONE",
                "attended_count": attended,
                "cutting_count": cutting,
                "total_subjects": total_periods,
                "compliance_rate": round((attended / total_periods) * 100) if total_periods else 0,
                "subjects": subj_cells,
            }
        )

    schedules_list = [
        {
            "schedule_id": p.id,
            "subject_code": p.subject.code if p.subject else "",
            "subject_name": p.subject.title if p.subject else "",
            "teacher_name": p.teacher.full_name if p.teacher else "Unassigned",
            "time_window": format_time_range_12h(p.start_time, p.end_time, fallback="") if p.start_time else "",
        }
        for p in periods
    ]

    return {
        "date": str(active_date),
        "is_holiday": is_holiday,
        "has_advisory_class": True,
        "is_adviser": target.id in advisory_ids,
        "section_id": target.id,
        "section_name": target.name,
        "grade_level": target.grade_level.name if target.grade_level else "",
        "total_students": len(enrollments),
        "available_sections": available,
        "schedules": schedules_list,
        "matrix": matrix,
    }


def get_attendance_logs(
    *,
    user,
    target_date,
    section_id: int | None = None,
    period_id: int | None = None,
) -> list[dict]:
    qs = (
        ClassAttendance.objects.filter(attendance_date=target_date)
        .select_related(
            "enrollment",
            "enrollment__student",
            "class_period",
            "class_period__subject",
            "class_period__section",
            "class_period__section__grade_level",
        )
        .order_by("-scanned_at")
    )

    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        if not teacher:
            return []
        qs = qs.filter(enrollment_id__in=get_teacher_enrollment_ids(teacher))

    if section_id:
        qs = qs.filter(class_period__section_id=section_id)
    if period_id:
        qs = qs.filter(class_period_id=period_id)

    return [
        {
            "id": item.id,
            "enrollment_id": item.enrollment_id,
            "student_id": item.enrollment.student_id,
            "student_name": item.enrollment.student.full_name,
            "lrn": item.enrollment.student.lrn,
            "schedule_id": item.class_period_id,
            "subject_code": item.class_period.subject.code if (item.class_period and item.class_period.subject) else "",
            "section": format_section_label(
                item.class_period.section.grade_level.name
                if (item.class_period and item.class_period.section and item.class_period.section.grade_level)
                else "",
                item.class_period.section.name if (item.class_period and item.class_period.section) else "",
            ),
            "attendance_date": str(item.attendance_date),
            "status": item.status,
            "scan_method": item.scan_method,
            "scanned_at": format_time_12h(item.scanned_at, include_seconds=True),
        }
        for item in qs[:300]
    ]


def get_exit_passes_for_user(*, user, status_filter: str = "ALL", search: str = ""):
    now = timezone.now()
    qs = ExitPass.objects.select_related(
        "enrollment",
        "enrollment__student",
        "enrollment__section",
        "enrollment__section__grade_level",
        "teacher",
        "teacher__user",
        "issued_by",
        "approved_by",
    ).order_by("-issued_at")

    if status_filter and status_filter.upper() != "ALL":
        clean_st = status_filter.upper()
        if clean_st == "PENDING_APPROVAL":
            qs = qs.filter(
                pass_scope="TEACHER",
                is_approved=False,
                is_cancelled=False,
                returned_at__isnull=True,
            )
        elif clean_st == "ACTIVE":
            qs = qs.filter(is_cancelled=False, returned_at__isnull=True, valid_until__gte=now).exclude(
                pass_scope="TEACHER", is_approved=False
            )
        elif clean_st == "RETURNED":
            qs = qs.filter(is_cancelled=False, returned_at__isnull=False)
        elif clean_st in ("OVERDUE", "EXPIRED"):
            qs = qs.filter(is_cancelled=False, returned_at__isnull=True, valid_until__lt=now).exclude(
                pass_scope="TEACHER", is_approved=False
            )
        elif clean_st in ("CANCELLED", "DECLINED"):
            qs = qs.filter(is_cancelled=True)

    if search:
        qs = qs.filter(
            Q(pass_number__icontains=search)
            | Q(enrollment__student__first_name__icontains=search)
            | Q(enrollment__student__last_name__icontains=search)
            | Q(teacher__user__first_name__icontains=search)
            | Q(teacher__user__last_name__icontains=search)
            | Q(reason__icontains=search)
            | Q(destination__icontains=search)
        )

    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        if not teacher:
            return qs.none()
        qs = qs.filter(
            Q(teacher=teacher)
            | Q(issued_by=user)
            | Q(enrollment_id__in=get_teacher_enrollment_ids(teacher))
        )
    return qs
