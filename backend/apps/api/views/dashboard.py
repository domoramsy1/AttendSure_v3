"""
AttendSure V3 - Live Classroom & Mobile App Dashboard API (No Hardware / No push)
File: backend/apps/api/views/dashboard.py
"""

import time as time_module
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from apps.academics.models import (
    AppNotification,
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    FacultyProfile,
    Student,
    SubjectAttendanceLog,
    UserProfile,
)
from .common import (
    get_user_role,
    is_regular_faculty,
    resolve_faculty_for_user,
    get_faculty_student_ids,
    format_full_student_name,
    format_deduped_section_label,
    safe_photo_url,
)


class DashboardOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query_start = time_module.perf_counter()
        user_role = get_user_role(request.user)
        is_faculty_only = is_regular_faculty(user_role) and not request.user.is_superuser

        cache_key = f"dashboard_overview_faculty_{request.user.id}" if is_faculty_only else "dashboard_overview_admin"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            cached_data['analytics']['average_latency_ms'] = max(1, round((time_module.perf_counter() - query_start) * 1000))
            return Response(cached_data, status=200)

        today = timezone.localdate()
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        if is_faculty_only:
            user_faculty = resolve_faculty_for_user(request.user)
            assigned_student_ids = get_faculty_student_ids(user_faculty)
            total_students = len(assigned_student_ids)

            present_ids = set(
                DailyAttendanceSummary.objects.filter(
                    attendance_date=today,
                    student_id__in=assigned_student_ids,
                    status__in=['PRESENT', 'LATE'],
                ).values_list('student_id', flat=True)
            )
            cutting_count = DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                student_id__in=assigned_student_ids,
                status='CUTTING',
            ).count()

            recent_logs = (
                SubjectAttendanceLog.objects.filter(
                    attendance_date=today,
                    student_id__in=assigned_student_ids,
                )
                .select_related('student', 'schedule__subject')
                .order_by('-scanned_at')[:6]
            )
            total_faculty = 1
            present_faculty = 1 if (user_faculty and FacultyHeartbeat.objects.filter(
                faculty=user_faculty,
                recorded_at__gte=today_start,
                is_inside_geofence=True,
            ).exists()) else 0
            push_alerts_today = AppNotification.objects.filter(
                student_id__in=assigned_student_ids,
                created_at__gte=today_start,
                created_at__lte=today_end,
            ).count()
            mobile_parents_count = Student.objects.filter(
                id__in=assigned_student_ids,
                parent_user__isnull=False,
            ).values('parent_user_id').distinct().count()
        else:
            total_students = Student.objects.filter(is_active=True).count()
            present_ids = set(
                DailyAttendanceSummary.objects.filter(
                    attendance_date=today,
                    status__in=['PRESENT', 'LATE'],
                ).values_list('student_id', flat=True)
            )
            cutting_count = DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                status='CUTTING',
            ).count()

            total_faculty = FacultyProfile.objects.filter(is_active=True).count()
            present_faculty = FacultyHeartbeat.objects.filter(
                recorded_at__gte=today_start,
                is_inside_geofence=True,
            ).values('faculty_id').distinct().count()

            recent_logs = (
                SubjectAttendanceLog.objects.filter(attendance_date=today)
                .select_related('student', 'schedule__subject')
                .order_by('-scanned_at')[:6]
            )
            push_alerts_today = AppNotification.objects.filter(
                created_at__gte=today_start,
                created_at__lte=today_end,
            ).count()
            mobile_parents_count = UserProfile.objects.filter(
                role='PARENT',
                user__is_active=True,
            ).count()

        students_present = len(present_ids)
        absent_students = max(0, total_students - students_present)
        attendance_rate = round((students_present / total_students * 100), 1) if total_students > 0 else 0.0

        hour_counts = {h: 0 for h in range(6, 18)}
        for scan_dt in SubjectAttendanceLog.objects.filter(attendance_date=today).values_list('scanned_at', flat=True):
            if scan_dt:
                local_h = timezone.localtime(scan_dt).hour
                if local_h in hour_counts:
                    hour_counts[local_h] += 1

        max_hour = max(hour_counts.values() or [1])
        hourly_scans = [
            {
                'hour': f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}",
                'count': count,
                'height': round((count / max_hour * 100)) if max_hour else 0,
                'is_peak': count == max_hour and count > 0,
            }
            for h, count in hour_counts.items()
        ]

        recent_student_ids = [l.student_id for l in recent_logs]
        enrollments_map = {
            enr.student_id: enr
            for enr in Enrollment.objects.filter(
                student_id__in=recent_student_ids,
                status='ENROLLED',
            ).select_related('section', 'section__grade_level')
        }

        recent_scans_data = []
        for log in recent_logs:
            enr = enrollments_map.get(log.student_id)
            grade_code = enr.section.grade_level.code if (enr and enr.section and enr.section.grade_level) else ""
            section_name = enr.section.name if (enr and enr.section) else ""
            subject_code = log.schedule.subject.code if (log.schedule and log.schedule.subject) else "CLASS"

            recent_scans_data.append({
                'id': log.id,
                'person_name': format_full_student_name(log.student),
                'photo_url': safe_photo_url(log.student.photo, request),
                'status': log.status,
                'subject_code': subject_code,
                'grade_section': format_deduped_section_label(grade_code, section_name),
                'scan_time': timezone.localtime(log.scanned_at).strftime('%I:%M:%S %p') if log.scanned_at else '',
            })

        latency_ms = max(1, round((time_module.perf_counter() - query_start) * 1000))

        response_data = {
            'total_students': total_students,
            'students_present': students_present,
            'students_on_campus': students_present,
            'students_absent': absent_students,
            'students_cutting': cutting_count,
            'attendance_rate': attendance_rate,
            'faculty_on_duty': present_faculty,
            'total_faculty': total_faculty,
            'classroom_scans_today': sum(hour_counts.values()),
            'push_alerts_today': push_alerts_today,
            'mobile_parents_connected': mobile_parents_count,
            'hourly_scans': hourly_scans,
            'recent_scans': recent_scans_data,
            'analytics': {'average_latency_ms': latency_ms},
            'database': {'status': 'CONNECTED', 'database_name': settings.DATABASES['default']['NAME']},
        }

        cache.set(cache_key, response_data, timeout=15)
        return Response(response_data, status=200)