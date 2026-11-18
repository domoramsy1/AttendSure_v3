"""
AttendSure - Real School Data Seeder (Macasandig NHS)
File: scripts/database/seed_real_school_data.py
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / 'backend'
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from apps.academics.models import AcademicYear, Enrollment, FacultyProfile, SchoolProfile, Section, Student


def sync_real_data():
    school = SchoolProfile.objects.first() or SchoolProfile()
    school.school_id = '304033'
    school.school_name = 'Macasandig National High School'
    school.region = 'Region X'
    school.division = 'Cagayan de Oro City'
    school.district = 'District II'
    school.address = 'Macasandig, Cagayan de Oro City, Misamis Oriental'
    school.save()

    principal, _ = FacultyProfile.objects.update_or_create(
        employee_id='DEPED-SH-001',
        defaults={
            'first_name': 'Eleanor',
            'last_name': 'Roa',
            'position': 'Secondary School Principal IV',
            'is_active': True,
        },
    )
    school.principal_faculty = principal
    school.principal_name = principal.full_name
    school.save(update_fields=['principal_faculty', 'principal_name'])

    adviser, _ = FacultyProfile.objects.update_or_create(
        employee_id='DEPED-FAC-001',
        defaults={
            'first_name': 'Jerel',
            'last_name': 'Eduave',
            'position': 'Faculty III / Class Adviser',
            'is_active': True,
        },
    )

    sy = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
    sec = Section.objects.first()
    if sec and sy:
        sec.adviser = adviser
        sec.academic_year = sy
        sec.save(update_fields=['adviser', 'academic_year'])
        for student in Student.objects.filter(is_active=True):
            Enrollment.objects.update_or_create(
                student=student,
                academic_year=sy,
                defaults={'section': sec, 'status': 'ENROLLED'},
            )
    print('Synced Macasandig National High School profile and enrollments.')


if __name__ == '__main__':
    sync_real_data()
