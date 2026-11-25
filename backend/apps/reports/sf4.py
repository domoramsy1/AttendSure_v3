import calendar
from datetime import date, datetime
from django.db.models import Q

from apps.attendance.models import ClassAttendance, DailyAttendance
from apps.school.models import GradeLevel, SchoolHoliday, SchoolYear, Section
from apps.school.selectors import get_school_metadata
from apps.students.models import Enrollment
from common.exceptions import AppError
from .sf2 import resolve_month


def make_triplet(m=0, f=0) -> dict:
    total = m + f
    return {
        "m": round(m, 1) if isinstance(m, float) else int(m),
        "f": round(f, 1) if isinstance(f, float) else int(f),
        "total": round(total, 1) if isinstance(total, float) else int(total),
    }


def add_triplets(t1: dict, t2: dict) -> dict:
    return make_triplet(t1["m"] + t2["m"], t1["f"] + t2["f"])


def compute_attendance_pct(ada: dict, reg: dict) -> dict:
    return {
        "m": round((ada["m"] / reg["m"]) * 100, 1) if reg["m"] > 0 else 0.0,
        "f": round((ada["f"] / reg["f"]) * 100, 1) if reg["f"] > 0 else 0.0,
        "total": round((ada["total"] / reg["total"]) * 100, 1)
        if reg["total"] > 0
        else 0.0,
    }


def empty_summary_row(section_id: str, section_name: str, grade_level: str) -> dict:
    zero = make_triplet(0, 0)
    return {
        "section_id": section_id,
        "section_name": section_name,
        "grade_level": grade_level,
        "adviser_name": "",
        "registered_end": dict(zero),
        "daily_average": make_triplet(0.0, 0.0),
        "attendance_percentage": {"m": 0.0, "f": 0.0, "total": 0.0},
        "dropped_out_prev": dict(zero),
        "dropped_out_month": dict(zero),
        "dropped_out_cumulative": dict(zero),
        "transferred_out_prev": dict(zero),
        "transferred_out_month": dict(zero),
        "transferred_out_cumulative": dict(zero),
        "transferred_in_prev": dict(zero),
        "transferred_in_month": dict(zero),
        "transferred_in_cumulative": dict(zero),
    }


SUMMABLE_KEYS = (
    "registered_end",
    "daily_average",
    "dropped_out_prev",
    "dropped_out_month",
    "dropped_out_cumulative",
    "transferred_out_prev",
    "transferred_out_month",
    "transferred_out_cumulative",
    "transferred_in_prev",
    "transferred_in_month",
    "transferred_in_cumulative",
)


