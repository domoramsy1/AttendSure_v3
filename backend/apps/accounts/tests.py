"""
AttendSure - Automated Security, Reports & Competition-Readiness Test Suite
Run: python manage.py test apps.accounts.tests --verbosity=2
"""

import math
from datetime import date, time
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import TeacherProfile, UserProfile
from apps.accounts.selectors import resolve_teacher_for_user
from apps.attendance.models import DailyAttendance
from apps.school.models import ClassPeriod, GradeLevel, SchoolSettings, SchoolYear, Section, Subject
from apps.students.models import Enrollment, Student
from common.gps import calculate_distance_meters, verify_campus_gps
from common.phone import normalize_international_phone, normalize_ph_phone
from common.qr_signer import sign_student_qr, verify_student_qr

User = get_user_model()


class SecurityAndUtilityUnitTests(APITestCase):
    def test_international_and_ph_phone_normalization(self):
        self.assertEqual(normalize_ph_phone("0917-123-4567"), "+639171234567")
        self.assertEqual(normalize_ph_phone("9171234567"), "+639171234567")
        self.assertEqual(normalize_ph_phone("639171234567"), "+639171234567")
        self.assertEqual(normalize_international_phone("+1 (415) 555-0199"), "+14155550199")
        self.assertEqual(normalize_international_phone("+44 7700 900077"), "+447700900077")
        self.assertEqual(normalize_international_phone("0065 9123 4567"), "+6591234567")
        self.assertEqual(normalize_international_phone(""), "")

    def test_gps_distance_handles_finite_and_invalid_values(self):
        dist = calculate_distance_meters(8.4858, 124.6567, 8.4858, 124.6567)
        self.assertEqual(dist, 0.0)
        self.assertTrue(math.isinf(calculate_distance_meters(float("nan"), 124.6567, 8.4858, 124.6567)))
        self.assertTrue(math.isinf(calculate_distance_meters(float("inf"), 124.6567, 8.4858, 124.6567)))
        verdict = verify_campus_gps(
            latitude=float("inf"),
            longitude=124.6567,
            campus_lat=8.4858,
            campus_lon=124.6567,
            accuracy_meters=float("nan"),
        )
        self.assertFalse(verdict["is_valid"])
        self.assertFalse(verdict["is_inside"])

    @override_settings(ALLOW_LEGACY_UNSIGNED_QR=False)
    def test_qr_signer_accepts_signed_and_rejects_unsigned_by_default(self):
        signed = sign_student_qr("127901269999", "STU-TOKEN-999")
        verified = verify_student_qr(signed)
        self.assertIsNotNone(verified)
        self.assertTrue(verified.is_signed)
        self.assertEqual(verified.lrn, "127901269999")
        self.assertEqual(verified.qr_token, "STU-TOKEN-999")

        self.assertIsNone(verify_student_qr("STU-TOKEN-999"))
        self.assertIsNone(verify_student_qr("ATTENDSURE:127901269999:STU-TOKEN-999:FORGED000000"))

    def test_empty_email_parent_cannot_hijack_teacher_profile(self):
        TeacherProfile.objects.create(
            employee_id="EMP-EMPTY-1",
            first_name="Real",
            last_name="Teacher",
            email="",
            is_active=True,
        )
        parent_user = User.objects.create_user(username="parent_empty", password="Password123!", email="")
        UserProfile.objects.create(user=parent_user, role="PARENT")

        self.assertIsNone(resolve_teacher_for_user(parent_user))

    def test_expired_lockout_resets_counter_on_next_failure(self):
        u = User.objects.create_user(username="lock_tester", password="Password123!")
        profile = UserProfile.objects.create(
            user=u,
            role="FACULTY",
            failed_attempts=5,
            locked_until=timezone.now() - timezone.timedelta(minutes=5),
        )
        self.assertFalse(profile.is_locked())
        profile.record_failed_attempt()
        profile.refresh_from_db()
        self.assertEqual(profile.failed_attempts, 1)
        self.assertIsNone(profile.locked_until)


class CompetitionEndpointsAndRbacTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username="demo_admin", password="AttendSure2026!", is_staff=True, is_superuser=True
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN", is_profile_completed=True)

        self.teacher_profile = TeacherProfile.objects.create(
            employee_id="EMP-T1",
            first_name="Maria",
            last_name="Clara",
            email="maria@attendsure.edu",
            can_teach=True,
            is_active=True,
        )
        self.teacher_user = User.objects.create_user(
            username="demo_teacher", password="AttendSure2026!", email="maria@attendsure.edu"
        )
        UserProfile.objects.create(
            user=self.teacher_user,
            teacher=self.teacher_profile,
            role="FACULTY",
            is_teaching=True,
            is_profile_completed=True,
        )

        self.parent_user = User.objects.create_user(
            username="demo_parent", password="AttendSure2026!", email="parent@attendsure.edu"
        )
        UserProfile.objects.create(user=self.parent_user, role="PARENT", is_profile_completed=True)

        self.sy = SchoolYear.objects.create(
            code="2026-2027",
            start_date=date(2026, 6, 1),
            baseline_cutoff_date=date(2026, 6, 5),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        SchoolSettings.objects.create(
            school_id="304118",
            school_name="AttendSure International Pilot High School",
            division="Global Pilot Division",
            academic_year=self.sy.code,
        )
        self.grade = GradeLevel.objects.create(code="G7", name="Grade 7", level_order=7)
        self.section = Section.objects.create(
            school_year=self.sy, grade_level=self.grade, name="Newton", adviser=self.teacher_profile
        )
        self.subject = Subject.objects.create(code="MATH7", title="Math 7", grade_level=self.grade)
        self.period = ClassPeriod.objects.create(
            code="P1",
            section=self.section,
            subject=self.subject,
            teacher=self.teacher_profile,
            start_time=time(8, 0),
            end_time=time(9, 0),
        )
        self.student = Student.objects.create(
            lrn="127901269999",
            first_name="Sofia",
            last_name="Bautista",
            sex="Female",
            birthdate=date(2012, 5, 10),
            parent_contact="+639171234567",
            parent_user=self.parent_user,
            is_active=True,
        )
        Enrollment.objects.create(
            student=self.student,
            section=self.section,
            school_year=self.sy,
            status="ENROLLED",
            is_cct_recipient=True,
        )
        DailyAttendance.objects.create(
            student=self.student,
            section=self.section,
            attendance_date=timezone.localdate(),
            status="PRESENT",
        )

    @override_settings(DEBUG=False, ENABLE_JUDGE_DEMO=False)
    def test_judge_demo_login_strictly_disabled_in_production(self):
        status_res = self.client.get("/api/v1/accounts/demo-status/")
        self.assertEqual(status_res.status_code, 200)
        self.assertFalse(status_res.data["enabled"])

        res = self.client.post("/api/v1/accounts/demo-login/", {"role": "admin"}, format="json")
        self.assertEqual(res.status_code, 404)

    @override_settings(DEBUG=False, ENABLE_JUDGE_DEMO=True)
    def test_judge_demo_login_works_when_explicitly_enabled(self):
        status_res = self.client.get("/api/v1/accounts/demo-status/")
        self.assertEqual(status_res.status_code, 200)
        self.assertTrue(status_res.data["enabled"])

        res = self.client.post("/api/v1/accounts/demo-login/", {"role": "admin"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("token", res.data)
        self.assertEqual(res.data["user"]["username"], "demo_admin")

    def test_sdg_impact_returns_structured_live_metrics_and_blocks_parents(self):
        self.client.force_authenticate(user=self.parent_user)
        parent_res = self.client.get("/api/v1/reports/sdg-impact/")
        self.assertEqual(parent_res.status_code, 403)

        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/v1/reports/sdg-impact/")
        self.assertEqual(res.status_code, 200)
        sdg = res.data["sdg_metrics"]
        self.assertIn("sdg_4_quality_education", sdg)
        self.assertIn("sdg_5_and_10_equality_and_inclusion", sdg)
        self.assertIn("sdg_8_decent_work", sdg)
        self.assertIn("sdg_12_and_13_climate_and_sustainability", sdg)
        self.assertIn("sdg_16_accountable_institutions", sdg)
        self.assertEqual(sdg["sdg_5_and_10_equality_and_inclusion"]["female_learners"], 1)
        self.assertEqual(sdg["sdg_5_and_10_equality_and_inclusion"]["female_attendance_rate_today"], 100.0)
        self.assertEqual(sdg["sdg_5_and_10_equality_and_inclusion"]["cct_4ps_beneficiaries_monitored"], 1)

    def test_edfi_v6_export_standard_and_gdpr_pseudonymized_and_rbac(self):
        # Non-leaders cannot export Ed-Fi datasets
        self.client.force_authenticate(user=self.teacher_user)
        denied = self.client.get("/api/v1/reports/edfi-export/")
        self.assertEqual(denied.status_code, 403)

        # Leaders receive Ed-Fi v6.0 standard export
        self.client.force_authenticate(user=self.admin_user)
        std_res = self.client.get("/api/v1/reports/edfi-export/?days=14&anonymize=0")
        self.assertEqual(std_res.status_code, 200)
        std_json = std_res.json()
        self.assertEqual(std_json["edFiVersion"], "6.0")
        self.assertEqual(std_json["privacyMode"], "STANDARD_INSTITUTIONAL")
        self.assertEqual(std_json["students"][0]["firstName"], "Sofia")
        self.assertEqual(std_json["students"][0]["studentUniqueId"], "127901269999")

        # GDPR pseudonymized mode strips PII and replaces LRN with deterministic SHA-256 pseudonym
        anon_res = self.client.get("/api/v1/reports/edfi-export/?days=14&anonymize=1")
        self.assertEqual(anon_res.status_code, 200)
        anon_json = anon_res.json()
        self.assertEqual(anon_json["privacyMode"], "GDPR_PSEUDONYMIZED")
        self.assertNotIn("firstName", anon_json["students"][0])
        self.assertTrue(anon_json["students"][0]["studentUniqueId"].startswith("STU-"))
        self.assertEqual(anon_json["students"][0]["birthDate"], "2012-01-01")

    def test_seed_competition_demo_command_is_idempotent(self):
        call_command("seed_competition_demo", verbosity=0)
        count_first = Student.objects.count()
        call_command("seed_competition_demo", verbosity=0)
        count_second = Student.objects.count()
        self.assertGreaterEqual(count_first, 24)
        self.assertEqual(count_first, count_second)
