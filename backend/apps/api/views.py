import calendar
import hmac
import logging
from datetime import date, datetime, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db import models, transaction
from django.utils import timezone
from rest_framework import filters, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.academics.models import (
    AcademicYear,
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    GatePass,
    IoTKiosk,
    LoafingIncident,
    Schedule,
    SchoolProfile,
    Section,
    SmsOutbox,
    StaffGateLog,
    StaffProfile,
    Student,
    StudentGateLog,
    Subject,
    SubjectAttendanceLog,
    UserProfile,
)
from apps.academics.services.sf1_service import get_sf1_data
from apps.academics.services.sf4_service import generate_sf4_data
from .serializers import (
    ClassroomBatchScanSerializer,
    GatePassSerializer,
    GateScanSerializer,
    IoTKioskSerializer,
    LoginSerializer,
    ScheduleSerializer,
    SchoolProfileSerializer,
    StaffProfileSerializer,
    StudentSerializer,
    SubjectSerializer,
    TelemetryHeartbeatSerializer,
    UserManagementSerializer,
)

logger = logging.getLogger(__name__)


# ============================================================================
# ZERO-TRUST PERMISSION POLICIES (ROLE-BASED ACCESS CONTROL)
# ============================================================================

class IsSystemAdminRole(permissions.BasePermission):
    """
    Grants access exclusively to superusers and accounts with the ADMIN role.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'ADMIN')


class IsAdviserOrAdmin(permissions.BasePermission):
    """
    Restricts access to learner demographic data and official class registers.
    Only administrators and the designated section adviser may inspect these records.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return False
        if profile.role == 'ADMIN':
            return True
        if profile.role == 'TEACHER' and profile.staff:
            return getattr(obj, 'adviser_id', None) == profile.staff.id
        return False


class ReadOnlyOrAdminWrite(permissions.BasePermission):
    """
    Allows read-only access to authenticated staff, restricting mutating
    operations (POST, PUT, PATCH, DELETE) strictly to system administrators.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'ADMIN')


# ============================================================================
# RATE THROTTLES
# ============================================================================

class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class HardwareGateScanRateThrottle(AnonRateThrottle):
    rate = '180/minute'


# ============================================================================
# AUTHENTICATION & OVERVIEW
# ============================================================================

class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [AuthLoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        user = authenticate(username=username, password=password)
        if not user or not user.is_active:
            return Response({'error': 'Invalid credentials or inactive account'}, status=status.HTTP_401_UNAUTHORIZED)

        token, _ = Token.objects.get_or_create(user=user)
        user_profile = getattr(user, 'profile', None)
        staff = getattr(user_profile, 'staff', None) if user_profile else None

        role = user_profile.role if user_profile else ('ADMIN' if user.is_superuser else 'TEACHER')
        staff_id = staff.employee_id if staff else None
        staff_name = f"{staff.first_name} {staff.last_name}".strip() if staff else (user.get_full_name() or user.username)

        return Response({
            'token': token.key,
            'user_id': user.id,
            'username': user.username,
            'role': role,
            'staff_id': staff_id,
            'staff_name': staff_name,
            'is_superuser': user.is_superuser
        }, status=status.HTTP_200_OK)


class SectionListAPIView(APIView):
    """
    Returns active class sections.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sections = Section.objects.select_related(
            'grade_level', 'academic_year', 'adviser'
        ).filter(
            academic_year__is_active=True
        ).order_by('grade_level__level_order', 'name')

        if not sections.exists():
            sections = Section.objects.select_related(
                'grade_level', 'academic_year', 'adviser'
            ).all().order_by('grade_level__level_order', 'name')

        data = [
            {
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'academic_year': s.academic_year.code if s.academic_year else '',
                'adviser_name': f"{s.adviser.first_name} {s.adviser.last_name}".strip() if s.adviser else "Unassigned",
                'display_label': f"{s.grade_level.name if s.grade_level else 'Level'} - {s.name}".strip()
            }
            for s in sections
        ]
        return Response(data, status=status.HTTP_200_OK)


