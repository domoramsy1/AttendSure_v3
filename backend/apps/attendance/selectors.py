from django.db.models import Count, Q
from django.utils import timezone
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from common.qr_signer import sign_student_qr
from apps.school.models import ClassPeriod, Section
from apps.school.selectors import format_section_label
from apps.students.models import Enrollment
from .models import ClassAttendance, DailyAttendance, ExitPass

FacultyModel = Section._meta.get_field("adviser").related_model
PERIOD_FACULTY_FIELD = next(
    f.name for f in ClassPeriod._meta.fields if f.db_column == "faculty_id"
)
PASS_FACULTY_FIELD = next(
    f.name for f in ExitPass._meta.fields if f.db_column == "faculty_id"
)


def resolve_faculty_for_user(user):
    if not user or not getattr(user, "is_authenticated", False):
        return None
    if get_user_role(user) == "PARENT":
        return None

    by_account = (
        FacultyModel.objects.select_related("account")
        .filter(account__user=user, is_active=True)
        .first()
    )
    if by_account:
        return by_account

    lookup = Q()
    clean_username = str(getattr(user, "username", "") or "").strip()
    clean_email = str(getattr(user, "email", "") or "").strip()
    if clean_username:
        lookup |= Q(employee_id__iexact=clean_username)
    if clean_email:
        lookup |= Q(email__iexact=clean_email)

    if lookup:
        return (
            FacultyModel.objects.select_related("account")
            .filter(lookup, is_active=True)
            .first()
        )
    return None


def get_faculty_section_ids(faculty_member) -> set[int]:
    if not faculty_member:
        return set()
    advisory_ids = set(
        Section.objects.filter(adviser=faculty_member, is_active=True).values_list("id", flat=True)
    )
    period_sec_ids = set(
        faculty_member.assigned_periods.filter(is_active=True, section__is_active=True)
        .exclude(section_id__isnull=True)
        .values_list("section_id", flat=True)
    )
    return advisory_ids | period_sec_ids


def get_faculty_student_ids(faculty_member) -> set[int]:
    section_ids = get_faculty_section_ids(faculty_member)
    if not section_ids:
        return set()
    return set(
        Enrollment.objects.filter(
            section_id__in=section_ids,
            status__in=["ENROLLED", "TRANSFERRED_IN"],
            student__is_active=True,
        ).values_list("student_id", flat=True)
    )


def format_class_list_items(
    students,
    request=None,
    period_logs=None,
    daily_logs=None,
    period_id=None,
    period_record_ids=None,
) -> list[dict]:
    period_logs = period_logs or {}
    daily_logs = daily_logs or {}
    period_record_ids = period_record_ids or {}
    return [
        {
            "id": st.id,
            "lrn": st.lrn,
            "full_name": st.full_name,
            "name": st.full_name,
            "sex": st.sex,
            "gender": st.sex,
            "photo_url": build_media_url(st.photo, request),
            "attendance_status": (
                (period_logs.get((period_id, st.id)) if period_id else period_logs.get(st.id))
                or daily_logs.get(st.id)
                or "UNSCANNED"
            ),
            "attendance_record_id": (
                period_record_ids.get((period_id, st.id))
                if period_id
                else period_record_ids.get(st.id)
            ),
            "parent_contact": st.parent_contact,
            "qr_token": st.qr_token,
            "qr_payload": sign_student_qr(st.lrn, st.qr_token),
        }
        for st in students
    ]


