# AttendSure Backend - School Seed Competition Demo
# File: D:\AttendSure_V3\backend\apps\school\management\commands\seed_competition_demo.py

"""
AttendSure - Demo Dataset Seeder
Run: python manage.py seed_competition_demo

Idempotently seeds a realistic, strict-3NF dataset showcasing:
- 4 school staff demo roles (demo_admin, demo_principal, demo_dept_head, demo_teacher)
- Official school reports (DepEd SF1/SF2/SF4/CSC Form 48 + Ed-Fi v6.0 JSON)
- Live campus geofencing, teacher GPS check-ins, exit passes, and loafing detection
- 30-day student attendance risk scoring and built-in camera QR class scans
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import (
    AuditLog,
    Department,
    PositionTitle,
    TeacherProfile,
    UserProfile,
)
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.campus.models import (
    CampusBoundary,
    LoafingIncident,
    MonthlyTimeRecord,
    TeacherDailyAttendance,
    TeacherLocationPing,
)
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
from common.time_utils import local_day_bounds
from apps.students.models import AddressLocation, Enrollment, Student

User = get_user_model()

DEMO_PASSWORD = "AttendSure2026!"

STUDENTS_SEED = [
    # (lrn, first, middle, last, gender, birth_yr, birth_mo, birth_day, section_key, cct, pattern)
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
    help = "Seeds an idempotent, strict-3NF AttendSure demo dataset for teachers and school leaders."

    @transaction.atomic
    def handle(self, *args, **options):
        today = timezone.localdate()
        now = timezone.localtime()

        self.stdout.write(self.style.NOTICE("Seeding AttendSure 3NF Demo Dataset..."))

        # 1. School Year
        sy, _ = SchoolYear.objects.update_or_create(
            name="2026-2027",
            defaults={
                "start_date": date(2026, 6, 1),
                "baseline_cutoff_date": date(2026, 6, 5),
                "end_date": date(2027, 3, 31),
                "is_active": True,
            },
        )

        # 2. Departments, Positions & 4 School Staff Accounts (Strict 3NF)
        dept_admin, _ = Department.objects.get_or_create(
            code="ADMIN", defaults={"name": "Administration"}
        )
        dept_stem, _ = Department.objects.get_or_create(
            code="STEM", defaults={"name": "STEM & Mathematics"}
        )
        dept_sci, _ = Department.objects.get_or_create(
            code="SCI", defaults={"name": "Science & ICT"}
        )
        dept_it, _ = Department.objects.get_or_create(
            code="ICT", defaults={"name": "Information Technology"}
        )

        pos_principal, _ = PositionTitle.objects.get_or_create(
            title="Secondary School Principal IV"
        )
        pos_master, _ = PositionTitle.objects.get_or_create(title="Master Teacher I")
        pos_head, _ = PositionTitle.objects.get_or_create(title="Head Teacher III")
        pos_ict, _ = PositionTitle.objects.get_or_create(title="ICT Systems Coordinator")

        def ensure_staff(
            *,
            username: str,
            first: str,
            middle: str,
            last: str,
            email: str,
            role: str,
            employee_id: str,
            department: Department,
            position: PositionTitle,
            phone: str,
            can_handle_classes: bool,
            device_model: str,
            superuser: bool = False,
        ):
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

            UserProfile.objects.update_or_create(
                user=user,
                defaults={
                    "role": role,
                    "failed_login_attempts": 0,
                    "locked_until": None,
                },
            )

            teacher, _ = TeacherProfile.objects.update_or_create(
                user=user,
                defaults={
                    "employee_id": employee_id,
                    "middle_name": middle,
                    "department": department,
                    "position": position,
                    "contact_number": phone,
                    "can_handle_classes": can_handle_classes,
                    "device_model": device_model,
                },
            )
            return user, teacher

        admin_user, admin_teacher = ensure_staff(
            username="demo_admin",
            first="Alex",
            middle="R.",
            last="Mercer",
            email="admin@attendsure.edu",
            role="ADMIN",
            employee_id="EMP-2026-000",
            department=dept_it,
            position=pos_ict,
            phone="+639171000000",
            can_handle_classes=False,
            device_model="Samsung Galaxy S24",
            superuser=True,
        )
        principal_user, principal_teacher = ensure_staff(
            username="demo_principal",
            first="Elena",
            middle="M.",
            last="Reyes",
            email="principal@attendsure.edu",
            role="PRINCIPAL",
            employee_id="EMP-2026-001",
            department=dept_admin,
            position=pos_principal,
            phone="+639171000001",
            can_handle_classes=False,
            device_model="iPhone 15 Pro",
        )
        teacher_user, adviser_teacher = ensure_staff(
            username="demo_teacher",
            first="Marco",
            middle="L.",
            last="Santos",
            email="teacher@attendsure.edu",
            role="TEACHER",
            employee_id="EMP-2026-002",
            department=dept_stem,
            position=pos_master,
            phone="+639171000002",
            can_handle_classes=True,
            device_model="Samsung Galaxy A55",
        )
        dept_head_user, dept_head_teacher = ensure_staff(
            username="demo_dept_head",
            first="Clarissa",
            middle="D.",
            last="Villanueva",
            email="depthead@attendsure.edu",
            role="DEPT_HEAD",
            employee_id="EMP-2026-003",
            department=dept_sci,
            position=pos_head,
            phone="+639171000003",
            can_handle_classes=True,
            device_model="Google Pixel 8",
        )

        # 3. Campus Boundary & School Settings
        boundary, _ = CampusBoundary.objects.update_or_create(
            campus_name="Macasandig National High School — Main Campus",
            defaults={
                "center_latitude": Decimal("8.485800"),
                "center_longitude": Decimal("124.656700"),
                "radius_meters": 150,
                "loafing_grace_minutes": 10,
                "duty_start_time": time(7, 30),
                "duty_end_time": time(17, 0),
                "enforce_geofence_checkin": True,
                "is_active": True,
            },
        )

        div_obj, _ = AdministrativeDivision.objects.get_or_create(
            region="Region X — Northern Mindanao",
            division="Cagayan de Oro City",
            district="South District",
        )

        school_obj = SchoolSettings.objects.first()
        if school_obj:
            school_obj.principal_teacher = principal_teacher
            school_obj.active_school_year = sy
            school_obj.division_ref = school_obj.division_ref or div_obj
            school_obj.campus_boundary = school_obj.campus_boundary or boundary
            school_obj.save()
        else:
            SchoolSettings.objects.create(
                school_id="304118",
                school_name="Macasandig National High School",
                division_ref=div_obj,
                active_school_year=sy,
                campus_boundary=boundary,
                address="Macasandig, Cagayan de Oro City, 9000",
                contact_number="+63888571234",
                email="pilot@attendsure.edu",
                principal_teacher=principal_teacher,
                superintendent_name="Dr. Cherry Mae L. Limbaco-Reyes",
            )

        # 4. Grade Levels, Buildings, Rooms, Sections, Subjects, Class Periods
        g7, _ = GradeLevel.objects.update_or_create(
            level_number=7, defaults={"code": "G7", "name": "Grade 7", "stage": "JHS"}
        )
        g8, _ = GradeLevel.objects.update_or_create(
            level_number=8, defaults={"code": "G8", "name": "Grade 8", "stage": "JHS"}
        )
        g10, _ = GradeLevel.objects.update_or_create(
            level_number=10,
            defaults={"code": "G10", "name": "Grade 10", "stage": "JHS"},
        )

        bldg_main, _ = Building.objects.get_or_create(name="Main Wing")
        bldg_innov, _ = Building.objects.get_or_create(name="Innovation Wing")

        Room.objects.update_or_create(
            name="Room 101 - STEM Lab",
            defaults={"building": bldg_main, "capacity": 45},
        )
        Room.objects.update_or_create(
            name="Room 102 - Rizal Hall",
            defaults={"building": bldg_main, "capacity": 45},
        )
        Room.objects.update_or_create(
            name="Room 204 - ICT Center",
            defaults={"building": bldg_innov, "capacity": 40},
        )

        sec_newton, _ = Section.objects.update_or_create(
            school_year=sy,
            grade_level=g7,
            name="Newton",
            defaults={
                "adviser": adviser_teacher,
                "room_name": "Room 101 - STEM Lab",
                "code": "G7-NEWTON",
                "is_active": True,
            },
        )
        sec_rizal, _ = Section.objects.update_or_create(
            school_year=sy,
            grade_level=g8,
            name="Rizal",
            defaults={
                "adviser": dept_head_teacher,
                "room_name": "Room 102 - Rizal Hall",
                "code": "G8-RIZAL",
                "is_active": True,
            },
        )
        sec_curie, _ = Section.objects.update_or_create(
            school_year=sy,
            grade_level=g10,
            name="Curie",
            defaults={
                "adviser": adviser_teacher,
                "room_name": "Room 204 - ICT Center",
                "code": "G10-CURIE",
                "is_active": True,
            },
        )
        section_map = {"newton": sec_newton, "rizal": sec_rizal, "curie": sec_curie}

        sub_math, _ = Subject.objects.update_or_create(
            code="MATH-07",
            defaults={
                "title": "Mathematics 7",
                "grade_level": g7,
                "subject_category": "Core",
            },
        )
        sub_eng, _ = Subject.objects.update_or_create(
            code="ENG-07",
            defaults={
                "title": "English Communication 7",
                "grade_level": g7,
                "subject_category": "Core",
            },
        )
        sub_sci, _ = Subject.objects.update_or_create(
            code="SCI-08",
            defaults={
                "title": "Integrated Science 8",
                "grade_level": g8,
                "subject_category": "Core",
            },
        )
        sub_ict, _ = Subject.objects.update_or_create(
            code="ICT-10",
            defaults={
                "title": "Applied Computing & Literacy",
                "grade_level": g10,
                "subject_category": "Applied",
            },
        )

        periods_spec = [
            ("DEMO-P1", sec_newton, sub_math, adviser_teacher, time(7, 30), time(8, 30)),
            ("DEMO-P2", sec_newton, sub_eng, dept_head_teacher, time(8, 30), time(9, 30)),
            ("DEMO-P3", sec_rizal, sub_sci, dept_head_teacher, time(9, 45), time(10, 45)),
            ("DEMO-P4", sec_curie, sub_ict, adviser_teacher, time(10, 45), time(11, 45)),
        ]
        periods_by_section: dict[int, list[ClassPeriod]] = {}
        for code, sec, subj, tch, st_t, en_t in periods_spec:
            cp, _ = ClassPeriod.objects.update_or_create(
                schedule_code=code,
                defaults={
                    "section": sec,
                    "subject": subj,
                    "teacher": tch,
                    "day_of_week": "ALL_WEEKDAYS",
                    "start_time": st_t,
                    "end_time": en_t,
                    "is_active": True,
                },
            )
            periods_by_section.setdefault(sec.id, []).append(cp)

        # 5. Students & Enrollments (Strict 3NF — no parent user accounts)
        default_loc, _ = AddressLocation.objects.get_or_create(
            barangay="Macasandig",
            municipality_city="Cagayan de Oro City",
            province="Misamis Oriental",
        )
        seeded_enrollments = []
        for idx, (
            lrn,
            first,
            mid,
            last,
            gender,
            by,
            bm,
            bd,
            sec_key,
            is_cct,
            pattern,
        ) in enumerate(STUDENTS_SEED):
            sec = section_map[sec_key]
            contact = f"+63917555{1000 + idx:04d}"
            student, _ = Student.objects.update_or_create(
                lrn=lrn,
                defaults={
                    "first_name": first,
                    "middle_name": mid,
                    "last_name": last,
                    "gender": gender,
                    "birth_date": date(by, bm, bd),
                    "mother_tongue": "Cebuano / English",
                    "religion": "Roman Catholic" if idx % 3 else "Islam",
                    "house_street_sitio": f"Zone {(idx % 6) + 1}, Macasandig",
                    "location": default_loc,
                    "father_name": f"Roberto {last}",
                    "mother_maiden_name": f"Elena {mid}",
                    "guardian_name": f"Rosa {last}",
                    "guardian_relationship": "Mother",
                    "guardian_contact": contact,
                    "is_active": True,
                },
            )
            enrollment, _ = Enrollment.objects.update_or_create(
                student=student,
                section=sec,
                defaults={
                    "enrolled_date": date(2026, 6, 2),
                    "enrollment_type": "REGULAR",
                    "status": "ENROLLED",
                    "is_cct_recipient": is_cct,
                    "cct_id_number": f"4PS-2026-{idx + 101}" if is_cct else "",
                },
            )
            seeded_enrollments.append((enrollment, sec, pattern))

        # 6. 14 Recent School Days of DailyAttendance & ClassAttendance
        school_days = []
        cursor = today
        while len(school_days) < 14:
            if cursor.weekday() < 5 or cursor == today:
                school_days.append(cursor)
            cursor -= timedelta(days=1)

        for day_idx, att_date in enumerate(school_days):
            for st_idx, (enr, sec, pattern) in enumerate(seeded_enrollments):
                if pattern == "critical_sardo":
                    if day_idx in (0, 1, 2, 3, 5, 7, 9):
                        st_status = "ABSENT"
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
                    enrollment=enr,
                    attendance_date=att_date,
                    defaults={
                        "time_in": time(7, 35) if st_status != "ABSENT" else None,
                        "status": st_status,
                        "recorded_by": sec.adviser or adviser_teacher,
                        "remarks": (
                            "Flagged for guardian follow-up"
                            if pattern == "critical_sardo" and st_status == "ABSENT"
                            else ""
                        ),
                    },
                )

                sec_periods = periods_by_section.get(sec.id, [])
                for p_idx, period in enumerate(sec_periods):
                    # Leave one early-warning student missing Period 2 today to illustrate class cutting detection
                    if day_idx == 0 and pattern == "early_warning" and p_idx == 1:
                        continue
                    scan_hour = min(16, period.start_time.hour)
                    scan_minute = min(55, (st_idx * 2 + p_idx * 5) % 50)
                    scanned_dt = timezone.make_aware(
                        datetime.combine(att_date, time(scan_hour, scan_minute, 10))
                    )
                    ClassAttendance.objects.update_or_create(
                        enrollment=enr,
                        class_period=period,
                        attendance_date=att_date,
                        defaults={
                            "recorded_by": period.teacher or adviser_teacher,
                            "scanned_at": scanned_dt,
                            "scan_method": "QR" if st_status != "ABSENT" else "MANUAL",
                            "status": st_status,
                        },
                    )

        # 7. Teacher Daily Attendance, GPS Location Pings & Monthly DTR
        for teacher in (
            principal_teacher,
            adviser_teacher,
            dept_head_teacher,
            admin_teacher,
        ):
            for att_date in school_days[:10]:
                t_in = timezone.make_aware(datetime.combine(att_date, time(7, 42)))
                t_out = (
                    timezone.make_aware(datetime.combine(att_date, time(16, 48)))
                    if att_date < today
                    else None
                )
                TeacherDailyAttendance.objects.update_or_create(
                    teacher=teacher,
                    attendance_date=att_date,
                    defaults={
                        "boundary": boundary,
                        "time_in": t_in,
                        "time_out": t_out,
                        "checkin_latitude": Decimal("8.485812"),
                        "checkin_longitude": Decimal("124.656715"),
                        "checkout_latitude": Decimal("8.485810") if t_out else None,
                        "checkout_longitude": Decimal("124.656710") if t_out else None,
                        "device_id": f"DEMO-DEVICE-{teacher.employee_id}",
                        "face_verified_on_device": True,
                        "status": "ON_TIME",
                    },
                )
                for ping_time in (time(7, 45), time(12, 2), time(13, 5)):
                    ts = timezone.make_aware(datetime.combine(att_date, ping_time))
                    if not TeacherLocationPing.objects.filter(
                        teacher=teacher, recorded_at=ts
                    ).exists():
                        TeacherLocationPing.objects.create(
                            teacher=teacher,
                            boundary=boundary,
                            latitude=Decimal("8.485812"),
                            longitude=Decimal("124.656715"),
                            accuracy_meters=8.5,
                            zone_status="INSIDE",
                            device_id=f"DEMO-DEVICE-{teacher.employee_id}",
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

        # 8. Exit Passes & Loafing Incidents
        first_enrollment = seeded_enrollments[0][0]
        early_warning_enrollment = seeded_enrollments[4][0]

        ExitPass.objects.update_or_create(
            pass_number="EP-DEMO-2026-001",
            defaults={
                "pass_scope": "STUDENT",
                "enrollment": first_enrollment,
                "teacher": None,
                "issued_by": teacher_user,
                "pass_type": "Clinic / Medical Clearance",
                "reason": "Scheduled dental follow-up with guardian escort.",
                "destination": "City Health Dental Clinic",
                "issued_at": now - timedelta(minutes=30),
                "valid_until": now + timedelta(hours=3),
                "returned_at": None,
                "is_cancelled": False,
            },
        )
        ExitPass.objects.update_or_create(
            pass_number="EP-DEMO-2026-002",
            defaults={
                "pass_scope": "TEACHER",
                "enrollment": None,
                "teacher": adviser_teacher,
                "issued_by": principal_user,
                "pass_type": "Official Travel Order",
                "reason": "Division STEM Coaches Briefing at Division Office.",
                "destination": "DepEd Division Office",
                "issued_at": now + timedelta(hours=1),
                "valid_until": now + timedelta(hours=5),
                "returned_at": None,
                "is_cancelled": False,
            },
        )

        # Seed 1 excused teacher geofence alert from 2 days ago + 1 open student cutting alert today
        if not LoafingIncident.objects.filter(
            teacher=dept_head_teacher,
            incident_type="TEACHER_OUTSIDE_GEOFENCE",
        ).exists():
            outside_ping = TeacherLocationPing.objects.create(
                teacher=dept_head_teacher,
                boundary=boundary,
                latitude=Decimal("8.489500"),
                longitude=Decimal("124.659800"),
                accuracy_meters=12.0,
                zone_status="LOAFING_ALERT",
                device_id=f"DEMO-DEVICE-{dept_head_teacher.employee_id}",
                recorded_at=now - timedelta(days=2),
            )
            LoafingIncident.objects.create(
                incident_type="TEACHER_OUTSIDE_GEOFENCE",
                status="EXCUSED",
                teacher=dept_head_teacher,
                trigger_ping=outside_ping,
                detected_at=now - timedelta(days=2),
                resolved_at=now - timedelta(days=2) + timedelta(hours=1),
                remarks="Division Office Official Curriculum Briefing — Verified against Memorandum No. 2026-114.",
                reviewed_by=principal_user,
            )

        newton_p2 = periods_by_section[sec_newton.id][1]
        today_start, today_end = local_day_bounds(today)
        if not LoafingIncident.objects.filter(
            enrollment=early_warning_enrollment,
            class_period=newton_p2,
            incident_type="STUDENT_CUTTING_CLASS",
            detected_at__gte=today_start,
            detected_at__lt=today_end,
        ).exists():
            LoafingIncident.objects.create(
                incident_type="STUDENT_CUTTING_CLASS",
                status="OPEN",
                enrollment=early_warning_enrollment,
                class_period=newton_p2,
                detected_at=now,
                remarks="Present in Period 1 (MATH-07), missing in Period 2 (ENG-07) with no active exit pass.",
            )

        if AuditLog.objects.count() < 4:
            for table, action, detail in [
                (
                    "class_attendance",
                    "CREATE",
                    {"summary": "Camera QR check-in verified (Grade 7 - Newton)"},
                ),
                (
                    "deped_reports",
                    "EXPORT",
                    {"report_name": "SF2 Monthly Attendance Register"},
                ),
                (
                    "edfi_export",
                    "EXPORT",
                    {"standard": "Ed-Fi v6.0", "anonymize": True},
                ),
                (
                    "teacher_location_pings",
                    "VERIFY",
                    {"geofence": "Inside 150m Campus Boundary"},
                ),
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
                "AttendSure 3NF Demo Dataset seeded successfully!\n"
                "Staff Demo Accounts (password: AttendSure2026!):\n"
                "  - Admin:           demo_admin\n"
                "  - Principal:       demo_principal\n"
                "  - Department Head: demo_dept_head\n"
                "  - Teacher:         demo_teacher"
            )
        )
