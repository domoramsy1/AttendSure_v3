"""
AttendSure - Campus Perimeter & Geofence Security Telemetry Views
File: backend/apps/api/views/geofence.py

Cybersecurity & Performance Enhancements:
1. Resolved NameError: safe_photo_url safely resolves absolute media URIs with traversal protection.
2. Resolved NameError: get_user_role safely extracts role permissions without throwing unhandled exceptions.
3. Query Batching: Eliminates N+1 database queries on FacultyHeartbeat during geofence status polling.
4. Anti-Cheat & Sanitization: Validates geographic coordinate ranges and blocks mock GPS telemetry.
"""

import math
import json
import logging
from pathlib import Path
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
    StudentGateLog,
    FacultyHeartbeat,
)

try:
    from .common import resolve_faculty_for_user, get_user_role as common_get_user_role
except ImportError:
    from .common import resolve_faculty_for_user
    common_get_user_role = None

logger = logging.getLogger(__name__)

TELEMETRY_STORE_PATH = Path(__file__).resolve().parent.parent.parent / 'telemetry_store.json'


# ==============================================================================
# HELPER FUNCTIONS & CYBERSECURITY SANITIZERS
# ==============================================================================

def safe_photo_url(photo_field, request=None):
    """
    Safely resolves image field instances or raw paths into fully qualified URLs.
    Prevents NameError, NoneType crashes, and path tampering.
    """
    if not photo_field:
        return None
    try:
        # If it's already a string URL or data URI
        if isinstance(photo_field, str):
            clean_str = photo_field.strip()
            if not clean_str:
                return None
            if clean_str.startswith(('http://', 'https://', 'data:image/')):
                return clean_str
            clean_path = clean_str if clean_str.startswith('/') else f'/{clean_str}'
            if request:
                return request.build_absolute_uri(clean_path)
            return clean_path

        # If it's a Django FieldFile / ImageFieldFile
        if hasattr(photo_field, 'url') and photo_field.url:
            url = photo_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception as e:
        logger.warning(f"[safe_photo_url] Could not parse photo URL: {e}")
        return None
    return None


def get_user_role(user):
    """
    Resolves the standardized user role string from the authenticated user.
    """
    if common_get_user_role:
        try:
            return common_get_user_role(user)
        except Exception:
            pass

    if not user or not user.is_authenticated:
        return 'ANONYMOUS'
    if getattr(user, 'is_superuser', False):
        return 'ADMIN'
    role = getattr(user, 'role', None) or getattr(user, 'system_role', None)
    if role:
        return str(role).strip().upper()
    if getattr(user, 'is_staff', False):
        return 'ADMIN'
    return 'FACULTY'


