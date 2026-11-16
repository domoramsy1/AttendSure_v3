"""
AttendSure V3 - Faculty Mobile Facial Recognition, Campus GPS Check-In & Device Binding
File: backend/apps/api/views/geofence.py
"""

from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    AuditLog,
    FacultyHeartbeat,
    FacultyProfile,
    GeofenceSetting,
    LoafingIncident,
    Schedule,
    SchoolProfile,
)
from apps.api.serializers import FacultyMobileCheckInSerializer
from .common import (
    IsAcademicManagerPermission,
    get_client_ip,
    is_leadership_role,
    resolve_faculty_for_user,
    verify_campus_gps,
)


def _fetch_geofence_payload(request) -> dict:
    """Fetches real campus GPS boundary settings and today's faculty mobile facial check-ins."""
    user = request.user
    today = timezone.localdate()

    geofence = GeofenceSetting.objects.filter(is_active=True).first()
    school = SchoolProfile.objects.first()

    lat = (
        float(geofence.latitude)
        if (geofence and geofence.latitude is not None)
        else (float(school.latitude) if (school and school.latitude is not None) else 8.4858)
    )
    lon = (
        float(geofence.longitude)
        if (geofence and geofence.longitude is not None)
        else (float(school.longitude) if (school and school.longitude is not None) else 124.6567)
    )
    radius = (
        int(geofence.radius_meters)
        if (geofence and geofence.radius_meters)
        else (int(school.geofence_radius_meters) if (school and school.geofence_radius_meters) else 150)
    )
    name = geofence.name if geofence else (school.school_name if school else 'Campus Boundary')

    if user.is_superuser or is_leadership_role(user):
        heartbeats = (
            FacultyHeartbeat.objects.filter(recorded_at__date=today)
            .select_related('faculty')
            .order_by('-recorded_at')[:100]
        )
        loafing = (
            LoafingIncident.objects.filter(incident_date=today)
            .select_related('faculty')
            .order_by('-created_at')
        )
    else:
        faculty = resolve_faculty_for_user(user)
        if not faculty:
            heartbeats, loafing = [], []
        else:
            heartbeats = (
                FacultyHeartbeat.objects.filter(faculty=faculty, recorded_at__date=today)
                .select_related('faculty')
                .order_by('-recorded_at')[:50]
            )
            loafing = (
                LoafingIncident.objects.filter(faculty=faculty, incident_date=today)
                .select_related('faculty')
                .order_by('-created_at')
            )

    return {
        'id': geofence.id if geofence else (school.id if school else 1),
        'name': name,
        'latitude': lat,
        'longitude': lon,
        'radius_meters': radius,
        'geofence_radius_meters': radius,
        'is_active': geofence.is_active if geofence else True,
        'heartbeats': [
            {
                'id': hb.id,
                'faculty_id': hb.faculty_id,
                'faculty_name': hb.faculty.full_name,
                'latitude': float(hb.latitude),
                'longitude': float(hb.longitude),
                'battery_level': hb.battery_level,
                'is_inside_geofence': hb.is_inside_geofence,
                'verification_method': 'MOBILE_FACE_AND_GPS',
                'recorded_at': timezone.localtime(hb.recorded_at).strftime('%I:%M:%S %p'),
            }
            for hb in heartbeats
        ],
        'loafing_incidents': [
            {
                'id': inc.id,
                'faculty_name': inc.faculty.full_name,
                'trigger_reason': inc.trigger_reason,
                'status': inc.status,
                'created_at': timezone.localtime(inc.created_at).strftime('%I:%M %p'),
            }
            for inc in loafing
        ],
    }


