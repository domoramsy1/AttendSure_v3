import base64
import calendar
import hmac
import logging
from datetime import date, datetime, timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
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
    GradeLevel,
    IoTKiosk,
    LoafingIncident,
    Schedule,
    SchoolProfile,
    Section,
    SmsOutbox,
    FacultyGateLog,
    FacultyProfile,
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
    FacultyProfileSerializer,
    StudentSerializer,
    SubjectSerializer,
    TelemetryHeartbeatSerializer,
    UserManagementSerializer,
)

logger = logging.getLogger(__name__)


# ============================================================================
# ROLE-BASED ACCESS CONTROL HELPERS & PERMISSIONS (ADMIN & TEACHER ONLY)
# ============================================================================

def get_user_profile(user):
    """Safely retrieves the linked UserProfile regardless of relation name."""
    if not user:
        return None
    return getattr(user, 'profile', None) or getattr(user, 'userprofile', None)


def get_user_role(user):
    """Resolves whether the user is strictly an ADMIN or TEACHER."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'ADMIN'
    profile = get_user_profile(user)
    if profile and hasattr(profile, 'role'):
        return str(profile.role).upper()
    return 'TEACHER'


class IsSystemAdminRole(permissions.BasePermission):
    """
    Grants access exclusively to superusers and accounts with the ADMIN role.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return get_user_role(request.user) == 'ADMIN'


class IsAdviserOrAdmin(permissions.BasePermission):
    """
    Restricts access to learner demographic data and official class registers.
    Only administrators and the designated section adviser may inspect these records.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if get_user_role(request.user) == 'ADMIN':
            return True
        profile = get_user_profile(request.user)
        if profile and profile.role == 'TEACHER' and profile.faculty:
            return getattr(obj, 'adviser_id', None) == profile.faculty.id
        return False


class ReadOnlyOrAdminWrite(permissions.BasePermission):
    """
    ADMIN has full CRUD access (GET, POST, PUT, PATCH, DELETE).
    TEACHER has Read-Only access (GET, HEAD, OPTIONS).
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return get_user_role(request.user) == 'ADMIN'


# ============================================================================
# RATE THROTTLES
# ============================================================================

class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class HardwareGateScanRateThrottle(AnonRateThrottle):
    rate = '180/minute'


# ============================================================================
# AUTHENTICATION & SELF-PROFILE MANAGEMENT
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
        user_profile = get_user_profile(user)
        faculty = getattr(user_profile, 'faculty', None) if user_profile else None

        role = get_user_role(user)
        faculty_id = faculty.employee_id if faculty else None
        faculty_name = f"{faculty.first_name} {faculty.last_name}".strip() if faculty else (user.get_full_name() or user.username)

        return Response({
            'token': token.key,
            'user_id': user.id,
            'username': user.username,
            'role': role,
            'faculty_id': faculty_id,
            'faculty_name': faculty_name,
            'is_superuser': user.is_superuser
        }, status=status.HTTP_200_OK)


