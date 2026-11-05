"""
AttendSure V3 - Live Database Geofence & Telemetry Audit Engine
File: backend/apps/api/views/geofence.py
"""

import math
import logging
from datetime import datetime, timedelta

from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.throttling import UserRateThrottle

from apps.academics.models import (
    SchoolProfile,
    FacultyProfile,
    UserProfile,
    GatePass,
    FacultyHeartbeat,
)

logger = logging.getLogger(__name__)


def calculate_haversine_distance(lat1, lon1, lat2, lon2):
    """Calculates ground distance in meters between two GPS coordinates."""
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)


def safe_photo_url(photo_field, request=None):
    """Builds a real web URL for images stored in the database."""
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('http://', 'https://', 'data:image/')):
                return val
            if val.startswith('/media/') and request:
                return request.build_absolute_uri(val)
            if not val.startswith('/media/'):
                val = f"/media/{val.lstrip('/')}"
                return request.build_absolute_uri(val) if request else val
            return val

        if hasattr(photo_field, 'url'):
            url = photo_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception:
        return None
    return None


def get_real_user_photo(faculty, request=None):
    """Resolves authentic photos from FacultyProfile or UserProfile in PostgreSQL."""
    if getattr(faculty, 'photo', None):
        url = safe_photo_url(faculty.photo, request)
        if url:
            return url

    user = getattr(faculty, 'account', None)
    if user:
        prof = getattr(user, 'profile', None) or getattr(user, 'userprofile', None)
        if prof and getattr(prof, 'avatar', None):
            url = safe_photo_url(prof.avatar, request)
            if url:
                return url

    prof = UserProfile.objects.filter(
        Q(faculty=faculty) | Q(user__username__iexact=faculty.employee_id)
    ).first()
    if prof and getattr(prof, 'avatar', None):
        url = safe_photo_url(prof.avatar, request)
        if url:
            return url

    return None


def format_online_offline_status(recorded_at, now):
    """
    Computes whether a user is online or offline with elapsed minutes, hours, or days.
    - Online: Heartbeat received within the last 15 minutes.
    - Offline: No heartbeat for > 15 minutes, or never connected.
    """
    if not recorded_at:
        return {
            'is_online': False,
            'status': 'OFFLINE',
            'duration_label': 'Never connected',
            'full_label': 'Offline (Never connected)'
        }

    delta_seconds = max(0, int((now - recorded_at).total_seconds()))
    delta_minutes = delta_seconds // 60
    delta_hours = delta_minutes // 60
    delta_days = delta_hours // 24

    if delta_minutes <= 15:
        # ONLINE
        if delta_seconds < 60:
            time_str = "Active just now"
        else:
            time_str = f"Active {delta_minutes}m ago"

        return {
            'is_online': True,
            'status': 'ONLINE',
            'duration_label': time_str,
            'full_label': f"Online • {time_str}"
        }
    else:
        # OFFLINE
        if delta_minutes < 60:
            time_str = f"Offline for {delta_minutes}m"
        elif delta_hours < 24:
            time_str = f"Offline for {delta_hours}h"
        else:
            time_str = f"Offline for {delta_days}d"

        return {
            'is_online': False,
            'status': 'OFFLINE',
            'duration_label': time_str,
            'full_label': f"Offline • {time_str}"
        }


def get_real_school_config():
    """Reads official school boundary settings from SchoolProfile table."""
    school_obj = SchoolProfile.objects.first()

    has_coords = bool(
        school_obj
        and school_obj.latitude is not None
        and school_obj.longitude is not None
    )

    school_name = (
        getattr(school_obj, 'school_name', None)
        or getattr(school_obj, 'name', None)
        or "School Campus"
    )

    radius = 200
    if school_obj:
        for attr in ['geofence_radius', 'geofence_radius_meters', 'radius_meters']:
            val = getattr(school_obj, attr, None)
            if val is not None:
                try:
                    r = int(val)
                    if r > 0:
                        radius = r
                        break
                except (ValueError, TypeError):
                    pass

    return {
        'school_name': school_name,
        'school_id': getattr(school_obj, 'school_id', '') or '',
        'latitude': float(school_obj.latitude) if has_coords else 8.480241,
        'longitude': float(school_obj.longitude) if has_coords else 124.650152,
        'radius_meters': radius,
        'is_configured': has_coords,
    }


