"""
AttendSure V3 - Zero-Mock Live Database Geofence & Telemetry Audit Engine
File: backend/apps/api/views/geofence.py
"""

import math
import logging
from datetime import datetime

from django.utils import timezone
from django.db.models import Q
from django.core.cache import cache
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

# 1-minute (60s) cadence + 30s network transmission allowance = 90 seconds
ONLINE_THRESHOLD_SECONDS = 90
MIN_HEARTBEAT_CADENCE_SECONDS = 55


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates ground distance in meters between two GPS coordinates using the Haversine formula."""
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)


def get_client_ip(request):
    """Extracts authentic client IP address from network connection socket headers."""
    cf_ip = request.META.get('HTTP_CF_CONNECTING_IP')
    if cf_ip:
        return cf_ip.strip()
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    remote_addr = request.META.get('REMOTE_ADDR')
    return remote_addr.strip() if remote_addr else None


def evaluate_real_signal(accuracy_meters):
    """Evaluates signal quality strictly against real GPS horizontal accuracy."""
    if accuracy_meters is None:
        return (None, None)

    try:
        acc = float(accuracy_meters)
    except (ValueError, TypeError):
        return (None, None)

    if acc <= 15:
        return ("Strong", 95)
    elif acc <= 30:
        return ("Good", 75)
    elif acc <= 60:
        return ("Fair", 50)
    else:
        return ("Weak", 25)


def safe_photo_url(photo_field, request=None):
    """Builds a verified web URL for stored images without fallback avatars."""
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
    """Computes online/offline status based strictly on active database timestamps."""
    if not recorded_at:
        return {
            'is_online': False,
            'status': 'OFFLINE',
            'duration_label': None,
            'full_label': None,
        }

    delta_seconds = max(0, int((now - recorded_at).total_seconds()))
    delta_minutes = delta_seconds // 60
    delta_hours = delta_minutes // 60
    delta_days = delta_hours // 24

    if delta_seconds <= ONLINE_THRESHOLD_SECONDS:
        time_str = "Active just now" if delta_seconds < 60 else "Active 1m ago"
        return {
            'is_online': True,
            'status': 'ONLINE',
            'duration_label': time_str,
            'full_label': f"Online • {time_str}",
        }
    else:
        if delta_minutes < 60:
            time_str = f"Offline for {max(1, delta_minutes)}m"
        elif delta_hours < 24:
            time_str = f"Offline for {delta_hours}h"
        else:
            time_str = f"Offline for {delta_days}d"

        return {
            'is_online': False,
            'status': 'OFFLINE',
            'duration_label': time_str,
            'full_label': f"Offline • {time_str}",
        }


def get_real_school_config():
    """Reads official school boundary settings. Returns None if unconfigured."""
    school_obj = SchoolProfile.objects.first()

    has_coords = bool(
        school_obj
        and school_obj.latitude is not None
        and school_obj.longitude is not None
    )

    school_name = getattr(school_obj, 'school_name', None) or getattr(school_obj, 'name', None)
    school_id = getattr(school_obj, 'school_id', None)

    radius = None
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
        'school_id': school_id,
        'latitude': float(school_obj.latitude) if has_coords else None,
        'longitude': float(school_obj.longitude) if has_coords else None,
        'radius_meters': radius,
        'is_configured': has_coords and radius is not None,
    }


def save_campus_geofence_config(lat: float, lng: float, radius: int):
    school_obj = SchoolProfile.objects.first()
    if not school_obj:
        school_obj = SchoolProfile.objects.create()

    school_obj.latitude = lat
    school_obj.longitude = lng

    for attr in ['geofence_radius', 'geofence_radius_meters', 'radius_meters']:
        if hasattr(school_obj, attr):
            setattr(school_obj, attr, radius)

    school_obj.save()


def resolve_faculty_from_user(user, data=None):
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
            latest_hb = (
                FacultyHeartbeat.objects.filter(faculty=faculty)
                .order_by('-recorded_at')
                .first()
            )

            conn_status = format_online_offline_status(latest_hb.recorded_at if latest_hb else None, now)
            if conn_status['is_online']:
                online_users_count += 1

            distance_display = None
            presence_status = "NOT_ON_DUTY"
            battery_display = None
            gps_accuracy = None
            is_mock_location = False
            user_lat = None
            user_lng = None

            ip_val = getattr(latest_hb, 'ip_address', None) or cache.get(f"faculty_last_ip_{faculty.id}")
            mac_val = (
                getattr(latest_hb, 'mac_address', None)
                or getattr(faculty, 'bound_device_id', None)
                or cache.get(f"faculty_last_mac_{faculty.id}")
            )

            sig_label, sig_pct = None, None

            if latest_hb and latest_hb.latitude is not None and latest_hb.longitude is not None:
                user_lat = float(latest_hb.latitude)
                user_lng = float(latest_hb.longitude)
                is_mock_location = bool(getattr(latest_hb, 'is_mock_location', False))
                gps_accuracy = getattr(latest_hb, 'accuracy', None) or getattr(latest_hb, 'accuracy_meters', None)

                sig_label, sig_pct = evaluate_real_signal(gps_accuracy)

                if latest_hb.battery_level is not None:
                    battery_display = f"{latest_hb.battery_level}%"

                if is_configured and campus_lat is not None and campus_lng is not None and allowed_radius is not None:
                    dist = calculate_haversine_distance(campus_lat, campus_lng, user_lat, user_lng)
                    distance_display = f"{round(dist)}m" if dist < 1000 else f"{(dist / 1000.0):.2f} km"
                    is_inside = dist <= allowed_radius
                else:
                    dist = None
                    is_inside = False

                delta_seconds = (now - latest_hb.recorded_at).total_seconds()
                local_time_str = timezone.localtime(latest_hb.recorded_at).strftime('%I:%M:%S %p')

                if is_mock_location:
                    presence_status = "SPOOF_ATTEMPT"
                    spoof_attempts_count += 1
                    incidents_today_count += 1
                    recent_breaches.append({
                        'id': faculty.id,
                        'faculty_name': faculty.full_name,
                        'reason': 'Mock location application detected',
                        'status': 'BLOCKED',
                        'time': local_time_str,
                    })
                elif delta_seconds > ONLINE_THRESHOLD_SECONDS:
                    presence_status = "HEARTBEAT_LOST"
                    missing_heartbeats_count += 1
                elif faculty.id in active_gate_passes:
                    presence_status = "AUTHORIZED_LEAVE"
                elif is_inside:
                    presence_status = "VERIFIED_INSIDE"
                    verified_inside_count += 1
                else:
                    presence_status = "PERIMETER_BREACH"
                    incidents_today_count += 1
                    recent_breaches.append({
                        'id': faculty.id,
                        'faculty_name': faculty.full_name,
                        'reason': f'Outside campus boundary ({distance_display or "Unknown distance"})',
                        'status': 'OUT OF BOUNDS',
                        'time': local_time_str,
                    })
            else:
                missing_heartbeats_count += 1

            user_photo_url = get_real_user_photo(faculty, request)

            faculty_entry = {
                'id': faculty.id,
                'faculty_name': faculty.full_name,
                'employee_id': faculty.employee_id,
                'position': faculty.position,
                'status': presence_status,
                'is_online': conn_status['is_online'],
                'online_status': conn_status['status'],
                'status_duration': conn_status['duration_label'],
                'connection_label': conn_status['full_label'],
                'distance': distance_display,
                'battery': battery_display,
                'last_seen': conn_status['duration_label'],
                'device_model': getattr(faculty, 'device_model', None),
                'bound_device_id': getattr(faculty, 'bound_device_id', None),
                'device_bound_at': getattr(faculty, 'device_bound_at', None),
                'ip_address': ip_val,
                'mac_address': mac_val,
                'signal_strength': sig_label if conn_status['is_online'] else None,
                'signal_percentage': sig_pct if conn_status['is_online'] else None,
                'photo': user_photo_url,
                'photo_url': user_photo_url,
                'is_mock_location': is_mock_location,
                'gps_accuracy_meters': gps_accuracy,
                'gate_tap_verified': False,
                'latitude': user_lat,
                'longitude': user_lng,
            }
            faculty_list.append(faculty_entry)

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
            'faculty_class_list': faculty_list,
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
            new_radius = int(data.get('radius_meters') or data.get('geofence_radius'))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid numeric coordinates or radius.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (-90.0 <= new_lat <= 90.0) or not (-180.0 <= new_lng <= 180.0):
            return Response({'error': 'Coordinates out of valid global range.'}, status=status.HTTP_400_BAD_REQUEST)

        if not (25 <= new_radius <= 1500):
            return Response({'error': 'Radius must be between 25m and 1,500m.'}, status=status.HTTP_400_BAD_REQUEST)

        save_campus_geofence_config(new_lat, new_lng, new_radius)
        return Response({
            'success': True,
            'latitude': new_lat,
            'longitude': new_lng,
            'radius_meters': new_radius,
            'message': 'Campus perimeter updated in database.'
        }, status=status.HTTP_200_OK)


class GeofenceCheckInAPIView(APIView):
    """Receives live telemetry and records heartbeats without mock data."""
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
        battery_level = None
        if raw_batt is not None:
            batt_clean = str(raw_batt).replace('%', '').strip()
            if batt_clean.isdigit():
                battery_level = int(batt_clean)

        is_mock_location = bool(data.get('is_mock_location') or data.get('mocked') or coords.get('mocked') or False)

        device_id = str(
            data.get('mac_address') or
            data.get('device_id') or
            data.get('client_device_id') or
            data.get('device_uuid') or
            ''
        ).strip() or None

        device_model = str(data.get('device_model') or data.get('model') or '').strip() or None
        client_ip = get_client_ip(request)

        if is_mock_location:
            return Response({'error': 'Mock location blocked by security shield.'}, status=status.HTTP_403_FORBIDDEN)

        if device_id:
            bound_id = getattr(faculty, 'bound_device_id', None)
            if not bound_id or bound_id != device_id:
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
        if config['is_configured'] and config['latitude'] is not None and config['longitude'] is not None and config['radius_meters'] is not None:
            distance = calculate_haversine_distance(config['latitude'], config['longitude'], latitude, longitude)
            is_inside = distance <= config['radius_meters']
            distance_display = f"{round(distance)}m" if distance < 1000 else f"{(distance / 1000.0):.2f} km"
            status_result = 'VERIFIED_INSIDE' if is_inside else 'PERIMETER_BREACH'
        else:
            distance = None
            is_inside = False
            distance_display = None
            status_result = 'UNCONFIGURED'

        now = timezone.now()
        local_now = timezone.localtime(now)

        latest_existing_hb = FacultyHeartbeat.objects.filter(faculty=faculty).order_by('-recorded_at').first()
        model_fields = {f.name for f in FacultyHeartbeat._meta.fields}
        sig_label, sig_pct = evaluate_real_signal(accuracy)

        # 1-minute cadence: update current heartbeat record within 55s to prevent database flooding
        if latest_existing_hb and (now - latest_existing_hb.recorded_at).total_seconds() < MIN_HEARTBEAT_CADENCE_SECONDS:
            target_hb = latest_existing_hb
            target_hb.latitude = latitude
            target_hb.longitude = longitude
            if 'battery_level' in model_fields:
                target_hb.battery_level = battery_level
            if 'accuracy' in model_fields:
                target_hb.accuracy = accuracy
            elif 'accuracy_meters' in model_fields:
                target_hb.accuracy_meters = accuracy
            if 'ip_address' in model_fields and client_ip:
                target_hb.ip_address = client_ip
            if 'mac_address' in model_fields and device_id:
                target_hb.mac_address = device_id
            if 'signal_strength' in model_fields:
                target_hb.signal_strength = sig_label
            if 'signal_percentage' in model_fields:
                target_hb.signal_percentage = sig_pct
            target_hb.save()
        else:
            hb_kwargs = {
                'latitude': latitude,
                'longitude': longitude,
                'recorded_at': now,
            }
            if 'faculty' in model_fields:
                hb_kwargs['faculty'] = faculty
            elif 'staff' in model_fields:
                hb_kwargs['staff'] = faculty

            if 'battery_level' in model_fields and battery_level is not None:
                hb_kwargs['battery_level'] = battery_level
            if 'is_inside_geofence' in model_fields:
                hb_kwargs['is_inside_geofence'] = is_inside
            if 'accuracy' in model_fields and accuracy is not None:
                hb_kwargs['accuracy'] = accuracy
            elif 'accuracy_meters' in model_fields and accuracy is not None:
                hb_kwargs['accuracy_meters'] = accuracy
            if 'is_mock_location' in model_fields:
                hb_kwargs['is_mock_location'] = False
            if 'ip_address' in model_fields and client_ip:
                hb_kwargs['ip_address'] = client_ip
            if 'mac_address' in model_fields and device_id:
                hb_kwargs['mac_address'] = device_id
            if 'signal_strength' in model_fields and sig_label:
                hb_kwargs['signal_strength'] = sig_label
            if 'signal_percentage' in model_fields and sig_pct is not None:
                hb_kwargs['signal_percentage'] = sig_pct

            target_hb = FacultyHeartbeat.objects.create(**hb_kwargs)

        if client_ip:
            cache.set(f"faculty_last_ip_{faculty.id}", client_ip, 86400)
        if device_id:
            cache.set(f"faculty_last_mac_{faculty.id}", device_id, 86400)

        cache.set(f"hb_meta_{target_hb.id}", {
            'ip': client_ip,
            'mac': device_id,
            'sig_label': sig_label,
            'sig_pct': sig_pct,
        }, 86400)

        return Response({
            'success': True,
            'status': status_result,
            'distance': distance_display,
            'verified_inside': is_inside,
            'device_paired': faculty.device_model or device_model,
            'recorded_at': local_now.strftime('%I:%M:%S %p'),
            'ip_recorded': client_ip,
        }, status=status.HTTP_200_OK)


class GeofenceAuditHistoryAPIView(APIView):
    """Permanent database audit trail of GPS heartbeats with local 12-hour format."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        config = get_real_school_config()
        campus_lat = config['latitude']
        campus_lng = config['longitude']
        radius = config['radius_meters']
        is_configured = config['is_configured']

        user_role = 'FACULTY'
        if hasattr(user, 'profile') and getattr(user.profile, 'role', None):
            user_role = str(user.profile.role).upper()
        elif user.is_superuser or user.is_staff:
            user_role = 'ADMIN'

        is_admin = user_role in ['ADMIN', 'PRINCIPAL', 'SUPERUSER'] or user.is_superuser

        search_query = request.query_params.get('search', '').strip()
        faculty_id_param = request.query_params.get('faculty_id')
        date_from_param = request.query_params.get('date_from', '').strip()
        date_to_param = request.query_params.get('date_to', '').strip()
        status_filter = request.query_params.get('status', 'ALL').upper()

        heartbeats = FacultyHeartbeat.objects.select_related('faculty').order_by('-recorded_at')

        if not is_admin:
            faculty_obj = resolve_faculty_from_user(user)
            if faculty_obj:
                heartbeats = heartbeats.filter(faculty=faculty_obj)
            else:
                return Response({'total_heartbeats': 0, 'records': []}, status=status.HTTP_200_OK)
        elif faculty_id_param and faculty_id_param != 'ALL' and faculty_id_param.isdigit():
            heartbeats = heartbeats.filter(faculty_id=int(faculty_id_param))

        if search_query:
            heartbeats = heartbeats.filter(
                Q(faculty__first_name__icontains=search_query) |
                Q(faculty__last_name__icontains=search_query) |
                Q(faculty__employee_id__icontains=search_query)
            )

        if date_from_param and date_from_param.upper() != 'ALL':
            try:
                d_from = datetime.strptime(date_from_param, '%Y-%m-%d').date()
                if date_to_param:
                    d_to = datetime.strptime(date_to_param, '%Y-%m-%d').date()
                    heartbeats = heartbeats.filter(recorded_at__date__gte=d_from, recorded_at__date__lte=d_to)
                else:
                    heartbeats = heartbeats.filter(recorded_at__date=d_from)
            except ValueError:
                pass

        # 1. Total records count in database before slicing
        total_records_count = heartbeats.count()

        # 2. Slice to latest 1000 records for responsive UI rendering
        heartbeats_subset = list(heartbeats[:1000])

        audit_records = []
        loafing_count = 0
        inside_count = 0

        for hb in heartbeats_subset:
            lat = float(hb.latitude)
            lng = float(hb.longitude)

            if is_configured and campus_lat is not None and campus_lng is not None and radius is not None:
                dist = calculate_haversine_distance(campus_lat, campus_lng, lat, lng)
                is_inside = dist <= radius
                dist_str = f"{round(dist)}m" if dist < 1000 else f"{(dist / 1000.0):.2f} km"
            else:
                dist = None
                is_inside = False
                dist_str = None

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

            hb_cached = cache.get(f"hb_meta_{hb.id}") or {}
            ip_val = getattr(hb, 'ip_address', None) or hb_cached.get('ip') or cache.get(f"faculty_last_ip_{hb.faculty_id}")
            mac_val = (
                getattr(hb, 'mac_address', None)
                or getattr(hb.faculty, 'bound_device_id', None)
                or hb_cached.get('mac')
                or cache.get(f"faculty_last_mac_{hb.faculty_id}")
            )

            acc = getattr(hb, 'accuracy', None) or getattr(hb, 'accuracy_meters', None)
            sig_label, sig_pct = evaluate_real_signal(acc)

            local_dt = timezone.localtime(hb.recorded_at)

            audit_records.append({
                'id': hb.id,
                'faculty_id': hb.faculty.id,
                'faculty_name': hb.faculty.full_name,
                'employee_id': hb.faculty.employee_id,
                'timestamp': local_dt.strftime('%Y-%m-%d %I:%M:%S %p'),
                'time_only': local_dt.strftime('%I:%M:%S %p'),
                'date_only': local_dt.strftime('%Y-%m-%d'),
                'latitude': lat,
                'longitude': lng,
                'distance': dist_str,
                'distance_meters': dist,
                'verdict': verdict,
                'is_inside': is_inside,
                'signal_strength': getattr(hb, 'signal_strength', None) or hb_cached.get('sig_label') or (sig_label if (timezone.now() - hb.recorded_at).total_seconds() <= ONLINE_THRESHOLD_SECONDS else None),
                'signal_percentage': getattr(hb, 'signal_percentage', None) or hb_cached.get('sig_pct') or (sig_pct if (timezone.now() - hb.recorded_at).total_seconds() <= ONLINE_THRESHOLD_SECONDS else None),
                'ip_address': ip_val,
                'mac_address': mac_val,
                'battery': f"{hb.battery_level}%" if hb.battery_level is not None else None,
                'device_model': getattr(hb.faculty, 'device_model', None),
                'bound_device_id': getattr(hb.faculty, 'bound_device_id', None),
            })

        return Response({
            'total_heartbeats': total_records_count,
            'loafing_incidents': loafing_count,
            'inside_verifications': inside_count,
            'is_admin': is_admin,
            'records': audit_records,
        }, status=status.HTTP_200_OK)


class FacultyDeviceResetAPIView(APIView):
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

        cache.delete(f"faculty_last_mac_{faculty.id}")

        return Response({
            'success': True,
            'message': f"Device lock for {faculty.full_name} has been cleared in database."
        }, status=status.HTTP_200_OK)