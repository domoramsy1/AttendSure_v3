import hmac
import logging
from datetime import timedelta

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


# ==========================================
# ZERO-TRUST PERMISSION POLICIES (RA 10173 & RBAC)
# ==========================================

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
    RA 10173 Minor PII Enforcement:
    Restricts access to sensitive learner demographic data and DepEd SF1 registers.
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


# ==========================================
# HARDWARE & LOGIN RATE THROTTLES
# ==========================================

class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class HardwareGateScanRateThrottle(AnonRateThrottle):
    rate = '180/minute'


# ==========================================
# AUTHENTICATION & OVERVIEW
# ==========================================

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
    Returns active sections. Requires authentication to prevent unauthorized reconnaissance.
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
                'display_label': f"{s.grade_level.name if s.grade_level else 'Grade'} - {s.name}".strip()
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
        sy_label = f"S.Y. {active_sy.code}" if active_sy else f"S.Y. {now.year} - {now.year + 1}"

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
        faculty_dtr_percentage = round((faculty_tapped_today / total_faculty * 100), 1) if total_faculty > 0 else 0

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
                        'section_name': f"{sec.grade_level.name} - {sec.name}",
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


# ==========================================
# HARDWARE GATE & CLASSROOM SCANNERS
# ==========================================

class GateScanAPIView(APIView):
    """
    Ingests physical RFID taps and QR code scans from IoT kiosks.
    Enforces hardware secret verification via constant-time comparison
    and rate throttling against UID enumeration attacks.
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

        # Constant-time hardware secret verification
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

            if student.parent_contact:
                action_text = "entered campus" if direction == "IN" else "left campus"
                terminal_label = kiosk.terminal_name or kiosk.kiosk_code
                sms_body = (
                    f"AttendSure: Your child {student.first_name} {student.last_name} has {action_text} "
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
    Requires authentication to safeguard access logs.
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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate Scanner',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else 'SCANNER-01',
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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate Scanner',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else 'SCANNER-01',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        combined_logs.sort(key=lambda x: x['raw_time'], reverse=True)
        return Response(combined_logs[:150], status=status.HTTP_200_OK)


class ClassroomBatchScanAPIView(APIView):
    """
    Records batch classroom QR/RFID scans.
    Verifies that the caller is assigned to the schedule or holds administrative rank.
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
                        f"AttendSure: {student.first_name} was marked {scan_status} "
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
    Records geofence GPS telemetry from verified faculty mobile clients.
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
                        trigger_reason='Faculty outside geofence boundary without active Gate Pass',
                        defaults={'status': 'PENDING_REVIEW'}
                    )

        return Response({'status': 'Telemetry heartbeat recorded'}, status=status.HTTP_200_OK)


# ==========================================
# INSTITUTIONAL SETTINGS & SCHOOL PROFILE
# ==========================================

class SchoolSettingsAPIView(APIView):
    """
    Pure dynamic settings API for institutional parameters and custom report logos.
    GET: Authenticated staff can inspect configuration.
    PUT/PATCH: Restricted strictly to Administrators under Security by Design (SbD).
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


# ==========================================
# DEPED REPORTS, DTR & GEOFENCE
# ==========================================

class DepEdSF1DataAPIView(APIView):
    """
    Protected DepEd SF1 access: returns purely dynamic records for institutional headers,
    custom logos, adviser/principal signatures, and enrolled learners under RA 10173.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdviserOrAdmin]

    def get(self, request, section_id):
        try:
            section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(id=section_id)
            self.check_object_permissions(request, section)

            data = get_sf1_data(section_id)
            return Response(data, status=status.HTTP_200_OK)
        except Section.DoesNotExist:
            return Response({'error': f'Section with ID {section_id} does not exist.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error("SF1 Generation failure for section %s: %s", section_id, str(e), exc_info=True)
            return Response({'error': 'Failed to compile official DepEd SF1 report'}, status=status.HTTP_400_BAD_REQUEST)


class DTRListAPIView(APIView):
    """
    Civil Service Form 48 Daily Time Records.
    Zero-Trust enforcement: Staff can only inspect their own DTR unless holding Admin rank.
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
                'name': f"{school.school_name} Geofence Boundary" if (school and school.school_name) else "Campus Geofence Boundary",
                'latitude': lat,
                'longitude': lng,
                'radius': f"{radius} meters" if radius is not None else "Not configured",
                'status': 'ACTIVE PERIMETER' if (lat is not None and lng is not None) else 'UNCONFIGURED'
            }
        ]
        return Response(data, status=status.HTTP_200_OK)


# ==========================================
# FULL CRUD VIEWSETS (ROLE-GUARDED FOR REACT ADMIN)
# ==========================================

class StudentViewSet(viewsets.ModelViewSet):
    """
    Protects minor learner records: read-accessible to authenticated staff,
    write/delete strictly governed by system administrators.
    """
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
    """
    Guarded terminal secrets: only system administrators may view or configure hardware kiosks.
    """
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
    """
    Superuser-level user directory administration.
    """
    queryset = User.objects.select_related('profile').all().order_by('-id')
    serializer_class = UserManagementSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email']