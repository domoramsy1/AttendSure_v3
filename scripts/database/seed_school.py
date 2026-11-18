r"""
AttendSure - School, Timetable & Learner Seeder (Macasandig NHS)
Run:
  python database\seed_school.py                 # Seeds school profile, schedules & baseline section
  python database\seed_school.py --per-section 40 # Populates 40 learners per section across Grades 7-12
"""

import argparse
import random
import secrets
import sys
from datetime import date, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from apps.accounts.models import TeacherProfile, UserProfile
from apps.campus.models import CampusBoundary
from apps.school.models import ClassPeriod, GradeLevel, Room, SchoolSettings, SchoolYear, Section, Subject
from apps.students.models import Enrollment, Student

User = get_user_model()

BOYS = ["Juan Miguel", "Christian Paul", "Mark Joshua", "Angelo Gabriel", "Daniel Joseph", "Carl Jerome", "Paolo Miguel", "Nathaniel Lance"]
GIRLS = ["Maria Cristina", "Lyka Marie", "Hazel Jane", "Samantha Joy", "Patricia Ann", "Kathryn Mae", "Hannah Sofia", "Andrea Nicole"]
SURNAMES = ["Dela Cruz", "Santos", "Reyes", "Bautista", "Garcia", "Mendoza", "Villanueva", "Ramos", "Aquino", "Morales", "Eduave", "Gutierrez"]
BARANGAYS = ["Macasandig", "Nazareth", "Carmen", "Kauswagan", "Balulang", "Gusa", "Cugman", "Camaman-an"]


@transaction.atomic
def seed_school(per_section: int = 0):
    sy, _ = SchoolYear.objects.update_or_create(
        code="2026-2027",
        defaults={
            "start_date": date(2026, 6, 1),
            "baseline_cutoff_date": date(2026, 6, 5),
            "end_date": date(2027, 3, 31),
            "is_active": True,
        },
    )

    principal, _ = TeacherProfile.objects.update_or_create(
        employee_id="DEPED-SH-001",
        defaults={
            "first_name": "Eleanor",
            "last_name": "Roa",
            "position": "Secondary School Principal IV",
            "department": "Administration",
            "can_teach": False,
            "is_active": True,
        },
    )

    school = SchoolSettings.objects.first() or SchoolSettings(school_id="304033")
    school.school_id = school.school_id or "304033"
    school.school_name = "Macasandig National High School"
    school.region = "Region X"
    school.division = "Cagayan de Oro City"
    school.district = "District II"
    school.academic_year = sy.code
    school.address = "Macasandig, Cagayan de Oro City, Misamis Oriental"
    school.principal_teacher = principal
    school.principal_name = principal.full_name
    school.save()

    CampusBoundary.objects.update_or_create(
        id=1,
        defaults={
            "name": school.school_name,
            "latitude": school.latitude,
            "longitude": school.longitude,
            "radius_meters": school.geofence_radius_meters,
            "is_active": True,
        },
    )

    adviser, _ = TeacherProfile.objects.update_or_create(
        employee_id="DEPED-FAC-001",
        defaults={
            "first_name": "Jerel",
            "last_name": "Eduave",
            "position": "Teacher III",
            "department": "Junior High School",
            "can_teach": True,
            "is_active": True,
        },
    )
    adv_user, created_u = User.objects.get_or_create(
        username="jerel.eduave",
        defaults={"first_name": "Jerel", "last_name": "Eduave", "email": "jerel.eduave@attendsure.edu.ph"},
    )
    if created_u:
        adv_user.set_password("Faculty@123")
        adv_user.save()
    UserProfile.objects.update_or_create(
        user=adv_user, defaults={"teacher": adviser, "role": "FACULTY", "is_teaching": True, "is_profile_completed": True}
    )

    grade7, _ = GradeLevel.objects.update_or_create(
        code="G7", defaults={"name": "Grade 7", "stage": "JHS", "level_order": 7}
    )
    room101, _ = Room.objects.update_or_create(
        name="Rm 101", defaults={"building": "Main Building", "capacity": 45, "room_type": "LECTURE"}
    )
    diamond, _ = Section.objects.update_or_create(
        school_year=sy,
        grade_level=grade7,
        name="Diamond",
        defaults={"adviser": adviser, "room": room101, "room_number": room101.name, "capacity": 45, "is_active": True},
    )

    subjects_spec = [
        ("ENG-7", "English 7", time(7, 30), time(8, 30)),
        ("MATH-7", "Mathematics 7", time(8, 30), time(9, 30)),
        ("SCI-7", "Science 7", time(9, 45), time(10, 45)),
        ("FIL-7", "Filipino 7", time(10, 45), time(11, 45)),
        ("AP-7", "Araling Panlipunan 7", time(13, 0), time(14, 0)),
    ]
    for code, title, st_t, end_t in subjects_spec:
        subj, _ = Subject.objects.update_or_create(
            code=code, defaults={"title": title, "grade_level": grade7, "units": 1}
        )
        ClassPeriod.objects.update_or_create(
            section=diamond,
            subject=subj,
            defaults={"teacher": adviser, "room": room101, "room_number": room101.name, "start_time": st_t, "end_time": end_t, "is_active": True},
        )

    added = 0
    if per_section > 0:
        existing_lrns = set(Student.objects.values_list("lrn", flat=True))
        for sec in Section.objects.filter(is_active=True).select_related("grade_level"):
            current = Enrollment.objects.filter(section=sec, school_year=sy).count()
            needed = max(0, per_section - current)
            for idx in range(needed):
                is_male = idx % 2 == 0
                while True:
                    lrn = f"128936{random.randint(100000, 999999)}"
                    if lrn not in existing_lrns:
                        existing_lrns.add(lrn)
                        break
                first = random.choice(BOYS if is_male else GIRLS)
                last = random.choice(SURNAMES)
                mid = random.choice(SURNAMES)
                student = Student.objects.create(
                    lrn=lrn,
                    first_name=first,
                    middle_name=mid,
                    last_name=last,
                    sex="Male" if is_male else "Female",
                    birthdate=date(2013, random.randint(1, 12), random.randint(1, 28)),
                    mother_tongue="Cebuano",
                    religion="Roman Catholic",
                    house_street_sitio="Zone 4",
                    barangay=random.choice(BARANGAYS),
                    municipality_city="Cagayan de Oro City",
                    province="Misamis Oriental",
                    father_name=f"Roberto {last}",
                    mother_maiden_name=f"Elena {mid}",
                    guardian_name=f"Elena {mid} {last}",
                    guardian_relationship="Mother",
                    parent_contact=f"09{random.randint(150000000, 999999999)}",
                    qr_token=secrets.token_urlsafe(24),
                    is_active=True,
                )
                Enrollment.objects.create(
                    student=student,
                    section=sec,
                    school_year=sy,
                    enrollment_date=date(2026, 6, 5),
                    status="ENROLLED",
                )
                added += 1

    print(f"[OK] Synced {school.school_name} ({sy.code}). Added {added} new learner(s).")


def sync_sequences():
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        for model in (SchoolYear, GradeLevel, Room, Section, Subject, ClassPeriod, TeacherProfile, Student, Enrollment):
            tbl = model._meta.db_table
            cursor.execute(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), COALESCE(MAX(id), 1)) FROM \"{tbl}\";")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-section", type=int, default=0, help="Target student count per active section.")
    args = parser.parse_args()
    seed_school(per_section=args.per_section)
    sync_sequences()
