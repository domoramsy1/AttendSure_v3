# backend/apps/academics/services/sf4_service.py

import calendar
from datetime import date, datetime
from django.db.models import Q

from apps.academics.models import (
    AcademicYear,
    DailyAttendanceSummary,
    Enrollment,
    GradeLevel,
    Section,
    Student,
    StudentGateLog,
)
from apps.api.views.common import get_school_metadata

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


def generate_sf4_data(month_name="October", year=2026, school_year=""):
    month_num = MONTH_MAP.get(str(month_name).capitalize(), 10)
    year = int(year)
    num_calendar_days = calendar.monthrange(year, month_num)[1]
    start_month_date = date(year, month_num, 1)
    end_month_date = date(year, month_num, num_calendar_days)

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

    # 2. Query Sections with pre-selected relations
    sections_qs = (
        Section.objects.select_related('grade_level', 'academic_year', 'adviser')
        .all()
    )
    if target_ay:
        sections_qs = sections_qs.filter(Q(academic_year=target_ay) | Q(academic_year__isnull=True))
    elif school_year:
        sections_qs = sections_qs.filter(
            Q(academic_year__code__iexact=str(school_year).strip()) | Q(academic_year__isnull=True)
        )

    sections_qs = sections_qs.order_by('grade_level__level_order', 'name')

    registered_grades = list(
        GradeLevel.objects.all().order_by('level_order').values_list('name', flat=True)
    )
    if not registered_grades:
        registered_grades = list(sections_qs.values_list('grade_level__name', flat=True).distinct())

    grade_groups_dict = {g: [] for g in registered_grades if g}
    non_graded_sections = []

    for sec in sections_qs:
        grade = str(sec.grade_level.name if sec.grade_level else '').strip()
        is_non_graded = not grade or "NON-GRADED" in grade.upper()
        adviser_name = sec.adviser.full_name if sec.adviser else "Unassigned"

        enr_qs = (
            Enrollment.objects.filter(section=sec)
            .select_related('student')
        )
        if target_ay:
            enr_qs = enr_qs.filter(Q(academic_year=target_ay) | Q(academic_year__isnull=True))

        enrollments = list(enr_qs)
        students = [e.student for e in enrollments if e.student]
        enr_map = {e.student_id: e for e in enrollments if e.student_id}

        males_registered, females_registered = 0, 0
        drop_prev_m, drop_prev_f = 0, 0
        drop_month_m, drop_month_f = 0, 0
        tout_prev_m, tout_prev_f = 0, 0
        tout_month_m, tout_month_f = 0, 0
        tin_prev_m, tin_prev_f = 0, 0
        tin_month_m, tin_month_f = 0, 0

        for s in students:
            enr_rec = enr_map.get(s.id)
            raw_sex = str(getattr(s, 'sex', '') or '').strip().upper()
            is_male = raw_sex.startswith('M')

            enr_date = getattr(enr_rec, 'enrollment_date', None) or getattr(s, 'created_at', None)
            if enr_date and isinstance(enr_date, datetime):
                enr_date = enr_date.date()

            if enr_date and enr_date > end_month_date:
                continue

            status_val = str(getattr(enr_rec, 'status', '') or '').strip().upper()
            exit_date = getattr(enr_rec, 'status_date', None)
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

            elif 'TRANSFERRED OUT' in status_val or status_val == 'TRANSFERRED_OUT':
                if exit_date and exit_date < start_month_date:
                    if is_male: tout_prev_m += 1
                    else: tout_prev_f += 1
                    continue
                else:
                    if is_male: tout_month_m += 1
                    else: tout_month_f += 1

            if 'TRANSFERRED IN' in status_val or status_val == 'TRANSFERRED_IN':
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

        total_m_daily_attendance, total_f_daily_attendance = 0, 0

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
                raw_sex = str(getattr(s, 'sex', '') or '').strip().upper()
                is_male = raw_sex.startswith('M')

                for s_day in school_days:
                    key = (s.id, s_day)
                    status_found = summary_map.get(key, '')

                    if status_found in ('PRESENT', 'P', 'TARDY', 'LATE', 'T', 'CUTTING', 'CUT', 'CC') or key in gate_set:
                        if is_male: total_m_daily_attendance += 1
                        else: total_f_daily_attendance += 1

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

    total_summary = {
        "section_id": "grand-total",
        "section_name": "TOTAL",
        "grade_level": "ALL",
        "adviser_name": "",
        "registered_end": grand_registered,
        "daily_average": grand_daily_avg,
        "attendance_percentage": {
            "m": round((grand_daily_avg["m"] / grand_registered["m"] * 100), 1) if grand_registered["m"] > 0 else 0.0,
            "f": round((grand_daily_avg["f"] / grand_registered["f"] * 100), 1) if grand_registered["f"] > 0 else 0.0,
            "total": round((grand_daily_avg["total"] / grand_registered["total"] * 100), 1) if grand_registered["total"] > 0 else 0.0,
        },
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

    resolved_sy = (
        target_ay.code if target_ay
        else (str(school_year).strip() if school_year else f"{year}-{year + 1}")
    )

    return {
        **get_school_metadata(),
        "school_year": resolved_sy,
        "month": month_name,
        "year": year,
        "grade_groups": grade_groups,
        "non_graded_summary": None,
        "total_summary": total_summary
    }