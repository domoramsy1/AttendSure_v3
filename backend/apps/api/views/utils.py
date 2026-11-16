"""
AttendSure V3 - School Settings, Database Health & System Status Views
File: backend/apps/api/views/utils.py
"""

import inspect
import time
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    AppNotification,
    FacultyHeartbeat,
    FacultyProfile,
    GeofenceSetting,
    SchoolProfile,
    Student,
)
from apps.api.serializers import SchoolProfileSerializer
from .common import (
    IsAcademicManagerPermission,
    IsSystemAdminRole,
    get_school_metadata,
    is_leadership_role,
)
from .reports import DTRListAPIView, DepEdSF1DataAPIView, DepEdSF2DataAPIView


class PathParamReportMixin:
    """
    Allows report views to accept IDs either in the URL path (/api/reports/sf1/24/)
    or in query parameters (?section_id=24 or ?faculty_id=19).
    """
    param_keys = ('id', 'pk', 'section_id', 'section', 'faculty_id', 'faculty')

    def dispatch(self, request, *args, **kwargs):
        pk_val = (
            kwargs.get('pk')
            or kwargs.get('section_id')
            or kwargs.get('faculty_id')
        )
        if pk_val is not None:
            query_copy = request.GET.copy()
            for key in self.param_keys:
                query_copy.setdefault(key, str(pk_val))
            request.GET = query_copy
            request.META['QUERY_STRING'] = query_copy.urlencode()

            handler = getattr(self, request.method.lower(), None)
            if handler:
                sig = inspect.signature(handler)
                accepts_var_kw = any(
                    p.kind == inspect.Parameter.VAR_KEYWORD
                    for p in sig.parameters.values()
                )
                if not accepts_var_kw:
                    for k in list(kwargs.keys()):
                        if k not in sig.parameters:
                            kwargs.pop(k, None)

        return super().dispatch(request, *args, **kwargs)


class FlexibleDTRReportAPIView(PathParamReportMixin, DTRListAPIView):
    pass


class FlexibleSF1ReportAPIView(PathParamReportMixin, DepEdSF1DataAPIView):
    pass


class FlexibleSF2ReportAPIView(PathParamReportMixin, DepEdSF2DataAPIView):
    pass


