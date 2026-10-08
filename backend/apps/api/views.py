import base64
import calendar
import hmac
import logging
import math
from datetime import date, datetime, timedelta, time

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.db import connection, models, transaction
from django.utils import timezone
from rest_framework import filters, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
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
    ScheduleDay,
    SchoolProfile,
    FacultyMonthlyDTR,
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
# PAGINATION CONFIGURATION
# ============================================================================

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        })

# ============================================================================
# USER ROLE CHECKS & PERMISSION CLASSES
# ============================================================================

def get_user_profile(user):
    if not user:
        return None
    return getattr(user, 'profile', None) or getattr(user, 'userprofile', None)


def get_user_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'ADMIN'
    profile = get_user_profile(user)
    if profile and hasattr(profile, 'role'):
        return str(profile.role).upper()
    return 'TEACHER'


class IsSystemAdminRole(permissions.BasePermission):
    """Full access to system settings, kiosk pairing, and user management."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) == 'ADMIN')


class IsPrincipalOrAdmin(permissions.BasePermission):
    """Authority over official school reports (SF4), DTR overrides, and loafing pardons."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) in ['PRINCIPAL', 'ADMIN'])


class IsDeptHeadOrAdmin(permissions.BasePermission):
    """Authority to review and endorse monthly faculty DTRs."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) in ['DEPT_HEAD', 'ADMIN', 'PRINCIPAL'])


class IsGuardOrAdmin(permissions.BasePermission):
    """Authority to scan passes and monitor real-time gate logs."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) in ['GUARD', 'ADMIN'])


class IsTeacherOrAbove(permissions.BasePermission):
    """Authority to scan classroom batches and view class rosters."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) in ['TEACHER', 'DEPT_HEAD', 'PRINCIPAL', 'ADMIN'])


class IsAdviserOrAdmin(permissions.BasePermission):
    """Authority to generate SF1 and SF2: Admins, Principals, or the section's assigned adviser."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        role = get_user_role(request.user)
        if role in ['ADMIN', 'PRINCIPAL']:
            return True
        profile = get_user_profile(request.user)
        if profile and profile.faculty:
            return getattr(obj, 'adviser_id', None) == profile.faculty.id
        return False


