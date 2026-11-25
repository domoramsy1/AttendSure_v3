"""
AttendSure - Live Conflict Detection, DepEd Adviser Workload, Field Availability & Auto-Enrollment Tests
Run: python manage.py test apps.school.tests --verbosity=2
"""

from datetime import date, time
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from apps.accounts.models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile
from apps.attendance.selectors import get_adviser_matrix, get_assigned_classes_with_class_lists
from apps.school.models import ClassPeriod, GradeLevel, Room, SchoolYear, Section, Subject
from apps.students.models import Student

User = get_user_model()


class AcademicConflictAndAvailabilityTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.dept, _ = Department.objects.get_or_create(code="STEM", defaults={"name": "STEM"})
        self.pos_teacher, _ = PositionTitle.objects.get_or_create(title="Teacher III")
        self.pos_clerk, _ = PositionTitle.objects.get_or_create(title="Administrative Assistant")

        self.admin_user = User.objects.create_user(
            username="conflict_admin",
            password="AttendSure2026!",
            first_name="Alex",
            last_name="Admin",
            email="conflict.admin@school.edu.ph",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user,
            employee_id="EMP-CONF-ADM",
            department=self.dept,
            position=self.pos_teacher,
            contact_number="+639171001001",
            can_handle_classes=True,
        )

        self.teacher_1_user = User.objects.create_user(
            username="conflict_teacher1",
            password="AttendSure2026!",
            first_name="Maria",
            last_name="Santos",
            email="maria.santos@school.edu.ph",
        )
        UserProfile.objects.create(user=self.teacher_1_user, role="TEACHER")
        self.teacher_1 = TeacherProfile.objects.create(
            user=self.teacher_1_user,
            employee_id="EMP-CONF-T1",
            department=self.dept,
            position=self.pos_teacher,
            contact_number="+639171001002",
            can_handle_classes=True,
        )

        self.teacher_2_user = User.objects.create_user(
            username="conflict_teacher2",
            password="AttendSure2026!",
            first_name="Jose",
            last_name="Rizal",
            email="jose.rizal@school.edu.ph",
        )
        UserProfile.objects.create(user=self.teacher_2_user, role="TEACHER")
        self.teacher_2 = TeacherProfile.objects.create(
            user=self.teacher_2_user,
            employee_id="EMP-CONF-T2",
            department=self.dept,
            position=self.pos_teacher,
            contact_number="+639171001003",
            can_handle_classes=True,
        )

        self.nonteaching_user = User.objects.create_user(
            username="conflict_clerk",
            password="AttendSure2026!",
            first_name="Lorna",
            last_name="Office",
            email="lorna.office@school.edu.ph",
        )
        UserProfile.objects.create(user=self.nonteaching_user, role="TEACHER")
        self.nonteaching = TeacherProfile.objects.create(
            user=self.nonteaching_user,
            employee_id="EMP-CONF-NT",
            department=self.dept,
            position=self.pos_clerk,
            contact_number="+639171001004",
            can_handle_classes=False,
        )

        self.sy = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.grade7 = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7")
        self.room101 = Room.objects.create(name="Room 101", capacity=45)
        self.room102 = Room.objects.create(name="Room 102", capacity=45)
        self.subj_math = Subject.objects.create(code="MATH7", title="Mathematics 7", grade_level=self.grade7)
        self.subj_eng = Subject.objects.create(code="ENG7", title="English 7", grade_level=self.grade7)

        self.section_newton = Section.objects.create(
            school_year=self.sy,
            grade_level=self.grade7,
            name="Newton",
            adviser=self.teacher_1,
            room_name="Room 101",
            is_active=True,
        )
        self.section_darwin = Section.objects.create(
            school_year=self.sy,
            grade_level=self.grade7,
            name="Darwin",
            adviser=self.teacher_2,
            room_name="Room 101",  # Intentionally shares Room 101 (e.g. AM/PM or MWF/TTH shift)
            is_active=True,
        )

        self.client.force_authenticate(user=self.admin_user)

    def test_deped_second_advisory_requires_explicit_override_and_logs_audit(self):
        # 1. Assigning teacher_1 to a 2nd advisory section fails with 400 by default
        blocked = self.client.post(
            "/api/v1/school/sections/",
            {
                "name": "Galileo",
                "grade_level": self.grade7.id,
                "adviser": self.teacher_1.id,
                "room_name": "Room 102",
            },
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("Allow second advisory class", str(blocked.data))
        self.assertIn("Grade 7 - Newton", str(blocked.data))

        # 2. Turning on allow_multiple_advisories=True succeeds and writes AuditLog
        allowed = self.client.post(
            "/api/v1/school/sections/",
            {
                "name": "Galileo",
                "grade_level": self.grade7.id,
                "adviser": self.teacher_1.id,
                "room_name": "Room 102",
                "allow_multiple_advisories": True,
            },
            format="json",
        )
        self.assertEqual(allowed.status_code, 201, allowed.data)
        sec_id = allowed.data["id"]

        self.assertTrue(
            AuditLog.objects.filter(
                table_name="sections",
                record_id=sec_id,
                action="CREATE",
            ).exists()
        )

        # 3. Updating unrelated field (capacity) on that section succeeds without re-blocking
        patch_cap = self.client.patch(
            f"/api/v1/school/sections/{sec_id}/",
            {"capacity": 48},
            format="json",
        )
        self.assertEqual(patch_cap.status_code, 200, patch_cap.data)

        # 4. Updating another section to assign teacher_1 without override fails, with override succeeds
        patch_blocked = self.client.patch(
            f"/api/v1/school/sections/{self.section_darwin.id}/",
            {"adviser": self.teacher_1.id},
            format="json",
        )
        self.assertEqual(patch_blocked.status_code, 400)

        patch_allowed = self.client.patch(
            f"/api/v1/school/sections/{self.section_darwin.id}/",
            {"adviser": self.teacher_1.id, "allow_multiple_advisories": True},
            format="json",
        )
        self.assertEqual(patch_allowed.status_code, 200, patch_allowed.data)

    def test_nonteaching_staff_rejected_as_adviser_and_subject_teacher(self):
        sec_res = self.client.post(
            "/api/v1/school/sections/",
            {
                "name": "Curie",
                "grade_level": self.grade7.id,
                "adviser": self.nonteaching.id,
                "room_name": "Room 102",
                "allow_multiple_advisories": True,
            },
            format="json",
        )
        self.assertEqual(sec_res.status_code, 400)
        self.assertIn("Non-teaching", str(sec_res.data))

        per_res = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_newton.id,
                "subject": self.subj_math.id,
                "teacher": self.nonteaching.id,
                "day_of_week": "ALL_WEEKDAYS",
                "start_time": "08:00",
                "end_time": "09:00",
            },
            format="json",
        )
        self.assertEqual(per_res.status_code, 400)
        self.assertIn("Non-teaching", str(per_res.data))

    def test_room_double_booking_blocked_on_intersecting_days_and_allowed_on_mwf_vs_tth(self):
        # Newton uses Room 101 on MWF 08:00-09:00 with teacher_1
        first = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_newton.id,
                "subject": self.subj_math.id,
                "teacher": self.teacher_1.id,
                "day_of_week": "MWF",
                "start_time": "08:00",
                "end_time": "09:00",
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201, first.data)

        # Darwin also uses Room 101 on ALL_WEEKDAYS 08:30-09:30 with a different teacher -> room conflict (400)
        room_clash = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_darwin.id,
                "subject": self.subj_eng.id,
                "teacher": self.teacher_2.id,
                "day_of_week": "ALL_WEEKDAYS",
                "start_time": "08:30",
                "end_time": "09:30",
            },
            format="json",
        )
        self.assertEqual(room_clash.status_code, 400)
        self.assertIn("Room 101", str(room_clash.data))

        # Darwin uses Room 101 on TTH 08:00-09:00 (non-intersecting days vs MWF) -> succeeds (201)
        tth_ok = self.client.post(
            "/api/v1/school/periods/",
            {
                "section": self.section_darwin.id,
                "subject": self.subj_eng.id,
                "teacher": self.teacher_2.id,
                "day_of_week": "TTH",
                "start_time": "08:00",
                "end_time": "09:00",
            },
            format="json",
        )
        self.assertEqual(tth_ok.status_code, 201, tth_ok.data)

    def test_live_check_conflict_endpoint_for_sections_and_periods_and_teacher_dropdown(self):
        # Verify teacher dropdown exposes advised_sections
        dropdown = self.client.get("/api/v1/accounts/teachers/dropdown/")
        self.assertEqual(dropdown.status_code, 200)
        t1_row = next((t for t in dropdown.data if t["id"] == self.teacher_1.id), None)
        self.assertIsNotNone(t1_row)
        self.assertIn("Grade 7 - Newton", t1_row["advised_sections"])

        # Mode A: type=section detects duplicate name, existing adviser, and shared room
        sec_check = self.client.get(
            "/api/v1/school/check-conflict/",
            {
                "type": "section",
                "grade_level": self.grade7.id,
                "name": "newton",
                "adviser_id": self.teacher_1.id,
                "room_name": "Room 101",
            },
        )
        self.assertEqual(sec_check.status_code, 200)
        self.assertTrue(sec_check.data["name_taken"])
        self.assertTrue(sec_check.data["adviser_conflict"]["has_existing_advisory"])
        self.assertIn("Grade 7 - Newton", sec_check.data["adviser_conflict"]["existing_sections"])
        self.assertTrue(sec_check.data["adviser_conflict"]["can_handle_classes"])
        self.assertIn("Grade 7 - Newton", sec_check.data["room_in_use_by_sections"])

        # Mode A with exclude_id=section_newton.id -> own name and own advisory excluded cleanly
        sec_self = self.client.get(
            "/api/v1/school/check-conflict/",
            {
                "type": "section",
                "grade_level": self.grade7.id,
                "name": "Newton",
                "adviser_id": self.teacher_1.id,
                "room_name": "Room 101",
                "exclude_id": self.section_newton.id,
            },
        )
        self.assertEqual(sec_self.status_code, 200)
        self.assertFalse(sec_self.data["name_taken"])
        self.assertFalse(sec_self.data["adviser_conflict"]["has_existing_advisory"])
        self.assertEqual(sec_self.data["room_in_use_by_sections"], ["Grade 7 - Darwin"])

        # Mode A with non-teaching staff -> can_handle_classes is False
        sec_nt = self.client.get(
            "/api/v1/school/check-conflict/",
            {"type": "section", "adviser_id": self.nonteaching.id},
        )
        self.assertEqual(sec_nt.status_code, 200)
        self.assertFalse(sec_nt.data["adviser_conflict"]["can_handle_classes"])

        # Mode B: type=period detects section clash, teacher clash, and room clash
        p1 = ClassPeriod.objects.create(
            schedule_code="CHK-P1",
            section=self.section_newton,
            subject=self.subj_math,
            teacher=self.teacher_1,
            day_of_week="MWF",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )

        # Same section + same teacher on MWF overlapping time
        per_clash = self.client.get(
            "/api/v1/school/check-conflict/",
            {
                "type": "period",
                "section_id": self.section_newton.id,
                "subject_id": self.subj_eng.id,
                "teacher_id": self.teacher_1.id,
                "day_of_week": "MWF",
                "start_time": "08:00",
                "end_time": "09:00",
            },
        )
        self.assertEqual(per_clash.status_code, 200)
        self.assertTrue(per_clash.data["has_conflict"])
        self.assertIsNotNone(per_clash.data["section_conflict"])
        self.assertIsNotNone(per_clash.data["teacher_conflict"])

        # Different section sharing Room 101 on Monday -> room conflict
        room_clash = self.client.get(
            "/api/v1/school/check-conflict/",
            {
                "type": "period",
                "section_id": self.section_darwin.id,
                "subject_id": self.subj_eng.id,
                "teacher_id": self.teacher_2.id,
                "day_of_week": "1",
                "start_time": "07:45",
                "end_time": "08:45",
            },
        )
        self.assertEqual(room_clash.status_code, 200)
        self.assertTrue(room_clash.data["has_conflict"])
        self.assertIsNone(room_clash.data["section_conflict"])
        self.assertIsNone(room_clash.data["teacher_conflict"])
        self.assertIsNotNone(room_clash.data["room_conflict"])

        # Same room on TTH (non-intersecting vs MWF) -> zero conflicts
        tth_clear = self.client.get(
            "/api/v1/school/check-conflict/",
            {
                "type": "period",
                "section_id": self.section_darwin.id,
                "subject_id": self.subj_eng.id,
                "teacher_id": self.teacher_2.id,
                "day_of_week": "TTH",
                "start_time": "07:30",
                "end_time": "08:30",
            },
        )
        self.assertEqual(tth_clear.status_code, 200)
        self.assertFalse(tth_clear.data["has_conflict"])

        # Editing p1 itself with exclude_id=p1.id -> zero conflicts
        self_edit = self.client.get(
            "/api/v1/school/check-conflict/",
            {
                "type": "period",
                "section_id": self.section_newton.id,
                "subject_id": self.subj_math.id,
                "teacher_id": self.teacher_1.id,
                "day_of_week": "MWF",
                "start_time": "07:30",
                "end_time": "08:30",
                "exclude_id": p1.id,
            },
        )
        self.assertEqual(self_edit.status_code, 200)
        self.assertFalse(self_edit.data["has_conflict"])

    def test_validate_field_and_uniqueness_checks_while_allowing_sibling_guardian_contact(self):
        existing_student = Student.objects.create(
            lrn="127901269701",
            first_name="Liam",
            last_name="Cruz",
            gender="Male",
            birth_date=date(2013, 3, 10),
            guardian_name="Elena Cruz",
            guardian_contact="+639175551234",
            is_active=True,
        )

        # Check taken fields without exclude_id
        checks = [
            ("username", "CONFLICT_TEACHER1", {"exclude_user_id": self.teacher_1_user.id}),
            ("email", "MARIA.SANTOS@school.edu.ph", {"exclude_teacher_id": self.teacher_1.id}),
            ("employee_id", "emp-conf-t1", {"exclude_teacher_id": self.teacher_1.id}),
            ("contact_number", "09171001002", {"exclude_teacher_id": self.teacher_1.id}),
            ("lrn", "127901269701", {"exclude_id": existing_student.id}),
            ("subject_code", "math7", {"exclude_id": self.subj_math.id}),
            ("room_name", "room 101", {"exclude_id": self.room101.id}),
        ]
        for field_name, val, exclude_params in checks:
            taken_res = self.client.get(
                "/api/v1/accounts/validate-field/",
                {"field": field_name, "value": val},
            )
            self.assertEqual(taken_res.status_code, 200)
            self.assertTrue(taken_res.data["is_taken"], f"Expected {field_name}={val} to be taken")
            self.assertFalse(taken_res.data["available"])

            avail_res = self.client.get(
                "/api/v1/accounts/validate-field/",
                {"field": field_name, "value": val, **exclude_params},
            )
            self.assertEqual(avail_res.status_code, 200)
            self.assertFalse(avail_res.data["is_taken"], f"Expected {field_name}={val} with exclude to be available")
            self.assertTrue(avail_res.data["available"])

        # Duplicate teacher phone or email blocked on UserAccountSerializer & TeacherProfileSerializer
        dup_phone_user = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "brand_new_staff",
                "password": "StrongPassword2026!",
                "first_name": "New",
                "last_name": "Staff",
                "email": "new.staff@school.edu.ph",
                "employee_id": "EMP-CONF-NEW1",
                "contact_number": "09171001002",  # Matches teacher_1's +639171001002
                "role": "TEACHER",
            },
            format="json",
        )
        self.assertEqual(dup_phone_user.status_code, 400)

        dup_email_teacher = self.client.post(
            "/api/v1/accounts/teachers/",
            {
                "employee_id": "EMP-CONF-NEW2",
                "first_name": "Another",
                "last_name": "Teacher",
                "email": "MARIA.SANTOS@school.edu.ph",
                "contact_number": "09179998877",
            },
            format="json",
        )
        self.assertEqual(dup_email_teacher.status_code, 400)

        # Duplicate student LRN blocked with 400
        dup_lrn = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901269701",
                "first_name": "Clone",
                "last_name": "Student",
                "gender": "Male",
                "birth_date": "2013-05-01",
                "guardian_contact": "09175551234",
                "section_id": self.section_newton.id,
            },
            format="json",
        )
        self.assertEqual(dup_lrn.status_code, 400)

        # Sibling with DIFFERENT LRN and IDENTICAL guardian_contact succeeds cleanly (201)
        sibling = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901269702",
                "first_name": "Mia",
                "last_name": "Cruz",
                "gender": "Female",
                "birth_date": "2014-04-12",
                "guardian_name": "Elena Cruz",
                "guardian_contact": "09175551234",
                "section_id": self.section_newton.id,
            },
            format="json",
        )
        self.assertEqual(sibling.status_code, 201, sibling.data)
        self.assertEqual(sibling.data["guardian_contact"], "+639175551234")

    def test_enrolling_student_automatically_inherits_section_periods_and_class_lists(self):
        ClassPeriod.objects.create(
            schedule_code="AUTO-P1",
            section=self.section_newton,
            subject=self.subj_math,
            teacher=self.teacher_1,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(7, 30),
            end_time=time(8, 30),
            is_active=True,
        )
        ClassPeriod.objects.create(
            schedule_code="AUTO-P2",
            section=self.section_newton,
            subject=self.subj_eng,
            teacher=self.teacher_2,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 30),
            end_time=time(9, 30),
            is_active=True,
        )

        created = self.client.post(
            "/api/v1/students/",
            {
                "lrn": "127901269801",
                "first_name": "Sofia",
                "last_name": "Mendoza",
                "gender": "Female",
                "birth_date": "2013-02-14",
                "guardian_name": "Rosa Mendoza",
                "guardian_contact": "09178889900",
                "section_id": self.section_newton.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["scheduled_subjects_count"], 2)
        self.assertEqual(created.data["section_display_label"], "Grade 7 - Newton")

        # Verify student automatically appears in all scheduled periods' class lists
        classes = get_assigned_classes_with_class_lists(user=self.teacher_1_user)
        newton_classes = [c for c in classes if c["section_id"] == self.section_newton.id]
        self.assertEqual(len(newton_classes), 2)
        for cls in newton_classes:
            lrns = [st["lrn"] for st in cls["students"]]
            self.assertIn("127901269801", lrns)

        # Verify student automatically appears in the adviser matrix for a weekday date
        monday = date(2026, 11, 23)
        matrix_data = get_adviser_matrix(
            user=self.teacher_1_user,
            section_id=self.section_newton.id,
            target_date=monday,
        )
        self.assertEqual(len(matrix_data["schedules"]), 2)
        matrix_lrns = [row["lrn"] for row in matrix_data["matrix"]]
        self.assertIn("127901269801", matrix_lrns)

    def test_transparent_png_logo_upload_preserves_alpha_and_trims_padding(self):
        import base64
        import io
        import os
        from django.conf import settings
        from PIL import Image

        # Create a 200x120 transparent PNG with a centered 80x40 blue emblem and huge empty padding
        canvas = Image.new("RGBA", (200, 120), (0, 0, 0, 0))
        for y in range(40, 80):
            for x in range(60, 140):
                canvas.putpixel((x, y), (0, 75, 135, 255))

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

        resp = self.client.put(
            "/api/v1/school/settings/",
            {
                "school_name": "Macasandig National High School",
                "left_logo": data_url,
                "right_logo": data_url,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        left_url = resp.data.get("left_logo") or ""
        self.assertTrue(left_url.endswith(".png"), f"Expected transparent PNG, got: {left_url}")

        rel_path = left_url.split("/media/", 1)[-1]
        full_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        self.assertTrue(os.path.exists(full_path))

        try:
            with Image.open(full_path) as saved:
                self.assertEqual(saved.format, "PNG")
                self.assertEqual(saved.mode, "RGBA")
                # Corners remain transparent (alpha == 0), NOT turned solid black
                self.assertEqual(saved.getpixel((0, 0))[3], 0)
                # Empty transparent padding was auto-trimmed cleanly (80x40 + small margin << 200x120)
                self.assertLess(saved.size[0], 110)
                self.assertLess(saved.size[1], 70)
        finally:
            for url in (resp.data.get("left_logo"), resp.data.get("right_logo")):
                if url and "/media/" in url:
                    p = os.path.join(settings.MEDIA_ROOT, url.split("/media/", 1)[-1])
                    if os.path.exists(p):
                        os.remove(p)
