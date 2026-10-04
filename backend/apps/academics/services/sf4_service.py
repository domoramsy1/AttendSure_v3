import calendar
import logging
from datetime import date, datetime
from django.db.models import Q

from apps.academics.models import (
    AcademicYear,
    DailyAttendanceSummary,
    Enrollment,
    SchoolProfile,
    Section,
    StaffProfile,
    Student,
    StudentGateLog,
)

try:
    from apps.academics.models import GradeLevel
except ImportError:
    GradeLevel = None

logger = logging.getLogger(__name__)

MONTH_MAP = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
}


def make_triplet(m=0, f=0):
    return {
        "m": round(m, 1) if isinstance(m, float) else int(m),
        "f": round(f, 1) if isinstance(f, float) else int(f),
        "total": round(m + f, 1) if isinstance(m + f, float) else int(m + f)
    }


def add_triplets(t1, t2):
    return make_triplet(t1["m"] + t2["m"], t1["f"] + t2["f"])


def make_empty_section_record(sec_id, sec_name, grade_level, adviser_name=""):
    return {
        "section_id": sec_id,
        "section_name": sec_name,
        "grade_level": grade_level,
        "adviser_name": adviser_name,
        "registered_end": make_triplet(0, 0),
        "daily_average": make_triplet(0, 0),
        "attendance_percentage": make_triplet(0, 0),
        "dropped_out_prev": make_triplet(0, 0),
        "dropped_out_month": make_triplet(0, 0),
        "dropped_out_cumulative": make_triplet(0, 0),
        "transferred_out_prev": make_triplet(0, 0),
        "transferred_out_month": make_triplet(0, 0),
        "transferred_out_cumulative": make_triplet(0, 0),
        "transferred_in_prev": make_triplet(0, 0),
        "transferred_in_month": make_triplet(0, 0),
        "transferred_in_cumulative": make_triplet(0, 0),
    }


def resolve_logo(logo_val):
    if not logo_val:
        return None
    if isinstance(logo_val, str):
        return logo_val.strip() or None
    if hasattr(logo_val, 'url'):
        try:
            return logo_val.url
        except Exception:
            return str(logo_val).strip() or None
    return str(logo_val).strip() or None


def get_school_metadata():
    school = SchoolProfile.objects.first()

    school_id = str(getattr(school, 'school_id', '') or '').strip()
    school_name = str(getattr(school, 'school_name', '') or '').strip()
    region = str(getattr(school, 'region', '') or '').strip()
    division = str(getattr(school, 'division', '') or '').strip()
    district = str(getattr(school, 'district', '') or '').strip()

    school_head = ''
    if school:
        for attr in ['principal_name', 'school_head_name', 'principal', 'school_head']:
            val = getattr(school, attr, None)
            if val:
                if hasattr(val, 'get_full_name'):
                    school_head = val.get_full_name()
                elif hasattr(val, 'first_name') and hasattr(val, 'last_name'):
                    school_head = f"{val.first_name} {val.last_name}".strip()
                elif isinstance(val, str) and val.strip():
                    school_head = val.strip()
                if school_head:
                    break

    if not school_head:
        admin_staff = StaffProfile.objects.filter(
            Q(position__icontains='Principal') |
            Q(position__icontains='School Head') |
            Q(position__icontains='Head Teacher') |
            Q(position__icontains='Administrator')
        ).filter(is_active=True).first()

        if admin_staff:
            parts = [admin_staff.first_name]
            if admin_staff.middle_name:
                parts.append(admin_staff.middle_name)
            parts.append(admin_staff.last_name)
            school_head = " ".join(parts).strip()

    left_logo = resolve_logo(getattr(school, 'left_logo', None)) if school else None
    right_logo = resolve_logo(getattr(school, 'right_logo', None)) if school else None

    return {
        "school_id": school_id,
        "school_name": school_name,
        "region": region,
        "division": division,
        "district": district,
        "school_head": school_head.upper(),
        "left_logo": left_logo,
        "right_logo": right_logo,
    }


