"""
AttendSure V3 - School Settings, Calendar Status, Database Health & Cache Maintenance
File: backend/apps/api/views/utils.py
"""

import time
from django.core.cache import cache
from django.db import connection, transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear, AuditLog, GeofenceSetting, SchoolProfile
from apps.api.serializers import SchoolProfileSerializer
from .common import IsAcademicManagerPermission, get_client_ip, get_school_metadata, is_leadership_role


class SchoolSettingsAPIView(APIView):
    """Reads and updates school profile and campus GPS boundary settings."""
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_or_create_school(self):
        school = SchoolProfile.objects.select_related('principal_faculty').first()
        if not school:
            ay = AcademicYear.objects.filter(is_active=True).first()
            school = SchoolProfile.objects.create(
                school_id='304145',
                school_name='Macasandig National High School',
                region='Region X',
                division='Cagayan de Oro City',
                district='District II',
                academic_year=ay.code if ay else '2026-2027',
                address='Macasandig, Cagayan de Oro City',
                latitude=8.4632000,
                longitude=124.6428000,
                geofence_radius_meters=150,
            )
        return school

    def get(self, request):
        school = self._get_or_create_school()
        serializer = SchoolProfileSerializer(school, context={'request': request})
        data = dict(serializer.data)
        meta = get_school_metadata(request)
        data.update({
            'left_logo': meta['left_logo'],
            'right_logo': meta['right_logo'],
            'school_logo': meta['school_logo'],
            'school_head': meta['school_head'],
        })
        return Response(data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        return self._update_school(request)

    @transaction.atomic
    def put(self, request):
        return self._update_school(request)

    @transaction.atomic
    def patch(self, request):
        return self._update_school(request)

    def _update_school(self, request):
        school = self._get_or_create_school()
        serializer = SchoolProfileSerializer(
            school,
            data=request.data,
            partial=True,
            context={'request': request},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        updated_school = serializer.save()

        if updated_school.latitude is not None and updated_school.longitude is not None:
            GeofenceSetting.objects.update_or_create(
                is_active=True,
                defaults={
                    'name': f'{updated_school.school_name} Boundary',
                    'latitude': updated_school.latitude,
                    'longitude': updated_school.longitude,
                    'radius_meters': updated_school.geofence_radius_meters or 150,
                },
            )

        AuditLog.objects.create(
            table_name='attendsure_school_profile',
            record_id=updated_school.id,
            action='UPDATE',
            performed_by=request.user if request.user.is_authenticated else None,
            client_ip=get_client_ip(request),
            user_agent=str(request.META.get('HTTP_USER_AGENT', ''))[:255],
        )
        cache.clear()
        return self.get(request)


class CalendarExceptionAPIView(APIView):
    """Returns current school calendar day status."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        is_weekend = today.weekday() >= 5
        ay = AcademicYear.objects.filter(is_active=True).first()
        return Response({
            'date': today.strftime('%Y-%m-%d'),
            'weekday': today.strftime('%A'),
            'is_school_day': not is_weekend,
            'is_holiday': False,
            'academic_year': ay.code if ay else '2026-2027',
            'status': 'WEEKEND' if is_weekend else 'REGULAR_CLASSES',
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def db_check(request):
    """Verifies live PostgreSQL connection and response latency."""
    t0 = time.perf_counter()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return Response({
            'db': True,
            'status': 'CONNECTED',
            'latency_ms': latency_ms,
        }, status=status.HTTP_200_OK)
    except Exception as exc:
        return Response({
            'db': False,
            'status': 'ERROR',
            'error': str(exc),
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def flush_cache(request):
    """Clears server cache for school leadership and administrators."""
    if not (request.user.is_superuser or is_leadership_role(request.user)):
        return Response(
            {'error': 'Only school administrators can flush the server cache.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    cache.clear()
    return Response({
        'success': True,
        'message': 'Server cache cleared.',
    }, status=status.HTTP_200_OK)