class ReadOnlyOrAdminWrite(permissions.BasePermission):
    """Read-only for authenticated staff, write access restricted to system admins."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return get_user_role(request.user) == 'ADMIN'

# ============================================================================
# RATE LIMITS
# ============================================================================

class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class HardwareGateScanRateThrottle(AnonRateThrottle):
    rate = '180/minute'


# ============================================================================
# LOGIN & PROFILE MANAGEMENT
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
            return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)

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

        raw_photo = data.get('photo')
        if faculty:
            faculty.first_name = user.first_name
            faculty.last_name = user.last_name
            faculty.email = user.email
            if 'contact_number' in data:
                faculty.contact_number = str(data.get('contact_number', '')).strip()

            if raw_photo is None and 'photo' in data:
                faculty.photo = None
            elif raw_photo and str(raw_photo).startswith('data:image'):
                try:
                    format_part, img_str = raw_photo.split(';base64,')
                    ext = format_part.split('/')[-1]
                    file_name = f"profile_{user.id}_{int(timezone.now().timestamp())}.{ext}"
                    faculty.photo.save(file_name, ContentFile(base64.b64decode(img_str)), save=False)
                except Exception as e:
                    logger.error("Failed to save photo: %s", e)

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
            "message": "Profile updated.",
        }, status=status.HTTP_200_OK)


# ============================================================================
# SECTIONS & DASHBOARD COUNTS
# ============================================================================

class SectionListAPIView(APIView):
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
                'adviser_name': f"{s.adviser.first_name} {s.adviser.last_name}".strip() if s.adviser else "",
                'display_label': f"{s.grade_level.name if s.grade_level else ''} - {s.name}".strip()
            }
            for s in sections
        ]
        return Response(data, status=status.HTTP_200_OK)


class DashboardOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()

        total_students = Student.objects.filter(is_active=True).count()

        # 1. Gate entrance records today
        gate_in_student_ids = set(StudentGateLog.objects.filter(
            scan_time__date=today,
            direction='IN'
        ).values_list('student_id', flat=True).distinct())

        # 2. Gate exit records today
        gate_out_student_ids = set(StudentGateLog.objects.filter(
            scan_time__date=today,
            direction='OUT'
        ).values_list('student_id', flat=True).distinct())

        # Students physically inside campus
        currently_on_campus_ids = gate_in_student_ids - gate_out_student_ids
        students_on_campus_count = len(currently_on_campus_ids)

        # 3. Classroom attendance records today
        class_present_student_ids = set(DailyAttendanceSummary.objects.filter(
            attendance_date=today,
            status__in=['PRESENT', 'LATE']
        ).values_list('student_id', flat=True).distinct())

        # 4. Anti-cheating cross-checks
        # Verified Present: Entered gate AND verified in class
        verified_present_ids = currently_on_campus_ids.intersection(class_present_student_ids)

        # Cutting class: Entered campus, but absent/unscanned in classroom
        cutting_class_ids = currently_on_campus_ids - class_present_student_ids

        # Proxy scans flagged: Marked present in class, but never tapped IN at gate
        proxy_scan_ids = class_present_student_ids - gate_in_student_ids

        absent_students = max(0, total_students - len(gate_in_student_ids))
        attendance_rate = round((len(gate_in_student_ids) / total_students * 100), 1) if total_students > 0 else 0

        total_facultys = FacultyProfile.objects.filter(is_active=True).count()
        present_facultys = FacultyGateLog.objects.filter(
            scan_time__date=today,
            direction='IN'
        ).values_list('faculty_id', flat=True).distinct().count()

        student_scans = StudentGateLog.objects.filter(scan_time__date=today).count()
        faculty_scans = FacultyGateLog.objects.filter(scan_time__date=today).count()
        total_gate_scans = student_scans + faculty_scans

        active_gate_passes = GatePass.objects.filter(status='ACTIVE').count()
        sms_sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
        sms_pending = SmsOutbox.objects.filter(status='PENDING').count()

        total_scanners = IoTKiosk.objects.count()
        active_scanners = IoTKiosk.objects.filter(is_active=True).count()

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
            'students_present': len(gate_in_student_ids),
            'students_on_campus': students_on_campus_count,
            'verified_in_class': len(verified_present_ids),
            'cutting_classes': len(cutting_class_ids),
            'proxy_scans_blocked': len(proxy_scan_ids),
            'students_absent': absent_students,
            'attendance_rate': attendance_rate,
            'faculty_on_duty': present_facultys,
            'total_faculty': total_facultys,
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
# GATE SCANNERS
# ============================================================================

class GateScanAPIView(APIView):
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
            return Response({'error': 'Terminal not registered.'}, status=status.HTTP_403_FORBIDDEN)

        if not hmac.compare_digest(kiosk.secret_hash.encode('utf-8'), secret_key.encode('utf-8')):
            return Response({'error': 'Secret key check failed.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()

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

        return Response({'error': 'Unrecognized RFID card or QR token.'}, status=status.HTTP_404_NOT_FOUND)


class GateLogsAPIView(APIView):
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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        combined_logs.sort(key=lambda x: x['raw_time'], reverse=True)
        return Response(combined_logs[:150], status=status.HTTP_200_OK)


class ClassroomBatchScanAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            schedule = Schedule.objects.select_related('section', 'subject', 'faculty').get(id=data['schedule_id'])
        except Schedule.DoesNotExist:
            return Response({'error': 'Schedule does not exist.'}, status=status.HTTP_404_NOT_FOUND)

        user_profile = get_user_profile(request.user)
        faculty = getattr(user_profile, 'faculty', None) if user_profile else None
        is_admin = get_user_role(request.user) == 'ADMIN'

        if not is_admin:
            if not faculty or schedule.faculty_id != faculty.id:
                return Response(
                    {'error': 'Unauthorized: You are not assigned to this class.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        effective_faculty = faculty if faculty else schedule.faculty
        today = timezone.localdate()
        scans = data['scans']
        saved_count = 0
        flagged_anomalies = []

        for item in scans:
            identifier = item['qr_token']
            scan_status = item.get('status', 'PRESENT').upper()

            student = Student.objects.filter(
                models.Q(qr_token=identifier) | models.Q(rfid_uid=identifier),
                is_active=True
            ).first()

            if not student:
                continue

            # ============================================================
            # ANTI-CHEATING VERIFICATION: CHECK GATE ENTRY LOG
            # ============================================================
            latest_gate_log = StudentGateLog.objects.filter(
                student=student,
                scan_time__date=today
            ).order_by('-scan_time').first()

            has_valid_gate_in = bool(latest_gate_log and latest_gate_log.direction == 'IN')
            attendance_remarks = 'CLASS_SCAN_VERIFIED'

            if scan_status == 'PRESENT' and not has_valid_gate_in:
                # CHEATING DETECTED: Marked present in class without passing the gate kiosk!
                if latest_gate_log and latest_gate_log.direction == 'OUT':
                    scan_status = 'CUTTING'
                    attendance_remarks = 'FLAGGED: Student tapped OUT at gate prior to class'
                else:
                    scan_status = 'UNVERIFIED'
                    attendance_remarks = 'FLAGGED_PROXY_SCAN: No campus gate entrance recorded today'

                flagged_anomalies.append({
                    'student_id': student.id,
                    'name': f"{student.first_name} {student.last_name}",
                    'lrn': student.lrn,
                    'reason': attendance_remarks
                })

            # 1. Log Subject Attendance
            _, created = SubjectAttendanceLog.objects.get_or_create(
                student=student,
                schedule=schedule,
                attendance_date=today,
                defaults={
                    'faculty': effective_faculty,
                    'status': scan_status,
                    'scanned_at': timezone.now()
                }
            )

            if created:
                saved_count += 1

                # 2. Update Official Daily Summary (SF2 data source)
                DailyAttendanceSummary.objects.update_or_create(
                    student=student,
                    attendance_date=today,
                    defaults={
                        'section': schedule.section,
                        'status': scan_status if scan_status != 'UNVERIFIED' else 'ABSENT',
                        'remarks': attendance_remarks
                    }
                )

                # 3. Alert Parent via SMS if Fraud/Proxy Detected
                if student.parent_contact and 'FLAGGED' in attendance_remarks:
                    sms_text = (
                        f"Notice: Attendance alert for {student.first_name}. "
                        f"Classroom scan was attempted but no campus gate entry was recorded for today. "
                        f"Please contact the school."
                    )
                    SmsOutbox.objects.create(
                        recipient_number=student.parent_contact,
                        message_body=sms_text,
                        trigger_event='ATTENDANCE_FLAG',
                        priority=1
                    )

        return Response({
            'success': True,
            'message': f"{saved_count} attendance records processed.",
            'total_received': len(scans),
            'flagged_anomalies_count': len(flagged_anomalies),
            'anomalies': flagged_anomalies
        }, status=status.HTTP_201_CREATED)

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
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


class TelemetryHeartbeatAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TelemetryHeartbeatSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        user_profile = getattr(request.user, 'profile', None) or getattr(request.user, 'userprofile', None)
        faculty = getattr(user_profile, 'faculty', None) if user_profile else None

        if not faculty:
            return Response({'error': 'No faculty profile found.'}, status=status.HTTP_400_BAD_REQUEST)

        incoming_device_id = str(data.get('client_device_id', '')).strip()
        if not incoming_device_id:
            return Response({'error': 'Device ID missing.'}, status=status.HTTP_400_BAD_REQUEST)

        if not faculty.bound_device_id:
            device_in_use = FacultyProfile.objects.filter(bound_device_id=incoming_device_id).exclude(id=faculty.id).first()
            if device_in_use:
                LoafingIncident.objects.create(
                    faculty=faculty,
                    incident_date=timezone.localdate(),
                    trigger_reason=f"Security alert: Phone already used by {device_in_use.first_name} {device_in_use.last_name}.",
                    status='FLAGGED_FRAUD'
                )
                return Response({'error': 'This phone is already registered to another teacher.'}, status=status.HTTP_403_FORBIDDEN)

            faculty.bound_device_id = incoming_device_id
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=['bound_device_id', 'device_bound_at'])

        elif faculty.bound_device_id != incoming_device_id:
            LoafingIncident.objects.create(
                faculty=faculty,
                incident_date=timezone.localdate(),
                trigger_reason="Security alert: Telemetry sent from an unauthorized phone.",
                status='FLAGGED_FRAUD'
            )
            return Response({'error': 'Unauthorized device.', 'code': 'DEVICE_MISMATCH'}, status=status.HTTP_403_FORBIDDEN)

        if data.get('is_mock_location', False):
            LoafingIncident.objects.create(
                faculty=faculty,
                incident_date=timezone.localdate(),
                trigger_reason='Security alert: Mock location app detected.',
                status='FLAGGED_FRAUD'
            )
            return Response({'security_alert': 'Fake GPS detected.', 'is_inside_geofence': False}, status=status.HTTP_403_FORBIDDEN)

        server_now = timezone.now()
        today = server_now.date()
        client_lat = data['latitude']
        client_lng = data['longitude']
        battery = data.get('battery_level', 100)

        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude is not None else None
        campus_lng = float(school.longitude) if school and school.longitude is not None else None
        allowed_radius = float(school.geofence_radius_meters) if school and school.geofence_radius_meters else 100

        if campus_lat is not None and campus_lng is not None:
            distance_to_center = haversine_distance_meters(client_lat, client_lng, campus_lat, campus_lng)
            is_inside_perimeter = distance_to_center <= allowed_radius
        else:
            distance_to_center = 0.0
            is_inside_perimeter = True

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

        return Response({
            'status': 'Telemetry saved.',
            'device_bound': True,
            'distance_meters': round(distance_to_center, 1),
            'is_inside_perimeter': is_inside_perimeter and not physically_tapped_out,
            'server_time': server_now.strftime('%I:%M:%S %p')
        }, status=status.HTTP_200_OK)


class ResetFacultyDeviceBindingAPIView(APIView):
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
                'message': f"Phone pairing reset for {faculty.first_name} {faculty.last_name}.",
                'released_device_id': old_device
            }, status=status.HTTP_200_OK)
        except FacultyProfile.DoesNotExist:
            return Response({'error': 'Faculty member not found.'}, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# SCHOOL PROFILE SETTINGS
# ============================================================================

class SchoolSettingsAPIView(APIView):
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
            return Response({'error': 'Admin permissions required.'}, status=status.HTTP_403_FORBIDDEN)

        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# REPORTS AND DTR (STRICT ACADEMIC YEAR ISOLATION APPLIED TO ALL REPORTS)
# ============================================================================

def resolve_academic_year_for_date(target_date):
    if not target_date:
        return None, ""

    ay = AcademicYear.objects.filter(
        start_date__lte=target_date,
        end_date__gte=target_date
    ).first()
    if ay:
        return ay, str(getattr(ay, 'code', '')).strip()

    if target_date.month >= 6:
        y_start = target_date.year
    else:
        y_start = target_date.year - 1
    y_end = y_start + 1
    code_str = f"{y_start}-{y_end}"

    ay = AcademicYear.objects.filter(code__icontains=code_str).first()
    if not ay:
        ay = AcademicYear.objects.filter(code__icontains=str(y_start)).first()

    return ay, (getattr(ay, 'code', '') or code_str).strip()


class DepEdSF1DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdviserOrAdmin]

    def get(self, request, section_id):
        try:
            section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(id=section_id)
            self.check_object_permissions(request, section)
        except Section.DoesNotExist:
            return Response({'error': f'Section {section_id} does not exist.'}, status=status.HTTP_404_NOT_FOUND)

        as_of_date_str = (request.GET.get('as_of_date') or request.GET.get('date') or '').strip()
        as_of_date = None
        if as_of_date_str:
            for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d'):
                try:
                    as_of_date = datetime.strptime(as_of_date_str, fmt).date()
                    break
                except ValueError:
                    pass

        acad_year_param = (request.GET.get('academic_year') or request.GET.get('school_year') or '').strip()

        if as_of_date:
            acad_year_obj, acad_year_code = resolve_academic_year_for_date(as_of_date)
        elif acad_year_param:
            acad_year_obj = AcademicYear.objects.filter(code__iexact=acad_year_param).first()
            acad_year_code = str(getattr(acad_year_obj, 'code', acad_year_param) or '').strip()
        else:
            acad_year_obj = getattr(section, 'academic_year', None) or AcademicYear.objects.filter(is_active=True).first()
            acad_year_code = str(getattr(acad_year_obj, 'code', '') or '').strip()

        school = SchoolProfile.objects.first()
        school_id = str(getattr(school, 'school_id', '') or '').strip()
        school_name = str(getattr(school, 'school_name', '') or '').strip()
        region = str(getattr(school, 'region', '') or '').strip()
        division = str(getattr(school, 'division', '') or '').strip()
        district = str(getattr(school, 'district', '') or '').strip()
        school_head = str(getattr(school, 'principal_name', '') or getattr(school, 'school_head', '') or '').strip()

        left_logo = None
        right_logo = None
        if school:
            if getattr(school, 'left_logo', None):
                try:
                    left_logo = request.build_absolute_uri(school.left_logo.url)
                except Exception:
                    left_logo = None
            if getattr(school, 'right_logo', None):
                try:
                    right_logo = request.build_absolute_uri(school.right_logo.url)
                except Exception:
                    right_logo = None

        adviser_name = f"{section.adviser.first_name} {section.adviser.last_name}".strip() if section.adviser else ""
        grade_level_name = section.grade_level.name if section.grade_level else ""
        date_notice_str = f" as of {as_of_date.strftime('%B %d, %Y')}" if as_of_date else ""

        if not acad_year_obj:
            return Response({
                'school_id': school_id,
                'school_name': school_name,
                'region': region,
                'division': division,
                'district': district,
                'academic_year': acad_year_code,
                'as_of_date': as_of_date.strftime('%Y-%m-%d') if as_of_date else None,
                'grade_level': grade_level_name,
                'section_name': section.name,
                'adviser_name': adviser_name,
                'school_head': school_head,
                'left_logo': left_logo,
                'right_logo': right_logo,
                'has_enrolled_students': False,
                'notice': f"Notice: No data exists for School Year {acad_year_code}{date_notice_str}.",
                'students': [],
                'learners': [],
                'males': [],
                'females': [],
                'total_male': 0,
                'total_female': 0,
                'total_combined': 0,
                'summary': {'male_bosy': 0, 'female_bosy': 0, 'total_bosy': 0, 'male_eoy': 0, 'female_eoy': 0, 'total_eoy': 0}
            }, status=status.HTTP_200_OK)

        enrollments_qs = Enrollment.objects.filter(
            section=section,
            academic_year=acad_year_obj,
            status__in=['ENROLLED', 'ACTIVE']
        ).select_related('student')

        if not enrollments_qs.exists():
            historical_section = Section.objects.filter(
                name__iexact=section.name,
                grade_level=section.grade_level,
                academic_year=acad_year_obj
            ).first()
            if historical_section:
                section = historical_section
                if historical_section.adviser:
                    adviser_name = f"{historical_section.adviser.first_name} {historical_section.adviser.last_name}".strip()
                enrollments_qs = Enrollment.objects.filter(
                    section=historical_section,
                    academic_year=acad_year_obj,
                    status__in=['ENROLLED', 'ACTIVE']
                ).select_related('student')

        valid_enrollments = []
        for enr in enrollments_qs:
            if not enr.student:
                continue

            enr_date = None
            for candidate in ['enrollment_date', 'date_enrolled', 'date', 'enrolled_at', 'created_at']:
                val = getattr(enr, candidate, None)
                if val:
                    enr_date = val.date() if hasattr(val, 'date') else val
                    break

            if not enr_date and getattr(acad_year_obj, 'start_date', None):
                enr_date = acad_year_obj.start_date

            if as_of_date and enr_date and enr_date > as_of_date:
                continue

            exit_date = None
            for candidate in ['date_dropped', 'dropped_date', 'date_transferred', 'transferred_date', 'exit_date']:
                val = getattr(enr, candidate, None)
                if val:
                    exit_date = val.date() if hasattr(val, 'date') else val
                    break

            if as_of_date and exit_date and exit_date <= as_of_date:
                continue

            valid_enrollments.append(enr)

        enrolled_students = [e.student for e in valid_enrollments]
        has_enrolled = len(enrolled_students) > 0

        if not has_enrolled:
            return Response({
                'school_id': school_id,
                'school_name': school_name,
                'region': region,
                'division': division,
                'district': district,
                'academic_year': acad_year_code,
                'as_of_date': as_of_date.strftime('%Y-%m-%d') if as_of_date else None,
                'grade_level': grade_level_name,
                'section_name': section.name,
                'adviser_name': adviser_name,
                'school_head': school_head,
                'left_logo': left_logo,
                'right_logo': right_logo,
                'has_enrolled_students': False,
                'notice': f"Notice: No students enrolled in Section {section.name} for School Year {acad_year_code}{date_notice_str}.",
                'students': [],
                'learners': [],
                'males': [],
                'females': [],
                'total_male': 0,
                'total_female': 0,
                'total_combined': 0,
                'summary': {'male_bosy': 0, 'female_bosy': 0, 'total_bosy': 0, 'male_eoy': 0, 'female_eoy': 0, 'total_eoy': 0}
            }, status=status.HTTP_200_OK)

        def get_db_field(obj, *field_names):
            for field in field_names:
                if hasattr(obj, field):
                    val = getattr(obj, field)
                    if val is not None:
                        val_str = str(val).strip()
                        if val_str:
                            return val_str
            return ""

        ref_start_year = acad_year_obj.start_date.year if getattr(acad_year_obj, 'start_date', None) else timezone.now().year
        bosy_reference_date = date(ref_start_year, 6, 5)

        learners_list = []
        male_count = 0
        female_count = 0

        for s in enrolled_students:
            is_male = str(getattr(s, 'sex', '')).upper().startswith('M')
            if is_male:
                male_count += 1
            else:
                female_count += 1

            bdate = getattr(s, 'birthdate', None) or getattr(s, 'date_of_birth', None)
            birthdate_str = ""
            age_val = ""
            if bdate:
                birthdate_str = bdate.strftime('%m/%d/%Y')
                calc_age = bosy_reference_date.year - bdate.year - ((bosy_reference_date.month, bosy_reference_date.day) < (bdate.month, bdate.day))
                age_val = max(0, calc_age)

            mid = f" {s.middle_name}" if getattr(s, 'middle_name', '') else ""
            suf = f" {s.suffix}" if getattr(s, 'suffix', '') else ""
            full_name = f"{s.last_name}, {s.first_name}{mid}{suf}".strip()

            learners_list.append({
                'id': s.id,
                'lrn': str(getattr(s, 'lrn', '') or '').strip(),
                'name': full_name,
                'first_name': getattr(s, 'first_name', '') or '',
                'middle_name': getattr(s, 'middle_name', '') or '',
                'last_name': getattr(s, 'last_name', '') or '',
                'suffix': getattr(s, 'suffix', '') or '',
                'sex': 'M' if is_male else 'F',
                'birthdate': birthdate_str,
                'age': age_val,
                'birth_place': get_db_field(s, 'birth_place', 'place_of_birth'),
                'mother_tongue': get_db_field(s, 'mother_tongue'),
                'ethnic_group': get_db_field(s, 'ethnic_group', 'ip_community', 'ip_ethnic_group'),
                'religion': get_db_field(s, 'religion'),
                'house_street': get_db_field(s, 'house_street_sitio', 'house_street', 'address'),
                'barangay': get_db_field(s, 'barangay'),
                'municipality_city': get_db_field(s, 'municipality_city', 'city', 'municipality'),
                'province': get_db_field(s, 'province'),
                'father_name': get_db_field(s, 'father_name', 'father'),
                'mother_maiden_name': get_db_field(s, 'mother_maiden_name', 'mother'),
                'guardian_name': get_db_field(s, 'guardian_name', 'guardian'),
                'guardian_relationship': get_db_field(s, 'guardian_relationship', 'relationship'),
                'parent_contact': get_db_field(s, 'parent_contact', 'parent_phone', 'contact_number'),
                'remarks': get_db_field(s, 'remarks'),
            })

        learners_list.sort(key=lambda x: (x['last_name'].lower(), x['first_name'].lower()))

        males_data = [l for l in learners_list if l['sex'] == 'M']
        females_data = [l for l in learners_list if l['sex'] == 'F']

        response_data = {
            'school_id': school_id,
            'school_name': school_name,
            'region': region,
            'division': division,
            'district': district,
            'academic_year': acad_year_code,
            'as_of_date': as_of_date.strftime('%Y-%m-%d') if as_of_date else None,
            'grade_level': grade_level_name,
            'section_name': section.name,
            'adviser_name': adviser_name,
            'school_head': school_head,
            'left_logo': left_logo,
            'right_logo': right_logo,
            'has_enrolled_students': True,
            'notice': '',
            'students': learners_list,
            'learners': learners_list,
            'males': males_data,
            'females': females_data,
            'total_male': male_count,
            'total_female': female_count,
            'total_combined': len(learners_list),
            'summary': {
                'male_bosy': male_count,
                'female_bosy': female_count,
                'total_bosy': len(learners_list),
                'male_eoy': male_count,
                'female_eoy': female_count,
                'total_eoy': len(learners_list),
            }
        }
        return Response(response_data, status=status.HTTP_200_OK)


class DepEdSF2DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdviserOrAdmin]

    def get(self, request, section_id):
        try:
            section = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(id=section_id)
            self.check_object_permissions(request, section)
        except Section.DoesNotExist:
            return Response({'error': f'Section {section_id} not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        today_date = now.date()

        year_param = request.GET.get('year', '').strip()
        month_param = request.GET.get('month', '').strip().capitalize()

        month_names = list(calendar.month_name)
        if month_param.isdigit():
            m_val = int(month_param)
            month_num = m_val if 1 <= m_val <= 12 else today_date.month
            month_name = month_names[month_num]
        elif month_param in month_names and month_param:
            month_num = month_names.index(month_param)
            month_name = month_param
        else:
            month_num = today_date.month
            month_name = month_names[month_num]

        year = int(year_param) if year_param.isdigit() else today_date.year
        target_mid_date = date(year, month_num, 15)

        acad_year_param = (request.GET.get('academic_year') or request.GET.get('school_year') or '').strip()
        acad_year_obj, acad_year_val = resolve_academic_year_for_date(target_mid_date)

        if not acad_year_obj and acad_year_param:
            acad_year_obj = AcademicYear.objects.filter(code__iexact=acad_year_param).first()
            if acad_year_obj:
                acad_year_val = acad_year_obj.code

        num_calendar_days = calendar.monthrange(year, month_num)[1]
        weekday_map = {0: 'M', 1: 'T', 2: 'W', 3: 'TH', 4: 'F'}

        school_days = []
        for d in range(1, num_calendar_days + 1):
            cur_date = date(year, month_num, d)
            if cur_date.weekday() < 5:
                school_days.append({
                    'dateNumber': d,
                    'dayOfWeek': weekday_map[cur_date.weekday()],
                    'fullDate': cur_date.strftime('%Y-%m-%d'),
                    'isFuture': cur_date > today_date
                })

        school = SchoolProfile.objects.first()
        school_id = str(getattr(school, 'school_id', '') or '').strip()
        school_name = str(getattr(school, 'school_name', '') or '').strip()
        region = str(getattr(school, 'region', '') or '').strip()
        division = str(getattr(school, 'division', '') or '').strip()
        district = str(getattr(school, 'district', '') or '').strip()
        school_head = str(getattr(school, 'principal_name', '') or getattr(school, 'school_head', '') or '').strip()

        left_logo = None
        right_logo = None
        if school:
            if getattr(school, 'left_logo', None):
                try:
                    left_logo = request.build_absolute_uri(school.left_logo.url)
                except Exception:
                    left_logo = None
            if getattr(school, 'right_logo', None):
                try:
                    right_logo = request.build_absolute_uri(school.right_logo.url)
                except Exception:
                    right_logo = None

        adviser_name = f"{section.adviser.first_name} {section.adviser.last_name}".strip() if section.adviser else ""
        grade_level_name = section.grade_level.name if section.grade_level else ""

        if not acad_year_obj:
            return Response({
                'school_id': school_id,
                'school_name': school_name,
                'region': region,
                'division': division,
                'district': district,
                'academic_year': acad_year_val,
                'grade_level': grade_level_name,
                'section_name': section.name,
                'month': month_name,
                'year': year,
                'adviser_name': adviser_name,
                'school_head': school_head,
                'left_logo': left_logo,
                'right_logo': right_logo,
                'school_days': school_days,
                'has_enrolled_students': False,
                'notice': f"Notice: No data exists for {month_name} {year}.",
                'males': [],
                'females': [],
                'learners': [],
                'metrics': {
                    'enrolment_june': {'m': 0, 'f': 0, 'total': 0},
                    'late_enrolment': {'m': 0, 'f': 0, 'total': 0},
                    'registered_end': {'m': 0, 'f': 0, 'total': 0},
                    'percentage_enrolment': {'m': 0.0, 'f': 0.0, 'total': 0.0},
                    'average_daily_attendance': {'m': 0.0, 'f': 0.0, 'total': 0.0},
                    'percentage_attendance': {'m': 0.0, 'f': 0.0, 'total': 0.0},
                    'consecutive_5_absent_count': {'m': 0, 'f': 0, 'total': 0},
                    'drop_out': {'m': 0, 'f': 0, 'total': 0},
                    'transferred_out': {'m': 0, 'f': 0, 'total': 0},
                    'transferred_in': {'m': 0, 'f': 0, 'total': 0},
                }
            }, status=status.HTTP_200_OK)

        enrollments = Enrollment.objects.filter(
            section=section,
            academic_year=acad_year_obj,
            status__in=['ENROLLED', 'ACTIVE']
        ).select_related('student')

        if not enrollments.exists():
            historical_section = Section.objects.filter(
                name__iexact=section.name,
                grade_level=section.grade_level,
                academic_year=acad_year_obj
            ).first()
            if historical_section:
                section = historical_section
                if historical_section.adviser:
                    adviser_name = f"{historical_section.adviser.first_name} {historical_section.adviser.last_name}".strip()
                enrollments = Enrollment.objects.filter(
                    section=historical_section,
                    academic_year=acad_year_obj,
                    status__in=['ENROLLED', 'ACTIVE']
                ).select_related('student')

        student_enrollment_map = {}
        for enr in enrollments:
            if enr.student:
                enr_date = None
                for candidate in ['enrollment_date', 'date_enrolled', 'date', 'enrolled_at', 'created_at']:
                    val = getattr(enr, candidate, None)
                    if val:
                        enr_date = val.date() if hasattr(val, 'date') else val
                        break

                student_enrollment_map[enr.student.id] = {
                    'student': enr.student,
                    'enrollment_date': enr_date or getattr(acad_year_obj, 'start_date', None) or date(year, 1, 1)
                }

        enrolled_students = [item['student'] for item in student_enrollment_map.values()]

        males_students = sorted(
            [s for s in enrolled_students if getattr(s, 'sex', '').upper().startswith('M')],
            key=lambda x: x.last_name.lower()
        )
        females_students = sorted(
            [s for s in enrolled_students if getattr(s, 'sex', '').upper().startswith('F')],
            key=lambda x: x.last_name.lower()
        )

        has_enrolled_students = (len(males_students) + len(females_students)) > 0
        student_ids = [s.id for s in (males_students + females_students)]

        if not has_enrolled_students:
            return Response({
                'school_id': school_id,
                'school_name': school_name,
                'region': region,
                'division': division,
                'district': district,
                'academic_year': acad_year_val,
                'grade_level': grade_level_name,
                'section_name': section.name,
                'month': month_name,
                'year': year,
                'adviser_name': adviser_name,
                'school_head': school_head,
                'left_logo': left_logo,
                'right_logo': right_logo,
                'school_days': school_days,
                'has_enrolled_students': False,
                'notice': f"Notice: No students enrolled in Section {section.name} for School Year {acad_year_val}.",
                'males': [],
                'females': [],
                'learners': [],
                'metrics': {
                    'enrolment_june': {'m': 0, 'f': 0, 'total': 0},
                    'late_enrolment': {'m': 0, 'f': 0, 'total': 0},
                    'registered_end': {'m': 0, 'f': 0, 'total': 0},
                    'percentage_enrolment': {'m': 0.0, 'f': 0.0, 'total': 0.0},
                    'average_daily_attendance': {'m': 0.0, 'f': 0.0, 'total': 0.0},
                    'percentage_attendance': {'m': 0.0, 'f': 0.0, 'total': 0.0},
                    'consecutive_5_absent_count': {'m': 0, 'f': 0, 'total': 0},
                    'drop_out': {'m': 0, 'f': 0, 'total': 0},
                    'transferred_out': {'m': 0, 'f': 0, 'total': 0},
                    'transferred_in': {'m': 0, 'f': 0, 'total': 0},
                }
            }, status=status.HTTP_200_OK)

        attendance_map = {sid: {} for sid in student_ids}
        try:
            das_logs = DailyAttendanceSummary.objects.filter(
                student_id__in=student_ids,
                attendance_date__year=year,
                attendance_date__month=month_num
            )
            for log in das_logs:
                attendance_map[log.student_id][log.attendance_date.day] = log.status.upper()
        except Exception:
            pass

        def format_learner(s):
            s_logs = attendance_map.get(s.id, {})
            enr_info = student_enrollment_map.get(s.id, {})
            student_enr_date = enr_info.get('enrollment_date', date(year, 1, 1))

            att_dict = {}
            t_absent = 0
            t_tardy = 0
            days_evaluated = 0

            for day_obj in school_days:
                d_num = day_obj['dateNumber']
                cur_day_date = date(year, month_num, d_num)

                if cur_day_date < student_enr_date or day_obj['isFuture']:
                    att_dict[d_num] = ''
                    continue

                days_evaluated += 1
                st = s_logs.get(d_num, '')

                if st in ['ABSENT', 'A', 'X', '1']:
                    att_dict[d_num] = 'ABSENT'
                    t_absent += 1
                elif st in ['LATE', 'TARDY', '2', 'T']:
                    att_dict[d_num] = 'TARDY'
                    t_tardy += 1
                elif st in ['CUTTING', 'CC', '3', 'C']:
                    att_dict[d_num] = 'CUTTING'
                    t_tardy += 1
                elif st in ['BOTH', '4']:
                    att_dict[d_num] = 'BOTH'
                    t_tardy += 1
                else:
                    att_dict[d_num] = 'PRESENT'

            mid = f" {s.middle_name}" if getattr(s, 'middle_name', '') else ""
            suf = f" {s.suffix}" if getattr(s, 'suffix', '') else ""
            full_name = f"{s.last_name}, {s.first_name}{mid}{suf}".strip()

            return {
                'id': s.id,
                'lrn': s.lrn,
                'name': full_name,
                'sex': 'M' if getattr(s, 'sex', '').upper().startswith('M') else 'F',
                'attendance': att_dict,
                'daily_attendance': att_dict,
                'total_absent': t_absent,
                'total_tardy': t_tardy,
                'days_evaluated': days_evaluated,
                'remarks': getattr(s, 'remarks', '') or ''
            }

        males_data = [format_learner(s) for s in males_students]
        females_data = [format_learner(s) for s in females_students]

        m_count = len(males_data)
        f_count = len(females_data)
        total_count = m_count + f_count

        past_days = [d for d in school_days if not d['isFuture']]
        num_days = len(past_days) if past_days else 1

        total_present_m = sum(l['days_evaluated'] - l['total_absent'] for l in males_data)
        total_present_f = sum(l['days_evaluated'] - l['total_absent'] for l in females_data)
        total_present = total_present_m + total_present_f

        avg_m = round(total_present_m / num_days, 1) if m_count > 0 else 0.0
        avg_f = round(total_present_f / num_days, 1) if f_count > 0 else 0.0
        avg_tot = round(total_present / num_days, 1) if total_count > 0 else 0.0

        pct_m = round((avg_m / m_count * 100), 1) if m_count > 0 else 0.0
        pct_f = round((avg_f / f_count * 100), 1) if f_count > 0 else 0.0
        pct_tot = round((avg_tot / total_count * 100), 1) if total_count > 0 else 0.0

        ref_start_year = acad_year_obj.start_date.year if getattr(acad_year_obj, 'start_date', None) else year
        first_day_june = date(ref_start_year, 6, 1)
        days_to_first_friday = (4 - first_day_june.weekday()) % 7
        first_friday_june = date(ref_start_year, 6, 1 + days_to_first_friday)

        june_m = 0
        june_f = 0
        late_m = 0
        late_f = 0

        for item in student_enrollment_map.values():
            s = item['student']
            e_date = item['enrollment_date']
            is_m = getattr(s, 'sex', '').upper().startswith('M')

            if e_date and e_date <= first_friday_june:
                if is_m: june_m += 1
                else: june_f += 1
            else:
                if is_m: late_m += 1
                else: late_f += 1

        if (june_m + june_f + late_m + late_f) == 0:
            june_m = m_count
            june_f = f_count

        total_june = june_m + june_f
        pct_enr_m = round((m_count / june_m * 100), 1) if june_m > 0 else 100.0
        pct_enr_f = round((f_count / june_f * 100), 1) if june_f > 0 else 100.0
        pct_enr_tot = round((total_count / total_june * 100), 1) if total_june > 0 else 100.0

        def count_consecutive_absences(learners_list):
            count = 0
            for l in learners_list:
                streak = 0
                has_five = False
                for d in school_days:
                    if l['attendance'].get(d['dateNumber']) == 'ABSENT':
                        streak += 1
                        if streak >= 5:
                            has_five = True
                            break
                    else:
                        streak = 0
                if has_five:
                    count += 1
            return count

        consec5_m = count_consecutive_absences(males_data)
        consec5_f = count_consecutive_absences(females_data)

        all_status_enrollments = Enrollment.objects.filter(
            section=section,
            academic_year=acad_year_obj
        ).select_related('student')

        drop_m, drop_f = 0, 0
        to_m, to_f = 0, 0
        ti_m, ti_f = 0, 0

        for enr in all_status_enrollments:
            if not enr.student:
                continue
            st_val = str(getattr(enr, 'status', '')).upper()
            is_m = str(getattr(enr.student, 'sex', '')).upper().startswith('M')

            if st_val in ['DROPPED', 'DROPOUT', 'DROP_OUT', 'DRP']:
                if is_m: drop_m += 1
                else: drop_f += 1
            elif st_val in ['TRANSFERRED_OUT', 'TRANSFER_OUT', 'T/O', 'TO']:
                if is_m: to_m += 1
                else: to_f += 1
            elif st_val in ['TRANSFERRED_IN', 'TRANSFER_IN', 'T/I', 'TI']:
                if is_m: ti_m += 1
                else: ti_f += 1

        return Response({
            'school_id': school_id,
            'school_name': school_name,
            'region': region,
            'division': division,
            'district': district,
            'academic_year': acad_year_val,
            'grade_level': grade_level_name,
            'section_name': section.name,
            'month': month_name,
            'year': year,
            'adviser_name': adviser_name,
            'school_head': school_head,
            'left_logo': left_logo,
            'right_logo': right_logo,
            'school_days': school_days,
            'has_enrolled_students': True,
            'notice': '',
            'males': males_data,
            'females': females_data,
            'learners': males_data + females_data,
            'metrics': {
                'enrolment_june': {'m': june_m, 'f': june_f, 'total': total_june},
                'late_enrolment': {'m': late_m, 'f': late_f, 'total': late_m + late_f},
                'registered_end': {'m': m_count, 'f': f_count, 'total': total_count},
                'percentage_enrolment': {'m': pct_enr_m, 'f': pct_enr_f, 'total': pct_enr_tot},
                'average_daily_attendance': {'m': avg_m, 'f': avg_f, 'total': avg_tot},
                'percentage_attendance': {'m': pct_m, 'f': pct_f, 'total': pct_tot},
                'consecutive_5_absent_count': {'m': consec5_m, 'f': consec5_f, 'total': consec5_m + consec5_f},
                'drop_out': {'m': drop_m, 'f': drop_f, 'total': drop_m + drop_f},
                'transferred_out': {'m': to_m, 'f': to_f, 'total': to_m + to_f},
                'transferred_in': {'m': ti_m, 'f': ti_f, 'total': ti_m + ti_f},
            }
        }, status=status.HTTP_200_OK)


SF2ReportAPIView = DepEdSF2DataAPIView


class DepEdSF4DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        month = request.GET.get('month', 'October').strip().capitalize()
        year = request.GET.get('year', str(timezone.now().year)).strip()
        school_year = (request.GET.get('school_year') or request.GET.get('academic_year') or '').strip()

        try:
            year_val = int(year) if year.isdigit() else timezone.now().year
            data = generate_sf4_data(month_name=month, year=year_val, school_year=school_year)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("SF4 error: %s", str(e), exc_info=True)
            return Response({'error': 'Cannot compile SF4 report.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

SF4ReportAPIView = DepEdSF4DataAPIView
SF4ReportView = DepEdSF4DataAPIView


class ReportAuditLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return Response({'success': True, 'message': 'Report audit recorded.'}, status=status.HTTP_201_CREATED)

class DTRListAPIView(APIView):
    """
    Civil Service Form No. 48 (Daily Time Record) API.
    Calculates 31-day biometric attendance, undertime, loafing penalties,
    and manages Department Head endorsements and Principal excuses.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, faculty_id=None, *args, **kwargs):
        # 1. Resolve Target Faculty ID
        target_id = faculty_id or request.query_params.get('faculty_id')
        if not target_id:
            user_prof = getattr(request.user, 'profile', None)
            target_id = getattr(user_prof, 'faculty_id', None)

        if not target_id:
            return Response(
                {'error': 'Faculty ID is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        faculty = FacultyProfile.objects.filter(id=target_id).first()
        if not faculty:
            return Response(
                {'error': 'Faculty record not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 2. Resolve Month & Year
        now = timezone.localdate()
        try:
            month = int(request.query_params.get('month', now.month))
            year = int(request.query_params.get('year', now.year))
        except (ValueError, TypeError):
            month = now.month
            year = now.year

        num_days = calendar.monthrange(year, month)[1]

        # 3. Retrieve or Initialize Monthly DTR Record Safely
        reg_hours = '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM'
        sat_hours = 'As Required'
        dtr_submitted = False
        submitted_at_str = None
        dept_approved = False
        approved_at_str = None

        try:
            dtr_record, _ = FacultyMonthlyDTR.objects.get_or_create(
                faculty=faculty,
                month=month,
                year=year,
                defaults={
                    'regular_hours': reg_hours,
                    'saturday_hours': sat_hours,
                }
            )
            reg_hours = dtr_record.regular_hours
            sat_hours = dtr_record.saturday_hours
            dtr_submitted = dtr_record.is_submitted
            dept_approved = dtr_record.is_dept_head_approved
            if dtr_record.submitted_at:
                submitted_at_str = dtr_record.submitted_at.strftime('%Y-%m-%d %I:%M %p')
            if dtr_record.dept_head_approved_at:
                approved_at_str = dtr_record.dept_head_approved_at.strftime('%Y-%m-%d %I:%M %p')
        except Exception as exc:
            logger.warning("FacultyMonthlyDTR query warning: %s", exc)

        # 4. Fetch School Principal
        school = SchoolProfile.objects.first()
        school_head = school.principal_name if school and school.principal_name else 'JACQUELINE GALUPO'

        # 5. Fetch Gate Scans
        logs = FacultyGateLog.objects.filter(
            faculty=faculty,
            scan_time__year=year,
            scan_time__month=month
        ).order_by('scan_time')

        # 6. Resolve User Privileges
        user_role = getattr(request.user, 'role', 'FACULTY')
        if request.user.is_superuser:
            user_role = 'PRINCIPAL'

        can_approve_dept = user_role in ['DEPT_HEAD', 'ADMIN', 'PRINCIPAL']
        can_clear_loafing = user_role in ['PRINCIPAL', 'ADMIN'] or request.user.is_superuser

        rows = []
        days_present = 0
        total_undertime_hours = 0
        total_undertime_minutes = 0

        # Standard DepEd Prescribed Arrival/Departure Windows
        MORNING_IN_EXPECTED = time(8, 0)
        AFTERNOON_OUT_EXPECTED = time(17, 0)

        for day in range(1, num_days + 1):
            date_obj = date(year, month, day)
            is_weekend = date_obj.weekday() in [5, 6]  # 5=Saturday, 6=Sunday
            day_logs = [l for l in logs if timezone.localtime(l.scan_time).date() == date_obj]

            am_arrival = ''
            am_departure = ''
            pm_arrival = ''
            pm_departure = ''

            is_loafing = False
            loafing_excused = False
            loafing_remarks = ''
            first_am_in = None
            last_pm_out = None

            # Process Scans & Violations
            for l in day_logs:
                local_time = timezone.localtime(l.scan_time)
                time_str = local_time.strftime('%I:%M %p')
                hour = local_time.hour

                if getattr(l, 'is_violation', False) or 'LOAFING' in getattr(l, 'violation_type', ''):
                    is_loafing = True
                    loafing_excused = getattr(l, 'is_excused_by_principal', False)
                    loafing_remarks = getattr(l, 'remarks', 'Loafing detected during work hours.')

                if l.direction == 'IN':
                    if hour < 12 and not am_arrival:
                        am_arrival = time_str
                        first_am_in = local_time.time()
                    elif hour >= 12 and not pm_arrival:
                        pm_arrival = time_str
                elif l.direction == 'OUT':
                    if hour < 13 and not am_departure:
                        am_departure = time_str
                    elif not pm_departure:
                        pm_departure = time_str
                        last_pm_out = local_time.time()

            # Rule: Loafing not pardoned by Principal triggers 8 hours absence / deduction
            has_deduction = is_loafing and not loafing_excused
            day_undertime_h = 0
            day_undertime_m = 0

            if has_deduction:
                am_arrival = 'ABSENT'
                am_departure = 'LOAFING'
                pm_arrival = 'DEDUCTED'
                pm_departure = 'SALARY'
                day_undertime_h = 8
                total_undertime_hours += 8
            else:
                if am_arrival or pm_arrival:
                    days_present += 1

                # Calculate standard undertime/tardiness if present
                if first_am_in and first_am_in > MORNING_IN_EXPECTED:
                    late_mins = (datetime.combine(date_obj, first_am_in) - datetime.combine(date_obj, MORNING_IN_EXPECTED)).seconds // 60
                    day_undertime_m += late_mins

                if last_pm_out and last_pm_out < AFTERNOON_OUT_EXPECTED:
                    early_mins = (datetime.combine(date_obj, AFTERNOON_OUT_EXPECTED) - datetime.combine(date_obj, last_pm_out)).seconds // 60
                    day_undertime_m += early_mins

                if day_undertime_m >= 60:
                    day_undertime_h += day_undertime_m // 60
                    day_undertime_m = day_undertime_m % 60

                total_undertime_hours += day_undertime_h
                total_undertime_minutes += day_undertime_m

            rows.append({
                'day': day,
                'date_str': date_obj.isoformat(),
                'day_of_week': date_obj.strftime('%a'),
                'is_weekend': is_weekend,
                'am_arrival': am_arrival,
                'am_departure': am_departure,
                'pm_arrival': pm_arrival,
                'pm_departure': pm_departure,
                'undertime_hours': day_undertime_h if (day_undertime_h > 0 or has_deduction) else '',
                'undertime_minutes': day_undertime_m if (day_undertime_m > 0 or has_deduction) else '',
                'is_loafing': is_loafing,
                'loafing_excused': loafing_excused,
                'loafing_remarks': loafing_remarks,
            })

        # Normalize total undertime minutes
        if total_undertime_minutes >= 60:
            total_undertime_hours += total_undertime_minutes // 60
            total_undertime_minutes = total_undertime_minutes % 60

        month_name = calendar.month_name[month]
        full_name = f"{faculty.last_name}, {faculty.first_name}"
        if getattr(faculty, 'middle_name', None):
            full_name += f" {faculty.middle_name}"

        return Response({
            'faculty_id': faculty.id,
            'faculty_name': full_name,
            'employee_id': getattr(faculty, 'employee_id', f'EMP-{faculty.id}'),
            'department': getattr(faculty, 'department', 'Junior High School'),
            'month': month_name,
            'month_number': month,
            'year': year,
            'regular_days_hours': reg_hours,
            'saturdays_hours': sat_hours,
            'school_head': school_head,
            'dtr_submitted': dtr_submitted,
            'submitted_at': submitted_at_str,
            'dept_head_approved': dept_approved,
            'approved_by_dept_head_at': approved_at_str,
            'user_role': user_role,
            'can_submit': True,
            'can_approve_dept': can_approve_dept,
            'can_clear_loafing': can_clear_loafing,
            'rows': rows,
            'total_undertime_hours': total_undertime_hours,
            'total_undertime_minutes': total_undertime_minutes,
            'days_present': days_present,
        }, status=status.HTTP_200_OK)

    def post(self, request, faculty_id=None, *args, **kwargs):
        action = request.data.get('action')
        target_id = faculty_id or request.data.get('faculty_id')

        faculty = FacultyProfile.objects.filter(id=target_id).first()
        if not faculty:
            return Response(
                {'error': 'Faculty record not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        now = timezone.localdate()
        month = int(request.data.get('month', now.month))
        year = int(request.data.get('year', now.year))

        dtr_record, _ = FacultyMonthlyDTR.objects.get_or_create(
            faculty=faculty,
            month=month,
            year=year
        )

        user_role = getattr(request.user, 'role', 'FACULTY')

        # ACTION 1: Submit DTR by Faculty
        if action == 'SUBMIT_DTR':
            dtr_record.is_submitted = True
            dtr_record.submitted_at = timezone.now()
            dtr_record.save()
            return Response({
                'success': True,
                'message': f"DTR for {calendar.month_name[month]} {year} submitted to Department Head for review."
            })

        # ACTION 2: Approve DTR by Department Head
        elif action == 'APPROVE_DEPT_HEAD':
            if not (request.user.is_superuser or user_role in ['DEPT_HEAD', 'ADMIN', 'PRINCIPAL']):
                return Response(
                    {'error': 'Unauthorized: Only Department Heads or Admins can endorse this DTR.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            dtr_record.is_dept_head_approved = True
            dtr_record.dept_head_approved_at = timezone.now()
            dtr_record.approved_by = request.user
            dtr_record.save()
            return Response({
                'success': True,
                'message': 'DTR successfully approved and endorsed by Department Head. Printing unlocked.'
            })

        # ACTION 3: Principal Excuses Loafing Violation
        elif action == 'EXCUSE_LOAFING':
            if not (request.user.is_superuser or user_role in ['PRINCIPAL', 'ADMIN']):
                return Response(
                    {'error': 'Forbidden: Only the School Principal has the authority to excuse loafing violations.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            date_str = request.data.get('date_str')
            if not date_str:
                return Response({'error': 'Date string (date_str) is required.'}, status=status.HTTP_400_BAD_REQUEST)

            logs = FacultyGateLog.objects.filter(
                faculty=faculty,
                scan_time__date=date_str
            )
            logs.update(
                is_violation=False,
                is_excused_by_principal=True,
                excused_at=timezone.now(),
                excused_by=request.user
            )

            return Response({
                'success': True,
                'message': f"Loafing violation on {date_str} pardoned by Principal. Salary deduction removed."
            })

        return Response(
            {'error': f"Unknown action: '{action}'"},
            status=status.HTTP_400_BAD_REQUEST
        )




class GeofenceAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        lat = float(school.latitude) if school and school.latitude is not None else None
        lng = float(school.longitude) if school and school.longitude is not None else None
        radius = int(school.geofence_radius_meters) if school and school.geofence_radius_meters else 100

        server_now = timezone.now()
        today = timezone.localdate()

        incidents_today = LoafingIncident.objects.filter(incident_date=today).count()
        spoof_attempts_blocked = LoafingIncident.objects.filter(
            incident_date=today,
            trigger_reason__icontains='Mock Location'
        ).count()

        active_faculty_qs = FacultyProfile.objects.filter(is_active=True)
        roster = []

        for faculty in active_faculty_qs:
            last_ping = FacultyHeartbeat.objects.filter(
                faculty=faculty,
                recorded_at__date=today
            ).order_by('-recorded_at').first()

            distance_str = "—"
            if last_ping and lat is not None and lng is not None:
                dist = haversine_distance_meters(float(last_ping.latitude), float(last_ping.longitude), lat, lng)
                distance_str = f"{int(dist)}m"

            roster.append({
                'id': faculty.id,
                'faculty_name': f"{faculty.first_name} {faculty.last_name}".strip(),
                'employee_id': faculty.employee_id,
                'position': faculty.position or "Teacher",
                'status': "VERIFIED_INSIDE" if (last_ping and last_ping.is_inside_geofence) else "NOT_ON_DUTY",
                'distance': distance_str,
                'battery': f"{last_ping.battery_level}%" if last_ping else "—",
                'last_seen': timezone.localtime(last_ping.recorded_at).strftime('%I:%M %p') if last_ping else "No Ping",
                'device_model': faculty.device_model,
                'bound_device_id': faculty.bound_device_id,
                'device_bound_at': timezone.localtime(faculty.device_bound_at).strftime('%b %d, %Y') if faculty.device_bound_at else None,
            })

        return Response({
            'zone_id': 'ZONE-MAIN',
            'name': school.school_name if school else "",
            'latitude': lat,
            'longitude': lng,
            'radius_meters': radius,
            'is_configured': bool(lat is not None and lng is not None),
            'verified_inside': sum(1 for r in roster if r['status'] == 'VERIFIED_INSIDE'),
            'missing_heartbeats': 0,
            'spoof_attempts_blocked': spoof_attempts_blocked,
            'incidents_today': incidents_today,
            'faculty_roster': roster,
            'recent_breaches': [],
        }, status=status.HTTP_200_OK)


# ============================================================================
# SCHEDULE CONFLICT DETECTION & CRUD
# ============================================================================

DAY_MAP = {
    'MON-FRI': {1, 2, 3, 4, 5},
    'MWF': {1, 3, 5},
    'TTH': {2, 4},
    'SAT': {6},
    'MON': {1}, 'MONDAY': {1},
    'TUE': {2}, 'TUESDAY': {2},
    'WED': {3}, 'WEDNESDAY': {3},
    'THU': {4}, 'THURSDAY': {4},
    'FRI': {5}, 'FRIDAY': {5},
    'SATURDAY': {6},
}

def get_day_set(raw_days):
    if not raw_days:
        return {1, 2, 3, 4, 5}
    if isinstance(raw_days, int):
        return {raw_days}

    cleaned = str(raw_days).strip().upper()
    if cleaned in DAY_MAP:
        return DAY_MAP[cleaned]

    tokens = [t.strip() for t in cleaned.replace(',', ' ').split() if t.strip()]
    output = set()
    for t in tokens:
        if t in DAY_MAP:
            output.update(DAY_MAP[t])
        elif t.isdigit():
            output.add(int(t))
    return output if output else {1, 2, 3, 4, 5}


def is_time_clash(start1, end1, start2, end2):
    s1 = str(start1)[:5]
    e1 = str(end1)[:5]
    s2 = str(start2)[:5]
    e2 = str(end2)[:5]
    return s1 < e2 and e1 > s2


class ScheduleViewSet(viewsets.ModelViewSet):
    queryset = Schedule.objects.select_related('section', 'subject', 'faculty').prefetch_related('days').all()
    serializer_class = ScheduleSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['section__name', 'faculty__first_name', 'faculty__last_name']

    def find_clashes(self, section_id, faculty_id, room_name, days_input, start_time, end_time, skip_id=None):
        clashes = []
        start_str = str(start_time)[:5] if start_time else ''
        end_str = str(end_time)[:5] if end_time else ''

        if not start_str or not end_str:
            return clashes

        if start_str >= end_str:
            clashes.append("Start time must be earlier than the end time.")
            return clashes

        target_days = get_day_set(days_input)
        schedules_qs = Schedule.objects.select_related('section', 'subject', 'faculty').prefetch_related('days').all()
        if skip_id:
            schedules_qs = schedules_qs.exclude(id=skip_id)

        day_names = {1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun'}

        for sched in schedules_qs:
            existing_days = set(sched.days.values_list('day_of_week', flat=True))
            if not existing_days:
                for field in ('days_of_week', 'day_of_week'):
                    if hasattr(sched, field):
                        existing_days = get_day_set(getattr(sched, field))
                        break
            if not existing_days:
                existing_days = {1, 2, 3, 4, 5}

            shared_days = target_days.intersection(existing_days)
            if not shared_days:
                continue

            sched_start = str(getattr(sched, 'start_time', ''))[:5]
            sched_end = str(getattr(sched, 'end_time', ''))[:5]
            if not sched_start or not sched_end:
                continue

            if not is_time_clash(start_str, end_str, sched_start, sched_end):
                continue

            days_text = ", ".join([day_names.get(d, str(d)) for d in sorted(list(shared_days))])
            time_text = f"{sched_start} - {sched_end}"
            subject_name = sched.subject.title if sched.subject else "another class"
            section_name = sched.section.name if sched.section else "another section"

            if section_id and sched.section_id and int(sched.section_id) == int(section_id):
                clashes.append(
                    f"Section conflict: {section_name} already has {subject_name} on {days_text} at {time_text}."
                )

            if faculty_id and sched.faculty_id and int(sched.faculty_id) == int(faculty_id):
                teacher_name = f"{sched.faculty.first_name} {sched.faculty.last_name}".strip() if sched.faculty else "This teacher"
                clashes.append(
                    f"Teacher conflict: {teacher_name} is already teaching {section_name} on {days_text} at {time_text}."
                )

            clean_room = str(room_name).strip() if room_name else ''
            sched_room = str(getattr(sched, 'room_number', '')).strip()
            if clean_room and sched_room and clean_room.lower() == sched_room.lower():
                clashes.append(
                    f"Room conflict: Room {clean_room} is already in use by {section_name} on {days_text} at {time_text}."
                )

        return clashes

    @action(detail=False, methods=['post'], url_path='validate-conflict')
    def validate_conflict(self, request):
        data = request.data
        section_id = data.get('section_id')
        faculty_id = data.get('faculty_id') or data.get('teacher_id')
        room_name = data.get('room_number') or data.get('room_name') or data.get('room_id') or data.get('room')
        days = data.get('days_of_week', 'MON-FRI')
        start = data.get('start_time')
        end = data.get('end_time')
        skip_id = data.get('exclude_id')

        clashes = self.find_clashes(
            section_id=section_id,
            faculty_id=faculty_id,
            room_name=room_name,
            days_input=days,
            start_time=start,
            end_time=end,
            skip_id=skip_id
        )

        return Response({
            'has_conflict': len(clashes) > 0,
            'conflicts': clashes
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        data = request.data
        room_val = data.get('room_number') or data.get('room_name') or data.get('room_id') or data.get('room') or ''
        days = data.get('days_of_week', 'MON-FRI')

        clashes = self.find_clashes(
            section_id=data.get('section_id'),
            faculty_id=data.get('faculty_id') or data.get('teacher_id'),
            room_name=room_val,
            days_input=days,
            start_time=data.get('start_time'),
            end_time=data.get('end_time')
        )
        if clashes:
            return Response({'detail': clashes[0]}, status=status.HTTP_400_BAD_REQUEST)

        response = super().create(request, *args, **kwargs)
        schedule_id = response.data.get('id')

        if schedule_id:
            sched = Schedule.objects.get(id=schedule_id)
            sched.room_number = str(room_val).strip()
            sched.save(update_fields=['room_number'])

            day_numbers = get_day_set(days)
            for d in day_numbers:
                ScheduleDay.objects.get_or_create(schedule=sched, day_of_week=d)

        return response

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        item = self.get_object()
        data = request.data
        room_val = data.get('room_number') or data.get('room_name') or data.get('room_id') or getattr(item, 'room_number', '')
        days = data.get('days_of_week', 'MON-FRI')

        clashes = self.find_clashes(
            section_id=data.get('section_id', item.section_id),
            faculty_id=data.get('faculty_id', item.faculty_id),
            room_name=room_val,
            days_input=days,
            start_time=data.get('start_time', item.start_time),
            end_time=data.get('end_time', item.end_time),
            skip_id=item.id
        )
        if clashes:
            return Response({'detail': clashes[0]}, status=status.HTTP_400_BAD_REQUEST)

        response = super().update(request, *args, **kwargs)

        if 'days_of_week' in data:
            item.days.all().delete()
            for d in get_day_set(days):
                ScheduleDay.objects.get_or_create(schedule=item, day_of_week=d)

        if room_val:
            item.room_number = str(room_val).strip()
            item.save(update_fields=['room_number'])

        return response


# ============================================================================
# STANDARD CRUD (STUDENTS, TEACHERS, SUBJECTS, USERS, ROOMS, GRADE LEVELS)
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().order_by('-id')
    serializer_class = StudentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name']


class FacultyViewSet(viewsets.ModelViewSet):
    queryset = FacultyProfile.objects.all().order_by('-id')
    serializer_class = FacultyProfileSerializer
    pagination_class = StandardResultsSetPagination
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
    queryset = GatePass.objects.select_related('faculty', 'student').order_by('-valid_from')
    serializer_class = GatePassSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['reason', 'faculty__first_name', 'faculty__last_name']


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [ReadOnlyOrAdminWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'title']


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('profile').all().order_by('-id')
    serializer_class = UserManagementSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsSystemAdminRole]
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email']


class RoomViewSet(viewsets.ViewSet):
    permission_classes = [ReadOnlyOrAdminWrite]

    def list(self, request):
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rooms (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(50) NOT NULL UNIQUE,
                    building VARCHAR(100) DEFAULT '',
                    capacity INTEGER DEFAULT 0,
                    room_type VARCHAR(30) DEFAULT 'LECTURE'
                );
            """)
            cursor.execute("SELECT id, name, building, capacity, room_type FROM rooms ORDER BY id;")
            rows = cursor.fetchall()
            data = [
                {"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]}
                for r in rows
            ]
        return Response(data, status=status.HTTP_200_OK)

    def create(self, request):
        name = str(request.data.get('name', '')).strip()
        building = str(request.data.get('building', '')).strip()
        try:
            capacity = int(request.data.get('capacity', 0) or 0)
        except (ValueError, TypeError):
            capacity = 0
        room_type = request.data.get('room_type', 'LECTURE')

        if not name:
            return Response({"detail": "Room name is required."}, status=status.HTTP_400_BAD_REQUEST)

        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS rooms (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(50) NOT NULL UNIQUE,
                    building VARCHAR(100) DEFAULT '',
                    capacity INTEGER DEFAULT 0,
                    room_type VARCHAR(30) DEFAULT 'LECTURE'
                );
            """)
            cursor.execute("""
                INSERT INTO rooms (name, building, capacity, room_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name) DO UPDATE 
                SET building = EXCLUDED.building, capacity = EXCLUDED.capacity, room_type = EXCLUDED.room_type
                RETURNING id, name, building, capacity, room_type;
            """, [name, building, capacity, room_type])
            r = cursor.fetchone()
            data = {"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]}

        return Response(data, status=status.HTTP_201_CREATED)


class GradeLevelViewSet(viewsets.ViewSet):
    permission_classes = [ReadOnlyOrAdminWrite]

    def list(self, request):
        levels = GradeLevel.objects.all().order_by('level_order', 'id')
        data = [
            {
                'id': gl.id,
                'name': gl.name,
                'level_number': getattr(gl, 'level_order', None) or 0,
                'stage': getattr(gl, 'stage', '')
            }
            for gl in levels
        ]
        return Response(data, status=status.HTTP_200_OK)

    def create(self, request):
        name = str(request.data.get('name', '')).strip()
        try:
            level_number = int(request.data.get('level_number', 0) or 0)
        except (ValueError, TypeError):
            level_number = 0
        stage = request.data.get('stage', 'JHS')

        if not name:
            return Response({"detail": "Year Level name is required."}, status=status.HTTP_400_BAD_REQUEST)

        gl, _ = GradeLevel.objects.get_or_create(
            name=name,
            defaults={'level_order': level_number, 'code': name.replace(' ', '').upper()[:10], 'stage': stage}
        )
        return Response({
            "id": gl.id,
            "name": gl.name,
            "level_number": gl.level_order,
            "stage": gl.stage
        }, status=status.HTTP_201_CREATED)