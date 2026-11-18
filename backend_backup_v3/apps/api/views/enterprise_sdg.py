"""
AttendSure - Enterprise UN SDG Impact, SARDO Early-Warning, Emergency Roll-Call & Ed-Fi Open Export
File: backend/apps/api/views/enterprise_sdg.py
"""

from datetime import time, timedelta
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    AppNotification,
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    FacultyProfile,
    GatePass,
    Schedule,
    Section,
    Student,
    SubjectAttendanceLog,
    UserProfile,
)
from .common import (
    format_deduped_section_label,
    format_full_student_name,
    get_faculty_section_ids,
    get_school_metadata,
    is_leadership_role,
    resolve_faculty_for_user,
    safe_photo_url,
)


class SARDOEarlyWarningAPIView(APIView):
    """
    Analyzes 30-day attendance logs to flag learners at risk of dropping out (SARDO).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        window_start = today - timedelta(days=30)

        enrollments_qs = (
            Enrollment.objects.filter(status='ENROLLED', student__is_active=True)
            .select_related('student', 'section', 'section__grade_level')
        )

        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if not faculty:
                return Response(
                    {'at_risk_students': [], 'critical_sardo_count': 0, 'early_warning_count': 0},
                    status=status.HTTP_200_OK,
                )
            enrollments_qs = enrollments_qs.filter(section_id__in=get_faculty_section_ids(faculty))

        section_id = request.query_params.get('section_id')
        if section_id and str(section_id).isdigit():
            enrollments_qs = enrollments_qs.filter(section_id=int(section_id))

        enrollments = list(enrollments_qs)
        student_ids = [e.student_id for e in enrollments]

        stats_by_student = {
            row['student_id']: row
            for row in DailyAttendanceSummary.objects.filter(
                student_id__in=student_ids,
                attendance_date__gte=window_start,
                attendance_date__lte=today,
            )
            .values('student_id')
            .annotate(
                absent_days=Count('id', filter=Q(status='ABSENT')),
                cutting_days=Count('id', filter=Q(status='CUTTING')),
                late_days=Count('id', filter=Q(status='LATE')),
            )
        }

        morning_lates = dict(
            SubjectAttendanceLog.objects.filter(
                student_id__in=student_ids,
                attendance_date__gte=window_start,
                status='LATE',
                schedule__start_time__lte=time(8, 30),
            )
            .values('student_id')
            .annotate(cnt=Count('id'))
            .values_list('student_id', 'cnt')
        )

        at_risk_list = []
        critical_count = 0
        warning_count = 0

        for enr in enrollments:
            st = enr.student
            row = stats_by_student.get(st.id, {})
            absences = row.get('absent_days', 0)
            cutting = row.get('cutting_days', 0)
            lates = row.get('late_days', 0)
            first_period_lates = morning_lates.get(st.id, 0)

            risk_score = min(100, (absences * 15) + (cutting * 20) + (lates * 5) + (first_period_lates * 3))
            if risk_score < 20:
                continue

            if absences >= 5 or cutting >= 3 or risk_score >= 60:
                risk_level = 'CRITICAL_SARDO'
                action_needed = 'Immediate parent conference and home visitation required.'
                critical_count += 1
            else:
                risk_level = 'EARLY_WARNING'
                action_needed = (
                    'Chronic morning lateness detected; check transport or nutrition support.'
                    if first_period_lates >= 3
                    else 'Adviser counseling and mobile app parent follow-up recommended.'
                )
                warning_count += 1

            sec = enr.section
            grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''

            at_risk_list.append({
                'student_id': st.id,
                'lrn': st.lrn,
                'full_name': format_full_student_name(st),
                'sex': st.sex,
                'section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                'is_4ps_beneficiary': enr.is_cct_recipient,
                'parent_contact': st.parent_contact,
                'parent_app_linked': bool(st.parent_user_id),
                'photo_url': safe_photo_url(st.photo, request),
                'absent_days_30d': absences,
                'cutting_days_30d': cutting,
                'late_days_30d': lates,
                'risk_score': risk_score,
                'risk_level': risk_level,
                'recommended_intervention': action_needed,
            })

        at_risk_list.sort(key=lambda item: item['risk_score'], reverse=True)

        return Response({
            'window_days': 30,
            'total_evaluated': len(enrollments),
            'critical_sardo_count': critical_count,
            'early_warning_count': warning_count,
            'at_risk_students': at_risk_list[:100],
        }, status=status.HTTP_200_OK)


class EmergencyCampusRollCallAPIView(APIView):
    """Provides an instant live campus headcount of present students and faculty."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        now_dt = timezone.now()

        departed_student_ids = set(
            GatePass.objects.filter(
                student__isnull=False,
                valid_from__date=today,
                status__in=['ACTIVE', 'USED'],
            ).values_list('student_id', flat=True)
        )

        present_summaries = (
            DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                status__in=['PRESENT', 'LATE'],
            )
            .exclude(student_id__in=departed_student_ids)
            .select_related('student', 'section', 'section__grade_level')
            .order_by('section__grade_level__level_order', 'section__name', 'student__last_name')
        )

        students_on_campus = []
        for item in present_summaries:
            st = item.student
            sec = item.section
            grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
            students_on_campus.append({
                'student_id': st.id,
                'lrn': st.lrn,
                'full_name': format_full_student_name(st),
                'section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                'parent_contact': st.parent_contact,
                'photo_url': safe_photo_url(st.photo, request),
            })

        faculty_ids = (
            FacultyHeartbeat.objects.filter(recorded_at__date=today, is_inside_geofence=True)
            .values_list('faculty_id', flat=True)
            .distinct()
        )
        faculty_on_campus = [
            {
                'faculty_id': f.id,
                'employee_id': f.employee_id,
                'full_name': f.full_name,
                'department': f.department,
            }
            for f in FacultyProfile.objects.filter(id__in=faculty_ids, is_active=True).order_by('last_name')
        ]

        return Response({
            'timestamp': timezone.localtime(now_dt).strftime('%Y-%m-%d %I:%M:%S %p'),
            'total_people_on_campus': len(students_on_campus) + len(faculty_on_campus),
            'students_count': len(students_on_campus),
            'faculty_count': len(faculty_on_campus),
            'students': students_on_campus,
            'faculty': faculty_on_campus,
        }, status=status.HTTP_200_OK)


