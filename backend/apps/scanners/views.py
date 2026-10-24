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
    DailyAttendanceSummary,
)
from apps.api.services.push_service import send_silent_wake_up_push
from apps.api.views.common import (
    verify_hardware_secret,
    get_student_active_section,
    format_full_student_name,
)


class KioskHeartbeatView(APIView):
    """Receives keep-alive pings from gate gate scanner hardware."""
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

        kiosk = (
            IoTKiosk.objects.filter(kiosk_code=kiosk_code, is_active=True)
            .only("id", "kiosk_code", "secret_hash", "terminal_name")
            .first()
        )
        if not kiosk or not verify_hardware_secret(kiosk, secret_key):
            return Response(
                {"error": "Invalid or inactive hardware terminal credentials."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
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
    Processes RFID card taps and QR scans at campus gates.
    Enforces hardware secret authentication, 4-second anti-passback debounce,
    and automatic silent wake-up push notifications for faculty.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        data = request.data
        raw_identifier = str(
            data.get("raw_identifier")
            or data.get("rfid_uid")
            or data.get("identifier")
            or data.get("qr_token")
            or ""
        ).strip()
        scan_method = str(data.get("scan_method") or "RFID").upper()
        if scan_method not in {"RFID", "QR", "MANUAL"}:
            scan_method = "RFID"

        kiosk_code = str(data.get("kiosk_code") or "").strip()
        secret_key = str(data.get("secret_key") or "").strip()
        requested_direction = str(data.get("scan_type") or data.get("direction") or "").upper()

        if not raw_identifier:
            return Response(
                {"success": False, "error": "RFID UID or QR token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Authenticate hardware kiosk
        kiosk = None
        if kiosk_code:
            kiosk = IoTKiosk.objects.filter(kiosk_code=kiosk_code, is_active=True).first()
            if not kiosk or not verify_hardware_secret(kiosk, secret_key):
                return Response(
                    {"success": False, "error": "Hardware terminal authentication failed."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        elif not (request.user and request.user.is_authenticated):
            return Response(
                {"success": False, "error": "Kiosk credentials required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        cooldown_threshold = now - timedelta(seconds=4)

        # 1. Check Faculty Profile
        faculty = (
            FacultyProfile.objects.filter(is_active=True)
            .filter(rfid_uid__iexact=raw_identifier)
            .first()
            or FacultyProfile.objects.filter(is_active=True)
            .filter(qr_token__iexact=raw_identifier)
            .first()
        )

        if faculty:
            if FacultyGateLog.objects.filter(faculty=faculty, scan_time__gte=cooldown_threshold).exists():
                return Response(
                    {"success": False, "status": "COOLDOWN", "message": "Card tapped too quickly. Please wait 4 seconds."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            if requested_direction in {"IN", "OUT"}:
                scan_direction = requested_direction
            else:
                last_log = (
                    FacultyGateLog.objects.filter(faculty=faculty, scan_time__date=now.date())
                    .order_by("-scan_time")
                    .first()
                )
                scan_direction = "OUT" if (last_log and last_log.direction == "IN") else "IN"

            FacultyGateLog.objects.create(
                faculty=faculty,
                kiosk=kiosk,
                scan_time=now,
                direction=scan_direction,
                scan_method=scan_method,
                raw_identifier=raw_identifier,
            )
            if kiosk:
                IoTKiosk.objects.filter(pk=kiosk.pk).update(last_ping=now)

            push_token = getattr(faculty, "push_token", None) or getattr(
                getattr(faculty, "account", None), "push_token", None
            )
            wake_up_sent = False
            if push_token:
                action = "START_TRACKING_IN" if scan_direction == "IN" else "STOP_TRACKING_OUT"
                wake_up_sent = send_silent_wake_up_push(push_token, action=action)

            return Response(
                {
                    "success": True,
                    "person_type": "STAFF",
                    "role": "FACULTY",
                    "name": faculty.full_name,
                    "employee_id": faculty.employee_id,
                    "direction": scan_direction,
                    "timestamp": timezone.localtime(now).strftime("%I:%M:%S %p"),
                    "mobile_wake_up_dispatched": wake_up_sent,
                    "message": f"Welcome, {faculty.full_name}. Gate {scan_direction} recorded.",
                },
                status=status.HTTP_201_CREATED,
            )

        # 2. Check Student Profile
        student = (
            Student.objects.filter(is_active=True)
            .filter(rfid_uid__iexact=raw_identifier)
            .first()
            or Student.objects.filter(is_active=True)
            .filter(qr_token__iexact=raw_identifier)
            .first()
        )

        if student:
            if StudentGateLog.objects.filter(student=student, scan_time__gte=cooldown_threshold).exists():
                return Response(
                    {"success": False, "status": "COOLDOWN", "message": "Card tapped too quickly. Please wait 4 seconds."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

            if requested_direction in {"IN", "OUT"}:
                scan_direction = requested_direction
            else:
                last_log = (
                    StudentGateLog.objects.filter(student=student, scan_time__date=now.date())
                    .order_by("-scan_time")
                    .first()
                )
                scan_direction = "OUT" if (last_log and last_log.direction == "IN") else "IN"

            StudentGateLog.objects.create(
                student=student,
                kiosk=kiosk,
                scan_time=now,
                direction=scan_direction,
                scan_method=scan_method,
                raw_identifier=raw_identifier,
            )

            section = get_student_active_section(student)
            if scan_direction == "IN" and section:
                DailyAttendanceSummary.objects.update_or_create(
                    student=student,
                    attendance_date=now.date(),
                    defaults={"section": section, "status": "PRESENT", "remarks": "GATE_TAP"},
                )

            if kiosk:
                IoTKiosk.objects.filter(pk=kiosk.pk).update(last_ping=now)

            student_name = format_full_student_name(student)
            section_name = section.name if section else "Unassigned"

            return Response(
                {
                    "success": True,
                    "person_type": "STUDENT",
                    "role": "STUDENT",
                    "name": student_name,
                    "lrn": student.lrn,
                    "section": section_name,
                    "direction": scan_direction,
                    "timestamp": timezone.localtime(now).strftime("%I:%M:%S %p"),
                    "message": f"Student verified: {student_name} ({section_name}).",
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(
            {"success": False, "status": "NOT_FOUND", "error": "Card or QR code not registered."},
            status=status.HTTP_404_NOT_FOUND,
        )
