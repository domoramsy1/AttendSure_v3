# AttendSure Backend - Reports Printables
# File: D:\AttendSure_V3\backend\apps\reports\printables.py

"""
AttendSure - Printable & Downloadable Class Schedules, Class Lists, QR ID Cards, and Teacher Directory
File: backend/apps/reports/printables.py

Strict RBAC scoping, O(1) prefetched queries, HTML escaping, CSV formula neutralization,
and AuditLog tracking for both Teachers and School Leaders.
"""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import time
from typing import Any

from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.html import escape

from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from apps.attendance.models import DailyAttendance
from apps.school.models import ClassPeriod, Section, expand_schedule_days
from apps.school.selectors import format_section_label, get_school_metadata
from apps.students.models import Enrollment, Student
from common.exceptions import AppError
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from common.qr_signer import sign_student_qr
from common.time_utils import format_datetime_12h, format_time_12h, format_time_range_12h

VALID_PACK_TYPES = {
    "CLASS_SCHEDULE",
    "CLASS_LIST",
    "QR_ID_CARDS",
    "TEACHER_DIRECTORY",
    "COMPLETE_TEACHER_PACKET",
}
VALID_SCOPES = {"ALL", "SELECTED"}
VALID_EXPORT_FORMATS = {"json", "html", "csv"}
CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "|", "\t", "\r")
MAX_ID_FILTER_COUNT = 500

DAY_LABELS = {
    "ALL_WEEKDAYS": "Mon-Fri",
    "MWF": "Mon / Wed / Fri",
    "TTH": "Tue / Thu",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
    "7": "Sunday",
}


def sanitize_csv_cell(value: Any) -> str:
    """Neutralizes spreadsheet formula injection for CSV exports."""
    text = "" if value is None else str(value)
    stripped = text.lstrip(" ")
    if text and (text[0] in CSV_FORMULA_PREFIXES or (stripped and stripped[0] in CSV_FORMULA_PREFIXES)):
        return f"'{text}"
    return text


