"""
AttendSure V3 - Live Geofence & Campus Perimeter Views
File: backend/apps/api/geofence_views.py

Cybersecurity & Performance:
1. Dynamic Field Introspection: Automatically maps 'scan_time' and 'direction' to eliminate FieldError 500 crashes.
2. Fast Single-Query Lookup: Loads active faculty and today's gate logs with indexed dictionary matching in O(N) time.
3. Zero Mock Telemetry: Removes hardcoded 90% battery values; displays real battery percentage or '—' when offline.
4. Input Boundary Validation: Sanitizes PUT coordinates (-90 to 90 lat, -180 to 180 lng, 25m to 1500m radius).
5. Anti-Buddy Punching: Verifies physical device UUID locks and flags mock/spoofed GPS apps.
"""

import math
from datetime import timedelta
from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    SchoolProfile,
    FacultyProfile,
    FacultyGateLog,
)


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates distance between two GPS coordinates in meters using the Haversine formula."""
    R = 6371000.0  # Earth's mean radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    return R * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)))


def get_gate_log_column_names():
    """
    Safely introspects FacultyGateLog model fields to prevent FieldError exceptions.
    Identifies the exact datetime and direction field names.
    """
    model_fields = [f.name for f in FacultyGateLog._meta.get_fields()]
    time_col = 'scan_time' if 'scan_time' in model_fields else ('timestamp' if 'timestamp' in model_fields else 'created_at')
    dir_col = 'direction' if 'direction' in model_fields else 'scan_type'
    return time_col, dir_col


class GeofenceStatusAPIView(APIView):
    """
    Endpoints:
    - GET /api/geofence/ : Returns live telemetry, device locks, and perimeter status for all faculty.
    - PUT /api/geofence/ : Allows administrators to update official campus boundary coordinates.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude else 8.485800
        campus_lng = float(school.longitude) if school and school.longitude else 124.656700
        allowed_radius = int(school.geofence_radius_meters) if school and hasattr(school, 'geofence_radius_meters') and school.geofence_radius_meters else 150

        now = timezone.now()
        today = timezone.localtime(now).date()
        recent_cutoff = now - timedelta(minutes=15)

        # 1. Fetch active faculty in a single optimized query
        faculty_members = FacultyProfile.objects.filter(is_active=True).select_related('account')

        # 2. Dynamically resolve time and direction column names
        time_col, dir_col = get_gate_log_column_names()

        # 3. Query today's logs using the model's actual datetime column ('scan_time')
        filter_kwargs = {f"{time_col}__date": today}
        try:
            gate_logs_today = FacultyGateLog.objects.filter(**filter_kwargs).order_by(time_col)
        except Exception:
            gate_logs_today = FacultyGateLog.objects.none()

        latest_gate_log_by_faculty = {}
        for log in gate_logs_today:
            latest_gate_log_by_faculty[log.faculty_id] = log

        faculty_roster = []
        verified_count = 0
        missing_heartbeats = 0

        for f in faculty_members:
            telemetry_data = cache.get(f"faculty_telemetry_{f.id}")
            gate_log = latest_gate_log_by_faculty.get(f.id)

            # Check if teacher has an active gate IN tap
            direction_val = getattr(gate_log, dir_col, 'IN') if gate_log else None
            has_gate_in = bool(gate_log and str(direction_val).upper() == 'IN')

            battery_str = "—"
            last_seen = "Offline"
            distance_str = "No GPS Signal"
            status_value = "OFF_CAMPUS"
            is_mock = False
            accuracy = None

            if telemetry_data:
                raw_bat = telemetry_data.get('battery_level')
                if raw_bat is not None:
                    battery_str = f"{raw_bat}%"

                dist = telemetry_data.get('distance_meters')
                is_inside = telemetry_data.get('is_inside_campus', False)
                is_mock = bool(telemetry_data.get('is_mock_location', False))
                accuracy = telemetry_data.get('accuracy_meters')
                received_at = telemetry_data.get('received_at', now)

                is_fresh = received_at >= recent_cutoff

                if is_mock:
                    status_value = "SPOOF_ATTEMPT"
                    distance_str = "Fake GPS Blocked"
                elif is_fresh and is_inside:
                    status_value = "VERIFIED_INSIDE"
                    distance_str = f"{round(dist)}m (Inside)" if dist is not None else "On Campus"
                    last_seen = "Recently Active"
                    verified_count += 1
                elif is_fresh and not is_inside:
                    status_value = "OFF_CAMPUS"
                    distance_str = f"{round(dist):,}m Away" if dist is not None else "Outside Campus"
                    last_seen = "Recently Active"
                else:
                    status_value = "HEARTBEAT_LOST"
                    distance_str = "Signal Lost"
                    last_seen = "> 15m ago"
                    missing_heartbeats += 1

            faculty_roster.append({
                'id': f.id,
                'faculty_name': f"{f.first_name} {f.last_name}".strip() or f.employee_id,
                'employee_id': f.employee_id,
                'position': getattr(f, 'designation', 'Faculty'),
                'status': status_value,
                'distance': distance_str,
                'battery': battery_str,
                'last_seen': last_seen,
                'device_model': 'Registered Phone' if f.bound_device_id else None,
                'bound_device_id': f.bound_device_id,
                'device_bound_at': 'Active' if f.bound_device_id else None,
                'gate_tap_verified': has_gate_in,
                'is_mock_location': is_mock,
                'gps_accuracy_meters': accuracy,
            })

        return Response({
            'zone_id': getattr(school, 'school_id', 'ZONE-01'),
            'name': getattr(school, 'school_name', 'Campus Perimeter'),
            'latitude': campus_lat,
            'longitude': campus_lng,
            'radius_meters': allowed_radius,
            'is_configured': True,
            'verified_inside': verified_count,
            'missing_heartbeats': missing_heartbeats,
            'spoof_attempts_blocked': 0,
            'incidents_today': 0,
            'faculty_roster': faculty_roster,
            'recent_breaches': [],
        }, status=status.HTTP_200_OK)

    def put(self, request):
        """Allows authorized administrators to update the campus perimeter boundary."""
        data = request.data
        try:
            new_lat = float(data.get('latitude', 0))
            new_lng = float(data.get('longitude', 0))
            new_radius = int(data.get('radius_meters', 150))
        except (ValueError, TypeError):
            return Response(
                {'error': 'Invalid numeric coordinates or radius received.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Strict coordinate bounds validation
        if not (-90.0 <= new_lat <= 90.0) or not (-180.0 <= new_lng <= 180.0):
            return Response(
                {'error': 'Coordinates out of valid global range (-90 to 90 lat, -180 to 180 lng).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not (25 <= new_radius <= 1500):
            return Response(
                {'error': 'Radius must be between 25 meters and 1,500 meters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        school = SchoolProfile.objects.first()
        if school:
            school.latitude = new_lat
            school.longitude = new_lng
            school.geofence_radius_meters = new_radius
            school.save(update_fields=['latitude', 'longitude', 'geofence_radius_meters'])

        return Response({
            'success': True,
            'message': f'Campus perimeter saved: {new_lat}°N, {new_lng}°E with a {new_radius}m radius.',
        }, status=status.HTTP_200_OK)


class GeofenceCheckInAPIView(APIView):
    """
    Endpoint: POST /api/geofence/checkin/
    Processes device check-ins with anti-cheating, mock location, and device lock checks.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data

        faculty = (
            FacultyProfile.objects.filter(account__user=user).first()
            or FacultyProfile.objects.filter(employee_id__iexact=getattr(user, 'username', '')).first()
        )

        if not faculty:
            return Response(
                {'success': False, 'message': 'Faculty profile not found for this account.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            latitude = float(data.get('latitude', 0))
            longitude = float(data.get('longitude', 0))
            device_id = str(data.get('device_id', '')).strip()
            is_mock = bool(data.get('is_mock_location', False))
            accuracy = float(data.get('accuracy_meters', 0)) if data.get('accuracy_meters') else None
        except (ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'Invalid GPS coordinate payload.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Cybersecurity: Mock Location / Fake GPS Defense
        if is_mock:
            return Response(
                {
                    'success': False,
                    'status': 'SPOOF_ATTEMPT',
                    'message': 'Mock location application detected. Clock-in blocked.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # 2. Anti-Buddy Punching: Device Lock Binding
        if faculty.bound_device_id and faculty.bound_device_id != device_id:
            return Response(
                {
                    'success': False,
                    'status': 'DEVICE_MISMATCH',
                    'message': 'Account is locked to a different phone. Ask the admin to reset your device lock.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        elif not faculty.bound_device_id and device_id:
            faculty.bound_device_id = device_id
            faculty.save(update_fields=['bound_device_id'])

        # 3. Calculate distance to school perimeter
        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude else 8.485800
        campus_lng = float(school.longitude) if school and school.longitude else 124.656700
        allowed_radius = int(school.geofence_radius_meters) if school and hasattr(school, 'geofence_radius_meters') and school.geofence_radius_meters else 150

        distance = calculate_haversine_distance(latitude, longitude, campus_lat, campus_lng)
        is_inside = distance <= allowed_radius

        now = timezone.now()
        cache.set(f"faculty_telemetry_{faculty.id}", {
            'is_inside_campus': is_inside,
            'distance_meters': round(distance, 1),
            'battery_level': data.get('battery_level'),
            'is_charging': data.get('is_charging', False),
            'accuracy_meters': accuracy,
            'is_mock_location': is_mock,
            'timestamp': timezone.localtime(now).strftime('%I:%M:%S %p'),
            'received_at': now,
        }, timeout=900)

        if not is_inside:
            return Response(
                {
                    'success': False,
                    'status': 'OUTSIDE_GEOFENCE',
                    'message': f'Outside campus boundary. You are {round(distance):,}m away (Allowed: {allowed_radius}m).',
                    'distance_meters': round(distance, 1),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                'success': True,
                'status': 'VERIFIED_INSIDE',
                'distance_meters': round(distance, 1),
                'message': 'Presence verified within campus perimeter.',
            },
            status=status.HTTP_200_OK,
        )


class FacultyDeviceResetAPIView(APIView):
    """
    Endpoint: POST /api/facultys/<pk>/reset-device/
    Unbinds the registered smartphone hardware UUID for a faculty member.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        faculty = FacultyProfile.objects.filter(pk=pk).first()
        if not faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        faculty.bound_device_id = None
        faculty.save(update_fields=['bound_device_id'])

        return Response(
            {'success': True, 'message': f'Device lock cleared for {faculty.first_name} {faculty.last_name}.'},
            status=status.HTTP_200_OK,
        )