def generate_sf4_data(month_name="October", year=2026, school_year=""):
    month_num = MONTH_MAP.get(str(month_name).capitalize(), 10)
    year = int(year)
    num_calendar_days = calendar.monthrange(year, month_num)[1]
    start_month_date = date(year, month_num, 1)
    end_month_date = date(year, month_num, num_calendar_days)

    school_meta = get_school_metadata()

    school_days = [
        date(year, month_num, d)
        for d in range(1, num_calendar_days + 1)
        if date(year, month_num, d).weekday() < 5
    ]
    num_school_days = len(school_days) or 1

    # 1. Resolve Academic Year cleanly
    target_ay = None
    if school_year:
        if str(school_year).isdigit():
            target_ay = AcademicYear.objects.filter(id=int(school_year)).first()
        else:
            target_ay = AcademicYear.objects.filter(code__iexact=str(school_year).strip()).first()

    # 2. Query Sections
    sections_qs = Section.objects.select_related('grade_level', 'academic_year', 'adviser').all()
    if target_ay:
        sections_qs = sections_qs.filter(Q(academic_year=target_ay) | Q(academic_year__isnull=True))
    elif school_year:
        sections_qs = sections_qs.filter(
            Q(academic_year__code__iexact=str(school_year).strip()) | Q(academic_year__isnull=True)
        )

    try:
        sections_qs = sections_qs.order_by('grade_level__level_order', 'name')
    except Exception:
        sections_qs = sections_qs.order_by('name')

    # 3. Determine all active Grade Levels to populate full DepEd school coverage
    registered_grades = []
    if GradeLevel:
        try:
            registered_grades = list(GradeLevel.objects.all().order_by('level_order').values_list('name', flat=True))
        except Exception:
            registered_grades = []

    if not registered_grades:
        found_grades = sections_qs.values_list('grade_level__name', flat=True).distinct()
        registered_grades = [g for g in found_grades if g]

    grade_groups_dict = {g: [] for g in registered_grades}
    non_graded_sections = []

    for sec in sections_qs:
        grade = ""
        if getattr(sec, 'grade_level', None):
            grade = sec.grade_level.name if hasattr(sec.grade_level, 'name') else str(sec.grade_level)
        grade = str(grade).strip()

        is_non_graded = not grade or "NON-GRADED" in grade.upper()

        adviser_name = ""
        if getattr(sec, 'adviser', None):
            adviser_name = f"{sec.adviser.first_name} {sec.adviser.last_name}".strip()
        elif getattr(sec, 'adviser_name', None):
            adviser_name = str(sec.adviser_name).strip()
        else:
            adviser_name = "Unassigned"

        enr_qs = Enrollment.objects.filter(section=sec).select_related('student')
        if target_ay:
            enr_qs = enr_qs.filter(Q(academic_year=target_ay) | Q(academic_year__isnull=True))
        elif school_year:
            enr_qs = enr_qs.filter(
                Q(academic_year__code__iexact=str(school_year).strip()) | Q(academic_year__isnull=True)
            )

        enrollments = list(enr_qs)
        if enrollments:
            students = [e.student for e in enrollments if getattr(e, 'student', None)]
            enr_map = {e.student_id: e for e in enrollments if getattr(e, 'student_id', None)}
        else:
            try:
                students = list(Student.objects.filter(section=sec))
            except Exception:
                students = []
            enr_map = {}

        males_registered = 0
        females_registered = 0
        drop_prev_m, drop_prev_f = 0, 0
        drop_month_m, drop_month_f = 0, 0
        tout_prev_m, tout_prev_f = 0, 0
        tout_month_m, tout_month_f = 0, 0
        tin_prev_m, tin_prev_f = 0, 0
        tin_month_m, tin_month_f = 0, 0

        for s in students:
            enr_rec = enr_map.get(s.id)
            raw_sex = str(getattr(s, 'sex', '') or getattr(s, 'gender', '') or '').strip().upper()
            is_male = raw_sex.startswith('M')

            enr_date = (
                getattr(enr_rec, 'enrollment_date', None)
                or getattr(enr_rec, 'date_enrolled', None)
                or getattr(enr_rec, 'created_at', None)
                or getattr(s, 'created_at', None)
            )
            if enr_date and isinstance(enr_date, datetime):
                enr_date = enr_date.date()

            if enr_date and enr_date > end_month_date:
                continue

            status_val = str(
                getattr(enr_rec, 'status', '')
                or getattr(s, 'status', '')
                or getattr(s, 'status_remarks', '')
                or getattr(s, 'remarks', '')
                or ''
            ).strip().upper()

            exit_date = (
                getattr(enr_rec, 'status_date', None)
                or getattr(enr_rec, 'exit_date', None)
                or getattr(enr_rec, 'date_dropped', None)
                or getattr(enr_rec, 'date_transferred', None)
            )
            if exit_date and isinstance(exit_date, datetime):
                exit_date = exit_date.date()

            if 'DROP' in status_val or 'DRP' in status_val:
                if exit_date and exit_date < start_month_date:
                    if is_male: drop_prev_m += 1
                    else: drop_prev_f += 1
                    continue
                else:
                    if is_male: drop_month_m += 1
                    else: drop_month_f += 1

            elif 'TRANSFERRED OUT' in status_val or 'T/O' in status_val or status_val == 'TRANSFERRED_OUT':
                if exit_date and exit_date < start_month_date:
                    if is_male: tout_prev_m += 1
                    else: tout_prev_f += 1
                    continue
                else:
                    if is_male: tout_month_m += 1
                    else: tout_month_f += 1

            if 'TRANSFERRED IN' in status_val or 'T/I' in status_val or status_val == 'TRANSFERRED_IN':
                if enr_date and enr_date < start_month_date:
                    if is_male: tin_prev_m += 1
                    else: tin_prev_f += 1
                else:
                    if is_male: tin_month_m += 1
                    else: tin_month_f += 1

            if status_val not in ('DROPPED', 'TRANSFERRED_OUT') or (exit_date and exit_date > end_month_date):
                if is_male:
                    males_registered += 1
                else:
                    females_registered += 1

        registered_end = make_triplet(males_registered, females_registered)
        dropped_out_prev = make_triplet(drop_prev_m, drop_prev_f)
        dropped_out_month = make_triplet(drop_month_m, drop_month_f)
        dropped_out_cumulative = add_triplets(dropped_out_prev, dropped_out_month)

        transferred_out_prev = make_triplet(tout_prev_m, tout_prev_f)
        transferred_out_month = make_triplet(tout_month_m, tout_month_f)
        transferred_out_cumulative = add_triplets(transferred_out_prev, transferred_out_month)

        transferred_in_prev = make_triplet(tin_prev_m, tin_prev_f)
        transferred_in_month = make_triplet(tin_month_m, tin_month_f)
        transferred_in_cumulative = add_triplets(transferred_in_prev, transferred_in_month)

        total_m_daily_attendance = 0
        total_f_daily_attendance = 0

        if students and num_school_days > 0:
            daily_summaries = DailyAttendanceSummary.objects.filter(
                section=sec,
                student__in=students,
                attendance_date__gte=start_month_date,
                attendance_date__lte=end_month_date
            )
            summary_map = {
                (ds.student_id, ds.attendance_date): (ds.status or '').upper()
                for ds in daily_summaries
            }

            gate_logs = StudentGateLog.objects.filter(
                student__in=students,
                direction='IN',
                scan_time__date__gte=start_month_date,
                scan_time__date__lte=end_month_date
            ).values('student_id', 'scan_time__date')
            gate_set = {(gl['student_id'], gl['scan_time__date']) for gl in gate_logs}

            for s in students:
                raw_sex = str(getattr(s, 'sex', '') or getattr(s, 'gender', '') or '').strip().upper()
                is_male = raw_sex.startswith('M')

                for s_day in school_days:
                    key = (s.id, s_day)
                    status_found = summary_map.get(key, '')

                    if status_found in ('PRESENT', 'P', 'TARDY', 'LATE', 'T', 'CUTTING', 'CUT', 'CC') or key in gate_set:
                        if is_male:
                            total_m_daily_attendance += 1
                        else:
                            total_f_daily_attendance += 1

        ada_m = round(total_m_daily_attendance / num_school_days, 1)
        ada_f = round(total_f_daily_attendance / num_school_days, 1)
        daily_average = make_triplet(ada_m, ada_f)

        pct_m = round((daily_average["m"] / registered_end["m"] * 100), 1) if registered_end["m"] > 0 else 0.0
        pct_f = round((daily_average["f"] / registered_end["f"] * 100), 1) if registered_end["f"] > 0 else 0.0
        pct_total = round((daily_average["total"] / registered_end["total"] * 100), 1) if registered_end["total"] > 0 else 0.0
        attendance_percentage = {"m": pct_m, "f": pct_f, "total": pct_total}

        sec_record = {
            "section_id": sec.id,
            "section_name": sec.name,
            "grade_level": grade or "NON-GRADED",
            "adviser_name": adviser_name.upper(),
            "registered_end": registered_end,
            "daily_average": daily_average,
            "attendance_percentage": attendance_percentage,
            "dropped_out_prev": dropped_out_prev,
            "dropped_out_month": dropped_out_month,
            "dropped_out_cumulative": dropped_out_cumulative,
            "transferred_out_prev": transferred_out_prev,
            "transferred_out_month": transferred_out_month,
            "transferred_out_cumulative": transferred_out_cumulative,
            "transferred_in_prev": transferred_in_prev,
            "transferred_in_month": transferred_in_month,
            "transferred_in_cumulative": transferred_in_cumulative,
        }

        if is_non_graded:
            non_graded_sections.append(sec_record)
        else:
            if grade not in grade_groups_dict:
                grade_groups_dict[grade] = []
            grade_groups_dict[grade].append(sec_record)

    # 4. Compile Subtotals and Grand Totals
    grade_groups = []
    grand_registered = make_triplet(0, 0)
    grand_daily_avg = make_triplet(0, 0)
    grand_drop_prev = make_triplet(0, 0)
    grand_drop_month = make_triplet(0, 0)
    grand_drop_cum = make_triplet(0, 0)
    grand_tout_prev = make_triplet(0, 0)
    grand_tout_month = make_triplet(0, 0)
    grand_tout_cum = make_triplet(0, 0)
    grand_tin_prev = make_triplet(0, 0)
    grand_tin_month = make_triplet(0, 0)
    grand_tin_cum = make_triplet(0, 0)

    for grade_label, sec_list in grade_groups_dict.items():
        sub_reg = make_triplet(0, 0)
        sub_avg = make_triplet(0, 0)
        sub_dprev = make_triplet(0, 0)
        sub_dmonth = make_triplet(0, 0)
        sub_dcum = make_triplet(0, 0)
        sub_toprev = make_triplet(0, 0)
        sub_tomonth = make_triplet(0, 0)
        sub_tocum = make_triplet(0, 0)
        sub_tiprev = make_triplet(0, 0)
        sub_timonth = make_triplet(0, 0)
        sub_ticum = make_triplet(0, 0)

        for s in sec_list:
            sub_reg = add_triplets(sub_reg, s["registered_end"])
            sub_avg = add_triplets(sub_avg, s["daily_average"])
            sub_dprev = add_triplets(sub_dprev, s["dropped_out_prev"])
            sub_dmonth = add_triplets(sub_dmonth, s["dropped_out_month"])
            sub_dcum = add_triplets(sub_dcum, s["dropped_out_cumulative"])
            sub_toprev = add_triplets(sub_toprev, s["transferred_out_prev"])
            sub_tomonth = add_triplets(sub_tomonth, s["transferred_out_month"])
            sub_tocum = add_triplets(sub_tocum, s["transferred_out_cumulative"])
            sub_tiprev = add_triplets(sub_tiprev, s["transferred_in_prev"])
            sub_timonth = add_triplets(sub_timonth, s["transferred_in_month"])
            sub_ticum = add_triplets(sub_ticum, s["transferred_in_cumulative"])

        sub_pct_m = round((sub_avg["m"] / sub_reg["m"] * 100), 1) if sub_reg["m"] > 0 else 0.0
        sub_pct_f = round((sub_avg["f"] / sub_reg["f"] * 100), 1) if sub_reg["f"] > 0 else 0.0
        sub_pct_t = round((sub_avg["total"] / sub_reg["total"] * 100), 1) if sub_reg["total"] > 0 else 0.0

        subtotal = {
            "section_id": f"subtotal-{grade_label}",
            "section_name": "SUBTOTAL",
            "grade_level": grade_label,
            "adviser_name": "",
            "registered_end": sub_reg,
            "daily_average": sub_avg,
            "attendance_percentage": {"m": sub_pct_m, "f": sub_pct_f, "total": sub_pct_t},
            "dropped_out_prev": sub_dprev,
            "dropped_out_month": sub_dmonth,
            "dropped_out_cumulative": sub_dcum,
            "transferred_out_prev": sub_toprev,
            "transferred_out_month": sub_tomonth,
            "transferred_out_cumulative": sub_tocum,
            "transferred_in_prev": sub_tiprev,
            "transferred_in_month": sub_timonth,
            "transferred_in_cumulative": sub_ticum,
        }

        grade_groups.append({
            "grade_level": grade_label,
            "sections": sec_list,
            "subtotal": subtotal
        })

        grand_registered = add_triplets(grand_registered, sub_reg)
        grand_daily_avg = add_triplets(grand_daily_avg, sub_avg)
        grand_drop_prev = add_triplets(grand_drop_prev, sub_dprev)
        grand_drop_month = add_triplets(grand_drop_month, sub_dmonth)
        grand_drop_cum = add_triplets(grand_drop_cum, sub_dcum)
        grand_tout_prev = add_triplets(grand_tout_prev, sub_toprev)
        grand_tout_month = add_triplets(grand_tout_month, sub_tomonth)
        grand_tout_cum = add_triplets(grand_tout_cum, sub_tocum)
        grand_tin_prev = add_triplets(grand_tin_prev, sub_tiprev)
        grand_tin_month = add_triplets(grand_tin_month, sub_timonth)
        grand_tin_cum = add_triplets(grand_tin_cum, sub_ticum)

    # 5. Non-Graded Consolidation
    ng_reg = make_triplet(0, 0)
    ng_avg = make_triplet(0, 0)
    ng_dprev = make_triplet(0, 0)
    ng_dmonth = make_triplet(0, 0)
    ng_dcum = make_triplet(0, 0)
    ng_toprev = make_triplet(0, 0)
    ng_tomonth = make_triplet(0, 0)
    ng_tocum = make_triplet(0, 0)
    ng_tiprev = make_triplet(0, 0)
    ng_timonth = make_triplet(0, 0)
    ng_ticum = make_triplet(0, 0)

    for s in non_graded_sections:
        ng_reg = add_triplets(ng_reg, s["registered_end"])
        ng_avg = add_triplets(ng_avg, s["daily_average"])
        ng_dprev = add_triplets(ng_dprev, s["dropped_out_prev"])
        ng_dmonth = add_triplets(ng_dmonth, s["dropped_out_month"])
        ng_dcum = add_triplets(ng_dcum, s["dropped_out_cumulative"])
        ng_toprev = add_triplets(ng_toprev, s["transferred_out_prev"])
        ng_tomonth = add_triplets(ng_tomonth, s["transferred_out_month"])
        ng_tocum = add_triplets(ng_tocum, s["transferred_out_cumulative"])
        ng_tiprev = add_triplets(ng_tiprev, s["transferred_in_prev"])
        ng_timonth = add_triplets(ng_timonth, s["transferred_in_month"])
        ng_ticum = add_triplets(ng_ticum, s["transferred_in_cumulative"])

    ng_pct_m = round((ng_avg["m"] / ng_reg["m"] * 100), 1) if ng_reg["m"] > 0 else 0.0
    ng_pct_f = round((ng_avg["f"] / ng_reg["f"] * 100), 1) if ng_reg["f"] > 0 else 0.0
    ng_pct_t = round((ng_avg["total"] / ng_reg["total"] * 100), 1) if ng_reg["total"] > 0 else 0.0

    non_graded_summary = {
        "section_id": "non-graded-total",
        "section_name": "TOTAL FOR NON-GRADED",
        "grade_level": "NON-GRADED",
        "adviser_name": "",
        "registered_end": ng_reg,
        "daily_average": ng_avg,
        "attendance_percentage": {"m": ng_pct_m, "f": ng_pct_f, "total": ng_pct_t},
        "dropped_out_prev": ng_dprev,
        "dropped_out_month": ng_dmonth,
        "dropped_out_cumulative": ng_dcum,
        "transferred_out_prev": ng_toprev,
        "transferred_out_month": ng_tomonth,
        "transferred_out_cumulative": ng_tocum,
        "transferred_in_prev": ng_tiprev,
        "transferred_in_month": ng_timonth,
        "transferred_in_cumulative": ng_ticum,
    }

    grand_registered = add_triplets(grand_registered, ng_reg)
    grand_daily_avg = add_triplets(grand_daily_avg, ng_avg)
    grand_drop_prev = add_triplets(grand_drop_prev, ng_dprev)
    grand_drop_month = add_triplets(grand_drop_month, ng_dmonth)
    grand_drop_cum = add_triplets(grand_drop_cum, ng_dcum)
    grand_tout_prev = add_triplets(grand_tout_prev, ng_toprev)
    grand_tout_month = add_triplets(grand_tout_month, ng_tomonth)
    grand_tout_cum = add_triplets(grand_tout_cum, ng_tocum)
    grand_tin_prev = add_triplets(grand_tin_prev, ng_tiprev)
    grand_tin_month = add_triplets(grand_tin_month, ng_timonth)
    grand_tin_cum = add_triplets(grand_tin_cum, ng_ticum)

    grand_pct_m = round((grand_daily_avg["m"] / grand_registered["m"] * 100), 1) if grand_registered["m"] > 0 else 0.0
    grand_pct_f = round((grand_daily_avg["f"] / grand_registered["f"] * 100), 1) if grand_registered["f"] > 0 else 0.0
    grand_pct_t = round((grand_daily_avg["total"] / grand_registered["total"] * 100), 1) if grand_registered["total"] > 0 else 0.0

    total_summary = {
        "section_id": "grand-total",
        "section_name": "TOTAL",
        "grade_level": "ALL",
        "adviser_name": "",
        "registered_end": grand_registered,
        "daily_average": grand_daily_avg,
        "attendance_percentage": {"m": grand_pct_m, "f": grand_pct_f, "total": grand_pct_t},
        "dropped_out_prev": grand_drop_prev,
        "dropped_out_month": grand_drop_month,
        "dropped_out_cumulative": grand_drop_cum,
        "transferred_out_prev": grand_tout_prev,
        "transferred_out_month": grand_tout_month,
        "transferred_out_cumulative": grand_tout_cum,
        "transferred_in_prev": grand_tin_prev,
        "transferred_in_month": grand_tin_month,
        "transferred_in_cumulative": grand_tin_cum,
    }

    if target_ay:
        resolved_sy = target_ay.code
    elif school_year:
        resolved_sy = str(school_year).strip()
    else:
        active_sy = AcademicYear.objects.filter(is_active=True).first()
        if active_sy:
            resolved_sy = active_sy.code
        else:
            first_sec = sections_qs.first()
            if first_sec and getattr(first_sec, 'academic_year', None):
                resolved_sy = getattr(first_sec.academic_year, 'code', str(first_sec.academic_year))
            else:
                resolved_sy = f"{year}-{year + 1}"

    return {
        **school_meta,
        "school_year": resolved_sy,
        "month": month_name,
        "year": year,
        "grade_groups": grade_groups,
        "non_graded_summary": non_graded_summary,
        "total_summary": total_summary
    }