class CurrentUserProfileView(APIView):
    """
    Enables authenticated users (ADMIN and TEACHER) to CRUD their own personal profile
    information and photo without requiring third-party intervention.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_faculty_profile(self, user):
        faculty = getattr(user, 'facultyprofile', None)
        if not faculty:
            user_prof = get_user_profile(user)
            faculty = getattr(user_prof, 'faculty', None) if user_prof else None
        if not faculty and user.email:
            faculty = FacultyProfile.objects.filter(email=user.email).first()
        if not faculty and user.first_name and user.last_name:
            faculty = FacultyProfile.objects.filter(
                first_name__iexact=user.first_name,
                last_name__iexact=user.last_name
            ).first()
        return faculty

    def get(self, request):
        user = request.user
        faculty = self._get_faculty_profile(user)
        role = get_user_role(user)

        photo_url = None
        contact_number = ""
        if faculty:
            contact_number = faculty.contact_number or ""
            if faculty.photo:
                try:
                    photo_url = request.build_absolute_uri(faculty.photo.url)
                except Exception:
                    photo_url = None

        return Response({
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": f"{user.first_name} {user.last_name}".strip() or user.username,
            "email": user.email,
            "role": role,
            "contact_number": contact_number,
            "photo": photo_url,
        }, status=status.HTTP_200_OK)

    def put(self, request):
        user = request.user
        data = request.data
        faculty = self._get_faculty_profile(user)

        # 1. Update basic user credentials
        if 'first_name' in data:
            user.first_name = str(data.get('first_name', '')).strip()
        if 'last_name' in data:
            user.last_name = str(data.get('last_name', '')).strip()
        if 'email' in data:
            user.email = str(data.get('email', '')).strip()

        new_password = data.get('password')
        if new_password and len(str(new_password).strip()) >= 6:
            user.set_password(str(new_password).strip())

        user.save()

        # 2. Update linked Faculty Profile (contact and photo)
        raw_photo = data.get('photo')
        if faculty:
            faculty.first_name = user.first_name
            faculty.last_name = user.last_name
            faculty.email = user.email
            if 'contact_number' in data:
                faculty.contact_number = str(data.get('contact_number', '')).strip()

            # Process photo deletion or replacement
            if raw_photo is None and 'photo' in data:
                faculty.photo = None
            elif raw_photo and str(raw_photo).startswith('data:image'):
                try:
                    format_part, img_str = raw_photo.split(';base64,')
                    ext = format_part.split('/')[-1]
                    file_name = f"profile_{user.id}_{int(timezone.now().timestamp())}.{ext}"
                    faculty.photo.save(file_name, ContentFile(base64.b64decode(img_str)), save=False)
                except Exception as e:
                    logger.error("Failed to decode profile photo: %s", e)

            faculty.save()

        photo_url = None
        if faculty and faculty.photo:
            try:
                photo_url = request.build_absolute_uri(faculty.photo.url)
            except Exception:
                photo_url = None

        return Response({
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": f"{user.first_name} {user.last_name}".strip() or user.username,
            "email": user.email,
            "role": get_user_role(user),
            "contact_number": faculty.contact_number if faculty else "",
            "photo": photo_url,
            "message": "Profile updated successfully.",
        }, status=status.HTTP_200_OK)


# ============================================================================
# OVERVIEW & SECTIONS
# ============================================================================

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
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()

        # 1. Real Student Totals
        total_students = Student.objects.filter(is_active=True).count()
        
        present_student_ids = StudentGateLog.objects.filter(
            scan_time__date=today,
            direction='IN'
        ).values_list('student_id', flat=True).distinct()
        
        present_students = len(present_student_ids)
        absent_students = max(0, total_students - present_students)
        attendance_rate = round((present_students / total_students * 100), 1) if total_students > 0 else 0

        # 2. Real Teacher Totals
        total_teachers = FacultyProfile.objects.filter(is_active=True).count()
        present_teachers = FacultyGateLog.objects.filter(
            scan_time__date=today,
            direction='IN'
        ).values_list('faculty_id', flat=True).distinct().count()

        # 3. Real Gate Scans Today
        student_scans = StudentGateLog.objects.filter(scan_time__date=today).count()
        faculty_scans = FacultyGateLog.objects.filter(scan_time__date=today).count()
        total_gate_scans = student_scans + faculty_scans

        # 4. Real Gate Passes and SMS Status
        active_gate_passes = GatePass.objects.filter(status='ACTIVE').count()
        sms_sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
        sms_pending = SmsOutbox.objects.filter(status='PENDING').count()

        # 5. Gate Scanner Terminals
        total_scanners = IoTKiosk.objects.count()
        active_scanners = IoTKiosk.objects.filter(is_active=True).count()

        # 6. Real Hourly Scans Today (6 AM to 5 PM)
        hourly_scans = []
        for hour in range(6, 18):
            hour_str = f"{hour % 12 or 12} {'AM' if hour < 12 else 'PM'}"
            scans_count = StudentGateLog.objects.filter(
                scan_time__date=today,
                scan_time__hour=hour
            ).count()
            hourly_scans.append({
                'hour': hour_str,
                'count': scans_count,
            })

        max_hour_count = max([h['count'] for h in hourly_scans] or [1])

        for h in hourly_scans:
            h['height'] = round((h['count'] / max_hour_count * 100)) if max_hour_count > 0 and h['count'] > 0 else 0
            h['is_peak'] = h['count'] == max_hour_count and h['count'] > 0

        # 7. Real Grade Level Counts
        grade_levels_data = []
        try:
            grades = GradeLevel.objects.all().order_by('level_order')
            for g in grades:
                grade_student_ids = Enrollment.objects.filter(
                    section__grade_level=g,
                    status='ENROLLED'
                ).values_list('student_id', flat=True).distinct()

                total_in_grade = len(grade_student_ids)
                present_in_grade = StudentGateLog.objects.filter(
                    scan_time__date=today,
                    direction='IN',
                    student_id__in=grade_student_ids
                ).values_list('student_id', flat=True).distinct().count()

                pct = round((present_in_grade / total_in_grade * 100)) if total_in_grade > 0 else 0

                grade_levels_data.append({
                    'grade': g.name,
                    'present': present_in_grade,
                    'total': total_in_grade,
                    'percentage': pct,
                })
        except Exception:
            grade_levels_data = []

        # 8. Real Recent Gate Scans (Latest 5 logs)
        recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:5]
        recent_scans_data = []
        for log in recent_logs:
            enrollment = Enrollment.objects.filter(student=log.student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = f"{enrollment.section.grade_level.code} - {enrollment.section.name}" if enrollment else "Student"

            recent_scans_data.append({
                'id': log.id,
                'person_name': f"{log.student.first_name} {log.student.last_name}",
                'role_label': 'Student',
                'grade_section': section_label,
                'direction': log.direction,
                'scan_time': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'scan_method': log.scan_method,
            })

        return Response({
            'total_students': total_students,
            'students_present': present_students,
            'students_absent': absent_students,
            'attendance_rate': attendance_rate,
            'faculty_on_duty': present_teachers,
            'total_faculty': total_teachers,
            'gate_scans_today': total_gate_scans,
            'active_gate_passes': active_gate_passes,
            'sms_sent_today': sms_sent_today,
            'sms_pending_count': sms_pending,
            'kiosks_online': active_scanners,
            'total_kiosks': total_scanners,
            'hourly_scans': hourly_scans,
            'grade_levels': grade_levels_data,
            'recent_scans': recent_scans_data,
        })


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

        # Check Faculty Record
        faculty = FacultyProfile.objects.filter(
            models.Q(rfid_uid=raw_id) | models.Q(qr_token=raw_id),
            is_active=True
        ).first()

        if faculty:
            recent_log = FacultyGateLog.objects.filter(
                faculty=faculty,
                scan_time__date=now.date()
            ).order_by('-scan_time').first()

            if recent_log and (now - recent_log.scan_time) < timedelta(minutes=debounce_minutes):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STAFF',
                    'name': f"{faculty.first_name} {faculty.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

            direction = 'OUT' if (recent_log and recent_log.direction == 'IN') else 'IN'
            new_log = FacultyGateLog.objects.create(
                faculty=faculty,
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
                'name': f"{faculty.first_name} {faculty.last_name}".strip(),
                'position': faculty.position or '',
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
    Returns unified, chronological gate transactions for Students and Faculty.
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
            faculty_qs = FacultyGateLog.objects.select_related('faculty', 'kiosk').order_by('-scan_time')[:150]
            for log in faculty_qs:
                if direction != 'ALL' and log.direction != direction:
                    continue
                name = f"{log.faculty.first_name} {log.faculty.last_name}".strip()
                emp_id = log.faculty.employee_id
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

        user_profile = get_user_profile(request.user)
        teacher = getattr(user_profile, 'faculty', None) if user_profile else None
        is_admin = get_user_role(request.user) == 'ADMIN'

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
    Ingests GPS telemetry with Zero-Trust Device Binding:
    1. Rejects unverified/mismatched hardware devices.
    2. Rejects mock/fake GPS.
    3. Calculates distance server-side.
    4. Cross-verifies with physical gate logs.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TelemetryHeartbeatSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        user_profile = getattr(request.user, 'profile', None) or getattr(request.user, 'userprofile', None)
        faculty = getattr(user_profile, 'faculty', None) if user_profile else None

        if not faculty:
            return Response({'error': 'No linked Faculty Profile found for this account.'}, status=status.HTTP_400_BAD_REQUEST)

        incoming_device_id = str(data.get('client_device_id', '')).strip()

        # ====================================================================
        # ANTI-CHEAT: STRICT DEVICE BINDING CHECK
        # ====================================================================
        if not incoming_device_id:
            return Response(
                {'error': 'Device identifier missing. Telemetry must be sent from an authorized app.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Automatic first-time pairing if no device is registered yet
        if not faculty.bound_device_id:
            # Check if this phone is already bound to another teacher
            device_in_use = FacultyProfile.objects.filter(bound_device_id=incoming_device_id).exclude(id=faculty.id).first()
            if device_in_use:
                LoafingIncident.objects.create(
                    faculty=faculty,
                    incident_date=timezone.localdate(),
                    trigger_reason=f"SECURITY ALERT: Attempted to use phone already registered to {device_in_use.first_name} {device_in_use.last_name}.",
                    status='FLAGGED_FRAUD'
                )
                return Response(
                    {'error': 'This phone is already bound to another faculty member. Multi-account phone sharing is prohibited.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            faculty.bound_device_id = incoming_device_id
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=['bound_device_id', 'device_bound_at'])

        # 2. Rejection if device ID does not match the bound phone
        elif faculty.bound_device_id != incoming_device_id:
            LoafingIncident.objects.create(
                faculty=faculty,
                incident_date=timezone.localdate(),
                trigger_reason="SECURITY ALERT: Telemetry sent from an unauthorized / secondary mobile device.",
                status='FLAGGED_FRAUD'
            )
            return Response(
                {
                    'error': 'Unauthorized Device. This account is locked to a different mobile phone. Contact an Administrator to reset your device pairing.',
                    'code': 'DEVICE_MISMATCH'
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # ====================================================================
        # ANTI-CHEAT: MOCK / FAKE GPS APP DETECTION
        # ====================================================================
        if data.get('is_mock_location', False):
            LoafingIncident.objects.create(
                faculty=faculty,
                incident_date=timezone.localdate(),
                trigger_reason='SECURITY VIOLATION: Mock Location / Fake GPS app detected.',
                status='FLAGGED_FRAUD'
            )
            return Response({
                'security_alert': 'Fake GPS detected. Spoofing attendance is strictly prohibited.',
                'is_inside_geofence': False
            }, status=status.HTTP_403_FORBIDDEN)

        # ====================================================================
        # PROCEED WITH HAVERSINE DISTANCE & GATE CHECK
        # ====================================================================
        server_now = timezone.now()
        today = server_now.date()
        client_lat = data['latitude']
        client_lng = data['longitude']
        battery = data.get('battery_level', 100)

        school = SchoolProfile.objects.first()
        campus_lat = float(getattr(school, 'latitude', 8.480190) or 8.480190)
        campus_lng = float(getattr(school, 'longitude', 124.663690) or 124.663690)
        allowed_radius = float(getattr(school, 'geofence_radius_meters', 250) or 250)

        distance_to_center = haversine_distance_meters(client_lat, client_lng, campus_lat, campus_lng)
        is_inside_perimeter = distance_to_center <= allowed_radius

        latest_gate_log = FacultyGateLog.objects.filter(
            faculty=faculty,
            scan_time__date=today
        ).order_by('-scan_time').first()

        physically_tapped_out = bool(latest_gate_log and latest_gate_log.direction == 'OUT')

        FacultyHeartbeat.objects.create(
            faculty=faculty,
            latitude=client_lat,
            longitude=client_lng,
            battery_level=battery,
            is_inside_geofence=(is_inside_perimeter and not physically_tapped_out),
            recorded_at=server_now
        )

        has_active_pass = GatePass.objects.filter(
            faculty=faculty,
            status='ACTIVE',
            valid_from__lte=server_now,
            valid_to__gte=server_now
        ).exists()

        if physically_tapped_out and not has_active_pass:
            LoafingIncident.objects.get_or_create(
                faculty=faculty,
                incident_date=today,
                trigger_reason="Faculty physically tapped OUT at gate terminal without active Gate Pass.",
                defaults={'status': 'PENDING_REVIEW'}
            )
        elif not is_inside_perimeter and not has_active_pass:
            outside_count = FacultyHeartbeat.objects.filter(
                faculty=faculty,
                is_inside_geofence=False,
                recorded_at__gte=server_now - timedelta(minutes=5)
            ).count()

            if outside_count >= 2:
                LoafingIncident.objects.get_or_create(
                    faculty=faculty,
                    incident_date=today,
                    trigger_reason=f"Exceeded perimeter boundary ({int(distance_to_center)}m from campus center) without active Gate Pass.",
                    defaults={'status': 'PENDING_REVIEW'}
                )

        return Response({
            'status': 'Telemetry verified and stored.',
            'device_bound': True,
            'distance_meters': round(distance_to_center, 1),
            'is_inside_perimeter': is_inside_perimeter and not physically_tapped_out,
            'server_time': server_now.strftime('%I:%M:%S %p')
        }, status=status.HTTP_200_OK)


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes exact spherical distance in meters between two coordinates.
    Runs on the local server to eliminate client-side distance tampering.
    """
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c



