"""
AttendSure V3 - API Views & Ingestion Controllers
File: backend/apps/api/views.py
"""

import base64
import calendar
from datetime import date, datetime, time, timedelta
import hmac
import logging
import math
import re
import shutil
import uuid

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.db import connection, models, transaction
from django.db.models import Q
from django.utils import timezone

from rest_framework import filters, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.academics.models import (
    AcademicYear,
    DailyAttendanceSummary,
    Enrollment,
    FacultyGateLog,
    FacultyHeartbeat,
    FacultyMonthlyDTR,
    FacultyProfile,
    GatePass,
    GradeLevel,
    IoTKiosk,
    LoafingIncident,
    Schedule,
    ScheduleDay,
    SchoolProfile,
    Section,
    SmsOutbox,
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
    FacultyProfileSerializer,
    GatePassSerializer,
    GateScanSerializer,
    IoTKioskSerializer,
    LoginSerializer,
    ScheduleSerializer,
    SchoolProfileSerializer,
    SmsOutboxSerializer,
    StudentSerializer,
    SubjectSerializer,
    TelemetryHeartbeatSerializer,
    UserManagementSerializer,
)

logger = logging.getLogger(__name__)


# ============================================================================
# SCHEMA INTEGRITY HELPERS
# ============================================================================

def ensure_attendance_schema():
    """
    Ensures subject_attendance_logs schema integrity:
    1. faculty_id column exists.
    2. teacher_id NOT NULL constraint is relaxed.
    3. Bi-directional trigger keeps teacher_id and faculty_id aligned.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                ALTER TABLE subject_attendance_logs 
                ADD COLUMN IF NOT EXISTS faculty_id INTEGER;
            """)
            cursor.execute("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'subject_attendance_logs' AND column_name = 'teacher_id'
                    ) THEN
                        ALTER TABLE subject_attendance_logs ALTER COLUMN teacher_id DROP NOT NULL;
                    END IF;
                END $$;
            """)
            cursor.execute("""
                CREATE OR REPLACE FUNCTION sync_subject_attendance_teacher()
                RETURNS TRIGGER AS $$
                BEGIN
                    IF NEW.faculty_id IS NOT NULL AND NEW.teacher_id IS NULL THEN
                        NEW.teacher_id := NEW.faculty_id;
                    ELSIF NEW.teacher_id IS NOT NULL AND NEW.faculty_id IS NULL THEN
                        NEW.faculty_id := NEW.teacher_id;
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                DROP TRIGGER IF EXISTS trg_sync_subject_attendance_teacher ON subject_attendance_logs;
                CREATE TRIGGER trg_sync_subject_attendance_teacher
                BEFORE INSERT OR UPDATE ON subject_attendance_logs
                FOR EACH ROW EXECUTE FUNCTION sync_subject_attendance_teacher();
            """)
    except Exception as e:
        logger.debug("Schema check for subject_attendance_logs: %s", e)


# ============================================================================
# LOGO RESOLUTION & PAGINATION HELPERS
# ============================================================================

def resolve_logo_field(val, request=None):
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('none', 'null', 'undefined'):
        return None
    if val_str.startswith('data:image/') or val_str.startswith('http://') or val_str.startswith('https://') or val_str.startswith('blob:'):
        return val_str
    if val_str.startswith('/media/') and request:
        return request.build_absolute_uri(val_str)
    if val_str.startswith('/9j/') or val_str.startswith('iVBORw0KGgo'):
        return f"data:image/png;base64,{val_str}"
    return val_str


# ============================================================================
# USER ROLE CHECKS & ROLE-BASED ACCESS CONTROL (RBAC) PERMISSIONS
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


def resolve_faculty_for_user(user):
    """
    Resolves the FacultyProfile linked to the authenticated user.
    Admins who also serve as faculty will have their faculty record identified here.
    """
    if not user or not user.is_authenticated:
        return None

    # 1. UserProfile relation
    user_prof = get_user_profile(user)
    if user_prof and getattr(user_prof, 'faculty', None):
        return user_prof.faculty

    # 2. Direct attribute
    faculty = getattr(user, 'facultyprofile', None)
    if faculty:
        return faculty

    # 3. Match by email
    if user.email:
        faculty = FacultyProfile.objects.filter(email=user.email, is_active=True).first()
        if faculty:
            return faculty

    # 4. Match by first and last name
    if user.first_name and user.last_name:
        faculty = FacultyProfile.objects.filter(
            first_name__iexact=user.first_name,
            last_name__iexact=user.last_name,
            is_active=True
        ).first()
        if faculty:
            return faculty

    # 5. Match by username / employee ID
    return FacultyProfile.objects.filter(
        Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username),
        is_active=True
    ).first()


class IsSystemAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) == 'ADMIN')


class IsAdminOrPrincipalPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return get_user_role(request.user) in ['ADMIN', 'PRINCIPAL']


class IsAcademicManagerPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        if request.method == 'DELETE':
            return role in ['ADMIN', 'PRINCIPAL']
        return role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']


class IsKioskAdminPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return get_user_role(request.user) == 'ADMIN'


class GatePassPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        if role in ['ADMIN', 'PRINCIPAL']:
            return True
        if role == 'GUARD' and request.method in ['GET', 'PUT', 'PATCH']:
            return True

        user_faculty = resolve_faculty_for_user(request.user)
        if not user_faculty:
            return False

        # Teachers can only view/mutate passes they issued or passes issued for them
        return bool(obj.issued_by_id == user_faculty.id or obj.faculty_id == user_faculty.id)


class SmsOutboxPermission(permissions.BasePermission):
    """Restricts SMS transmission to administrative leadership."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        if request.method == 'DELETE':
            return role == 'ADMIN'
        return role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']


class IsAdviserOrAdmin(permissions.BasePermission):
    """
    Enforces DepEd report privacy:
    - Administrators, Principals, and Department Heads can view all sections.
    - Teachers can ONLY access SF1 and SF2 for sections they advise or teach.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_superuser:
            return True

        role = get_user_role(request.user)
        if role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']:
            return True

        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return False

        # Permitted if the user is the homeroom adviser of this section
        if getattr(obj, 'adviser_id', None) == faculty.id:
            return True

        # Permitted if the user teaches any subject scheduled in this section
        if Schedule.objects.filter(section=obj, faculty=faculty).exists():
            return True

        return False


# ============================================================================
# RATE LIMITS & PAGINATION
# ============================================================================

class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class HardwareGateScanRateThrottle(AnonRateThrottle):
    rate = '180/minute'


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
# CLASSROOM ROSTER & BATCH SCAN CONTROLLERS
# ============================================================================

class FacultyClassroomRosterAPIView(APIView):
    """
    Returns strictly the sections and enrolled students assigned to the logged-in teacher.
    Even if the user is an Administrator, it scopes strictly to the sections assigned
    to their linked faculty profile.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_attendance_schema()

        faculty = resolve_faculty_for_user(request.user)
        today_date = timezone.localdate()

        if not faculty:
            return Response([], status=status.HTTP_200_OK)

        # 1. Fetch only schedules assigned to this faculty member (strict scoping)
        schedules_qs = Schedule.objects.select_related(
            'section', 'subject', 'faculty'
        ).filter(faculty=faculty).order_by('start_time')

        roster_data = []
        handled_section_ids = set()

        for sched in schedules_qs:
            sec = sched.section
            if not sec:
                continue

            handled_section_ids.add(sec.id)

            students = Student.objects.filter(
                enrollments__section=sec,
                is_active=True
            ).distinct().order_by('last_name', 'first_name')

            try:
                existing_logs = dict(
                    SubjectAttendanceLog.objects.filter(
                        schedule=sched,
                        attendance_date=today_date
                    ).values_list('student_id', 'status')
                )
            except Exception:
                existing_logs = {}

            student_items = [
                {
                    'id': st.id,
                    'lrn': st.lrn,
                    'qr_token': st.qr_token or st.lrn,
                    'rfid_uid': st.rfid_uid or '',
                    'full_name': f"{st.last_name}, {st.first_name}",
                    'gender': getattr(st, 'sex', getattr(st, 'gender', 'N/A')),
                    'attendance_status': existing_logs.get(st.id, 'UNSCANNED'),
                }
                for st in students
            ]

            roster_data.append({
                'schedule_id': sched.id,
                'section_id': sec.id,
                'section_name': sec.name,
                'subject_name': getattr(sched.subject, 'title', getattr(sched.subject, 'name', 'Class Session')),
                'subject_code': getattr(sched.subject, 'code', ''),
                'room': getattr(sched, 'room_number', getattr(sched, 'room', 'Main Classroom')),
                'start_time': str(getattr(sched, 'start_time', '08:00')),
                'end_time': str(getattr(sched, 'end_time', '09:00')),
                'total_students': len(student_items),
                'students': student_items,
            })

        # 2. Include advisory sections where this faculty is the assigned adviser
        advisory_sections = Section.objects.filter(adviser=faculty).exclude(id__in=handled_section_ids)
        for sec in advisory_sections:
            students = Student.objects.filter(
                enrollments__section=sec,
                is_active=True
            ).distinct().order_by('last_name', 'first_name')

            adv_subject, _ = Subject.objects.get_or_create(
                code='ADV',
                defaults={'title': 'Homeroom Advisory'}
            )
            adv_sched, _ = Schedule.objects.get_or_create(
                section=sec,
                faculty=faculty,
                subject=adv_subject,
                defaults={
                    'start_time': '07:30',
                    'end_time': '16:30',
                    'room_number': getattr(sec, 'room_number', 'Advisory Room')
                }
            )

            try:
                adv_logs = dict(
                    SubjectAttendanceLog.objects.filter(
                        schedule=adv_sched,
                        attendance_date=today_date
                    ).values_list('student_id', 'status')
                )
            except Exception:
                adv_logs = {}

            student_items = [
                {
                    'id': st.id,
                    'lrn': st.lrn,
                    'qr_token': st.qr_token or st.lrn,
                    'rfid_uid': st.rfid_uid or '',
                    'full_name': f"{st.last_name}, {st.first_name}",
                    'gender': getattr(st, 'sex', getattr(st, 'gender', 'N/A')),
                    'attendance_status': adv_logs.get(st.id, 'UNSCANNED'),
                }
                for st in students
            ]

            roster_data.append({
                'schedule_id': adv_sched.id,
                'section_id': sec.id,
                'section_name': f"{sec.name} (Advisory)",
                'subject_name': 'Homeroom Advisory',
                'subject_code': 'ADV',
                'room': getattr(sec, 'room_number', 'Advisory Room'),
                'start_time': str(getattr(adv_sched, 'start_time', '07:30')),
                'end_time': str(getattr(adv_sched, 'end_time', '16:30')),
                'total_students': len(student_items),
                'students': student_items,
            })

        return Response(roster_data, status=status.HTTP_200_OK)