class DashboardOverviewAPIView(APIView):
    """
    High-level operational overview for verified campus operators.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        today = now.date()

        active_sy = AcademicYear.objects.filter(is_active=True).first()
        sy_label = active_sy.code if active_sy else f"{now.year}-{now.year + 1}"

        active_kiosks = IoTKiosk.objects.filter(is_active=True)
        recent_pings = active_kiosks.filter(last_ping__gte=now - timedelta(minutes=5))
        gate_node_online = recent_pings.exists()
        gate_readers_active = active_kiosks.filter(last_ping__gte=now - timedelta(hours=1)).exists()

        total_enrolled = Enrollment.objects.filter(academic_year=active_sy, status='ENROLLED').count() if active_sy else 0

        present_student_ids = set(
            StudentGateLog.objects.filter(scan_time__date=today, direction='IN').values_list('student_id', flat=True)
        ) | set(
            DailyAttendanceSummary.objects.filter(attendance_date=today, status='PRESENT').values_list('student_id', flat=True)
        )
        present_learners = len(present_student_ids)
        unexcused_absences = DailyAttendanceSummary.objects.filter(attendance_date=today, status='ABSENT').count()

        student_taps_today = StudentGateLog.objects.filter(scan_time__date=today).count()
        staff_taps_today = StaffGateLog.objects.filter(scan_time__date=today).count()
        total_transactions = student_taps_today + staff_taps_today

        total_faculty = StaffProfile.objects.filter(is_active=True).count()
        faculty_tapped_today = StaffGateLog.objects.filter(scan_time__date=today, direction='IN').values('staff_id').distinct().count()
        faculty_dtr_percentage = round((faculty_tapped_today / total_faculty * 100), 1) if total_faculty > 0 else 0.0

        influx_distribution = []
        for hour in range(6, 18):
            count = StudentGateLog.objects.filter(
                scan_time__date=today,
                scan_time__hour=hour
            ).count() + StaffGateLog.objects.filter(
                scan_time__date=today,
                scan_time__hour=hour
            ).count()
            if count > 0:
                hour_label = f"{12 if hour in (0, 12) else hour % 12}:00 {'AM' if hour < 12 else 'PM'}"
                influx_distribution.append({'hour': hour_label, 'count': count})

        section_attendance = []
        if active_sy:
            sections = Section.objects.filter(academic_year=active_sy).select_related('grade_level')
            for sec in sections:
                sec_enrolled = Enrollment.objects.filter(section=sec, status='ENROLLED').count()
                if sec_enrolled > 0:
                    sec_present = DailyAttendanceSummary.objects.filter(
                        section=sec,
                        attendance_date=today,
                        status='PRESENT'
                    ).count()
                    pct = round((sec_present / sec_enrolled) * 100, 1)
                    section_attendance.append({
                        'section_id': sec.id,
                        'section_name': f"{sec.grade_level.name if sec.grade_level else ''} - {sec.name}".strip(' - '),
                        'enrolled': sec_enrolled,
                        'present': sec_present,
                        'rate': pct
                    })

        return Response({
            'academic_year': sy_label,
            'gate_node_online': gate_node_online,
            'turnstiles_active': gate_readers_active,
            'gate_readers_active': gate_readers_active,
            'telemetry_status': 'WAITING FOR GATE TAPS' if total_transactions == 0 else 'GATE TELEMETRY ACTIVE',
            'present_learners': present_learners,
            'total_enrolled': total_enrolled,
            'unexcused_absences': unexcused_absences,
            'gate_throughput': total_transactions,
            'faculty_dtr_percentage': faculty_dtr_percentage,
            'total_faculty': total_faculty,
            'faculty_tapped_today': faculty_tapped_today,
            'influx_distribution': influx_distribution,
            'section_attendance': section_attendance,
        }, status=status.HTTP_200_OK)


# ============================================================================
# HARDWARE GATE & CLASSROOM SCANNERS
# ============================================================================

class GateScanAPIView(APIView):
    """
    Ingests physical RFID taps and QR code scans from IoT kiosks.
    Verifies terminal secret key and applies rate throttling.
    """
    permission_classes = [permissions.AllowAny]
    throttle_classes = [HardwareGateScanRateThrottle]

    def post(self, request):
        serializer = GateScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        raw_id = data['raw_identifier']
        scan_method = data.get('scan_method', 'RFID')
        kiosk_code = data['kiosk_code']
        secret_key = data['secret_key']
        debounce_minutes = getattr(settings, 'GATE_DEBOUNCE_MINUTES', 3)

        try:
            kiosk = IoTKiosk.objects.get(kiosk_code=kiosk_code, is_active=True)
        except IoTKiosk.DoesNotExist:
            return Response({'error': 'Unauthorized or unregistered kiosk terminal'}, status=status.HTTP_403_FORBIDDEN)

        if not hmac.compare_digest(kiosk.secret_hash.encode('utf-8'), secret_key.encode('utf-8')):
            return Response({'error': 'Terminal signature verification failed'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()

        # Check Staff Record
        staff = StaffProfile.objects.filter(
            models.Q(rfid_uid=raw_id) | models.Q(qr_token=raw_id),
            is_active=True
        ).first()

        if staff:
            recent_log = StaffGateLog.objects.filter(
                staff=staff,
                scan_time__date=now.date()
            ).order_by('-scan_time').first()

            if recent_log and (now - recent_log.scan_time) < timedelta(minutes=debounce_minutes):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STAFF',
                    'name': f"{staff.first_name} {staff.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

            direction = 'OUT' if (recent_log and recent_log.direction == 'IN') else 'IN'
            new_log = StaffGateLog.objects.create(
                staff=staff,
                kiosk=kiosk,
                scan_time=now,
                direction=direction,
                scan_method=scan_method,
                raw_identifier=raw_id
            )
            kiosk.last_ping = now
            kiosk.save(update_fields=['last_ping'])

            return Response({
                'success': True,
                'person_type': 'STAFF',
                'name': f"{staff.first_name} {staff.last_name}".strip(),
                'position': staff.position or '',
                'direction': direction,
                'scan_method': scan_method,
                'scan_time': new_log.scan_time.strftime('%I:%M:%S %p'),
            }, status=status.HTTP_201_CREATED)

        # Check Student Record
        student = Student.objects.filter(
            models.Q(rfid_uid=raw_id) | models.Q(qr_token=raw_id),
            is_active=True
        ).first()

        if student:
            recent_log = StudentGateLog.objects.filter(
                student=student,
                scan_time__date=now.date()
            ).order_by('-scan_time').first()

            if recent_log and (now - recent_log.scan_time) < timedelta(minutes=debounce_minutes):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STUDENT',
                    'name': f"{student.first_name} {student.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

            direction = 'OUT' if (recent_log and recent_log.direction == 'IN') else 'IN'
            new_log = StudentGateLog.objects.create(
                student=student,
                kiosk=kiosk,
                scan_time=now,
                direction=direction,
                scan_method=scan_method,
                raw_identifier=raw_id
            )

            # Update daily summary on tap-in
            if direction == 'IN':
                student_enrollment = student.enrollments.filter(academic_year__is_active=True).first()
                if student_enrollment:
                    DailyAttendanceSummary.objects.update_or_create(
                        student=student,
                        attendance_date=now.date(),
                        defaults={
                            'section': student_enrollment.section,
                            'status': 'PRESENT',
                            'remarks': 'GATE_TAP_IN'
                        }
                    )

            if student.parent_contact:
                action_text = "entered campus" if direction == "IN" else "left campus"
                terminal_label = kiosk.terminal_name or kiosk.kiosk_code
                sms_body = (
                    f"Notice: Your child {student.first_name} {student.last_name} has {action_text} "
                    f"at {now.strftime('%I:%M %p')} via {terminal_label}."
                )
                SmsOutbox.objects.create(
                    recipient_number=student.parent_contact,
                    message_body=sms_body,
                    trigger_event='GATE_TAP',
                    priority=2
                )

            kiosk.last_ping = now
            kiosk.save(update_fields=['last_ping'])

            return Response({
                'success': True,
                'person_type': 'STUDENT',
                'name': f"{student.first_name} {student.last_name}".strip(),
                'lrn': student.lrn,
                'direction': direction,
                'scan_method': scan_method,
                'scan_time': new_log.scan_time.strftime('%I:%M:%S %p'),
            }, status=status.HTTP_201_CREATED)

        return Response({'error': 'Unrecognized RFID card or QR token'}, status=status.HTTP_404_NOT_FOUND)


class GateLogsAPIView(APIView):
    """
    Returns unified, chronological gate transactions for Students and Staff.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        person_type = request.GET.get('person_type', 'ALL').upper()
        direction = request.GET.get('direction', 'ALL').upper()
        search_query = request.GET.get('q', '').strip().lower()

        combined_logs = []

        if person_type in ('ALL', 'STUDENT'):
            student_qs = StudentGateLog.objects.select_related('student', 'kiosk').order_by('-scan_time')[:150]
            for log in student_qs:
                if direction != 'ALL' and log.direction != direction:
                    continue
                name = f"{log.student.first_name} {log.student.last_name}".strip()
                lrn = log.student.lrn
                if search_query and (search_query not in name.lower() and search_query not in lrn.lower()):
                    continue

                combined_logs.append({
                    'log_id': f"GL-STU-{log.id}",
                    'person_type': 'STUDENT',
                    'identifier': lrn,
                    'name': name,
                    'direction': log.direction,
                    'scan_method': log.scan_method,
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate Terminal',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else 'GATE-01',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        if person_type in ('ALL', 'STAFF'):
            staff_qs = StaffGateLog.objects.select_related('staff', 'kiosk').order_by('-scan_time')[:150]
            for log in staff_qs:
                if direction != 'ALL' and log.direction != direction:
                    continue
                name = f"{log.staff.first_name} {log.staff.last_name}".strip()
                emp_id = log.staff.employee_id
                if search_query and (search_query not in name.lower() and search_query not in emp_id.lower()):
                    continue

                combined_logs.append({
                    'log_id': f"GL-STF-{log.id}",
                    'person_type': 'STAFF',
                    'identifier': emp_id,
                    'name': name,
                    'direction': log.direction,
                    'scan_method': log.scan_method,
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate Terminal',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else 'GATE-01',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        combined_logs.sort(key=lambda x: x['raw_time'], reverse=True)
        return Response(combined_logs[:150], status=status.HTTP_200_OK)


class ClassroomBatchScanAPIView(APIView):
    """
    Records batch classroom QR/RFID scans.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            schedule = Schedule.objects.select_related('section', 'subject', 'teacher').get(id=data['schedule_id'])
        except Schedule.DoesNotExist:
            return Response({'error': 'Target class schedule does not exist'}, status=status.HTTP_404_NOT_FOUND)

        user_profile = getattr(request.user, 'profile', None)
        teacher = getattr(user_profile, 'staff', None) if user_profile else None
        is_admin = request.user.is_superuser or (user_profile and user_profile.role == 'ADMIN')

        if not is_admin:
            if not teacher or schedule.teacher_id != teacher.id:
                return Response(
                    {'error': 'Unauthorized: You are not assigned to instruct this class schedule.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        effective_teacher = teacher if teacher else schedule.teacher
        today = timezone.now().date()
        scans = data['scans']
        saved_count = 0

        for item in scans:
            identifier = item['qr_token']
            scan_status = item.get('status', 'PRESENT')

            student = Student.objects.filter(
                models.Q(qr_token=identifier) | models.Q(rfid_uid=identifier),
                is_active=True
            ).first()

            if not student:
                continue

            _, created = SubjectAttendanceLog.objects.get_or_create(
                student=student,
                schedule=schedule,
                attendance_date=today,
                defaults={
                    'teacher': effective_teacher,
                    'status': scan_status,
                    'scanned_at': timezone.now()
                }
            )

            if created:
                saved_count += 1
                if student.parent_contact:
                    subject_label = getattr(schedule.subject, 'title', getattr(schedule.subject, 'code', 'Class'))
                    sms_text = (
                        f"Notice: {student.first_name} was marked {scan_status} "
                        f"in {subject_label} at {timezone.now().strftime('%I:%M %p')}."
                    )
                    SmsOutbox.objects.create(
                        recipient_number=student.parent_contact,
                        message_body=sms_text,
                        trigger_event='CLASS_TAP',
                        priority=2 if scan_status == 'PRESENT' else 1
                    )

                DailyAttendanceSummary.objects.update_or_create(
                    student=student,
                    attendance_date=today,
                    defaults={
                        'section': schedule.section,
                        'status': scan_status
                    }
                )

        return Response({
            'success': True,
            'message': f"Batch processed successfully. {saved_count} new records stored.",
            'total_received': len(scans)
        }, status=status.HTTP_201_CREATED)


class TelemetryHeartbeatAPIView(APIView):
    """
    Records geofence GPS telemetry from verified staff clients.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TelemetryHeartbeatSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        staff = getattr(getattr(request.user, 'profile', None), 'staff', None)

        if not staff:
            return Response({'error': 'No linked Staff Profile for this user'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        is_inside = data['is_inside_geofence']
        breach_window_minutes = getattr(settings, 'TELEMETRY_BREACH_WINDOW_MINUTES', 5)
        breach_threshold = getattr(settings, 'TELEMETRY_BREACH_THRESHOLD', 2)

        FacultyHeartbeat.objects.create(
            staff=staff,
            latitude=data['latitude'],
            longitude=data['longitude'],
            battery_level=data['battery_level'],
            is_inside_geofence=is_inside,
            recorded_at=now
        )

        if not is_inside:
            has_pass = GatePass.objects.filter(
                staff=staff,
                status='ACTIVE',
                valid_from__lte=now,
                valid_to__gte=now
            ).exists()

            if not has_pass:
                outside_count = FacultyHeartbeat.objects.filter(
                    staff=staff,
                    is_inside_geofence=False,
                    recorded_at__gte=now - timedelta(minutes=breach_window_minutes)
                ).count()

                if outside_count >= breach_threshold:
                    LoafingIncident.objects.get_or_create(
                        staff=staff,
                        incident_date=now.date(),
                        trigger_reason='Staff outside geofence boundary without active Gate Pass',
                        defaults={'status': 'PENDING_REVIEW'}
                    )

        return Response({'status': 'Telemetry heartbeat recorded'}, status=status.HTTP_200_OK)


# ============================================================================
# INSTITUTIONAL SETTINGS & SCHOOL PROFILE
# ============================================================================

class SchoolSettingsAPIView(APIView):
    """
    Settings API for institutional parameters and custom report logos.
    GET: Authenticated staff can inspect configuration.
    PUT/PATCH: Restricted strictly to Administrators.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile = SchoolProfile.objects.first()
        if not profile:
            profile = SchoolProfile.objects.create()
        return profile

    def get(self, request):
        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        user_profile = getattr(request.user, 'profile', None)
        is_admin = request.user.is_superuser or (user_profile and user_profile.role == 'ADMIN')
        if not is_admin:
            return Response(
                {'error': 'Unauthorized: Administrator rank required to modify system settings.'},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# ACADEMIC REPORTS (SF1, SF2, SF4, AUDIT LOGS), DTR & GEOFENCE
# ============================================================================

class DepEdSF1DataAPIView(APIView):
    """
    Returns dynamic records for official School Form 1 (School Register).
    Verifies student enrollment status for the section's Academic Year.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdviserOrAdmin]

    def get(self, request, section_id):
        try:
            section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(id=section_id)
            self.check_object_permissions(request, section)

            data = get_sf1_data(section_id)
            acad_year_code = str(getattr(section.academic_year, 'code', '') if getattr(section, 'academic_year', None) else '').strip()

            raw_students = data.get('students') or data.get('learners') or []
            has_enrolled = len(raw_students) > 0

            data['has_enrolled_students'] = has_enrolled
            if not has_enrolled:
                data['notice'] = f"Notice: There are no students enrolled in Section {section.name} for School Year {acad_year_code}."
            else:
                data['notice'] = ""

            return Response(data, status=status.HTTP_200_OK)
        except Section.DoesNotExist:
            return Response({'error': f'Section with ID {section_id} does not exist.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error("SF1 Generation failure for section %s: %s", section_id, str(e), exc_info=True)
            return Response({'error': 'Failed to compile official School Form 1 report'}, status=status.HTTP_400_BAD_REQUEST)


SF1ReportAPIView = DepEdSF1DataAPIView


class DepEdSF2DataAPIView(APIView):
    """
    School Form 2 (SF2) Daily Attendance Report of Learners.
    1. Validates that learners are actively enrolled in the selected Academic Year.
    2. Validates learners were enrolled on or before the filtered date window.
    3. Hides learners who were not yet enrolled or already exited during that month.
    4. Shows a notice when no students are enrolled in that section for that period.
    5. Dynamically resolves the School Head's printed name from the database.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdviserOrAdmin]

    def get(self, request, section_id):
        try:
            section = Section.objects.select_related(
                'grade_level', 'academic_year', 'adviser'
            ).get(id=section_id)
            self.check_object_permissions(request, section)
        except Section.DoesNotExist:
            return Response(
                {'error': f'Section with ID {section_id} does not exist.'},
                status=status.HTTP_404_NOT_FOUND
            )

        now = timezone.now()
        today_date = now.date()

        # 1. Resolve Target Month, Year, and Academic Year
        acad_year_obj = getattr(section, 'academic_year', None)
        year_param = request.GET.get('year', '').strip()
        month_param = request.GET.get('month', '').strip().capitalize()

        if year_param.isdigit():
            year = int(year_param)
        elif acad_year_obj and hasattr(acad_year_obj, 'start_date') and acad_year_obj.start_date:
            year = acad_year_obj.start_date.year
        else:
            year = today_date.year

        month_names = list(calendar.month_name)
        if month_param.isdigit():
            m_val = int(month_param)
            if 1 <= m_val <= 12:
                month_num = m_val
                month_name = month_names[month_num]
            else:
                month_num = today_date.month
                month_name = month_names[month_num]
        elif month_param in month_names and month_param:
            month_num = month_names.index(month_param)
            month_name = month_param
        else:
            month_num = today_date.month
            month_name = month_names[month_num]

        acad_year_val = str(getattr(acad_year_obj, 'code', '') if acad_year_obj else f"{year}-{year+1}").strip()

        # 2. Dynamic Calendar Days for Month (Monday through Friday)
        num_calendar_days = calendar.monthrange(year, month_num)[1]
        weekday_map = {0: 'M', 1: 'T', 2: 'W', 3: 'TH', 4: 'F'}

        school_days = []
        for d in range(1, num_calendar_days + 1):
            cur_date = date(year, month_num, d)
            if cur_date.weekday() < 5:  # Monday to Friday only
                school_days.append({
                    'dateNumber': d,
                    'dayOfWeek': weekday_map[cur_date.weekday()],
                    'fullDate': cur_date.strftime('%Y-%m-%d')
                })

        start_month_date = date(year, month_num, 1)
        end_month_date = date(year, month_num, num_calendar_days)

        # 3. Check Academic Year Calendar Boundaries
        outside_academic_year = False
        if acad_year_obj and acad_year_obj.start_date and acad_year_obj.end_date:
            if end_month_date < acad_year_obj.start_date or start_month_date > acad_year_obj.end_date:
                outside_academic_year = True

        # 4. Filter Active Enrollments by Date Window
        valid_enrollments = []
        enrollment_map = {}

        if not outside_academic_year:
            enrollments_qs = Enrollment.objects.filter(section=section).select_related('student', 'academic_year')
            if acad_year_obj:
                enrollments_qs = enrollments_qs.filter(academic_year=acad_year_obj)

            for enr in enrollments_qs:
                enr_date = (
                    getattr(enr, 'enrollment_date', None)
                    or getattr(enr, 'date_enrolled', None)
                    or getattr(enr, 'created_at', None)
                )
                if enr_date and isinstance(enr_date, datetime):
                    enr_date = enr_date.date()

                if enr_date and enr_date > end_month_date:
                    continue

                status_val = str(getattr(enr, 'status', '') or '').upper()
                exit_date = (
                    getattr(enr, 'status_date', None)
                    or getattr(enr, 'exit_date', None)
                    or getattr(enr, 'date_dropped', None)
                    or getattr(enr, 'date_transferred', None)
                )
                if exit_date and isinstance(exit_date, datetime):
                    exit_date = exit_date.date()

                if status_val in ('DROPPED', 'TRANSFERRED_OUT') and exit_date and exit_date < start_month_date:
                    continue

                valid_enrollments.append(enr)
                if getattr(enr, 'student_id', None):
                    enrollment_map[enr.student_id] = enr

        students = [e.student for e in valid_enrollments if getattr(e, 'student', None)]

        # 5. Check If Enrolled Learners Exist
        has_enrolled_students = len(students) > 0
        notice_message = ""
        if not has_enrolled_students:
            notice_message = (
                f"Notice: There are no students enrolled in Section {section.name} "
                f"for the selected period ({month_name} {year}, School Year {acad_year_val})."
            )

        # 6. Query Attendance, Gate Taps, and Subject Logs
        summary_map = {}
        gate_in_set = set()
        subject_map = {}

        if has_enrolled_students:
            daily_summaries = DailyAttendanceSummary.objects.filter(
                section=section,
                student__in=students,
                attendance_date__gte=start_month_date,
                attendance_date__lte=end_month_date
            )
            summary_map = {(ds.student_id, ds.attendance_date): ds.status for ds in daily_summaries}

            gate_logs = StudentGateLog.objects.filter(
                student__in=students,
                direction='IN',
                scan_time__date__gte=start_month_date,
                scan_time__date__lte=end_month_date
            ).values('student_id', 'scan_time__date')
            gate_in_set = {(gl['student_id'], gl['scan_time__date']) for gl in gate_logs}

            subject_logs = SubjectAttendanceLog.objects.filter(
                schedule__section=section,
                student__in=students,
                attendance_date__gte=start_month_date,
                attendance_date__lte=end_month_date
            ).values('student_id', 'attendance_date', 'status')
            subject_map = {(sl['student_id'], sl['attendance_date']): sl['status'] for sl in subject_logs}

        # 7. Build Learner Attendance Payloads Grouped by Sex
        males_data = []
        females_data = []

        consecutive_5_absences_m = 0
        consecutive_5_absences_f = 0

        for s in students:
            enr_for_student = enrollment_map.get(s.id)

            s_enr_date = (
                getattr(enr_for_student, 'enrollment_date', None)
                or getattr(enr_for_student, 'date_enrolled', None)
                or getattr(s, 'created_at', None)
            )
            if s_enr_date and isinstance(s_enr_date, datetime):
                s_enr_date = s_enr_date.date()

            s_exit_date = (
                getattr(enr_for_student, 'status_date', None)
                or getattr(enr_for_student, 'exit_date', None)
                or getattr(enr_for_student, 'date_dropped', None)
                or getattr(enr_for_student, 'date_transferred', None)
            )
            if s_exit_date and isinstance(s_exit_date, datetime):
                s_exit_date = s_exit_date.date()

            raw_sex = str(getattr(s, 'sex', '') or getattr(s, 'gender', '') or '').strip().upper()
            s_sex = 'M' if raw_sex.startswith('M') else 'F'

            last = (getattr(s, 'last_name', '') or '').strip().upper()
            first = (getattr(s, 'first_name', '') or '').strip().upper()
            middle = (getattr(s, 'middle_name', '') or '').strip().upper()
            name_parts = [f"{last}, {first}".strip()]
            if middle:
                name_parts.append(middle)
            s_name = " ".join(name_parts)

            daily_attendance_map = {}
            total_absent = 0
            total_tardy = 0

            consecutive_absent_count = 0
            has_5_consecutive = False

            for s_day in school_days:
                d_num = s_day['dateNumber']
                d_obj = date(year, month_num, d_num)

                if s_enr_date and d_obj < s_enr_date:
                    daily_attendance_map[d_num] = ''
                    continue
                if s_exit_date and d_obj > s_exit_date:
                    daily_attendance_map[d_num] = ''
                    continue

                status_str = ''
                key = (s.id, d_obj)

                if key in summary_map:
                    st = (summary_map[key] or '').strip().upper()
                    if st in ('PRESENT', 'P'):
                        status_str = 'present'
                    elif st in ('ABSENT', 'A'):
                        status_str = 'absent'
                    elif st in ('TARDY', 'LATE', 'T'):
                        status_str = 'tardy'
                    elif st in ('CUTTING', 'CUT', 'CC'):
                        status_str = 'cutting'
                elif key in gate_in_set:
                    status_str = 'present'
                elif key in subject_map:
                    st = (subject_map[key] or '').strip().upper()
                    if st in ('PRESENT', 'P'):
                        status_str = 'present'
                    elif st in ('TARDY', 'LATE', 'T'):
                        status_str = 'tardy'
                    elif st in ('CUTTING', 'CUT', 'CC'):
                        status_str = 'cutting'
                    else:
                        status_str = 'absent'
                else:
                    if d_obj <= today_date:
                        status_str = 'absent'
                    else:
                        status_str = ''

                daily_attendance_map[d_num] = status_str

                if status_str == 'absent':
                    total_absent += 1
                    if d_obj <= today_date:
                        consecutive_absent_count += 1
                        if consecutive_absent_count >= 5:
                            has_5_consecutive = True
                elif status_str in ('present', 'tardy', 'cutting'):
                    consecutive_absent_count = 0

                if status_str == 'tardy':
                    total_tardy += 1

            if has_5_consecutive:
                if s_sex == 'M':
                    consecutive_5_absences_m += 1
                else:
                    consecutive_5_absences_f += 1

            remarks_val = (
                getattr(s, 'remarks', None)
                or getattr(s, 'status_remarks', None)
                or getattr(enr_for_student, 'remarks', None)
                or ''
            )

            payload = {
                'id': s.id,
                'lrn': str(getattr(s, 'lrn', '') or getattr(s, 'student_id', '') or '').strip(),
                'name': s_name,
                'sex': s_sex,
                'attendance': daily_attendance_map,
                'total_absent': total_absent,
                'total_tardy': total_tardy,
                'remarks': str(remarks_val).strip()
            }

            if s_sex == 'M':
                males_data.append(payload)
            else:
                females_data.append(payload)

        males_data.sort(key=lambda x: x['name'])
        females_data.sort(key=lambda x: x['name'])

        # 8. Calculate Attendance Metrics
        num_m = len(males_data)
        num_f = len(females_data)
        total_registered = num_m + num_f
        num_school_days = len(school_days) or 1

        total_m_daily_attendance = 0
        total_f_daily_attendance = 0

        for s_day in school_days:
            d_num = s_day['dateNumber']
            m_present = sum(1 for m in males_data if m['attendance'].get(d_num) in ('present', 'tardy', 'cutting'))
            f_present = sum(1 for f in females_data if f['attendance'].get(d_num) in ('present', 'tardy', 'cutting'))
            total_m_daily_attendance += m_present
            total_f_daily_attendance += f_present

        ada_m = total_m_daily_attendance / num_school_days if num_school_days else 0.0
        ada_f = total_f_daily_attendance / num_school_days if num_school_days else 0.0
        ada_total = ada_m + ada_f

        pct_att_m = (ada_m / num_m * 100) if num_m > 0 else 0.0
        pct_att_f = (ada_f / num_f * 100) if num_f > 0 else 0.0
        pct_att_total = (ada_total / total_registered * 100) if total_registered > 0 else 0.0

        # Cut-off Baseline Enrollment Date
        baseline_cutoff_date = None
        if acad_year_obj and getattr(acad_year_obj, 'first_friday_june', None):
            baseline_cutoff_date = acad_year_obj.first_friday_june
        else:
            june_1 = date(year, 6, 1)
            baseline_cutoff_date = date(year, 6, 1 + ((4 - june_1.weekday()) % 7))

        late_enrollees_m = 0
        late_enrollees_f = 0
        drop_outs_m = 0
        drop_outs_f = 0
        trans_out_m = 0
        trans_out_f = 0
        trans_in_m = 0
        trans_in_f = 0

        for s in students:
            g = 'M' if str(getattr(s, 'sex', '') or getattr(s, 'gender', '') or '').upper().startswith('M') else 'F'
            enr_record = enrollment_map.get(s.id)

            enr_date = (
                getattr(enr_record, 'enrollment_date', None)
                or getattr(enr_record, 'date_enrolled', None)
                or getattr(enr_record, 'created_at', None)
            )
            if enr_date and isinstance(enr_date, datetime):
                enr_date = enr_date.date()

            if enr_date and baseline_cutoff_date and enr_date > baseline_cutoff_date and enr_date.month == month_num and enr_date.year == year:
                if g == 'M':
                    late_enrollees_m += 1
                else:
                    late_enrollees_f += 1

            status_val = str(
                getattr(enr_record, 'status', '')
                or getattr(s, 'status', '')
                or getattr(s, 'status_remarks', '')
                or getattr(s, 'remarks', '')
                or ''
            ).upper()

            if 'DROP' in status_val or 'DRP' in status_val:
                if g == 'M': drop_outs_m += 1
                else: drop_outs_f += 1
            if 'TRANSFERRED OUT' in status_val or 'T/O' in status_val or status_val == 'TRANSFERRED_OUT':
                if g == 'M': trans_out_m += 1
                else: trans_out_f += 1
            if 'TRANSFERRED IN' in status_val or 'T/I' in status_val or status_val == 'TRANSFERRED_IN':
                if g == 'M': trans_in_m += 1
                else: trans_in_f += 1

        june_enrol_m = max(num_m - late_enrollees_m, 0)
        june_enrol_f = max(num_f - late_enrollees_f, 0)
        june_enrol_total = june_enrol_m + june_enrol_f

        pct_enrol_m = (num_m / june_enrol_m * 100) if june_enrol_m > 0 else (100.0 if num_m > 0 else 0.0)
        pct_enrol_f = (num_f / june_enrol_f * 100) if june_enrol_f > 0 else (100.0 if num_f > 0 else 0.0)
        pct_enrol_total = (total_registered / june_enrol_total * 100) if june_enrol_total > 0 else (100.0 if total_registered > 0 else 0.0)

        # 9. Dynamic School Profile Resolution
        school = SchoolProfile.objects.first()
        school_id_val = str(getattr(school, 'school_id', '') or '').strip()
        school_name_val = str(getattr(school, 'school_name', '') or '').strip()
        division_val = str(getattr(school, 'division', '') or '').strip()
        district_val = str(getattr(school, 'district', '') or '').strip()

        school_head_val = ''
        if school:
            for attr in ['principal_name', 'school_head_name', 'principal', 'school_head']:
                val = getattr(school, attr, None)
                if val:
                    if hasattr(val, 'get_full_name'):
                        school_head_val = val.get_full_name()
                    elif hasattr(val, 'first_name') and hasattr(val, 'last_name'):
                        school_head_val = f"{val.first_name} {val.last_name}".strip()
                    elif isinstance(val, str) and val.strip():
                        school_head_val = val.strip()
                    if school_head_val:
                        break

        if not school_head_val:
            admin_staff = StaffProfile.objects.filter(
                models.Q(position__icontains='Principal') |
                models.Q(position__icontains='School Head') |
                models.Q(position__icontains='Head Teacher') |
                models.Q(position__icontains='Administrator')
            ).filter(is_active=True).first()

            if admin_staff:
                parts = [admin_staff.first_name]
                if admin_staff.middle_name:
                    parts.append(admin_staff.middle_name)
                parts.append(admin_staff.last_name)
                school_head_val = " ".join(parts).strip()

        if not school_head_val or not school_name_val:
            try:
                sf1_meta = get_sf1_data(section_id)
                if isinstance(sf1_meta, dict):
                    if not school_head_val:
                        school_head_val = (
                            sf1_meta.get('school_head')
                            or sf1_meta.get('principal_name')
                            or sf1_meta.get('school_head_name')
                            or sf1_meta.get('certified_correct')
                            or ''
                        )
                    if not school_id_val:
                        school_id_val = str(sf1_meta.get('school_id', '')).strip()
                    if not school_name_val:
                        school_name_val = str(sf1_meta.get('school_name', '')).strip()
                    if not division_val:
                        division_val = str(sf1_meta.get('division', '')).strip()
                    if not district_val:
                        district_val = str(sf1_meta.get('district', '')).strip()
            except Exception as e:
                logger.warning("SF1 metadata fallback failed: %s", e)

        raw_grade = section.grade_level.name if getattr(section, 'grade_level', None) else ''
        grade_level_val = raw_grade

        adviser_val = (
            f"{section.adviser.first_name} {section.adviser.last_name}".strip()
            if getattr(section, 'adviser', None) else ''
        )

        response_data = {
            'school_id': school_id_val,
            'school_name': school_name_val,
            'division': division_val,
            'district': district_val,
            'academic_year': acad_year_val,
            'grade_level': grade_level_val,
            'section_name': str(getattr(section, 'name', '') or '').strip(),
            'month': month_name,
            'year': year,
            'adviser_name': adviser_val.upper(),
            'school_head': school_head_val.upper(),
            'school_days': school_days,
            'has_enrolled_students': has_enrolled_students,
            'notice': notice_message,
            'males': males_data,
            'females': females_data,
            'metrics': {
                'enrolment_june': {
                    'm': june_enrol_m,
                    'f': june_enrol_f,
                    'total': june_enrol_total
                },
                'late_enrolment': {
                    'm': late_enrollees_m,
                    'f': late_enrollees_f,
                    'total': late_enrollees_m + late_enrollees_f
                },
                'registered_end': {
                    'm': num_m,
                    'f': num_f,
                    'total': total_registered
                },
                'percentage_enrolment': {
                    'm': round(pct_enrol_m, 1),
                    'f': round(pct_enrol_f, 1),
                    'total': round(pct_enrol_total, 1)
                },
                'average_daily_attendance': {
                    'm': round(ada_m, 2),
                    'f': round(ada_f, 2),
                    'total': round(ada_total, 2)
                },
                'percentage_attendance': {
                    'm': round(pct_att_m, 1),
                    'f': round(pct_att_f, 1),
                    'total': round(pct_att_total, 1)
                },
                'consecutive_5_absent_count': {
                    'm': consecutive_5_absences_m,
                    'f': consecutive_5_absences_f,
                    'total': consecutive_5_absences_m + consecutive_5_absences_f
                },
                'drop_out': {
                    'm': drop_outs_m,
                    'f': drop_outs_f,
                    'total': drop_outs_m + drop_outs_f
                },
                'transferred_out': {
                    'm': trans_out_m,
                    'f': trans_out_f,
                    'total': trans_out_m + trans_out_f
                },
                'transferred_in': {
                    'm': trans_in_m,
                    'f': trans_in_f,
                    'total': trans_in_m + trans_in_f
                },
            }
        }

        return Response(response_data, status=status.HTTP_200_OK)


SF2ReportAPIView = DepEdSF2DataAPIView


class DepEdSF4DataAPIView(APIView):
    """
    School Form 4 (SF4) Monthly Learner's Movement and Attendance.
    Consolidates school-wide grade levels and advisory sections directly
    from real database records.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        month = request.GET.get('month', 'October').strip().capitalize()
        year = request.GET.get('year', str(timezone.now().year)).strip()
        school_year = request.GET.get('school_year', '').strip()

        try:
            year_val = int(year) if year.isdigit() else timezone.now().year
            data = generate_sf4_data(month_name=month, year=year_val, school_year=school_year)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("SF4 Generation failure: %s", str(e), exc_info=True)
            return Response(
                {'error': f'Failed to compile official School Form 4 report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


SF4ReportAPIView = DepEdSF4DataAPIView
SF4ReportView = DepEdSF4DataAPIView


class ReportAuditLogAPIView(APIView):
    """
    Ingests and records audit events (VIEW, PRINT, PDF, EXCEL, etc.)
    for official DepEd report generation and verification transparency.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data
        report_name = data.get('report_name', 'DepEd Report')
        tracking_id = data.get('document_tracking_id', 'N/A')
        action = data.get('action', 'VIEW')
        printed_at = data.get('printed_at', timezone.now().strftime('%Y-%m-%d %H:%M:%S'))
        username = request.user.username if request.user else 'Authorized Staff'

        logger.info(
            "[REPORT AUDIT] User=%s | Action=%s | Report=%s | TrackingID=%s | Timestamp=%s",
            username, action, report_name, tracking_id, printed_at
        )

        return Response(
            {
                'success': True,
                'message': 'Report generation audit event recorded successfully.',
                'tracking_id': tracking_id
            },
            status=status.HTTP_201_CREATED
        )


class DTRListAPIView(APIView):
    """
    Daily Time Records (Staff Work Attendance).
    Staff can only inspect their own records unless holding Admin rank.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        month = request.GET.get('month', timezone.now().strftime('%Y-%m'))
        try:
            year, month_num = map(int, month.split('-'))
        except ValueError:
            now = timezone.now()
            year, month_num = now.year, now.month

        user_profile = getattr(request.user, 'profile', None)
        is_admin = request.user.is_superuser or (user_profile and user_profile.role == 'ADMIN')
        calling_staff = getattr(user_profile, 'staff', None) if user_profile else None

        logs_qs = StaffGateLog.objects.filter(
            scan_time__year=year,
            scan_time__month=month_num
        ).select_related('staff')

        if not is_admin:
            if not calling_staff:
                return Response([], status=status.HTTP_200_OK)
            logs_qs = logs_qs.filter(staff=calling_staff)

        logs = logs_qs.order_by('-scan_time')

        daily_records = {}
        for l in logs:
            key = (l.staff.employee_id, l.scan_time.date())
            if key not in daily_records:
                daily_records[key] = {
                    'record_id': f"DTR-{l.staff.employee_id}-{l.scan_time.strftime('%Y%m%d')}",
                    'staff_name': f"{l.staff.first_name} {l.staff.last_name}",
                    'date': l.scan_time.strftime('%Y-%m-%d'),
                    'time_in': '—',
                    'time_out': '—',
                    'status': 'COMPLETE'
                }
            if l.direction == 'IN' and daily_records[key]['time_in'] == '—':
                daily_records[key]['time_in'] = l.scan_time.strftime('%I:%M %p')
            elif l.direction == 'OUT':
                daily_records[key]['time_out'] = l.scan_time.strftime('%I:%M %p')

        return Response(list(daily_records.values()), status=status.HTTP_200_OK)


class GeofenceAPIView(APIView):
    """
    Returns campus geofence boundary coordinates dynamically configured in SchoolProfile.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        lat = getattr(school, 'latitude', None) if school else None
        lng = getattr(school, 'longitude', None) if school else None
        radius = getattr(school, 'geofence_radius_meters', None) if school else None

        data = [
            {
                'zone_id': 'ZONE-CAMPUS-MAIN',
                'name': f"{school.school_name} Boundary" if (school and school.school_name) else "Campus Boundary",
                'latitude': lat,
                'longitude': lng,
                'radius': f"{radius} meters" if radius is not None else "Not configured",
                'status': 'ACTIVE PERIMETER' if (lat is not None and lng is not None) else 'UNCONFIGURED'
            }
        ]
        return Response(data, status=status.HTTP_200_OK)


# ============================================================================
# FULL CRUD VIEWSETS
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().order_by('-id')
    serializer_class = StudentSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name']


class TeacherViewSet(viewsets.ModelViewSet):
    queryset = StaffProfile.objects.all().order_by('-id')
    serializer_class = StaffProfileSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'position']


class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsSystemAdminRole]
    filter_backends = [filters.SearchFilter]
    search_fields = ['kiosk_code', 'terminal_name', 'location']


class GatePassViewSet(viewsets.ModelViewSet):
    queryset = GatePass.objects.select_related('staff', 'student').order_by('-valid_from')
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['reason', 'staff__first_name', 'staff__last_name']


class ScheduleViewSet(viewsets.ModelViewSet):
    queryset = Schedule.objects.select_related('section', 'subject', 'teacher').all()
    serializer_class = ScheduleSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['section__name', 'teacher__first_name', 'teacher__last_name']


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'title']


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('profile').all().order_by('-id')
    serializer_class = UserManagementSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email']