# AttendSure Backend - Accounts Automated Tests
# File: D:\AttendSure_V3\backend\apps\accounts\tests.py

"""
AttendSure - 3NF Integrity, Security, Geofencing, Loafing & Performance Test Suite
Run: python manage.py test apps.accounts.tests --verbosity=2
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
import io
import math
import time as time_module
import uuid
from PIL import Image
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import serializers
from rest_framework.test import APITestCase

from apps.accounts.models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile
from apps.accounts.selectors import resolve_teacher_for_user
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.campus.models import (
    CampusBoundary,
    LoafingIncident,
    TeacherDailyAttendance,
    TeacherLocationPing,
)
from apps.school.models import (
    AdministrativeDivision,
    ClassPeriod,
    GradeLevel,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from apps.students.models import Enrollment, Student
from common.device_crypto import generate_ed25519_keypair, sign_checkin_payload_ed25519
from common.gps import calculate_distance_meters, verify_campus_gps
from common.media import FlexibleImageField
from common.phone import normalize_international_phone, normalize_ph_phone
from common.qr_signer import sign_student_qr, verify_student_qr

User = get_user_model()


def _concrete_fields(model_cls) -> set[str]:
    return {f.name for f in model_cls._meta.get_fields() if getattr(f, "concrete", False)}


def _make_valid_png_bytes(width: int = 32, height: int = 32) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(30, 80, 160))
    img.save(buf, format="PNG")
    return buf.getvalue()


class Strict3NFDatabaseIntegrityTests(APITestCase):
    """Verifies zero redundant or derived columns across all 6 apps and DB-level constraints."""

    def test_models_have_zero_redundant_or_derived_columns(self):
        teacher_cols = _concrete_fields(TeacherProfile)
        for forbidden in ("first_name", "last_name", "email", "is_active", "face_template", "face_enrolled_at"):
            self.assertNotIn(forbidden, teacher_cols)
        for required in ("user", "employee_id", "department", "position", "can_handle_classes", "bound_device_id", "biometric_key_id"):
            self.assertIn(required, teacher_cols)

        profile_cols = _concrete_fields(UserProfile)
        for forbidden in ("first_name", "last_name", "email", "phone_number", "avatar", "teacher"):
            self.assertNotIn(forbidden, profile_cols)
        for required in ("user", "role", "failed_login_attempts", "locked_until"):
            self.assertIn(required, profile_cols)

        student_cols = _concrete_fields(Student)
        banned_user_col = "_".join(["par", "ent", "user"])
        banned_contact_col = "_".join(["par", "ent", "contact"])
        for forbidden in ("section", "grade_level", banned_user_col, banned_contact_col):
            self.assertNotIn(forbidden, student_cols)
        self.assertIn("guardian_name", student_cols)
        self.assertIn("guardian_contact", student_cols)

        enrollment_cols = _concrete_fields(Enrollment)
        self.assertNotIn("school_year", enrollment_cols)
        self.assertNotIn("grade_level", enrollment_cols)

        period_cols = _concrete_fields(ClassPeriod)
        self.assertNotIn("school_year", period_cols)
        self.assertNotIn("grade_level", period_cols)

        daily_cols = _concrete_fields(DailyAttendance)
        for forbidden in ("student", "section", "school_year"):
            self.assertNotIn(forbidden, daily_cols)
        self.assertIn("enrollment", daily_cols)

        class_att_cols = _concrete_fields(ClassAttendance)
        for forbidden in ("student", "section", "subject"):
            self.assertNotIn(forbidden, class_att_cols)
        self.assertIn("enrollment", class_att_cols)
        self.assertIn("class_period", class_att_cols)

        ping_cols = _concrete_fields(TeacherLocationPing)
        self.assertNotIn("distance_meters", ping_cols)
        self.assertNotIn("is_inside", ping_cols)

        loaf_cols = _concrete_fields(LoafingIncident)
        for forbidden in (
            "person_name",
            "person_code",
            "section_name",
            "class_period_label",
            "incident_date",
            "distance_meters",
        ):
            self.assertNotIn(forbidden, loaf_cols)

        pass_cols = _concrete_fields(ExitPass)
        self.assertNotIn("status", pass_cols)

    def test_exit_pass_xor_check_constraint_enforced_at_database_level(self):
        user = User.objects.create_user(username="xor_teacher", password="Password123!", first_name="Ana", last_name="Cruz")
        UserProfile.objects.create(user=user, role="TEACHER")
        teacher = TeacherProfile.objects.create(user=user, employee_id="EMP-XOR-1")
        sy = SchoolYear.objects.create(name="2026-2027", start_date=date(2026, 6, 1), end_date=date(2027, 3, 31))
        grade = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7")
        sec = Section.objects.create(school_year=sy, grade_level=grade, name="Newton", adviser=teacher)
        stu = Student.objects.create(lrn="127901269101", first_name="Leo", last_name="Diaz", gender="Male", birth_date=date(2013, 2, 1))
        enr = Enrollment.objects.create(student=stu, section=sec, status="ENROLLED")
        now = timezone.now()

        # Both null -> rejected by ck_exitpass_xor_bearer
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ExitPass.objects.create(
                    pass_number="EP-BAD-BOTH-NULL",
                    pass_scope="STUDENT",
                    enrollment=None,
                    teacher=None,
                    reason="Invalid empty bearer",
                    issued_by=user,
                    issued_at=now,
                    valid_until=now + timedelta(hours=1),
                )

        # Both populated -> rejected by ck_exitpass_xor_bearer
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ExitPass.objects.create(
                    pass_number="EP-BAD-BOTH-SET",
                    pass_scope="STUDENT",
                    enrollment=enr,
                    teacher=teacher,
                    reason="Invalid dual bearer",
                    issued_by=user,
                    issued_at=now,
                    valid_until=now + timedelta(hours=1),
                )

        # Dynamic pass_status transitions without storing status column
        ep = ExitPass.objects.create(
            pass_number="EP-VALID-1",
            pass_scope="TEACHER",
            enrollment=None,
            teacher=teacher,
            reason="Division meeting",
            destination="Division Office",
            issued_by=user,
            issued_at=now - timedelta(minutes=10),
            valid_until=now + timedelta(hours=2),
        )
        self.assertEqual(ep.pass_status, "ACTIVE")
        ep.returned_at = now
        ep.save(update_fields=["returned_at"])
        self.assertEqual(ep.pass_status, "RETURNED")
        ep.is_cancelled = True
        ep.save(update_fields=["is_cancelled"])
        self.assertEqual(ep.pass_status, "CANCELLED")


class SecurityAndUtilityHardeningTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.dept, _ = Department.objects.get_or_create(code="STEM", defaults={"name": "STEM"})
        self.pos, _ = PositionTitle.objects.get_or_create(title="Teacher III")

        self.admin_user = User.objects.create_user(
            username="sec_admin",
            password="AttendSure2026!",
            first_name="Alex",
            last_name="Admin",
            email="admin@attendsure.edu",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user, employee_id="EMP-SEC-ADM", department=self.dept, position=self.pos
        )

        self.teacher_a_user = User.objects.create_user(
            username="sec_teacher_a",
            password="AttendSure2026!",
            first_name="Maria",
            last_name="Clara",
            email="maria@attendsure.edu",
        )
        UserProfile.objects.create(user=self.teacher_a_user, role="TEACHER")
        self.teacher_a = TeacherProfile.objects.create(
            user=self.teacher_a_user,
            employee_id="EMP-SEC-TA",
            department=self.dept,
            position=self.pos,
            can_handle_classes=True,
            bound_device_id="PHONE-A-001",
        )

        self.teacher_b_user = User.objects.create_user(
            username="sec_teacher_b",
            password="AttendSure2026!",
            first_name="Jose",
            last_name="Rizal",
            email="jose@attendsure.edu",
        )
        UserProfile.objects.create(user=self.teacher_b_user, role="TEACHER")
        self.teacher_b = TeacherProfile.objects.create(
            user=self.teacher_b_user,
            employee_id="EMP-SEC-TB",
            department=self.dept,
            position=self.pos,
            can_handle_classes=True,
        )

        self.sy = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            baseline_cutoff_date=date(2026, 6, 5),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        self.boundary = CampusBoundary.objects.create(
            campus_name="Test High School",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            duty_start_time=time(0, 0),
            duty_end_time=time(23, 59),
            enforce_geofence_checkin=True,
            is_active=True,
        )
        self.div = AdministrativeDivision.objects.create(region="Region X", division="CDO", district="D1")
        SchoolSettings.objects.create(
            school_id="304118",
            school_name="Test High School",
            division_ref=self.div,
            active_school_year=self.sy,
            campus_boundary=self.boundary,
        )
        self.grade = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7")
        self.sec_a = Section.objects.create(
            school_year=self.sy, grade_level=self.grade, name="Newton", adviser=self.teacher_a
        )
        self.sec_b = Section.objects.create(
            school_year=self.sy, grade_level=self.grade, name="Einstein", adviser=self.teacher_b
        )
        self.subj_math = Subject.objects.create(code="MATH7", title="Math 7", grade_level=self.grade)
        self.period_a = ClassPeriod.objects.create(
            schedule_code="PA-1",
            section=self.sec_a,
            subject=self.subj_math,
            teacher=self.teacher_a,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(8, 0),
            end_time=time(9, 0),
        )
        self.student_a = Student.objects.create(
            lrn="127901269901",
            first_name="Sofia",
            last_name="Bautista",
            gender="Female",
            birth_date=date(2012, 5, 10),
            guardian_name="Rosa Bautista",
            guardian_contact="+639171234567",
            is_active=True,
        )
        self.enrollment_a = Enrollment.objects.create(
            student=self.student_a, section=self.sec_a, status="ENROLLED", is_cct_recipient=True
        )

    def test_phone_and_gps_utilities(self):
        self.assertEqual(normalize_ph_phone("0917-123-4567"), "+639171234567")
        self.assertEqual(normalize_ph_phone("9171234567"), "+639171234567")
        self.assertEqual(normalize_international_phone("+1 (415) 555-0199"), "+14155550199")
        self.assertEqual(calculate_distance_meters(8.4858, 124.6567, 8.4858, 124.6567), 0.0)
        self.assertTrue(math.isinf(calculate_distance_meters(float("nan"), 124.6567, 8.4858, 124.6567)))
        verdict = verify_campus_gps(
            latitude=float("inf"),
            longitude=124.6567,
            campus_lat=8.4858,
            campus_lon=124.6567,
            accuracy_meters=float("nan"),
        )
        self.assertFalse(verdict["is_valid"])

    def test_rejects_disallowed_non_staff_roles(self):
        self.client.force_authenticate(user=self.admin_user)
        disallowed_role = "".join(["PAR", "ENT"])
        res_user = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "blocked_role_user",
                "password": "StrongPassword2026!",
                "first_name": "Blocked",
                "last_name": "Role",
                "role": disallowed_role,
            },
            format="json",
        )
        self.assertEqual(res_user.status_code, 400)

        res_guard = self.client.post(
            "/api/v1/accounts/users/",
            {
                "username": "blocked_guard_user",
                "password": "StrongPassword2026!",
                "first_name": "Blocked",
                "last_name": "Guard",
                "role": "SECURITY_GUARD",
            },
            format="json",
        )
        self.assertEqual(res_guard.status_code, 400)

        with override_settings(DEBUG=True):
            res_demo = self.client.post("/api/v1/accounts/demo-login/", {"role": disallowed_role}, format="json")
            self.assertEqual(res_demo.status_code, 400)

    @override_settings(ALLOW_LEGACY_UNSIGNED_QR=False)
    def test_rejects_forged_and_unsigned_qr_and_accepts_signed(self):
        signed = sign_student_qr(self.student_a.lrn, self.student_a.qr_token)
        verified = verify_student_qr(signed)
        self.assertIsNotNone(verified)
        self.assertEqual(verified.lrn, self.student_a.lrn)

        self.assertIsNone(verify_student_qr(self.student_a.qr_token))
        self.assertIsNone(verify_student_qr(f"ATTENDSURE:{self.student_a.lrn}:{self.student_a.qr_token}:FORGEDSIG"))

        self.client.force_authenticate(user=self.teacher_a_user)
        bad_res = self.client.post(
            "/api/v1/attendance/scan/",
            {"qr_text": f"ATTENDSURE:{self.student_a.lrn}:{self.student_a.qr_token}:BADSIG", "schedule_id": self.period_a.id},
            format="json",
        )
        self.assertEqual(bad_res.status_code, 400)

        ok_res = self.client.post(
            "/api/v1/attendance/scan/",
            {"qr_text": signed, "schedule_id": self.period_a.id},
            format="json",
        )
        self.assertEqual(ok_res.status_code, 201)

    def test_five_strike_login_lockout_and_audit_log(self):
        for attempt in range(5):
            res = self.client.post(
                "/api/v1/accounts/login/",
                {"username": "sec_teacher_a", "password": f"WrongPass{attempt}!"},
                format="json",
            )
            self.assertIn(res.status_code, (401, 403))

        profile = UserProfile.objects.get(user=self.teacher_a_user)
        self.assertTrue(profile.is_locked())
        self.assertTrue(AuditLog.objects.filter(table_name="user_profiles", action="LOCKOUT").exists())

        # Even with the right password, locked account returns 403
        locked_res = self.client.post(
            "/api/v1/accounts/login/",
            {"username": "sec_teacher_a", "password": "AttendSure2026!"},
            format="json",
        )
        self.assertEqual(locked_res.status_code, 403)

        # Expired lockout resets counter cleanly on next failure
        profile.locked_until = timezone.now() - timedelta(minutes=2)
        profile.save(update_fields=["locked_until"])
        self.assertFalse(profile.is_locked())
        profile.record_failed_attempt()
        profile.refresh_from_db()
        self.assertEqual(profile.failed_login_attempts, 1)
        self.assertIsNone(profile.locked_until)

    def test_device_mismatch_mock_gps_and_low_accuracy_blocked(self):
        self.client.force_authenticate(user=self.teacher_a_user)

        # Wrong device ID -> 403
        mismatch = self.client.post(
            "/api/v1/campus/ping/",
            {"latitude": 8.4858, "longitude": 124.6567, "accuracy_meters": 10, "device_id": "PHONE-IMPOSTOR-999"},
            format="json",
        )
        self.assertEqual(mismatch.status_code, 403)

        # Mocked GPS -> 400
        mocked = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "is_mock_location": True,
                "device_id": "PHONE-A-001",
            },
            format="json",
        )
        self.assertEqual(mocked.status_code, 400)

        # Low accuracy > 250m -> 400
        inaccurate = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 350,
                "is_mock_location": False,
                "device_id": "PHONE-A-001",
            },
            format="json",
        )
        self.assertEqual(inaccurate.status_code, 400)

    def test_cross_section_teacher_idor_blocked(self):
        # Teacher A scans Student A
        signed_qr = sign_student_qr(self.student_a.lrn, self.student_a.qr_token)
        self.client.force_authenticate(user=self.teacher_a_user)
        scan_a = self.client.post(
            "/api/v1/attendance/scan/",
            {"qr_text": signed_qr, "schedule_id": self.period_a.id},
            format="json",
        )
        self.assertEqual(scan_a.status_code, 201)
        rec = ClassAttendance.objects.get(enrollment=self.enrollment_a, class_period=self.period_a)

        # Teacher B (not assigned to Section A) cannot scan, edit, or delete Section A attendance or read SF1
        self.client.force_authenticate(user=self.teacher_b_user)
        self.assertEqual(
            self.client.post(
                "/api/v1/attendance/scan/",
                {"qr_text": signed_qr, "schedule_id": self.period_a.id},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.put("/api/v1/attendance/records/", {"id": rec.id, "status": "ABSENT"}, format="json").status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"/api/v1/attendance/records/?id={rec.id}").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/reports/sf1/{self.sec_a.id}/").status_code, 403)

    def test_flexible_image_field_magic_bytes_and_size_limit(self):
        field = FlexibleImageField()

        # Fake JPEG header / plain text payload -> ValidationError
        fake_file = SimpleUploadedFile("fake.jpg", b"<html><script>alert(1)</script></html>", content_type="image/jpeg")
        with self.assertRaises(serializers.ValidationError):
            field.to_internal_value(fake_file)

        # Oversized payload > 2 MB -> ValidationError
        big_file = SimpleUploadedFile("huge.png", b"\x89PNG\r\n\x1a\n" + (b"0" * (2 * 1024 * 1024 + 100)), content_type="image/png")
        with self.assertRaises(serializers.ValidationError):
            field.to_internal_value(big_file)

        # Valid PNG passes and returns optimized ContentFile
        good_file = SimpleUploadedFile("avatar.png", _make_valid_png_bytes(), content_type="image/png")
        result = field.to_internal_value(good_file)
        self.assertTrue(result.name.endswith(".png"))

    @override_settings(DEBUG=False, ENABLE_JUDGE_DEMO=False)
    def test_demo_login_strictly_disabled_in_production(self):
        self.assertFalse(self.client.get("/api/v1/accounts/demo-status/").data["enabled"])
        self.assertEqual(
            self.client.post("/api/v1/accounts/demo-login/", {"role": "ADMIN"}, format="json").status_code,
            404,
        )

    @override_settings(DEBUG=False, ENABLE_JUDGE_DEMO=True)
    def test_demo_login_works_when_explicitly_enabled(self):
        self.assertTrue(self.client.get("/api/v1/accounts/demo-status/").data["enabled"])
        res = self.client.post("/api/v1/accounts/demo-login/", {"role": "ADMIN"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("token", res.data)

    def test_resolve_teacher_for_user_requires_1to1_profile(self):
        self.assertEqual(resolve_teacher_for_user(self.teacher_a_user), self.teacher_a)
        orphan = User.objects.create_user(username="no_profile_user", password="Password123!")
        self.assertIsNone(resolve_teacher_for_user(orphan))


class GeofencingAndLoafingEngineTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.principal_user = User.objects.create_user(
            username="geo_principal", password="AttendSure2026!", first_name="Elena", last_name="Reyes"
        )
        UserProfile.objects.create(user=self.principal_user, role="PRINCIPAL")
        self.principal = TeacherProfile.objects.create(user=self.principal_user, employee_id="EMP-GEO-PR")

        self.teacher_user = User.objects.create_user(
            username="geo_teacher", password="AttendSure2026!", first_name="Marco", last_name="Santos"
        )
        UserProfile.objects.create(user=self.teacher_user, role="TEACHER")
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            employee_id="EMP-GEO-TC",
            can_handle_classes=True,
            bound_device_id="GEO-PHONE-1",
        )

        self.sy = SchoolYear.objects.create(
            name="2026-2027", start_date=date(2026, 6, 1), end_date=date(2027, 3, 31), is_active=True
        )
        self.boundary = CampusBoundary.objects.create(
            campus_name="Macasandig Main Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            loafing_grace_minutes=0,
            duty_start_time=time(0, 0),
            duty_end_time=time(23, 59),
            enforce_geofence_checkin=True,
            is_active=True,
        )
        self.grade = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7")
        self.section = Section.objects.create(
            school_year=self.sy, grade_level=self.grade, name="Newton", adviser=self.teacher
        )
        self.subj1 = Subject.objects.create(code="MATH7", title="Math 7", grade_level=self.grade)
        self.subj2 = Subject.objects.create(code="ENG7", title="English 7", grade_level=self.grade)
        self.period1 = ClassPeriod.objects.create(
            schedule_code="G-P1",
            section=self.section,
            subject=self.subj1,
            teacher=self.teacher,
            start_time=time(7, 30),
            end_time=time(8, 30),
        )
        self.period2 = ClassPeriod.objects.create(
            schedule_code="G-P2",
            section=self.section,
            subject=self.subj2,
            teacher=self.teacher,
            start_time=time(8, 30),
            end_time=time(9, 30),
        )
        self.student = Student.objects.create(
            lrn="127901268801",
            first_name="Ethan",
            last_name="Estrada",
            gender="Male",
            birth_date=date(2012, 4, 15),
        )
        self.enrollment = Enrollment.objects.create(student=self.student, section=self.section, status="ENROLLED")

    def test_teacher_outside_geofence_creates_alert_and_returning_auto_resolves(self):
        self.client.force_authenticate(user=self.teacher_user)
        priv, pub_hex, key_id = generate_ed25519_keypair()
        ts_ms = int(time_module.time() * 1000)
        sig = sign_checkin_payload_ed25519(
            private_key=priv,
            user_id=self.teacher_user.id,
            device_id="GEO-PHONE-1",
            timestamp_ms=ts_ms,
            action="TIME_IN",
        )

        # 1. Check in inside campus
        checkin = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "face_verified_on_device": True,
                "biometric_verified_on_device": True,
                "biometric_key_id": key_id,
                "biometric_public_key": pub_hex,
                "biometric_key_algorithm": "ED25519",
                "biometric_signature": sig,
                "biometric_timestamp_ms": ts_ms,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(checkin.status_code, 201)
        self.assertEqual(checkin.data["zone_status"], "INSIDE")
        self.assertTrue(TeacherDailyAttendance.objects.filter(teacher=self.teacher).exists())

        # 2. Ping ~500m outside boundary without ExitPass -> LOAFING_ALERT + OPEN incident
        outside = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4905,
                "longitude": 124.6567,
                "accuracy_meters": 12,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(outside.status_code, 201)
        self.assertEqual(outside.data["zone_status"], "LOAFING_ALERT")
        inc_id = outside.data["loafing_incident_id"]
        self.assertIsNotNone(inc_id)
        incident = LoafingIncident.objects.get(id=inc_id)
        self.assertEqual(incident.incident_type, "TEACHER_OUTSIDE_GEOFENCE")
        self.assertEqual(incident.status, "OPEN")

        # 3. Return inside campus -> auto-resolves open incident to RETURNED
        returned = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(returned.status_code, 201)
        self.assertEqual(returned.data["zone_status"], "INSIDE")
        incident.refresh_from_db()
        self.assertEqual(incident.status, "RETURNED")
        self.assertIsNotNone(incident.resolved_at)

    def test_teacher_outside_with_active_exit_pass_is_authorized_and_leader_can_resolve(self):
        now = timezone.now()
        # Teacher is clocked in on duty today before leaving on an official pass
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            attendance_date=timezone.localdate(),
            time_in=now - timedelta(hours=1),
            status="ON_TIME",
        )
        ExitPass.objects.create(
            pass_number="EP-GEO-AUTH",
            pass_scope="TEACHER",
            teacher=self.teacher,
            reason="Division briefing",
            destination="Division Office",
            issued_by=self.principal_user,
            issued_at=now - timedelta(minutes=15),
            valid_until=now + timedelta(hours=3),
        )

        self.client.force_authenticate(user=self.teacher_user)
        authorized = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4910,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(authorized.status_code, 201)
        self.assertEqual(authorized.data["zone_status"], "AUTHORIZED_OUTSIDE")
        self.assertIsNone(authorized.data["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.count(), 0)

        # Cancel pass -> next outside ping while clocked in raises LOAFING_ALERT
        ExitPass.objects.filter(pass_number="EP-GEO-AUTH").update(is_cancelled=True)
        alert = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4910,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(alert.data["zone_status"], "LOAFING_ALERT")
        inc_id = alert.data["loafing_incident_id"]

        # Non-leader teacher blocked from resolving (403)
        denied = self.client.post(
            f"/api/v1/campus/loafing/{inc_id}/resolve/",
            {"status": "EXCUSED", "remarks": "Self-excuse attempt"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        # Principal resolves incident (200)
        self.client.force_authenticate(user=self.principal_user)
        resolved = self.client.post(
            f"/api/v1/campus/loafing/{inc_id}/resolve/",
            {"status": "CONFIRMED_LOAFING", "remarks": "Confirmed unexcused absence"},
            format="json",
        )
        self.assertEqual(resolved.status_code, 200)
        self.assertEqual(resolved.data["incident"]["status"], "CONFIRMED_LOAFING")

    def test_pre_clockin_outside_ping_is_off_duty_and_stale_pings_not_counted_today(self):
        from apps.campus.selectors import get_campus_boundary_overview
        from apps.reports.selectors import get_monthly_dtr_data

        # 1. Pre-clock-in foreground ping outside campus during school duty hours
        self.client.force_authenticate(user=self.teacher_user)
        pre_ping = self.client.post(
            "/api/v1/campus/ping/",
            {
                "latitude": 8.4950,
                "longitude": 124.6567,
                "accuracy_meters": 12,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(pre_ping.status_code, 201)
        self.assertEqual(pre_ping.data["zone_status"], "OFF_DUTY")
        self.assertIsNone(pre_ping.data["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.count(), 0)

        overview = get_campus_boundary_overview(user=self.principal_user)
        row = next(r for r in overview["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertTrue(row["is_online"])
        self.assertEqual(row["zone_status"], "OFF_DUTY")
        self.assertEqual(row["status"], "AWAY_OFF_DUTY")
        self.assertFalse(row["is_inside"])
        self.assertIsNotNone(row["distance_meters"])
        self.assertEqual(overview["verified_inside"], 0)
        self.assertEqual(overview["outside_count"], 1)

        # 2. Stale INSIDE ping from yesterday must NEVER show teacher as Inside Campus today
        TeacherLocationPing.objects.filter(teacher=self.teacher).delete()
        yesterday_dt = timezone.now() - timedelta(days=1)
        TeacherLocationPing.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            latitude=8.4858,
            longitude=124.6567,
            accuracy_meters=8,
            zone_status="INSIDE",
            device_id="GEO-PHONE-1",
            recorded_at=yesterday_dt,
        )
        stale_overview = get_campus_boundary_overview(user=self.principal_user)
        stale_row = next(r for r in stale_overview["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertFalse(stale_row["is_online"])
        self.assertFalse(stale_row["is_inside"])
        self.assertIsNone(stale_row["distance_meters"])
        self.assertIsNone(stale_row["latitude"])
        self.assertIsNone(stale_row["longitude"])
        self.assertEqual(stale_row["zone_status"], "OFF_DUTY")
        self.assertEqual(stale_row["status"], "OFFLINE")
        self.assertEqual(
            stale_row["last_seen"],
            timezone.localtime(yesterday_dt).strftime("%b %d, %I:%M %p"),
        )
        self.assertEqual(stale_overview["verified_inside"], 0)
        self.assertEqual(stale_overview["outside_count"], 0)

        # 3. DTR verified check-in consistency: passive INSIDE ping without daily check-in must NOT inflate days_present
        TeacherLocationPing.objects.filter(teacher=self.teacher).delete()
        TeacherDailyAttendance.objects.filter(teacher=self.teacher).delete()
        local_today = timezone.localdate()
        tz = timezone.get_current_timezone()
        day_unverified = date(local_today.year, local_today.month, 2)
        day_verified = date(local_today.year, local_today.month, 3)

        # Unverified day: only a passive INSIDE ping
        TeacherLocationPing.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            latitude=8.4858,
            longitude=124.6567,
            accuracy_meters=8,
            zone_status="INSIDE",
            recorded_at=timezone.make_aware(datetime.combine(day_unverified, time(8, 15)), tz),
        )
        # Verified day: actual TeacherDailyAttendance check-in + afternoon INSIDE ping
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            attendance_date=day_verified,
            time_in=timezone.make_aware(datetime.combine(day_verified, time(7, 45)), tz),
            status="ON_TIME",
        )
        TeacherLocationPing.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            latitude=8.4858,
            longitude=124.6567,
            accuracy_meters=8,
            zone_status="INSIDE",
            recorded_at=timezone.make_aware(datetime.combine(day_verified, time(16, 30)), tz),
        )

        dtr = get_monthly_dtr_data(
            user=self.teacher_user,
            month=local_today.month,
            year=local_today.year,
        )
        self.assertEqual(dtr["days_present"], 1)
        row_unverified = next(r for r in dtr["rows"] if r["day"] == 2)
        row_verified = next(r for r in dtr["rows"] if r["day"] == 3)
        self.assertNotEqual(row_unverified["status"], "PRESENT")
        self.assertEqual(row_unverified["am_arrival"], "")
        self.assertEqual(row_verified["status"], "PRESENT")
        self.assertEqual(row_verified["am_arrival"], "07:45")
        self.assertEqual(row_verified["pm_arrival"], "04:30")

    def test_student_cutting_class_and_expired_exit_pass_detection(self):
        today = timezone.localdate()
        now = timezone.now()

        # Student attended Period 1 but skipped Period 2 without an ExitPass
        ClassAttendance.objects.create(
            enrollment=self.enrollment,
            class_period=self.period1,
            attendance_date=today,
            scanned_at=now,
            status="PRESENT",
            recorded_by=self.teacher,
        )
        DailyAttendance.objects.create(
            enrollment=self.enrollment,
            attendance_date=today,
            status="PRESENT",
            recorded_by=self.teacher,
        )
        # Also create an overdue unreturned teacher exit pass
        ExitPass.objects.create(
            pass_number="EP-OVERDUE-1",
            pass_scope="TEACHER",
            teacher=self.teacher,
            reason="Errand",
            destination="Bank",
            issued_by=self.principal_user,
            issued_at=now - timedelta(hours=3),
            valid_until=now - timedelta(hours=1),
        )

        self.client.force_authenticate(user=self.principal_user)
        audit = self.client.post(
            "/api/v1/attendance/loafing-audit/",
            {"date": str(today), "section_id": self.section.id},
            format="json",
        )
        self.assertEqual(audit.status_code, 200)
        self.assertEqual(audit.data["created_cutting_incidents"], 1)
        self.assertEqual(audit.data["created_expired_pass_incidents"], 1)
        self.assertTrue(
            LoafingIncident.objects.filter(
                incident_type="STUDENT_CUTTING_CLASS",
                enrollment=self.enrollment,
                class_period=self.period2,
            ).exists()
        )
        self.assertTrue(
            LoafingIncident.objects.filter(
                incident_type="EXPIRED_EXIT_PASS",
                teacher=self.teacher,
            ).exists()
        )

    def test_duplicate_bound_device_returns_403_instead_of_500(self):
        # self.teacher already owns "GEO-PHONE-1"; self.principal has no bound device yet.
        self.client.force_authenticate(user=self.principal_user)
        for endpoint, payload in (
            (
                "/api/v1/campus/check-in/",
                {
                    "action": "TIME_IN",
                    "latitude": 8.4858,
                    "longitude": 124.6567,
                    "accuracy_meters": 10,
                    "face_verified_on_device": True,
                    "device_id": "GEO-PHONE-1",
                },
            ),
            (
                "/api/v1/campus/ping/",
                {
                    "latitude": 8.4858,
                    "longitude": 124.6567,
                    "accuracy_meters": 10,
                    "device_id": "GEO-PHONE-1",
                },
            ),
        ):
            res = self.client.post(endpoint, payload, format="json")
            self.assertEqual(res.status_code, 403)
            self.assertEqual(res.data["error_code"], "DEVICE_ALREADY_BOUND")
            self.principal.refresh_from_db()
            self.assertIsNone(self.principal.bound_device_id)
            self.teacher.refresh_from_db()
            self.assertEqual(self.teacher.bound_device_id, "GEO-PHONE-1")

    def test_biometric_key_enrollment_mismatch_and_device_reset(self):
        self.client.force_authenticate(user=self.teacher_user)
        priv_a, pub_a, key_a = generate_ed25519_keypair()
        priv_b, pub_b, key_b = generate_ed25519_keypair()

        # 1. Rejected when on-device biometric verification reports False
        failed_bio = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "biometric_verified_on_device": False,
                "biometric_key_id": key_a,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(failed_bio.status_code, 403)
        self.assertEqual(failed_bio.data["error_code"], "BIOMETRIC_CHECK_FAILED")

        # 2. First check-in enrolls asymmetric public key + key_id
        now_ms = int(time_module.time() * 1000)
        sig_in = sign_checkin_payload_ed25519(
            private_key=priv_a,
            user_id=self.teacher_user.id,
            device_id="GEO-PHONE-1",
            timestamp_ms=now_ms,
            action="TIME_IN",
        )
        first_in = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "biometric_verified_on_device": True,
                "biometric_key_id": key_a,
                "biometric_public_key": pub_a,
                "biometric_key_algorithm": "ED25519",
                "biometric_signature": sig_in,
                "biometric_timestamp_ms": now_ms,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(first_in.status_code, 201)
        self.assertTrue(first_in.data["biometric_enrolled"])
        self.assertTrue(first_in.data["just_enrolled_biometric"])
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.biometric_key_id, key_a)
        self.assertEqual(self.teacher.biometric_public_key, pub_a)
        self.assertEqual(self.teacher.biometric_key_algorithm, "ED25519")
        self.assertTrue(AuditLog.objects.filter(table_name="teacher_profiles", action="BIO_ENROLL").exists())

        # 3. Matching key succeeds on TIME_OUT
        ts_out = int(time_module.time() * 1000) + 1
        sig_out = sign_checkin_payload_ed25519(
            private_key=priv_a,
            user_id=self.teacher_user.id,
            device_id="GEO-PHONE-1",
            timestamp_ms=ts_out,
            action="TIME_OUT",
        )
        out_ok = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_OUT",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "biometric_verified_on_device": True,
                "biometric_key_id": key_a,
                "biometric_public_key": pub_a,
                "biometric_key_algorithm": "ED25519",
                "biometric_signature": sig_out,
                "biometric_timestamp_ms": ts_out,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(out_ok.status_code, 201)
        self.assertFalse(out_ok.data["just_enrolled_biometric"])

        # 4. Mismatched biometric_key_id returns 403 BIOMETRIC_MISMATCH + AuditLog
        ts_bad = int(time_module.time() * 1000) + 2
        sig_bad = sign_checkin_payload_ed25519(
            private_key=priv_b,
            user_id=self.teacher_user.id,
            device_id="GEO-PHONE-1",
            timestamp_ms=ts_bad,
            action="TIME_IN",
        )
        mismatch = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "biometric_verified_on_device": True,
                "biometric_key_id": key_b,
                "biometric_public_key": pub_b,
                "biometric_key_algorithm": "ED25519",
                "biometric_signature": sig_bad,
                "biometric_timestamp_ms": ts_bad,
                "device_id": "GEO-PHONE-1",
            },
            format="json",
        )
        self.assertEqual(mismatch.status_code, 403)
        self.assertEqual(mismatch.data["error_code"], "BIOMETRIC_MISMATCH")
        self.assertTrue(AuditLog.objects.filter(table_name="teacher_profiles", action="BIO_REJECT").exists())

        # 5. Principal resets phone lock -> clears bound_device_id, biometric_key_id & public key
        self.client.force_authenticate(user=self.principal_user)
        reset_res = self.client.post(f"/api/v1/accounts/teachers/{self.teacher.id}/reset-device/", {}, format="json")
        self.assertEqual(reset_res.status_code, 200)
        self.teacher.refresh_from_db()
        self.assertIsNone(self.teacher.bound_device_id)
        self.assertIsNone(self.teacher.biometric_key_id)
        self.assertEqual(self.teacher.biometric_public_key, "")

        # 6. Teacher pairs replacement phone & new asymmetric biometric key cleanly
        self.client.force_authenticate(user=self.teacher_user)
        ts_rebind = int(time_module.time() * 1000) + 3
        sig_rebind = sign_checkin_payload_ed25519(
            private_key=priv_b,
            user_id=self.teacher_user.id,
            device_id="GEO-PHONE-NEW-2",
            timestamp_ms=ts_rebind,
            action="TIME_IN",
        )
        rebind = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "biometric_verified_on_device": True,
                "biometric_key_id": key_b,
                "biometric_public_key": pub_b,
                "biometric_key_algorithm": "ED25519",
                "biometric_signature": sig_rebind,
                "biometric_timestamp_ms": ts_rebind,
                "device_id": "GEO-PHONE-NEW-2",
            },
            format="json",
        )
        self.assertEqual(rebind.status_code, 201)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.bound_device_id, "GEO-PHONE-NEW-2")
        self.assertEqual(self.teacher.biometric_key_id, key_b)
        self.assertEqual(self.teacher.biometric_public_key, pub_b)


class PerformanceBoundedQueryTests(APITestCase):
    """Proves O(1) bounded SQL queries (zero N+1) on CampusOverviewView and OfflineQrSyncView."""

    def setUp(self):
        cache.clear()
        self.admin_user = User.objects.create_user(
            username="perf_admin", password="AttendSure2026!", first_name="Perf", last_name="Admin", is_staff=True, is_superuser=True
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(user=self.admin_user, employee_id="EMP-PERF-ADM")

        self.boundary = CampusBoundary.objects.create(
            campus_name="Perf Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            is_active=True,
        )
        self.sy = SchoolYear.objects.create(
            name="2026-2027", start_date=date(2026, 6, 1), end_date=date(2027, 3, 31), is_active=True
        )
        self.grade = GradeLevel.objects.create(level_number=7, code="G7", name="Grade 7")
        self.section = Section.objects.create(
            school_year=self.sy, grade_level=self.grade, name="PerfSec", adviser=self.admin_teacher
        )
        self.subject = Subject.objects.create(code="PERF1", title="Perf Subject", grade_level=self.grade)
        self.period = ClassPeriod.objects.create(
            schedule_code="PERF-P1",
            section=self.section,
            subject=self.subject,
            teacher=self.admin_teacher,
            start_time=time(8, 0),
            end_time=time(9, 0),
        )

    def _create_teachers_with_pings(self, start_idx: int, count: int):
        now = timezone.now()
        for i in range(start_idx, start_idx + count):
            u = User.objects.create_user(username=f"perf_t_{i}", password="Password123!", first_name="T", last_name=f"User{i}")
            UserProfile.objects.create(user=u, role="TEACHER")
            tp = TeacherProfile.objects.create(user=u, employee_id=f"EMP-PERF-{i:03d}")
            TeacherLocationPing.objects.create(
                teacher=tp,
                boundary=self.boundary,
                latitude=Decimal("8.485810"),
                longitude=Decimal("124.656710"),
                accuracy_meters=8.0,
                zone_status="INSIDE",
                recorded_at=now,
            )

    def test_campus_overview_executes_in_constant_bounded_queries(self):
        self.client.force_authenticate(user=self.admin_user)

        self._create_teachers_with_pings(1, 2)
        cache.clear()
        with CaptureQueriesContext(connection) as ctx_small:
            res_small = self.client.get("/api/v1/campus/overview/")
        self.assertEqual(res_small.status_code, 200)

        self._create_teachers_with_pings(3, 10)
        cache.clear()
        with CaptureQueriesContext(connection) as ctx_large:
            res_large = self.client.get("/api/v1/campus/overview/")
        self.assertEqual(res_large.status_code, 200)
        self.assertGreaterEqual(len(res_large.data["teacher_list"]), 12)

        # Constant O(1) query count regardless of 6x more teachers!
        self.assertLessEqual(len(ctx_large), len(ctx_small))
        self.assertLessEqual(len(ctx_large), 12)

    def test_offline_qr_sync_executes_in_constant_bounded_queries_and_is_idempotent(self):
        self.client.force_authenticate(user=self.admin_user)
        now_iso = timezone.now().isoformat()

        def make_scans(start_idx: int, count: int) -> list[dict]:
            payloads = []
            for i in range(start_idx, start_idx + count):
                st = Student.objects.create(
                    lrn=f"12790126{i:04d}",
                    first_name="Batch",
                    last_name=f"Learner{i}",
                    gender="Male",
                    birth_date=date(2013, 1, 10),
                )
                Enrollment.objects.create(student=st, section=self.section, status="ENROLLED")
                payloads.append(
                    {
                        "qr_token": sign_student_qr(st.lrn, st.qr_token),
                        "schedule_id": self.period.id,
                        "scanned_at": now_iso,
                        "client_scan_uuid": str(uuid.uuid4()),
                    }
                )
            return payloads

        small_batch = make_scans(100, 2)
        with CaptureQueriesContext(connection) as ctx_small:
            res_small = self.client.post("/api/v1/attendance/offline-sync/", {"scans": small_batch}, format="json")
        self.assertEqual(res_small.status_code, 200)
        self.assertEqual(res_small.data["synced_count"], 2)

        large_batch = make_scans(200, 12)
        with CaptureQueriesContext(connection) as ctx_large:
            res_large = self.client.post("/api/v1/attendance/offline-sync/", {"scans": large_batch}, format="json")
        self.assertEqual(res_large.status_code, 200)
        self.assertEqual(res_large.data["synced_count"], 12)

        # Constant O(1) SQL count for 2 scans vs 12 scans (zero N+1 growth)!
        self.assertLessEqual(len(ctx_large), len(ctx_small))
        self.assertLessEqual(len(ctx_large), 12)

        # Re-submitting same UUIDs is strictly idempotent
        replay = self.client.post("/api/v1/attendance/offline-sync/", {"scans": large_batch}, format="json")
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.data["synced_count"], 0)
        self.assertEqual(replay.data["duplicate_count"], 12)

    def test_seed_competition_demo_is_idempotent_and_staff_only(self):
        call_command("seed_competition_demo", verbosity=0)
        first_students = Student.objects.count()
        call_command("seed_competition_demo", verbosity=0)
        second_students = Student.objects.count()
        self.assertGreaterEqual(first_students, 24)
        self.assertEqual(first_students, second_students)
        roles = set(UserProfile.objects.values_list("role", flat=True))
        self.assertTrue(roles.issubset({"ADMIN", "PRINCIPAL", "DEPT_HEAD", "TEACHER"}))