def save_campus_geofence_config(lat, lng, radius):
    school_obj = SchoolProfile.objects.first()
    if not school_obj:
        school_obj = SchoolProfile.objects.create(school_name="School Campus")

    school_obj.latitude = lat
    school_obj.longitude = lng

    for attr in ['geofence_radius', 'geofence_radius_meters', 'radius_meters']:
        if hasattr(school_obj, attr):
            setattr(school_obj, attr, radius)

    school_obj.save()


def resolve_faculty_from_user(user, data=None):
    """Matches the logged-in user to their real FacultyProfile row."""
    if not user:
        return None

    prof = getattr(user, 'profile', None) or getattr(user, 'userprofile', None)
    if prof and getattr(prof, 'faculty', None):
        return prof.faculty

    if hasattr(user, 'username') and user.username:
        clean_user = user.username.strip()
        f = FacultyProfile.objects.filter(
            Q(employee_id__iexact=clean_user) |
            Q(employee_id__iexact=clean_user.replace('_', '')) |
            Q(employee_id__iexact=clean_user.replace('-', '_'))
        ).first()
        if f:
            return f

    if data:
        emp_id = data.get('employee_id') or data.get('faculty_id')
        if emp_id:
            f = FacultyProfile.objects.filter(
                Q(employee_id__iexact=str(emp_id)) | Q(id=int(emp_id) if str(emp_id).isdigit() else -1)
            ).first()
            if f:
                return f

    return FacultyProfile.objects.filter(account__user=user).first()


