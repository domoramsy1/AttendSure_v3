import calendar
from datetime import date, timedelta
from common.exceptions import AppError
from apps.attendance.models import ClassAttendance, DailyAttendance
from apps.school.models import SchoolHoliday, Section
from apps.school.selectors import get_school_metadata
from apps.students.models import Enrollment

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


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


def generate_sf2_report(*, section_id: int, month_name: str = "October", year: int = 2026, request=None) -> dict:
    section = Section.objects.select_related("grade_level", "school_year", "adviser").filter(id=section_id).first()
    if not section:
        raise AppError("SECTION_NOT_FOUND", f"Section {section_id} not found.", 404)

    year = int(year)
    clean_month = str(month_name).capitalize()
    month_num = MONTH_NAMES.index(clean_month) + 1 if clean_month in MONTH_NAMES else 10
    _, num_days = calendar.monthrange(year, month_num)
    month_start, month_end = date(year, month_num, 1), date(year, month_num, num_days)

    holiday_dates = set(
        SchoolHoliday.objects.filter(holiday_date__range=(month_start, month_end)).values_list("holiday_date", flat=True)
    )
    abbr = {0: "M", 1: "T", 2: "W", 3: "TH", 4: "F"}
    school_days, day_nums = [], []
    for d in range(1, num_days + 1):
        dt = date(year, month_num, d)
        if dt.weekday() < 5 and dt not in holiday_dates:
            day_nums.append(d)
            school_days.append({"dateNumber": d, "dayOfWeek": abbr[dt.weekday()], "fullDate": str(dt)})

    enrollments = list(
        Enrollment.objects.filter(section=section, student__is_active=True)
        .select_related("student")
        .order_by("student__last_name", "student__first_name")
    )
    student_ids = [e.student_id for e in enrollments]

    records_by_st: dict[int, dict[int, str]] = {}
    for row in DailyAttendance.objects.filter(
        section=section, student_id__in=student_ids, attendance_date__range=(month_start, month_end)
    ).values("student_id", "attendance_date", "status"):
        records_by_st.setdefault(row["student_id"], {})[row["attendance_date"].day] = row["status"].lower()

    for row in ClassAttendance.objects.filter(
        student_id__in=student_ids, attendance_date__range=(month_start, month_end)
    ).values("student_id", "attendance_date", "status"):
        records_by_st.setdefault(row["student_id"], {}).setdefault(row["attendance_date"].day, row["status"].lower())

    june_1 = date(year, 6, 1)
    cutoff = (
        section.school_year.baseline_cutoff_date
        if (section.school_year and section.school_year.baseline_cutoff_date)
        else (june_1 + timedelta(days=(4 - june_1.weekday()) % 7))
    )

    males, females = [], []
    consec_m = consec_f = 0
    june_m = june_f = late_m = late_f = 0
    drop_m = drop_f = tout_m = tout_f = tin_m = tin_f = 0

    for enr in enrollments:
        st = enr.student
        is_m = str(st.sex or "").upper().startswith("M")
        att = records_by_st.get(st.id, {})
        rec = {
            "id": st.id,
            "lrn": st.lrn,
            "name": st.full_name,
            "sex": "M" if is_m else "F",
            "attendance": att,
            "total_absent": sum(1 for v in att.values() if v in ("absent", "x", "a")),
            "total_tardy": sum(1 for v in att.values() if v in ("late", "tardy", "t")),
            "remarks": enr.remarks,
        }
        if is_m:
            males.append(rec)
            consec_m += int(has_five_consecutive_absences(att, day_nums))
        else:
            females.append(rec)
            consec_f += int(has_five_consecutive_absences(att, day_nums))

        enr_date = enr.enrollment_date or month_start
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

        st_code = str(enr.status or "").upper()
        if st_code == "DROPPED":
            if is_m:
                drop_m += 1
            else:
                drop_f += 1
        elif st_code == "TRANSFERRED_OUT":
            if is_m:
                tout_m += 1
            else:
                tout_f += 1
        elif st_code == "TRANSFERRED_IN":
            if is_m:
                tin_m += 1
            else:
                tin_f += 1

    n_days = len(school_days) or 1
    present_vals = {"present", "late", "tardy", "cutting", "excused"}
    ada_m = round(sum(1 for m in males for v in m["attendance"].values() if v in present_vals) / n_days, 1)
    ada_f = round(sum(1 for f in females for v in f["attendance"].values() if v in present_vals) / n_days, 1)
    ada_tot = round(ada_m + ada_f, 1)

    tot_m, tot_f = len(males), len(females)
    tot_all = tot_m + tot_f
    tot_june = june_m + june_f

    return {
        **get_school_metadata(request),
        "academic_year": section.school_year.code if section.school_year else "",
        "grade_level": section.grade_level.name if section.grade_level else "",
        "section_name": section.name,
        "month": clean_month,
        "year": year,
        "adviser_name": section.adviser.full_name if section.adviser else "",
        "school_days": school_days,
        "has_enrolled_students": tot_all > 0,
        "males": males,
        "females": females,
        "metrics": {
            "enrolment_june": make_metric(june_m, june_f),
            "late_enrolment": make_metric(late_m, late_f),
            "registered_end": make_metric(tot_m, tot_f),
            "percentage_enrolment": {
                "m": round((tot_m / june_m) * 100, 1) if june_m else 0.0,
                "f": round((tot_f / june_f) * 100, 1) if june_f else 0.0,
                "total": round((tot_all / tot_june) * 100, 1) if tot_june else 0.0,
            },
            "average_daily_attendance": {"m": ada_m, "f": ada_f, "total": ada_tot},
            "percentage_attendance": {
                "m": round((ada_m / tot_m) * 100, 1) if tot_m else 0.0,
                "f": round((ada_f / tot_f) * 100, 1) if tot_f else 0.0,
                "total": round((ada_tot / tot_all) * 100, 1) if tot_all else 0.0,
            },
            "consecutive_5_absent_count": make_metric(consec_m, consec_f),
            "drop_out": make_metric(drop_m, drop_f),
            "transferred_out": make_metric(tout_m, tout_f),
            "transferred_in": make_metric(tin_m, tin_f),
        },
    }