def generate_sf4_report(
    *, month_name: str = "October", year: int = 2026, school_year: str = "", request=None
) -> dict:
    month_num, clean_month = resolve_month(month_name)
    year = int(year)
    if not (1900 <= year <= 2100):
        raise AppError("INVALID_YEAR", "Year must be between 1900 and 2100.", 400)
    _, num_days = calendar.monthrange(year, month_num)
    start_dt, end_dt = date(year, month_num, 1), date(year, month_num, num_days)

    holiday_dates = set(
        SchoolHoliday.objects.filter(
            holiday_date__range=(start_dt, end_dt)
        ).values_list("holiday_date", flat=True)
    )
    school_days = [
        date(year, month_num, d)
        for d in range(1, num_days + 1)
        if date(year, month_num, d).weekday() < 5
        and date(year, month_num, d) not in holiday_dates
    ]
    n_days = len(school_days) or 1

    target_sy = None
    if school_year:
        sy_clean = str(school_year).strip()
        target_sy = (
            SchoolYear.objects.filter(id=int(sy_clean)).first()
            if sy_clean.isdigit()
            else SchoolYear.objects.filter(name__iexact=sy_clean).first()
        )
    if target_sy is None:
        target_sy = (
            SchoolYear.objects.filter(is_active=True).first()
            or SchoolYear.objects.first()
        )

    sections_qs = Section.objects.select_related(
        "grade_level", "school_year", "adviser", "adviser__user"
    ).filter(is_active=True)
    if target_sy:
        sections_qs = sections_qs.filter(
            Q(school_year=target_sy) | Q(school_year__isnull=True)
        )
    sections = list(sections_qs.order_by("grade_level__level_number", "name"))

    enr_qs = Enrollment.objects.filter(
        section__in=sections, student__is_active=True
    ).select_related("student", "section__school_year")
    if target_sy:
        enr_qs = enr_qs.filter(
            Q(section__school_year=target_sy) | Q(section__school_year__isnull=True)
        )

    enr_by_sec: dict[int, list] = {}
    all_enrollment_ids = set()
    for enr in enr_qs:
        enr_by_sec.setdefault(enr.section_id, []).append(enr)
        all_enrollment_ids.add(enr.id)

    present_codes = ["PRESENT", "LATE", "EXCUSED"]
    present_pairs = set()
    if all_enrollment_ids:
        present_pairs.update(
            DailyAttendance.objects.filter(
                enrollment_id__in=all_enrollment_ids,
                attendance_date__range=(start_dt, end_dt),
                status__in=present_codes,
            ).values_list("enrollment_id", "attendance_date")
        )
        present_pairs.update(
            ClassAttendance.objects.filter(
                class_period__section__in=sections,
                enrollment_id__in=all_enrollment_ids,
                attendance_date__range=(start_dt, end_dt),
                status__in=present_codes,
            ).values_list("enrollment_id", "attendance_date")
        )

    grade_names = list(
        GradeLevel.objects.order_by("level_number").values_list("name", flat=True)
    )
    groups_map: dict[str, list] = {g: [] for g in grade_names if g}

    for sec in sections:
        g_label = (
            sec.grade_level.name if sec.grade_level else "NON-GRADED"
        ).strip() or "NON-GRADED"
        adviser_label = (sec.adviser.full_name if sec.adviser else "Unassigned").upper()

        reg_m = reg_f = att_m = att_f = 0
        drop_prev_m = drop_prev_f = drop_mo_m = drop_mo_f = 0
        tout_prev_m = tout_prev_f = tout_mo_m = tout_mo_f = 0
        tin_prev_m = tin_prev_f = tin_mo_m = tin_mo_f = 0

        for enr in enr_by_sec.get(sec.id, []):
            st = enr.student
            is_m = str(st.gender or "").upper().startswith("M")
            enr_dt = (
                enr.enrolled_date.date()
                if isinstance(enr.enrolled_date, datetime)
                else enr.enrolled_date
            )
            if enr_dt and enr_dt > end_dt:
                continue

            status_val = str(enr.status or "").upper()
            exit_dt = (
                enr.status_date.date()
                if isinstance(enr.status_date, datetime)
                else enr.status_date
            )

            if "DROP" in status_val:
                if exit_dt and exit_dt < start_dt:
                    if is_m:
                        drop_prev_m += 1
                    else:
                        drop_prev_f += 1
                    continue
                if not exit_dt or exit_dt <= end_dt:
                    if is_m:
                        drop_mo_m += 1
                    else:
                        drop_mo_f += 1
            elif "TRANSFERRED" in status_val and "OUT" in status_val:
                if exit_dt and exit_dt < start_dt:
                    if is_m:
                        tout_prev_m += 1
                    else:
                        tout_prev_f += 1
                    continue
                if not exit_dt or exit_dt <= end_dt:
                    if is_m:
                        tout_mo_m += 1
                    else:
                        tout_mo_f += 1

            if "TRANSFERRED" in status_val and "IN" in status_val:
                if enr_dt and enr_dt < start_dt:
                    if is_m:
                        tin_prev_m += 1
                    else:
                        tin_prev_f += 1
                else:
                    if is_m:
                        tin_mo_m += 1
                    else:
                        tin_mo_f += 1

            if status_val not in ("DROPPED", "TRANSFERRED_OUT") or (
                exit_dt and exit_dt > end_dt
            ):
                if is_m:
                    reg_m += 1
                else:
                    reg_f += 1
                for s_day in school_days:
                    if (enr.id, s_day) in present_pairs:
                        if is_m:
                            att_m += 1
                        else:
                            att_f += 1

        reg = make_triplet(reg_m, reg_f)
        ada = make_triplet(round(att_m / n_days, 1), round(att_f / n_days, 1))
        d_prev, d_mo = make_triplet(drop_prev_m, drop_prev_f), make_triplet(
            drop_mo_m, drop_mo_f
        )
        to_prev, to_mo = make_triplet(tout_prev_m, tout_prev_f), make_triplet(
            tout_mo_m, tout_mo_f
        )
        ti_prev, ti_mo = make_triplet(tin_prev_m, tin_prev_f), make_triplet(
            tin_mo_m, tin_mo_f
        )

        groups_map.setdefault(g_label, []).append(
            {
                "section_id": sec.id,
                "section_name": sec.name,
                "grade_level": g_label,
                "adviser_name": adviser_label,
                "registered_end": reg,
                "daily_average": ada,
                "attendance_percentage": compute_attendance_pct(ada, reg),
                "dropped_out_prev": d_prev,
                "dropped_out_month": d_mo,
                "dropped_out_cumulative": add_triplets(d_prev, d_mo),
                "transferred_out_prev": to_prev,
                "transferred_out_month": to_mo,
                "transferred_out_cumulative": add_triplets(to_prev, to_mo),
                "transferred_in_prev": ti_prev,
                "transferred_in_month": ti_mo,
                "transferred_in_cumulative": add_triplets(ti_prev, ti_mo),
            }
        )

    grade_groups = []
    total_summary = empty_summary_row("grand-total", "TOTAL", "ALL")

    for g_label, sec_rows in groups_map.items():
        subtotal = empty_summary_row(f"subtotal-{g_label}", "SUBTOTAL", g_label)
        for row in sec_rows:
            for key in SUMMABLE_KEYS:
                subtotal[key] = add_triplets(subtotal[key], row[key])
        subtotal["attendance_percentage"] = compute_attendance_pct(
            subtotal["daily_average"], subtotal["registered_end"]
        )
        grade_groups.append(
            {
                "grade_level": g_label,
                "sections": sec_rows,
                "subtotal": subtotal,
            }
        )
        for key in SUMMABLE_KEYS:
            total_summary[key] = add_triplets(total_summary[key], subtotal[key])

    total_summary["attendance_percentage"] = compute_attendance_pct(
        total_summary["daily_average"], total_summary["registered_end"]
    )

    active_sy = target_sy or SchoolYear.objects.filter(is_active=True).first()
    resolved_sy = (
        active_sy.name
        if active_sy
        else (str(school_year).strip() or f"{year}-{year + 1}")
    )

    return {
        **get_school_metadata(request),
        "school_year": resolved_sy,
        "month": clean_month,
        "year": year,
        "grade_groups": grade_groups,
        "non_graded_summary": None,
        "total_summary": total_summary,
    }
