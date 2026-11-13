import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from apps.academics.models import SchoolProfile, StaffProfile, Section, AcademicYear, Enrollment, Student

def sync_real_data():
    # 1. Update or create real School Profile
    school = SchoolProfile.objects.first()
    if not school:
        school = SchoolProfile()

    school.school_id = '304033'
    school.school_name = 'Lapasan National High School'
    school.region = 'Region X'
    school.division = 'Cagayan de Oro City'
    school.district = 'District II'
    school.save()
    print(f"School Profile Synced: {school.school_name} (ID: {school.school_id})")

    # 2. Ensure real Principal / School Head exists
    principal, _ = StaffProfile.objects.update_or_create(
        employee_id='DEPED-SH-001',
        defaults={
            'first_name': 'Eleanor',
            'last_name': 'Roa',
            'position': 'Secondary School Principal IV',
            'is_active': True
        }
    )

    # 3. Ensure real Adviser exists
    adviser, _ = StaffProfile.objects.update_or_create(
        employee_id='DEPED-TCH-001',
        defaults={
            'first_name': 'Jerel',
            'last_name': 'Eduave',
            'position': 'Teacher III / Class Adviser',
            'is_active': True
        }
    )

    # 4. Bind Section Diamond to Adviser and active Academic Year
    sy = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
    sec = Section.objects.first()
    if sec:
        sec.adviser = adviser
        sec.academic_year = sy
        sec.save(update_fields=['adviser', 'academic_year'])
        print(f"Section {sec.name} adviser set to {adviser.first_name} {adviser.last_name}")

        # 5. Enroll all active learners directly into this section
        all_students = Student.objects.filter(is_active=True)
        for s in all_students:
            Enrollment.objects.update_or_create(
                student=s,
                academic_year=sy,
                defaults={'section': sec, 'status': 'ENROLLED'}
            )
        print(f"Enrolled {all_students.count()} real learners into Section {sec.name}")

if __name__ == '__main__':
    sync_real_data()