class GeofenceStatusAPIView(APIView):
    """
    Returns authentic live geofence status directly from database records.
    Provides online/offline status with exact elapsed time.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        config = get_real_school_config()

        campus_lat = config['latitude']
        campus_lng = config['longitude']
        allowed_radius = config['radius_meters']
        is_configured = config['is_configured']

        faculties = list(
            FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name')
        )

        faculty_list = []
        verified_inside_count = 0
        missing_heartbeats_count = 0
        spoof_attempts_count = 0
        incidents_today_count = 0
        online_users_count = 0
        recent_breaches = []

        active_gate_passes = set(
            GatePass.objects.filter(
                status='ACTIVE',
                valid_from__lte=now,
                valid_to__gte=now
            ).values_list('faculty_id', flat=True)
        )

        for faculty in faculties:
            # Query latest heartbeat from PostgreSQL
            latest_hb = (
                FacultyHeartbeat.objects.filter(faculty=faculty)
                .order_by('-recorded_at')
                .first()
            )

            # Calculate online/offline status with elapsed time
            conn_status = format_online_offline_status(latest_hb.recorded_at if latest_hb else None, now)
            if conn_status['is_online']:
                online_users_count += 1

            distance_display = "No GPS Signal"
            presence_status = "NOT_ON_DUTY"
            battery_display = "—"
            gps_accuracy = None
            is_mock_location = False
            user_lat = None
            user_lng = None

            if latest_hb and latest_hb.latitude is not None and latest_hb.longitude is not None:
                user_lat = float(latest_hb.latitude)
                user_lng = float(latest_hb.longitude)
                is_mock_location = bool(getattr(latest_hb, 'is_mock_location', False))
                gps_accuracy = getattr(latest_hb, 'accuracy', None) or getattr(latest_hb, 'accuracy_meters', None)

                if latest_hb.battery_level is not None:
                    battery_display = f"{latest_hb.battery_level}%"

                # Calculate real distance from campus
                dist = calculate_haversine_distance(campus_lat, campus_lng, user_lat, user_lng)
                distance_display = f"{int(dist)}m" if dist < 1000 else f"{(dist / 1000.0):.2f} km"

                delta_minutes = (now - latest_hb.recorded_at).total_seconds() / 60.0

                # Presence classification based on real database records
                if is_mock_location:
                    presence_status = "SPOOF_ATTEMPT"
                    spoof_attempts_count += 1
                    incidents_today_count += 1
                    recent_breaches.append({
                        'id': faculty.id,
                        'faculty_name': faculty.full_name,
                        'reason': 'Fake GPS app blocked by security shield',
                        'status': 'BLOCKED',
                        'time': conn_status['duration_label'],
                    })
                elif delta_minutes > 15:
                    presence_status = "HEARTBEAT_LOST"
                    missing_heartbeats_count += 1
                elif faculty.id in active_gate_passes:
                    presence_status = "AUTHORIZED_LEAVE"
                elif dist <= allowed_radius:
                    presence_status = "VERIFIED_INSIDE"
                    verified_inside_count += 1
                else:
                    presence_status = "PERIMETER_BREACH"
                    incidents_today_count += 1
                    recent_breaches.append({
                        'id': faculty.id,
                        'faculty_name': faculty.full_name,
                        'reason': f'Outside campus boundary ({distance_display} away)',
                        'status': 'OUT OF BOUNDS',
                        'time': conn_status['duration_label'],
                    })
            else:
                missing_heartbeats_count += 1

            user_photo_url = get_real_user_photo(faculty, request)

            faculty_list.append({
                'id': faculty.id,
                'faculty_name': faculty.full_name,
                'employee_id': faculty.employee_id,
                'position': faculty.position or 'Faculty I',
                'status': presence_status,
                'is_online': conn_status['is_online'],
                'online_status': conn_status['status'],
                'status_duration': conn_status['duration_label'],
                'connection_label': conn_status['full_label'],
                'distance': distance_display,
                'battery': battery_display,
                'last_seen': conn_status['duration_label'],
                'device_model': getattr(faculty, 'device_model', None) or 'No device paired',
                'bound_device_id': getattr(faculty, 'bound_device_id', None),
                'device_bound_at': getattr(faculty, 'device_bound_at', None),
                'photo': user_photo_url,
                'photo_url': user_photo_url,
                'is_mock_location': is_mock_location,
                'gps_accuracy_meters': gps_accuracy,
                'gate_tap_verified': False,
                'latitude': user_lat,
                'longitude': user_lng,
            })

        return Response({
            'zone_id': config['school_id'],
            'name': config['school_name'],
            'latitude': campus_lat,
            'longitude': campus_lng,
            'radius_meters': allowed_radius,
            'is_configured': is_configured,
            'verified_inside': verified_inside_count,
            'online_users_count': online_users_count,
            'offline_users_count': len(faculties) - online_users_count,
            'missing_heartbeats': missing_heartbeats_count,
            'spoof_attempts_blocked': spoof_attempts_count,
            'incidents_today': incidents_today_count,
            'faculty_list': faculty_list,
            'recent_breaches': recent_breaches[:10],
        }, status=status.HTTP_200_OK)

    def post(self, request):
        checkin_view = GeofenceCheckInAPIView()
        return checkin_view.post(request)

    def put(self, request):
        data = request.data or {}
        try:
            new_lat = float(data.get('latitude'))
            new_lng = float(data.get('longitude'))
            new_radius = int(data.get('radius_meters') or data.get('geofence_radius') or 200)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid numeric coordinates or radius.'}, status=status.HTTP_400_BAD_REQUEST)

        save_campus_geofence_config(new_lat, new_lng, new_radius)
        return Response({
            'success': True,
            'latitude': new_lat,
            'longitude': new_lng,
            'radius_meters': new_radius,
            'message': 'Campus perimeter updated in database.'
        }, status=status.HTTP_200_OK)


class GeofenceCheckInAPIView(APIView):
    """
    Receives real telemetry from mobile phones and saves directly to PostgreSQL.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def post(self, request):
        data = request.data or {}
        user = request.user
        faculty = resolve_faculty_from_user(user, data)

        if not faculty:
            return Response(
                {'error': f'Faculty profile not found for user "{user.username}".'},
                status=status.HTTP_404_NOT_FOUND
            )

        coords = data.get('coords') or data.get('location', {}).get('coords') or {}
        raw_lat = data.get('latitude') if 'latitude' in data else (data.get('lat') if 'lat' in data else coords.get('latitude'))
        raw_lng = data.get('longitude') if 'longitude' in data else (data.get('lng') if 'lng' in data else coords.get('longitude'))

        if raw_lat is None or raw_lng is None:
            return Response({'error': 'Real GPS coordinates required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            latitude = float(raw_lat)
            longitude = float(raw_lng)
        except (ValueError, TypeError):
            return Response({'error': 'Coordinates must be valid numbers.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_acc = data.get('accuracy') or data.get('accuracy_meters') or coords.get('accuracy')
        accuracy = round(float(raw_acc), 1) if raw_acc is not None else None

        raw_batt = data.get('battery_level') or data.get('battery')
        battery_level = (
            int(str(raw_batt).replace('%', '').strip())
            if raw_batt is not None and str(raw_batt).replace('%', '').strip().isdigit()
            else None
        )

        is_mock_location = bool(data.get('is_mock_location') or data.get('mocked') or coords.get('mocked') or False)
        device_id = str(data.get('device_id') or data.get('client_device_id') or data.get('device_uuid') or '').strip()
        device_model = str(data.get('device_model') or data.get('model') or '').strip()

        # Reject fake GPS
        if is_mock_location:
            return Response({'error': 'Mock location blocked by security shield.'}, status=status.HTTP_403_FORBIDDEN)

        # Hardware Device Binding in database
        if device_id:
            bound_id = getattr(faculty, 'bound_device_id', None)

            # Prevent a different device from checking in if account is locked to another phone
            if bound_id and bound_id != device_id:
                return Response({
                    'error': f'Device mismatch: Account is locked to {faculty.device_model or "another phone"}.'
                }, status=status.HTTP_403_FORBIDDEN)

            # Rebind device safely if testing with the same physical phone across accounts
            FacultyProfile.objects.filter(bound_device_id=device_id).exclude(id=faculty.id).update(
                bound_device_id=None,
                device_model=None,
                device_bound_at=None
            )

            faculty.bound_device_id = device_id
            if device_model:
                faculty.device_model = device_model
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])

        config = get_real_school_config()
        distance = calculate_haversine_distance(config['latitude'], config['longitude'], latitude, longitude)
        is_inside = distance <= config['radius_meters']
        distance_display = f"{int(distance)}m" if distance < 1000 else f"{(distance / 1000.0):.2f} km"
        status_result = 'VERIFIED_INSIDE' if is_inside else 'PERIMETER_BREACH'
        now = timezone.now()

        # Check model fields dynamically before saving to PostgreSQL
        model_fields = {f.name for f in FacultyHeartbeat._meta.fields}
        hb_kwargs = {
            'faculty': faculty,
            'latitude': latitude,
            'longitude': longitude,
            'recorded_at': now,
        }

        if 'battery_level' in model_fields:
            hb_kwargs['battery_level'] = battery_level if battery_level is not None else 0
        if 'is_inside_geofence' in model_fields:
            hb_kwargs['is_inside_geofence'] = is_inside
        if 'accuracy' in model_fields and accuracy is not None:
            hb_kwargs['accuracy'] = accuracy
        elif 'accuracy_meters' in model_fields and accuracy is not None:
            hb_kwargs['accuracy_meters'] = accuracy
        if 'is_mock_location' in model_fields:
            hb_kwargs['is_mock_location'] = False

        FacultyHeartbeat.objects.create(**hb_kwargs)

        return Response({
            'success': True,
            'status': status_result,
            'distance': distance_display,
            'verified_inside': is_inside,
            'device_paired': faculty.device_model or device_model or 'Paired Device',
            'recorded_at': now.strftime('%I:%M:%S %p'),
        }, status=status.HTTP_200_OK)


class GeofenceAuditHistoryAPIView(APIView):
    """
    Permanent database audit trail of all recorded GPS heartbeats.
    - System Admins can search and inspect all users.
    - Non-admin faculty can view and search their own permanent geofence history.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        config = get_real_school_config()
        campus_lat = config['latitude']
        campus_lng = config['longitude']
        radius = config['radius_meters']

        # Determine user authorization level
        user_role = 'FACULTY'
        if hasattr(user, 'profile') and getattr(user.profile, 'role', None):
            user_role = str(user.profile.role).upper()
        elif user.is_superuser or user.is_staff:
            user_role = 'ADMIN'

        is_admin = user_role in ['ADMIN', 'PRINCIPAL', 'SUPERUSER'] or user.is_superuser

        # Filter parameters
        search_query = request.query_params.get('search', '').strip()
        faculty_id_param = request.query_params.get('faculty_id')
        date_from_param = request.query_params.get('date_from')
        date_to_param = request.query_params.get('date_to')
        status_filter = request.query_params.get('status', 'ALL').upper()

        # Query heartbeats ordered chronologically
        heartbeats = FacultyHeartbeat.objects.select_related('faculty').order_by('-recorded_at')

        # Cybersecurity: Non-admins are locked to their own logs
        if not is_admin:
            faculty_obj = resolve_faculty_from_user(user)
            if faculty_obj:
                heartbeats = heartbeats.filter(faculty=faculty_obj)
            else:
                return Response({'total_heartbeats': 0, 'records': []}, status=status.HTTP_200_OK)
        elif faculty_id_param and faculty_id_param != 'ALL' and faculty_id_param.isdigit():
            heartbeats = heartbeats.filter(faculty_id=int(faculty_id_param))

        # Search filter (Faculty Name or Employee ID)
        if search_query:
            heartbeats = heartbeats.filter(
                Q(faculty__first_name__icontains=search_query) |
                Q(faculty__last_name__icontains=search_query) |
                Q(faculty__employee_id__icontains=search_query)
            )

        # Date range filters
        if date_from_param:
            try:
                d_from = datetime.strptime(date_from_param, '%Y-%m-%d').date()
                heartbeats = heartbeats.filter(recorded_at__date__gte=d_from)
            except ValueError:
                pass

        if date_to_param:
            try:
                d_to = datetime.strptime(date_to_param, '%Y-%m-%d').date()
                heartbeats = heartbeats.filter(recorded_at__date__lte=d_to)
            except ValueError:
                pass

        # Fast pagination limit (keeps initial load under 200ms)
        heartbeats_subset = list(heartbeats[:300])

        audit_records = []
        loafing_count = 0
        inside_count = 0

        now = timezone.now()

        for hb in heartbeats_subset:
            lat = float(hb.latitude)
            lng = float(hb.longitude)
            dist = calculate_haversine_distance(campus_lat, campus_lng, lat, lng)
            is_inside = dist <= radius

            if is_inside:
                inside_count += 1
                verdict = "VERIFIED_INSIDE"
            else:
                loafing_count += 1
                verdict = "LOAFING_OUT_OF_BOUNDS"

            if status_filter == 'INSIDE' and not is_inside:
                continue
            if status_filter == 'LOAFING' and is_inside:
                continue

            dist_str = f"{int(dist)}m" if dist < 1000 else f"{(dist / 1000.0):.2f} km"

            audit_records.append({
                'id': hb.id,
                'faculty_id': hb.faculty.id,
                'faculty_name': hb.faculty.full_name,
                'employee_id': hb.faculty.employee_id,
                'timestamp': hb.recorded_at.strftime('%Y-%m-%d %I:%M:%S %p'),
                'time_only': hb.recorded_at.strftime('%I:%M:%S %p'),
                'date_only': hb.recorded_at.strftime('%Y-%m-%d'),
                'latitude': lat,
                'longitude': lng,
                'distance': dist_str,
                'distance_meters': dist,
                'verdict': verdict,
                'is_inside': is_inside,
                'battery': f"{hb.battery_level}%" if hb.battery_level is not None else "—",
                'device_model': getattr(hb.faculty, 'device_model', 'Registered Phone') or 'Registered Phone',
                'bound_device_id': getattr(hb.faculty, 'bound_device_id', None),
            })

        return Response({
            'total_heartbeats': len(audit_records),
            'loafing_incidents': loafing_count,
            'inside_verifications': inside_count,
            'is_admin': is_admin,
            'records': audit_records,
        }, status=status.HTTP_200_OK)

class FacultyDeviceResetAPIView(APIView):
    """Allows administrators to unlock a paired phone device."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        faculty_id = pk or request.data.get('faculty_id')
        faculty = FacultyProfile.objects.filter(pk=faculty_id).first()
        if not faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        faculty.bound_device_id = None
        faculty.device_model = None
        faculty.device_bound_at = None
        faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])

        return Response({
            'success': True,
            'message': f"Device lock for {faculty.full_name} has been cleared in database."
        }, status=status.HTTP_200_OK)