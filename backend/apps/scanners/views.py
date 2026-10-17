"""
AttendSure V3 - Gate Scanner & IoT Telemetry Views
File: backend/apps/scanners/views.py

Cybersecurity & Performance:
1. Constant-Time Authentication: Eliminates timing attacks on hardware secret keys.
2. Direct SQL Updates: Avoids full model serialization for fast kiosk pings.
3. Anti-Passback & Scan Debounce: Blocks duplicate card taps within 4 seconds.
4. Silent High-Priority Wake-Up: Automatically signals faculty phones to wake up
   and begin GPS tracking the moment an 'IN' gate tap occurs.
5. Zero Mock Data: All operations run directly against real database models.
"""

import hmac
import json
import logging
import urllib.request
import urllib.error
from datetime import timedelta

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from apps.academics.models import (
    IoTKiosk,
    FacultyProfile,
    Student,
    FacultyGateLog,
    StudentGateLog,
)

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def verify_kiosk_secret(stored_secret: str, provided_secret: str) -> bool:
    """Constant-time secret comparison to prevent side-channel timing attacks."""
    if not stored_secret or not provided_secret:
        return False
    return hmac.compare_digest(
        str(stored_secret).strip().encode("utf-8"),
        str(provided_secret).strip().encode("utf-8")
    )


def send_silent_wake_up_push(push_token: str, action: str = "START_TRACKING_IN") -> bool:
    """
    Sends an encrypted, high-priority silent push notification to the faculty phone.
    Wakes up the mobile app in the background without disturbing the user.
    """
    if not push_token or not str(push_token).startswith("ExponentPushToken"):
        return False

    payload = {
        "to": push_token,
        "priority": "high",
        "_contentAvailable": True,
        "data": {
            "action": action,
            "timestamp": timezone.now().isoformat(),
        },
    }

    try:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        # Fast 2.0-second timeout so external network calls never block gate hardware
        with urllib.request.urlopen(req, timeout=2.0) as response:
            return response.status == 200
    except Exception as exc:
        logger.warning(f"[WakeUpPush] Could not send wake-up push: {exc}")
        return False