class EdFiOpenStandardExportAPIView(APIView):
    """Exports standardized student attendance events for LMS and ministry reporting."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        target_date_str = request.query_params.get('date')
        target_date = timezone.localdate()
        if target_date_str:
            try:
                target_date = timezone.datetime.strptime(target_date_str, '%Y-%m-%d').date()
            except ValueError:
                pass

        school = get_school_metadata(request)
        logs = (
            SubjectAttendanceLog.objects.filter(attendance_date=target_date)
            .select_related('student', 'schedule__section', 'schedule__subject', 'faculty')
            .order_by('scanned_at')[:1000]
        )

        events = [
            {
                'id': f"att-{log.id}",
                'schoolId': school['school_id'],
                'eventDate': str(log.attendance_date),
                'studentReference': {
                    'studentUniqueId': log.student.lrn,
                    'fullName': format_full_student_name(log.student),
                },
                'sectionReference': {
                    'sectionIdentifier': log.schedule.section.name if (log.schedule and log.schedule.section) else '',
                    'courseCode': log.schedule.subject.code if (log.schedule and log.schedule.subject) else '',
                },
                'attendanceEventCategoryDescriptor': f"uri://ed-fi.org/AttendanceEventCategoryDescriptor#{log.status.title()}",
                'captureMethod': 'USB_QR_SCANNER_PC',
                'recordedAt': timezone.localtime(log.scanned_at).isoformat() if log.scanned_at else '',
            }
            for log in logs
        ]

        return Response({
            'standard': 'Ed-Fi v6.1 AttendanceEvent',
            'school': school['school_name'],
            'date': str(target_date),
            'total_events': len(events),
            'events': events,
        }, status=status.HTTP_200_OK)


class EnterpriseSDGImpactAPIView(APIView):
    """Computes live institutional SDG metrics from real PostgreSQL records."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        total_students = Student.objects.filter(is_active=True).count()
        linked_parents = Student.objects.filter(is_active=True, parent_user__isnull=False).count()
        total_push_alerts = AppNotification.objects.count()
        active_sections = Section.objects.filter(is_active=True).count()
        active_schedules = Schedule.objects.filter(is_active=True).count()
        active_parents = UserProfile.objects.filter(role='PARENT', user__is_active=True).count()

        parent_coverage_pct = round((linked_parents / total_students * 100), 1) if total_students > 0 else 0.0

        return Response({
            'status': 'success',
            'metrics': {
                'total_active_students': total_students,
                'linked_parent_students': linked_parents,
                'parent_app_coverage_percent': parent_coverage_pct,
                'active_parent_accounts': active_parents,
                'total_push_alerts_sent': total_push_alerts,
                'active_sections': active_sections,
                'active_schedules': active_schedules,
            },
            'sdg_alignment': {
                'goal_4': 'Quality Education - Live USB QR attendance and SARDO early warning',
                'goal_8': 'Decent Work - Mobile facial recognition & campus GPS check-in for faculty',
                'goal_16': 'Strong Institutions - Tamper-evident digital audit logs and real-time parent push alerts',
            },
        }, status=status.HTTP_200_OK)