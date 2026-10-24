"""
AttendSure V3 - Asynchronous Telemetry & GPS Heartbeat View
File: backend/apps/telemetry/views.py

Cybersecurity & Performance:
1. Resilient Telemetry Ingestion: Safely handles nested coordinate payloads.
2. Haversine Calculations: Computes physical distance to school boundary.
3. Loafing Sentry: Records security violations if faculty exits boundary during class.
4. Battery Guard: Prevents false loafing reports when device battery drops below 5%.
"""

from datetime import timedelta
from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    SchoolProfile,
    Schedule,
    FacultyHeartbeat,
    LoafingIncident,
    FacultyProfile,
    StudentGateLog,
    GatePass,
)
from apps.api.views.common import (
    calculate_distance_meters,
    resolve_faculty_for_user,
)


class AsyncTelemetryHeartbeatView(APIView):
    """
    Endpoint: POST /api/telemetry/heartbeat/
    Processes live background GPS coordinates, battery levels, device security locks,
    and campus perimeter boundary checks.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)

        # Support administrative and test monitoring accounts
        if not faculty and (user.is_staff or user.is_superuser):
            faculty = (
                FacultyProfile.objects.filter(account=user).first()
                or FacultyProfile.objects.filter(is_active=True).first()
            )

        if not faculty:
            return Response(
                {
                    'success': True,
                    'status': 'ADMIN_MONITOR',
                    'message': 'Telemetry accepted for non-teaching account.',
                },
                status=status.HTTP_200_OK,
            )

        data = request.data or {}

        # 1. Resilient coordinate extraction (supports root fields and nested objects)
        coords = data.get('coords') or data.get('location', {}).get('coords') or {}
        raw_lat = (
            data.get('latitude') 
            or data.get('lat') 
            or coords.get('latitude') 
            or coords.get('lat')
        )
        raw_lng = (
            data.get('longitude') 
            or data.get('lng') 
            or data.get('lon') 
            or coords.get('longitude') 
            or coords.get('lng')
        )

        # Gracefully handle initial GPS lock delays without 400 errors
        if raw_lat is None or raw_lng is None:
            return Response({
                'success': True,
                'status': 'WAITING_FOR_GPS',
                'verified_inside': True,
                'message': 'Telemetry received, acquiring satellite fix.'
            }, status=status.HTTP_200_OK)

        try:
            latitude = float(raw_lat)
            longitude = float(raw_lng)
        except (TypeError, ValueError):
            return Response({
                'success': True,
                'status': 'INVALID_COORDS',
                'verified_inside': True,
                'message': 'Coordinates skipped.'
            }, status=status.HTTP_200_OK)

        # Parameter normalization
        battery_level = int(data.get('battery_level') or data.get('battery') or coords.get('battery') or 100)
        is_mock_location = bool(data.get('is_mock_location') or data.get('mocked') or coords.get('mocked') or False)
        accuracy = data.get('accuracy') or coords.get('accuracy') or data.get('gps_accuracy_meters')
        client_device_id = str(data.get('client_device_id') or data.get('device_id') or data.get('device_uuid') or '').strip()

        # 2. Hardware Binding Security
        if getattr(faculty, 'bound_device_id', None):
            if client_device_id and client_device_id != faculty.bound_device_id:
                return Response({
                    'error': 'Hardware mismatch: Device not authorized for this faculty account.'
                }, status=status.HTTP_403_FORBIDDEN)
        elif client_device_id and hasattr(faculty, 'bound_device_id'):
            faculty.bound_device_id = client_device_id
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=['bound_device_id', 'device_bound_at'])

        # 3. Boundary Computation via Haversine Formula
        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude else 8.4858000
        campus_lng = float(school.longitude) if school and school.longitude else 124.6567000
        allowed_radius = float(school.geofence_radius_meters) if school and school.geofence_radius_meters else 150.0

        distance_meters = calculate_distance_meters(latitude, longitude, campus_lat, campus_lng)
        is_inside_boundary = distance_meters <= allowed_radius

        # 4. Anti-Tamper & Status Evaluation
        if is_mock_location:
            status_result = 'SPOOF_ATTEMPT'
        elif is_inside_boundary:
            status_result = 'VERIFIED_INSIDE'
        else:
            status_result = 'PERIMETER_BREACH'

        # 5. Check Authorized Leave & Gate Pass
        has_gate_pass = False
        try:
            has_gate_pass = GatePass.objects.filter(
                faculty=faculty,
                status='ACTIVE',
                valid_from__lte=timezone.now(),
                valid_to__gte=timezone.now()
            ).exists()
        except Exception:
            pass

        if has_gate_pass:
            status_result = 'AUTHORIZED_LEAVE'

        # 6. Check Active Teaching Schedule for Loafing Sentry
        now_time = timezone.localtime().time()
        active_class = Schedule.objects.filter(
            faculty=faculty,
            start_time__lte=now_time,
            end_time__gte=now_time
        ).first()

        # Record loafing incident if outside without gate pass during class hours
        if not is_inside_boundary and not has_gate_pass and active_class and battery_level > 5:
            today_date = timezone.localdate()
            if not LoafingIncident.objects.filter(faculty=faculty, incident_date=today_date, trigger_reason__icontains=str(active_class.id)).exists():
                LoafingIncident.objects.create(
                    faculty=faculty,
                    incident_date=today_date,
                    trigger_reason=f"Outside campus ({int(distance_meters)}m) during {active_class.subject.code} in {active_class.section.name}",
                    status='PENDING_REVIEW'
                )

        # 7. Record Telemetry Record in Database
        FacultyHeartbeat.objects.create(
            faculty=faculty,
            latitude=latitude,
            longitude=longitude,
            battery_level=battery_level,
            is_inside_geofence=is_inside_boundary,
            recorded_at=timezone.now()
        )

        # Fast cache for real-time frontend map refresh
        cache_data = {
            'latitude': latitude,
            'longitude': longitude,
            'distance_meters': distance_meters,
            'gps_accuracy_meters': accuracy,
            'battery_level': battery_level,
            'is_mock_location': is_mock_location,
            'status': status_result,
            'timestamp': timezone.now().isoformat(),
        }
        cache.set(f"attendsure_faculty_telemetry_{faculty.id}", cache_data, timeout=86400)

        return Response({
            'success': True,
            'status': status_result,
            'distance_meters': round(distance_meters, 1),
            'verified_inside': is_inside_boundary,
            'is_mock_location': is_mock_location,
            'timestamp': timezone.localtime().strftime('%I:%M:%S %p'),
        }, status=status.HTTP_200_OK)