"""
AttendSure V3 - IoT Hardware Scanner Heartbeat
File: backend/apps/scanners/views.py
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.utils import timezone
from apps.gate.models import Kiosk  # adjust import according to your app structure

class KioskHeartbeatView(APIView):
    """
    Accepts periodic keep-alive telemetry from physical gate kiosks (Raspberry Pi / ESP32).
    Authenticates via kiosk_code and secret_key.
    """
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

        kiosk = Kiosk.objects.filter(kiosk_code=kiosk_code, secret_key=secret_key).first()
        if not kiosk:
            return Response(
                {"error": "Terminal not registered or invalid secret key."},
                status=status.HTTP_403_FORBIDDEN
            )

        kiosk.status = request.data.get('status', 'ONLINE')
        kiosk.last_heartbeat = timezone.now()
        if 'ip_address' in request.data:
            kiosk.ip_address = request.data['ip_address']
        kiosk.save(update_fields=['status', 'last_heartbeat', 'ip_address'])

        return Response({
            "status": "OK",
            "kiosk_code": kiosk.kiosk_code,
            "kiosk_name": kiosk.name,
            "server_time": timezone.now().isoformat()
        }, status=status.HTTP_200_OK)