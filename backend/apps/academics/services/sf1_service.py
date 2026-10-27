"""
AttendSure V3 - School Form 1 (SF1) Service
File: backend/apps/academics/services/sf1_service.py
"""

from datetime import date, datetime, timedelta
from apps.academics.models import Section, Enrollment
from apps.api.views.common import get_school_metadata
from apps.common.utils import format_full_student_name


def calculate_age_as_of_cut_off(birthdate, cut_off_date: date) -> int | str:
    """Calculates chronological age as of the official DepEd cut-off date."""
    if not birthdate:
        return ""
    try:
        if isinstance(birthdate, str):
            for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
                try:
                    birthdate = datetime.strptime(birthdate, fmt).date()
                    break
                except ValueError:
                    pass

        if not isinstance(birthdate, (date, datetime)):
            return ""

        age = cut_off_date.year - birthdate.year - (
            (cut_off_date.month, cut_off_date.day) < (birthdate.month, birthdate.day)
        )
        return max(0, age)
    except Exception:
        return ""


def get_sf1_data(section_id, school_year=None, as_of_date=None):
    section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').filter(id=section_id).first()
    if not section:
        raise ValueError(f"Section {section_id} not found.")

    school_meta = get_school_metadata()
    ay = section.academic_year
    sy_code = str(school_year or (ay.code if ay else "2026-2027"))
    target_year = int(sy_code.split('-')[0]) if '-' in sy_code and sy_code.split('-')[0].isdigit() else 2026

    cut_off = getattr(ay, 'first_friday_june', None)
    if not cut_off:
        june_1 = date(target_year, 6, 1)
        days_ahead = (4 - june_1.weekday()) % 7
        cut_off = june_1 + timedelta(days=days_ahead)

    enrollments = (
        Enrollment.objects.filter(section=section, status='ENROLLED')
        .select_related('student')
        .order_by('student__last_name', 'student__first_name')
    )

    combined, males, females = [], [], []

    for e in enrollments:
        s = e.student
        if not s:
            continue

        is_m = str(s.sex or '').strip().upper().startswith('M')
        b_str = s.birthdate.strftime('%m/%d/%Y') if isinstance(s.birthdate, (date, datetime)) else str(s.birthdate or '')

        learner = {
            'id': s.id,
            'lrn': str(s.lrn or '').strip(),
            'name': format_full_student_name(s),
            'sex': 'M' if is_m else 'F',
            'birthdate': b_str,
            'age': calculate_age_as_of_cut_off(s.birthdate, cut_off),
            'birth_place': str(s.province or '').strip(),
            'mother_tongue': str(s.mother_tongue or '').strip(),
            'ethnic_group': str(s.ethnic_group or '').strip(),
            'religion': str(s.religion or '').strip(),
            'house_street': str(s.house_street_sitio or '').strip(),
            'barangay': str(s.barangay or '').strip(),
            'municipality_city': str(s.municipality_city or '').strip(),
            'province': str(s.province or '').strip(),
            'father_name': str(s.father_name or '').strip(),
            'mother_maiden_name': str(s.mother_maiden_name or '').strip(),
            'guardian_name': str(s.guardian_name or '').strip(),
            'guardian_relationship': str(s.guardian_relationship or '').strip(),
            'parent_contact': str(s.parent_contact or '').strip(),
            'remarks': str(e.remarks or '').strip(),
        }

        combined.append(learner)
        if is_m:
            males.append(learner)
        else:
            females.append(learner)

    return {
        **school_meta,
        'academic_year': sy_code,
        'grade_level': section.grade_level.name if section.grade_level else '',
        'section_name': section.name,
        'adviser_name': section.adviser.full_name if section.adviser else '',
        'students': combined,
        'learners': combined,
        'males': males,
        'females': females,
        'total_male': len(males),
        'total_female': len(females),
        'total_combined': len(combined),
    }