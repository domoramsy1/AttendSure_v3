"""
AttendSure - Classroom Cutting-Class & Faculty GPS Loafing Monitor
File: backend/apps/api/views/monitoring.py
"""

from datetime import datetime
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    GatePass,
    Schedule,
    SubjectAttendanceLog,
)
from .common import (
    format_full_student_name,
    get_faculty_section_ids,
    get_user_role,
    is_leadership_role,
    resolve_faculty_for_user,
)


class LoafingMonitoringAPIView(APIView):
    """
    Detects real-time attendance anomalies from database records:
    1. Students marked PRESENT/LATE in an earlier class today who are missing
       from a current active class without an approved exit pass.
    2. Faculty members whose latest mobile GPS check-in is outside the campus
       boundary during scheduled teaching hours without an approved exit pass.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        is_leader = bool(user.is_superuser or is_leadership_role(user))

        if not (is_leader or role == 'FACULTY'):
            return Response({'error': 'Unauthorized access.'}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.localdate()
        now_dt = timezone.now()
        now_time = timezone.localtime(now_dt).time()
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))

        active_student_passes = set(
            GatePass.objects.filter(
                student__isnull=False,
                status='ACTIVE',
                valid_from__lte=now_dt,
                valid_to__gte=now_dt,
            ).values_list('student_id', flat=True)
        )

        active_faculty_passes = set(
            GatePass.objects.filter(
                faculty__isnull=False,
                status='ACTIVE',
                valid_from__lte=now_dt,
                valid_to__gte=now_dt,
            ).values_list('faculty_id', flat=True)
        )

        present_today_ids = set(
            DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                status__in=['PRESENT', 'LATE'],
            ).values_list('student_id', flat=True)
        )

        schedules_qs = Schedule.objects.select_related('section', 'subject', 'faculty').filter(
            is_active=True,
            start_time__lte=now_time,
        )
        if not is_leader:
            own_faculty = resolve_faculty_for_user(user)
            if not own_faculty:
                return Response({'anomalies': [], 'total': 0}, status=status.HTTP_200_OK)
            schedules_qs = schedules_qs.filter(section_id__in=get_faculty_section_ids(own_faculty))

        current_schedules = list(schedules_qs)
        schedule_ids = [s.id for s in current_schedules]
        section_ids = {s.section_id for s in current_schedules if s.section_id}

        verified_pairs = set(
            SubjectAttendanceLog.objects.filter(
                attendance_date=today,
                schedule_id__in=schedule_ids,
                status__in=['PRESENT', 'LATE', 'EXCUSED'],
            ).values_list('student_id', 'schedule_id')
        )
        started_schedule_ids = {sc_id for _, sc_id in verified_pairs}

        enrollments_by_section = {}
        for enr in Enrollment.objects.filter(
            section_id__in=section_ids,
            status='ENROLLED',
            student__is_active=True,
        ).select_related('student'):
            enrollments_by_section.setdefault(enr.section_id, []).append(enr.student)

        anomalies = []
        time_label = timezone.localtime(now_dt).strftime('%I:%M %p')

        # 1. Cross-period student cutting-class detection
        for sched in current_schedules:
            sec = sched.section
            if not sec or sched.id not in started_schedule_ids:
                continue

            for st in enrollments_by_section.get(sec.id, []):
                if (
                    st.id in present_today_ids
                    and (st.id, sched.id) not in verified_pairs
                    and st.id not in active_student_passes
                ):
                    subj_code = sched.subject.code if sched.subject else 'CLASS'
                    anomalies.append({
                        'category': 'STUDENT',
                        'anomaly_type': 'CUTTING_CLASS',
                        'severity': 'HIGH',
                        'person_id': st.id,
                        'lrn': st.lrn,
                        'name': format_full_student_name(st),
                        'section': sec.name,
                        'subject': subj_code,
                        'details': f'Verified in an earlier class today but missing from {subj_code} without an exit pass.',
                        'detected_at': time_label,
                    })

        # 2. Faculty mobile GPS boundary check during active class hours
        if is_leader:
            active_lectures = [
                s for s in current_schedules
                if s.faculty_id and s.end_time and s.end_time >= now_time
            ]
            faculty_ids = {s.faculty_id for s in active_lectures}

            latest_heartbeats = {}
            if faculty_ids:
                for hb in FacultyHeartbeat.objects.filter(
                    faculty_id__in=faculty_ids,
                    recorded_at__gte=today_start,
                ).order_by('faculty_id', '-recorded_at'):
                    latest_heartbeats.setdefault(hb.faculty_id, hb)

            for sched in active_lectures:
                fac = sched.faculty
                if not fac or fac.id in active_faculty_passes:
                    continue
                hb = latest_heartbeats.get(fac.id)
                if hb and not hb.is_inside_geofence:
                    subj_code = sched.subject.code if sched.subject else 'CLASS'
                    anomalies.append({
                        'category': 'FACULTY',
                        'anomaly_type': 'OUTSIDE_GEOFENCE',
                        'severity': 'HIGH',
                        'person_id': fac.id,
                        'employee_id': fac.employee_id,
                        'name': fac.full_name,
                        'section': sched.section.name if sched.section else '',
                        'subject': subj_code,
                        'details': f'Outside campus GPS boundary during scheduled class ({subj_code}) without an exit pass.',
                        'detected_at': timezone.localtime(hb.recorded_at).strftime('%I:%M %p'),
                    })

        return Response({
            'success': True,
            'total': len(anomalies),
            'anomalies': anomalies,
            'results': anomalies,
        }, status=status.HTTP_200_OK)