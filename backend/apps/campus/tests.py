# AttendSure Backend - Campus Automated Tests
# File: D:\AttendSure_V3\backend\apps\campus\tests.py

"""
AttendSure - Campus Security, Biometric Freshness/Replay, Device Binding,
Trusted Proxy IP, Allowed Hosts & Audit Log Filtering Tests
Run: python manage.py test apps.campus.tests --verbosity=2
"""

from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal
import time as time_module

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import RequestFactory
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import AuditLog, TeacherProfile, UserProfile
from apps.accounts.serializers import AuditLogSerializer
from apps.attendance.models import ExitPass
from apps.campus.models import CampusBoundary, LoafingIncident, TeacherDailyAttendance, TeacherLocationPing
from apps.campus.selectors import (
    get_campus_boundary_overview,
    get_emergency_roll_call,
    get_loafing_incidents_queryset,
)
from apps.campus.services import record_teacher_gps_ping
from apps.reports.selectors import get_dashboard_overview, get_system_status
from apps.school.models import ClassPeriod, GradeLevel, SchoolSettings, SchoolYear, Section, Subject
from apps.school.services import check_class_period_conflicts
from common.audit import get_client_ip, record_audit_log
from common.device_crypto import generate_ed25519_keypair, sign_checkin_payload_ed25519
from common.time_utils import (
    format_datetime_12h,
    format_time_12h,
    format_time_range_12h,
    local_day_bounds,
    local_month_bounds,
)
from config.settings import _resolve_use_redis_cache

User = get_user_model()


class CampusSecurityHardeningTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin_user = User.objects.create_user(
            username="campus_sec_admin",
            password="AttendSure2026!",
            first_name="Clara",
            last_name="Admin",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user,
            employee_id="EMP-CSEC-ADM",
            can_handle_classes=False,
        )

        self.teacher_user = User.objects.create_user(
            username="campus_sec_teacher",
            password="AttendSure2026!",
            first_name="Marco",
            last_name="Reyes",
        )
        UserProfile.objects.create(user=self.teacher_user, role="TEACHER")
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            employee_id="EMP-CSEC-T1",
            can_handle_classes=True,
            bound_device_id=None,
            biometric_key_id=None,
        )

        self.boundary = CampusBoundary.objects.create(
            campus_name="Main School Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=200,
            duty_start_time=time(0, 0),
            duty_end_time=time(23, 59),
            enforce_geofence_checkin=True,
            is_active=True,
        )
        self.priv_key, self.pub_key_hex, self.key_id = generate_ed25519_keypair()
        self._ts_offset = 0

    def _checkin_payload(self, **overrides) -> dict:
        self._ts_offset += 1
        action = str(overrides.get("action", "TIME_IN")).upper()
        device_id = str(overrides.get("device_id", "PHONE-SEC-001"))
        ts_ms = overrides.get("biometric_timestamp_ms", int(time_module.time() * 1000) + self._ts_offset)
        nonce = overrides.get("biometric_nonce")
        priv = overrides.pop("_private_key", self.priv_key)
        pub_hex = overrides.get("biometric_public_key", self.pub_key_hex)
        key_id = overrides.get("biometric_key_id", self.key_id)

        sig = overrides.get("biometric_signature")
        if sig is None and ts_ms is not None and not isinstance(ts_ms, bool):
            try:
                sig = sign_checkin_payload_ed25519(
                    private_key=priv,
                    user_id=self.teacher_user.id,
                    device_id=device_id,
                    timestamp_ms=int(ts_ms),
                    action=action,
                    nonce=nonce,
                )
            except (TypeError, ValueError):
                sig = "00" * 64

        payload = {
            "action": action,
            "latitude": 8.4858,
            "longitude": 124.6567,
            "accuracy_meters": 10,
            "device_id": device_id,
            "device_model": "Test Phone",
            "biometric_verified_on_device": True,
            "biometric_key_id": key_id,
            "biometric_public_key": pub_hex,
            "biometric_key_algorithm": "ED25519",
            "biometric_signature": sig,
            "biometric_timestamp_ms": ts_ms,
        }
        payload.update(overrides)
        return payload

    def test_first_time_checkin_and_checkout_reject_empty_device_id(self):
        self.client.force_authenticate(user=self.teacher_user)

        for action_name in ("TIME_IN", "TIME_OUT"):
            res = self.client.post(
                "/api/v1/campus/check-in/",
                self._checkin_payload(action=action_name, device_id=""),
                format="json",
            )
            self.assertEqual(res.status_code, 400, f"{action_name} should reject empty device_id")
            self.assertEqual(res.data["error_code"], "DEVICE_ID_REQUIRED")
            self.teacher.refresh_from_db()
            self.assertIsNone(self.teacher.bound_device_id)

        # Supplying a real device_id succeeds and binds the phone 1-to-1
        ok_res = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(device_id="PHONE-FIRST-BIND"),
            format="json",
        )
        self.assertEqual(ok_res.status_code, 201, ok_res.data)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.bound_device_id, "PHONE-FIRST-BIND")

    def test_biometric_proof_format_freshness_and_replay_protection(self):
        self.client.force_authenticate(user=self.teacher_user)
        now_ms = int(time_module.time() * 1000)

        # 1. Legacy hex-only proof with no signature rejected with 400 INVALID_BIOMETRIC_PROOF
        bad_fmt = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                biometric_signature="",
                biometric_proof="ab" * 32,
                biometric_timestamp_ms=now_ms,
            ),
            format="json",
        )
        self.assertEqual(bad_fmt.status_code, 400)
        self.assertEqual(bad_fmt.data["error_code"], "INVALID_BIOMETRIC_PROOF")

        # 2. Tampered/forged cryptographic signature rejected with 403 BIOMETRIC_SIGNATURE_INVALID
        forged = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                biometric_signature="ff" * 64,
                biometric_timestamp_ms=now_ms,
            ),
            format="json",
        )
        self.assertEqual(forged.status_code, 403)
        self.assertEqual(forged.data["error_code"], "BIOMETRIC_SIGNATURE_INVALID")

        # 3. Missing biometric_timestamp_ms rejected with 400 BIOMETRIC_PROOF_EXPIRED
        missing_ts = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(biometric_signature="aa" * 64, biometric_timestamp_ms=None),
            format="json",
        )
        self.assertEqual(missing_ts.status_code, 400)
        self.assertEqual(missing_ts.data["error_code"], "BIOMETRIC_PROOF_EXPIRED")

        # 4. Stale timestamp (> 2 minutes old) rejected with 400 BIOMETRIC_PROOF_EXPIRED
        stale = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(biometric_timestamp_ms=now_ms - 180_000),
            format="json",
        )
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(stale.data["error_code"], "BIOMETRIC_PROOF_EXPIRED")

        # 5. Future timestamp (> 2 minutes ahead) rejected with 400 BIOMETRIC_PROOF_EXPIRED
        future = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(biometric_timestamp_ms=now_ms + 180_000),
            format="json",
        )
        self.assertEqual(future.status_code, 400)
        self.assertEqual(future.data["error_code"], "BIOMETRIC_PROOF_EXPIRED")

        # 6. Fresh valid Ed25519 signature succeeds (with server challenge nonce!)
        chal_res = self.client.get("/api/v1/campus/check-in/challenge/")
        self.assertEqual(chal_res.status_code, 200)
        nonce = chal_res.data["nonce"]

        first_payload = self._checkin_payload(
            action="TIME_IN",
            biometric_timestamp_ms=now_ms,
            biometric_nonce=nonce,
        )
        first_ok = self.client.post(
            "/api/v1/campus/check-in/",
            first_payload,
            format="json",
        )
        self.assertEqual(first_ok.status_code, 201, first_ok.data)

        # 7. Replaying the exact same signed request / nonce is rejected with 400 BIOMETRIC_PROOF_REPLAYED
        replayed = self.client.post(
            "/api/v1/campus/check-in/",
            first_payload,
            format="json",
        )
        self.assertEqual(replayed.status_code, 400)
        self.assertEqual(replayed.data["error_code"], "BIOMETRIC_PROOF_REPLAYED")

        # 8. Fresh signed TIME_OUT succeeds and replaying that signature without nonce is also rejected
        second_payload = self._checkin_payload(
            action="TIME_OUT",
            biometric_timestamp_ms=int(time_module.time() * 1000) + 5,
        )
        second_ok = self.client.post(
            "/api/v1/campus/check-in/",
            second_payload,
            format="json",
        )
        self.assertEqual(second_ok.status_code, 201, second_ok.data)

        replayed_no_nonce = self.client.post(
            "/api/v1/campus/check-in/",
            second_payload,
            format="json",
        )
        self.assertEqual(replayed_no_nonce.status_code, 400)
        self.assertEqual(replayed_no_nonce.data["error_code"], "BIOMETRIC_PROOF_REPLAYED")

    def test_legacy_bound_teacher_smoothly_upgrades_to_asymmetric_key(self):
        # Simulate pre-upgrade teacher with bound_device_id + legacy key_id but empty public key
        self.teacher.bound_device_id = "LEGACY-PHONE-77"
        self.teacher.biometric_key_id = "9" * 64
        self.teacher.biometric_public_key = ""
        self.teacher.save()

        self.client.force_authenticate(user=self.teacher_user)

        # Wrong device still blocked with 403 DEVICE_MISMATCH
        wrong_dev = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(device_id="DIFFERENT-PHONE-88"),
            format="json",
        )
        self.assertEqual(wrong_dev.status_code, 403)
        self.assertEqual(wrong_dev.data["error_code"], "DEVICE_MISMATCH")

        # Same bound device upgrades cleanly to Ed25519 public key
        upgrade_res = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(device_id="LEGACY-PHONE-77"),
            format="json",
        )
        self.assertEqual(upgrade_res.status_code, 201, upgrade_res.data)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.biometric_public_key, self.pub_key_hex)
        self.assertEqual(self.teacher.biometric_key_id, self.key_id)
        self.assertEqual(self.teacher.biometric_key_algorithm, "ED25519")

    def test_checkin_requires_biometric_proof_even_before_enrollment(self):
        self.client.force_authenticate(user=self.teacher_user)
        missing_all = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 10,
                "device_id": "PHONE-NO-BIO-001",
            },
            format="json",
        )
        self.assertEqual(missing_all.status_code, 400)
        self.assertEqual(missing_all.data["error_code"], "INVALID_BIOMETRIC_PROOF")

    def test_timeout_am_repeat_time_in_preserves_on_time_and_timeout_without_time_in_rejected(self):
        self.boundary.duty_start_time = time(7, 30)
        self.boundary.duty_end_time = time(17, 0)
        self.boundary.loafing_grace_minutes = 10
        self.boundary.save()

        self.client.force_authenticate(user=self.teacher_user)
        tz = timezone.get_current_timezone()
        today = timezone.localdate()

        # 1. TIME_OUT without prior TIME_IN today is cleanly rejected with 400 NOT_CHECKED_IN
        no_in = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(action="TIME_OUT", biometric_proof="aa" * 32),
            format="json",
        )
        self.assertEqual(no_in.status_code, 400)
        self.assertEqual(no_in.data["error_code"], "NOT_CHECKED_IN")
        self.assertFalse(TeacherDailyAttendance.objects.filter(teacher=self.teacher, attendance_date=today).exists())

        # 2. Early morning TIME_IN records ON_TIME
        morning_dt = timezone.make_aware(datetime.combine(today, time(7, 25)), tz)
        res_in = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data=self._checkin_payload(
                action="TIME_IN",
                biometric_proof="bb" * 32,
                biometric_timestamp_ms=int(morning_dt.timestamp() * 1000),
            ),
            is_checkin=True,
            now_override=morning_dt,
        )
        self.assertTrue(res_in["ok"])
        att = TeacherDailyAttendance.objects.get(teacher=self.teacher, attendance_date=today)
        self.assertEqual(att.status, "ON_TIME")
        self.assertEqual(att.time_in, morning_dt)

        # 3. Repeat TIME_IN later in the afternoon keeps ON_TIME and original time_in
        afternoon_dt = timezone.make_aware(datetime.combine(today, time(13, 5)), tz)
        record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data=self._checkin_payload(
                action="TIME_IN",
                biometric_proof="cc" * 32,
                biometric_timestamp_ms=int(afternoon_dt.timestamp() * 1000),
            ),
            is_checkin=True,
            now_override=afternoon_dt,
        )
        att.refresh_from_db()
        self.assertEqual(att.status, "ON_TIME")
        self.assertEqual(att.time_in, morning_dt)

        # 4. TIME_OUT_AM via endpoint is handled as checkout and sets time_out
        res_out_am = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(action="TIME_OUT_AM", biometric_proof="dd" * 32),
            format="json",
        )
        self.assertEqual(res_out_am.status_code, 201, res_out_am.data)
        att.refresh_from_db()
        self.assertIsNotNone(att.time_out)

    def test_checkout_inside_campus_sets_off_duty_and_removes_teacher_from_live_counts(self):
        cache.clear()
        self.client.force_authenticate(user=self.teacher_user)

        # 1. Time In inside campus -> zone_status INSIDE and counted on campus / on duty
        res_in = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(action="TIME_IN", biometric_proof="e1" * 32),
            format="json",
        )
        self.assertEqual(res_in.status_code, 201, res_in.data)
        self.assertEqual(res_in.data["zone_status"], "INSIDE")
        self.assertTrue(res_in.data["is_inside"])

        overview_in = get_campus_boundary_overview(user=self.admin_user)
        self.assertEqual(overview_in["inside_count"], 1)
        row_in = next(r for r in overview_in["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertTrue(row_in["is_clocked_in"])
        self.assertFalse(row_in["has_timed_out"])
        self.assertTrue(row_in["is_inside"])

        roll_call_in = get_emergency_roll_call()
        self.assertEqual(roll_call_in["teachers_count"], 1)
        self.assertEqual([t["teacher_id"] for t in roll_call_in["teachers"]], [self.teacher.id])

        cache.clear()
        self.assertEqual(get_dashboard_overview(user=self.admin_user)["teachers_on_duty"], 1)
        self.assertEqual(get_dashboard_overview(user=self.teacher_user)["teachers_on_duty"], 1)
        self.assertEqual(get_system_status()["online_teachers_today"], 1)

        # 2. Time Out inside campus -> ping saved with zone_status OFF_DUTY and removed from live counts
        res_out = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(action="TIME_OUT", biometric_proof="e2" * 32),
            format="json",
        )
        self.assertEqual(res_out.status_code, 201, res_out.data)
        self.assertEqual(res_out.data["zone_status"], "OFF_DUTY")
        self.assertTrue(res_out.data["is_inside"])

        latest_ping = TeacherLocationPing.objects.filter(teacher=self.teacher).order_by("-recorded_at", "-id").first()
        self.assertIsNotNone(latest_ping)
        self.assertEqual(latest_ping.zone_status, "OFF_DUTY")

        overview_out = get_campus_boundary_overview(user=self.admin_user)
        self.assertEqual(overview_out["inside_count"], 0)
        row_out = next(r for r in overview_out["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertFalse(row_out["is_clocked_in"])
        self.assertTrue(row_out["has_timed_out"])
        self.assertFalse(row_out["is_inside"])
        self.assertEqual(row_out["zone_status"], "OFF_DUTY")

        roll_call_out = get_emergency_roll_call()
        self.assertEqual(roll_call_out["teachers_count"], 0)
        self.assertEqual(roll_call_out["teachers"], [])

        cache.clear()
        self.assertEqual(get_dashboard_overview(user=self.admin_user)["teachers_on_duty"], 0)
        self.assertEqual(get_dashboard_overview(user=self.teacher_user)["teachers_on_duty"], 0)
        self.assertEqual(get_system_status()["online_teachers_today"], 0)

    def test_outside_campus_respects_loafing_grace_minutes_and_overview_fields(self):
        self.boundary.loafing_grace_minutes = 10
        self.boundary.save()

        tz = timezone.get_current_timezone()
        today = timezone.localdate()
        t_in = timezone.make_aware(datetime.combine(today, time(8, 0)), tz)
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            attendance_date=today,
            time_in=t_in,
            status="ON_TIME",
            face_verified_on_device=True,
        )

        # First outside ping at 08:10 -> within 10-minute grace, no incident yet
        t_out1 = timezone.make_aware(datetime.combine(today, time(8, 10)), tz)
        p1 = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.4905,
                "longitude": 124.6567,
                "accuracy_meters": 10.0,
                "device_id": "PHONE-GRACE-01",
            },
            now_override=t_out1,
        )
        self.assertIsNone(p1["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.filter(teacher=self.teacher).count(), 0)

        # Second outside ping at 08:15 (5 min < 10 min) -> still within grace
        t_out2 = timezone.make_aware(datetime.combine(today, time(8, 15)), tz)
        p2 = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.4906,
                "longitude": 124.6567,
                "accuracy_meters": 10.0,
                "device_id": "PHONE-GRACE-01",
            },
            now_override=t_out2,
        )
        self.assertIsNone(p2["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.filter(teacher=self.teacher).count(), 0)

        # Third outside ping at 08:21 (11 min >= 10 min) -> grace exceeded, raises LOAFING_ALERT
        t_out3 = timezone.make_aware(datetime.combine(today, time(8, 21)), tz)
        p3 = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.4907,
                "longitude": 124.6567,
                "accuracy_meters": 10.0,
                "device_id": "PHONE-GRACE-01",
            },
            now_override=t_out3,
        )
        self.assertEqual(p3["zone_status"], "LOAFING_ALERT")
        self.assertIsNotNone(p3["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.filter(teacher=self.teacher).count(), 1)

        # Overview includes user_id and has_bound_device
        overview = get_campus_boundary_overview(user=self.admin_user)
        teacher_row = next(r for r in overview["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertEqual(teacher_row["user_id"], self.teacher_user.id)
        self.assertTrue(teacher_row["has_bound_device"])

    def test_change_password_blacklists_existing_jwt_tokens_and_issues_fresh_pair(self):
        # Sign in to obtain initial JWT refresh/access tokens
        login_res = self.client.post(
            "/api/v1/accounts/login/",
            {"username": self.teacher_user.username, "password": "AttendSure2026!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)
        old_refresh = login_res.data["refresh"]
        old_access = login_res.data["access"]

        # Change password using old access token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
        change_res = self.client.post(
            "/api/v1/accounts/change-password/",
            {
                "current_password": "AttendSure2026!",
                "new_password": "NewStrongPassword2026!",
            },
            format="json",
        )
        self.assertEqual(change_res.status_code, 200, change_res.data)
        self.assertIn("access", change_res.data)
        self.assertIn("refresh", change_res.data)
        self.assertIn("token", change_res.data)
        self.assertNotEqual(change_res.data["refresh"], old_refresh)

        # Old refresh token must be blacklisted and rejected
        self.client.credentials()
        old_ref_res = self.client.post(
            "/api/v1/accounts/token/refresh/",
            {"refresh": old_refresh},
            format="json",
        )
        self.assertEqual(old_ref_res.status_code, 401)

        # New refresh token works cleanly
        new_ref_res = self.client.post(
            "/api/v1/accounts/token/refresh/",
            {"refresh": change_res.data["refresh"]},
            format="json",
        )
        self.assertEqual(new_ref_res.status_code, 200)
        self.assertIn("access", new_ref_res.data)

    def test_get_client_ip_ignores_untrusted_forwarded_headers_and_validates_format(self):
        rf = RequestFactory()

        # Untrusted direct caller trying to spoof X-Forwarded-For and CF-Connecting-IP
        spoofed_req = rf.get(
            "/api/v1/accounts/login/",
            REMOTE_ADDR="203.0.113.50",
            HTTP_X_FORWARDED_FOR="198.51.100.99",
            HTTP_CF_CONNECTING_IP="198.51.100.88",
        )
        self.assertEqual(get_client_ip(spoofed_req), "203.0.113.50")

        # Trusted local reverse proxy honors valid CF-Connecting-IP and X-Forwarded-For
        cf_req = rf.get(
            "/api/v1/accounts/login/",
            REMOTE_ADDR="127.0.0.1",
            HTTP_CF_CONNECTING_IP="198.51.100.88",
            HTTP_X_FORWARDED_FOR="198.51.100.77",
        )
        self.assertEqual(get_client_ip(cf_req), "198.51.100.88")

        xff_req = rf.get(
            "/api/v1/accounts/login/",
            REMOTE_ADDR="127.0.0.1",
            HTTP_X_FORWARDED_FOR="198.51.100.77, 10.0.0.1",
        )
        self.assertEqual(get_client_ip(xff_req), "198.51.100.77")

        # Malformed header never crashes GenericIPAddressField on AuditLog
        bad_req = rf.get(
            "/api/v1/accounts/login/",
            REMOTE_ADDR="127.0.0.1",
            HTTP_X_FORWARDED_FOR="invalid-ip-header; drop table",
        )
        bad_req.user = self.admin_user
        self.assertEqual(get_client_ip(bad_req), "127.0.0.1")
        record_audit_log(
            request=bad_req,
            table_name="auth_user",
            record_id=self.admin_user.id,
            action="LOGIN",
            new_data={"username": self.admin_user.username},
        )
        latest = AuditLog.objects.order_by("-id").first()
        self.assertIsNotNone(latest)
        self.assertEqual(latest.client_ip, "127.0.0.1")

        # Empty/None request defaults safely
        self.assertEqual(get_client_ip(None), "127.0.0.1")

    def test_trusted_proxy_ips_supports_cidr_ranges(self):
        import os
        from unittest.mock import patch

        rf = RequestFactory()
        with patch.dict(os.environ, {"TRUSTED_PROXY_IPS": "127.0.0.1,::1,172.16.0.0/12,fd00::/8"}):
            docker_proxy_req = rf.get(
                "/api/v1/accounts/login/",
                REMOTE_ADDR="172.18.0.5",
                HTTP_X_FORWARDED_FOR="198.51.100.42, 172.18.0.1",
            )
            self.assertEqual(get_client_ip(docker_proxy_req), "198.51.100.42")

            ipv6_proxy_req = rf.get(
                "/api/v1/accounts/login/",
                REMOTE_ADDR="fd00::1234",
                HTTP_CF_CONNECTING_IP="203.0.113.77",
            )
            self.assertEqual(get_client_ip(ipv6_proxy_req), "203.0.113.77")

            untrusted_req = rf.get(
                "/api/v1/accounts/login/",
                REMOTE_ADDR="192.0.2.55",
                HTTP_X_FORWARDED_FOR="198.51.100.42",
            )
            self.assertEqual(get_client_ip(untrusted_req), "192.0.2.55")

    def test_audit_log_preserves_16_char_action_changed_fields_and_monthly_dtr_label(self):
        rf = RequestFactory()
        req = rf.post("/api/v1/reports/dtr/", REMOTE_ADDR="127.0.0.1")
        req.user = self.admin_user

        record_audit_log(
            request=req,
            table_name="monthly_time_records",
            record_id=77,
            action="PASSWORD_ROTATED",
            changed_fields=["regular_hours", "is_submitted"],
            new_data={"month": 11, "year": 2026},
        )
        latest = AuditLog.objects.order_by("-id").first()
        self.assertIsNotNone(latest)
        self.assertEqual(latest.action, "PASSWORD_ROTATED")
        self.assertEqual(latest.changed_fields, ["regular_hours", "is_submitted"])
        serialized = AuditLogSerializer(latest).data
        self.assertEqual(serialized["module"], "Monthly DTR")
        self.assertEqual(serialized["changes"]["changed_fields"], ["regular_hours", "is_submitted"])

    def test_allowed_hosts_has_no_wildcard_and_keeps_safe_local_hosts(self):
        self.assertNotIn("*", settings.ALLOWED_HOSTS)
        for host in ("localhost", "127.0.0.1", "[::1]", "testserver", "10.0.2.2"):
            self.assertIn(host, settings.ALLOWED_HOSTS)

    def test_audit_log_serializer_and_list_filtering_by_action_date_and_search(self):
        tz = timezone.get_current_timezone()
        day_one = timezone.make_aware(datetime.combine(date(2026, 11, 20), time(9, 15)), tz)
        day_two = timezone.make_aware(datetime.combine(date(2026, 11, 25), time(14, 30)), tz)

        log_login = AuditLog.objects.create(
            table_name="",
            record_id=self.admin_user.id,
            action="LOGIN",
            new_data={"username": self.admin_user.username, "role": "ADMIN"},
            performed_by=self.admin_user,
            client_ip="198.51.100.10",
            user_agent="AttendSure-Web",
            created_at=day_one,
        )
        log_lockout = AuditLog.objects.create(
            table_name="user_profiles",
            record_id=self.teacher_user.id,
            action="LOCKOUT",
            new_data={"username": self.teacher_user.username, "failed_login_attempts": 5},
            performed_by=self.teacher_user,
            client_ip="203.0.113.44",
            user_agent="AttendSure-Mobile",
            created_at=day_two,
        )
        log_update = AuditLog.objects.create(
            table_name="campus_boundaries",
            record_id=self.boundary.id,
            action="UPDATE",
            new_data={"campus_name": "Main School Campus", "radius_meters": 200},
            performed_by=self.admin_user,
            client_ip="198.51.100.10",
            user_agent="AttendSure-Web",
            created_at=day_two,
        )

        # Direct serializer checks: readable module fallback, everyday details, computed status
        ser_login = AuditLogSerializer(log_login).data
        self.assertTrue(ser_login["created_at"])
        self.assertEqual(ser_login["module"], "Account")
        self.assertEqual(ser_login["actor_username"], self.admin_user.username)
        self.assertEqual(ser_login["actor_name"], "Clara Admin")
        self.assertEqual(ser_login["status"], "SUCCESS")
        self.assertIn("Signed in", ser_login["details"])
        self.assertNotIn("{", ser_login["details"])

        ser_lock = AuditLogSerializer(log_lockout).data
        self.assertEqual(ser_lock["status"], "FAILED")
        self.assertEqual(ser_lock["target_model"], "user_profiles")
        self.assertEqual(ser_lock["target_id"], self.teacher_user.id)
        self.assertEqual(ser_lock["module"], "Account Security")
        self.assertIn("locked", ser_lock["details"].lower())

        ser_upd = AuditLogSerializer(log_update).data
        self.assertEqual(ser_upd["module"], "Campus Boundary")
        self.assertIn("Main School Campus", ser_upd["details"])
        self.assertEqual(ser_upd["status"], "SUCCESS")

        # API filtering checks
        self.client.force_authenticate(user=self.admin_user)

        by_action = self.client.get("/api/v1/accounts/audit-logs/", {"action": "LOCKOUT"})
        self.assertEqual(by_action.status_code, 200)
        self.assertEqual(by_action.data["count"], 1)
        self.assertEqual(by_action.data["results"][0]["id"], log_lockout.id)
        self.assertEqual(by_action.data["results"][0]["status"], "FAILED")

        by_date = self.client.get("/api/v1/accounts/audit-logs/", {"date": "2026-11-20"})
        self.assertEqual(by_date.status_code, 200)
        self.assertEqual(by_date.data["count"], 1)
        self.assertEqual(by_date.data["results"][0]["id"], log_login.id)

        # Malformed date never raises 500
        bad_date = self.client.get("/api/v1/accounts/audit-logs/", {"date": "not-a-valid-date"})
        self.assertEqual(bad_date.status_code, 200)

        # Search by username / name / IP / module
        by_search_ip = self.client.get("/api/v1/accounts/audit-logs/", {"search": "203.0.113.44"})
        self.assertEqual(by_search_ip.status_code, 200)
        self.assertEqual(by_search_ip.data["count"], 1)
        self.assertEqual(by_search_ip.data["results"][0]["id"], log_lockout.id)

        by_search_name = self.client.get("/api/v1/accounts/audit-logs/", {"search": "Marco"})
        self.assertEqual(by_search_name.status_code, 200)
        self.assertEqual(by_search_name.data["count"], 1)
        self.assertEqual(by_search_name.data["results"][0]["id"], log_lockout.id)

        by_search_module = self.client.get("/api/v1/accounts/audit-logs/", {"search": "Campus Boundary"})
        self.assertEqual(by_search_module.status_code, 200)
        self.assertEqual(by_search_module.data["count"], 1)
        self.assertEqual(by_search_module.data["results"][0]["id"], log_update.id)

    def test_redis_cache_defaults_enabled_when_redis_url_is_configured(self):
        self.assertTrue(_resolve_use_redis_cache(None, "redis://redis:6379/0", is_testing=False))
        self.assertTrue(_resolve_use_redis_cache("", "redis://redis:6379/0", is_testing=False))
        self.assertTrue(_resolve_use_redis_cache("True", "", is_testing=False))
        self.assertFalse(_resolve_use_redis_cache("False", "redis://redis:6379/0", is_testing=False))
        self.assertFalse(_resolve_use_redis_cache("0", "redis://redis:6379/0", is_testing=False))
        self.assertFalse(_resolve_use_redis_cache(None, "", is_testing=False))
        self.assertFalse(_resolve_use_redis_cache("True", "redis://redis:6379/0", is_testing=True))


class ManilaTimezoneAuditAndTimeFormatTests(APITestCase):
    """Regression coverage for Manila local_day_bounds, single AuditLog writes, and 12-hour formatting."""

    def setUp(self):
        cache.clear()
        self.admin_user = User.objects.create_user(
            username="tz_audit_admin",
            password="AttendSure2026!",
            first_name="Elena",
            last_name="Admin",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user,
            employee_id="EMP-TZA-ADM",
            can_handle_classes=False,
        )

        self.teacher_user = User.objects.create_user(
            username="tz_audit_teacher",
            password="AttendSure2026!",
            first_name="Ramon",
            last_name="Santos",
        )
        UserProfile.objects.create(user=self.teacher_user, role="TEACHER")
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user,
            employee_id="EMP-TZA-TCH",
            can_handle_classes=True,
        )

        self.boundary = CampusBoundary.objects.create(
            campus_name="Macasandig Main Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            loafing_grace_minutes=0,
            duty_start_time=time(7, 30),
            duty_end_time=time(17, 0),
            is_active=True,
        )
        self.school = SchoolSettings.objects.create(
            school_id="304100",
            school_name="Macasandig National High School",
            campus_boundary=self.boundary,
        )

    def test_manila_early_morning_0715_matches_same_day_and_prevents_duplicate_open_loafing(self):
        """
        07:15 AM Asia/Manila is 23:15 UTC on the previous UTC day.
        local_day_bounds must match it as today's Manila record, deduplicate follow-up
        outside pings, and auto-resolve when the teacher returns inside campus.
        """
        manila_day = date(2026, 11, 25)
        start_dt, end_dt = local_day_bounds(manila_day)

        dt_0700_pht = datetime(2026, 11, 24, 23, 0, tzinfo=dt_timezone.utc)   # 2026-11-25 07:00 AM PHT
        dt_0715_pht = datetime(2026, 11, 24, 23, 15, tzinfo=dt_timezone.utc)  # 2026-11-25 07:15 AM PHT
        dt_0720_pht = datetime(2026, 11, 24, 23, 20, tzinfo=dt_timezone.utc)  # 2026-11-25 07:20 AM PHT
        dt_0725_pht = datetime(2026, 11, 24, 23, 25, tzinfo=dt_timezone.utc)  # 2026-11-25 07:25 AM PHT
        dt_prev_2359_pht = datetime(2026, 11, 24, 15, 59, 59, tzinfo=dt_timezone.utc)  # 2026-11-24 11:59:59 PM PHT

        self.assertLessEqual(start_dt, dt_0715_pht)
        self.assertLess(dt_0715_pht, end_dt)
        self.assertLess(dt_prev_2359_pht, start_dt)

        # Teacher timed in at 07:00 AM Manila time
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            attendance_date=manila_day,
            time_in=dt_0700_pht,
            status="ON_TIME",
            face_verified_on_device=True,
        )

        # First outside ping at 07:15 AM Manila (23:15 UTC previous day) -> creates 1 OPEN incident
        res1 = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.4895,
                "longitude": 124.6567,
                "accuracy_meters": 10.0,
                "device_id": "TZ-PHONE-01",
            },
            now_override=dt_0715_pht,
        )
        self.assertEqual(res1["zone_status"], "LOAFING_ALERT")
        self.assertIsNotNone(res1["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.filter(teacher=self.teacher).count(), 1)

        # Querying by Manila calendar date "2026-11-25" finds the 07:15 AM PHT incident
        matched = list(
            get_loafing_incidents_queryset(user=self.admin_user, date_str="2026-11-25")
        )
        self.assertEqual(len(matched), 1)
        self.assertEqual(matched[0].id, res1["loafing_incident_id"])

        # Second outside ping at 07:20 AM Manila (23:20 UTC previous day) -> NO duplicate alert created
        res2 = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.4896,
                "longitude": 124.6567,
                "accuracy_meters": 10.0,
                "device_id": "TZ-PHONE-01",
            },
            now_override=dt_0720_pht,
        )
        self.assertEqual(res2["zone_status"], "LOAFING_ALERT")
        self.assertEqual(res2["loafing_incident_id"], res1["loafing_incident_id"])
        self.assertEqual(LoafingIncident.objects.filter(teacher=self.teacher).count(), 1)

        # Inside campus ping at 07:25 AM Manila -> auto-resolves today's open alert to RETURNED
        res3 = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.4858,
                "longitude": 124.6567,
                "accuracy_meters": 8.0,
                "device_id": "TZ-PHONE-01",
            },
            now_override=dt_0725_pht,
        )
        self.assertEqual(res3["zone_status"], "INSIDE")
        inc = LoafingIncident.objects.get(id=res1["loafing_incident_id"])
        self.assertEqual(inc.status, "RETURNED")
        self.assertEqual(inc.resolved_at, dt_0725_pht)

        # Month bounds include 1st-of-month 00:30 AM Manila (16:30 UTC previous month)
        m_start, m_end = local_month_bounds(2026, 11)
        nov1_0030_pht = datetime(2026, 10, 31, 16, 30, tzinfo=dt_timezone.utc)
        self.assertLessEqual(m_start, nov1_0030_pht)
        self.assertLess(nov1_0030_pht, m_end)

    def test_school_settings_boundary_and_lifecycle_actions_write_exactly_one_audit_log(self):
        self.client.force_authenticate(user=self.admin_user)
        AuditLog.objects.all().delete()

        # 1. Saving SchoolSettings with campus boundary coordinates via PUT writes exactly 1 AuditLog
        put_res = self.client.put(
            "/api/v1/school/settings/",
            {
                "school_name": "Macasandig National High School",
                "school_id": "304100",
                "latitude": 8.4861,
                "longitude": 124.6571,
                "geofence_radius_meters": 180,
            },
            format="json",
        )
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 1)
        first_log = AuditLog.objects.first()
        self.assertEqual(first_log.table_name, SchoolSettings._meta.db_table)
        self.assertEqual(first_log.action, "UPDATE")

        # 2. Saving SchoolSettings via PATCH writes exactly 1 additional AuditLog
        patch_res = self.client.patch(
            "/api/v1/school/settings/",
            {"geofence_radius_meters": 200},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 2)

        # 3. Updating campus boundary directly writes exactly 1 additional AuditLog
        b_res = self.client.put(
            "/api/v1/campus/boundary/",
            {
                "campus_name": "Macasandig Main Campus",
                "center_latitude": 8.4862,
                "center_longitude": 124.6572,
                "radius_meters": 175,
                "duty_start_time": "07:30",
                "duty_end_time": "17:00",
            },
            format="json",
        )
        self.assertEqual(b_res.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 3)

        # 4. Resolving a loafing incident writes exactly 1 additional AuditLog
        inc = LoafingIncident.objects.create(
            incident_type="TEACHER_OUTSIDE_GEOFENCE",
            status="OPEN",
            teacher=self.teacher,
            remarks="Outside boundary during duty.",
        )
        res_inc = self.client.post(
            f"/api/v1/campus/loafing-incidents/{inc.id}/resolve/",
            {"status": "EXCUSED", "remarks": "Approved Division meeting."},
            format="json",
        )
        self.assertEqual(res_inc.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 4)

        # 5. Exit pass mark-returned and cancel each write exactly 1 AuditLog
        pass_one = ExitPass.objects.create(
            pass_scope="TEACHER",
            teacher=self.teacher,
            issued_by=self.admin_user,
            pass_type="Official Business",
            destination="Division Office",
            reason="Submit monthly report",
            valid_until=timezone.now() + timedelta(hours=2),
        )
        ret_res = self.client.post(f"/api/v1/attendance/exit-passes/{pass_one.id}/mark-returned/")
        self.assertEqual(ret_res.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 5)
        self.assertEqual(AuditLog.objects.order_by("-id").first().action, "RETURN")

        pass_two = ExitPass.objects.create(
            pass_scope="TEACHER",
            teacher=self.teacher,
            issued_by=self.admin_user,
            pass_type="Official Business",
            destination="District Office",
            reason="Meeting postponed",
            valid_until=timezone.now() + timedelta(hours=2),
        )
        can_res = self.client.post(f"/api/v1/attendance/exit-passes/{pass_two.id}/cancel/")
        self.assertEqual(can_res.status_code, 200)
        self.assertEqual(AuditLog.objects.count(), 6)
        self.assertEqual(AuditLog.objects.order_by("-id").first().action, "CANCEL")

    def test_shared_12_hour_time_formatters_and_conflict_messages(self):
        self.assertEqual(format_time_12h(time(0, 0)), "12:00 AM")
        self.assertEqual(format_time_12h(time(7, 30)), "7:30 AM")
        self.assertEqual(format_time_12h(time(12, 0)), "12:00 PM")
        self.assertEqual(format_time_12h(time(16, 45, 9), include_seconds=True), "4:45:09 PM")
        self.assertEqual(format_time_12h("13:15"), "1:15 PM")
        self.assertEqual(format_time_12h(None), "—")
        self.assertEqual(format_time_range_12h(time(7, 30), time(17, 0)), "7:30 AM - 5:00 PM")

        utc_early_manila = datetime(2026, 11, 24, 23, 15, 5, tzinfo=dt_timezone.utc)
        self.assertEqual(format_time_12h(utc_early_manila), "7:15 AM")
        self.assertEqual(
            format_datetime_12h(utc_early_manila, include_seconds=True, date_format="%Y-%m-%d"),
            "2026-11-25 7:15:05 AM",
        )

        # Verify schedule conflict alerts emit 12-hour AM/PM windows (never 24-hour)
        sy = SchoolYear.objects.create(
            name="2026-2027",
            start_date=date(2026, 6, 1),
            end_date=date(2027, 3, 31),
            is_active=True,
        )
        gl = GradeLevel.objects.create(level_number=8, code="G8", name="Grade 8", stage="JHS")
        sec = Section.objects.create(
            school_year=sy,
            grade_level=gl,
            name="Rizal",
            room_name="Room 201",
            adviser=self.teacher,
        )
        subj = Subject.objects.create(code="SCI-08", title="Science 8", grade_level=gl)
        ClassPeriod.objects.create(
            section=sec,
            subject=subj,
            teacher=self.teacher,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(13, 0),
            end_time=time(14, 0),
        )

        conflict = check_class_period_conflicts(
            section=sec,
            teacher=self.teacher,
            day_of_week="ALL_WEEKDAYS",
            start_time=time(13, 30),
            end_time=time(14, 30),
        )
        self.assertTrue(conflict["has_conflict"])
        self.assertIn("1:00 PM - 2:00 PM", conflict["section_conflict"])
        self.assertNotIn("13:00", conflict["section_conflict"])
        self.assertIn("1:00 PM - 2:00 PM", conflict["teacher_conflict"])
        self.assertNotIn("13:00", conflict["teacher_conflict"])