def get_assigned_classes_with_class_lists(
    *,
    user,
    view_all: bool = False,
    include_students: bool = True,
    request=None,
) -> list[dict]:
    faculty_member = resolve_faculty_for_user(user)
    leader = is_school_leader(user)
    today = timezone.localdate()

    periods_qs = ClassPeriod.objects.none()
    extra_sections_qs = Section.objects.none()

    if faculty_member and not view_all:
        own_periods = ClassPeriod.objects.filter(
            Q(**{PERIOD_FACULTY_FIELD: faculty_member}) | Q(section__adviser=faculty_member),
            is_active=True,
        ).distinct()
        own_advisory = Section.objects.filter(adviser=faculty_member, is_active=True)

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
            "section", "section__grade_level", "subject", PERIOD_FACULTY_FIELD
        ).order_by("start_time")
    )
    covered_section_ids = {p.section_id for p in periods if p.section_id}
    extra_sections = list(
        extra_sections_qs.exclude(id__in=covered_section_ids)
        .select_related("grade_level")
        .order_by("grade_level__level_order", "name")
    )

    all_section_ids = covered_section_ids | {s.id for s in extra_sections}
    if not all_section_ids:
        return []

    if not include_students:
        counts_by_sec = dict(
            Enrollment.objects.filter(
                section_id__in=all_section_ids, status="ENROLLED", student__is_active=True
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
            results.append({
                "id": p.id,
                "schedule_id": p.id,
                "section_id": p.section_id,
                "name": p.section.name,
                "section_name": p.section.name,
                "grade_level": p.section.grade_level.name if p.section.grade_level else "",
                "subject_code": p.subject.code if p.subject else "",
                "subject_title": p.subject.title if p.subject else "",
                "room": p.section.room_number or p.room_number,
                "start_time": start_s,
                "end_time": end_s,
                "time_display": f"{start_s} - {end_s}".strip(" -"),
                "total_students": cnt,
                "students": [],
                "is_adviser": bool(faculty_member and p.section.adviser_id == faculty_member.id),
            })
        return results

    enrollments = (
        Enrollment.objects.filter(
            section_id__in=all_section_ids, status="ENROLLED", student__is_active=True
        )
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    )
    students_by_sec: dict[int, list] = {}
    all_student_ids = []
    for enr in enrollments:
        students_by_sec.setdefault(enr.section_id, []).append(enr.student)
        all_student_ids.append(enr.student_id)

    period_logs = {}
    period_record_ids = {}
    for row in ClassAttendance.objects.filter(
        attendance_date=today,
        student_id__in=all_student_ids,
    ).values("id", "class_period_id", "student_id", "status"):
        key = (row["class_period_id"], row["student_id"])
        period_logs[key] = row["status"]
        period_record_ids[key] = row["id"]

    daily_logs = dict(
        DailyAttendance.objects.filter(
            attendance_date=today,
            student_id__in=all_student_ids,
        ).values_list("student_id", "status")
    )

    results = []
    for p in periods:
        if not p.section:
            continue
        class_list = format_class_list_items(
            students_by_sec.get(p.section_id, []),
            request=request,
            period_logs=period_logs,
            daily_logs=daily_logs,
            period_id=p.id,
            period_record_ids=period_record_ids,
        )
        start_s = str(p.start_time)[:5] if p.start_time else ""
        end_s = str(p.end_time)[:5] if p.end_time else ""
        results.append({
            "id": p.id,
            "schedule_id": p.id,
            "section_id": p.section_id,
            "name": p.section.name,
            "section_name": p.section.name,
            "grade_level": p.section.grade_level.name if p.section.grade_level else "",
            "subject_code": p.subject.code if p.subject else "",
            "subject_name": p.subject.title if p.subject else "",
            "subject_title": p.subject.title if p.subject else "",
            "room": p.section.room_number or p.room_number,
            "start_time": start_s,
            "end_time": end_s,
            "time_display": f"{start_s} - {end_s}".strip(" -"),
            "total_students": len(class_list),
            "students": class_list,
            "is_adviser": bool(faculty_member and p.section.adviser_id == faculty_member.id),
        })

    for sec in extra_sections:
        class_list = format_class_list_items(
            students_by_sec.get(sec.id, []), request=request, daily_logs=daily_logs
        )
        results.append({
            "id": sec.id,
            "schedule_id": sec.id,
            "section_id": sec.id,
            "name": sec.name,
            "section_name": sec.name,
            "grade_level": sec.grade_level.name if sec.grade_level else "",
            "subject_code": "ADV",
            "subject_name": "Advisory Homeroom",
            "subject_title": "Advisory Homeroom",
            "room": sec.room_number or "",
            "start_time": "",
            "end_time": "",
            "time_display": "Homeroom",
            "total_students": len(class_list),
            "students": class_list,
            "is_adviser": bool(faculty_member and sec.adviser_id == faculty_member.id),
        })

    return results


def get_section_class_list(*, user, section_id: int | None = None, request=None) -> list[dict]:
    if not section_id:
        return get_assigned_classes_with_class_lists(user=user, request=request)

    if not is_school_leader(user):
        faculty_member = resolve_faculty_for_user(user)
        if not faculty_member or section_id not in get_faculty_section_ids(faculty_member):
            return []

    today = timezone.localdate()
    students = [
        enr.student
        for enr in Enrollment.objects.filter(
            section_id=section_id, status="ENROLLED", student__is_active=True
        )
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    ]
    student_ids = [s.id for s in students]

    period_logs = dict(
        ClassAttendance.objects.filter(student_id__in=student_ids, attendance_date=today).values_list(
            "student_id", "status"
        )
    )
    daily_logs = dict(
        DailyAttendance.objects.filter(student_id__in=student_ids, attendance_date=today).values_list(
            "student_id", "status"
        )
    )
    return format_class_list_items(
        students, request=request, period_logs=period_logs, daily_logs=daily_logs
    )


def get_adviser_matrix(*, user, section_id: int | None = None, request=None) -> dict:
    today = timezone.localdate()
    now_time = timezone.localtime().time()
    faculty_member = resolve_faculty_for_user(user)
    leader = is_school_leader(user)

    advisory_ids = (
        set(Section.objects.filter(adviser=faculty_member, is_active=True).values_list("id", flat=True))
        if faculty_member
        else set()
    )

    if leader:
        sections_qs = (
            Section.objects.filter(is_active=True)
            .select_related("grade_level")
            .order_by("grade_level__level_order", "name")
        )
    elif faculty_member:
        sections_qs = (
            Section.objects.filter(id__in=get_faculty_section_ids(faculty_member), is_active=True)
            .select_related("grade_level")
            .order_by("grade_level__level_order", "name")
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
            "has_advisory_class": False,
            "is_adviser": False,
            "available_sections": available,
            "schedules": [],
            "matrix": [],
        }

    periods = list(
        ClassPeriod.objects.filter(section=target, is_active=True)
        .select_related("subject", PERIOD_FACULTY_FIELD)
        .order_by("start_time")
    )
    students = [
        e.student
        for e in Enrollment.objects.filter(section=target, status="ENROLLED", student__is_active=True)
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    ]
    student_ids = [s.id for s in students]

    log_map: dict[tuple[int, int], tuple[str, str]] = {}
    first_seen_map: dict[int, str] = {}
    started_period_ids: set[int] = set()

    on_campus_ids = set(
        DailyAttendance.objects.filter(
            attendance_date=today,
            student_id__in=student_ids,
            status__in=["PRESENT", "LATE"],
        ).values_list("student_id", flat=True)
    )

    attendance_rows = (
        ClassAttendance.objects.filter(attendance_date=today, student_id__in=student_ids)
        .values("student_id", "class_period_id", "status", "scanned_at", "class_period__subject__code")
        .order_by("scanned_at")
    )

    for row in attendance_rows:
        started_period_ids.add(row["class_period_id"])
        t_str = timezone.localtime(row["scanned_at"]).strftime("%I:%M %p") if row["scanned_at"] else ""
        st_code = row["status"]
        log_map[(row["student_id"], row["class_period_id"])] = (st_code, t_str)

        if st_code in ("PRESENT", "LATE"):
            on_campus_ids.add(row["student_id"])
            if row["student_id"] not in first_seen_map:
                subj_code = row["class_period__subject__code"] or "CLASS"
                first_seen_map[row["student_id"]] = f"{t_str} ({subj_code})" if t_str else subj_code

    matrix = []
    total_periods = len(periods)

    for idx, st in enumerate(students, start=1):
        attended = cutting = 0
        in_campus = st.id in on_campus_ids
        subj_cells = []

        for p in periods:
            rec = log_map.get((st.id, p.id))
            if rec:
                st_status, scan_t = rec
                if st_status in ("PRESENT", "LATE", "EXCUSED"):
                    attended += 1
                elif st_status in ("ABSENT", "CUTTING") and in_campus:
                    st_status = "CUTTING"
                    cutting += 1
            else:
                scan_t = ""
                if in_campus and (p.id in started_period_ids or (p.start_time and now_time >= p.start_time)):
                    st_status = "CUTTING"
                    cutting += 1
                else:
                    st_status = "UNSCANNED"

            subj_cells.append({
                "schedule_id": p.id,
                "subject_code": p.subject.code if p.subject else "SUB",
                "status": st_status,
                "time": scan_t,
            })

        campus_status = first_seen_map.get(st.id) or ("Present Today" if in_campus else "Not Seen Yet")

        matrix.append({
            "number": idx,
            "student_id": st.id,
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
        })

    schedules_list = []
    for p in periods:
        period_faculty = getattr(p, PERIOD_FACULTY_FIELD, None)
        schedules_list.append({
            "schedule_id": p.id,
            "subject_code": p.subject.code if p.subject else "",
            "subject_name": p.subject.title if p.subject else "",
            "faculty_name": period_faculty.full_name if period_faculty else "Unassigned",
            "time_window": f"{str(p.start_time)[:5]} - {str(p.end_time)[:5]}" if p.start_time else "",
        })

    return {
        "has_advisory_class": True,
        "is_adviser": target.id in advisory_ids,
        "section_id": target.id,
        "section_name": target.name,
        "grade_level": target.grade_level.name if target.grade_level else "",
        "total_students": len(students),
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
            "student",
            "class_period",
            "class_period__subject",
            "class_period__section",
            "class_period__section__grade_level",
        )
        .order_by("-scanned_at")
    )

    if not is_school_leader(user):
        faculty_member = resolve_faculty_for_user(user)
        if not faculty_member:
            return []
        qs = qs.filter(student_id__in=get_faculty_student_ids(faculty_member))

    if section_id:
        qs = qs.filter(class_period__section_id=section_id)
    if period_id:
        qs = qs.filter(class_period_id=period_id)

    return [
        {
            "id": item.id,
            "student_id": item.student_id,
            "student_name": item.student.full_name,
            "lrn": item.student.lrn,
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
            "scanned_at": timezone.localtime(item.scanned_at).strftime("%I:%M:%S %p"),
        }
        for item in qs[:300]
    ]


def get_exit_passes_for_user(*, user, status_filter: str = "ALL", search: str = ""):
    role = get_user_role(user)
    qs = ExitPass.objects.select_related("student", PASS_FACULTY_FIELD, "issued_by").order_by("-created_at")

    if status_filter and status_filter.upper() != "ALL":
        clean_st = status_filter.upper()
        if clean_st == "DECLINED":
            qs = qs.filter(status__in=["REVOKED", "DECLINED"])
        else:
            qs = qs.filter(status=clean_st)
    if search:
        qs = qs.filter(
            Q(pass_number__icontains=search)
            | Q(student__first_name__icontains=search)
            | Q(student__last_name__icontains=search)
            | Q(**{f"{PASS_FACULTY_FIELD}__first_name__icontains": search})
            | Q(**{f"{PASS_FACULTY_FIELD}__last_name__icontains": search})
            | Q(reason__icontains=search)
        )
    if role == "PARENT":
        return qs.filter(student__parent_user=user)
    if not is_school_leader(user):
        faculty_member = resolve_faculty_for_user(user)
        if not faculty_member:
            return qs.none()
        qs = qs.filter(
            Q(**{PASS_FACULTY_FIELD: faculty_member})
            | Q(issued_by=faculty_member)
            | Q(student_id__in=get_faculty_student_ids(faculty_member))
        )
    return qs