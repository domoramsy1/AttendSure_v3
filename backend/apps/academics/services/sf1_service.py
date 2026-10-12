# D:\AttendSure_V3\backend\apps\academics\services\sf1_service.py

from datetime import date, datetime, timedelta
from apps.academics.models import Section, Enrollment, SchoolProfile, AcademicYear


def calculate_age_as_of_june(birthdate, year):
    if not birthdate:
        return ""
    try:
        june_1 = date(int(year), 6, 1)
        days_ahead = (4 - june_1.weekday()) % 7
        first_friday = june_1 + timedelta(days=days_ahead)

        if isinstance(birthdate, str):
            for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
                try:
                    birthdate = datetime.strptime(birthdate, fmt).date()
                    break
                except ValueError:
                    pass

        if not isinstance(birthdate, (date, datetime)):
            return ""

        age = first_friday.year - birthdate.year - (
            (first_friday.month, first_friday.day) < (birthdate.month, birthdate.day)
        )
        return max(0, age)
    except Exception:
        return ""


def get_sf1_data(section_id, school_year=None, as_of_date=None):
    section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').filter(id=section_id).first()
    if not section:
        raise ValueError(f"Section {section_id} not found.")

    school = SchoolProfile.objects.first()
    sy_code = str(school_year or (section.academic_year.code if section.academic_year else "2026-2027"))
    target_year = int(sy_code.split('-')[0]) if '-' in sy_code else 2026

    enrollments = Enrollment.objects.filter(
        section=section,
        status__in=['ENROLLED', 'ACTIVE']
    ).select_related('student').order_by('student__last_name', 'student__first_name')

    combined = []
    males = []
    females = []

    for e in enrollments:
        s = e.student
        if not s:
            continue

        raw_sex = str(getattr(s, 'sex', '') or '').strip().upper()
        is_m = raw_sex.startswith('M')

        mid = f" {s.middle_name}" if getattr(s, 'middle_name', '') else ""
        suf = f" {s.suffix}" if getattr(s, 'suffix', '') else ""
        full_name = f"{s.last_name}, {s.first_name}{mid}{suf}".strip()

        b_str = ""
        if s.birthdate:
            try:
                b_str = s.birthdate.strftime('%m/%d/%Y') if isinstance(s.birthdate, (date, datetime)) else str(s.birthdate)
            except Exception:
                b_str = str(s.birthdate)

        learner = {
            'id': s.id,
            'lrn': str(s.lrn or '').strip(),
            'name': full_name,
            'sex': 'M' if is_m else 'F',
            'birthdate': b_str,
            'age': calculate_age_as_of_june(s.birthdate, target_year),
            'birth_place': str(getattr(s, 'birth_place', '') or getattr(s, 'province', '') or '').strip(),
            'mother_tongue': str(getattr(s, 'mother_tongue', '') or '').strip(),
            'ethnic_group': str(getattr(s, 'ethnic_group', '') or '').strip(),
            'religion': str(getattr(s, 'religion', '') or '').strip(),
            'house_street': str(getattr(s, 'house_street_sitio', '') or getattr(s, 'house_street', '') or '').strip(),
            'barangay': str(getattr(s, 'barangay', '') or '').strip(),
            'municipality_city': str(getattr(s, 'municipality_city', '') or '').strip(),
            'province': str(getattr(s, 'province', '') or '').strip(),
            'father_name': str(getattr(s, 'father_name', '') or '').strip(),
            'mother_maiden_name': str(getattr(s, 'mother_maiden_name', '') or '').strip(),
            'guardian_name': str(getattr(s, 'guardian_name', '') or '').strip(),
            'guardian_relationship': str(getattr(s, 'guardian_relationship', '') or '').strip(),
            'parent_contact': str(getattr(s, 'parent_contact', '') or getattr(s, 'guardian_phone', '') or '').strip(),
            'remarks': str(getattr(e, 'remarks', '') or getattr(s, 'remarks', '') or '').strip(),
        }

        combined.append(learner)
        if is_m:
            males.append(learner)
        else:
            females.append(learner)

    return {
        'school_id': str(school.school_id or '') if school else '',
        'school_name': str(school.school_name or '') if school else '',
        'region': str(school.region or '') if school else '',
        'division': str(school.division or '') if school else '',
        'district': str(school.district or '') if school else '',
        'academic_year': sy_code,
        'grade_level': section.grade_level.name if section.grade_level else '',
        'section_name': section.name,
        'adviser_name': f"{section.adviser.first_name} {section.adviser.last_name}".strip() if section.adviser else '',
        'school_head': str(school.principal_name or '').upper() if school else '',
        'students': combined,
        'learners': combined,
        'males': males,
        'females': females,
        'total_male': len(males),
        'total_female': len(females),
        'total_combined': len(combined),
    }