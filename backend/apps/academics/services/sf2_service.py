# backend/apps/academics/services/sf2_service.py

import calendar
from datetime import date
from apps.academics.models import (
    DailyAttendanceSummary,
    Enrollment,
    Section,
    StudentGateLog,
)
from apps.api.views.common import get_school_metadata

MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]


def make_metric(m=0, f=0):
    return {"m": m, "f": f, "total": m + f}


def generate_sf2_data(section_id, month_name='October', year=2026):
    """
    Consolidates daily attendance records and official DepEd compliance metrics.
    """
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

    # 1. School Days (Monday-Friday)
    day_abbrs = {0: 'M', 1: 'T', 2: 'W', 3: 'TH', 4: 'F'}
    school_days = []
    for d in range(1, num_days + 1):
        dt = date(year, month_num, d)
        if dt.weekday() < 5:
            school_days.append({
                "dateNumber": d,
                "dayOfWeek": day_abbrs[dt.weekday()],
                "fullDate": dt.strftime('%Y-%m-%d')
            })

    # 2. Fast Query via Enrollment with select_related
    enrollments_qs = (
        Enrollment.objects.filter(section=section)
        .select_related('student')
        .order_by('student__last_name', 'student__first_name')
    )
    enrollments = list(enrollments_qs)
    students = [e.student for e in enrollments if getattr(e, 'student', None)]

    # 3. Pull Attendance Summaries
    daily_summaries = DailyAttendanceSummary.objects.filter(
        section=section,
        attendance_date__gte=month_start,
        attendance_date__lte=month_end
    )
    records_by_student = {}
    for ds in daily_summaries:
        s_id = ds.student_id
        if s_id not in records_by_student:
            records_by_student[s_id] = {}
        records_by_student[s_id][ds.attendance_date.day] = str(ds.status or 'PRESENT').lower().strip()

    # Cross-reference gate taps
    if students:
        gate_logs = StudentGateLog.objects.filter(
            student__in=students,
            direction='IN',
            scan_time__date__gte=month_start,
            scan_time__date__lte=month_end
        ).values('student_id', 'scan_time__date')

        for gl in gate_logs:
            s_id = gl['student_id']
            day_num = gl['scan_time__date'].day
            if s_id not in records_by_student:
                records_by_student[s_id] = {}
            if day_num not in records_by_student[s_id]:
                records_by_student[s_id][day_num] = 'present'

    # 4. Build Learner Rows
    def build_learner_record(enr):
        st = enr.student
        raw_sex = str(getattr(st, 'sex', '') or '').strip().upper()
        is_male = raw_sex.startswith('M')

        att_map = records_by_student.get(st.id, {})
        total_absent = sum(1 for v in att_map.values() if v in ['absent', 'x', '1', 'a'])
        total_tardy = sum(1 for v in att_map.values() if v in ['tardy', 'late', '2', 't'])

        middle = f" {st.middle_name}" if getattr(st, 'middle_name', '') else ""
        suffix = f" {st.suffix}" if getattr(st, 'suffix', '') else ""
        full_name = f"{st.last_name}, {st.first_name}{middle}{suffix}".strip()

        return {
            "id": st.id,
            "lrn": str(getattr(st, 'lrn', '') or ''),
            "name": full_name,
            "sex": 'M' if is_male else 'F',
            "attendance": att_map,
            "total_absent": total_absent,
            "total_tardy": total_tardy,
            "remarks": str(getattr(enr, 'remarks', '') or getattr(st, 'remarks', '') or '')
        }

    males_list = []
    females_list = []

    for e in enrollments:
        if not e.student:
            continue
        raw_sex = str(getattr(e.student, 'sex', '') or '').strip().upper()
        rec = build_learner_record(e)
        if raw_sex.startswith('M'):
            males_list.append(rec)
        else:
            females_list.append(rec)

    total_m = len(males_list)
    total_f = len(females_list)
    total_registered = total_m + total_f

    # 5. Baseline Enrollment & Movement Calculations
    first_friday_june = date(year, 6, 5)
    enrolled_june_m, enrolled_june_f = 0, 0
    late_m, late_f = 0, 0
    drop_m, drop_f = 0, 0
    tout_m, tout_f = 0, 0
    tin_m, tin_f = 0, 0

    for e in enrollments:
        raw_sex = str(getattr(e.student, 'sex', '') or '').strip().upper()
        is_m = raw_sex.startswith('M')
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

    # 6. Compute Average Daily Attendance
    num_school_days = len(school_days) or 1
    male_present_count = sum(
        1 for m in males_list for status in m["attendance"].values()
        if status in ['present', 'tardy', 'cutting', '0', '']
    )
    female_present_count = sum(
        1 for f in females_list for status in f["attendance"].values()
        if status in ['present', 'tardy', 'cutting', '0', '']
    )

    avg_daily_m = (male_present_count / num_school_days)
    avg_daily_f = (female_present_count / num_school_days)
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
        "consecutive_5_absent_count": make_metric(0, 0),
        "drop_out": make_metric(drop_m, drop_f),
        "transferred_out": make_metric(tout_m, tout_f),
        "transferred_in": make_metric(tin_m, tin_f),
    }

    adviser_name = section.adviser.full_name if section.adviser else ""

    return {
        **get_school_metadata(),
        "academic_year": str(section.academic_year.code if section.academic_year else ''),
        "grade_level": str(section.grade_level.name if section.grade_level else ''),
        "section_name": section.name,
        "month": month_name,
        "year": year,
        "adviser_name": adviser_name,
        "school_days": school_days,
        "has_enrolled_students": total_registered > 0,
        "males": males_list,
        "females": females_list,
        "metrics": metrics
    }