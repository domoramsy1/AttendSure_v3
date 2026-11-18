"""
AttendSure - School Form 2 (SF2) Database-Driven Daily Attendance Service
File: backend/apps/academics/services/sf2_service.py
"""

import calendar
from datetime import date, timedelta
from apps.academics.models import (
    DailyAttendanceSummary,
    SubjectAttendanceLog,
    Enrollment,
    Section,
)
from apps.api.views.common import get_school_metadata, format_full_student_name

MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]


def make_metric(m=0, f=0):
    return {"m": m, "f": f, "total": m + f}


def count_consecutive_absences(att_map: dict, school_day_numbers: list[int], threshold: int = 5) -> bool:
    streak = 0
    for day_num in school_day_numbers:
        val = att_map.get(day_num, '')
        if val in ('absent', 'x', 'a'):
            streak += 1
            if streak >= threshold:
                return True
        else:
            streak = 0
    return False


def generate_sf2_data(section_id, month_name='October', year=2026):
    section = (
        Section.objects.select_related('grade_level', 'academic_year', 'adviser')
        .filter(id=section_id)
        .first()
    )
    if not section:
        raise ValueError(f"Section with ID {section_id} does not exist.")

    year = int(year)
    month_name = str(month_name).capitalize()
    month_num = MONTH_NAMES.index(month_name) + 1 if month_name in MONTH_NAMES else 10
    _, num_days = calendar.monthrange(year, month_num)
    month_start = date(year, month_num, 1)
    month_end = date(year, month_num, num_days)

    day_abbrs = {0: 'M', 1: 'T', 2: 'W', 3: 'TH', 4: 'F'}
    school_days = []
    school_day_numbers = []
    for d in range(1, num_days + 1):
        dt = date(year, month_num, d)
        if dt.weekday() < 5:
            school_day_numbers.append(d)
            school_days.append({
                "dateNumber": d,
                "dayOfWeek": day_abbrs[dt.weekday()],
                "fullDate": dt.strftime('%Y-%m-%d')
            })

    enrollments = list(
        Enrollment.objects.filter(section=section, student__is_active=True)
        .select_related('student')
        .order_by('student__last_name', 'student__first_name')
    )
    students = [e.student for e in enrollments if e.student]
    student_ids = [s.id for s in students]

    records_by_student = {}
    if student_ids:
        for ds in DailyAttendanceSummary.objects.filter(
            section=section,
            student_id__in=student_ids,
            attendance_date__gte=month_start,
            attendance_date__lte=month_end
        ).values('student_id', 'attendance_date', 'status'):
            records_by_student.setdefault(ds['student_id'], {})[ds['attendance_date'].day] = str(ds['status'] or 'PRESENT').lower().strip()

        # Fill any un-summarized classroom subject attendance days directly from SubjectAttendanceLog
        for sl in SubjectAttendanceLog.objects.filter(
            student_id__in=student_ids,
            attendance_date__gte=month_start,
            attendance_date__lte=month_end,
            status__in=['PRESENT', 'LATE', 'CUTTING', 'ABSENT', 'EXCUSED']
        ).values('student_id', 'attendance_date', 'status'):
            records_by_student.setdefault(sl['student_id'], {}).setdefault(
                sl['attendance_date'].day,
                str(sl['status']).lower().strip()
            )

    def build_learner_record(enr):
        st = enr.student
        is_male = str(st.sex or '').strip().upper().startswith('M')
        att_map = records_by_student.get(st.id, {})
        total_absent = sum(1 for v in att_map.values() if v in ('absent', 'x', 'a'))
        total_tardy = sum(1 for v in att_map.values() if v in ('tardy', 'late', 't'))

        return {
            "id": st.id,
            "lrn": str(st.lrn or ''),
            "name": format_full_student_name(st),
            "sex": 'M' if is_male else 'F',
            "attendance": att_map,
            "total_absent": total_absent,
            "total_tardy": total_tardy,
            "remarks": str(enr.remarks or '')
        }

    males_list, females_list = [], []
    consec_5_m, consec_5_f = 0, 0

    for e in enrollments:
        if not e.student:
            continue
        is_male = str(e.student.sex or '').strip().upper().startswith('M')
        rec = build_learner_record(e)
        if is_male:
            males_list.append(rec)
            if count_consecutive_absences(rec["attendance"], school_day_numbers):
                consec_5_m += 1
        else:
            females_list.append(rec)
            if count_consecutive_absences(rec["attendance"], school_day_numbers):
                consec_5_f += 1

    total_m = len(males_list)
    total_f = len(females_list)
    total_registered = total_m + total_f

    ay = section.academic_year
    if ay and ay.first_friday_june:
        first_friday_june = ay.first_friday_june
    else:
        june_1 = date(year, 6, 1)
        first_friday_june = june_1 + timedelta(days=(4 - june_1.weekday()) % 7)

    enrolled_june_m = enrolled_june_f = 0
    late_m = late_f = 0
    drop_m = drop_f = 0
    tout_m = tout_f = 0
    tin_m = tin_f = 0

    for e in enrollments:
        is_m = str(e.student.sex or '').strip().upper().startswith('M')
        enr_date = e.enrollment_date or month_start
        status_val = str(e.status or '').upper()

        if enr_date <= first_friday_june:
            if is_m: enrolled_june_m += 1
            else: enrolled_june_f += 1
        else:
            if is_m: late_m += 1
            else: late_f += 1

        if status_val == 'DROPPED':
            if is_m: drop_m += 1
            else: drop_f += 1
        elif status_val == 'TRANSFERRED_OUT':
            if is_m: tout_m += 1
            else: tout_f += 1
        elif status_val == 'TRANSFERRED_IN':
            if is_m: tin_m += 1
            else: tin_f += 1

    num_school_days = len(school_days) or 1
    male_present_count = sum(
        1 for m in males_list for st_val in m["attendance"].values()
        if st_val in ('present', 'tardy', 'late', 'cutting', 'excused')
    )
    female_present_count = sum(
        1 for f in females_list for st_val in f["attendance"].values()
        if st_val in ('present', 'tardy', 'late', 'cutting', 'excused')
    )

    avg_daily_m = male_present_count / num_school_days
    avg_daily_f = female_present_count / num_school_days
    avg_daily_total = avg_daily_m + avg_daily_f

    pct_att_m = round((avg_daily_m / total_m * 100), 1) if total_m > 0 else 0.0
    pct_att_f = round((avg_daily_f / total_f * 100), 1) if total_f > 0 else 0.0
    pct_att_total = round((avg_daily_total / total_registered * 100), 1) if total_registered > 0 else 0.0

    total_june = enrolled_june_m + enrolled_june_f
    pct_enr_m = round((total_m / enrolled_june_m * 100), 1) if enrolled_june_m > 0 else 0.0
    pct_enr_f = round((total_f / enrolled_june_f * 100), 1) if enrolled_june_f > 0 else 0.0
    pct_enr_total = round((total_registered / total_june * 100), 1) if total_june > 0 else 0.0

    metrics = {
        "enrolment_june": make_metric(enrolled_june_m, enrolled_june_f),
        "late_enrolment": make_metric(late_m, late_f),
        "registered_end": make_metric(total_m, total_f),
        "percentage_enrolment": {"m": pct_enr_m, "f": pct_enr_f, "total": pct_enr_total},
        "average_daily_attendance": {"m": round(avg_daily_m, 1), "f": round(avg_daily_f, 1), "total": round(avg_daily_total, 1)},
        "percentage_attendance": {"m": pct_att_m, "f": pct_att_f, "total": pct_att_total},
        "consecutive_5_absent_count": make_metric(consec_5_m, consec_5_f),
        "drop_out": make_metric(drop_m, drop_f),
        "transferred_out": make_metric(tout_m, tout_f),
        "transferred_in": make_metric(tin_m, tin_f),
    }

    return {
        **get_school_metadata(),
        "academic_year": str(section.academic_year.code if section.academic_year else ''),
        "grade_level": str(section.grade_level.name if section.grade_level else ''),
        "section_name": section.name,
        "month": month_name,
        "year": year,
        "adviser_name": section.adviser.full_name if section.adviser else "",
        "school_days": school_days,
        "has_enrolled_students": total_registered > 0,
        "males": males_list,
        "females": females_list,
        "metrics": metrics,
    }