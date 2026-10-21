import time as time_module
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from apps.academics.models import (
    Student, StudentGateLog, FacultyProfile, FacultyGateLog,
    IoTKiosk, GradeLevel, Enrollment, SmsOutbox,
)
from .common import (
    get_user_role, is_regular_teacher, resolve_faculty_for_user,
    get_teacher_student_ids, get_teacher_section_ids,
    format_full_student_name, format_deduped_section_label, safe_photo_url,
)

class DashboardOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query_start = time_module.perf_counter()
        today = timezone.localdate()
        user_role = get_user_role(request.user)
        is_teacher_only = is_regular_teacher(user_role) and not request.user.is_superuser

        if is_teacher_only:
            user_faculty = resolve_faculty_for_user(request.user)
            assigned_student_ids = get_teacher_student_ids(user_faculty)
            assigned_section_ids = get_teacher_section_ids(user_faculty)
            total_students = len(assigned_student_ids)

            gate_logs_today = list(
                StudentGateLog.objects.filter(
                    scan_time__date=today,
                    student_id__in=assigned_student_ids
                ).values('student_id', 'direction', 'scan_time__hour')
            )
            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}
            students_on_campus = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0

            recent_logs = StudentGateLog.objects.filter(
                student_id__in=assigned_student_ids
            ).select_related('student').order_by('-scan_time')[:6]
            total_faculty, present_faculty = 1, (1 if FacultyGateLog.objects.filter(scan_time__date=today, direction='IN', faculty=user_faculty).exists() else 0)
            sms_sent, sms_pending, sms_failed = 0, 0, 0
        else:
            total_students = Student.objects.filter(is_active=True).count()
            gate_logs_today = list(
                StudentGateLog.objects.filter(scan_time__date=today).values('student_id', 'direction', 'scan_time__hour')
            )
            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}
            students_on_campus = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0

            total_faculty = FacultyProfile.objects.filter(is_active=True).count()
            present_faculty = FacultyGateLog.objects.filter(scan_time__date=today, direction='IN').values_list('faculty_id', flat=True).distinct().count()

            recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:6]
            try:
                sms_sent = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
                sms_pending = SmsOutbox.objects.filter(status='PENDING').count()
                sms_failed = SmsOutbox.objects.filter(status='FAILED', created_at__date=today).count()
            except Exception:
                sms_sent, sms_pending, sms_failed = 0, 0, 0

        hour_counts = {h: 0 for h in range(6, 18)}
        for l in gate_logs_today:
            h = l.get('scan_time__hour')
            if h in hour_counts:
                hour_counts[h] += 1
        max_hour = max(hour_counts.values() or [1])
        hourly_scans = [
            {'hour': f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}", 'count': count, 'height': round((count / max_hour * 100)) if max_hour else 0, 'is_peak': count == max_hour and count > 0}
            for h, count in hour_counts.items()
        ]

        recent_scans_data = []
        for log in recent_logs:
            enr = Enrollment.objects.filter(student=log.student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = format_deduped_section_label(enr.section.grade_level.code if enr and enr.section and enr.section.grade_level else "", enr.section.name if enr and enr.section else "")
            recent_scans_data.append({
                'id': log.id,
                'person_name': format_full_student_name(log.student),
                'photo_url': safe_photo_url(log.student.photo, request),
                'direction': log.direction,
                'grade_section': section_label,
                'scan_time': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'scan_method': log.scan_method,
            })

        return Response({
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
            'kiosks_online': IoTKiosk.objects.filter(is_active=True, last_ping__gte=timezone.now() - timedelta(minutes=10)).count(),
            'total_kiosks': IoTKiosk.objects.count(),
            'hourly_scans': hourly_scans,
            'recent_scans': recent_scans_data,
            'analytics': {'average_latency_ms': max(1, round((time_module.perf_counter() - query_start) * 1000))},
            'database': {'status': 'CONNECTED', 'database_name': settings.DATABASES['default']['NAME']},
        })
