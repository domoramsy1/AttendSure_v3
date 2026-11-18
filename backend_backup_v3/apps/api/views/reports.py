"""
AttendSure - DepEd SF1, SF2, SF4, Faculty DTR & Audit Report Views (Batch Optimized)
File: backend/apps/api/views/reports.py
"""

import calendar
from datetime import date
from django.db.models import Count
from django.shortcuts import render
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    AuditLog,
    FacultyHeartbeat,
    FacultyMonthlyDTR,
    FacultyProfile,
    Section,
)
from apps.academics.services.sf1_service import get_sf1_data
from apps.academics.services.sf2_service import generate_sf2_data
from apps.academics.services.sf4_service import generate_sf4_data
from .common import (
    get_faculty_section_ids,
    get_school_metadata,
    is_leadership_role,
    resolve_faculty_for_user,
)


class IsLeadershipOrAssignedFaculty(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return bool(
            request.user.is_superuser
            or is_leadership_role(request.user)
            or resolve_faculty_for_user(request.user)
        )


class IsLeadershipOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_superuser or is_leadership_role(request.user))
        )


class DepEdSF1DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrAssignedFaculty]

    def get(self, request, section_id=None):
        raw_section_id = section_id or request.query_params.get('section_id')
        if not raw_section_id or not str(raw_section_id).isdigit():
            return Response({'error': 'Valid section_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        sec_id = int(raw_section_id)
        if not (request.user.is_superuser or is_leadership_role(request.user)):
            fac = resolve_faculty_for_user(request.user)
            if not fac or sec_id not in get_faculty_section_ids(fac):
                return Response({'error': 'You do not have access to this section.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            data = get_sf1_data(sec_id, school_year=request.query_params.get('school_year'))
            return Response(data, status=status.HTTP_200_OK)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)


class DepEdSF2DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrAssignedFaculty]

    def get(self, request, section_id=None):
        raw_section_id = section_id or request.query_params.get('section_id')
        if not raw_section_id or not str(raw_section_id).isdigit():
            return Response({'error': 'Valid section_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        sec_id = int(raw_section_id)
        if not (request.user.is_superuser or is_leadership_role(request.user)):
            fac = resolve_faculty_for_user(request.user)
            if not fac or sec_id not in get_faculty_section_ids(fac):
                return Response({'error': 'You do not have access to this section.'}, status=status.HTTP_403_FORBIDDEN)

        month = request.query_params.get('month', 'October')
        year = request.query_params.get('year', timezone.localdate().year)
        try:
            data = generate_sf2_data(sec_id, month_name=month, year=int(year))
            return Response(data, status=status.HTTP_200_OK)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_404_NOT_FOUND)


class DepEdSF4DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOnly]

    def get(self, request):
        month = request.query_params.get('month', 'October')
        year = request.query_params.get('year', timezone.localdate().year)
        school_year = request.query_params.get('school_year', '')
        data = generate_sf4_data(month_name=month, year=int(year), school_year=school_year)
        return Response(data, status=status.HTTP_200_OK)


class DTRListAPIView(APIView):
    """Generates faculty monthly DTR records from mobile GPS campus check-ins using batch queries."""
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrAssignedFaculty]

    def _build_daily_logs(self, fac, year: int, month: int):
        _, num_days = calendar.monthrange(year, month)
        heartbeats = FacultyHeartbeat.objects.filter(
            faculty=fac,
            recorded_at__year=year,
            recorded_at__month=month,
            is_inside_geofence=True,
        ).order_by('recorded_at')

        pings_by_day = {}
        for hb in heartbeats:
            local_dt = timezone.localtime(hb.recorded_at)
            pings_by_day.setdefault(local_dt.day, []).append(local_dt)

        days = []
        for day_num in range(1, num_days + 1):
            dt_obj = date(year, month, day_num)
            day_pings = pings_by_day.get(day_num, [])
            am_in = day_pings[0].strftime('%I:%M %p') if day_pings else ''
            pm_out = day_pings[-1].strftime('%I:%M %p') if len(day_pings) > 1 else ''
            days.append({
                'day': day_num,
                'date': dt_obj.strftime('%Y-%m-%d'),
                'weekday': dt_obj.strftime('%a'),
                'am_arrival': am_in,
                'am_departure': '12:00 PM' if am_in else '',
                'pm_arrival': '01:00 PM' if pm_out else '',
                'pm_departure': pm_out,
                'status': 'PRESENT' if day_pings else ('WEEKEND' if dt_obj.weekday() >= 5 else 'NO_LOG'),
            })
        return days

    def get(self, request, faculty_id=None):
        user = request.user
        month = int(request.query_params.get('month', timezone.localdate().month))
        year = int(request.query_params.get('year', timezone.localdate().year))
        target_fac_id = faculty_id or request.query_params.get('faculty_id')

        is_leader = bool(user.is_superuser or is_leadership_role(user))
        own_fac = resolve_faculty_for_user(user)

        if target_fac_id and str(target_fac_id).isdigit():
            fac_pk = int(target_fac_id)
            if not is_leader and (not own_fac or own_fac.id != fac_pk):
                return Response({'error': 'You can only view your own DTR record.'}, status=status.HTTP_403_FORBIDDEN)
            fac = FacultyProfile.objects.filter(id=fac_pk).first()
            if not fac:
                return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

            dtr_obj, _ = FacultyMonthlyDTR.objects.get_or_create(faculty=fac, month=month, year=year)
            daily_logs = self._build_daily_logs(fac, year, month)
            days_present = sum(1 for d in daily_logs if d['status'] == 'PRESENT')

            return Response({
                'id': dtr_obj.id,
                'faculty_id': fac.id,
                'employee_id': fac.employee_id,
                'faculty_name': fac.full_name,
                'position': fac.position,
                'department': fac.department,
                'month': month,
                'year': year,
                'days_present': days_present,
                'is_submitted': dtr_obj.is_submitted,
                'is_dept_head_approved': dtr_obj.is_dept_head_approved,
                'regular_hours': dtr_obj.regular_hours,
                'saturday_hours': dtr_obj.saturday_hours,
                'daily_logs': daily_logs,
                'school': get_school_metadata(request),
            }, status=status.HTTP_200_OK)

        if is_leader:
            faculty_list = list(FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name'))
        else:
            faculty_list = [own_fac] if own_fac else []

        fac_ids = [f.id for f in faculty_list]
        existing_dtrs = {
            d.faculty_id: d
            for d in FacultyMonthlyDTR.objects.filter(faculty_id__in=fac_ids, month=month, year=year)
        }
        missing_dtrs = [
            FacultyMonthlyDTR(faculty_id=f.id, month=month, year=year)
            for f in faculty_list if f.id not in existing_dtrs
        ]
        if missing_dtrs:
            FacultyMonthlyDTR.objects.bulk_create(missing_dtrs, ignore_conflicts=True)
            existing_dtrs = {
                d.faculty_id: d
                for d in FacultyMonthlyDTR.objects.filter(faculty_id__in=fac_ids, month=month, year=year)
            }

        present_counts = dict(
            FacultyHeartbeat.objects.filter(
                faculty_id__in=fac_ids,
                recorded_at__year=year,
                recorded_at__month=month,
                is_inside_geofence=True,
            )
            .values('faculty_id')
            .annotate(days=Count('recorded_at__date', distinct=True))
            .values_list('faculty_id', 'days')
        )

        dtr_records = []
        for fac in faculty_list:
            dtr_obj = existing_dtrs.get(fac.id)
            dtr_records.append({
                'id': dtr_obj.id if dtr_obj else fac.id,
                'faculty_id': fac.id,
                'employee_id': fac.employee_id,
                'faculty_name': fac.full_name,
                'position': fac.position,
                'department': fac.department,
                'month': month,
                'year': year,
                'days_present': present_counts.get(fac.id, 0),
                'is_submitted': bool(dtr_obj and dtr_obj.is_submitted),
                'is_dept_head_approved': bool(dtr_obj and dtr_obj.is_dept_head_approved),
            })

        return Response({'month': month, 'year': year, 'records': dtr_records}, status=status.HTTP_200_OK)


class UnifiedReportExportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrAssignedFaculty]

    def get(self, request):
        form_type = str(request.query_params.get('form', 'SF2')).upper()
        section_id = request.query_params.get('section_id')
        month = request.query_params.get('month', 'October')
        year = int(request.query_params.get('year', timezone.localdate().year))

        if form_type == 'SF1' and section_id and str(section_id).isdigit():
            return Response(get_sf1_data(int(section_id)), status=status.HTTP_200_OK)
        if form_type == 'SF4':
            return Response(generate_sf4_data(month_name=month, year=year), status=status.HTTP_200_OK)
        if section_id and str(section_id).isdigit():
            return Response(generate_sf2_data(int(section_id), month_name=month, year=year), status=status.HTTP_200_OK)
        return Response({'error': 'Valid section_id is required for SF1/SF2.'}, status=status.HTTP_400_BAD_REQUEST)


class UnifiedReportPrintAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrAssignedFaculty]

    def get(self, request):
        section_id = request.query_params.get('section_id')
        if not section_id or not str(section_id).isdigit():
            return Response({'error': 'Valid section_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').filter(id=int(section_id)).first()
        if not section:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)
        return render(request, 'reports/sf1_template.html', {
            'school': get_school_metadata(request),
            'section': section,
        })


class ReportAuditLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOnly]

    def get(self, request):
        logs = AuditLog.objects.select_related('performed_by').order_by('-created_at')[:100]
        return Response({
            'results': [
                {
                    'id': item.id,
                    'table_name': item.table_name,
                    'record_id': item.record_id,
                    'user': item.performed_by.username if item.performed_by else 'System',
                    'created_at': timezone.localtime(item.created_at).strftime('%Y-%m-%d %I:%M %p'),
                }
                for item in logs
            ]
        }, status=status.HTTP_200_OK)