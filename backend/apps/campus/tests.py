"""
AttendSure - Campus Security, Biometric Freshness/Replay, Device Binding,
Trusted Proxy IP, Allowed Hosts & Audit Log Filtering Tests
Run: python manage.py test apps.campus.tests --verbosity=2
"""

from datetime import date, datetime, time, timedelta
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
from apps.campus.models import CampusBoundary
from common.audit import get_client_ip, record_audit_log
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

    def _checkin_payload(self, **overrides) -> dict:
        payload = {
            "action": "TIME_IN",
            "latitude": 8.4858,
            "longitude": 124.6567,
            "accuracy_meters": 10,
            "device_id": "PHONE-SEC-001",
            "device_model": "Test Phone",
            "biometric_verified_on_device": True,
            "biometric_key_id": "a" * 64,
            "biometric_proof": "1" * 64,
            "biometric_timestamp_ms": int(time_module.time() * 1000),
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
            self._checkin_payload(device_id="PHONE-FIRST-BIND", biometric_proof="2" * 64),
            format="json",
        )
        self.assertEqual(ok_res.status_code, 201, ok_res.data)
        self.teacher.refresh_from_db()
        self.assertEqual(self.teacher.bound_device_id, "PHONE-FIRST-BIND")

    def test_biometric_proof_format_freshness_and_replay_protection(self):
        self.client.force_authenticate(user=self.teacher_user)
        now_ms = int(time_module.time() * 1000)

        # 1. Invalid non-hex / short proof rejected with 400
        bad_fmt = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(biometric_proof="not-a-sha256-hex", biometric_timestamp_ms=now_ms),
            format="json",
        )
        self.assertEqual(bad_fmt.status_code, 400)
        self.assertEqual(bad_fmt.data["error_code"], "INVALID_BIOMETRIC_PROOF")

        # 2. Missing biometric_timestamp_ms rejected with 400 BIOMETRIC_PROOF_EXPIRED
        missing_ts = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(biometric_proof="3" * 64, biometric_timestamp_ms=None),
            format="json",
        )
        self.assertEqual(missing_ts.status_code, 400)
        self.assertEqual(missing_ts.data["error_code"], "BIOMETRIC_PROOF_EXPIRED")

        # 3. Stale timestamp (> 2 minutes old) rejected with 400 BIOMETRIC_PROOF_EXPIRED
        stale = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                biometric_proof="4" * 64,
                biometric_timestamp_ms=now_ms - 180_000,
            ),
            format="json",
        )
        self.assertEqual(stale.status_code, 400)
        self.assertEqual(stale.data["error_code"], "BIOMETRIC_PROOF_EXPIRED")

        # 4. Future timestamp (> 2 minutes ahead) rejected with 400 BIOMETRIC_PROOF_EXPIRED
        future = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                biometric_proof="5" * 64,
                biometric_timestamp_ms=now_ms + 180_000,
            ),
            format="json",
        )
        self.assertEqual(future.status_code, 400)
        self.assertEqual(future.data["error_code"], "BIOMETRIC_PROOF_EXPIRED")

        # 5. Fresh valid 64-char hex proof succeeds
        proof_hash = "ab" * 32
        first_ok = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                action="TIME_IN",
                biometric_proof=proof_hash,
                biometric_timestamp_ms=now_ms,
            ),
            format="json",
        )
        self.assertEqual(first_ok.status_code, 201, first_ok.data)

        # 6. Replaying the exact same proof (even in uppercase) is rejected with 400 BIOMETRIC_PROOF_REPLAYED
        replayed = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                action="TIME_OUT",
                biometric_proof=proof_hash.upper(),
                biometric_timestamp_ms=int(time_module.time() * 1000),
            ),
            format="json",
        )
        self.assertEqual(replayed.status_code, 400)
        self.assertEqual(replayed.data["error_code"], "BIOMETRIC_PROOF_REPLAYED")

        # 7. Fresh unique proof succeeds on TIME_OUT
        second_ok = self.client.post(
            "/api/v1/campus/check-in/",
            self._checkin_payload(
                action="TIME_OUT",
                biometric_proof="cd" * 32,
                biometric_timestamp_ms=int(time_module.time() * 1000),
            ),
            format="json",
        )
        self.assertEqual(second_ok.status_code, 201, second_ok.data)

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