def apply_html_security_headers(response: HttpResponse) -> HttpResponse:
    """Applies strict CSP and anti-sniffing headers to printable HTML responses."""
    response["Content-Security-Policy"] = (
        "default-src 'none'; "
        "style-src 'unsafe-inline'; "
        "img-src 'self' data: https: http:; "
        "font-src 'self' data:; "
        "base-uri 'none'; "
        "form-action 'none'; "
        "frame-ancestors 'self';"
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Referrer-Policy"] = "no-referrer"
    return response


def _format_time_12h(val: time | None) -> str:
    return format_time_12h(val, fallback="")


def _format_day_label(day_of_week: str | None) -> str:
    clean = str(day_of_week or "ALL_WEEKDAYS").strip().upper()
    return DAY_LABELS.get(clean, clean.replace("_", " ").title())


def _period_weekly_hours(period: ClassPeriod) -> float:
    if not period.start_time or not period.end_time:
        return 0.0
    start_mins = period.start_time.hour * 60 + period.start_time.minute
    end_mins = period.end_time.hour * 60 + period.end_time.minute
    duration_mins = max(0, end_mins - start_mins)
    days_count = len(expand_schedule_days(period.day_of_week))
    return round((duration_mins * days_count) / 60.0, 2)


def _extract_raw_values(params: Any, key: str, single_alias: str | None = None) -> list[Any]:
    values: list[Any] = []
    if hasattr(params, "getlist"):
        values.extend(params.getlist(key))
        if single_alias:
            values.extend(params.getlist(single_alias))
    else:
        val = params.get(key)
        if val is not None:
            values.extend(val if isinstance(val, (list, tuple, set)) else [val])
        if single_alias:
            single_val = params.get(single_alias)
            if single_val is not None:
                values.extend(single_val if isinstance(single_val, (list, tuple, set)) else [single_val])
    return values


def parse_positive_id_list(params: Any, key: str, single_alias: str | None = None) -> list[int]:
    """Parses and validates positive integer IDs from query params or JSON lists."""
    raw_items = _extract_raw_values(params, key, single_alias)
    parsed: list[int] = []
    seen: set[int] = set()

    for item in raw_items:
        if item is None or item == "":
            continue
        tokens = str(item).split(",") if isinstance(item, str) else [item]
        for token in tokens:
            s = str(token).strip()
            if not s:
                continue
            if not s.isdigit() or int(s) <= 0:
                raise AppError(
                    "INVALID_ID_FILTER",
                    f"Invalid ID value '{s}' provided for '{key}'.",
                    400,
                )
            num = int(s)
            if num not in seen:
                seen.add(num)
                parsed.append(num)
                if len(parsed) > MAX_ID_FILTER_COUNT:
                    raise AppError(
                        "TOO_MANY_IDS",
                        f"You can select at most {MAX_ID_FILTER_COUNT} items at one time.",
                        400,
                    )
    return parsed


def parse_optional_positive_int(params: Any, key: str) -> int | None:
    raw = params.get(key)
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip()
    if not s.isdigit() or int(s) <= 0:
        raise AppError("INVALID_ID_FILTER", f"Invalid ID value '{s}' provided for '{key}'.", 400)
    return int(s)


def _check_rbac_and_scope(
    *,
    user,
    pack_type: str,
    scope: str,
    section_ids: list[int],
    period_ids: list[int],
    teacher_ids: list[int],
    student_ids: list[int],
    grade_level_id: int | None,
) -> dict[str, Any]:
    leader = is_school_leader(user)
    own_teacher = resolve_teacher_for_user(user)

    if pack_type == "TEACHER_DIRECTORY" and not leader:
        raise AppError(
            "FORBIDDEN",
            "Only school leaders can export or print the teacher directory.",
            403,
        )

    if scope == "SELECTED" and not (
        section_ids or period_ids or teacher_ids or student_ids or grade_level_id
    ):
        raise AppError(
            "SELECTION_REQUIRED",
            "Please select at least one item before exporting Selected Only.",
            400,
        )

    if leader:
        return {
            "is_leader": True,
            "own_teacher": own_teacher,
            "allowed_section_ids": None,
            "allowed_teacher_ids": None,
            "allowed_period_ids": None,
        }

    if not own_teacher:
        raise AppError(
            "FORBIDDEN",
            "Your account does not have a teacher profile linked to class records.",
            403,
        )

    can_teach = bool(own_teacher.can_handle_classes)
    if not can_teach and pack_type in ("CLASS_LIST", "QR_ID_CARDS", "COMPLETE_TEACHER_PACKET"):
        raise AppError(
            "FORBIDDEN",
            "Only teaching staff and school leaders can export student class lists or QR ID cards.",
            403,
        )

    allowed_section_ids = set(get_teacher_section_ids(own_teacher))
    allowed_period_ids = set(
        ClassPeriod.objects.filter(is_active=True)
        .filter(Q(teacher=own_teacher) | Q(section_id__in=allowed_section_ids))
        .values_list("id", flat=True)
    )

    if teacher_ids and any(tid != own_teacher.id for tid in teacher_ids):
        raise AppError(
            "FORBIDDEN",
            "You can only print or download your own teaching schedule and class lists.",
            403,
        )

    if section_ids and any(sid not in allowed_section_ids for sid in section_ids):
        raise AppError(
            "FORBIDDEN",
            "You can only print or download class lists for sections you advise or teach.",
            403,
        )

    if period_ids and any(pid not in allowed_period_ids for pid in period_ids):
        raise AppError(
            "FORBIDDEN",
            "You can only print or download class periods assigned to you or your advisory class.",
            403,
        )

    if student_ids:
        enrolled_allowed = set(
            Enrollment.objects.filter(
                student_id__in=student_ids,
                section_id__in=allowed_section_ids,
                status__in=["ENROLLED", "TRANSFERRED_IN"],
                student__is_active=True,
            ).values_list("student_id", flat=True)
        )
        if any(sid not in enrolled_allowed for sid in student_ids):
            raise AppError(
                "FORBIDDEN",
                "One or more selected students are not enrolled in your assigned classes.",
                403,
            )

    return {
        "is_leader": False,
        "own_teacher": own_teacher,
        "allowed_section_ids": allowed_section_ids,
        "allowed_teacher_ids": {own_teacher.id},
        "allowed_period_ids": allowed_period_ids,
    }


def _build_advisory_map(teacher_ids: list[int]) -> dict[int, list[str]]:
    if not teacher_ids:
        return {}
    sections = (
        Section.objects.filter(is_active=True, adviser_id__in=teacher_ids)
        .select_related("grade_level")
        .order_by("grade_level__level_number", "name")
    )
    advisory_map: dict[int, list[str]] = defaultdict(list)
    for sec in sections:
        if sec.adviser_id:
            label = format_section_label(
                sec.grade_level.name if sec.grade_level_id else "", sec.name
            )
            advisory_map[sec.adviser_id].append(label)
    return advisory_map


def _build_class_schedule_data(
    *,
    access: dict[str, Any],
    section_ids: list[int],
    period_ids: list[int],
    teacher_ids: list[int],
    grade_level_id: int | None,
    school_year: str,
) -> dict[str, Any]:
    qs = ClassPeriod.objects.filter(is_active=True).select_related(
        "section",
        "section__grade_level",
        "section__school_year",
        "section__adviser",
        "section__adviser__user",
        "subject",
        "teacher",
        "teacher__user",
        "teacher__position",
        "teacher__department",
    )

    if not access["is_leader"]:
        own_teacher = access["own_teacher"]
        if section_ids or period_ids:
            qs = qs.filter(
                Q(teacher=own_teacher) | Q(section_id__in=access["allowed_section_ids"])
            )
        else:
            qs = qs.filter(teacher=own_teacher)

    if teacher_ids:
        qs = qs.filter(teacher_id__in=teacher_ids)
    if section_ids:
        qs = qs.filter(section_id__in=section_ids)
    if period_ids:
        qs = qs.filter(id__in=period_ids)
    if grade_level_id:
        qs = qs.filter(section__grade_level_id=grade_level_id)
    if school_year:
        qs = qs.filter(section__school_year__name=school_year)

    periods = list(
        qs.order_by(
            "section__grade_level__level_number",
            "section__name",
            "start_time",
            "id",
        )
    )

    involved_teacher_ids = sorted({p.teacher_id for p in periods if p.teacher_id})
    if not access["is_leader"] and access["own_teacher"]:
        if access["own_teacher"].id not in involved_teacher_ids:
            involved_teacher_ids.append(access["own_teacher"].id)
    elif teacher_ids:
        for tid in teacher_ids:
            if tid not in involved_teacher_ids:
                involved_teacher_ids.append(tid)

    advisory_map = _build_advisory_map(involved_teacher_ids)

    teacher_profiles_by_id = {
        t.id: t
        for t in TeacherProfile.objects.filter(id__in=involved_teacher_ids).select_related(
            "user", "position", "department"
        )
    }

    flat_periods: list[dict[str, Any]] = []
    by_teacher: dict[int, dict[str, Any]] = {}
    by_section: dict[int, dict[str, Any]] = {}
    total_weekly_hours = 0.0

    for tid in involved_teacher_ids:
        t = teacher_profiles_by_id.get(tid)
        if not t:
            continue
        by_teacher[tid] = {
            "teacher_id": t.id,
            "teacher_name": t.full_name,
            "employee_id": t.employee_id,
            "position": t.position_title or "Teacher",
            "department": t.department_name or "General",
            "advisory_sections": advisory_map.get(t.id, []),
            "total_weekly_hours": 0.0,
            "periods": [],
        }

    for p in periods:
        sec = p.section
        grade_name = sec.grade_level.name if sec and sec.grade_level_id else ""
        sec_name = sec.name if sec else ""
        sec_label = format_section_label(grade_name, sec_name)
        sy_name = sec.school_year.name if sec and sec.school_year_id else ""
        adviser_name = sec.adviser.full_name if sec and sec.adviser_id and sec.adviser else "Unassigned"
        teacher_name = p.teacher.full_name if p.teacher_id and p.teacher else "Unassigned"
        employee_id = p.teacher.employee_id if p.teacher_id and p.teacher else ""
        weekly_hours = _period_weekly_hours(p)
        total_weekly_hours += weekly_hours

        row = {
            "id": p.id,
            "schedule_code": p.schedule_code or f"PER-{p.id}",
            "section_id": p.section_id,
            "grade_level": grade_name,
            "section_name": sec_name,
            "section_label": sec_label,
            "school_year": sy_name,
            "adviser_name": adviser_name,
            "subject_id": p.subject_id,
            "subject_code": p.subject.code if p.subject_id else "",
            "subject_title": p.subject.title if p.subject_id else "",
            "teacher_id": p.teacher_id,
            "teacher_name": teacher_name,
            "employee_id": employee_id,
            "day_of_week": p.day_of_week,
            "day_label": _format_day_label(p.day_of_week),
            "start_time": f"{p.start_time.hour:02d}:{p.start_time.minute:02d}" if p.start_time else "",
            "end_time": f"{p.end_time.hour:02d}:{p.end_time.minute:02d}" if p.end_time else "",
            "time_range": format_time_range_12h(p.start_time, p.end_time, fallback=""),
            "room_name": p.room_name or "Main Room",
            "weekly_hours": weekly_hours,
        }
        flat_periods.append(row)

        if p.teacher_id and p.teacher_id in by_teacher:
            by_teacher[p.teacher_id]["periods"].append(row)
            by_teacher[p.teacher_id]["total_weekly_hours"] = round(
                by_teacher[p.teacher_id]["total_weekly_hours"] + weekly_hours, 2
            )

        if p.section_id not in by_section:
            by_section[p.section_id] = {
                "section_id": p.section_id,
                "grade_level": grade_name,
                "section_name": sec_name,
                "section_label": sec_label,
                "school_year": sy_name,
                "adviser_name": adviser_name,
                "room_name": p.room_name or "Main Room",
                "periods": [],
            }
        by_section[p.section_id]["periods"].append(row)

    teacher_schedules = sorted(
        by_teacher.values(), key=lambda x: (x["teacher_name"].lower(), x["employee_id"])
    )
    for ts in teacher_schedules:
        ts["periods"].sort(key=lambda r: (r["start_time"], r["section_label"]))

    section_schedules = sorted(
        by_section.values(), key=lambda x: (x["grade_level"], x["section_name"])
    )

    return {
        "summary": {
            "total_periods": len(flat_periods),
            "total_teachers": len(teacher_schedules),
            "total_sections": len(section_schedules),
            "total_weekly_hours": round(total_weekly_hours, 2),
        },
        "periods": flat_periods,
        "teacher_schedules": teacher_schedules,
        "section_schedules": section_schedules,
    }


def _resolve_target_sections(
    *,
    access: dict[str, Any],
    section_ids: list[int],
    teacher_ids: list[int],
    student_ids: list[int],
    grade_level_id: int | None,
    school_year: str,
) -> list[Section]:
    qs = Section.objects.filter(is_active=True).select_related(
        "grade_level",
        "school_year",
        "adviser",
        "adviser__user",
    )

    if not access["is_leader"]:
        qs = qs.filter(id__in=access["allowed_section_ids"])

    if teacher_ids:
        taught_section_ids = set(
            ClassPeriod.objects.filter(
                is_active=True, teacher_id__in=teacher_ids
            ).values_list("section_id", flat=True)
        )
        qs = qs.filter(Q(adviser_id__in=teacher_ids) | Q(id__in=taught_section_ids))

    if section_ids:
        qs = qs.filter(id__in=section_ids)
    if grade_level_id:
        qs = qs.filter(grade_level_id=grade_level_id)
    if school_year:
        qs = qs.filter(school_year__name=school_year)
    if student_ids:
        student_section_ids = set(
            Enrollment.objects.filter(
                student_id__in=student_ids,
                status__in=["ENROLLED", "TRANSFERRED_IN"],
                student__is_active=True,
            ).values_list("section_id", flat=True)
        )
        qs = qs.filter(id__in=student_section_ids)

    return list(qs.order_by("grade_level__level_number", "name"))


def _build_class_list_data(
    *,
    access: dict[str, Any],
    section_ids: list[int],
    teacher_ids: list[int],
    student_ids: list[int],
    grade_level_id: int | None,
    school_year: str,
) -> dict[str, Any]:
    sections = _resolve_target_sections(
        access=access,
        section_ids=section_ids,
        teacher_ids=teacher_ids,
        student_ids=student_ids,
        grade_level_id=grade_level_id,
        school_year=school_year,
    )
    sec_ids = [s.id for s in sections]

    enr_qs = Enrollment.objects.filter(
        section_id__in=sec_ids,
        status__in=["ENROLLED", "TRANSFERRED_IN"],
        student__is_active=True,
    ).select_related("student", "section", "section__grade_level")

    if student_ids:
        enr_qs = enr_qs.filter(student_id__in=student_ids)

    enrollments = list(
        enr_qs.order_by("student__last_name", "student__first_name", "student__lrn")
    )

    today = timezone.localdate()
    enr_ids = [e.id for e in enrollments]
    today_status_map: dict[int, str] = {}
    if enr_ids:
        for enr_id, st in DailyAttendance.objects.filter(
            enrollment_id__in=enr_ids, attendance_date=today
        ).values_list("enrollment_id", "status"):
            today_status_map[enr_id] = st

    enr_by_section: dict[int, list[Enrollment]] = defaultdict(list)
    for enr in enrollments:
        enr_by_section[enr.section_id].append(enr)

    class_lists: list[dict[str, Any]] = []
    total_students = 0
    total_males = 0
    total_females = 0

    for sec in sections:
        grade_name = sec.grade_level.name if sec.grade_level_id else ""
        sec_label = format_section_label(grade_name, sec.name)
        adviser_name = sec.adviser.full_name if sec.adviser_id and sec.adviser else "Unassigned"
        sy_name = sec.school_year.name if sec.school_year_id else ""

        males: list[dict[str, Any]] = []
        females: list[dict[str, Any]] = []

        for enr in enr_by_section.get(sec.id, []):
            stu = enr.student
            sex = "Female" if str(stu.gender or "").strip().lower().startswith("f") else "Male"
            row = {
                "student_id": stu.id,
                "enrollment_id": enr.id,
                "lrn": stu.lrn,
                "full_name": stu.full_name,
                "last_name": stu.last_name,
                "first_name": stu.first_name,
                "middle_name": stu.middle_name,
                "sex": sex,
                "birth_date": stu.birth_date.isoformat() if stu.birth_date else "",
                "guardian_name": stu.guardian_name or "",
                "guardian_contact": stu.guardian_contact or "",
                "qr_status": "Active" if stu.qr_token else "Pending",
                "today_status": today_status_map.get(enr.id, "UNSCANNED"),
                "section_id": sec.id,
                "grade_level": grade_name,
                "section_name": sec.name,
                "section_label": sec_label,
            }
            if sex == "Female":
                females.append(row)
            else:
                males.append(row)

        for idx, r in enumerate(males, start=1):
            r["row_number"] = idx
        for idx, r in enumerate(females, start=1):
            r["row_number"] = idx

        combined = males + females
        total_males += len(males)
        total_females += len(females)
        total_students += len(combined)

        class_lists.append(
            {
                "section_id": sec.id,
                "grade_level": grade_name,
                "section_name": sec.name,
                "section_label": sec_label,
                "school_year": sy_name,
                "room_name": sec.room_name or "Main Room",
                "adviser_name": adviser_name,
                "male_count": len(males),
                "female_count": len(females),
                "total_count": len(combined),
                "males": males,
                "females": females,
                "students": combined,
            }
        )

    return {
        "summary": {
            "total_sections": len(class_lists),
            "total_students": total_students,
            "total_males": total_males,
            "total_females": total_females,
        },
        "class_lists": class_lists,
    }


def _build_qr_id_cards_data(
    *,
    request,
    meta: dict[str, Any],
    access: dict[str, Any],
    section_ids: list[int],
    teacher_ids: list[int],
    student_ids: list[int],
    grade_level_id: int | None,
    school_year: str,
) -> dict[str, Any]:
    sections = _resolve_target_sections(
        access=access,
        section_ids=section_ids,
        teacher_ids=teacher_ids,
        student_ids=student_ids,
        grade_level_id=grade_level_id,
        school_year=school_year,
    )
    sec_map = {s.id: s for s in sections}

    enr_qs = Enrollment.objects.filter(
        section_id__in=list(sec_map.keys()),
        status__in=["ENROLLED", "TRANSFERRED_IN"],
        student__is_active=True,
    ).select_related("student", "section", "section__grade_level", "section__adviser", "section__adviser__user")

    if student_ids:
        enr_qs = enr_qs.filter(student_id__in=student_ids)

    enrollments = list(
        enr_qs.order_by(
            "section__grade_level__level_number",
            "section__name",
            "student__last_name",
            "student__first_name",
        )
    )

    cards: list[dict[str, Any]] = []
    seen_students: set[int] = set()
    school_name = meta.get("school_name") or "AttendSure School"
    default_sy = meta.get("school_year") or ""

    for enr in enrollments:
        stu: Student = enr.student
        if stu.id in seen_students:
            continue
        seen_students.add(stu.id)
        sec = sec_map.get(enr.section_id) or enr.section
        grade_name = sec.grade_level.name if sec and sec.grade_level_id else ""
        sec_name = sec.name if sec else ""
        sec_label = format_section_label(grade_name, sec_name)
        adviser_name = sec.adviser.full_name if sec and sec.adviser_id and sec.adviser else "Unassigned"
        sy_name = sec.school_year.name if sec and sec.school_year_id else default_sy
        photo_url = build_media_url(stu.photo, request) if stu.photo else None
        signed_payload = sign_student_qr(stu.lrn, stu.qr_token)

        cards.append(
            {
                "student_id": stu.id,
                "lrn": stu.lrn,
                "full_name": stu.full_name,
                "sex": stu.gender,
                "section_id": sec.id if sec else None,
                "grade_level": grade_name,
                "section_name": sec_name,
                "grade_section": sec_label,
                "adviser_name": adviser_name,
                "school_name": school_name,
                "school_year": sy_name,
                "qr_status": "Active" if stu.qr_token else "Pending",
                "qr_payload": signed_payload,
                "photo_url": photo_url,
            }
        )

    return {
        "summary": {
            "total_cards": len(cards),
            "total_sections": len({c["section_id"] for c in cards if c["section_id"]}),
        },
        "cards": cards,
    }


def _build_teacher_directory_data(
    *,
    teacher_ids: list[int],
    school_year: str,
) -> dict[str, Any]:
    qs = TeacherProfile.objects.filter(user__is_active=True).select_related(
        "user",
        "user__profile",
        "department",
        "position",
    )
    if teacher_ids:
        qs = qs.filter(id__in=teacher_ids)

    teachers = list(qs.order_by("user__last_name", "user__first_name", "employee_id"))
    t_ids = [t.id for t in teachers]

    advisory_map = _build_advisory_map(t_ids)
    period_qs = ClassPeriod.objects.filter(is_active=True, teacher_id__in=t_ids)
    if school_year:
        period_qs = period_qs.filter(section__school_year__name=school_year)

    period_counts: dict[int, int] = defaultdict(int)
    weekly_hours_map: dict[int, float] = defaultdict(float)
    for p in period_qs:
        if p.teacher_id:
            period_counts[p.teacher_id] += 1
            weekly_hours_map[p.teacher_id] += _period_weekly_hours(p)

    rows: list[dict[str, Any]] = []
    teaching_count = 0
    bound_count = 0

    for t in teachers:
        role = get_user_role(t.user)
        advisory_list = advisory_map.get(t.id, [])
        phone_bound = bool(t.bound_device_id)
        if t.can_handle_classes:
            teaching_count += 1
        if phone_bound:
            bound_count += 1
        rows.append(
            {
                "teacher_id": t.id,
                "employee_id": t.employee_id,
                "full_name": t.full_name,
                "username": t.user.username if t.user_id else "",
                "role": role,
                "position": t.position_title or "Teacher",
                "department": t.department_name or "General",
                "can_handle_classes": bool(t.can_handle_classes),
                "teaching_status": "Teaching" if t.can_handle_classes else "Non-Teaching Staff",
                "advisory_sections": advisory_list,
                "advisory_label": ", ".join(advisory_list) if advisory_list else "None",
                "scheduled_periods_count": period_counts.get(t.id, 0),
                "weekly_hours": round(weekly_hours_map.get(t.id, 0.0), 2),
                "contact_number": t.contact_number or "",
                "email": t.email or "",
                "phone_bound": phone_bound,
                "phone_status": "Phone Bound" if phone_bound else "Not Bound",
                "device_model": t.device_model or "",
            }
        )

    return {
        "summary": {
            "total_teachers": len(rows),
            "teaching_staff": teaching_count,
            "non_teaching_staff": len(rows) - teaching_count,
            "bound_phones": bound_count,
        },
        "teachers": rows,
    }


def _build_complete_teacher_packet_data(
    *,
    access: dict[str, Any],
    section_ids: list[int],
    period_ids: list[int],
    teacher_ids: list[int],
    student_ids: list[int],
    grade_level_id: int | None,
    school_year: str,
) -> dict[str, Any]:
    schedule_data = _build_class_schedule_data(
        access=access,
        section_ids=section_ids,
        period_ids=period_ids,
        teacher_ids=teacher_ids,
        grade_level_id=grade_level_id,
        school_year=school_year,
    )
    class_list_data = _build_class_list_data(
        access=access,
        section_ids=section_ids,
        teacher_ids=teacher_ids,
        student_ids=student_ids,
        grade_level_id=grade_level_id,
        school_year=school_year,
    )

    class_list_by_section = {
        cl["section_id"]: cl for cl in class_list_data["class_lists"]
    }

    adviser_section_ids_by_teacher: dict[int, set[int]] = defaultdict(set)
    for sec in Section.objects.filter(
        is_active=True, id__in=list(class_list_by_section.keys())
    ).values("id", "adviser_id"):
        if sec["adviser_id"]:
            adviser_section_ids_by_teacher[sec["adviser_id"]].add(sec["id"])

    packets: list[dict[str, Any]] = []
    for ts in schedule_data["teacher_schedules"]:
        tid = ts["teacher_id"]
        taught_sec_ids = {p["section_id"] for p in ts["periods"] if p.get("section_id")}
        related_sec_ids = taught_sec_ids | adviser_section_ids_by_teacher.get(tid, set())
        teacher_class_lists = [
            class_list_by_section[sid]
            for sid in sorted(
                related_sec_ids,
                key=lambda s: (
                    class_list_by_section[s]["grade_level"],
                    class_list_by_section[s]["section_name"],
                )
                if s in class_list_by_section
                else ("", ""),
            )
            if sid in class_list_by_section
        ]
        packets.append(
            {
                "teacher_id": tid,
                "teacher_name": ts["teacher_name"],
                "employee_id": ts["employee_id"],
                "position": ts["position"],
                "department": ts["department"],
                "advisory_sections": ts["advisory_sections"],
                "total_weekly_hours": ts["total_weekly_hours"],
                "periods": ts["periods"],
                "class_lists": teacher_class_lists,
            }
        )

    return {
        "summary": {
            "total_packets": len(packets),
            "total_periods": schedule_data["summary"]["total_periods"],
            "total_sections": class_list_data["summary"]["total_sections"],
            "total_students": class_list_data["summary"]["total_students"],
        },
        "packets": packets,
        "teacher_schedules": schedule_data["teacher_schedules"],
        "class_lists": class_list_data["class_lists"],
    }


def build_print_pack_payload(*, request, params: Any) -> dict[str, Any]:
    """Validates parameters, enforces RBAC, and builds structured printable pack data."""
    pack_type = str(params.get("pack_type") or "CLASS_SCHEDULE").strip().upper()
    if pack_type not in VALID_PACK_TYPES:
        raise AppError(
            "INVALID_PACK_TYPE",
            f"Unsupported print pack type '{pack_type}'.",
            400,
        )

    scope = str(params.get("scope") or "ALL").strip().upper()
    if scope not in VALID_SCOPES:
        raise AppError("INVALID_SCOPE", "Scope must be 'ALL' or 'SELECTED'.", 400)

    export_format = str(
        params.get("export_format") or params.get("output") or "json"
    ).strip().lower()
    if export_format not in VALID_EXPORT_FORMATS:
        raise AppError(
            "INVALID_EXPORT_FORMAT",
            "Export format must be 'json', 'html', or 'csv'.",
            400,
        )

    section_ids = parse_positive_id_list(params, "section_ids", "section_id")
    period_ids = parse_positive_id_list(params, "period_ids", "period_id")
    teacher_ids = parse_positive_id_list(params, "teacher_ids", "teacher_id")
    student_ids = parse_positive_id_list(params, "student_ids", "student_id")
    grade_level_id = parse_optional_positive_int(params, "grade_level_id")
    school_year = str(params.get("school_year") or "").strip()[:30]

    access = _check_rbac_and_scope(
        user=request.user,
        pack_type=pack_type,
        scope=scope,
        section_ids=section_ids,
        period_ids=period_ids,
        teacher_ids=teacher_ids,
        student_ids=student_ids,
        grade_level_id=grade_level_id,
    )

    meta = get_school_metadata(request=request)
    if not school_year:
        school_year = ""

    if pack_type == "CLASS_SCHEDULE":
        body = _build_class_schedule_data(
            access=access,
            section_ids=section_ids,
            period_ids=period_ids,
            teacher_ids=teacher_ids,
            grade_level_id=grade_level_id,
            school_year=school_year,
        )
    elif pack_type == "CLASS_LIST":
        body = _build_class_list_data(
            access=access,
            section_ids=section_ids,
            teacher_ids=teacher_ids,
            student_ids=student_ids,
            grade_level_id=grade_level_id,
            school_year=school_year,
        )
    elif pack_type == "QR_ID_CARDS":
        body = _build_qr_id_cards_data(
            request=request,
            meta=meta,
            access=access,
            section_ids=section_ids,
            teacher_ids=teacher_ids,
            student_ids=student_ids,
            grade_level_id=grade_level_id,
            school_year=school_year,
        )
    elif pack_type == "TEACHER_DIRECTORY":
        body = _build_teacher_directory_data(
            teacher_ids=teacher_ids,
            school_year=school_year,
        )
    else:
        body = _build_complete_teacher_packet_data(
            access=access,
            section_ids=section_ids,
            period_ids=period_ids,
            teacher_ids=teacher_ids,
            student_ids=student_ids,
            grade_level_id=grade_level_id,
            school_year=school_year,
        )

    own_teacher = access["own_teacher"]
    generated_by = (
        own_teacher.full_name
        if own_teacher
        else (request.user.get_full_name() or request.user.username)
    )

    return {
        "pack_type": pack_type,
        "scope": scope,
        "export_format": export_format,
        "generated_at": format_datetime_12h(timezone.localtime(), date_format="%Y-%m-%d"),
        "generated_by": generated_by,
        "school": meta,
        **body,
    }


def _render_deped_header_html(meta: dict[str, Any], doc_title: str, subtitle: str) -> str:
    school_name = escape(meta.get("school_name") or "AttendSure School")
    school_id = escape(meta.get("school_id") or "—")
    region = escape(meta.get("region") or "—")
    division = escape(meta.get("division") or "—")
    district = escape(meta.get("district") or "—")
    sy = escape(meta.get("school_year") or "—")
    return (
        "<div class='deped-header'>"
        "<div class='deped-kicker'>Republic of the Philippines &bull; Department of Education</div>"
        f"<div class='deped-school'>{school_name}</div>"
        f"<div class='deped-meta'>School ID: <b>{school_id}</b> &bull; Region: <b>{region}</b> &bull; "
        f"Division: <b>{division}</b> &bull; District: <b>{district}</b> &bull; School Year: <b>{sy}</b></div>"
        f"<h2 class='doc-title'>{escape(doc_title)}</h2>"
        f"<div class='doc-subtitle'>{escape(subtitle)}</div>"
        "</div>"
    )


def _render_signature_block_html(prepared_label: str, prepared_name: str, meta: dict[str, Any]) -> str:
    principal_name = escape(meta.get("principal_name") or meta.get("school_head") or "School Principal")
    principal_title = escape(meta.get("principal_title") or "School Principal")
    return (
        "<div class='sig-grid'>"
        "<div class='sig-col'>"
        f"<div class='sig-label'>{escape(prepared_label)}</div>"
        f"<div class='sig-line'>{escape(prepared_name)}</div>"
        "<div class='sig-role'>Signature over Printed Name</div>"
        "</div>"
        "<div class='sig-col'>"
        "<div class='sig-label'>Approved By:</div>"
        f"<div class='sig-line'>{principal_name}</div>"
        f"<div class='sig-role'>{principal_title}</div>"
        "</div>"
        "</div>"
    )


def _render_schedule_section_html(ts: dict[str, Any], meta: dict[str, Any]) -> str:
    advisory_text = ", ".join(ts.get("advisory_sections") or []) or "None"
    rows = "".join(
        "<tr>"
        f"<td>{escape(p['time_range'])}</td>"
        f"<td>{escape(p['day_label'])}</td>"
        f"<td><b>{escape(p['subject_code'])}</b> &mdash; {escape(p['subject_title'])}</td>"
        f"<td>{escape(p['section_label'])}</td>"
        f"<td>{escape(p['room_name'])}</td>"
        f"<td class='num'>{p['weekly_hours']:.2f} hrs</td>"
        "</tr>"
        for p in ts.get("periods", [])
    )
    if not rows:
        rows = "<tr><td colspan='6' class='empty'>No active class periods assigned.</td></tr>"
    return (
        _render_deped_header_html(
            meta,
            "Official Teacher Class Schedule",
            f"Teacher: {ts['teacher_name']} ({ts['employee_id']}) | Position: {ts['position']} | Department: {ts['department']}",
        )
        + f"<div class='meta-strip'><span><b>Advisory Section:</b> {escape(advisory_text)}</span>"
        + f"<span><b>Total Weekly Teaching Hours:</b> {ts['total_weekly_hours']:.2f} hrs</span>"
        + f"<span><b>Assigned Classes:</b> {len(ts.get('periods', []))}</span></div>"
        + "<table><thead><tr>"
        + "<th>Period Time</th><th>Days</th><th>Subject</th><th>Grade &amp; Section</th><th>Room</th><th class='num'>Weekly Hours</th>"
        + f"</tr></thead><tbody>{rows}</tbody></table>"
        + _render_signature_block_html("Prepared By:", ts["teacher_name"], meta)
    )


def _render_class_list_section_html(cl: dict[str, Any], meta: dict[str, Any]) -> str:
    def _group_rows(label: str, items: list[dict[str, Any]]) -> str:
        if not items:
            return f"<tr class='group-row'><td colspan='8'>{escape(label)} (0)</td></tr>"
        out = [f"<tr class='group-row'><td colspan='8'>{escape(label)} ({len(items)})</td></tr>"]
        for r in items:
            guardian = " / ".join(filter(None, [r.get("guardian_name", ""), r.get("guardian_contact", "")])) or "—"
            out.append(
                "<tr>"
                f"<td class='num'>{r['row_number']}</td>"
                f"<td class='mono'>{escape(r['lrn'])}</td>"
                f"<td><b>{escape(r['full_name'])}</b></td>"
                f"<td>{escape(r['sex'])}</td>"
                f"<td>{escape(r['birth_date'])}</td>"
                f"<td>{escape(guardian)}</td>"
                f"<td>{escape(r['qr_status'])}</td>"
                f"<td>{escape(r['today_status'])}</td>"
                "</tr>"
            )
        return "".join(out)

    body_rows = _group_rows("MALE STUDENTS", cl.get("males", [])) + _group_rows(
        "FEMALE STUDENTS", cl.get("females", [])
    )
    return (
        _render_deped_header_html(
            meta,
            "Official Section Class List",
            f"{cl['section_label']} | Room: {cl['room_name']} | Class Adviser: {cl['adviser_name']}",
        )
        + f"<div class='meta-strip'><span><b>Male:</b> {cl['male_count']}</span>"
        + f"<span><b>Female:</b> {cl['female_count']}</span>"
        + f"<span><b>Combined Total:</b> {cl['total_count']}</span>"
        + f"<span><b>School Year:</b> {escape(cl.get('school_year') or meta.get('school_year') or '—')}</span></div>"
        + "<table><thead><tr>"
        + "<th class='num'>#</th><th>12-Digit LRN</th><th>Student Name</th><th>Sex</th>"
        + "<th>Birth Date</th><th>Guardian &amp; Contact</th><th>QR ID Status</th><th>Today</th>"
        + f"</tr></thead><tbody>{body_rows}</tbody></table>"
        + _render_signature_block_html("Class Adviser:", cl["adviser_name"], meta)
    )


def render_print_pack_html(payload: dict[str, Any]) -> str:
    """Renders a clean, escaped, print-ready HTML document for any print pack type."""
    meta = payload["school"]
    pack_type = payload["pack_type"]
    sections_html: list[str] = []

    if pack_type == "CLASS_SCHEDULE":
        teacher_schedules = payload.get("teacher_schedules", [])
        if teacher_schedules:
            for ts in teacher_schedules:
                sections_html.append(_render_schedule_section_html(ts, meta))
        else:
            sections_html.append(
                _render_deped_header_html(meta, "Official Class Schedule", "No matching schedules found.")
                + "<p class='empty'>No active class schedules matched your filter.</p>"
            )

    elif pack_type == "CLASS_LIST":
        class_lists = payload.get("class_lists", [])
        if class_lists:
            for cl in class_lists:
                sections_html.append(_render_class_list_section_html(cl, meta))
        else:
            sections_html.append(
                _render_deped_header_html(meta, "Official Section Class List", "No matching sections found.")
                + "<p class='empty'>No active enrolled students matched your filter.</p>"
            )

    elif pack_type == "QR_ID_CARDS":
        cards = payload.get("cards", [])
        card_blocks = []
        for c in cards:
            card_blocks.append(
                "<div class='qr-card'>"
                f"<div class='qr-card-head'>{escape(c['school_name'])}<br><span>OFFICIAL STUDENT QR ID</span></div>"
                "<div class='qr-card-body'>"
                f"<div class='qr-name'>{escape(c['full_name'])}</div>"
                f"<div class='qr-sec'>{escape(c['grade_section'])} &bull; SY {escape(c['school_year'])}</div>"
                f"<div class='qr-lrn'>LRN: {escape(c['lrn'])}</div>"
                f"<div class='qr-payload-box'><div class='qr-badge'>SIGNED QR TOKEN</div><code>{escape(c['qr_payload'])}</code></div>"
                f"<div class='qr-foot'>Adviser: {escape(c['adviser_name'])}</div>"
                "</div></div>"
            )
        grid_html = (
            f"<div class='qr-grid'>{''.join(card_blocks)}</div>"
            if card_blocks
            else "<p class='empty'>No students matched your filter for QR ID cards.</p>"
        )
        sections_html.append(
            _render_deped_header_html(
                meta,
                "Printable Student QR ID Cards",
                f"Total ID Cards: {len(cards)} | Cut along dashed borders",
            )
            + grid_html
        )

    elif pack_type == "TEACHER_DIRECTORY":
        teachers = payload.get("teachers", [])
        rows = "".join(
            "<tr>"
            f"<td class='mono'>{escape(t['employee_id'])}</td>"
            f"<td><b>{escape(t['full_name'])}</b></td>"
            f"<td>{escape(t['position'])}</td>"
            f"<td>{escape(t['department'])}</td>"
            f"<td>{escape(t['teaching_status'])}</td>"
            f"<td>{escape(t['advisory_label'])}</td>"
            f"<td class='num'>{t['scheduled_periods_count']} ({t['weekly_hours']:.1f}h)</td>"
            f"<td>{escape(t['contact_number'] or t['email'] or '—')}</td>"
            f"<td>{escape(t['phone_status'])}</td>"
            "</tr>"
            for t in teachers
        )
        if not rows:
            rows = "<tr><td colspan='9' class='empty'>No teachers matched your filter.</td></tr>"
        sections_html.append(
            _render_deped_header_html(
                meta,
                "School Teacher & Staff Directory",
                f"Total Records: {len(teachers)} | Generated: {payload['generated_at']}",
            )
            + "<table><thead><tr>"
            + "<th>Employee ID</th><th>Full Name</th><th>Position</th><th>Department</th>"
            + "<th>Status</th><th>Advisory Section</th><th class='num'>Classes</th><th>Contact</th><th>Phone Binding</th>"
            + f"</tr></thead><tbody>{rows}</tbody></table>"
            + _render_signature_block_html("Prepared By:", payload["generated_by"], meta)
        )

    else:  # COMPLETE_TEACHER_PACKET
        packets = payload.get("packets", [])
        if packets:
            for pkt in packets:
                sections_html.append(_render_schedule_section_html(pkt, meta))
                for cl in pkt.get("class_lists", []):
                    sections_html.append(_render_class_list_section_html(cl, meta))
        else:
            sections_html.append(
                _render_deped_header_html(meta, "Complete Teacher Packet", "No matching records found.")
                + "<p class='empty'>No schedules or class lists matched your filter.</p>"
            )

    joined_pages = "<div class='page-break'></div>".join(
        f"<section class='sheet'>{sec}</section>" for sec in sections_html
    )
    title_text = escape(f"AttendSure - {pack_type.replace('_', ' ').title()}")
    generated_stamp = escape(f"Generated {payload['generated_at']} by {payload['generated_by']}")

    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        f"<title>{title_text}</title>"
        "<style>"
        "@page { size: A4 portrait; margin: 12mm; }"
        "body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 12px; background: #ffffff; }"
        ".sheet { margin-bottom: 18px; }"
        ".page-break { page-break-before: always; break-before: page; height: 1px; }"
        ".deped-header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 8px; margin-bottom: 10px; }"
        ".deped-kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #475569; }"
        ".deped-school { font-size: 16px; font-weight: 800; color: #0f172a; margin: 2px 0; }"
        ".deped-meta { font-size: 10px; color: #334155; }"
        ".doc-title { font-size: 14px; font-weight: 800; color: #1e3a8a; margin: 6px 0 2px; text-transform: uppercase; }"
        ".doc-subtitle { font-size: 11px; color: #1f2937; font-weight: 600; }"
        ".meta-strip { display: flex; flex-wrap: wrap; gap: 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; font-size: 10.5px; }"
        "table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }"
        "th, td { border: 1px solid #94a3b8; padding: 5px 6px; text-align: left; vertical-align: top; }"
        "th { background: #e2e8f0; font-weight: 700; color: #0f172a; font-size: 10px; text-transform: uppercase; }"
        "tr.group-row td { background: #eff6ff; font-weight: 800; color: #1e3a8a; font-size: 10.5px; }"
        ".num { text-align: right; white-space: nowrap; }"
        ".mono { font-family: Consolas, Monaco, monospace; font-size: 10px; }"
        ".empty { text-align: center; padding: 18px; color: #64748b; font-style: italic; }"
        ".sig-grid { display: flex; justify-content: space-between; gap: 28px; margin-top: 22px; page-break-inside: avoid; }"
        ".sig-col { flex: 1; text-align: center; }"
        ".sig-label { font-size: 10px; color: #475569; margin-bottom: 24px; text-align: left; }"
        ".sig-line { border-bottom: 1px solid #0f172a; font-weight: 700; padding-bottom: 2px; font-size: 11px; }"
        ".sig-role { font-size: 9.5px; color: #475569; margin-top: 3px; }"
        ".qr-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }"
        ".qr-card { border: 1.5px dashed #64748b; border-radius: 8px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }"
        ".qr-card-head { background: #1e3a8a; color: #ffffff; padding: 6px 8px; text-align: center; font-weight: 800; font-size: 10.5px; }"
        ".qr-card-head span { font-size: 9px; letter-spacing: 0.5px; opacity: 0.9; }"
        ".qr-card-body { padding: 8px 10px; text-align: center; }"
        ".qr-name { font-size: 12px; font-weight: 800; color: #0f172a; }"
        ".qr-sec { font-size: 10px; color: #334155; margin-top: 2px; }"
        ".qr-lrn { font-family: Consolas, monospace; font-size: 10.5px; font-weight: 700; margin: 4px 0; }"
        ".qr-payload-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px; margin: 5px 0; word-break: break-all; }"
        ".qr-badge { font-size: 8.5px; font-weight: 800; color: #1e3a8a; margin-bottom: 2px; }"
        ".qr-payload-box code { font-size: 8px; color: #0f172a; }"
        ".qr-foot { font-size: 9px; color: #475569; margin-top: 4px; }"
        ".footer-stamp { text-align: right; font-size: 9px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; margin-top: 10px; }"
        "@media print { body { padding: 0; } }"
        "</style></head><body>"
        f"{joined_pages}"
        f"<div class='footer-stamp'>AttendSure Official Export &bull; {generated_stamp}</div>"
        "</body></html>"
    )