class GeofenceManagementAPIView(APIView):
    """Reads and updates campus GPS geofence boundaries from a faculty admin laptop/PC."""
    permission_classes = [permissions.IsAuthenticated, IsAcademicManagerPermission]

    def get(self, request):
        return Response(_fetch_geofence_payload(request), status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        return self._save_geofence(request)

    @transaction.atomic
    def put(self, request):
        return self._save_geofence(request)

    @transaction.atomic
    def patch(self, request):
        return self._save_geofence(request)

    def _save_geofence(self, request):
        data = request.data or {}
        raw_lat = data.get('latitude')
        raw_lon = data.get('longitude')
        raw_rad = data.get('radius_meters') or data.get('geofence_radius_meters')
        name = str(data.get('name', 'Campus Boundary')).strip() or 'Campus Boundary'

        try:
            lat = float(raw_lat)
            lon = float(raw_lon)
            if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 180.0):
                raise ValueError('Out of bounds')
        except (TypeError, ValueError):
            return Response(
                {'error': 'Valid latitude (-90 to 90) and longitude (-180 to 180) are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            radius = int(raw_rad) if raw_rad is not None else 150
            if not (20 <= radius <= 5000):
                return Response(
                    {'error': 'Radius must be between 20 and 5000 meters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except (TypeError, ValueError):
            return Response(
                {'error': 'Radius must be a valid integer in meters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        geofence = GeofenceSetting.objects.filter(is_active=True).first() or GeofenceSetting.objects.first()
        if geofence:
            geofence.name = name
            geofence.latitude = lat
            geofence.longitude = lon
            geofence.radius_meters = radius
            geofence.is_active = bool(data.get('is_active', True))
            geofence.save()
        else:
            geofence = GeofenceSetting.objects.create(
                name=name,
                latitude=lat,
                longitude=lon,
                radius_meters=radius,
                is_active=True,
            )

        school = SchoolProfile.objects.first()
        if school:
            school.latitude = lat
            school.longitude = lon
            school.geofence_radius_meters = radius
            school.save(update_fields=['latitude', 'longitude', 'geofence_radius_meters', 'updated_at'])

        AuditLog.objects.create(
            table_name='geofence_settings',
            record_id=geofence.id,
            action='UPDATE',
            new_data={'latitude': lat, 'longitude': lon, 'radius_meters': radius},
            performed_by=request.user,
            client_ip=get_client_ip(request),
            user_agent=str(request.META.get('HTTP_USER_AGENT', ''))[:255],
        )

        return Response(_fetch_geofence_payload(request), status=status.HTTP_200_OK)


class GeofenceStatusAPIView(APIView):
    """Returns current campus GPS status and recent faculty mobile check-ins."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        payload = _fetch_geofence_payload(request)
        return Response({
            'heartbeats': payload['heartbeats'],
            'loafing_incidents': payload['loafing_incidents'],
        }, status=status.HTTP_200_OK)


class GeofenceAuditAPIView(APIView):
    """Returns real GPS check-in logs, loafing incidents, and boundary audit history."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        is_admin = bool(user.is_superuser or is_leadership_role(user))
        payload = _fetch_geofence_payload(request)

        audit_qs = AuditLog.objects.select_related('performed_by').filter(
            table_name__in=['geofence_settings', 'attendsure_school_profile', 'faculty_heartbeats', 'loafing_incidents']
        ).order_by('-created_at')
        if not is_admin:
            audit_qs = audit_qs.filter(performed_by=user)

        audit_entries = []
        for entry in audit_qs[:50]:
            actor = (
                (entry.performed_by.get_full_name() or entry.performed_by.username)
                if entry.performed_by
                else 'System'
            )
            local_dt = timezone.localtime(entry.created_at)
            audit_entries.append({
                'id': entry.id,
                'user': actor,
                'action': entry.action,
                'table_name': entry.table_name,
                'details': f'Boundary configuration {entry.action.lower()} (#{entry.record_id})',
                'ip_address': entry.client_ip or '127.0.0.1',
                'timestamp': local_dt.strftime('%Y-%m-%d %I:%M:%S %p'),
            })

        records = [
            {
                'id': f"hb-{hb['id']}",
                'faculty_id': hb['faculty_id'],
                'faculty_name': hb['faculty_name'],
                'latitude': hb['latitude'],
                'longitude': hb['longitude'],
                'battery_level': hb['battery_level'],
                'is_inside_geofence': hb['is_inside_geofence'],
                'status': 'INSIDE_CAMPUS' if hb['is_inside_geofence'] else 'OUTSIDE_CAMPUS',
                'timestamp': hb['recorded_at'],
            }
            for hb in payload['heartbeats']
        ]

        return Response({
            'success': True,
            'count': len(records),
            'results': records,
            'records': records,
            'heartbeats': payload['heartbeats'],
            'loafing_incidents': payload['loafing_incidents'],
            'audit_logs': audit_entries,
        }, status=status.HTTP_200_OK)


class GeofenceCheckInAPIView(APIView):
    """
    Records a faculty member's attendance via Mobile Facial Recognition + Liveness + Campus GPS,
    enforces 1-to-1 mobile phone binding, and flags missed class scans.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return Response({'error': 'No faculty profile linked to this account.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = FacultyMobileCheckInSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        if data.get('face_verified') is False or data.get('liveness_passed') is False:
            return Response(
                {'error': 'Mobile facial recognition or liveness check failed. Please align your face in good lighting.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        device_id = str(data.get('client_device_id') or request.headers.get('X-Device-UUID') or '').strip()
        if device_id:
            if not faculty.bound_device_id:
                faculty.bound_device_id = device_id
                faculty.device_bound_at = timezone.now()
                faculty.save(update_fields=['bound_device_id', 'device_bound_at'])
            elif faculty.bound_device_id != device_id:
                return Response(
                    {'error': 'This account is bound to another mobile phone. Ask an administrator to reset device binding.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        gps = verify_campus_gps(
            latitude=data['latitude'],
            longitude=data['longitude'],
            accuracy_meters=data.get('accuracy'),
            is_mock_location=data.get('is_mock_location', False),
        )
        if not gps['is_valid']:
            return Response({'error': gps['reason']}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        hb = FacultyHeartbeat.objects.create(
            faculty=faculty,
            latitude=data['latitude'],
            longitude=data['longitude'],
            battery_level=data.get('battery_level', 100),
            is_inside_geofence=gps['is_inside'],
            recorded_at=now,
        )

        if gps['is_inside']:
            local_now = timezone.localtime(now)
            cutoff_time = (local_now - timedelta(minutes=15)).time()
            active_unlogged = Schedule.objects.filter(
                faculty=faculty,
                is_active=True,
                start_time__lte=cutoff_time,
                end_time__gte=local_now.time(),
            ).exclude(attendance_records__attendance_date=local_now.date()).first()

            if active_unlogged:
                LoafingIncident.objects.get_or_create(
                    faculty=faculty,
                    incident_date=local_now.date(),
                    trigger_reason=f'Verified on campus via mobile app but no classroom QR attendance recorded for {active_unlogged.subject.code} within 15 minutes.',
                )

        return Response({
            'success': True,
            'heartbeat_id': hb.id,
            'face_verified': True,
            'is_inside_geofence': gps['is_inside'],
            'distance_meters': gps['distance_meters'],
            'allowed_radius': gps['allowed_radius'],
            'message': f"Facial recognition and GPS verified. {gps['reason']}",
        }, status=status.HTTP_201_CREATED)


class FacultyDeviceResetAPIView(APIView):
    """Allows administrators on a laptop/PC to clear a faculty member's bound mobile phone."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        if not (request.user.is_superuser or is_leadership_role(request.user)):
            return Response({'error': 'Only school administrators can reset device bindings.'}, status=status.HTTP_403_FORBIDDEN)

        faculty_id = pk or request.data.get('faculty_id')
        faculty = FacultyProfile.objects.filter(id=faculty_id).first()
        if not faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        faculty.bound_device_id = None
        faculty.device_model = None
        faculty.device_bound_at = None
        faculty.save(update_fields=['bound_device_id', 'device_model', 'device_bound_at'])

        return Response({'success': True, 'message': f'Device binding cleared for {faculty.full_name}.'}, status=status.HTTP_200_OK)