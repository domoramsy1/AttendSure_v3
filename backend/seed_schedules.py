import os
import django
from datetime import time

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from apps.academics.models import GradeLevel, Section, Subject, StaffProfile, Schedule, AcademicYear

def seed():
    sy = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
    teacher = StaffProfile.objects.first()

    # 1. Ensure Grade 7 exists
    grade7, _ = GradeLevel.objects.get_or_create(
        code='G7',
        defaults={'name': 'Grade 7', 'level_order': 7, 'tier': 'JHS'}
    )

    # 2. Ensure Sections exist
    sec_diamond, _ = Section.objects.get_or_create(
        name='Diamond',
        academic_year=sy,
        defaults={'grade_level': grade7, 'adviser': teacher, 'room_number': 'Bldg A - Rm 101'}
    )
    sec_emerald, _ = Section.objects.get_or_create(
        name='Emerald',
        academic_year=sy,
        defaults={'grade_level': grade7, 'adviser': teacher, 'room_number': 'Bldg A - Rm 102'}
    )

    # 3. Ensure DepEd Core Subjects exist
    subjects_seed = [
        ('ENG-7', 'English 7', 1.0),
        ('MATH-7', 'Mathematics 7', 1.0),
        ('SCI-7', 'Science 7', 1.0),
        ('FIL-7', 'Filipino 7', 1.0),
        ('AP-7', 'Araling Panlipunan 7', 1.0),
        ('MAPEH-7', 'Music, Arts, PE & Health 7', 1.0),
        ('ESP-7', 'Edukasyon sa Pagpapakatao 7', 1.0),
        ('TLE-7', 'Technology and Livelihood Education 7', 1.0),
    ]

    subj_objs = {}
    for code, title, units in subjects_seed:
        s, _ = Subject.objects.get_or_create(
            code=code,
            defaults={'title': title, 'units': units, 'tier': 'JHS', 'subject_type': 'CORE'}
        )
        subj_objs[code] = s
        print(f"Subject verified: {code} - {title}")

    # 4. Create Schedules for Section Diamond
    schedule_slots = [
        ('ENG-7', time(7, 30), time(8, 30), 'Rm 101'),
        ('MATH-7', time(8, 30), time(9, 30), 'Rm 101'),
        ('SCI-7', time(9, 45), time(10, 45), 'Sci-Lab 1'),
        ('FIL-7', time(10, 45), time(11, 45), 'Rm 101'),
        ('AP-7', time(13, 0), time(14, 0), 'Rm 101'),
    ]

    for subj_code, start_t, end_t, room in schedule_slots:
        sch, created = Schedule.objects.get_or_create(
            section=sec_diamond,
            subject=subj_objs[subj_code],
            defaults={
                'teacher': teacher,
                'start_time': start_t,
                'end_time': end_t,
                'room_number': room,
            }
        )
        print(f"Schedule period ready: {sec_diamond.name} | {subj_code} ({start_t.strftime('%I:%M %p')} - {end_t.strftime('%I:%M %p')})")

    print("\nSchedules & Sections seeded successfully!")

if __name__ == '__main__':
    seed()