class ResetFacultyDeviceBindingAPIView(APIView):
    """
    Allows Administrators to unbind a teacher's lost or replaced phone.
    """
    permission_classes = [IsSystemAdminRole]

    def post(self, request, faculty_id):
        try:
            faculty = FacultyProfile.objects.get(id=faculty_id)
            old_device = faculty.bound_device_id
            faculty.bound_device_id = None
            faculty.device_model = None
            faculty.device_bound_at = None
            faculty.save()

            return Response({
                'success': True,
                'message': f"Device binding for {faculty.first_name} {faculty.last_name} has been reset. They can now pair a new phone on next login.",
                'released_device_id': old_device
            }, status=status.HTTP_200_OK)
        except FacultyProfile.DoesNotExist:
            return Response({'error': 'Faculty member not found.'}, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# INSTITUTIONAL SETTINGS & SCHOOL PROFILE
# ============================================================================

class SchoolSettingsAPIView(APIView):
    """
    Settings API for institutional parameters and custom report logos.
    GET: Authenticated faculty can inspect configuration.
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
        if get_user_role(request.user) != 'ADMIN':
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

        num_calendar_days = calendar.monthrange(year, month_num)[1]
        weekday_map = {0: 'M', 1: 'T', 2: 'W', 3: 'TH', 4: 'F'}

        school_days = []
        for d in range(1, num_calendar_days + 1):
            cur_date = date(year, month_num, d)
            if cur_date.weekday() < 5:
                school_days.append({
                    'dateNumber': d,
                    'dayOfWeek': weekday_map[cur_date.weekday()],
                    'fullDate': cur_date.strftime('%Y-%m-%d')
                })

        start_month_date = date(year, month_num, 1)
        end_month_date = date(year, month_num, num_calendar_days)

        outside_academic_year = False
        if acad_year_obj and acad_year_obj.start_date and acad_year_obj.end_date:
            if end_month_date < acad_year_obj.start_date or start_month_date > acad_year_obj.end_date:
                outside_academic_year = True

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

        has_enrolled_students = len(students) > 0
        notice_message = ""
        if not has_enrolled_students:
            notice_message = (
                f"Notice: There are no students enrolled in Section {section.name} "
                f"for the selected period ({month_name} {year}, School Year {acad_year_val})."
            )

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
            admin_faculty = FacultyProfile.objects.filter(
                models.Q(position__icontains='Principal') |
                models.Q(position__icontains='School Head') |
                models.Q(position__icontains='Head Teacher') |
                models.Q(position__icontains='Administrator')
            ).filter(is_active=True).first()

            if admin_faculty:
                parts = [admin_faculty.first_name]
                if admin_faculty.middle_name:
                    parts.append(admin_faculty.middle_name)
                parts.append(admin_faculty.last_name)
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

        grade_level_val = section.grade_level.name if getattr(section, 'grade_level', None) else ''
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
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data
        report_name = data.get('report_name', 'DepEd Report')
        tracking_id = data.get('document_tracking_id', 'N/A')
        action = data.get('action', 'VIEW')
        printed_at = data.get('printed_at', timezone.now().strftime('%Y-%m-%d %H:%M:%S'))
        username = request.user.username if request.user else 'Authorized Faculty'

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
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        month = request.GET.get('month', timezone.now().strftime('%Y-%m'))
        try:
            year, month_num = map(int, month.split('-'))
        except ValueError:
            now = timezone.now()
            year, month_num = now.year, now.month

        is_admin = get_user_role(request.user) == 'ADMIN'
        user_profile = get_user_profile(request.user)
        calling_faculty = getattr(user_profile, 'faculty', None) if user_profile else None

        logs_qs = FacultyGateLog.objects.filter(
            scan_time__year=year,
            scan_time__month=month_num
        ).select_related('faculty')

        if not is_admin:
            if not calling_faculty:
                return Response([], status=status.HTTP_200_OK)
            logs_qs = logs_qs.filter(faculty=calling_faculty)

        logs = logs_qs.order_by('-scan_time')

        daily_records = {}
        for l in logs:
            key = (l.faculty.employee_id, l.scan_time.date())
            if key not in daily_records:
                daily_records[key] = {
                    'record_id': f"DTR-{l.faculty.employee_id}-{l.scan_time.strftime('%Y%m%d')}",
                    'faculty_name': f"{l.faculty.first_name} {l.faculty.last_name}",
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
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        lat = getattr(school, 'latitude', None) if school else None
        lng = getattr(school, 'longitude', None) if school else None
        radius = getattr(school, 'geofence_radius_meters', None) if school else None

        server_now = timezone.now()
        today = timezone.localdate()

        incidents_today = LoafingIncident.objects.filter(incident_date=today).count()
        spoof_attempts_blocked = LoafingIncident.objects.filter(
            incident_date=today,
            trigger_reason__icontains='Mock Location'
        ).count()

        cutoff_active = server_now - timedelta(minutes=15)
        active_faculty_qs = FacultyProfile.objects.filter(is_active=True)

        roster = []
        verified_inside_count = 0
        missing_heartbeat_count = 0

        for faculty in active_faculty_qs:
            last_gate = FacultyGateLog.objects.filter(
                faculty=faculty,
                scan_time__date=today
            ).order_by('-scan_time').first()

            last_ping = FacultyHeartbeat.objects.filter(
                faculty=faculty,
                recorded_at__date=today
            ).order_by('-recorded_at').first()

            has_pass = GatePass.objects.filter(
                faculty=faculty,
                status='ACTIVE',
                valid_from__lte=server_now,
                valid_to__gte=server_now
            ).exists()

            status_label = "NOT_ON_DUTY"
            distance_str = "—"

            if last_gate and last_gate.direction == 'IN':
                if has_pass:
                    status_label = "AUTHORIZED_LEAVE"
                elif last_ping:
                    if last_ping.recorded_at < cutoff_active:
                        status_label = "HEARTBEAT_LOST"
                        missing_heartbeat_count += 1
                    elif last_ping.is_inside_geofence:
                        status_label = "VERIFIED_INSIDE"
                        verified_inside_count += 1
                    else:
                        status_label = "PERIMETER_BREACH"
                else:
                    status_label = "HEARTBEAT_LOST"
                    missing_heartbeat_count += 1
            elif last_gate and last_gate.direction == 'OUT':
                status_label = "AUTHORIZED_LEAVE" if has_pass else "OFF_CAMPUS"

            if last_ping and lat and lng:
                dist = haversine_distance_meters(last_ping.latitude, last_ping.longitude, float(lat), float(lng))
                distance_str = f"{int(dist)}m"

            roster.append({
                'id': faculty.id,
                'faculty_name': f"{faculty.first_name} {faculty.last_name}".strip(),
                'employee_id': faculty.employee_id,
                'position': faculty.position or "Faculty",
                'status': status_label,
                'distance': distance_str,
                'battery': f"{last_ping.battery_level}%" if last_ping else "—",
                'last_seen': timezone.localtime(last_ping.recorded_at).strftime('%I:%M %p') if last_ping else "No Ping",
                # Device Binding Information
                'device_model': faculty.device_model or ("Registered Phone" if faculty.bound_device_id else None),
                'bound_device_id': faculty.bound_device_id,
                'device_bound_at': timezone.localtime(faculty.device_bound_at).strftime('%b %d, %Y') if faculty.device_bound_at else None,
            })

        recent_breaches = LoafingIncident.objects.filter(incident_date=today).select_related('faculty').order_by('-id')[:5]
        breach_logs = [
            {
                'id': b.id,
                'faculty_name': f"{b.faculty.first_name} {b.faculty.last_name}".strip() if b.faculty else "Unknown Faculty",
                'reason': b.trigger_reason,
                'status': b.status,
                'time': timezone.localtime(b.created_at).strftime('%I:%M %p') if hasattr(b, 'created_at') else "Today",
            }
            for b in recent_breaches
        ]

        return Response({
            'zone_id': 'ZONE-CAMPUS-MAIN',
            'name': school.school_name if (school and school.school_name) else "Lapasan NHS Campus Perimeter",
            'latitude': float(lat) if lat is not None else 8.480190,
            'longitude': float(lng) if lng is not None else 124.663690,
            'radius_meters': int(radius) if radius is not None else 250,
            'is_configured': bool(lat is not None and lng is not None),
            'verified_inside': verified_inside_count,
            'missing_heartbeats': missing_heartbeat_count,
            'spoof_attempts_blocked': spoof_attempts_blocked,
            'incidents_today': incidents_today,
            'faculty_roster': roster,
            'recent_breaches': breach_logs,
        }, status=status.HTTP_200_OK)


class ResetFacultyDeviceBindingAPIView(APIView):
    """
    Unlocks a teacher's account when their phone is replaced or lost.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, faculty_id):
        user_role = getattr(getattr(request.user, 'profile', None), 'role', 'TEACHER')
        if user_role != 'ADMIN' and not request.user.is_superuser:
            return Response({'error': 'Unauthorized. Admin permissions required.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            faculty = FacultyProfile.objects.get(id=faculty_id)
            old_device = faculty.bound_device_id
            faculty.bound_device_id = None
            faculty.device_model = None
            faculty.device_bound_at = None
            faculty.save()

            return Response({
                'success': True,
                'message': f"Device lock for {faculty.first_name} {faculty.last_name} has been reset. They can now pair a new phone.",
                'released_device_id': old_device
            }, status=status.HTTP_200_OK)
        except FacultyProfile.DoesNotExist:
            return Response({'error': 'Faculty record not found.'}, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# FULL CRUD VIEWSETS (ADMIN FULL CRUD, TEACHER RESTRICTED / READ-ONLY)
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    """
    ADMIN: Full CRUD (Enroll, Edit, Delete).
    TEACHER: Read-Only (Inspect class rosters).
    """
    queryset = Student.objects.all().order_by('-id')
    serializer_class = StudentSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name']


class TeacherViewSet(viewsets.ModelViewSet):
    """
    ADMIN: Full CRUD (Add Faculty, Update Profiles, Deactivate).
    TEACHER: Read-Only (Faculty Directory inspection).
    """
    queryset = FacultyProfile.objects.all().order_by('-id')
    serializer_class = FacultyProfileSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'position']


class ScannerViewSet(viewsets.ModelViewSet):
    """
    ADMIN: Full CRUD (Register terminals, update keys, remove hardware).
    TEACHER: Restricted.
    """
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsSystemAdminRole]
    filter_backends = [filters.SearchFilter]
    search_fields = ['kiosk_code', 'terminal_name', 'location']


class GatePassViewSet(viewsets.ModelViewSet):
    """
    ADMIN & TEACHER: Authenticated access to issue and verify exit passes.
    """
    queryset = GatePass.objects.select_related('faculty', 'student').order_by('-valid_from')
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['reason', 'faculty__first_name', 'faculty__last_name']


class ScheduleViewSet(viewsets.ModelViewSet):
    """
    ADMIN: Full CRUD (Create & edit timetables, section loads).
    TEACHER: Read-Only (Inspect assigned timetable).
    """
    queryset = Schedule.objects.select_related('section', 'subject', 'teacher').all()
    serializer_class = ScheduleSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['section__name', 'teacher__first_name', 'teacher__last_name']


class SubjectViewSet(viewsets.ModelViewSet):
    """
    ADMIN: Full CRUD (Add learning areas, edit course codes).
    TEACHER: Read-Only.
    """
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'title']


class UserManagementViewSet(viewsets.ModelViewSet):
    """
    ADMIN: Full CRUD over system user accounts.
    TEACHER: Blocked completely.
    """
    queryset = User.objects.select_related('profile').all().order_by('-id')
    serializer_class = UserManagementSerializer
    permission_classes = [IsSystemAdminRole]
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email']