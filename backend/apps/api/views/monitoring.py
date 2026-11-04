"""
AttendSure V3 - Real-Time Loafing & Anti-Cutting Monitoring Engine
File: backend/apps/api/views/monitoring.py
"""

from datetime import datetime
from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    Schedule,
    StudentGateLog,
    SubjectAttendanceLog,
    GatePass,
    Enrollment,
)
from apps.common.utils import (
    get_user_role,
    format_full_student_name,
    safe_photo_url,
)


class LoafingMonitoringAPIView(APIView):
    """
    Scans live attendance records to detect class cutting, unauthorized campus
    exits, and faculty roaming outside campus during lectures.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)

        if not (user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'FACULTY')):
            return Response({'error': 'Unauthorized access.'}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.localdate()
        now_time = timezone.localtime().time()
        now_dt = timezone.now()

        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        # 1. Fetch live Gate Logs for today using indexed datetime bounds
        gate_in_set = set(
            StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                direction='IN'
            ).values_list('student_id', flat=True)
        )

        gate_out_set = set(
            StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                direction='OUT'
            ).values_list('student_id', flat=True)
        )

        # 2. Fetch Active Approved Gate Passes
        active_student_passes = set(
            GatePass.objects.filter(
                student__isnull=False,
                status='ACTIVE',
                valid_from__lte=now_dt,
                valid_to__gte=now_dt
            ).values_list('student_id', flat=True)
        )

        active_faculty_passes = set(
            GatePass.objects.filter(
                faculty__isnull=False,
                status='ACTIVE',
                valid_from__lte=now_dt,
                valid_to__gte=now_dt
            ).values_list('faculty_id', flat=True)
        )

        # 3. Fetch active or completed class schedules for today
        current_schedules = list(
            Schedule.objects.select_related('section', 'subject', 'faculty')
            .filter(start_time__lte=now_time)
        )

        # 4. Fetch verified subject attendance for today
        verified_set = set(
            SubjectAttendanceLog.objects.filter(
                attendance_date=today,
                status__in=['PRESENT', 'LATE']
            ).values_list('student_id', 'schedule_id')
        )

        # Batch-prefetch all enrolled students for active sections (eliminates N+1 queries)
        active_section_ids = [s.section_id for s in current_schedules if s.section_id]
        students_by_section = {}
        if active_section_ids:
            enrollments = (
                Enrollment.objects.filter(
                    section_id__in=active_section_ids,
                    status='ENROLLED',
                    student__is_active=True
                )
                .select_related('student')
            )
            for enr in enrollments:
                students_by_section.setdefault(enr.section_id, []).append(enr.student)

        anomalies = []

        # CHECK A: Student Loafing & Cutting Detection
        for sched in current_schedules:
            sec = sched.section
            if not sec:
                continue

            enrolled_students = students_by_section.get(sec.id, [])

            for st in enrolled_students:
                is_in_gate = st.id in gate_in_set
                is_out_gate = st.id in gate_out_set
                has_pass = st.id in active_student_passes
                is_scanned_in_class = (st.id, sched.id) in verified_set

                # Anomaly 1: Cutting Class
                if is_in_gate and not is_out_gate and not is_scanned_in_class and not has_pass:
                    anomalies.append({
                        'category': 'STUDENT',
                        'anomaly_type': 'CUTTING_CLASS',
                        'severity': 'HIGH',
                        'person_id': st.id,
                        'identifier': st.lrn,
                        'name': format_full_student_name(st),
                        'section': sec.name,
                        'subject': sched.subject.title if sched.subject else '',
                        'teacher': sched.faculty.full_name if sched.faculty else 'Unassigned',
                        'room': sec.room_number or sched.room_number or 'Classroom',
                        'details': 'Student scanned at campus gate, but missing from scheduled subject lecture.',
                        'detected_at': timezone.localtime().strftime('%I:%M %p'),
                        'parent_contact': st.parent_contact or '',
                        'photo_url': safe_photo_url(st.photo, request),
                    })

                # Anomaly 2: Unauthorized Campus Exit
                elif is_out_gate and not has_pass:
                    anomalies.append({
                        'category': 'STUDENT',
                        'anomaly_type': 'UNAUTHORIZED_EXIT',
                        'severity': 'CRITICAL',
                        'person_id': st.id,
                        'identifier': st.lrn,
                        'name': format_full_student_name(st),
                        'section': sec.name,
                        'subject': sched.subject.title if sched.subject else '',
                        'teacher': sched.faculty.full_name if sched.faculty else 'Unassigned',
                        'room': sec.room_number or sched.room_number or 'Gate',
                        'details': 'Student exited campus perimeter during active class hours without Gate Pass.',
                        'detected_at': timezone.localtime().strftime('%I:%M %p'),
                        'parent_contact': st.parent_contact or '',
                        'photo_url': safe_photo_url(st.photo, request),
                    })

        # CHECK B: Faculty Telemetry Verification (Lecture Period Presence)
        active_lecture_schedules = Schedule.objects.select_related(
            'faculty', 'subject', 'section'
        ).filter(
            start_time__lte=now_time,
            end_time__gte=now_time,
            faculty__isnull=False
        )

        for sched in active_lecture_schedules:
            fac = sched.faculty
            if not fac:
                continue

            has_pass = fac.id in active_faculty_passes
            telemetry = cache.get(f"attendsure_faculty_telemetry_{fac.id}") or {}
            presence = telemetry.get('presence_status', 'OFF_CAMPUS')

            if presence == 'OFF_CAMPUS' and not has_pass:
                anomalies.append({
                    'category': 'FACULTY',
                    'anomaly_type': 'FACULTY_ABSENT_DURING_LECTURE',
                    'severity': 'HIGH',
                    'person_id': fac.id,
                    'identifier': fac.employee_id,
                    'name': fac.full_name,
                    'section': sched.section.name if sched.section else '',
                    'subject': sched.subject.title if sched.subject else '',
                    'teacher': fac.full_name,
                    'room': sched.room_number or 'Assigned Room',
                    'details': f"Teacher has scheduled lecture ({sched.start_time.strftime('%I:%M %p')} - {sched.end_time.strftime('%I:%M %p')}) but telemetry reports off-campus.",
                    'detected_at': timezone.localtime().strftime('%I:%M %p'),
                    'parent_contact': fac.contact_number or '',
                    'photo_url': safe_photo_url(fac.photo, request),
                })

        return Response({
            'success': True,
            'timestamp': timezone.localtime().strftime('%I:%M:%S %p'),
            'total_anomalies': len(anomalies),
            'cutting_students': sum(1 for a in anomalies if a['anomaly_type'] == 'CUTTING_CLASS'),
            'unauthorized_exits': sum(1 for a in anomalies if a['anomaly_type'] == 'UNAUTHORIZED_EXIT'),
            'faculty_absences': sum(1 for a in anomalies if a['anomaly_type'] == 'FACULTY_ABSENT_DURING_LECTURE'),
            'anomalies': anomalies,
        }, status=status.HTTP_200_OK)