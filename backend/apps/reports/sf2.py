import calendar
from datetime import date, datetime, timedelta

from apps.attendance.models import ClassAttendance, DailyAttendance
from apps.school.models import SchoolHoliday, Section
from apps.school.selectors import get_school_metadata
from apps.students.models import Enrollment
from common.exceptions import AppError

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
MONTH_ABBR = {name[:3].lower(): idx + 1 for idx, name in enumerate(MONTH_NAMES)}


def resolve_month(raw_month) -> tuple[int, str]:
    clean = str(raw_month or "").strip()
    if not clean:
        return 10, "October"
    if clean.isdigit():
        num = int(clean)
        if 1 <= num <= 12:
            return num, MONTH_NAMES[num - 1]
        raise AppError("INVALID_MONTH", "Month must be between 1 and 12.", 400)
    cap = clean.capitalize()
    if cap in MONTH_NAMES:
        return MONTH_NAMES.index(cap) + 1, cap
    abbr_num = MONTH_ABBR.get(clean[:3].lower())
    if abbr_num:
        return abbr_num, MONTH_NAMES[abbr_num - 1]
    raise AppError("INVALID_MONTH", f"Invalid month '{raw_month}'.", 400)


def _as_date(val) -> date | None:
    if isinstance(val, datetime):
        return val.date()
    return val


def make_metric(m=0, f=0) -> dict:
    return {"m": m, "f": f, "total": m + f}


def has_five_consecutive_absences(att_map: dict, school_day_nums: list[int]) -> bool:
    streak = 0
    for d in school_day_nums:
        if att_map.get(d, "") in ("absent", "x", "a"):
            streak += 1
            if streak >= 5:
                return True
        else:
            streak = 0
    return False


