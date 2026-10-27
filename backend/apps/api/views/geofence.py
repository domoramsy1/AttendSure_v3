"""
AttendSure V3 - Live Database Geofence Boundary & Telemetry
File: backend/apps/api/views/geofence.py
"""

import logging
from datetime import datetime
from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    SchoolProfile,
    FacultyProfile,
    GatePass,
    FacultyHeartbeat,
)
from apps.common.utils import (
    calculate_haversine_distance,
    safe_photo_url,
    get_user_role,
)
from .common import resolve_faculty_for_user

logger = logging.getLogger(__name__)


def get_campus_geofence_config():
    """Fetches real geofence coordinates from the database record."""
    cached = cache.get("attendsure_campus_geofence_config")
    if cached:
        return cached

    school_obj = SchoolProfile.objects.first()
    has_coords = bool(
        school_obj
        and school_obj.latitude is not None
        and school_obj.longitude is not None
        and school_obj.geofence_radius_meters
    )

    config = {
        'school_name': getattr(school_obj, 'school_name', '') if school_obj else '',
        'school_id': getattr(school_obj, 'school_id', '') if school_obj else '',
        'latitude': float(school_obj.latitude) if has_coords else None,
        'longitude': float(school_obj.longitude) if has_coords else None,
        'radius_meters': int(school_obj.geofence_radius_meters) if has_coords else 0,
        'is_configured': has_coords,
    }
    cache.set("attendsure_campus_geofence_config", config, timeout=300)
    return config


def save_campus_geofence_config(lat, lng, radius):
    school_obj = SchoolProfile.objects.first()
    if not school_obj:
        school_obj = SchoolProfile.objects.create(school_id="", school_name="")

    school_obj.latitude = lat
    school_obj.longitude = lng
    school_obj.geofence_radius_meters = radius
    school_obj.save(update_fields=['latitude', 'longitude', 'geofence_radius_meters'])
    cache.delete("attendsure_campus_geofence_config")
    cache.delete("attendsure_school_settings_fast_payload")


class GeofenceStatusAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        config = get_campus_geofence_config()

        campus_lat = config['latitude']
        campus_lng = config['longitude']
        allowed_radius = config['radius_meters']
        is_configured = config['is_configured']

        faculty_queryset = list(
            FacultyProfile.objects.filter(is_active=True)
            .only('id', 'first_name', 'last_name', 'employee_id', 'position', 'photo', 'bound_device_id', 'device_model', 'device_bound_at')
            .order_by('last_name', 'first_name')
        )

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

        telemetry_map = {}
        missing_ids = []

        for faculty in faculty_queryset:
            cached_data = cache.get(f"attendsure_faculty_telemetry_{faculty.id}")
            if cached_data:
                telemetry_map[faculty.id] = cached_data
            else:
                missing_ids.append(faculty.id)

        # Pull authentic heartbeats from the database
        if missing_ids:
            recent_heartbeats = (
                FacultyHeartbeat.objects.filter(faculty_id__in=missing_ids)
                .order_by('faculty_id', '-recorded_at')
            )
            seen_faculties = set()
            for hb in recent_heartbeats:
                if hb.faculty_id not in seen_faculties:
                    seen_faculties.add(hb.faculty_id)
                    dist = float('inf')
                    if is_configured:
                        dist = calculate_haversine_distance(campus_lat, campus_lng, float(hb.latitude), float(hb.longitude))

                    telemetry_map[hb.faculty_id] = {
                        'latitude': float(hb.latitude),
                        'longitude': float(hb.longitude),
                        'accuracy': None,
                        'battery_level': hb.battery_level,
                        'presence_status': 'VERIFIED_INSIDE' if (is_configured and dist <= allowed_radius) else 'OFF_CAMPUS',
                        'timestamp': hb.recorded_at.isoformat(),
                    }

        for faculty in faculty_queryset:
            telemetry = telemetry_map.get(faculty.id)
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
                gps_accuracy = telemetry.get('accuracy')
                timestamp_str = telemetry.get('timestamp')

                if battery_val is not None and battery_val != '':
                    battery_display = f"{int(battery_val)}%"

                if t_lat is not None and t_lng is not None and is_configured:
                    dist = calculate_haversine_distance(campus_lat, campus_lng, float(t_lat), float(t_lng))
                    if dist != float('inf'):
                        distance_display = f"{int(dist)}m" if dist < 1000 else f"{(dist/1000.0):.2f}km"

                    if timestamp_str:
                        try:
                            t_time = datetime.fromisoformat(timestamp_str)
                            if timezone.is_naive(t_time):
                                t_time = timezone.make_aware(t_time)
                            delta_minutes = (now - t_time).total_seconds() / 60
                            last_seen_display = "Just now" if delta_minutes < 2 else f"{int(delta_minutes)}m ago"
                        except Exception:
                            last_seen_display = "Offline"

                    if is_mock_location:
                        presence_status = "SPOOF_ATTEMPT"
                        spoof_attempts_count += 1
                        incidents_today_count += 1
                    elif faculty.id in active_gate_passes:
                        presence_status = "AUTHORIZED_LEAVE"
                    elif dist <= allowed_radius:
                        presence_status = "VERIFIED_INSIDE"
                        verified_inside_count += 1
                    else:
                        presence_status = "OFF_CAMPUS"
                        incidents_today_count += 1
            else:
                missing_heartbeats_count += 1

            faculty_list.append({
                'id': faculty.id,
                'faculty_name': faculty.full_name,
                'employee_id': faculty.employee_id,
                'position': faculty.position or '',
                'status': presence_status,
                'distance': distance_display,
                'battery': battery_display,
                'last_seen': last_seen_display,
                'device_model': getattr(faculty, 'device_model', '') or 'No device paired',
                'bound_device_id': getattr(faculty, 'bound_device_id', None),
                'device_bound_at': getattr(faculty, 'device_bound_at', None),
                'photo_url': safe_photo_url(faculty.photo, request),
                'is_mock_location': is_mock_location,
                'gps_accuracy_meters': gps_accuracy,
            })

        return Response({
            'zone_id': config['school_id'],
            'name': config['school_name'],
            'latitude': campus_lat,
            'longitude': campus_lng,
            'radius_meters': allowed_radius,
            'is_configured': is_configured,
            'verified_inside': verified_inside_count,
            'missing_heartbeats': missing_heartbeats_count,
            'spoof_attempts_blocked': spoof_attempts_count,
            'incidents_today': incidents_today_count,
            'faculty_list': faculty_list,
        }, status=status.HTTP_200_OK)

    def put(self, request):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        try:
            new_lat = float(data.get('latitude'))
            new_lng = float(data.get('longitude'))
            new_radius = int(data.get('radius_meters'))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid numeric coordinates or radius.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90.0 <= new_lat <= 90.0) or not (-180.0 <= new_lng <= 180.0):
            return Response({'error': 'Coordinates out of geographic bounds.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (25 <= new_radius <= 1500):
            return Response({'error': 'Radius must be between 25 and 1500 meters.'}, status=status.HTTP_400_BAD_REQUEST)

        save_campus_geofence_config(new_lat, new_lng, new_radius)
        return Response({
            'success': True,
            'latitude': new_lat,
            'longitude': new_lng,
            'radius_meters': new_radius
        }, status=status.HTTP_200_OK)


class GeofenceCheckInAPIView(APIView):
    """
    Saves real-time device telemetry. Never stores fabricated battery levels.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data or {}
        user = request.user
        faculty = resolve_faculty_for_user(user)

        if not faculty:
            return Response({'error': 'No linked faculty profile found for this user.'}, status=status.HTTP_404_NOT_FOUND)

        coords = data.get('coords') or data.get('location', {}).get('coords') or {}
        raw_lat = data.get('latitude') or data.get('lat') or coords.get('latitude')
        raw_lng = data.get('longitude') or data.get('lng') or data.get('lon') or coords.get('longitude')

        if raw_lat is None or raw_lng is None:
            return Response({'success': True, 'status': 'WAITING_FOR_GPS', 'verified_inside': False}, status=status.HTTP_200_OK)

        try:
            latitude = float(raw_lat)
            longitude = float(raw_lng)
        except (TypeError, ValueError):
            return Response({'error': 'Coordinates must be valid numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            return Response({'error': 'Coordinates out of geographic range.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_acc = data.get('accuracy') or coords.get('accuracy')
        accuracy = float(raw_acc) if raw_acc is not None else None

        raw_batt = data.get('battery_level') or data.get('battery')
        battery_level = int(raw_batt) if raw_batt is not None and str(raw_batt).isdigit() else None

        is_mock_location = bool(data.get('is_mock_location') or data.get('mocked') or coords.get('mocked') or False)
        device_id = str(data.get('device_id') or data.get('device_uuid') or '').strip()
        device_model = str(data.get('device_model') or '').strip()

        if is_mock_location:
            return Response({'error': 'Mock location blocked by anti-cheat guard.'}, status=status.HTTP_403_FORBIDDEN)

        # Anti-Buddy Punching Hardware Lock
        bound_id = getattr(faculty, 'bound_device_id', None)
        if bound_id:
            if device_id and device_id != bound_id:
                return Response({
                    'error': f'Device mismatch. Account is locked to {faculty.device_model or "another phone"}.'
                }, status=status.HTTP_403_FORBIDDEN)
        elif device_id:
            faculty.bound_device_id = device_id
            faculty.device_model = device_model or 'Registered Phone'
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])

        config = get_campus_geofence_config()
        is_inside = False
        distance = float('inf')
        distance_display = "No GPS Signal"

        if config['is_configured']:
            distance = calculate_haversine_distance(config['latitude'], config['longitude'], latitude, longitude)
            is_inside = distance <= config['radius_meters']
            distance_display = f"{distance:.1f}m" if distance < 1000 else f"{(distance/1000.0):.2f}km"

        status_result = 'VERIFIED_INSIDE' if is_inside else 'OFF_CAMPUS'

        now_iso = timezone.now().isoformat()
        telemetry_payload = {
            'faculty_id': faculty.id,
            'employee_id': faculty.employee_id,
            'latitude': latitude,
            'longitude': longitude,
            'distance_meters': distance if distance != float('inf') else None,
            'distance_display': distance_display,
            'accuracy': accuracy,
            'battery_level': battery_level,
            'is_mock_location': False,
            'presence_status': status_result,
            'status': status_result,
            'device_id': device_id,
            'device_model': device_model,
            'timestamp': now_iso,
        }

        cache.set(f"attendsure_faculty_telemetry_{faculty.id}", telemetry_payload, timeout=86400)

        FacultyHeartbeat.objects.create(
            faculty=faculty,
            latitude=latitude,
            longitude=longitude,
            battery_level=battery_level if battery_level is not None else 0,
            is_inside_geofence=is_inside,
            recorded_at=timezone.now()
        )

        return Response({
            'success': True,
            'status': status_result,
            'presence_status': status_result,
            'distance_meters': distance if distance != float('inf') else None,
            'distance_display': distance_display,
            'verified_inside': is_inside,
            'is_inside': is_inside,
            'device_paired': faculty.device_model or 'Registered Phone',
        }, status=status.HTTP_200_OK)


class FacultyDeviceResetAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL')):
            return Response({'error': 'Only administrators can reset device locks.'}, status=status.HTTP_403_FORBIDDEN)

        faculty_id = pk or request.data.get('faculty_id')
        faculty = FacultyProfile.objects.filter(pk=faculty_id).first()
        if not faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        faculty.bound_device_id = None
        faculty.device_model = None
        faculty.device_bound_at = None
        faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])

        cache.delete(f"attendsure_device_binding_{faculty.id}")
        cache.delete(f"attendsure_faculty_telemetry_{faculty.id}")

        return Response({
            'success': True,
            'message': f"Device lock for {faculty.full_name} has been cleared."
        }, status=status.HTTP_200_OK)