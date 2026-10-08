import calendar
from datetime import date, datetime
from django.apps import apps
from django.db.models import Q
from apps.academics.models import Section, Student

# Locate Attendance Model dynamically
AttendanceModel = None
for app_label in ['attendance', 'academics', 'core']:
    for model_name in ['AttendanceRecord', 'DailyAttendance', 'GateLog']:
        try:
            AttendanceModel = apps.get_model(app_label, model_name)
            if AttendanceModel:
                break
        except LookupError:
            continue
    if AttendanceModel:
        break

# Locate School Profile dynamically
SchoolModel = None
for app_label in ['settings', 'academics', 'core', 'administration']:
    for model_name in ['SchoolProfile', 'SchoolSetting', 'SchoolInformation', 'School']:
        try:
            SchoolModel = apps.get_model(app_label, model_name)
            if SchoolModel:
                break
        except LookupError:
            continue
    if SchoolModel:
        break

MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]


def make_metric(m=0, f=0):
    return {"m": m, "f": f, "total": m + f}


def get_school_metadata():
    school = SchoolModel.objects.first() if SchoolModel else None
    if not school:
        return {
            "school_id": "",
            "school_name": "",
            "division": "",
            "district": "",
            "school_head": "",
            "left_logo": None,
            "right_logo": None,
        }

    return {
        "school_id": str(getattr(school, 'school_id', '') or getattr(school, 'deped_id', '') or getattr(school, 'code', '') or ''),
        "school_name": str(getattr(school, 'school_name', '') or getattr(school, 'name', '') or ''),
        "division": str(getattr(school, 'division', '') or ''),
        "district": str(getattr(school, 'district', '') or ''),
        "school_head": str(
            getattr(school, 'school_head', '') or 
            getattr(school, 'principal_name', '') or 
            getattr(school, 'head_faculty', '') or ''
        ),
        "left_logo": getattr(school, 'left_logo', None) and getattr(school.left_logo, 'url', None),
        "right_logo": getattr(school, 'right_logo', None) and getattr(school.right_logo, 'url', None),
    }