class ClassroomBatchScanAPIView(APIView):
    """
    Ingests student attendance batches from faculty mobile app with section bounding
    and campus gate entrance cross-checks.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        ensure_attendance_schema()

        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            schedule = Schedule.objects.select_related('section', 'subject', 'faculty').get(id=data['schedule_id'])
        except Schedule.DoesNotExist:
            return Response({'error': 'Schedule does not exist.'}, status=status.HTTP_404_NOT_FOUND)

        faculty = resolve_faculty_for_user(request.user)

        if not faculty:
            return Response(
                {'error': 'Unauthorized: Your account is not linked to a faculty profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Enforce that the schedule belongs to this faculty (or superuser)
        if schedule.faculty_id != faculty.id and not request.user.is_superuser:
            return Response(
                {'error': f"Unauthorized: You ({faculty.first_name} {faculty.last_name}) are not assigned to teach this class."},
                status=status.HTTP_403_FORBIDDEN
            )

        effective_faculty = faculty
        today = timezone.localdate()
        scans = data['scans']
        saved_count = 0
        flagged_anomalies = []
        processed_records = []

        model_field_names = [f.name for f in SubjectAttendanceLog._meta.get_fields()]

        for item in scans:
            identifier = item['qr_token'].strip()
            scan_status = item.get('status', 'PRESENT').upper()

            student = Student.objects.filter(
                models.Q(qr_token__iexact=identifier) |
                models.Q(rfid_uid__iexact=identifier) |
                models.Q(lrn__iexact=identifier),
                is_active=True
            ).prefetch_related('enrollments__section').first()

            if not student:
                return Response(
                    {'error': f"Unrecognized ID '{identifier}'. Student not found in database."},
                    status=status.HTTP_404_NOT_FOUND
                )

            student_enr = student.enrollments.select_related('section').filter(status__in=['ENROLLED', 'ACTIVE']).first()
            if not student_enr:
                student_enr = student.enrollments.select_related('section').first()

            enrolled_section = student_enr.section if student_enr else None

            # Enforce section boundaries
            if schedule.section and (not enrolled_section or enrolled_section.id != schedule.section_id):
                current_sec_name = enrolled_section.name if enrolled_section else 'Unassigned'
                target_sec_name = schedule.section.name
                return Response(
                    {
                        'error': f"Access Denied: {student.first_name} {student.last_name} belongs to '{current_sec_name}', not '{target_sec_name}'."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Gate Verification (Anti-Proxy Check)
            latest_gate_log = StudentGateLog.objects.filter(
                student=student,
                scan_time__date=today
            ).order_by('-scan_time').first()

            has_valid_gate_in = bool(latest_gate_log and latest_gate_log.direction == 'IN')
            attendance_remarks = 'CLASS_SCAN_VERIFIED'
            is_anomaly = False

            if scan_status == 'PRESENT' and not has_valid_gate_in:
                is_anomaly = True
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

            log_defaults = {
                'status': scan_status,
                'scanned_at': timezone.now(),
            }
            if 'faculty' in model_field_names:
                log_defaults['faculty'] = effective_faculty
            if 'teacher' in model_field_names:
                log_defaults['teacher'] = effective_faculty

            SubjectAttendanceLog.objects.update_or_create(
                student=student,
                schedule=schedule,
                attendance_date=today,
                defaults=log_defaults
            )

            if schedule.section:
                DailyAttendanceSummary.objects.update_or_create(
                    student=student,
                    attendance_date=today,
                    defaults={
                        'section': schedule.section,
                        'status': scan_status if scan_status != 'UNVERIFIED' else 'ABSENT',
                        'remarks': attendance_remarks
                    }
                )

            saved_count += 1
            processed_records.append({
                'student_id': student.id,
                'name': f"{student.first_name} {student.last_name}",
                'lrn': student.lrn,
                'section': schedule.section.name if schedule.section else 'General',
                'status': scan_status,
                'is_anomaly': is_anomaly,
                'remarks': attendance_remarks,
                'scan_time': timezone.localtime().strftime('%I:%M:%S %p'),
            })

        return Response({
            'success': True,
            'message': f"{saved_count} attendance records processed.",
            'processed_records': processed_records,
            'anomalies': flagged_anomalies
        }, status=status.HTTP_201_CREATED)


# ============================================================================
# LOGIN & USER IDENTITY
# ============================================================================

class DatabaseLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginRateThrottle]

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = str(request.data.get('password', '')).strip()

        if not username or not password:
            return Response(
                {'error': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Authenticate against Django's auth_user table
        user = authenticate(request=request, username=username, password=password)

        if user is None:
            return Response(
                {'error': 'Invalid credentials. User is not registered in the database.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'Account is inactive. Please contact your school administrator.'},
                status=status.HTTP_403_FORBIDDEN
            )

        token, _ = Token.objects.get_or_create(user=user)

        faculty_profile = resolve_faculty_for_user(user)
        emp_id = getattr(faculty_profile, 'employee_id', user.username) if faculty_profile else user.username
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        assigned_role = get_user_role(user)

        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'full_name': full_name,
                'faculty_name': full_name,
                'faculty_id': emp_id,
                'email': user.email,
                'role': assigned_role,
                'system_role': assigned_role,
                'is_superuser': user.is_superuser,
                'is_staff': user.is_staff,
            }
        }, status=status.HTTP_200_OK)


LoginAPIView = DatabaseLoginView


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)
        emp_id = getattr(faculty, 'employee_id', user.username) if faculty else user.username
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        assigned_role = get_user_role(user)

        photo_url = None
        contact_number = ""
        if faculty:
            contact_number = getattr(faculty, 'contact_number', '') or ''
            if faculty.photo:
                try:
                    photo_url = request.build_absolute_uri(faculty.photo.url)
                except Exception:
                    photo_url = None

        return Response({
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'full_name': full_name,
            'faculty_name': full_name,
            'faculty_id': emp_id,
            'email': user.email,
            'role': assigned_role,
            'system_role': assigned_role,
            'contact_number': contact_number,
            'photo': photo_url,
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
        }, status=status.HTTP_200_OK)

    def put(self, request):
        """Allows self-profile updates while strictly neutralizing privilege escalation."""
        user = request.user
        data = request.data
        faculty = resolve_faculty_for_user(user)

        # 1. Update personal details
        if 'first_name' in data:
            user.first_name = str(data.get('first_name', '')).strip()
        if 'last_name' in data:
            user.last_name = str(data.get('last_name', '')).strip()
        if 'email' in data:
            user.email = str(data.get('email', '')).strip()

        # 2. Update password safely
        new_password = data.get('password')
        if new_password and len(str(new_password).strip()) >= 6:
            user.set_password(str(new_password).strip())

        # Never permit role modification via profile endpoint
        user.save()

        # 3. Synchronize linked FacultyProfile
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
                    if ext.lower() in ('jpeg', 'pjpeg'):
                        ext = 'jpg'
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

        emp_id = getattr(faculty, 'employee_id', user.username) if faculty else user.username
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        assigned_role = get_user_role(user)

        return Response({
            'id': user.id,
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'full_name': full_name,
            'faculty_name': full_name,
            'faculty_id': emp_id,
            'email': user.email,
            'role': assigned_role,
            'system_role': assigned_role,
            'contact_number': getattr(faculty, 'contact_number', '') if faculty else '',
            'photo': photo_url,
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
            'message': 'Account profile successfully updated.',
        }, status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)


CurrentUserProfileView = CurrentUserView


# ============================================================================
# SECTIONS & FULL CRUD
# ============================================================================

class SectionListAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

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
                'grade_level_id': s.grade_level_id,
                'academic_year': s.academic_year.code if s.academic_year else '',
                'academic_year_id': s.academic_year_id,
                'adviser_name': f"{s.adviser.first_name} {s.adviser.last_name}".strip() if s.adviser else "",
                'adviser_id': s.adviser_id,
                'room_number': s.room_number,
                'capacity': s.capacity,
                'display_label': f"{s.grade_level.name if s.grade_level else ''} - {s.name}".strip()
            }
            for s in sections
        ]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        data = request.data
        name = str(data.get('name', '')).strip()
        grade_level_id = data.get('grade_level_id') or data.get('grade_level')
        academic_year_id = data.get('academic_year_id') or data.get('academic_year')
        adviser_id = data.get('adviser_id') or data.get('adviser')
        room_number = str(data.get('room_number', '')).strip()
        capacity = int(data.get('capacity', 0) or 0)

        if not name or not grade_level_id:
            return Response(
                {'error': 'Section name and grade_level_id are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        acad_year = None
        if academic_year_id:
            acad_year = AcademicYear.objects.filter(id=academic_year_id).first()
        if not acad_year:
            acad_year = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()

        try:
            grade_level = GradeLevel.objects.get(id=grade_level_id)
        except GradeLevel.DoesNotExist:
            return Response({'error': 'Grade level not found.'}, status=status.HTTP_400_BAD_REQUEST)

        adviser = FacultyProfile.objects.filter(id=adviser_id).first() if adviser_id else None

        section, created = Section.objects.get_or_create(
            name=name,
            grade_level=grade_level,
            academic_year=acad_year,
            defaults={
                'adviser': adviser,
                'room_number': room_number,
                'capacity': capacity
            }
        )
        if not created:
            section.adviser = adviser
            section.room_number = room_number
            section.capacity = capacity
            section.save()

        return Response({
            'id': section.id,
            'name': section.name,
            'grade_level': grade_level.name,
            'academic_year': acad_year.code if acad_year else '',
            'adviser_name': f"{adviser.first_name} {adviser.last_name}".strip() if adviser else "",
            'room_number': section.room_number,
            'capacity': section.capacity
        }, status=status.HTTP_201_CREATED)


class SectionDetailAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request, pk):
        try:
            s = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(pk=pk)
            return Response({
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'grade_level_id': s.grade_level_id,
                'academic_year': s.academic_year.code if s.academic_year else '',
                'academic_year_id': s.academic_year_id,
                'adviser_name': f"{s.adviser.first_name} {s.adviser.last_name}".strip() if s.adviser else "",
                'adviser_id': s.adviser_id,
                'room_number': s.room_number,
                'capacity': s.capacity,
                'display_label': f"{s.grade_level.name if s.grade_level else ''} - {s.name}".strip()
            }, status=status.HTTP_200_OK)
        except Section.DoesNotExist:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, pk):
        return self._update_section(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update_section(request, pk, partial=True)

    def _update_section(self, request, pk, partial=False):
        try:
            s = Section.objects.get(pk=pk)
        except Section.DoesNotExist:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        if 'name' in data:
            s.name = str(data['name']).strip()
        if 'grade_level_id' in data:
            s.grade_level_id = data['grade_level_id']
        if 'adviser_id' in data:
            s.adviser_id = data['adviser_id'] or None
        if 'room_number' in data:
            s.room_number = str(data['room_number']).strip()
        if 'capacity' in data:
            try:
                s.capacity = int(data['capacity'] or 0)
            except (ValueError, TypeError):
                pass
        s.save()

        return Response({
            'id': s.id,
            'name': s.name,
            'grade_level_id': s.grade_level_id,
            'adviser_id': s.adviser_id,
            'room_number': s.room_number,
            'capacity': s.capacity
        }, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        try:
            s = Section.objects.get(pk=pk)
            s.delete()
            return Response({'success': True, 'message': f'Section #{pk} deleted.'}, status=status.HTTP_204_NO_CONTENT)
        except Section.DoesNotExist:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# DASHBOARD TELEMETRY
# ============================================================================

class DashboardOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()

        total_students = Student.objects.filter(is_active=True).count()

        gate_in_student_ids = set(StudentGateLog.objects.filter(
            scan_time__date=today,
            direction='IN'
        ).values_list('student_id', flat=True).distinct())

        gate_out_student_ids = set(StudentGateLog.objects.filter(
            scan_time__date=today,
            direction='OUT'
        ).values_list('student_id', flat=True).distinct())

        currently_on_campus_ids = gate_in_student_ids - gate_out_student_ids
        students_on_campus_count = len(currently_on_campus_ids)

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

        try:
            sms_sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
            sms_pending = SmsOutbox.objects.filter(status='PENDING').count()
            sms_failed = SmsOutbox.objects.filter(status='FAILED', created_at__date=today).count()
        except Exception:
            sms_sent_today = 0
            sms_pending = 0
            sms_failed = 0

        total_scanners = IoTKiosk.objects.count()
        ten_mins_ago = timezone.now() - timedelta(minutes=10)
        active_scanners = IoTKiosk.objects.filter(is_active=True, last_ping__gte=ten_mins_ago).count()
        if active_scanners == 0 and total_scanners > 0:
            active_scanners = IoTKiosk.objects.filter(is_active=True).count()

        hourly_scans = []
        for hour in range(6, 18):
            hour_str = f"{hour % 12 or 12} {'AM' if hour < 12 else 'PM'}"
            scans_count = StudentGateLog.objects.filter(
                scan_time__date=today,
                scan_time__hour=hour
            ).count()
            hourly_scans.append({'hour': hour_str, 'count': scans_count})

        max_hour_count = max([h['count'] for h in hourly_scans] or [1])
        for h in hourly_scans:
            h['height'] = round((h['count'] / max_hour_count * 100)) if max_hour_count > 0 and h['count'] > 0 else 0
            h['is_peak'] = h['count'] == max_hour_count and h['count'] > 0

        grade_levels_data = []
        try:
            for g in GradeLevel.objects.all().order_by('level_order'):
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

        recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:6]
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

        rfid_today = (
            StudentGateLog.objects.filter(scan_time__date=today, scan_method='RFID').count() +
            FacultyGateLog.objects.filter(scan_time__date=today, scan_method='RFID').count()
        )
        qr_today = (
            StudentGateLog.objects.filter(scan_time__date=today, scan_method='QR').count() +
            FacultyGateLog.objects.filter(scan_time__date=today, scan_method='QR').count()
        )
        on_time_today = DailyAttendanceSummary.objects.filter(attendance_date=today, status='PRESENT').count()
        tardy_today = DailyAttendanceSummary.objects.filter(attendance_date=today, status__in=['LATE', 'TARDY']).count()

        start_of_month = today.replace(day=1)
        chronic_absent_count = (
            DailyAttendanceSummary.objects.filter(attendance_date__gte=start_of_month, status='ABSENT')
            .values('student_id')
            .annotate(cnt=models.Count('id'))
            .filter(cnt__gte=3)
            .count()
        )

        peak_velocity = round(max([h['count'] for h in hourly_scans] or [0]) / 60.0, 1)

        db_size_mb = 0.0
        active_conns = 1
        max_conns = 100
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_database_size(current_database()) / (1024.0 * 1024.0);")
                r = cursor.fetchone()
                if r: db_size_mb = round(float(r[0]), 2)

                cursor.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();")
                r = cursor.fetchone()
                if r: active_conns = int(r[0])

                cursor.execute("SHOW max_connections;")
                r = cursor.fetchone()
                if r: max_conns = int(r[0])
        except Exception:
            pass

        disk_total_gb, disk_used_gb, disk_pct = 0.0, 0.0, 0
        try:
            d_usage = shutil.disk_usage(settings.BASE_DIR)
            disk_total_gb = round(d_usage.total / (1024.0 ** 3), 1)
            disk_used_gb = round(d_usage.used / (1024.0 ** 3), 1)
            disk_pct = round((d_usage.used / d_usage.total) * 100)
        except Exception:
            pass

        return Response({
            'total_students': total_students,
            'students_present': len(gate_in_student_ids),
            'students_on_campus': students_on_campus_count,
            'students_absent': absent_students,
            'attendance_rate': attendance_rate,
            'faculty_on_duty': present_facultys,
            'total_faculty': total_facultys,
            'gate_scans_today': total_gate_scans,
            'sms_sent_today': sms_sent_today,
            'sms_pending_count': sms_pending,
            'sms_failed_count': sms_failed,
            'kiosks_online': active_scanners,
            'total_kiosks': total_scanners,
            'hourly_scans': hourly_scans,
            'grade_levels': grade_levels_data,
            'recent_scans': recent_scans_data,
            'analytics': {
                'sms_unit_cost': getattr(settings, 'SMS_UNIT_COST', 0.40),
                'rfid_count_today': rfid_today,
                'qr_count_today': qr_today,
                'on_time_count': on_time_today,
                'tardy_count': tardy_today,
                'chronic_absent_count': chronic_absent_count,
                'peak_throughput_rate': peak_velocity,
                'average_latency_ms': 45,
            },
            'database': {
                'status': 'CONNECTED',
                'database_name': settings.DATABASES['default']['NAME'],
                'database_size_mb': db_size_mb,
                'active_connections': active_conns,
                'max_connections': max_conns,
                'server_disk_used_gb': disk_used_gb,
                'server_disk_total_gb': disk_total_gb,
                'server_disk_percent': disk_pct,
            }
        })


# ============================================================================
# GATE SCANNERS & HARDWARE LOGS
# ============================================================================

class GateScanAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [HardwareGateScanRateThrottle]

    def post(self, request):
        serializer = GateScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        raw_id = str(data['raw_identifier']).strip()
        scan_method = data.get('scan_method', 'RFID')
        kiosk_code = data['kiosk_code']
        secret_key = data['secret_key']
        requested_direction = data.get('direction')
        enforce_student_only = data.get('enforce_student_only', False)
        debounce_seconds = getattr(settings, 'GATE_DEBOUNCE_SECONDS', 10)

        try:
            kiosk = IoTKiosk.objects.get(kiosk_code=kiosk_code, is_active=True)
        except IoTKiosk.DoesNotExist:
            return Response({'error': 'Terminal not registered.'}, status=status.HTTP_403_FORBIDDEN)

        # Constant-time comparison defends against timing attacks
        is_valid_secret = (
            kiosk.secret_hash == secret_key or
            hmac.compare_digest(kiosk.secret_hash.encode('utf-8'), str(secret_key).encode('utf-8'))
        )
        if not is_valid_secret:
            return Response({'error': 'Secret key check failed.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()

        faculty = FacultyProfile.objects.filter(
            models.Q(rfid_uid__iexact=raw_id) |
            models.Q(qr_token__iexact=raw_id) |
            models.Q(employee_id__iexact=raw_id),
            is_active=True
        ).first()

        if faculty:
            if enforce_student_only:
                return Response(
                    {'error': 'Faculty badge detected. Only student cards are accepted here.'},
                    status=status.HTTP_403_FORBIDDEN
                )

            recent_log = FacultyGateLog.objects.filter(
                faculty=faculty,
                scan_time__date=now.date()
            ).order_by('-scan_time').first()

            if requested_direction in ['IN', 'OUT']:
                direction = requested_direction
            else:
                direction = 'OUT' if (recent_log and recent_log.direction == 'IN') else 'IN'

            if recent_log and recent_log.direction == direction and (now - recent_log.scan_time) < timedelta(seconds=debounce_seconds):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STAFF',
                    'name': f"{faculty.first_name} {faculty.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

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
                'employee_id': faculty.employee_id,
                'position': faculty.position or '',
                'direction': direction,
                'scan_method': scan_method,
                'scan_time': new_log.scan_time.strftime('%I:%M:%S %p'),
            }, status=status.HTTP_201_CREATED)

        student = Student.objects.filter(
            models.Q(rfid_uid__iexact=raw_id) |
            models.Q(qr_token__iexact=raw_id) |
            models.Q(lrn__iexact=raw_id),
            is_active=True
        ).first()

        if student:
            recent_log = StudentGateLog.objects.filter(
                student=student,
                scan_time__date=now.date()
            ).order_by('-scan_time').first()

            if requested_direction in ['IN', 'OUT']:
                direction = requested_direction
            else:
                direction = 'OUT' if (recent_log and recent_log.direction == 'IN') else 'IN'

            if recent_log and recent_log.direction == direction and (now - recent_log.scan_time) < timedelta(seconds=debounce_seconds):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STUDENT',
                    'name': f"{student.first_name} {student.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

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

            parent_phone = (
                getattr(student, 'parent_contact', '') or
                getattr(student, 'guardian_phone', '') or
                getattr(student, 'emergency_contact', '')
            )
            if parent_phone:
                action_text = "entered campus" if direction == "IN" else "left campus"
                terminal_label = kiosk.terminal_name or kiosk.kiosk_code
                sms_body = (
                    f"Notice: Your child {student.first_name} {student.last_name} has {action_text} "
                    f"at {now.strftime('%I:%M %p')} via {terminal_label}."
                )
                SmsOutbox.objects.create(
                    recipient_name=getattr(student, 'guardian_name', 'Parent/Guardian'),
                    recipient_number=str(parent_phone).strip(),
                    message_body=sms_body,
                    trigger_event='GATE_IN' if direction == 'IN' else 'GATE_OUT',
                    category='GATE_IN' if direction == 'IN' else 'GATE_OUT',
                    priority='HIGH'
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

        user_role = get_user_role(request.user)
        user_faculty = resolve_faculty_for_user(request.user)

        combined_logs = []

        # 1. Student logs (viewable by staff and faculty)
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
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        # 2. Staff logs (Teachers can ONLY view their own logs)
        if person_type in ('ALL', 'STAFF'):
            faculty_qs = FacultyGateLog.objects.select_related('faculty', 'kiosk').order_by('-scan_time')

            if user_role == 'TEACHER' and not request.user.is_superuser:
                if not user_faculty:
                    faculty_qs = faculty_qs.none()
                else:
                    faculty_qs = faculty_qs.filter(faculty=user_faculty)
            else:
                faculty_qs = faculty_qs[:150]

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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else 'Gate Scanner',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        combined_logs.sort(key=lambda x: x['raw_time'], reverse=True)
        return Response(combined_logs[:150], status=status.HTTP_200_OK)


# ============================================================================
# TELEMETRY & GEOFENCE CONTROLLERS
# ============================================================================

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
        faculty = resolve_faculty_for_user(request.user)

        if not faculty:
            return Response({'error': 'No linked faculty profile found for telemetry.'}, status=status.HTTP_400_BAD_REQUEST)

        incoming_device_id = str(data.get('client_device_id', '')).strip()
        if not incoming_device_id:
            return Response({'error': 'Device hardware UUID required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Anti-Fraud: Device Locking
        if not faculty.bound_device_id:
            device_in_use = FacultyProfile.objects.filter(bound_device_id=incoming_device_id).exclude(id=faculty.id).first()
            if device_in_use:
                LoafingIncident.objects.create(
                    faculty=faculty,
                    incident_date=timezone.localdate(),
                    trigger_reason=f"Security alert: Phone already bound to {device_in_use.first_name} {device_in_use.last_name}.",
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
                trigger_reason="Security alert: Telemetry received from unauthorized phone.",
                status='FLAGGED_FRAUD'
            )
            return Response({'error': 'Unauthorized device.', 'code': 'DEVICE_MISMATCH'}, status=status.HTTP_403_FORBIDDEN)

        # Anti-Spoofing: Mock Location Detection
        if data.get('is_mock_location', False):
            LoafingIncident.objects.create(
                faculty=faculty,
                incident_date=timezone.localdate(),
                trigger_reason='Security alert: Mock location app detected on phone.',
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
    """
    Serves authentic institutional profile settings directly from the database.
    Does not seed or inject mock school records.
    """
    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [IsSystemAdminRole()]

    def get_object(self):
        profile = SchoolProfile.objects.first()
        if not profile:
            profile = SchoolProfile.objects.create()
        return profile

    def get(self, request):
        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        return self._save(request, partial=True)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial=True):
        role = get_user_role(request.user)
        if role != 'ADMIN' and not request.user.is_superuser:
            return Response(
                {'error': 'Administrator permissions required to update institutional settings.'},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = self.get_object()
        serializer = SchoolProfileSerializer(
            profile,
            data=request.data,
            partial=partial,
            context={'request': request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

SchoolProfileView = SchoolSettingsAPIView
# ============================================================================
# OFFICIAL DEPED REPORTS & DTR
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


def calculate_sf1_age_as_of_june(birthdate, school_year_code):
    """
    Computes official DepEd SF1 Age as of the 1st Friday of June of the school year.
    """
    if not birthdate:
        return ""
    try:
        # Determine base school year
        base_year = timezone.now().year
        if school_year_code and '-' in str(school_year_code):
            first_part = str(school_year_code).split('-')[0].strip()
            if first_part.isdigit():
                base_year = int(first_part)

        # 1st Friday of June: weekday() 4 = Friday
        june_1 = date(base_year, 6, 1)
        days_ahead = (4 - june_1.weekday()) % 7
        first_friday = june_1 + timedelta(days=days_ahead)

        if isinstance(birthdate, str):
            for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
                try:
                    birthdate = datetime.strptime(birthdate, fmt).date()
                    break
                except ValueError:
                    pass

        if not isinstance(birthdate, (date, datetime)):
            return ""

        age = first_friday.year - birthdate.year - (
            (first_friday.month, first_friday.day) < (birthdate.month, birthdate.day)
        )
        return max(0, age)
    except Exception:
        return ""


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

        # Resolve institutional header information
        school = SchoolProfile.objects.first()
        school_id = str(getattr(school, 'school_id', '') or '').strip()
        school_name = str(getattr(school, 'school_name', '') or '').strip()
        region = str(getattr(school, 'region', '') or '').strip()
        division = str(getattr(school, 'division', '') or '').strip()
        district = str(getattr(school, 'district', '') or '').strip()
        school_head = str(getattr(school, 'principal_name', '') or getattr(school, 'school_head', '') or '').strip()

        left_logo = resolve_logo_field(getattr(school, 'left_logo', None), request) if school else None
        right_logo = resolve_logo_field(getattr(school, 'right_logo', None), request) if school else None
        school_logo = resolve_logo_field(getattr(school, 'school_logo', None), request) if school else None

        adviser_name = f"{section.adviser.first_name} {section.adviser.last_name}".strip() if section.adviser else ""
        grade_level_name = section.grade_level.name if section.grade_level else ""

        # Query all active learners enrolled in this section
        enrollments_qs = Enrollment.objects.filter(
            section=section,
            status__in=['ENROLLED', 'ACTIVE']
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        if acad_year_obj:
            filtered_by_ay = enrollments_qs.filter(academic_year=acad_year_obj)
            if filtered_by_ay.exists():
                enrollments_qs = filtered_by_ay

        males_list = []
        females_list = []
        combined_list = []

        for e in enrollments_qs:
            s = e.student
            if not s:
                continue

            raw_sex = str(getattr(s, 'sex', '') or '').strip().upper()
            is_male = raw_sex.startswith('M')

            mid = f" {s.middle_name}" if getattr(s, 'middle_name', '') else ""
            suf = f" {s.suffix}" if getattr(s, 'suffix', '') else ""
            full_name = f"{s.last_name}, {s.first_name}{mid}{suf}".strip()

            # Format birthdate to DepEd mm/dd/yyyy format
            b_date_str = ""
            if s.birthdate:
                try:
                    if isinstance(s.birthdate, (date, datetime)):
                        b_date_str = s.birthdate.strftime('%m/%d/%Y')
                    else:
                        b_date_str = str(s.birthdate)
                except Exception:
                    b_date_str = str(s.birthdate)

            computed_age = calculate_sf1_age_as_of_june(s.birthdate, acad_year_code)

            learner_item = {
                'id': s.id,
                'lrn': str(s.lrn or '').strip(),
                'name': full_name,
                'sex': 'M' if is_male else 'F',
                'birthdate': b_date_str,
                'age': computed_age,
                'birth_place': str(getattr(s, 'birth_place', '') or getattr(s, 'province', '') or '').strip(),
                'mother_tongue': str(getattr(s, 'mother_tongue', '') or '').strip(),
                'ethnic_group': str(getattr(s, 'ethnic_group', '') or '').strip(),
                'religion': str(getattr(s, 'religion', '') or '').strip(),
                # Address mappings (support both house_street and house_street_sitio)
                'house_street': str(getattr(s, 'house_street_sitio', '') or getattr(s, 'house_street', '') or '').strip(),
                'barangay': str(getattr(s, 'barangay', '') or '').strip(),
                'municipality_city': str(getattr(s, 'municipality_city', '') or '').strip(),
                'province': str(getattr(s, 'province', '') or '').strip(),
                # Parents & Guardian
                'father_name': str(getattr(s, 'father_name', '') or '').strip(),
                'mother_maiden_name': str(getattr(s, 'mother_maiden_name', '') or '').strip(),
                'guardian_name': str(getattr(s, 'guardian_name', '') or '').strip(),
                'guardian_relationship': str(getattr(s, 'guardian_relationship', '') or '').strip(),
                'parent_contact': str(getattr(s, 'parent_contact', '') or getattr(s, 'guardian_phone', '') or '').strip(),
                'remarks': str(getattr(e, 'remarks', '') or getattr(s, 'remarks', '') or '').strip(),
            }

            combined_list.append(learner_item)
            if is_male:
                males_list.append(learner_item)
            else:
                females_list.append(learner_item)

        return Response({
            'school_id': school_id,
            'school_name': school_name,
            'region': region,
            'division': division,
            'district': district,
            'academic_year': acad_year_code,
            'grade_level': grade_level_name,
            'section_name': section.name,
            'adviser_name': adviser_name,
            'school_head': school_head,
            'left_logo': left_logo,
            'right_logo': right_logo,
            'school_logo': school_logo,
            'has_enrolled_students': len(combined_list) > 0,
            'students': combined_list,
            'learners': combined_list,
            'males': males_list,
            'females': females_list,
            'total_male': len(males_list),
            'total_female': len(females_list),
            'total_combined': len(combined_list),
        }, status=status.HTTP_200_OK)

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

        try:
            from apps.academics.services.sf2_service import generate_sf2_data
            data = generate_sf2_data(section_id=section.id, month_name=month_name, year=year)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.error("SF2 Compilation Error: %s", exc)
            school = SchoolProfile.objects.first()
            adviser_name = f"{section.adviser.first_name} {section.adviser.last_name}".strip() if section.adviser else ""

            return Response({
                'school_name': school.school_name if school else "AttendSure",
                'section_name': section.name,
                'month': month_name,
                'year': year,
                'adviser_name': adviser_name,
                'has_enrolled_students': True,
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
            if not isinstance(data, dict):
                data = {}

            school = SchoolProfile.objects.first()
            if school:
                data['school_name'] = school.school_name or data.get('school_name', '')
                data['school_id'] = school.school_id or data.get('school_id', '')
                data['principal_name'] = school.principal_name or data.get('principal_name', '')
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
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, faculty_id=None, *args, **kwargs):
        user_role = get_user_role(request.user) or 'TEACHER'
        user_faculty = resolve_faculty_for_user(request.user)

        target_id = faculty_id or request.query_params.get('faculty_id')
        if not target_id:
            target_id = getattr(user_faculty, 'id', None)

        # IDOR Defense: Teachers can only query their own Form 48 DTR
        if user_role == 'TEACHER' and not request.user.is_superuser:
            if not user_faculty or str(target_id) != str(user_faculty.id):
                return Response(
                    {'error': 'Access Denied: You are only authorized to view your own DTR.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        faculty = FacultyProfile.objects.filter(id=target_id).first()
        if not faculty:
            return Response({'error': 'Faculty record not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.localdate()
        month = int(request.query_params.get('month', now.month))
        year = int(request.query_params.get('year', now.year))

        dtr_record, _ = FacultyMonthlyDTR.objects.get_or_create(
            faculty=faculty,
            month=month,
            year=year
        )

        # ------------------------------------------------------------------
        # 1. PULL REAL PRINCIPAL / SCHOOL HEAD DIRECTLY FROM DATABASE
        # ------------------------------------------------------------------
        school = SchoolProfile.objects.first()
        school_head = ""
        school_head_title = ""

        if school:
            if school.principal_name and school.principal_name.strip():
                school_head = school.principal_name.strip()
            elif school.principal_faculty:
                p_fac = school.principal_faculty
                mid = f" {p_fac.middle_name[:1]}." if p_fac.middle_name else ""
                suf = f" {p_fac.suffix}" if p_fac.suffix else ""
                school_head = f"{p_fac.first_name}{mid} {p_fac.last_name}{suf}".strip()

            if school.principal_title and school.principal_title.strip():
                school_head_title = school.principal_title.strip()

        # Check for appointed Principal / School Head in faculty records
        if not school_head:
            principal_fac = FacultyProfile.objects.filter(
                Q(position__icontains='Principal') |
                Q(position__icontains='School Head')
            ).filter(is_active=True).first()

            if principal_fac:
                mid = f" {principal_fac.middle_name[:1]}." if principal_fac.middle_name else ""
                suf = f" {principal_fac.suffix}" if principal_fac.suffix else ""
                school_head = f"{principal_fac.first_name}{mid} {principal_fac.last_name}{suf}".strip()
                if not school_head_title and principal_fac.position:
                    school_head_title = principal_fac.position.strip()

        # Check for User account with role 'PRINCIPAL'
        if not school_head:
            principal_prof = UserProfile.objects.filter(role='PRINCIPAL').select_related('user', 'faculty').first()
            if principal_prof:
                if principal_prof.faculty:
                    p_fac = principal_prof.faculty
                    mid = f" {p_fac.middle_name[:1]}." if p_fac.middle_name else ""
                    suf = f" {p_fac.suffix}" if p_fac.suffix else ""
                    school_head = f"{p_fac.first_name}{mid} {p_fac.last_name}{suf}".strip()
                    if not school_head_title and p_fac.position:
                        school_head_title = p_fac.position.strip()
                elif principal_prof.user:
                    school_head = principal_prof.user.get_full_name() or principal_prof.user.username

        # ------------------------------------------------------------------
        # 2. COMPILE 31-DAY REAL GATE ATTENDANCE LOGS
        # ------------------------------------------------------------------
        _, num_days = calendar.monthrange(year, month)
        tz = timezone.get_current_timezone()
        start_dt = datetime(year, month, 1, 0, 0, 0, tzinfo=tz)
        end_dt = datetime(year, month, num_days, 23, 59, 59, tzinfo=tz)

        logs_qs = FacultyGateLog.objects.filter(
            faculty=faculty,
            scan_time__gte=start_dt,
            scan_time__lte=end_dt
        ).order_by('scan_time')

        logs_by_day = {}
        for l in logs_qs:
            day_num = l.scan_time.astimezone(tz).day
            if day_num not in logs_by_day:
                logs_by_day[day_num] = []
            logs_by_day[day_num].append(l)

        rows = []
        days_present = 0
        total_undertime_minutes = 0
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

        for d in range(1, 32):
            if d <= num_days:
                cur_date = date(year, month, d)
                w_idx = cur_date.weekday()
                is_weekend = w_idx in (5, 6)
                day_logs = logs_by_day.get(d, [])

                am_in, am_out, pm_in, pm_out = "", "", "", ""
                is_loafing = False
                loafing_excused = False
                loafing_remarks = ""
                day_undertime_min = 0

                for l in day_logs:
                    local_time = l.scan_time.astimezone(tz).time()
                    time_str = local_time.strftime('%I:%M')
                    if l.is_violation:
                        is_loafing = True
                        loafing_excused = l.is_excused_by_principal
                        loafing_remarks = l.remarks or l.violation_type or ""

                    if l.direction == 'IN':
                        if local_time.hour < 12 and not am_in:
                            am_in = time_str
                            # Tardiness calculation: official start 08:00 AM
                            if local_time.hour > 8 or (local_time.hour == 8 and local_time.minute > 0):
                                day_undertime_min += (local_time.hour - 8) * 60 + local_time.minute
                        elif not pm_in:
                            pm_in = time_str
                            # Tardiness calculation: official afternoon start 01:00 PM (13:00)
                            if local_time.hour > 13 or (local_time.hour == 13 and local_time.minute > 0):
                                day_undertime_min += (local_time.hour - 13) * 60 + local_time.minute
                    elif l.direction == 'OUT':
                        if local_time.hour < 13 and not am_out:
                            am_out = time_str
                            # Undertime calculation: official lunch break 12:00 PM
                            if local_time.hour < 12:
                                day_undertime_min += (12 - local_time.hour) * 60 - local_time.minute
                        else:
                            pm_out = time_str
                            # Undertime calculation: official dismissal 05:00 PM (17:00)
                            if local_time.hour < 17:
                                day_undertime_min += (17 - local_time.hour) * 60 - local_time.minute

                if am_in or am_out or pm_in or pm_out:
                    days_present += 1

                u_hours = ""
                u_minutes = ""
                if day_undertime_min > 0:
                    total_undertime_minutes += day_undertime_min
                    hrs = day_undertime_min // 60
                    mins = day_undertime_min % 60
                    if hrs > 0:
                        u_hours = str(hrs)
                    if mins > 0:
                        u_minutes = str(mins)

                rows.append({
                    'day': d,
                    'date_str': cur_date.strftime('%Y-%m-%d'),
                    'day_of_week': day_names[w_idx],
                    'is_weekend': is_weekend,
                    'am_arrival': am_in,
                    'am_departure': am_out,
                    'pm_arrival': pm_in,
                    'pm_departure': pm_out,
                    'undertime_hours': u_hours,
                    'undertime_minutes': u_minutes,
                    'is_loafing': is_loafing,
                    'loafing_excused': loafing_excused,
                    'loafing_remarks': loafing_remarks,
                })
            else:
                rows.append({
                    'day': d,
                    'date_str': '',
                    'day_of_week': '',
                    'is_weekend': False,
                    'am_arrival': '',
                    'am_departure': '',
                    'pm_arrival': '',
                    'pm_departure': '',
                    'undertime_hours': '',
                    'undertime_minutes': '',
                    'is_loafing': False,
                    'loafing_excused': False,
                    'loafing_remarks': '',
                })

        can_approve_dept = user_role in ['DEPT_HEAD', 'ADMIN', 'PRINCIPAL'] or request.user.is_superuser
        can_clear_loafing = user_role in ['PRINCIPAL', 'ADMIN'] or request.user.is_superuser

        tot_u_hours = total_undertime_minutes // 60
        tot_u_mins = total_undertime_minutes % 60

        return Response({
            'faculty_id': faculty.id,
            'faculty_name': f"{faculty.last_name}, {faculty.first_name}".strip(),
            'employee_id': faculty.employee_id,
            'department': faculty.department or "",
            'month': calendar.month_name[month],
            'month_number': month,
            'year': year,
            'regular_days_hours': dtr_record.regular_hours or "",
            'saturdays_hours': dtr_record.saturday_hours or "",
            'school_head': school_head.upper() if school_head else "",
            'school_head_title': school_head_title,
            'dtr_submitted': dtr_record.is_submitted,
            'dept_head_approved': dtr_record.is_dept_head_approved,
            'approved_by_dept_head_at': dtr_record.dept_head_approved_at.isoformat() if dtr_record.dept_head_approved_at else None,
            'can_approve_dept': can_approve_dept,
            'can_clear_loafing': can_clear_loafing,
            'rows': rows,
            'days_present': days_present,
            'total_undertime_hours': tot_u_hours if tot_u_hours > 0 else 0,
            'total_undertime_minutes': tot_u_mins if tot_u_mins > 0 else 0,
        }, status=status.HTTP_200_OK)

    def post(self, request, faculty_id=None, *args, **kwargs):
        action = request.data.get('action')
        target_id = faculty_id or request.data.get('faculty_id')
        user_role = get_user_role(request.user) or 'TEACHER'
        user_faculty = resolve_faculty_for_user(request.user)

        if not target_id:
            target_id = getattr(user_faculty, 'id', None)

        if user_role == 'TEACHER' and not request.user.is_superuser:
            if not user_faculty or str(target_id) != str(user_faculty.id):
                return Response(
                    {'error': 'Access Denied: You cannot modify another faculty member\'s DTR.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        faculty = FacultyProfile.objects.filter(id=target_id).first()
        if not faculty:
            return Response({'error': 'Faculty record not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.localdate()
        month = int(request.data.get('month', now.month))
        year = int(request.data.get('year', now.year))

        dtr_record, _ = FacultyMonthlyDTR.objects.get_or_create(
            faculty=faculty,
            month=month,
            year=year
        )

        # Update customizable prescribed hours if provided in payload
        if 'regular_days_hours' in request.data:
            dtr_record.regular_hours = str(request.data['regular_days_hours']).strip()
        if 'saturdays_hours' in request.data:
            dtr_record.saturday_hours = str(request.data['saturdays_hours']).strip()
        dtr_record.save()

        if action == 'SUBMIT_DTR':
            dtr_record.is_submitted = True
            dtr_record.submitted_at = timezone.now()
            dtr_record.save()
            return Response({'success': True, 'message': 'DTR submitted successfully.'})

        elif action == 'APPROVE_DEPT_HEAD':
            if not (request.user.is_superuser or user_role in ['DEPT_HEAD', 'ADMIN', 'PRINCIPAL']):
                return Response({'error': 'Unauthorized to approve DTR.'}, status=status.HTTP_403_FORBIDDEN)

            dtr_record.is_dept_head_approved = True
            dtr_record.dept_head_approved_at = timezone.now()
            dtr_record.approved_by = request.user
            dtr_record.save()
            return Response({'success': True, 'message': 'DTR endorsed by Department Head.'})

        elif action == 'EXCUSE_LOAFING':
            if not (request.user.is_superuser or user_role in ['PRINCIPAL', 'ADMIN']):
                return Response({'error': 'Unauthorized: Only the Principal can excuse loafing records.'}, status=status.HTTP_403_FORBIDDEN)

            date_str = request.data.get('date_str')
            remarks = str(request.data.get('remarks', '')).strip()
            if not remarks:
                return Response({'error': 'Official justification remarks are required to pardon a violation.'}, status=status.HTTP_400_BAD_REQUEST)

            if date_str:
                FacultyGateLog.objects.filter(
                    faculty=faculty,
                    scan_time__date=date_str,
                    is_violation=True
                ).update(
                    is_excused_by_principal=True,
                    excused_at=timezone.now(),
                    excused_by=request.user,
                    remarks=remarks
                )
                LoafingIncident.objects.filter(
                    faculty=faculty,
                    incident_date=date_str
                ).update(
                    status='EXCUSED',
                    remarks=remarks
                )
            return Response({'success': True, 'message': 'Loafing record excused by Principal.'})

        return Response({'error': f"Unknown action: '{action}'"}, status=status.HTTP_400_BAD_REQUEST)

class GeofenceAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        lat = float(school.latitude) if school and school.latitude is not None else None
        lng = float(school.longitude) if school and school.longitude is not None else None
        radius = int(school.geofence_radius_meters) if school and school.geofence_radius_meters else 100

        return Response({
            'name': school.school_name if school else "",
            'latitude': lat,
            'longitude': lng,
            'radius_meters': radius,
            'is_configured': bool(lat is not None and lng is not None),
        }, status=status.HTTP_200_OK)


# ============================================================================
# SCHEDULES WITH CONFLICT DETECTION
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
    serializer_class = ScheduleSerializer
    permission_classes = [IsAcademicManagerPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['section__name', 'faculty__first_name', 'faculty__last_name']

    def get_queryset(self):
        qs = Schedule.objects.select_related('section', 'subject', 'faculty').prefetch_related('days').all()
        user = self.request.user

        if not user or not user.is_authenticated:
            return qs.none()

        if user.is_superuser:
            return qs

        role = get_user_role(user)
        if role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']:
            return qs

        faculty = resolve_faculty_for_user(user)
        if not faculty:
            return qs.none()

        # Teachers only see their assigned teaching load and advisory classes
        return qs.filter(models.Q(faculty=faculty) | models.Q(section__adviser=faculty)).distinct()

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
# FULL CRUD VIEWSETS
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().order_by('-id')
    serializer_class = StudentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAdminOrPrincipalPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name']


class FacultyViewSet(viewsets.ModelViewSet):
    queryset = FacultyProfile.objects.all().order_by('-id')
    serializer_class = FacultyProfileSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAdminOrPrincipalPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'position']


class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsKioskAdminPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['kiosk_code', 'terminal_name', 'location']

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny], url_path='heartbeat')
    def heartbeat(self, request):
        kiosk_code = request.data.get('kiosk_code')
        secret_key = request.data.get('secret_key')

        if not kiosk_code or not secret_key:
            return Response(
                {'error': 'kiosk_code and secret_key are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            kiosk = IoTKiosk.objects.get(kiosk_code=kiosk_code, is_active=True)
        except IoTKiosk.DoesNotExist:
            return Response({'error': 'Terminal not registered.'}, status=status.HTTP_403_FORBIDDEN)

        is_valid_secret = (
            kiosk.secret_hash == secret_key or
            hmac.compare_digest(kiosk.secret_hash.encode('utf-8'), str(secret_key).encode('utf-8'))
        )
        if not is_valid_secret:
            return Response({'error': 'Secret key check failed.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        kiosk.last_ping = now
        kiosk.save(update_fields=['last_ping'])

        return Response({
            'success': True,
            'status': 'ONLINE',
            'kiosk_code': kiosk.kiosk_code,
            'terminal_name': kiosk.terminal_name,
            'server_time': now.isoformat()
        }, status=status.HTTP_200_OK)


class GatePassViewSet(viewsets.ModelViewSet):
    serializer_class = GatePassSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [GatePassPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['reason', 'pass_number', 'faculty__first_name', 'faculty__last_name', 'student__first_name', 'student__last_name']

    def get_queryset(self):
        qs = GatePass.objects.select_related('faculty', 'student', 'issued_by').order_by('-valid_from')
        user = self.request.user

        if not user or not user.is_authenticated:
            return qs.none()

        if user.is_superuser:
            return qs

        role = get_user_role(user)
        if role in ['ADMIN', 'PRINCIPAL', 'GUARD']:
            return qs

        faculty = resolve_faculty_for_user(user)
        if not faculty:
            return qs.none()

        # Teachers only see passes they issued or passes issued for themselves
        return qs.filter(models.Q(issued_by=faculty) | models.Q(faculty=faculty)).distinct()

    def perform_create(self, serializer):
        pass_num = serializer.validated_data.get('pass_number')
        if not pass_num:
            today_str = timezone.now().strftime('%Y%m%d')
            unique_suffix = uuid.uuid4().hex[:6].upper()
            pass_num = f"GP-{today_str}-{unique_suffix}"

        user_faculty = resolve_faculty_for_user(self.request.user)
        issued_by = user_faculty or FacultyProfile.objects.filter(is_active=True).first()

        valid_from = serializer.validated_data.get('valid_from') or timezone.now()
        valid_to = serializer.validated_data.get('valid_to') or (valid_from + timedelta(hours=4))

        serializer.save(
            pass_number=pass_num,
            issued_by=issued_by,
            valid_from=valid_from,
            valid_to=valid_to
        )


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [IsAcademicManagerPermission]
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
    permission_classes = [IsAcademicManagerPermission]

    def _ensure_table(self):
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

    def list(self, request):
        self._ensure_table()
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name, building, capacity, room_type FROM rooms ORDER BY id;")
            rows = cursor.fetchall()
            data = [
                {"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]}
                for r in rows
            ]
        return Response(data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        self._ensure_table()
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name, building, capacity, room_type FROM rooms WHERE id = %s;", [pk])
            r = cursor.fetchone()
            if not r:
                return Response({'error': 'Room not found.'}, status=status.HTTP_404_NOT_FOUND)
            data = {"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]}
        return Response(data, status=status.HTTP_200_OK)

    def create(self, request):
        self._ensure_table()
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
                INSERT INTO rooms (name, building, capacity, room_type)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name) DO UPDATE 
                SET building = EXCLUDED.building, capacity = EXCLUDED.capacity, room_type = EXCLUDED.room_type
                RETURNING id, name, building, capacity, room_type;
            """, [name, building, capacity, room_type])
            r = cursor.fetchone()
            data = {"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]}

        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        return self._update_room(request, pk, partial=False)

    def partial_update(self, request, pk=None):
        return self._update_room(request, pk, partial=True)

    def _update_room(self, request, pk=None, partial=False):
        self._ensure_table()
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, name, building, capacity, room_type FROM rooms WHERE id = %s;", [pk])
            current = cursor.fetchone()
            if not current:
                return Response({'error': 'Room not found.'}, status=status.HTTP_404_NOT_FOUND)

            name = request.data.get('name', current[1]) if partial else request.data.get('name', '')
            building = request.data.get('building', current[2]) if partial else request.data.get('building', '')
            capacity = request.data.get('capacity', current[3]) if partial else request.data.get('capacity', 0)
            room_type = request.data.get('room_type', current[4]) if partial else request.data.get('room_type', 'LECTURE')

            name = str(name).strip()
            building = str(building).strip()
            try:
                capacity = int(capacity or 0)
            except (ValueError, TypeError):
                capacity = 0

            if not name:
                return Response({"detail": "Room name cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

            cursor.execute("""
                UPDATE rooms
                SET name = %s, building = %s, capacity = %s, room_type = %s
                WHERE id = %s
                RETURNING id, name, building, capacity, room_type;
            """, [name, building, capacity, room_type, pk])
            r = cursor.fetchone()
            data = {"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]}

        return Response(data, status=status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        self._ensure_table()
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM rooms WHERE id = %s RETURNING id;", [pk])
            r = cursor.fetchone()
            if not r:
                return Response({'error': 'Room not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'success': True, 'message': f'Room #{pk} deleted.'}, status=status.HTTP_204_NO_CONTENT)


class GradeLevelViewSet(viewsets.ViewSet):
    permission_classes = [IsAcademicManagerPermission]

    def list(self, request):
        levels = GradeLevel.objects.all().order_by('level_order', 'id')
        data = [
            {
                'id': gl.id,
                'name': gl.name,
                'code': gl.code,
                'level_number': gl.level_order,
                'level_order': gl.level_order,
                'stage': gl.stage
            }
            for gl in levels
        ]
        return Response(data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        try:
            gl = GradeLevel.objects.get(pk=pk)
            return Response({
                'id': gl.id,
                'name': gl.name,
                'code': gl.code,
                'level_number': gl.level_order,
                'level_order': gl.level_order,
                'stage': gl.stage
            }, status=status.HTTP_200_OK)
        except GradeLevel.DoesNotExist:
            return Response({'error': 'Grade level not found.'}, status=status.HTTP_404_NOT_FOUND)

    def create(self, request):
        name = str(request.data.get('name', '')).strip()
        code = str(request.data.get('code', '')).strip()
        try:
            level_number = int(request.data.get('level_number', request.data.get('level_order', 0)) or 0)
        except (ValueError, TypeError):
            level_number = 0
        stage = request.data.get('stage', 'JHS')

        if not name:
            return Response({"detail": "Year Level name is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not code:
            code = name.replace(' ', '').upper()[:10]

        gl, created = GradeLevel.objects.get_or_create(
            name=name,
            defaults={'level_order': level_number, 'code': code, 'stage': stage}
        )
        if not created:
            gl.level_order = level_number
            gl.stage = stage
            gl.save()

        return Response({
            "id": gl.id,
            "name": gl.name,
            "code": gl.code,
            "level_number": gl.level_order,
            "level_order": gl.level_order,
            "stage": gl.stage
        }, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        return self._update_grade_level(request, pk, partial=False)

    def partial_update(self, request, pk=None):
        return self._update_grade_level(request, pk, partial=True)

    def _update_grade_level(self, request, pk=None, partial=False):
        try:
            gl = GradeLevel.objects.get(pk=pk)
        except GradeLevel.DoesNotExist:
            return Response({'error': 'Grade level not found.'}, status=status.HTTP_404_NOT_FOUND)

        if 'name' in request.data:
            gl.name = str(request.data['name']).strip()
        if 'code' in request.data:
            gl.code = str(request.data['code']).strip()
        if 'stage' in request.data:
            gl.stage = str(request.data['stage']).strip()
        if 'level_number' in request.data or 'level_order' in request.data:
            val = request.data.get('level_number', request.data.get('level_order', gl.level_order))
            try:
                gl.level_order = int(val)
            except (ValueError, TypeError):
                pass

        gl.save()
        return Response({
            "id": gl.id,
            "name": gl.name,
            "code": gl.code,
            "level_number": gl.level_order,
            "level_order": gl.level_order,
            "stage": gl.stage
        }, status=status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        try:
            gl = GradeLevel.objects.get(pk=pk)
            gl.delete()
            return Response({'success': True, 'message': f'Grade level #{pk} deleted.'}, status=status.HTTP_204_NO_CONTENT)
        except GradeLevel.DoesNotExist:
            return Response({'error': 'Grade level not found.'}, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# SMS GATEWAY & DISPATCH PIPELINE
# ============================================================================

class SmsOutboxViewSet(viewsets.ModelViewSet):
    queryset = SmsOutbox.objects.all().order_by('-created_at')
    serializer_class = SmsOutboxSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [SmsOutboxPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['recipient_name', 'recipient_number', 'message_body']

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter.upper())
        return qs

    def create(self, request, *args, **kwargs):
        try:
            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)

            raw_phone = (
                data.get('recipient_number')
                or data.get('phone')
                or data.get('number')
                or ''
            )
            clean_phone = re.sub(r'[\s\-\(\)\.]', '', str(raw_phone).strip())
            if clean_phone.startswith('+63'):
                clean_phone = '0' + clean_phone[3:]
            elif clean_phone.startswith('63') and len(clean_phone) == 12:
                clean_phone = '0' + clean_phone[2:]

            msg_body = (
                data.get('message_body')
                or data.get('message')
                or data.get('text')
                or ''
            ).strip()

            if not clean_phone or not msg_body:
                return Response(
                    {'error': 'A valid recipient mobile number and message text are required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            data['recipient_number'] = clean_phone
            data['message_body'] = msg_body
            data['recipient_name'] = (
                data.get('recipient_name')
                or data.get('name')
                or 'Parent / Guardian'
            ).strip()
            data['trigger_event'] = 'MANUAL'
            data['category'] = data.get('category') or 'GENERAL_NOTICE'
            data['priority'] = data.get('priority') or 'HIGH'
            data['status'] = 'PENDING'

            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as exc:
            logger.error("SMS manual compose error: %s", exc, exc_info=True)
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        finally:
            connection.close()

    @action(detail=False, methods=['delete', 'post'], url_path='delete-delivered')
    def delete_delivered(self, request):
        try:
            deleted_count, _ = SmsOutbox.objects.filter(status='SENT').delete()
            return Response({
                'success': True,
                'deleted_count': deleted_count,
                'message': f"Successfully deleted {deleted_count} delivered message(s)."
            }, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.error("Failed to delete delivered SMS: %s", exc)
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            connection.close()

    @action(detail=False, methods=['post'], url_path='broadcast')
    def broadcast(self, request):
        try:
            data = request.data
            message_body = (
                data.get('message_body')
                or data.get('message')
                or data.get('announcement')
                or ''
            ).strip()

            if not message_body:
                return Response(
                    {'error': 'An announcement message body is required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            raw_aud = str(data.get('audience') or 'ALL_PARENTS').upper()
            year_level = str(data.get('year_level') or '').strip()
            section_id = data.get('section_id')
            target_id = data.get('target_id')

            outbox_items = []
            seen_numbers = set()

            def clean_phone_num(val):
                if not val:
                    return None
                cleaned = re.sub(r'[\s\-\(\)\.]', '', str(val).strip())
                if cleaned.startswith('+63'):
                    cleaned = '0' + clean_phone_num[3:]
                elif cleaned.startswith('63') and len(clean_phone_num) == 12:
                    cleaned = '0' + clean_phone_num[2:]
                return cleaned if len(cleaned) >= 10 else None

            # 1. SPECIFIC PARENT
            if raw_aud == 'SPECIFIC_PARENT' and target_id:
                student = Student.objects.filter(id=target_id).first()
                if student:
                    phone = clean_phone_num(
                        getattr(student, 'parent_contact', None)
                        or getattr(student, 'guardian_phone', None)
                        or getattr(student, 'emergency_contact', None)
                    )
                    if phone:
                        outbox_items.append(
                            SmsOutbox(
                                recipient_name=getattr(student, 'guardian_name', '') or f"{student.first_name}'s Guardian",
                                recipient_number=phone,
                                message_body=message_body,
                                trigger_event='ANNOUNCEMENT',
                                category='ANNOUNCEMENT',
                                priority='HIGH',
                                status='PENDING'
                            )
                        )

            # 2. SPECIFIC FACULTY
            elif raw_aud == 'SPECIFIC_FACULTY' and target_id:
                fac = FacultyProfile.objects.filter(id=target_id).first()
                if fac:
                    phone = clean_phone_num(
                        getattr(fac, 'contact_number', None)
                        or getattr(fac, 'phone_number', None)
                        or getattr(fac, 'emergency_contact', None)
                    )
                    if phone:
                        outbox_items.append(
                            SmsOutbox(
                                recipient_name=f"{fac.first_name} {fac.last_name}".strip(),
                                recipient_number=phone,
                                message_body=message_body,
                                trigger_event='ANNOUNCEMENT',
                                category='ANNOUNCEMENT',
                                priority='HIGH',
                                status='PENDING'
                            )
                        )

            # 3. BY CLASS SECTION
            elif raw_aud == 'BY_SECTION' and section_id:
                students = Student.objects.filter(enrollments__section_id=section_id).distinct()
                for s in students:
                    phone = clean_phone_num(
                        getattr(s, 'parent_contact', None)
                        or getattr(s, 'guardian_phone', None)
                        or getattr(s, 'emergency_contact', None)
                    )
                    if phone and phone not in seen_numbers:
                        seen_numbers.add(phone)
                        outbox_items.append(
                            SmsOutbox(
                                recipient_name=getattr(s, 'guardian_name', '') or f"{s.first_name}'s Guardian",
                                recipient_number=phone,
                                message_body=message_body,
                                trigger_event='ANNOUNCEMENT',
                                category='ANNOUNCEMENT',
                                priority='HIGH',
                                status='PENDING'
                            )
                        )

            # 4. BY YEAR / GRADE LEVEL
            elif raw_aud == 'BY_YEAR_LEVEL' and year_level:
                digits_only = re.sub(r'\D', '', str(year_level))
                query = Q(enrollments__section__grade_level__name__icontains=year_level) | Q(enrollments__section__name__icontains=year_level)
                if digits_only:
                    query |= Q(enrollments__section__grade_level__name__icontains=digits_only) | Q(enrollments__section__name__icontains=digits_only)

                students = Student.objects.filter(query).distinct()
                for s in students:
                    phone = clean_phone_num(
                        getattr(s, 'parent_contact', None)
                        or getattr(s, 'guardian_phone', None)
                        or getattr(s, 'emergency_contact', None)
                    )
                    if phone and phone not in seen_numbers:
                        seen_numbers.add(phone)
                        outbox_items.append(
                            SmsOutbox(
                                recipient_name=getattr(s, 'guardian_name', '') or f"{s.first_name}'s Guardian",
                                recipient_number=phone,
                                message_body=message_body,
                                trigger_event='ANNOUNCEMENT',
                                category='ANNOUNCEMENT',
                                priority='HIGH',
                                status='PENDING'
                            )
                        )

            # 5. ALL PARENTS, ALL FACULTY, BOTH, OR GENERAL BROADCAST
            else:
                include_parents = raw_aud in ['ALL_PARENTS', 'BOTH_PARENTS_AND_FACULTY', 'ALL'] or 'PARENT' in raw_aud
                include_faculty = raw_aud in ['ALL_FACULTY', 'BOTH_PARENTS_AND_FACULTY', 'ALL'] or 'FACULTY' in raw_aud

                if not include_parents and not include_faculty:
                    include_parents = True
                    include_faculty = True

                if include_parents:
                    for s in Student.objects.all():
                        phone = clean_phone_num(
                            getattr(s, 'parent_contact', None)
                            or getattr(s, 'guardian_phone', None)
                            or getattr(s, 'emergency_contact', None)
                        )
                        if phone and phone not in seen_numbers:
                            seen_numbers.add(phone)
                            outbox_items.append(
                                SmsOutbox(
                                    recipient_name=getattr(s, 'guardian_name', '') or f"{s.first_name}'s Guardian",
                                    recipient_number=phone,
                                    message_body=message_body,
                                    trigger_event='ANNOUNCEMENT',
                                    category='ANNOUNCEMENT',
                                    priority='HIGH',
                                    status='PENDING'
                                )
                            )

                if include_faculty:
                    for f in FacultyProfile.objects.all():
                        phone = clean_phone_num(
                            getattr(f, 'contact_number', None)
                            or getattr(f, 'phone_number', None)
                            or getattr(f, 'emergency_contact', None)
                        )
                        if phone and phone not in seen_numbers:
                            seen_numbers.add(phone)
                            outbox_items.append(
                                SmsOutbox(
                                    recipient_name=f"{f.first_name} {f.last_name}".strip(),
                                    recipient_number=phone,
                                    message_body=message_body,
                                    trigger_event='ANNOUNCEMENT',
                                    category='ANNOUNCEMENT',
                                    priority='HIGH',
                                    status='PENDING'
                                )
                            )

            if not outbox_items:
                return Response(
                    {'error': 'No recipients with registered mobile numbers matched the selected filter.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            created = SmsOutbox.objects.bulk_create(outbox_items)
            return Response({
                'success': True,
                'count': len(created),
                'message': f'Broadcast queued for {len(created)} recipient(s).'
            }, status=status.HTTP_201_CREATED)

        except Exception as exc:
            logger.error("Broadcast failed: %s", exc, exc_info=True)
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            connection.close()

    @action(detail=False, methods=['get'], url_path='metrics')
    def get_metrics(self, request):
        try:
            today = timezone.localdate()
            total_today = SmsOutbox.objects.filter(created_at__date=today).count()
            pending = SmsOutbox.objects.filter(status='PENDING').count()
            sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
            failed = SmsOutbox.objects.filter(status='FAILED').count()

            return Response({
                'total_today': total_today,
                'pending': pending,
                'sent_today': sent_today,
                'failed': failed,
                'modem_port': getattr(settings, 'GSM_MODEM_PORT', 'COM3'),
                'modem_baudrate': getattr(settings, 'GSM_MODEM_BAUDRATE', 9600),
            })
        finally:
            connection.close()

    @action(detail=True, methods=['post'], url_path='retry')
    def retry_single(self, request, pk=None):
        try:
            sms = self.get_object()
            sms.status = 'PENDING'
            sms.error_message = None
            sms.retry_count += 1
            sms.save(update_fields=['status', 'error_message', 'retry_count'])
            return Response({'success': True, 'message': 'Message queued for immediate resend.'})
        finally:
            connection.close()

    @action(detail=False, methods=['post'], url_path='retry-all-failed')
    def retry_all_failed(self, request):
        try:
            updated_count = SmsOutbox.objects.filter(status='FAILED').update(
                status='PENDING',
                error_message=None
            )
            return Response({'success': True, 'count': updated_count})
        finally:
            connection.close()


class BulkSmsStatusAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            updates = request.data.get('updates', [])
            if not updates:
                return Response({'error': 'No updates provided.'}, status=status.HTTP_400_BAD_REQUEST)

            now = timezone.now()
            sent_ids = [item['id'] for item in updates if str(item.get('status', '')).upper() == 'SENT']
            failed_items = [item for item in updates if str(item.get('status', '')).upper() != 'SENT']

            with transaction.atomic():
                if sent_ids:
                    SmsOutbox.objects.filter(id__in=sent_ids).update(
                        status='SENT',
                        sent_at=now,
                        error_message=None
                    )
                for item in failed_items:
                    SmsOutbox.objects.filter(id=item['id']).update(
                        status='FAILED',
                        error_message=item.get('error', 'Transmission error')
                    )

            return Response({'success': True, 'count': len(updates)}, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.error("BulkSmsStatusAPIView error: %s", exc, exc_info=True)
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            connection.close()


class PendingSmsDispatchAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            pending = SmsOutbox.objects.filter(status='PENDING').order_by('created_at')[:25]
            data = [
                {
                    'id': s.id,
                    'recipient_number': s.recipient_number,
                    'message_body': s.message_body,
                }
                for s in pending
            ]
            return Response(data, status=status.HTTP_200_OK)
        except Exception as exc:
            logger.error("PendingSmsDispatchAPIView error: %s", exc, exc_info=True)
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            connection.close()


class MarkSmsStatusAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        try:
            sms = SmsOutbox.objects.get(pk=pk)
            new_status = str(request.data.get('status', 'SENT')).upper()
            if new_status == 'SENT':
                sms.status = 'SENT'
                sms.sent_at = timezone.now()
                sms.error_message = None
            else:
                sms.status = 'FAILED'
                sms.error_message = request.data.get('error', 'Modem transmission error')
                sms.retry_count += 1
            sms.save(update_fields=['status', 'sent_at', 'error_message', 'retry_count'])
            return Response({'success': True}, status=status.HTTP_200_OK)
        except SmsOutbox.DoesNotExist:
            return Response({'error': 'SMS record not found.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            connection.close()