class TelemetryAuditPushAndOnboardingTests(APITestCase):
    """Covers phone health overview, silent-teacher audit, JWT logout, BULK_ABSENT, locator slip approval, onboarding & legacy gate."""

    def setUp(self):
        cache.clear()
        self.admin_user = User.objects.create_user(
            username="phase1_admin",
            password="AttendSure2026!",
            first_name="Grace",
            last_name="Admin",
            is_staff=True,
            is_superuser=True,
        )
        UserProfile.objects.create(user=self.admin_user, role="ADMIN")
        self.admin_teacher = TeacherProfile.objects.create(
            user=self.admin_user, employee_id="EMP-P1-ADM", can_handle_classes=True
        )

        self.teacher_user = User.objects.create_user(
            username="phase1_teacher",
            password="AttendSure2026!",
            first_name="Noel",
            last_name="Diaz",
        )
        UserProfile.objects.create(user=self.teacher_user, role="TEACHER")
        self.teacher = TeacherProfile.objects.create(
            user=self.teacher_user, employee_id="EMP-P1-TCH", can_handle_classes=True
        )

        self.boundary = CampusBoundary.objects.create(
            campus_name="Phase 1 Campus",
            center_latitude=Decimal("8.485800"),
            center_longitude=Decimal("124.656700"),
            radius_meters=150,
            loafing_grace_minutes=10,
            duty_start_time=time(0, 0),
            duty_end_time=time(23, 59),
            is_active=True,
        )

    def test_campus_overview_includes_phone_health_fields_and_manual_audit_detects_signal_lost(self):
        now = timezone.now()
        today = timezone.localdate()
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            attendance_date=today,
            time_in=now - timedelta(minutes=45),
            status="ON_TIME",
            face_verified_on_device=True,
        )
        TeacherLocationPing.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            latitude=Decimal("8.485800"),
            longitude=Decimal("124.656700"),
            accuracy_meters=9.0,
            zone_status="INSIDE",
            battery_percent=42,
            is_charging=True,
            is_low_power_mode=False,
            network_type="WIFI",
            is_gps_enabled=True,
            app_state="ACTIVE",
            ping_source="OFFLINE_QUEUE",
            recorded_at=now - timedelta(minutes=30),
        )

        overview = get_campus_boundary_overview(user=self.admin_user)
        row = next(r for r in overview["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertEqual(row["battery_percent"], 42)
        self.assertTrue(row["is_charging"])
        self.assertFalse(row["is_low_power_mode"])
        self.assertEqual(row["network_type"], "WIFI")
        self.assertTrue(row["is_gps_enabled"])
        self.assertEqual(row["app_state"], "ACTIVE")
        self.assertEqual(row["ping_source"], "OFFLINE_QUEUE")

        # Manual maintenance audit detects silent on-duty teacher & returns counts for both
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.post("/api/v1/reports/system-status/", {"action": "RUN_LOAFING_AUDIT"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["audit_summary"]["created_signal_lost_incidents"], 1)
        self.assertIn("signal-lost", res.data["message"].lower())
        self.assertTrue(
            LoafingIncident.objects.filter(
                teacher=self.teacher, incident_type="TEACHER_SIGNAL_LOST", status="OPEN"
            ).exists()
        )

        # Live campus overview now marks this clocked-in offline teacher as SIGNAL_LOST and excludes from verified_inside
        overview_after = get_campus_boundary_overview(user=self.admin_user)
        row_after = next(r for r in overview_after["teacher_list"] if r["teacher_id"] == self.teacher.id)
        self.assertTrue(row_after["has_signal_lost"])
        self.assertEqual(row_after["status"], "SIGNAL_LOST")
        self.assertEqual(overview_after["verified_inside"], 0)

    def test_jwt_logout_revokes_only_current_device_even_with_expired_access_token(self):
        # Sign in on Device 1 and Device 2
        login1 = self.client.post(
            "/api/v1/accounts/login/",
            {"username": self.teacher_user.username, "password": "AttendSure2026!"},
            format="json",
        )
        login2 = self.client.post(
            "/api/v1/accounts/login/",
            {"username": self.teacher_user.username, "password": "AttendSure2026!"},
            format="json",
        )
        self.assertEqual(login1.status_code, 200)
        self.assertEqual(login2.status_code, 200)
        refresh1 = login1.data["refresh"]
        refresh2 = login2.data["refresh"]

        # Simulate expired/invalid Bearer access token on Device 1 logout
        self.client.credentials(HTTP_AUTHORIZATION="Bearer expired.invalid.jwt")
        logout_res = self.client.post(
            "/api/v1/accounts/logout/",
            {"refresh": refresh1},
            format="json",
        )
        self.assertEqual(logout_res.status_code, 200, logout_res.data)
        self.assertTrue(logout_res.data["revoked"])
        self.client.credentials()

        # Device 1 refresh token is blacklisted (401)
        ref1_res = self.client.post("/api/v1/accounts/token/refresh/", {"refresh": refresh1}, format="json")
        self.assertEqual(ref1_res.status_code, 401)

        # Device 2 refresh token remains valid (200)
        ref2_res = self.client.post("/api/v1/accounts/token/refresh/", {"refresh": refresh2}, format="json")
        self.assertEqual(ref2_res.status_code, 200)
        self.assertIn("access", ref2_res.data)

    def test_bulk_absent_audit_label_and_summary(self):
        log = AuditLog.objects.create(
            table_name="class_attendance",
            record_id=12,
            action="BULK_ABSENT",
            new_data={
                "period_id": 12,
                "attendance_date": "2026-11-25",
                "marked_absent_count": 4,
                "marked_excused_count": 1,
            },
            performed_by=self.teacher_user,
            client_ip="127.0.0.1",
        )
        ser = AuditLogSerializer(log).data
        self.assertEqual(ser["action_label"], "Marked Unscanned Students Absent")
        self.assertIn("Marked 4 unscanned student(s) absent", ser["details"])
        self.assertIn("1 excused", ser["details"])

    def test_onboarding_state_complete_and_reset_endpoints(self):
        self.client.force_authenticate(user=self.teacher_user)

        me1 = self.client.get("/api/v1/accounts/me/")
        self.assertEqual(me1.status_code, 200)
        self.assertFalse(me1.data["onboarding_completed"])
        self.assertIsNone(me1.data["onboarding_completed_at"])
        self.assertEqual(me1.data["onboarding_version"], 0)
        self.assertTrue(me1.data["needs_onboarding"])

        done = self.client.post("/api/v1/auth/onboarding/complete/", {}, format="json")
        self.assertEqual(done.status_code, 200)
        self.assertTrue(done.data["onboarding_completed"])
        self.assertIsNotNone(done.data["onboarding_completed_at"])
        self.assertGreaterEqual(done.data["onboarding_version"], 1)
        self.assertFalse(done.data["needs_onboarding"])

        reset = self.client.post("/api/v1/auth/onboarding/reset/", {}, format="json")
        self.assertEqual(reset.status_code, 200)
        self.assertFalse(reset.data["onboarding_completed"])
        self.assertTrue(reset.data["needs_onboarding"])

    def test_unapproved_teacher_locator_slip_does_not_bypass_geofence_or_loafing_until_approved(self):
        from apps.campus.services import detect_silent_on_duty_teachers
        from common.device_crypto import consume_checkin_challenge_nonce, issue_checkin_challenge_nonce

        # Verify atomic challenge nonce consumption prevents replay
        nonce = issue_checkin_challenge_nonce(self.teacher.id)
        self.assertTrue(consume_checkin_challenge_nonce(self.teacher.id, nonce))
        self.assertFalse(consume_checkin_challenge_nonce(self.teacher.id, nonce))

        now = timezone.now()
        priv_key, pub_hex, key_id = generate_ed25519_keypair()
        device_id = "DEV-LOCATOR-TEST-01"

        # 1. Teacher requests an Official Locator Slip -> starts as PENDING_APPROVAL (is_approved=False)
        self.client.force_authenticate(user=self.teacher_user)
        slip_res = self.client.post(
            "/api/v1/attendance/exit-passes/",
            {
                "pass_scope": "TEACHER",
                "pass_type": "Official Travel Order",
                "destination": "DepEd Division Office",
                "reason": "Submit monthly enrollment reports",
                "valid_until": (now + timedelta(hours=3)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(slip_res.status_code, 201, slip_res.data)
        self.assertFalse(slip_res.data["is_approved"])
        self.assertEqual(slip_res.data["pass_status"], "PENDING_APPROVAL")
        slip_id = slip_res.data["id"]

        # Teacher can still edit their own slip while pending approval
        edit_pending = self.client.patch(
            f"/api/v1/attendance/exit-passes/{slip_id}/",
            {"destination": "DepEd Division Records Office"},
            format="json",
        )
        self.assertEqual(edit_pending.status_code, 200, edit_pending.data)

        # 2. Unapproved locator slip does NOT allow outside-campus Time In (403 OUTSIDE_CAMPUS)
        ts_ms = int(now.timestamp() * 1000)
        sig_out = sign_checkin_payload_ed25519(
            private_key=priv_key,
            user_id=self.teacher_user.id,
            device_id=device_id,
            timestamp_ms=ts_ms,
            action="TIME_IN",
        )
        outside_checkin = self.client.post(
            "/api/v1/campus/check-in/",
            {
                "action": "TIME_IN",
                "latitude": 8.495000,
                "longitude": 124.656700,
                "accuracy_meters": 10.0,
                "device_id": device_id,
                "biometric_key_id": key_id,
                "biometric_public_key": pub_hex,
                "biometric_key_algorithm": "ED25519",
                "biometric_signature": sig_out,
                "biometric_timestamp_ms": ts_ms,
            },
            format="json",
        )
        self.assertEqual(outside_checkin.status_code, 403, outside_checkin.data)

        # 3. Teacher clocks in INSIDE campus, then pings outside campus beyond grace -> triggers LOAFING_ALERT
        checkin_time = now - timedelta(minutes=45)
        self.boundary.loafing_grace_minutes = 0
        self.boundary.save(update_fields=["loafing_grace_minutes"])
        cache.delete("campus:active_boundary")
        TeacherDailyAttendance.objects.create(
            teacher=self.teacher,
            boundary=self.boundary,
            attendance_date=timezone.localtime(now - timedelta(minutes=30)).date(),
            time_in=checkin_time,
            status="ON_TIME",
            face_verified_on_device=True,
        )
        ping_unapproved = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.495000,
                "longitude": 124.656700,
                "accuracy_meters": 10.0,
                "device_id": device_id,
            },
            now_override=now - timedelta(minutes=30),
        )
        self.assertEqual(ping_unapproved["zone_status"], "LOAFING_ALERT")
        self.assertIsNotNone(ping_unapproved["loafing_incident_id"])

        # Silent-teacher audit STILL flags teacher when slip is unapproved
        silent_res = detect_silent_on_duty_teachers(now_override=now, silence_threshold_minutes=15)
        self.assertEqual(silent_res["created_signal_lost_incidents"], 1)

        # 4. School leader approves the locator slip -> is_approved=True, issued_by preserved, pass_status=ACTIVE
        self.client.force_authenticate(user=self.admin_user)
        approve_res = self.client.post(f"/api/v1/attendance/exit-passes/{slip_id}/approve/", {}, format="json")
        self.assertEqual(approve_res.status_code, 200, approve_res.data)
        self.assertTrue(approve_res.data["is_approved"])
        self.assertEqual(approve_res.data["pass_status"], "ACTIVE")

        slip_obj = ExitPass.objects.get(id=slip_id)
        self.assertTrue(slip_obj.is_approved)
        self.assertEqual(slip_obj.issued_by_id, self.teacher_user.id)
        self.assertEqual(slip_obj.approved_by_id, self.admin_user.id)
        self.assertIsNotNone(slip_obj.approved_at)

        # 5. Non-leader teacher can no longer edit or delete the approved slip (403)
        self.client.force_authenticate(user=self.teacher_user)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/attendance/exit-passes/{slip_id}/",
                {"destination": "Tampered Destination"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(self.client.delete(f"/api/v1/attendance/exit-passes/{slip_id}/").status_code, 403)

        # 6. Now outside-campus ping is recognized as AUTHORIZED_OUTSIDE and silent-teacher check skips them
        LoafingIncident.objects.filter(teacher=self.teacher).delete()
        after_approve = max(timezone.now(), slip_obj.issued_at) + timedelta(seconds=5)
        ping_approved = record_teacher_gps_ping(
            user=self.teacher_user,
            validated_data={
                "latitude": 8.495000,
                "longitude": 124.656700,
                "accuracy_meters": 10.0,
                "device_id": device_id,
            },
            now_override=after_approve,
        )
        self.assertEqual(ping_approved["zone_status"], "AUTHORIZED_OUTSIDE")
        self.assertIsNone(ping_approved["loafing_incident_id"])

        silent_after = detect_silent_on_duty_teachers(
            now_override=after_approve + timedelta(minutes=30), silence_threshold_minutes=15
        )
        self.assertEqual(silent_after["created_signal_lost_incidents"], 0)

    def test_legacy_unversioned_routes_retired_by_default(self):
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.get("/api/dashboard/overview/")
        self.assertEqual(res.status_code, 404)

