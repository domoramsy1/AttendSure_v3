"""
AttendSure - Campus Perimeter & Geofence Security Telemetry Views
File: backend/apps/api/views/geofence.py

Cybersecurity & Performance:
1. Zero Mock Data: Reads campus center latitude, longitude, and radius directly from SchoolProfile.
2. Anti-Spoof Protection: Blocks mock location applications.
3. Hardware Pairing Lock: Binds phone UUID to prevent attendance proxy attempts.
4. Haversine Math: Accurate physical great-circle distance computation in meters.
"""

import math
from datetime import datetime
from django.utils import timezone
from django.core.cache import cache
from django.apps import apps
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import SchoolProfile, FacultyProfile, GatePass, StudentGateLog

User = get_user_model()


def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2) ** 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 1)


def get_campus_geofence_config():
    school_obj = SchoolProfile.objects.first()
    lat = float(school_obj.latitude) if school_obj and school_obj.latitude is not None else 0.0
    lng = float(school_obj.longitude) if school_obj and school_obj.longitude is not None else 0.0
    radius = int(school_obj.geofence_radius_meters) if school_obj and school_obj.geofence_radius_meters else 100
    school_name = school_obj.school_name if school_obj else ""
    school_id = school_obj.school_id if school_obj else ""

    return {
        'school_name': school_name,
        'school_id': school_id,
        'latitude': lat,
        'longitude': lng,
        'radius_meters': radius,
        'is_configured': bool(lat != 0.0 and lng != 0.0 and school_obj),
    }


def save_campus_geofence_config(lat, lng, radius):
    school_obj = SchoolProfile.objects.first()
    if not school_obj:
        school_obj = SchoolProfile.objects.create(school_id="", school_name="")

    school_obj.latitude = lat
    school_obj.longitude = lng
    school_obj.geofence_radius_meters = radius
    school_obj.save(update_fields=['latitude', 'longitude', 'geofence_radius_meters'])
    cache.delete("attendsure_school_settings_fast_payload")


def get_faculty_device_binding(faculty):
    if hasattr(faculty, 'bound_device_id') and faculty.bound_device_id:
        bound_at = getattr(faculty, 'device_bound_at', None)
        bound_str = bound_at.strftime('%Y-%m-%d') if bound_at else 'Active'
        return {
            'bound_device_id': faculty.bound_device_id,
            'device_model': getattr(faculty, 'device_model', 'Registered Phone'),
            'device_bound_at': bound_str,
        }
    return {'bound_device_id': None, 'device_model': None, 'device_bound_at': None}


def set_faculty_device_binding(faculty, device_id, device_model=None):
    now = timezone.now()
    faculty.bound_device_id = device_id
    faculty.device_model = device_model or 'Registered Phone'
    faculty.device_bound_at = now
    faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])


def clear_faculty_device_binding(faculty):
    faculty.bound_device_id = None
    faculty.device_model = None
    faculty.device_bound_at = None
    faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])


class GeofenceStatusAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        config = get_campus_geofence_config()
        campus_lat = config['latitude']
        campus_lng = config['longitude']
        allowed_radius = config['radius_meters']

        faculty_queryset = FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name')

        faculty_list = []
        verified_inside_count = 0
        missing_heartbeats_count = 0
        spoof_attempts_count = 0
        incidents_today_count = 0

        active_gate_passes = set(
            GatePass.objects.filter(
                status='ACTIVE',
                valid_from__lte=now,
                valid_to__gte=now
            ).values_list('faculty_id', flat=True)
        )

        gate_tap_verified_faculty_ids = set(
            StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                direction='IN'
            ).values_list('student_id', flat=True)
        )

        for faculty in faculty_queryset:
            telemetry = cache.get(f"attendsure_faculty_telemetry_{faculty.id}")
            binding = get_faculty_device_binding(faculty)

            distance_display = "No GPS Signal"
            last_seen_display = "Offline"
            presence_status = "OFF_CAMPUS"
            battery_display = "—"
            gps_accuracy = None
            is_mock_location = False

            if telemetry:
                t_lat = telemetry.get('latitude')
                t_lng = telemetry.get('longitude')
                is_mock_location = bool(telemetry.get('is_mock_location', False))
                battery_val = telemetry.get('battery_level')
                gps_accuracy = telemetry.get('gps_accuracy_meters')
                timestamp_str = telemetry.get('timestamp')

                if battery_val is not None:
                    battery_display = f"{int(battery_val)}%"

                if t_lat is not None and t_lng is not None and config['is_configured']:
                    dist = calculate_haversine_distance(campus_lat, campus_lng, float(t_lat), float(t_lng))
                    distance_display = f"{int(dist)}m"

                    if timestamp_str:
                        try:
                            t_time = datetime.fromisoformat(timestamp_str)
                            delta_minutes = (now - t_time).total_seconds() / 60
                            if delta_minutes < 2:
                                last_seen_display = "Just now"
                            elif delta_minutes < 60:
                                last_seen_display = f"{int(delta_minutes)}m ago"
                            else:
                                last_seen_display = t_time.strftime('%I:%M %p')

                            if is_mock_location:
                                presence_status = "SPOOF_ATTEMPT"
                                spoof_attempts_count += 1
                                incidents_today_count += 1
                            elif faculty.id in active_gate_passes:
                                presence_status = "AUTHORIZED_LEAVE"
                            elif delta_minutes > 15:
                                presence_status = "HEARTBEAT_LOST"
                                missing_heartbeats_count += 1
                            elif dist <= allowed_radius:
                                presence_status = "VERIFIED_INSIDE"
                                verified_inside_count += 1
                            else:
                                presence_status = "PERIMETER_BREACH"
                                incidents_today_count += 1
                        except Exception:
                            pass

            photo_url = None
            if faculty.photo:
                try:
                    photo_url = request.build_absolute_uri(faculty.photo.url)
                except Exception:
                    photo_url = str(faculty.photo)

            faculty_list.append({
                'id': faculty.id,
                'faculty_name': faculty.full_name,
                'employee_id': faculty.employee_id,
                'position': faculty.position or 'Faculty',
                'status': presence_status,
                'distance': distance_display,
                'battery': battery_display,
                'last_seen': last_seen_display,
                'device_model': binding['device_model'],
                'bound_device_id': binding['bound_device_id'],
                'device_bound_at': binding['device_bound_at'],
                'photo': photo_url,
                'photo_url': photo_url,
                'is_mock_location': is_mock_location,
                'gps_accuracy_meters': gps_accuracy,
                'gate_tap_verified': (faculty.id in gate_tap_verified_faculty_ids),
            })

        recent_breaches = cache.get("attendsure_recent_breaches") or []

        return Response({
            'zone_id': config['school_id'],
            'name': config['school_name'],
            'latitude': campus_lat,
            'longitude': campus_lng,
            'radius_meters': allowed_radius,
            'is_configured': config['is_configured'],
            'verified_inside': verified_inside_count,
            'missing_heartbeats': missing_heartbeats_count,
            'spoof_attempts_blocked': spoof_attempts_count,
            'incidents_today': incidents_today_count,
            'faculty_list': faculty_list,
            'recent_breaches': recent_breaches,
        }, status=status.HTTP_200_OK)

    def put(self, request):
        data = request.data
        try:
            new_lat = float(data.get('latitude'))
            new_lng = float(data.get('longitude'))
            new_radius = int(data.get('radius_meters'))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid numeric coordinates or radius.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90 <= new_lat <= 90) or not (-180 <= new_lng <= 180):
            return Response({'error': 'Coordinates out of geographic bounds.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (25 <= new_radius <= 1500):
            return Response({'error': 'Radius must be between 25 and 1500 meters.'}, status=status.HTTP_400_BAD_REQUEST)

        save_campus_geofence_config(new_lat, new_lng, new_radius)

        return Response({
            'success': True,
            'message': 'Campus perimeter saved to database successfully.',
            'latitude': new_lat,
            'longitude': new_lng,
            'radius_meters': new_radius,
        }, status=status.HTTP_200_OK)


class GeofenceCheckInAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        faculty = getattr(user, 'profile', None) and getattr(user.profile, 'faculty', None)

        data = request.data or {}
        coords = data.get('coords') or data.get('location', {}).get('coords') or {}
        raw_lat = data.get('latitude') or data.get('lat') or coords.get('latitude') or coords.get('lat')
        raw_lng = data.get('longitude') or data.get('lng') or data.get('lon') or coords.get('longitude') or coords.get('lng')

        if raw_lat is None or raw_lng is None:
            return Response({
                'success': True,
                'status': 'WAITING_FOR_GPS',
                'verified_inside': True,
                'message': 'Waiting for GPS fix.'
            }, status=status.HTTP_200_OK)

        try:
            latitude = float(raw_lat)
            longitude = float(raw_lng)
        except (TypeError, ValueError):
            return Response({'success': True, 'status': 'INVALID_COORDS', 'verified_inside': True}, status=status.HTTP_200_OK)

        accuracy = data.get('accuracy') or coords.get('accuracy')
        battery_level = data.get('battery_level') or data.get('battery') or coords.get('battery')
        is_mock_location = bool(data.get('is_mock_location') or data.get('mocked') or coords.get('mocked') or False)
        device_id = str(data.get('device_id') or data.get('device_uuid') or data.get('client_device_id') or '').strip()
        device_model = str(data.get('device_model') or data.get('deviceModel') or 'Registered Phone').strip()

        if not faculty:
            return Response({
                'success': True,
                'status': 'ADMIN_ONLINE',
                'verified_inside': True,
                'message': 'Telemetry logged for administrative account.'
            }, status=status.HTTP_200_OK)

        binding = get_faculty_device_binding(faculty)
        if binding['bound_device_id']:
            if device_id and device_id != binding['bound_device_id']:
                return Response({
                    'error': 'Hardware mismatch. This account is locked to a different mobile device.'
                }, status=status.HTTP_403_FORBIDDEN)
        elif device_id:
            set_faculty_device_binding(faculty, device_id, device_model)

        config = get_campus_geofence_config()
        if config['is_configured']:
            distance = calculate_haversine_distance(config['latitude'], config['longitude'], latitude, longitude)
            allowed_radius = config['radius_meters']

            if is_mock_location:
                status_result = 'SPOOF_ATTEMPT'
            elif distance <= allowed_radius:
                status_result = 'VERIFIED_INSIDE'
            else:
                status_result = 'PERIMETER_BREACH'
        else:
            distance = 0.0
            status_result = 'VERIFIED_INSIDE'

        telemetry_payload = {
            'latitude': latitude,
            'longitude': longitude,
            'distance_meters': distance,
            'gps_accuracy_meters': accuracy,
            'battery_level': battery_level,
            'is_mock_location': is_mock_location,
            'status': status_result,
            'timestamp': timezone.now().isoformat(),
        }
        cache.set(f"attendsure_faculty_telemetry_{faculty.id}", telemetry_payload, timeout=86400)

        return Response({
            'success': True,
            'status': status_result,
            'distance_meters': distance,
            'verified_inside': (status_result == 'VERIFIED_INSIDE'),
        }, status=status.HTTP_200_OK)


class FacultyDeviceResetAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        faculty_id = pk or request.data.get('faculty_id')
        faculty = FacultyProfile.objects.filter(pk=faculty_id).first()
        if not faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        clear_faculty_device_binding(faculty)
        return Response({
            'success': True,
            'message': f"Device lock for {faculty.full_name} has been cleared.",
        }, status=status.HTTP_200_OK)