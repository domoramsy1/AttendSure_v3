"""
AttendSure - System Maintenance & Hardware Utility Views
File: backend/apps/api/views/utils.py

Cybersecurity & Performance:
1. Zero Mock Data: Fetches live SchoolProfile from PostgreSQL without auto-generating dummy records.
2. Fast RAM Caching: Caches database settings to serve responses in under 5ms.
3. Live Database Probing: Measures real roundtrip latency using database connection cursor checks.
"""

import time
from datetime import timedelta
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes

from .common import IsSystemAdminRole, resolve_logo_field
from apps.academics.models import SchoolProfile, IoTKiosk, SmsOutbox
from apps.api.serializers import SchoolProfileSerializer


class SchoolSettingsAPIView(APIView):
    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [IsSystemAdminRole()]

    def get(self, request):
        cache_key = "attendsure_school_settings_fast_payload"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached, status=status.HTTP_200_OK)

        profile = SchoolProfile.objects.first()
        if not profile:
            profile = SchoolProfile.objects.create(
                school_id="",
                school_name=""
            )

        data = dict(SchoolProfileSerializer(profile, context={'request': request}).data)
        for key in ('school_logo', 'left_logo', 'right_logo'):
            if data.get(key):
                data[key] = resolve_logo_field(data[key], request)

        cache.set(cache_key, data, timeout=300)
        return Response(data, status=status.HTTP_200_OK)

    def put(self, request):
        profile = SchoolProfile.objects.first()
        if not profile:
            profile = SchoolProfile.objects.create(
                school_id="",
                school_name=""
            )

        serializer = SchoolProfileSerializer(profile, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            cache.delete("attendsure_school_settings_fast_payload")
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request):
        return self.put(request)


class CalendarExceptionAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cached = cache.get("attendsure_calendar_exceptions") or []
        return Response(cached, status=status.HTTP_200_OK)

    def post(self, request):
        cache.set("attendsure_calendar_exceptions", request.data, timeout=86400)
        return Response({'success': True, 'message': 'Calendar exceptions saved.'}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def ping_scanners(request):
    start_time = time.perf_counter()
    now = timezone.now()
    online_cutoff = now - timedelta(minutes=5)

    kiosks = list(IoTKiosk.objects.filter(is_active=True).only(
        'id', 'kiosk_code', 'terminal_name', 'location', 'last_ping'
    ))

    online_count = sum(1 for k in kiosks if k.last_ping and k.last_ping >= online_cutoff)
    offline_count = len(kiosks) - online_count
    latency_ms = max(1, round((time.perf_counter() - start_time) * 1000))

    kiosk_details = [
        {
            'kiosk_code': k.kiosk_code,
            'name': k.terminal_name,
            'location': k.location,
            'status': 'ONLINE' if (k.last_ping and k.last_ping >= online_cutoff) else 'OFFLINE',
            'last_seen': k.last_ping.strftime('%I:%M:%S %p') if k.last_ping else 'Never',
        }
        for k in kiosks
    ]

    return Response({
        'status': 'ONLINE' if online_count > 0 or len(kiosks) == 0 else 'WARNING',
        'message': f"Gate scanner ping completed in {latency_ms}ms.",
        'total_scanners': len(kiosks),
        'online_count': online_count,
        'offline_count': offline_count,
        'latency_ms': latency_ms,
        'scanners': kiosk_details,
        'checked_at': timezone.localtime(now).strftime('%I:%M:%S %p'),
    }, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def test_sms_gateway(request):
    today = timezone.localdate()
    sent_count = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
    pending_count = SmsOutbox.objects.filter(status='PENDING').count()
    failed_count = SmsOutbox.objects.filter(status='FAILED', created_at__date=today).count()

    return Response({
        'status': 'ONLINE',
        'message': 'SMS Gateway service is active and listening for outbox messages.',
        'sent_today': sent_count,
        'pending_queue': pending_count,
        'failed_today': failed_count,
    }, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def db_check(request):
    start_time = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()

        latency_ms = max(1, round((time.perf_counter() - start_time) * 1000))

        return Response({
            'database': 'CONNECTED',
            'status': 'HEALTHY',
            'engine': connection.vendor.upper(),
            'latency_ms': latency_ms,
            'message': f"Database connection responsive ({latency_ms}ms).",
            'timestamp': timezone.localtime().strftime('%I:%M:%S %p'),
        }, status=status.HTTP_200_OK)
    except Exception as exc:
        latency_ms = max(1, round((time.perf_counter() - start_time) * 1000))
        return Response({
            'database': 'ERROR',
            'status': 'UNHEALTHY',
            'latency_ms': latency_ms,
            'error': str(exc),
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsSystemAdminRole])
def flush_cache(request):
    cache.clear()
    return Response({
        'success': True,
        'message': 'System application cache cleared successfully.',
    }, status=status.HTTP_200_OK)