class UnifiedGeofenceRootAPIView(APIView):
    """
    Handles /api/geofence/ requests for reading and updating campus GPS boundary
    settings and viewing active faculty GPS check-ins.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        geofence = GeofenceSetting.objects.filter(is_active=True).first() or GeofenceSetting.objects.first()

        lat = float(geofence.latitude) if (geofence and geofence.latitude is not None) else (
            float(school.latitude) if (school and school.latitude is not None) else 8.4858
        )
        lon = float(geofence.longitude) if (geofence and geofence.longitude is not None) else (
            float(school.longitude) if (school and school.longitude is not None) else 124.6567
        )
        radius = int(geofence.radius_meters) if (geofence and geofence.radius_meters) else (
            int(school.geofence_radius_meters) if (school and school.geofence_radius_meters) else 150
        )

        today = timezone.localdate()
        heartbeats = (
            FacultyHeartbeat.objects.filter(recorded_at__date=today)
            .select_related('faculty')
            .order_by('-recorded_at')[:100]
        )

        logs = [
            {
                'id': hb.id,
                'faculty_id': hb.faculty_id,
                'faculty_name': hb.faculty.full_name if hb.faculty else '',
                'employee_id': hb.faculty.employee_id if hb.faculty else '',
                'latitude': float(hb.latitude),
                'longitude': float(hb.longitude),
                'battery_level': hb.battery_level,
                'is_inside_geofence': hb.is_inside_geofence,
                'status': 'INSIDE' if hb.is_inside_geofence else 'OUTSIDE',
                'recorded_at': timezone.localtime(hb.recorded_at).strftime('%I:%M:%S %p'),
            }
            for hb in heartbeats
        ]

        return Response({
            'id': geofence.id if geofence else 1,
            'name': geofence.name if geofence else 'Campus Boundary',
            'latitude': lat,
            'longitude': lon,
            'radius_meters': radius,
            'geofence_radius_meters': radius,
            'is_active': True,
            'inside_count': sum(1 for item in logs if item['is_inside_geofence']),
            'outside_count': sum(1 for item in logs if not item['is_inside_geofence']),
            'heartbeats': logs,
            'logs': logs,
            'results': logs,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        return self.put(request)

    def put(self, request):
        if not (request.user.is_superuser or is_leadership_role(request.user)):
            return Response(
                {'error': 'Only school leadership can update campus GPS boundaries.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        lat = request.data.get('latitude')
        lon = request.data.get('longitude')
        radius = (
            request.data.get('radius_meters')
            or request.data.get('geofence_radius_meters')
            or request.data.get('radius')
        )
        name = str(request.data.get('name') or 'Campus Boundary').strip()

        geofence = GeofenceSetting.objects.filter(is_active=True).first() or GeofenceSetting.objects.first()
        if not geofence:
            geofence = GeofenceSetting(name=name, is_active=True)

        if lat is not None:
            geofence.latitude = lat
        if lon is not None:
            geofence.longitude = lon
        if radius is not None:
            geofence.radius_meters = int(float(radius))
        geofence.name = name
        geofence.is_active = True
        geofence.save()

        school = SchoolProfile.objects.first()
        if school:
            if lat is not None:
                school.latitude = lat
            if lon is not None:
                school.longitude = lon
            if radius is not None:
                school.geofence_radius_meters = int(float(radius))
            school.save()

        cache.clear()
        return self.get(request)

    def patch(self, request):
        return self.put(request)


class SchoolSettingsAPIView(APIView):
    """Full CRUD for the institutional SchoolProfile record."""
    permission_classes = [permissions.IsAuthenticated, IsAcademicManagerPermission]

    def get(self, request):
        school = SchoolProfile.objects.select_related('principal_faculty').first()
        if not school:
            return Response(get_school_metadata(request), status=status.HTTP_200_OK)

        serializer = SchoolProfileSerializer(school, context={'request': request})
        data = dict(serializer.data)
        data.update(get_school_metadata(request))
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        return self.put(request)

    def put(self, request):
        school = SchoolProfile.objects.first()
        if school:
            serializer = SchoolProfileSerializer(
                school, data=request.data, partial=True, context={'request': request}
            )
        else:
            payload = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            payload.setdefault('school_id', '000000')
            payload.setdefault('school_name', 'AttendSure School')
            serializer = SchoolProfileSerializer(data=payload, context={'request': request})

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        saved_school = serializer.save()
        cache.clear()
        out = dict(SchoolProfileSerializer(saved_school, context={'request': request}).data)
        out.update(get_school_metadata(request))
        return Response(out, status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        school = SchoolProfile.objects.first()
        if not school:
            return Response({'success': True}, status=status.HTTP_200_OK)

        target_field = request.query_params.get('field') or request.data.get('field')
        if target_field in ('school_logo', 'left_logo', 'right_logo'):
            setattr(school, target_field, None)
            school.save(update_fields=[target_field, 'updated_at'])
            cache.clear()
            out = dict(SchoolProfileSerializer(school, context={'request': request}).data)
            out.update(get_school_metadata(request))
            return Response(out, status=status.HTTP_200_OK)

        return Response({'error': 'Specify a valid logo field to remove.'}, status=status.HTTP_400_BAD_REQUEST)


class CalendarExceptionAPIView(APIView):
    """Full CRUD for non-school days and holiday dates."""
    permission_classes = [permissions.IsAuthenticated]
    CACHE_KEY = 'attendsure_calendar_exceptions'

    def get(self, request):
        items = cache.get(self.CACHE_KEY, [])
        return Response({'exceptions': items, 'results': items}, status=status.HTTP_200_OK)

    def post(self, request):
        if not (request.user.is_superuser or is_leadership_role(request.user)):
            return Response(
                {'error': 'Only school leadership can manage calendar exceptions.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        date_val = str(request.data.get('date', '')).strip()
        title = str(request.data.get('title') or request.data.get('reason') or 'School Holiday').strip()
        if not date_val:
            return Response(
                {'error': 'Date is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items = [i for i in cache.get(self.CACHE_KEY, []) if i.get('date') != date_val]
        items.append({'id': len(items) + 1, 'date': date_val, 'title': title})
        cache.set(self.CACHE_KEY, items, timeout=None)
        return Response({'success': True, 'exceptions': items, 'results': items}, status=status.HTTP_201_CREATED)

    def put(self, request):
        return self.post(request)

    def patch(self, request):
        return self.post(request)

    def delete(self, request):
        if not (request.user.is_superuser or is_leadership_role(request.user)):
            return Response(
                {'error': 'Only school leadership can manage calendar exceptions.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        date_val = str(request.data.get('date') or request.query_params.get('date') or '').strip()
        item_id = request.data.get('id') or request.query_params.get('id')
        items = cache.get(self.CACHE_KEY, [])
        if date_val:
            items = [i for i in items if i.get('date') != date_val]
        elif item_id is not None:
            items = [i for i in items if str(i.get('id')) != str(item_id)]
        cache.set(self.CACHE_KEY, items, timeout=None)
        return Response({'success': True, 'exceptions': items, 'results': items}, status=status.HTTP_200_OK)


class SystemStatusAPIView(APIView):
    """Returns real-time status for push notifications, USB QR scanning, and campus GPS."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        school = SchoolProfile.objects.first()
        alerts_today = AppNotification.objects.filter(created_at__date=today).count()
        pushed_today = AppNotification.objects.filter(created_at__date=today, is_pushed=True).count()
        active_students = Student.objects.filter(is_active=True).count()
        active_faculty = FacultyProfile.objects.filter(is_active=True).count()

        return Response({
            'architecture': 'PURE_SOFTWARE',
            'status': 'ONLINE',
            'online_count': 2,
            'total_scanners': 2,
            'sent_today': alerts_today,
            'delivered_today': pushed_today,
            'pending_queue': 0,
            'failed_today': 0,
            'push_alerts_today': alerts_today,
            'push_delivered_today': pushed_today,
            'active_students': active_students,
            'active_faculty': active_faculty,
            'campus_radius_meters': school.geofence_radius_meters if school else 150,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        return self.get(request)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def db_check(request):
    start = time.perf_counter()
    with connection.cursor() as cursor:
        cursor.execute('SELECT 1;')
        cursor.fetchone()
    latency_ms = max(1, round((time.perf_counter() - start) * 1000))
    return Response({
        'status': 'CONNECTED',
        'database': 'CONNECTED',
        'engine': 'PostgreSQL',
        'latency_ms': latency_ms,
    }, status=status.HTTP_200_OK)


@api_view(['POST', 'GET'])
@permission_classes([permissions.IsAuthenticated, IsSystemAdminRole])
def flush_cache(request):
    cache.clear()
    return Response({'success': True, 'message': 'Application cache cleared.'}, status=status.HTTP_200_OK)