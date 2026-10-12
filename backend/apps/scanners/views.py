"""
AttendSure V3 - IoT Hardware Scanner Heartbeat
File: backend/apps/scanners/views.py
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.utils import timezone
import hmac

from apps.academics.models import IoTKiosk

class KioskHeartbeatView(APIView):
    """Accepts keep-alive telemetry from physical gate kiosks (Raspberry Pi / ESP32)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        kiosk_code = request.data.get('kiosk_code')
        secret_key = request.data.get('secret_key')

        if not kiosk_code or not secret_key:
            return Response(
                {"error": "kiosk_code and secret_key are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            kiosk = IoTKiosk.objects.get(kiosk_code=kiosk_code, is_active=True)
        except IoTKiosk.DoesNotExist:
            return Response(
                {"error": "Terminal not registered or inactive."},
                status=status.HTTP_403_FORBIDDEN
            )

        is_valid_secret = (
            kiosk.secret_hash == secret_key or
            hmac.compare_digest(kiosk.secret_hash.encode('utf-8'), str(secret_key).encode('utf-8'))
        )
        if not is_valid_secret:
            return Response(
                {"error": "Hardware authentication key invalid."},
                status=status.HTTP_403_FORBIDDEN
            )

        now = timezone.now()
        kiosk.last_ping = now
        kiosk.save(update_fields=['last_ping'])

        return Response({
            "status": "ONLINE",
            "kiosk_code": kiosk.kiosk_code,
            "terminal_name": kiosk.terminal_name,
            "server_time": now.isoformat()
        }, status=status.HTTP_200_OK)