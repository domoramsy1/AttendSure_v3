r"""
AttendSure - School, Timetable & Learner Seeder (Strict 3NF Schema)
Run:
  python database\seed_school.py                  # Seeds school profile, schedules & baseline section
  python database\seed_school.py --per-section 40 # Populates 40 learners per section across active sections
"""

import argparse
from datetime import date, time
from decimal import Decimal
import random
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from apps.accounts.models import Department, PositionTitle, TeacherProfile, UserProfile
from apps.campus.models import CampusBoundary
from apps.school.models import (
    AdministrativeDivision,
    Building,
    ClassPeriod,
    GradeLevel,
    Room,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from apps.students.models import AddressLocation, Enrollment, Student

User = get_user_model()

BOYS = [
    "Juan Miguel", "Christian Paul", "Mark Joshua", "Angelo Gabriel",
    "Daniel Joseph", "Carl Jerome", "Paolo Miguel", "Nathaniel Lance",
]
GIRLS = [
    "Maria Cristina", "Lyka Marie", "Hazel Jane", "Samantha Joy",
    "Patricia Ann", "Kathryn Mae", "Hannah Sofia", "Andrea Nicole",
]
SURNAMES = [
    "Dela Cruz", "Santos", "Reyes", "Bautista", "Garcia", "Mendoza",
    "Villanueva", "Ramos", "Aquino", "Morales", "Eduave", "Gutierrez",
]
BARANGAYS = [
    "Macasandig", "Nazareth", "Carmen", "Kauswagan",
    "Balulang", "Gusa", "Cugman", "Camaman-an",
]


@transaction.atomic
def seed_school(per_section: int = 0):
    sy, _ = SchoolYear.objects.update_or_create(
        name="2026-2027",
        defaults={
            "start_date": date(2026, 6, 1),
            "baseline_cutoff_date": date(2026, 6, 5),
            "end_date": date(2027, 3, 31),
            "is_active": True,
        },
    )

    admin_dept, _ = Department.objects.get_or_create(code="ADMIN", defaults={"name": "Administration"})
    jhs_dept, _ = Department.objects.get_or_create(code="JHS", defaults={"name": "Junior High School"})
    principal_pos, _ = PositionTitle.objects.get_or_create(title="Secondary School Principal IV")
    teacher_pos, _ = PositionTitle.objects.get_or_create(title="Teacher III")

    principal_user, created_p = User.objects.get_or_create(
        username="eleanor.roa",
        defaults={
            "first_name": "Eleanor",
            "last_name": "Roa",
            "email": "eleanor.roa@attendsure.edu.ph",
            "is_active": True,
        },
    )
    if created_p:
        principal_user.set_password("Principal@123")
        principal_user.save()
    UserProfile.objects.update_or_create(user=principal_user, defaults={"role": "PRINCIPAL"})

    principal, _ = TeacherProfile.objects.update_or_create(
        employee_id="DEPED-SH-001",
        defaults={
            "user": principal_user,
            "department": admin_dept,
            "position": principal_pos,
            "can_handle_classes": False,
        },
    )

    division, _ = AdministrativeDivision.objects.get_or_create(
        region="Region X",
        division="Cagayan de Oro City",
        district="District II",
    )

    boundary, _ = CampusBoundary.objects.update_or_create(
        campus_name="Macasandig National High School",
        defaults={
            "center_latitude": Decimal("8.485800"),
            "center_longitude": Decimal("124.656700"),
            "radius_meters": 150,
            "loafing_grace_minutes": 10,
            "is_active": True,
        },
    )

    school, _ = SchoolSettings.objects.update_or_create(
        school_id="304033",
        defaults={
            "school_name": "Macasandig National High School",
            "division_ref": division,
            "active_school_year": sy,
            "campus_boundary": boundary,
            "address": "Macasandig, Cagayan de Oro City, Misamis Oriental",
            "principal_teacher": principal,
        },
    )

    adv_user, created_u = User.objects.get_or_create(
        username="jerel.eduave",
        defaults={
            "first_name": "Jerel",
            "last_name": "Eduave",
            "email": "jerel.eduave@attendsure.edu.ph",
            "is_active": True,
        },
    )
    if created_u:
        adv_user.set_password("Teacher@123")
        adv_user.save()
    UserProfile.objects.update_or_create(user=adv_user, defaults={"role": "TEACHER"})

    adviser, _ = TeacherProfile.objects.update_or_create(
        employee_id="DEPED-TCH-001",
        defaults={
            "user": adv_user,
            "department": jhs_dept,
            "position": teacher_pos,
            "can_handle_classes": True,
        },
    )

    grade7, _ = GradeLevel.objects.update_or_create(
        level_number=7,
        defaults={"code": "G7", "name": "Grade 7", "stage": "JHS"},
    )
    bldg, _ = Building.objects.get_or_create(name="Main Building")
    room101, _ = Room.objects.update_or_create(
        name="Rm 101",
        defaults={"building": bldg, "capacity": 45, "room_type": "LECTURE"},
    )
    diamond, _ = Section.objects.update_or_create(
        school_year=sy,
        grade_level=grade7,
        name="Diamond",
        defaults={"adviser": adviser, "room_name": room101.name, "capacity": 45, "is_active": True},
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
            defaults={
                "teacher": adviser,
                "day_of_week": "ALL_WEEKDAYS",
                "start_time": st_t,
                "end_time": end_t,
                "is_active": True,
            },
        )

    added = 0
    if per_section > 0:
        existing_lrns = set(Student.objects.values_list("lrn", flat=True))
        for sec in Section.objects.filter(is_active=True, school_year=sy).select_related("grade_level"):
            current = Enrollment.objects.filter(section=sec, status="ENROLLED").count()
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
                loc, _ = AddressLocation.objects.get_or_create(
                    barangay=random.choice(BARANGAYS),
                    municipality_city="Cagayan de Oro City",
                    province="Misamis Oriental",
                )
                student = Student.objects.create(
                    lrn=lrn,
                    first_name=first,
                    middle_name=mid,
                    last_name=last,
                    gender="Male" if is_male else "Female",
                    birth_date=date(2013, random.randint(1, 12), random.randint(1, 28)),
                    mother_tongue="Cebuano",
                    religion="Roman Catholic",
                    house_street_sitio="Zone 4",
                    location=loc,
                    father_name=f"Roberto {last}",
                    mother_maiden_name=f"Elena {mid}",
                    guardian_name=f"Elena {mid} {last}",
                    guardian_relationship="Mother",
                    guardian_contact=f"09{random.randint(150000000, 999999999)}",
                    qr_token=secrets.token_urlsafe(24),
                    is_active=True,
                )
                Enrollment.objects.create(
                    student=student,
                    section=sec,
                    enrolled_date=date(2026, 6, 5),
                    status="ENROLLED",
                )
                added += 1

    print(f"[OK] Synced {school.school_name} ({sy.name}). Added {added} new learner(s).")


def sync_sequences():
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        for model in (
            Department, PositionTitle, SchoolYear, GradeLevel, Building, Room,
            Section, Subject, ClassPeriod, TeacherProfile, AddressLocation, Student, Enrollment,
        ):
            tbl = model._meta.db_table
            cursor.execute(
                f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), COALESCE(MAX(id), 1)) FROM \"{tbl}\";"
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-section", type=int, default=0, help="Target student count per active section.")
    args = parser.parse_args()
    seed_school(per_section=args.per_section)
    sync_sequences()