def render_print_pack_csv(payload: dict[str, Any]) -> str:
    """Renders formula-safe CSV text for any print pack type."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    pack_type = payload["pack_type"]

    def _row(cells: list[Any]) -> None:
        writer.writerow([sanitize_csv_cell(c) for c in cells])

    if pack_type == "CLASS_SCHEDULE":
        _row(
            [
                "Schedule Code",
                "Teacher",
                "Employee ID",
                "Grade & Section",
                "Subject Code",
                "Subject Title",
                "Days",
                "Time Range",
                "Room",
                "Weekly Hours",
                "School Year",
            ]
        )
        for p in payload.get("periods", []):
            _row(
                [
                    p["schedule_code"],
                    p["teacher_name"],
                    p["employee_id"],
                    p["section_label"],
                    p["subject_code"],
                    p["subject_title"],
                    p["day_label"],
                    p["time_range"],
                    p["room_name"],
                    p["weekly_hours"],
                    p["school_year"],
                ]
            )

    elif pack_type == "CLASS_LIST":
        _row(
            [
                "Section",
                "Adviser",
                "Room",
                "School Year",
                "Row #",
                "LRN",
                "Student Name",
                "Sex",
                "Birth Date",
                "Guardian Name",
                "Guardian Contact",
                "QR Status",
                "Today Status",
            ]
        )
        for cl in payload.get("class_lists", []):
            for st in cl.get("students", []):
                _row(
                    [
                        cl["section_label"],
                        cl["adviser_name"],
                        cl["room_name"],
                        cl["school_year"],
                        st["row_number"],
                        st["lrn"],
                        st["full_name"],
                        st["sex"],
                        st["birth_date"],
                        st["guardian_name"],
                        st["guardian_contact"],
                        st["qr_status"],
                        st["today_status"],
                    ]
                )

    elif pack_type == "QR_ID_CARDS":
        _row(
            [
                "School Name",
                "School Year",
                "Grade & Section",
                "Adviser",
                "LRN",
                "Student Name",
                "Sex",
                "QR Status",
                "Signed QR Payload",
            ]
        )
        for c in payload.get("cards", []):
            _row(
                [
                    c["school_name"],
                    c["school_year"],
                    c["grade_section"],
                    c["adviser_name"],
                    c["lrn"],
                    c["full_name"],
                    c["sex"],
                    c["qr_status"],
                    c["qr_payload"],
                ]
            )

    elif pack_type == "TEACHER_DIRECTORY":
        _row(
            [
                "Employee ID",
                "Full Name",
                "Role",
                "Position",
                "Department",
                "Teaching Status",
                "Advisory Sections",
                "Scheduled Classes",
                "Weekly Hours",
                "Contact Number",
                "Email",
                "Phone Binding",
            ]
        )
        for t in payload.get("teachers", []):
            _row(
                [
                    t["employee_id"],
                    t["full_name"],
                    t["role"],
                    t["position"],
                    t["department"],
                    t["teaching_status"],
                    t["advisory_label"],
                    t["scheduled_periods_count"],
                    t["weekly_hours"],
                    t["contact_number"],
                    t["email"],
                    t["phone_status"],
                ]
            )

    else:  # COMPLETE_TEACHER_PACKET
        _row(
            [
                "Record Type",
                "Teacher",
                "Employee ID",
                "Grade & Section",
                "Code / LRN",
                "Subject / Student Name",
                "Days / Sex",
                "Time / Birth Date",
                "Room / Guardian Contact",
                "Weekly Hours / Status",
            ]
        )
        for pkt in payload.get("packets", []):
            for p in pkt.get("periods", []):
                _row(
                    [
                        "SCHEDULE",
                        pkt["teacher_name"],
                        pkt["employee_id"],
                        p["section_label"],
                        p["subject_code"],
                        p["subject_title"],
                        p["day_label"],
                        p["time_range"],
                        p["room_name"],
                        f"{p['weekly_hours']} hrs",
                    ]
                )
            for cl in pkt.get("class_lists", []):
                for st in cl.get("students", []):
                    _row(
                        [
                            "CLASS_LIST",
                            pkt["teacher_name"],
                            pkt["employee_id"],
                            cl["section_label"],
                            st["lrn"],
                            st["full_name"],
                            st["sex"],
                            st["birth_date"],
                            st["guardian_contact"],
                            st["today_status"],
                        ]
                    )

    return buf.getvalue()
