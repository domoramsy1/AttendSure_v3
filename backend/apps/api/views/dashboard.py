"""
AttendSure V3 - Live Dashboard Overview API
File: backend/apps/api/views/dashboard.py
"""

import time as time_module
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

from apps.academics.models import (
    Student,
    StudentGateLog,
    FacultyProfile,
    FacultyGateLog,
    IoTKiosk,
    Enrollment,
    SmsOutbox,
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

        # 1. User cache key isolation
        cache_key = f"dashboard_overview_teacher_{request.user.id}" if is_faculty_only else "dashboard_overview_admin"

        cached_data = cache.get(cache_key)
        if cached_data is not None:
            cached_data['analytics']['average_latency_ms'] = max(1, round((time_module.perf_counter() - query_start) * 1000))
            return Response(cached_data, status=200)

        # 2. Real-time date boundaries
        today = timezone.localdate()
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        if is_faculty_only:
            user_faculty = resolve_faculty_for_user(request.user)
            assigned_student_ids = get_faculty_student_ids(user_faculty)
            total_students = len(assigned_student_ids)

            gate_logs_today = StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                student_id__in=assigned_student_ids
            ).values('student_id', 'direction')

            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}
            students_on_campus = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0.0

            recent_logs = (
                StudentGateLog.objects.filter(student_id__in=assigned_student_ids)
                .select_related('student')
                .order_by('-scan_time')[:6]
            )

            total_faculty = 1
            present_faculty = 1 if FacultyGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                direction='IN',
                faculty=user_faculty
            ).exists() else 0
            sms_sent, sms_pending, sms_failed = 0, 0, 0
        else:
            total_students = Student.objects.filter(is_active=True).count()

            gate_logs_today = StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end
            ).values('student_id', 'direction')

            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}
            students_on_campus = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0.0

            total_faculty = FacultyProfile.objects.filter(is_active=True).count()
            present_faculty = FacultyGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                direction='IN'
            ).values('faculty_id').distinct().count()

            recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:6]

            sms_sent = SmsOutbox.objects.filter(status='SENT', created_at__gte=today_start, created_at__lte=today_end).count()
            sms_pending = SmsOutbox.objects.filter(status='PENDING').count()
            sms_failed = SmsOutbox.objects.filter(status='FAILED', created_at__gte=today_start, created_at__lte=today_end).count()

        # 3. Database hourly calculation
        hour_counts = {h: 0 for h in range(6, 18)}
        time_scans = StudentGateLog.objects.filter(
            scan_time__gte=today_start,
            scan_time__lte=today_end
        ).values_list('scan_time', flat=True)

        for scan_dt in time_scans:
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

        # 4. Batch query recent enrollments
        recent_student_ids = [l.student_id for l in recent_logs]
        enrollments_map = {}
        if recent_student_ids:
            active_enrollments = Enrollment.objects.filter(
                student_id__in=recent_student_ids,
                status='ENROLLED'
            ).select_related('section', 'section__grade_level')
            for enr in active_enrollments:
                enrollments_map[enr.student_id] = enr

        recent_scans_data = []
        for log in recent_logs:
            enr = enrollments_map.get(log.student_id)
            grade_code = enr.section.grade_level.code if (enr and enr.section and enr.section.grade_level) else ""
            section_name = enr.section.name if (enr and enr.section) else ""
            section_label = format_deduped_section_label(grade_code, section_name)

            recent_scans_data.append({
                'id': log.id,
                'person_name': format_full_student_name(log.student),
                'photo_url': safe_photo_url(log.student.photo, request),
                'direction': log.direction,
                'grade_section': section_label,
                'scan_time': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'scan_method': log.scan_method,
            })

        # 5. Query real announcements directly from database (Empty list if none exist)
        bulletins_data = []
        try:
            from apps.academics.models import Announcement
            active_announcements = Announcement.objects.filter(is_active=True).order_by('-created_at')[:4]
            for item in active_announcements:
                bulletins_data.append({
                    'id': item.id,
                    'title': item.title,
                    'category': getattr(item, 'category', 'Notice'),
                    'date': timezone.localtime(item.created_at).strftime('%b %d, %Y'),
                    'details': getattr(item, 'content', getattr(item, 'message', '')),
                })
        except Exception:
            bulletins_data = []

        # 6. Query real academic calendar dates from database (Empty list if none exist)
        events_data = []
        try:
            from apps.academics.models import AcademicCalendarEvent
            calendar_events = AcademicCalendarEvent.objects.filter(
                event_date__gte=today,
                event_date__lte=today + timedelta(days=60)
            ).order_by('event_date')[:6]
            for ev in calendar_events:
                events_data.append({
                    'date': ev.event_date.strftime('%Y-%m-%d'),
                    'title': ev.title,
                    'is_holiday': getattr(ev, 'is_holiday', False),
                })
        except Exception:
            events_data = []

        latency_ms = max(1, round((time_module.perf_counter() - query_start) * 1000))

        response_data = {
            'total_students': total_students,
            'students_present': len(gate_in_ids),
            'students_on_campus': students_on_campus,
            'students_absent': absent_students,
            'attendance_rate': attendance_rate,
            'faculty_on_duty': present_faculty,
            'total_faculty': total_faculty,
            'gate_scans_today': len(gate_logs_today),
            'sms_sent_today': sms_sent,
            'sms_pending_count': sms_pending,
            'sms_failed_count': sms_failed,
            'kiosks_online': IoTKiosk.objects.filter(
                is_active=True,
                last_ping__gte=timezone.now() - timedelta(minutes=5)
            ).count(),
            'total_kiosks': IoTKiosk.objects.count(),
            'hourly_scans': hourly_scans,
            'recent_scans': recent_scans_data,
            'notices': bulletins_data,
            'events': events_data,
            'analytics': {'average_latency_ms': latency_ms},
            'database': {'status': 'CONNECTED', 'database_name': settings.DATABASES['default']['NAME']},
        }

        cache.set(cache_key, response_data, timeout=15)
        return Response(response_data, status=200)