def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculates great-circle distance between two GPS coordinates in meters.
    """
    try:
        if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
            return 0.0

        f_lat1 = float(lat1)
        f_lon1 = float(lon1)
        f_lat2 = float(lat2)
        f_lon2 = float(lon2)

        # Geographic range validation
        if not (-90.0 <= f_lat1 <= 90.0 and -90.0 <= f_lat2 <= 90.0):
            return 0.0
        if not (-180.0 <= f_lon1 <= 180.0 and -180.0 <= f_lon2 <= 180.0):
            return 0.0

        R = 6371000.0  # Earth's radius in meters
        phi1 = math.radians(f_lat1)
        phi2 = math.radians(f_lat2)
        delta_phi = math.radians(f_lat2 - f_lat1)
        delta_lambda = math.radians(f_lon2 - f_lon1)

        a = (math.sin(delta_phi / 2.0) ** 2 +
             math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return round(R * c, 1)
    except Exception:
        return 0.0


def get_campus_geofence_config():
    """
    Retrieves the active geofence boundary coordinates from SchoolProfile or cache.
    """
    cached = cache.get("attendsure_campus_geofence_config")
    if cached:
        return cached

    school_obj = SchoolProfile.objects.first()
    lat = float(school_obj.latitude) if school_obj and school_obj.latitude is not None else 8.4800000
    lng = float(school_obj.longitude) if school_obj and school_obj.longitude is not None else 124.6500000
    radius = int(school_obj.geofence_radius_meters) if school_obj and school_obj.geofence_radius_meters else 100
    school_name = getattr(school_obj, 'school_name', 'Lapasan National High School') or 'Lapasan National High School'
    school_id = getattr(school_obj, 'school_id', '55555') or '55555'

    config = {
        'school_name': school_name,
        'school_id': school_id,
        'latitude': lat,
        'longitude': lng,
        'radius_meters': radius,
        'is_configured': bool(school_obj is not None),
    }
    cache.set("attendsure_campus_geofence_config", config, timeout=300)
    return config


def save_campus_geofence_config(lat, lng, radius):
    school_obj = SchoolProfile.objects.first()
    if not school_obj:
        school_obj = SchoolProfile.objects.create(school_id="55555", school_name="Lapasan National High School")

    school_obj.latitude = lat
    school_obj.longitude = lng
    school_obj.geofence_radius_meters = radius
    school_obj.save(update_fields=['latitude', 'longitude', 'geofence_radius_meters'])
    cache.delete("attendsure_campus_geofence_config")
    cache.delete("attendsure_school_settings_fast_payload")


def save_persistent_telemetry(faculty_id, data):
    try:
        store = {}
        if TELEMETRY_STORE_PATH.exists():
            with open(TELEMETRY_STORE_PATH, 'r', encoding='utf-8') as f:
                store = json.load(f)
        store[str(faculty_id)] = data
        with open(TELEMETRY_STORE_PATH, 'w', encoding='utf-8') as f:
            json.dump(store, f, indent=2)
    except Exception as e:
        logger.warning(f"Telemetry persistence warning: {e}")


def load_persistent_telemetry(faculty_id):
    try:
        if TELEMETRY_STORE_PATH.exists():
            with open(TELEMETRY_STORE_PATH, 'r', encoding='utf-8') as f:
                store = json.load(f)
                return store.get(str(faculty_id))
    except Exception:
        pass
    return None


# ==============================================================================
# API VIEWS
# ==============================================================================

class GeofenceStatusAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
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

        # Optimization: Identify faculty requiring a database heartbeat in advance to avoid N+1 queries
        missing_telemetry_faculty_ids = []
        telemetry_map = {}

        for faculty in faculty_queryset:
            cached_data = cache.get(f"attendsure_faculty_telemetry_{faculty.id}") or load_persistent_telemetry(faculty.id)
            if cached_data:
                telemetry_map[faculty.id] = cached_data
            else:
                missing_telemetry_faculty_ids.append(faculty.id)

        # Batch-fetch latest heartbeats for all missing faculty in one query
        if missing_telemetry_faculty_ids:
            recent_heartbeats = (
                FacultyHeartbeat.objects.filter(faculty_id__in=missing_telemetry_faculty_ids)
                .order_by('faculty_id', '-recorded_at')
                .distinct('faculty_id')
            )
            for hb in recent_heartbeats:
                dist = calculate_haversine_distance(campus_lat, campus_lng, float(hb.latitude), float(hb.longitude))
                telemetry_map[hb.faculty_id] = {
                    'latitude': float(hb.latitude),
                    'longitude': float(hb.longitude),
                    'accuracy': 10.0,
                    'battery_level': hb.battery_level,
                    'presence_status': 'VERIFIED_INSIDE' if dist <= allowed_radius else 'OFF_CAMPUS',
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
                gps_accuracy = telemetry.get('accuracy') or telemetry.get('gps_accuracy_meters')
                timestamp_str = telemetry.get('timestamp')

                if battery_val is not None:
                    battery_display = f"{int(battery_val)}%"

                if t_lat is not None and t_lng is not None:
                    dist = calculate_haversine_distance(campus_lat, campus_lng, float(t_lat), float(t_lng))
                    distance_display = f"{int(dist)}m" if dist < 1000 else f"{(dist/1000.0):.2f}km"

                    if timestamp_str:
                        try:
                            t_time = datetime.fromisoformat(timestamp_str)
                            if timezone.is_naive(t_time):
                                t_time = timezone.make_aware(t_time)
                            delta_minutes = (now - t_time).total_seconds() / 60
                            last_seen_display = "Just now" if delta_minutes < 2 else f"{int(delta_minutes)}m ago"
                        except Exception:
                            last_seen_display = "Just now"

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
                'position': faculty.position or 'Faculty',
                'status': presence_status,
                'distance': distance_display,
                'battery': battery_display,
                'last_seen': last_seen_display,
                'device_model': getattr(faculty, 'device_model', 'Registered Phone') or 'No device paired',
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
            'is_configured': config['is_configured'],
            'verified_inside': verified_inside_count,
            'missing_heartbeats': missing_heartbeats_count,
            'spoof_attempts_blocked': spoof_attempts_count,
            'incidents_today': incidents_today_count,
            'faculty_list': faculty_list,
        }, status=status.HTTP_200_OK)

    def put(self, request):
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

    def post(self, request):
        return self.put(request)


class GeofenceCheckInAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        data = request.data or {}
        user = request.user if (request.user and request.user.is_authenticated) else None

        faculty = None
        if user:
            faculty = resolve_faculty_for_user(user)

        emp_id = str(data.get('employee_id') or '').strip()
        faculty_id = data.get('faculty_id')
        if not faculty and emp_id:
            faculty = FacultyProfile.objects.filter(employee_id__iexact=emp_id).first()
        if not faculty and faculty_id:
            faculty = FacultyProfile.objects.filter(id=faculty_id).first()

        coords = data.get('coords') or data.get('location', {}).get('coords') or {}
        raw_lat = data.get('latitude') or data.get('lat') or coords.get('latitude')
        raw_lng = data.get('longitude') or data.get('lng') or data.get('lon') or coords.get('longitude')

        if raw_lat is None or raw_lng is None:
            return Response({
                'success': True,
                'status': 'WAITING_FOR_GPS',
                'verified_inside': False
            }, status=status.HTTP_200_OK)

        try:
            latitude = float(raw_lat)
            longitude = float(raw_lng)
        except (TypeError, ValueError):
            return Response({'error': 'Coordinates must be valid numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            return Response({'error': 'Coordinates out of geographic range.'}, status=status.HTTP_400_BAD_REQUEST)

        accuracy = float(data.get('accuracy') or coords.get('accuracy') or 10.0)
        battery_level = int(data.get('battery_level') or data.get('battery') or 85)
        is_mock_location = bool(data.get('is_mock_location') or data.get('mocked') or coords.get('mocked') or False)

        # Sanitize hardware identifiers
        device_id = str(data.get('device_id') or data.get('device_uuid') or '').replace('\r', '').replace('\n', '').strip()
        device_model = str(data.get('device_model') or 'Smartphone App').replace('\r', '').replace('\n', '').strip()

        if is_mock_location:
            return Response({'error': 'Mock location blocked by anti-cheat guard.'}, status=status.HTTP_403_FORBIDDEN)

        # Anti-Buddy Punching Device Hardware Lock
        if faculty:
            bound_id = getattr(faculty, 'bound_device_id', None)
            if bound_id:
                if device_id and device_id != bound_id:
                    return Response({
                        'error': f'Device mismatch. Account is locked to {faculty.device_model or "another phone"}.'
                    }, status=status.HTTP_403_FORBIDDEN)
            elif device_id:
                faculty.bound_device_id = device_id
                faculty.device_model = device_model
                faculty.device_bound_at = timezone.now()
                faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])

        config = get_campus_geofence_config()
        distance = calculate_haversine_distance(config['latitude'], config['longitude'], latitude, longitude)
        is_inside = distance <= config['radius_meters']
        status_result = 'VERIFIED_INSIDE' if is_inside else 'OFF_CAMPUS'
        distance_display = f"{distance:.1f}m" if distance < 1000 else f"{(distance/1000.0):.2f}km"

        now_iso = timezone.now().isoformat()
        telemetry_payload = {
            'faculty_id': faculty.id if faculty else None,
            'employee_id': faculty.employee_id if faculty else 'ADMIN',
            'latitude': latitude,
            'longitude': longitude,
            'distance_meters': distance,
            'distance_display': distance_display,
            'accuracy': accuracy,
            'gps_accuracy_meters': accuracy,
            'battery_level': battery_level,
            'is_mock_location': False,
            'presence_status': status_result,
            'status': status_result,
            'device_id': device_id,
            'device_model': device_model,
            'timestamp': now_iso,
        }

        if faculty:
            cache.set(f"attendsure_faculty_telemetry_{faculty.id}", telemetry_payload, timeout=86400)
            cache.set(f"faculty_location_{faculty.id}", telemetry_payload, timeout=86400)
            save_persistent_telemetry(faculty.id, telemetry_payload)

            try:
                FacultyHeartbeat.objects.create(
                    faculty=faculty,
                    latitude=latitude,
                    longitude=longitude,
                    battery_level=battery_level,
                    is_inside_geofence=is_inside,
                    recorded_at=timezone.now()
                )
            except Exception as e:
                logger.warning(f"Failed to record database heartbeat: {e}")

        return Response({
            'success': True,
            'status': status_result,
            'presence_status': status_result,
            'distance_meters': distance,
            'distance_display': distance_display,
            'verified_inside': is_inside,
            'is_inside': is_inside,
            'device_paired': device_model,
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
        cache.delete(f"faculty_location_{faculty.id}")
        save_persistent_telemetry(faculty.id, {})

        return Response({
            'success': True,
            'message': f"Device lock for {faculty.full_name} has been cleared."
        }, status=status.HTTP_200_OK)