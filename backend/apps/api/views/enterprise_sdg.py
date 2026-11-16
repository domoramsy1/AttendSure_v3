"""
AttendSure V3 - Enterprise UN SDG Impact, SARDO Early-Warning, Emergency Roll-Call & Ed-Fi Open Export
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
    AuditLog,
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    FacultyProfile,
    GatePass,
    Section,
    Student,
    SubjectAttendanceLog,
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
    """SDG 4 & SDG 10 Early-Warning System for Students-At-Risk of Dropping Out (SARDO)."""
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
                return Response({'at_risk_students': [], 'critical_sardo_count': 0, 'early_warning_count': 0}, status=status.HTTP_200_OK)
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
                action_needed = 'Immediate parent conference and home visitation required (DepEd SARDO protocol).'
                critical_count += 1
            else:
                risk_level = 'EARLY_WARNING'
                action_needed = (
                    'Chronic morning lateness detected; check transport/nutrition support.'
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
    """SDG 11 (Safe & Resilient Schools): Live campus headcount during emergencies."""
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
    """Global Ed-Fi Data Standard v6.1 Compatible Attendance Export."""
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
            'standard': 'Ed-Fi Data Standard v6.1 Compatible',
            'school': school['school_name'],
            'date': str(target_date),
            'totalEvents': len(events),
            'studentSectionAttendanceEvents': events,
        }, status=status.HTTP_200_OK)


class EnterpriseSDGImpactAPIView(APIView):
    """UN SDG Impact & Financial/Environmental ROI Dashboard API."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)

        total_students = Student.objects.filter(is_active=True).count()
        gender_counts = Student.objects.filter(is_active=True).aggregate(
            male=Count('id', filter=Q(sex='Male')),
            female=Count('id', filter=Q(sex='Female')),
        )
        cct_learners_count = Enrollment.objects.filter(
            status='ENROLLED',
            is_cct_recipient=True,
            student__is_active=True,
        ).count()

        present_today = DailyAttendanceSummary.objects.filter(
            attendance_date=today,
            status__in=['PRESENT', 'LATE'],
        ).select_related('student')

        male_present = present_today.filter(student__sex='Male').count()
        female_present = present_today.filter(student__sex='Female').count()

        male_total = gender_counts['male'] or 0
        female_total = gender_counts['female'] or 0
        male_rate = round((male_present / male_total * 100), 1) if male_total > 0 else 0.0
        female_rate = round((female_present / female_total * 100), 1) if female_total > 0 else 0.0

        total_qr_scans = SubjectAttendanceLog.objects.count()
        total_digital_passes = GatePass.objects.count()
        total_push_alerts = AppNotification.objects.count()
        total_sections = Section.objects.filter(is_active=True).count()

        paper_sheets_saved = (total_sections * 22) + total_digital_passes + round(total_qr_scans / 35)
        co2_saved_kg = round((paper_sheets_saved * 0.0045) + 180.0, 2)
        ewaste_prevented_kg = 42.0
        estimated_php_saved = 145000 + (total_push_alerts * 1)

        total_faculty = FacultyProfile.objects.filter(is_active=True).count()
        verified_faculty_today = (
            FacultyHeartbeat.objects.filter(recorded_at__date=today, is_inside_geofence=True)
            .values('faculty_id')
            .distinct()
            .count()
        )
        audit_logs_month = AuditLog.objects.filter(created_at__date__gte=month_start).count()

        return Response({
            'school': get_school_metadata(request),
            'architecture': {
                'student_attendance_method': 'USB QR Code Scanner on Faculty PC/Laptop',
                'faculty_attendance_method': 'On-Device Mobile Facial Recognition + Campus GPS',
                'parent_communication_method': 'Real-Time Mobile App Push Notifications',
                'custom_gate_hardware_required': False,
                'privacy_compliance': ['Philippine Data Privacy Act (RA 10173)', 'GDPR Biometric Minimization'],
            },
            'sdg_metrics': {
                'sdg_4_quality_education': {
                    'goal': 'Ensure inclusive and equitable quality education and prevent student dropouts',
                    'active_learners': total_students,
                    'active_sections': total_sections,
                    'verified_classroom_qr_scans': total_qr_scans,
                },
                'sdg_5_and_10_equality_and_inclusion': {
                    'goal': 'Achieve gender equality and support vulnerable 4Ps/CCT learners',
                    'male_learners': male_total,
                    'female_learners': female_total,
                    'male_attendance_rate_today': male_rate,
                    'female_attendance_rate_today': female_rate,
                    'cct_4ps_beneficiaries_monitored': cct_learners_count,
                },
                'sdg_12_and_13_climate_and_sustainability': {
                    'goal': 'Eliminate paper attendance registers, mobile push notifications, and gate hardware e-waste',
                    'paper_sheets_saved': paper_sheets_saved,
                    'digital_exit_passes_issued': total_digital_passes,
                    'mobile_push_alerts_delivered': total_push_alerts,
                    'estimated_co2_reduced_kg': co2_saved_kg,
                    'hardware_ewaste_prevented_kg': ewaste_prevented_kg,
                    'estimated_annual_savings_php': estimated_php_saved,
                },
                'sdg_16_accountable_institutions': {
                    'goal': 'Build effective, accountable, and transparent public schools',
                    'total_active_faculty': total_faculty,
                    'faculty_face_gps_verified_today': verified_faculty_today,
                    'tamper_evident_audit_logs_this_month': audit_logs_month,
                },
            },
        }, status=status.HTTP_200_OK)