def generate_sf2_data(section_id, month_name='October', year=2026):
    """
    Consolidates daily attendance and metrics for a single section
    directly from database records.
    """
    section = Section.objects.filter(id=section_id).first()
    if not section:
        raise ValueError(f"Section with ID {section_id} does not exist.")

    year = int(year)
    month_name = str(month_name).capitalize()
    month_num = MONTH_NAMES.index(month_name) + 1 if month_name in MONTH_NAMES else 10
    _, num_days = calendar.monthrange(year, month_num)
    month_start = date(year, month_num, 1)
    month_end = date(year, month_num, num_days)

    # 1. School Days (Monday-Friday in that specific month)
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

    # 2. Students in Section
    students_qs = Student.objects.filter(section=section).order_by('last_name', 'first_name')
    male_filter = Q(sex__iexact='M') | Q(gender__iexact='M') | Q(sex__iexact='Male')
    female_filter = Q(sex__iexact='F') | Q(gender__iexact='F') | Q(sex__iexact='Female')

    males_qs = students_qs.filter(male_filter)
    females_qs = students_qs.filter(female_filter)

    # 3. Pull Actual Attendance Records
    date_field = 'date' if hasattr(AttendanceModel, 'date') else 'timestamp__date'
    records_by_student = {}

    if AttendanceModel:
        records = AttendanceModel.objects.filter(
            student__in=students_qs,
            **{f"{date_field}__gte": month_start, f"{date_field}__lte": month_end}
        )
        for r in records:
            s_id = r.student_id
            if s_id not in records_by_student:
                records_by_student[s_id] = {}
            r_date = getattr(r, 'date', None) or getattr(r, 'timestamp').date()
            status_val = str(getattr(r, 'status', 'present')).lower().strip()
            records_by_student[s_id][r_date.day] = status_val

    def build_learner_record(st, is_male):
        att_map = records_by_student.get(st.id, {})
        total_absent = sum(1 for v in att_map.values() if v in ['absent', 'x', '1', 'a'])
        total_tardy = sum(1 for v in att_map.values() if v in ['tardy', 'late', '2', 't'])

        middle = f" {st.middle_name}" if getattr(st, 'middle_name', '') else ""
        full_name = f"{st.last_name}, {st.first_name}{middle}".strip()

        return {
            "id": st.id,
            "lrn": str(getattr(st, 'lrn', '') or ''),
            "name": full_name,
            "sex": 'M' if is_male else 'F',
            "attendance": att_map,
            "total_absent": total_absent,
            "total_tardy": total_tardy,
            "remarks": str(getattr(st, 'remarks', '') or '')
        }

    males_list = [build_learner_record(m, True) for m in males_qs]
    females_list = [build_learner_record(f, False) for f in females_qs]

    total_m = len(males_list)
    total_f = len(females_list)
    total_registered = total_m + total_f

    # 4. Actual Enrolment 1st Friday of June and Movement Counts
    # Enrolment as of 1st Friday of June (learners enrolled on or prior to June)
    first_friday_june = date(year, 6, 5)  # dynamic threshold
    enrolled_june_m = males_qs.filter(Q(date_enrolled__lte=first_friday_june) | Q(date_enrolled__isnull=True)).count()
    enrolled_june_f = females_qs.filter(Q(date_enrolled__lte=first_friday_june) | Q(date_enrolled__isnull=True)).count()

    late_m = males_qs.filter(date_enrolled__gt=first_friday_june, date_enrolled__lte=month_end).count()
    late_f = females_qs.filter(date_enrolled__gt=first_friday_june, date_enrolled__lte=month_end).count()

    drop_m = males_qs.filter(Q(status__iexact='DROPPED') | Q(remarks__icontains='DRP'), date_dropped__gte=month_start, date_dropped__lte=month_end).count()
    drop_f = females_qs.filter(Q(status__iexact='DROPPED') | Q(remarks__icontains='DRP'), date_dropped__gte=month_start, date_dropped__lte=month_end).count()

    tout_m = males_qs.filter(Q(status__iexact='TRANSFERRED_OUT') | Q(remarks__icontains='T/O'), date_transferred__gte=month_start, date_transferred__lte=month_end).count()
    tout_f = females_qs.filter(Q(status__iexact='TRANSFERRED_OUT') | Q(remarks__icontains='T/O'), date_transferred__gte=month_start, date_transferred__lte=month_end).count()

    tin_m = males_qs.filter(Q(status__iexact='TRANSFERRED_IN') | Q(remarks__icontains='T/I'), date_enrolled__gte=month_start, date_enrolled__lte=month_end).count()
    tin_f = females_qs.filter(Q(status__iexact='TRANSFERRED_IN') | Q(remarks__icontains='T/I'), date_enrolled__gte=month_start, date_enrolled__lte=month_end).count()

    # Average Daily Attendance calculation from verified present records
    num_school_days = len(school_days)
    male_present_count = sum(
        1 for m in males_list for status in m["attendance"].values()
        if status in ['present', 'tardy', 'cutting', '0', '']
    )
    female_present_count = sum(
        1 for f in females_list for status in f["attendance"].values()
        if status in ['present', 'tardy', 'cutting', '0', '']
    )

    avg_daily_m = (male_present_count / num_school_days) if num_school_days > 0 else 0.0
    avg_daily_f = (female_present_count / num_school_days) if num_school_days > 0 else 0.0
    avg_daily_total = avg_daily_m + avg_daily_f

    # Percentage of Attendance: (Avg Daily Attendance / Registered End) * 100
    pct_att_m = round((avg_daily_m / total_m * 100), 1) if total_m > 0 else 0.0
    pct_att_f = round((avg_daily_f / total_f * 100), 1) if total_f > 0 else 0.0
    pct_att_total = round((avg_daily_total / total_registered * 100), 1) if total_registered > 0 else 0.0

    # Percentage of Enrolment: (Registered End of Month / Enrolment 1st Friday June) * 100
    pct_enr_m = round((total_m / enrolled_june_m * 100), 1) if enrolled_june_m > 0 else 0.0
    pct_enr_f = round((total_f / enrolled_june_f * 100), 1) if enrolled_june_f > 0 else 0.0
    total_june = enrolled_june_m + enrolled_june_f
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

    adviser_name = ""
    if hasattr(section, 'adviser') and section.adviser:
        if hasattr(section.adviser, 'get_full_name') and section.adviser.get_full_name():
            adviser_name = section.adviser.get_full_name()
        else:
            adviser_name = str(section.adviser)
    elif hasattr(section, 'adviser_name') and section.adviser_name:
        adviser_name = str(section.adviser_name)

    school_meta = get_school_metadata()

    return {
        **school_meta,
        "academic_year": str(getattr(section, 'academic_year', '') or ''),
        "grade_level": str(getattr(section, 'grade_level', '') or ''),
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