class KioskHeartbeatView(APIView):
    """
    Endpoint: POST /api/scanners/heartbeat/
    Receives keep-alive pings from physical gate turnstiles (Raspberry Pi / ESP32).
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        kiosk_code = str(request.data.get("kiosk_code", "")).strip()
        secret_key = str(request.data.get("secret_key", "")).strip()

        if not kiosk_code or not secret_key:
            return Response(
                {"error": "Both kiosk_code and secret_key are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fast fetch of only necessary columns
        kiosk = (
            IoTKiosk.objects.filter(kiosk_code=kiosk_code, is_active=True)
            .only("id", "kiosk_code", "secret_hash", "terminal_name")
            .first()
        )

        if not kiosk:
            return Response(
                {"error": "Terminal not registered or inactive."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Constant-time comparison
        if not verify_kiosk_secret(kiosk.secret_hash, secret_key):
            return Response(
                {"error": "Hardware authentication key invalid."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        # Direct SQL update for performance
        IoTKiosk.objects.filter(pk=kiosk.pk).update(last_ping=now)

        return Response(
            {
                "status": "ONLINE",
                "kiosk_code": kiosk.kiosk_code,
                "terminal_name": kiosk.terminal_name,
                "server_time": now.isoformat(),
            },
            status=status.HTTP_200_OK,
        )


class GateScanAPIView(APIView):
    """
    Endpoint: POST /api/gate/scan/
    Processes RFID card taps and barcode scans at campus gates.
    Automatically triggers mobile GPS tracking for faculty on 'IN' scans.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        data = request.data
        raw_identifier = str(data.get("rfid_uid") or data.get("identifier") or data.get("qr_token") or "").strip()
        scan_direction = str(data.get("scan_type") or data.get("direction") or "IN").upper()
        kiosk_code = str(data.get("kiosk_code", "")).strip()

        if not raw_identifier:
            return Response(
                {"success": False, "message": "RFID UID or QR token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if scan_direction not in ["IN", "OUT"]:
            scan_direction = "IN"

        now = timezone.now()
        cooldown_threshold = now - timedelta(seconds=4)

        # ------------------------------------------------------------------
        # 1. Check for Faculty Record First
        # ------------------------------------------------------------------
        faculty = (
            FacultyProfile.objects.filter(is_active=True)
            .filter(rfid_uid__iexact=raw_identifier)
            .only("id", "first_name", "last_name", "employee_id", "rfid_uid", "bound_device_id")
            .first()
        )
        if not faculty:
            faculty = (
                FacultyProfile.objects.filter(is_active=True)
                .filter(qr_token__iexact=raw_identifier)
                .only("id", "first_name", "last_name", "employee_id", "rfid_uid", "bound_device_id")
                .first()
            )

        if faculty:
            # Debounce protection: Reject rapid accidental taps within 4 seconds
            recent_tap = FacultyGateLog.objects.filter(
                faculty=faculty,
                timestamp__gte=cooldown_threshold
            ).exists()
            if recent_tap:
                return Response(
                    {"success": False, "status": "COOLDOWN", "message": "Card tapped too quickly. Please wait."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            # Record gate entry/exit log
            log_kwargs = {"faculty": faculty}
            # Dynamically match scan direction field name
            if "scan_type" in [f.name for f in FacultyGateLog._meta.get_fields()]:
                log_kwargs["scan_type"] = scan_direction
            elif "direction" in [f.name for f in FacultyGateLog._meta.get_fields()]:
                log_kwargs["direction"] = scan_direction

            FacultyGateLog.objects.create(**log_kwargs)

            # Automatic Wake-up Push Trigger
            push_token = (
                getattr(faculty, "push_token", None)
                or getattr(getattr(faculty, "account", None), "push_token", None)
            )

            wake_up_sent = False
            if push_token:
                if scan_direction == "IN":
                    wake_up_sent = send_silent_wake_up_push(push_token, action="START_TRACKING_IN")
                else:
                    wake_up_sent = send_silent_wake_up_push(push_token, action="STOP_TRACKING_OUT")

            faculty_name = f"{faculty.first_name} {faculty.last_name}".strip() or faculty.employee_id
            return Response(
                {
                    "success": True,
                    "role": "FACULTY",
                    "name": faculty_name,
                    "employee_id": faculty.employee_id,
                    "direction": scan_direction,
                    "timestamp": timezone.localtime(now).strftime("%I:%M:%S %p"),
                    "mobile_wake_up_dispatched": wake_up_sent,
                    "message": f"Welcome, {faculty_name}. Gate {scan_direction} recorded.",
                },
                status=status.HTTP_200_OK,
            )

        # ------------------------------------------------------------------
        # 2. Check for Student Record
        # ------------------------------------------------------------------
        student = (
            Student.objects.filter(is_active=True)
            .filter(rfid_uid__iexact=raw_identifier)
            .select_related("section")
            .only("id", "first_name", "last_name", "lrn", "rfid_uid", "section__name")
            .first()
        )
        if not student:
            student = (
                Student.objects.filter(is_active=True)
                .filter(qr_token__iexact=raw_identifier)
                .select_related("section")
                .only("id", "first_name", "last_name", "lrn", "rfid_uid", "section__name")
                .first()
            )

        if student:
            recent_tap = StudentGateLog.objects.filter(
                student=student,
                timestamp__gte=cooldown_threshold
            ).exists()
            if recent_tap:
                return Response(
                    {"success": False, "status": "COOLDOWN", "message": "Card tapped too quickly. Please wait."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            log_kwargs = {"student": student}
            if "scan_type" in [f.name for f in StudentGateLog._meta.get_fields()]:
                log_kwargs["scan_type"] = scan_direction
            elif "direction" in [f.name for f in StudentGateLog._meta.get_fields()]:
                log_kwargs["direction"] = scan_direction

            StudentGateLog.objects.create(**log_kwargs)

            student_name = f"{student.first_name} {student.last_name}".strip() or student.lrn
            section_name = student.section.name if student.section else "Unassigned"

            return Response(
                {
                    "success": True,
                    "role": "STUDENT",
                    "name": student_name,
                    "lrn": student.lrn,
                    "section": section_name,
                    "direction": scan_direction,
                    "timestamp": timezone.localtime(now).strftime("%I:%M:%S %p"),
                    "message": f"Student verified: {student_name} ({section_name}).",
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {"success": False, "status": "NOT_FOUND", "message": "Card not recognized by campus registry."},
            status=status.HTTP_404_NOT_FOUND,
        )