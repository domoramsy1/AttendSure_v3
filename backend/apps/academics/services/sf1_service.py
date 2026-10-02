from datetime import date
from django.utils import timezone
from apps.academics.models import Section, Enrollment, SchoolProfile, Student, StaffProfile

def calculate_age(birthdate, ref_date=None):
    if not birthdate:
        return ""
    if not ref_date:
        ref_date = timezone.now().date()
    age = ref_date.year - birthdate.year - (
        (ref_date.month, ref_date.day) < (birthdate.month, birthdate.day)
    )
    return max(0, age)

def format_full_name(student):
    last = student.last_name.strip().upper() if student.last_name else ""
    first = student.first_name.strip().upper() if student.first_name else ""
    suffix = f" {student.suffix.strip().upper()}" if student.suffix else ""
    mid = f" {student.middle_name.strip().upper()}" if student.middle_name else ""
    return f"{last}, {first}{suffix}{mid}".strip()

def get_sf1_data(section_id):
    section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(id=section_id)
    school = SchoolProfile.objects.first()
    sy = section.academic_year

    # 100% Dynamic Database Fetch
    enrollments = Enrollment.objects.filter(
        section=section,
        status='ENROLLED'
    ).select_related('student').order_by('student__last_name', 'student__first_name')

    students = [e.student for e in enrollments if e.student and e.student.is_active]

    if not students:
        students = list(Student.objects.filter(is_active=True).order_by('last_name', 'first_name'))

    males = []
    females = []

    for s in students:
        raw_sex = str(getattr(s, 'sex', getattr(s, 'gender', '')) or '').strip().upper()
        is_male = raw_sex in ['M', 'MALE']

        learner_dict = {
            'id': s.id,
            'lrn': s.lrn or '',
            'name': format_full_name(s),
            'last_name': s.last_name.upper() if s.last_name else '',
            'first_name': s.first_name.upper() if s.first_name else '',
            'sex': 'M' if is_male else 'F',
            'birthdate': s.birthdate.strftime('%m/%d/%Y') if s.birthdate else '',
            'age': calculate_age(s.birthdate) if s.birthdate else '',
            'mother_tongue': s.mother_tongue or '',
            'ethnic_group': s.ethnic_group or '',
            'religion': s.religion or '',
            'house_street': s.house_street_sitio or '',
            'barangay': s.barangay or '',
            'municipality_city': s.municipality_city or '',
            'province': s.province or '',
            'father_name': s.father_name.upper() if s.father_name else '',
            'mother_maiden_name': s.mother_maiden_name.upper() if s.mother_maiden_name else '',
            'guardian_name': s.guardian_name.upper() if s.guardian_name else '',
            'guardian_relationship': s.guardian_relationship or '',
            'parent_contact': s.parent_contact or '',
            'remarks': ''
        }

        if is_male:
            males.append(learner_dict)
        else:
            females.append(learner_dict)

    males.sort(key=lambda x: (x['last_name'], x['first_name']))
    females.sort(key=lambda x: (x['last_name'], x['first_name']))

    adviser_name = ""
    if section.adviser:
        adviser_name = f"{section.adviser.first_name} {section.adviser.last_name}".strip().upper()

    school_head_name = ""
    if school and school.principal_name:
        school_head_name = school.principal_name.strip().upper()

    return {
        'school_id': school.school_id if school else '',
        'school_name': school.school_name if school else '',
        'region': school.region if school else '',
        'division': school.division if school else '',
        'district': school.district if school else '',
        'left_logo': school.left_logo if (school and school.left_logo) else None,
        'right_logo': school.right_logo if (school and school.right_logo) else None,
        'academic_year': sy.code if sy else '',
        'section_name': section.name if section else '',
        'grade_level': section.grade_level.name if (section and section.grade_level) else '',
        'adviser_name': adviser_name,
        'school_head': school_head_name,
        'males': males,
        'females': females,
        'total_male': len(males),
        'total_female': len(females),
        'total_combined': len(males) + len(females)
    }