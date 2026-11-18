"""
AttendSure - Real Schedule Seeder
File: scripts/database/seed_schedules.py
"""

import os
import sys
from datetime import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / 'backend'
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from apps.academics.models import AcademicYear, FacultyProfile, GradeLevel, Schedule, Section, Subject


def seed():
    sy = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
    faculty = FacultyProfile.objects.filter(is_active=True).first()
    grade7, _ = GradeLevel.objects.get_or_create(
        code='G7', defaults={'name': 'Grade 7', 'level_order': 7, 'stage': 'JHS'}
    )
    sec_diamond, _ = Section.objects.get_or_create(
        name='Diamond',
        academic_year=sy,
        defaults={'grade_level': grade7, 'adviser': faculty, 'room_number': 'Bldg A - Rm 101'},
    )
    subjects_seed = [
        ('ENG-7', 'English 7', 1),
        ('MATH-7', 'Mathematics 7', 1),
        ('SCI-7', 'Science 7', 1),
        ('FIL-7', 'Filipino 7', 1),
        ('AP-7', 'Araling Panlipunan 7', 1),
    ]
    subj_objs = {}
    for code, title, units in subjects_seed:
        s, _ = Subject.objects.get_or_create(
            code=code, defaults={'title': title, 'units': units, 'grade_level': grade7}
        )
        subj_objs[code] = s

    slots = [
        ('ENG-7', time(7, 30), time(8, 30), 'Rm 101'),
        ('MATH-7', time(8, 30), time(9, 30), 'Rm 101'),
        ('SCI-7', time(9, 45), time(10, 45), 'Sci-Lab 1'),
        ('FIL-7', time(10, 45), time(11, 45), 'Rm 101'),
        ('AP-7', time(13, 0), time(14, 0), 'Rm 101'),
    ]
    for subj_code, start_t, end_t, room in slots:
        Schedule.objects.get_or_create(
            section=sec_diamond,
            subject=subj_objs[subj_code],
            defaults={'faculty': faculty, 'start_time': start_t, 'end_time': end_t, 'room_number': room},
        )
    print('Schedules seeded cleanly.')


if __name__ == '__main__':
    seed()
