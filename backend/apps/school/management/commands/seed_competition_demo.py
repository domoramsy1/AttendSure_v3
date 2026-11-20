"""
AttendSure - Competition & Investor Demo Seeder
Run: python manage.py seed_competition_demo

Idempotently seeds a realistic, judge-ready dataset showcasing:
- 4 instant Judge Demo roles (demo_admin, demo_principal, demo_teacher, demo_parent)
- Dual Compliance readiness (DepEd PH SF1/SF2/SF4/DTR + Ed-Fi v6.0 International JSON)
- Live UN SDG 4 / 5 / 8 / 12-13 / 16 impact counters (zero fake frontend mocks)
- 30-day SARDO Dropout Early-Warning risk scoring (Critical + Early Warning cohorts)
- Live Emergency Campus Roll-Call headcount, Campus GPS telemetry, Exit Passes & Parent Chat
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import AuditLog, TeacherProfile, UserProfile
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.campus.models import BoundaryAlert, CampusBoundary, MonthlyTimeRecord, TeacherLocationLog
from apps.messaging.models import ChatMessage, Notification
from apps.school.models import (
    ClassPeriod,
    ClassPeriodDay,
    GradeLevel,
    Room,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from apps.students.models import Enrollment, Student

User = get_user_model()

DEMO_PASSWORD = "AttendSure2026!"

STUDENTS_SEED = [
    # (lrn, first, middle, last, sex, birth_yr, birth_mo, birth_day, section_key, cct, pattern)
    ("127901260001", "Mateo", "Cruz", "Alvarez", "Male", 2012, 3, 14, "newton", True, "present"),
    ("127901260002", "Sofia", "Reyes", "Bautista", "Female", 2012, 7, 22, "newton", False, "present"),
    ("127901260003", "Lucas", "Diaz", "Castillo", "Male", 2012, 5, 8, "newton", True, "critical_sardo"),
    ("127901260004", "Amina", "Santos", "Dela Cruz", "Female", 2012, 9, 19, "newton", False, "present"),
    ("127901260005", "Ethan", "Mendoza", "Estrada", "Male", 2012, 1, 30, "newton", False, "early_warning"),
    ("127901260006", "Chloe", "Tan", "Fernandez", "Female", 2012, 11, 5, "newton", True, "present"),
    ("127901260007", "Noah", "Lim", "Garcia", "Male", 2012, 4, 17, "newton", False, "late"),
    ("127901260008", "Zara", "Villanueva", "Hernandez", "Female", 2012, 8, 2, "newton", False, "present"),
    ("127901260009", "Liam", "Ocampo", "Ignacio", "Male", 2011, 6, 11, "rizal", True, "present"),
    ("127901260010", "Maya", "Flores", "Jimenez", "Female", 2011, 2, 25, "rizal", False, "critical_sardo"),
    ("127901260011", "Gabriel", "Aquino", "Katigbak", "Male", 2011, 10, 9, "rizal", False, "present"),
    ("127901260012", "Isabella", "Ramos", "Lopez", "Female", 2011, 12, 18, "rizal", True, "early_warning"),
    ("127901260013", "Daniel", "Morales", "Magsaysay", "Male", 2011, 3, 27, "rizal", False, "present"),
    ("127901260014", "Hannah", "Torres", "Navarro", "Female", 2011, 5, 13, "rizal", False, "present"),
    ("127901260015", "Rafael", "Gomez", "Ortega", "Male", 2011, 7, 4, "rizal", True, "late"),
    ("127901260016", "Elena", "Salazar", "Pascual", "Female", 2011, 9, 29, "rizal", False, "present"),
    ("127901260017", "Adrian", "Bautista", "Quinto", "Male", 2009, 4, 6, "curie", False, "present"),
    ("127901260018", "Nadia", "Vargas", "Roldan", "Female", 2009, 8, 15, "curie", True, "present"),
    ("127901260019", "Marco", "Pineda", "Soriano", "Male", 2009, 1, 21, "curie", False, "early_warning"),
    ("127901260020", "Camille", "Serrano", "Tolentino", "Female", 2009, 6, 30, "curie", False, "present"),
    ("127901260021", "Joshua", "Cabrera", "Uy", "Male", 2009, 11, 12, "curie", True, "present"),
    ("127901260022", "Priya", "Del Rosario", "Valdez", "Female", 2009, 2, 10, "curie", False, "present"),
    ("127901260023", "Kian", "Velasco", "Yap", "Male", 2009, 5, 24, "curie", False, "present"),
    ("127901260024", "Leila", "Chua", "Zamora", "Female", 2009, 10, 3, "curie", True, "present"),
]


class Command(BaseCommand):
    help = "Seeds an idempotent, international competition & investor demo dataset for AttendSure."

    @transaction.atomic
    def handle(self, *args, **options):
        today = timezone.localdate()
        now = timezone.localtime()

        self.stdout.write(self.style.NOTICE("Seeding AttendSure International Competition Demo Dataset..."))

        # 1. School Year & School Settings & Campus Geofence
        sy, _ = SchoolYear.objects.update_or_create(
            code="2026-2027",
            defaults={
                "start_date": date(2026, 6, 1),
                "baseline_cutoff_date": date(2026, 6, 5),
                "end_date": date(2027, 3, 31),
                "is_active": True,
            },
        )

        # 2. Demo Staff Profiles & Judge Demo User Accounts
        principal_teacher, _ = TeacherProfile.objects.update_or_create(
            employee_id="EMP-2026-001",
            defaults={
                "first_name": "Elena",
                "middle_name": "M.",
                "last_name": "Reyes",
                "position": "Secondary School Principal IV",
                "department": "Administration",
                "contact_number": "+639171000001",
                "email": "principal@attendsure.edu",
                "can_teach": False,
                "is_active": True,
                "device_model": "iPhone 15 Pro",
            },
        )
        adviser_teacher, _ = TeacherProfile.objects.update_or_create(
            employee_id="EMP-2026-002",
            defaults={
                "first_name": "Marco",
                "middle_name": "L.",
                "last_name": "Santos",
                "position": "Master Teacher I",
                "department": "STEM & Mathematics",
                "contact_number": "+639171000002",
                "email": "teacher@attendsure.edu",
                "can_teach": True,
                "is_active": True,
                "device_model": "Samsung Galaxy A55",
            },
        )
        dept_head_teacher, _ = TeacherProfile.objects.update_or_create(
            employee_id="EMP-2026-003",
            defaults={
                "first_name": "Clarissa",
                "middle_name": "D.",
                "last_name": "Villanueva",
                "position": "Head Teacher III",
                "department": "Science & ICT",
                "contact_number": "+639171000003",
                "email": "depthead@attendsure.edu",
                "can_teach": True,
                "is_active": True,
                "device_model": "Google Pixel 8",
            },
        )
        admin_teacher, _ = TeacherProfile.objects.update_or_create(
            employee_id="EMP-2026-000",
            defaults={
                "first_name": "Alex",
                "middle_name": "R.",
                "last_name": "Mercer",
                "position": "ICT Systems Coordinator",
                "department": "Information Technology",
                "contact_number": "+639171000000",
                "email": "admin@attendsure.edu",
                "can_teach": False,
                "is_active": True,
                "device_model": "Samsung Galaxy S24",
            },
        )

        def ensure_account(username, first, last, email, role, teacher=None, phone="", superuser=False):
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": first,
                    "last_name": last,
                    "email": email,
                    "is_active": True,
                    "is_staff": superuser or role in ("ADMIN", "PRINCIPAL"),
                    "is_superuser": superuser,
                },
            )
            if created or not user.check_password(DEMO_PASSWORD):
                user.set_password(DEMO_PASSWORD)
                user.first_name = first
                user.last_name = last
                user.email = email
                user.is_active = True
                user.is_staff = superuser or role in ("ADMIN", "PRINCIPAL")
                user.is_superuser = superuser
                user.save()

            profile, _ = UserProfile.objects.update_or_create(
                user=user,
                defaults={
                    "teacher": teacher,
                    "role": role,
                    "phone_number": phone,
                    "is_teaching": role in ("FACULTY", "DEPT_HEAD"),
                    "is_profile_completed": True,
                    "failed_attempts": 0,
                    "locked_until": None,
                },
            )
            return user, profile

        admin_user, _ = ensure_account(
            "demo_admin", "Alex", "Mercer", "admin@attendsure.edu", "ADMIN", admin_teacher, "+639171000000", True
        )
        principal_user, _ = ensure_account(
            "demo_principal", "Elena", "Reyes", "principal@attendsure.edu", "PRINCIPAL", principal_teacher, "+639171000001"
        )
        teacher_user, _ = ensure_account(
            "demo_teacher", "Marco", "Santos", "teacher@attendsure.edu", "FACULTY", adviser_teacher, "+639171000002"
        )
        ensure_account(
            "demo_dept_head", "Clarissa", "Villanueva", "depthead@attendsure.edu", "DEPT_HEAD", dept_head_teacher, "+639171000003"
        )
        parent_user, _ = ensure_account(
            "demo_parent", "Rosa", "Alvarez", "parent@attendsure.edu", "PARENT", None, "+639178889900"
        )

        # School settings & campus boundary
        school_obj = SchoolSettings.objects.first()
        if school_obj:
            school_obj.principal_teacher = principal_teacher
            school_obj.principal_name = principal_teacher.full_name
            school_obj.academic_year = sy.code
            if not school_obj.school_name:
                school_obj.school_name = "Macasandig National High School — AttendSure Global Pilot"
            school_obj.save()
        else:
            school_obj = SchoolSettings.objects.create(
                school_id="304118",
                school_name="Macasandig National High School — AttendSure Global Pilot",
                region="Region X — Northern Mindanao",
                division="Cagayan de Oro City",
                district="South District",
                academic_year=sy.code,
                address="Macasandig, Cagayan de Oro City, 9000",
                contact_number="+63888571234",
                email="pilot@attendsure.edu",
                principal_teacher=principal_teacher,
                principal_name=principal_teacher.full_name,
                principal_title="Secondary School Principal IV",
                superintendent_name="Dr. Cherry Mae L. Limbaco-Reyes",
                latitude=Decimal("8.4858000"),
                longitude=Decimal("124.6567000"),
                geofence_radius_meters=150,
            )

        boundary = CampusBoundary.objects.first()
        if not boundary:
            CampusBoundary.objects.create(
                name=school_obj.school_name[:100],
                latitude=school_obj.latitude,
                longitude=school_obj.longitude,
                radius_meters=school_obj.geofence_radius_meters or 150,
                is_active=True,
            )

        # 3. Grade Levels, Rooms, Sections, Subjects, Schedules
        g7, _ = GradeLevel.objects.update_or_create(code="G7", defaults={"name": "Grade 7", "stage": "JHS", "level_order": 7})
        g8, _ = GradeLevel.objects.update_or_create(code="G8", defaults={"name": "Grade 8", "stage": "JHS", "level_order": 8})
        g10, _ = GradeLevel.objects.update_or_create(code="G10", defaults={"name": "Grade 10", "stage": "JHS", "level_order": 10})

        r101, _ = Room.objects.update_or_create(name="Room 101 - STEM Lab", defaults={"building": "Main Wing", "capacity": 45})
        r102, _ = Room.objects.update_or_create(name="Room 102 - Rizal Hall", defaults={"building": "Main Wing", "capacity": 45})
        r204, _ = Room.objects.update_or_create(name="Room 204 - ICT Center", defaults={"building": "Innovation Wing", "capacity": 40})

        sec_newton, _ = Section.objects.update_or_create(
            school_year=sy, grade_level=g7, name="Newton",
            defaults={"adviser": adviser_teacher, "room": r101, "room_number": "101", "code": "G7-NEWTON", "is_active": True},
        )
        sec_rizal, _ = Section.objects.update_or_create(
            school_year=sy, grade_level=g8, name="Rizal",
            defaults={"adviser": dept_head_teacher, "room": r102, "room_number": "102", "code": "G8-RIZAL", "is_active": True},
        )
        sec_curie, _ = Section.objects.update_or_create(
            school_year=sy, grade_level=g10, name="Curie",
            defaults={"adviser": adviser_teacher, "room": r204, "room_number": "204", "code": "G10-CURIE", "is_active": True},
        )
        section_map = {"newton": sec_newton, "rizal": sec_rizal, "curie": sec_curie}

        sub_math, _ = Subject.objects.update_or_create(code="MATH-07", defaults={"title": "Mathematics 7", "grade_level": g7, "tier": "Core"})
        sub_sci, _ = Subject.objects.update_or_create(code="SCI-08", defaults={"title": "Integrated Science 8", "grade_level": g8, "tier": "Core"})
        sub_ict, _ = Subject.objects.update_or_create(code="ICT-10", defaults={"title": "Applied Computing & AI Literacy", "grade_level": g10, "tier": "Applied"})
        sub_eng, _ = Subject.objects.update_or_create(code="ENG-07", defaults={"title": "English Communication 7", "grade_level": g7, "tier": "Core"})

        periods_spec = [
            ("DEMO-P1", sec_newton, sub_math, adviser_teacher, r101, time(7, 30), time(8, 30)),
            ("DEMO-P2", sec_newton, sub_eng, dept_head_teacher, r101, time(8, 30), time(9, 30)),
            ("DEMO-P3", sec_rizal, sub_sci, dept_head_teacher, r102, time(9, 45), time(10, 45)),
            ("DEMO-P4", sec_curie, sub_ict, adviser_teacher, r204, time(10, 45), time(11, 45)),
        ]
        periods_by_section = {}
        for code, sec, subj, tch, room, st_t, en_t in periods_spec:
            cp, _ = ClassPeriod.objects.update_or_create(
                code=code,
                defaults={
                    "schedule_code": code,
                    "section": sec,
                    "subject": subj,
                    "teacher": tch,
                    "room": room,
                    "room_number": room.name[:50],
                    "start_time": st_t,
                    "end_time": en_t,
                    "days_of_week": "MON-FRI",
                    "is_active": True,
                },
            )
            for dow in (1, 2, 3, 4, 5):
                ClassPeriodDay.objects.get_or_create(class_period=cp, day_of_week=dow)
            periods_by_section.setdefault(sec.id, []).append(cp)

        # 4. Students & Enrollments
        seeded_students = []
        for idx, (lrn, first, mid, last, sex, by, bm, bd, sec_key, is_cct, pattern) in enumerate(STUDENTS_SEED):
            sec = section_map[sec_key]
            contact = "+639178889900" if idx in (0, 2) else f"+63917555{1000 + idx:04d}"
            student, _ = Student.objects.update_or_create(
                lrn=lrn,
                defaults={
                    "first_name": first,
                    "middle_name": mid,
                    "last_name": last,
                    "sex": sex,
                    "birthdate": date(by, bm, bd),
                    "mother_tongue": "Cebuano / English",
                    "religion": "Roman Catholic" if idx % 3 else "Islam",
                    "house_street_sitio": f"Zone {(idx % 6) + 1}, Macasandig",
                    "barangay": "Macasandig",
                    "municipality_city": "Cagayan de Oro City",
                    "province": "Misamis Oriental",
                    "father_name": f"Roberto {last}",
                    "mother_maiden_name": f"Elena {mid}",
                    "guardian_name": "Rosa Alvarez" if idx in (0, 2) else f"Elena {last}",
                    "guardian_relationship": "Mother",
                    "parent_contact": contact,
                    "parent_user": parent_user if idx in (0, 2) else None,
                    "is_active": True,
                },
            )
            Enrollment.objects.update_or_create(
                student=student,
                school_year=sy,
                defaults={
                    "section": sec,
                    "enrollment_date": date(2026, 6, 2),
                    "enrollment_type": "REGULAR",
                    "status": "ENROLLED",
                    "is_cct_recipient": is_cct,
                    "cct_id_number": f"4PS-2026-{idx + 101}" if is_cct else "",
                },
            )
            seeded_students.append((student, sec, pattern))

        # 5. 14 Recent School Days of Attendance + Today's Live Scans
        school_days = []
        cursor = today
        while len(school_days) < 14:
            if cursor.weekday() < 5 or cursor == today:
                school_days.append(cursor)
            cursor -= timedelta(days=1)

        for day_idx, att_date in enumerate(school_days):
            for st_idx, (student, sec, pattern) in enumerate(seeded_students):
                if pattern == "critical_sardo":
                    if day_idx == 0:
                        st_status = "ABSENT"
                    elif day_idx in (1, 2, 3, 5, 7, 9):
                        st_status = "ABSENT"
                    elif day_idx in (4, 6, 8):
                        st_status = "CUTTING"
                    else:
                        st_status = "LATE"
                elif pattern == "early_warning":
                    if day_idx in (1, 4, 8):
                        st_status = "ABSENT"
                    elif day_idx in (2, 6):
                        st_status = "LATE"
                    else:
                        st_status = "PRESENT"
                elif pattern == "late":
                    st_status = "LATE" if day_idx % 3 == 0 else "PRESENT"
                else:
                    st_status = "PRESENT" if (day_idx + st_idx) % 11 != 0 else "LATE"

                DailyAttendance.objects.update_or_create(
                    student=student,
                    attendance_date=att_date,
                    defaults={
                        "section": sec,
                        "status": st_status,
                        "remarks": "Flagged for home visit" if pattern == "critical_sardo" and st_status == "ABSENT" else "",
                    },
                )

                sec_periods = periods_by_section.get(sec.id, [])
                for p_idx, period in enumerate(sec_periods):
                    scan_hour = min(16, period.start_time.hour)
                    scan_minute = min(55, (st_idx * 2 + p_idx * 5) % 50)
                    scanned_dt = timezone.make_aware(
                        datetime.combine(att_date, time(scan_hour, scan_minute, 10))
                    )
                    ClassAttendance.objects.update_or_create(
                        student=student,
                        class_period=period,
                        attendance_date=att_date,
                        defaults={
                            "recorded_by": period.teacher or adviser_teacher,
                            "scanned_at": scanned_dt,
                            "scan_method": "QR" if st_status != "ABSENT" else "MANUAL",
                            "status": st_status,
                        },
                    )

        # 6. Teacher Campus GPS Telemetry & DTR
        for teacher in (principal_teacher, adviser_teacher, dept_head_teacher, admin_teacher):
            for att_date in school_days[:10]:
                for ping_time in (time(7, 42), time(12, 3), time(13, 5), time(16, 48)):
                    ts = timezone.make_aware(datetime.combine(att_date, ping_time))
                    if not TeacherLocationLog.objects.filter(teacher=teacher, recorded_at=ts).exists():
                        TeacherLocationLog.objects.create(
                            teacher=teacher,
                            latitude=Decimal("8.4858120"),
                            longitude=Decimal("124.6567150"),
                            battery_level=86,
                            is_inside_geofence=True,
                            recorded_at=ts,
                        )
            MonthlyTimeRecord.objects.update_or_create(
                teacher=teacher,
                month=today.month,
                year=today.year,
                defaults={
                    "is_submitted": teacher == adviser_teacher,
                    "submitted_at": now if teacher == adviser_teacher else None,
                    "regular_hours": "7:30 AM - 12:00 PM / 1:00 PM - 5:00 PM",
                    "saturday_hours": "As Required",
                },
            )

        BoundaryAlert.objects.get_or_create(
            teacher=dept_head_teacher,
            incident_date=today - timedelta(days=2),
            defaults={
                "trigger_reason": "Division Office Official Curriculum Briefing (Excused)",
                "status": "EXCUSED",
                "remarks": "Verified against Division Memorandum No. 2026-114.",
            },
        )

        # 7. Gate Exit Passes
        first_student = seeded_students[0][0]
        ExitPass.objects.update_or_create(
            pass_number="GP-DEMO-2026-001",
            defaults={
                "student": first_student,
                "issued_by": adviser_teacher,
                "pass_type": "Medical / Clinic Clearance",
                "reason": "Scheduled pediatric dental follow-up with guardian escort.",
                "valid_from": now - timedelta(minutes=30),
                "valid_until": now + timedelta(hours=3),
                "status": "ACTIVE",
            },
        )
        ExitPass.objects.update_or_create(
            pass_number="GP-DEMO-2026-002",
            defaults={
                "teacher": adviser_teacher,
                "issued_by": adviser_teacher,
                "pass_type": "Official Travel Order",
                "reason": "Regional STEM Robotics Coaches Orientation at Division Office.",
                "valid_from": now + timedelta(hours=1),
                "valid_until": now + timedelta(hours=5),
                "status": "PENDING",
            },
        )

        # 8. Notifications, Parent-Teacher Chat & Tamper-Evident Audit Logs
        if not Notification.objects.filter(recipient=parent_user, title__contains="Arrived Safely").exists():
            Notification.objects.create(
                recipient=parent_user,
                student=first_student,
                title=f"{first_student.first_name} Arrived Safely in Class",
                message=f"Signed QR check-in verified for {first_student.full_name} in Mathematics 7 (Room 101).",
                category="ATTENDANCE",
                is_pushed=True,
                is_read=False,
            )
            Notification.objects.create(
                recipient=parent_user,
                student=seeded_students[2][0],
                title="Early-Warning Attendance Follow-Up",
                message="Your child's adviser has requested a brief check-in regarding recent absences.",
                category="CUTTING_ALERT",
                is_pushed=True,
                is_read=False,
            )

        if not ChatMessage.objects.filter(student=first_student, teacher=adviser_teacher, parent=parent_user).exists():
            ChatMessage.objects.create(
                student=first_student,
                teacher=adviser_teacher,
                parent=parent_user,
                sender=teacher_user,
                body="Good morning Ms. Alvarez! Mateo checked in on time for Mathematics 7 and scored 98% on today's quiz.",
                is_read=False,
            )
            ChatMessage.objects.create(
                student=first_student,
                teacher=adviser_teacher,
                parent=parent_user,
                sender=parent_user,
                body="Thank you Sir Marco! We really appreciate the real-time arrival notifications on AttendSure.",
                is_read=True,
            )

        if AuditLog.objects.count() < 5:
            for table, action, detail in [
                ("subject_attendance_logs", "CREATE", {"summary": "Batch signed QR check-in verified (Grade 7 - Newton)"}),
                ("deped_reports", "EXPORT", {"report_name": "SF2 Monthly Attendance Register"}),
                ("edfi_export", "EXPORT", {"standard": "Ed-Fi v6.0", "anonymize": True}),
                ("faculty_heartbeats", "VERIFY", {"geofence": "Inside 150m Campus Boundary"}),
            ]:
                AuditLog.objects.create(
                    table_name=table,
                    record_id=1,
                    action=action,
                    new_data=detail,
                    performed_by=admin_user,
                    client_ip="127.0.0.1",
                )

        self.stdout.write(
            self.style.SUCCESS(
                "AttendSure Competition Demo Dataset seeded successfully!\n"
                "Demo Accounts (password: AttendSure2026!):\n"
                "  - Admin:     demo_admin\n"
                "  - Principal: demo_principal\n"
                "  - Teacher:   demo_teacher\n"
                "  - Parent:    demo_parent\n"
                "1-Click Judge Demo Login is active whenever DEBUG=True or ENABLE_JUDGE_DEMO=True."
            )
        )