def generate_sf2_report(
    *, section_id: int, month_name: str = "October", year: int = 2026, request=None
) -> dict:
    section = (
        Section.objects.select_related(
            "grade_level", "school_year", "adviser", "adviser__user"
        )
        .filter(id=section_id)
        .first()
    )
    if not section:
        raise AppError("SECTION_NOT_FOUND", f"Section {section_id} not found.", 404)

    year = int(year)
    if not (1900 <= year <= 2100):
        raise AppError("INVALID_YEAR", "Year must be between 1900 and 2100.", 400)
    month_num, clean_month = resolve_month(month_name)
    _, num_days = calendar.monthrange(year, month_num)
    month_start, month_end = date(year, month_num, 1), date(year, month_num, num_days)

    holiday_dates = set(
        SchoolHoliday.objects.filter(
            holiday_date__range=(month_start, month_end)
        ).values_list("holiday_date", flat=True)
    )
    abbr = {0: "M", 1: "T", 2: "W", 3: "TH", 4: "F"}
    school_days, day_nums = [], []
    for d in range(1, num_days + 1):
        dt = date(year, month_num, d)
        if dt.weekday() < 5 and dt not in holiday_dates:
            day_nums.append(d)
            school_days.append(
                {"dateNumber": d, "dayOfWeek": abbr[dt.weekday()], "fullDate": str(dt)}
            )
    school_day_set = set(day_nums)

    enrollments = list(
        Enrollment.objects.filter(section=section, student__is_active=True)
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    )
    enrollment_ids = [e.id for e in enrollments]

    records_by_enr: dict[int, dict[int, str]] = {}
    if enrollment_ids:
        for row in DailyAttendance.objects.filter(
            enrollment_id__in=enrollment_ids,
            attendance_date__range=(month_start, month_end),
        ).values("enrollment_id", "attendance_date", "status"):
            day_val = row["attendance_date"].day
            if day_val in school_day_set:
                records_by_enr.setdefault(row["enrollment_id"], {})[day_val] = row[
                    "status"
                ].lower()

        for row in (
            ClassAttendance.objects.filter(
                class_period__section=section,
                enrollment_id__in=enrollment_ids,
                attendance_date__range=(month_start, month_end),
            )
            .order_by("scanned_at")
            .values("enrollment_id", "attendance_date", "status")
        ):
            day_val = row["attendance_date"].day
            if day_val in school_day_set:
                records_by_enr.setdefault(row["enrollment_id"], {}).setdefault(
                    day_val, row["status"].lower()
                )

    sy = section.school_year
    sy_start_year = year
    if sy and sy.name and "-" in sy.name and sy.name.split("-")[0].isdigit():
        sy_start_year = int(sy.name.split("-")[0])
    elif sy and sy.start_date:
        sy_start_year = sy.start_date.year
    june_1 = date(sy_start_year, 6, 1)
    cutoff = (
        sy.baseline_cutoff_date
        if (sy and sy.baseline_cutoff_date)
        else (june_1 + timedelta(days=(4 - june_1.weekday()) % 7))
    )

    males, females = [], []
    reg_m = reg_f = 0
    consec_m = consec_f = 0
    june_m = june_f = late_m = late_f = 0
    drop_m = drop_f = tout_m = tout_f = tin_m = tin_f = 0

    for enr in enrollments:
        st = enr.student
        is_m = str(st.gender or "").upper().startswith("M")
        enr_date = _as_date(enr.enrolled_date) or month_start
        exit_dt = _as_date(enr.status_date)
        st_code = str(enr.status or "").upper()

        if enr_date > month_end:
            continue
        if st_code in ("DROPPED", "TRANSFERRED_OUT") and exit_dt and exit_dt < month_start:
            continue

        att = {
            d: v
            for d, v in records_by_enr.get(enr.id, {}).items()
            if d in school_day_set
        }
        rec = {
            "id": st.id,
            "lrn": st.lrn,
            "name": st.full_name,
            "sex": "M" if is_m else "F",
            "attendance": att,
            "total_absent": sum(
                1 for d in day_nums if att.get(d, "") in ("absent", "x", "a")
            ),
            "total_tardy": sum(
                1 for d in day_nums if att.get(d, "") in ("late", "tardy", "t")
            ),
            "remarks": enr.remarks,
        }
        if is_m:
            males.append(rec)
            consec_m += int(has_five_consecutive_absences(att, day_nums))
        else:
            females.append(rec)
            consec_f += int(has_five_consecutive_absences(att, day_nums))

        if enr_date <= cutoff:
            if is_m:
                june_m += 1
            else:
                june_f += 1
        else:
            if is_m:
                late_m += 1
            else:
                late_f += 1

        exited_this_month = False
        if st_code == "DROPPED" and (
            not exit_dt or (month_start <= exit_dt <= month_end)
        ):
            exited_this_month = True
            if is_m:
                drop_m += 1
            else:
                drop_f += 1
        elif st_code == "TRANSFERRED_OUT" and (
            not exit_dt or (month_start <= exit_dt <= month_end)
        ):
            exited_this_month = True
            if is_m:
                tout_m += 1
            else:
                tout_f += 1
        elif st_code == "TRANSFERRED_IN" and (month_start <= enr_date <= month_end):
            if is_m:
                tin_m += 1
            else:
                tin_f += 1

        if not exited_this_month:
            if is_m:
                reg_m += 1
            else:
                reg_f += 1

    n_days = len(school_days) or 1
    present_vals = {"present", "late", "tardy", "excused"}
    ada_m = round(
        sum(
            1
            for m in males
            for d in day_nums
            if m["attendance"].get(d, "") in present_vals
        )
        / n_days,
        1,
    )
    ada_f = round(
        sum(
            1
            for f in females
            for d in day_nums
            if f["attendance"].get(d, "") in present_vals
        )
        / n_days,
        1,
    )
    ada_tot = round(ada_m + ada_f, 1)

    reg_all = reg_m + reg_f
    tot_june = june_m + june_f

    return {
        **get_school_metadata(request),
        "academic_year": section.school_year.name if section.school_year else "",
        "grade_level": section.grade_level.name if section.grade_level else "",
        "section_name": section.name,
        "month": clean_month,
        "year": year,
        "adviser_name": section.adviser.full_name if section.adviser else "",
        "school_days": school_days,
        "has_enrolled_students": len(males) + len(females) > 0,
        "males": males,
        "females": females,
        "metrics": {
            "enrolment_june": make_metric(june_m, june_f),
            "late_enrolment": make_metric(late_m, late_f),
            "registered_end": make_metric(reg_m, reg_f),
            "percentage_enrolment": {
                "m": round((reg_m / june_m) * 100, 1) if june_m else 0.0,
                "f": round((reg_f / june_f) * 100, 1) if june_f else 0.0,
                "total": round((reg_all / tot_june) * 100, 1) if tot_june else 0.0,
            },
            "average_daily_attendance": {"m": ada_m, "f": ada_f, "total": ada_tot},
            "percentage_attendance": {
                "m": round((ada_m / reg_m) * 100, 1) if reg_m else 0.0,
                "f": round((ada_f / reg_f) * 100, 1) if reg_f else 0.0,
                "total": round((ada_tot / reg_all) * 100, 1) if reg_all else 0.0,
            },
            "consecutive_5_absent_count": make_metric(consec_m, consec_f),
            "consecutive_5": make_metric(consec_m, consec_f),
            "drop_out": make_metric(drop_m, drop_f),
            "transferred_out": make_metric(tout_m, tout_f),
            "transferred_in": make_metric(tin_m, tin_f),
        },
    }
