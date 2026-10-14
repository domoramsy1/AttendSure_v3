"""
AttendSure V3 - API Views & Ingestion Controllers
File: backend/apps/api/views.py
"""

import base64
import calendar
from datetime import date, datetime, timedelta
import hmac
from html import escape as html_escape
import logging
import math
import re
import shutil
import time as time_module
import uuid

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.db import connection, models, transaction
from django.db.models import Q
from django.utils import timezone
from django.http import HttpResponse

from rest_framework import filters, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
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
from apps.academics.services.sf4_service import generate_sf4_data

from .serializers import (
    ClassroomBatchScanSerializer,
    FacultyProfileSerializer,
    GatePassSerializer,
    GateScanSerializer,
    IoTKioskSerializer,
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
# DATABASE TABLE HELPERS
# ============================================================================

def ensure_attendance_schema():
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


def ensure_calendar_schema():
    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendsure_calendar_exceptions (
                id SERIAL PRIMARY KEY,
                exception_date DATE NOT NULL,
                exception_type VARCHAR(20) NOT NULL DEFAULT 'SUSPENSION',
                reason VARCHAR(255) NOT NULL,
                affects_all_grades BOOLEAN NOT NULL DEFAULT TRUE,
                created_by_id INTEGER NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendsure_calendar_settings (
                id INTEGER PRIMARY KEY DEFAULT 1,
                weekend_rest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT single_row_check CHECK (id = 1)
            );
        """)
        cursor.execute("""
            INSERT INTO attendsure_calendar_settings (id, weekend_rest_enabled)
            VALUES (1, TRUE)
            ON CONFLICT (id) DO NOTHING;
        """)


def ensure_report_audit_schema():
    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendsure_report_audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NULL,
                username VARCHAR(150) NOT NULL DEFAULT '',
                report_type VARCHAR(30) NOT NULL,
                section_id INTEGER NULL,
                month INTEGER NULL,
                year INTEGER NULL,
                exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)


def record_report_audit_in_db(user, report_type, section_id=None, month=None, year=None):
    ensure_report_audit_schema()
    with connection.cursor() as cursor:
        cursor.execute("""
            INSERT INTO attendsure_report_audit_logs
                (user_id, username, report_type, section_id, month, year, exported_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            RETURNING id, exported_at;
        """, [
            getattr(user, 'id', None),
            getattr(user, 'username', ''),
            str(report_type or 'REPORT').upper()[:30],
            int(section_id) if str(section_id or '').isdigit() else None,
            int(month) if str(month or '').isdigit() else None,
            int(year) if str(year or '').isdigit() else None,
        ])
        return cursor.fetchone()


def resolve_logo_field(val, request=None):
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('none', 'null', 'undefined'):
        return None
    if (
        val_str.startswith('data:image/')
        or val_str.startswith('http://')
        or val_str.startswith('https://')
        or val_str.startswith('blob:')
    ):
        return val_str
    if val_str.startswith('/media/') and request:
        return request.build_absolute_uri(val_str)
    if val_str.startswith('/9j/') or val_str.startswith('iVBORw0KGgo'):
        return f"data:image/png;base64,{val_str}"
    return val_str


# ============================================================================
# ROLE & PERMISSION HELPERS
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
    if profile and hasattr(profile, 'role') and profile.role:
        return str(profile.role).upper()
    return 'FACULTY'


def resolve_faculty_for_user(user):
    """
    Finds (or creates and links in PostgreSQL) the FacultyProfile for the logged-in user
    so faculty accounts never fail with 403 Forbidden on DTR or Telemetry endpoints.
    """
    if not user or not user.is_authenticated:
        return None

    user_prof, _ = UserProfile.objects.get_or_create(user=user)
    if getattr(user_prof, 'faculty', None):
        return user_prof.faculty

    faculty = getattr(user, 'facultyprofile', None)

    if not faculty and user.email:
        faculty = FacultyProfile.objects.filter(email__iexact=user.email, is_active=True).first()

    if not faculty and user.first_name and user.last_name:
        faculty = FacultyProfile.objects.filter(
            first_name__iexact=user.first_name,
            last_name__iexact=user.last_name,
            is_active=True
        ).first()

    if not faculty:
        faculty = FacultyProfile.objects.filter(
            Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username),
            is_active=True
        ).first()

    # If no FacultyProfile exists yet for this user account, create and link it in PostgreSQL
    if not faculty:
        emp_id = str(user.username).strip().upper()
        faculty, _ = FacultyProfile.objects.get_or_create(
            employee_id=emp_id,
            defaults={
                'first_name': user.first_name or user.username.capitalize(),
                'last_name': user.last_name or 'Faculty',
                'email': user.email or '',
                'position': 'Faculty',
                'department': 'Academic Department',
                'qr_token': f"STF-{uuid.uuid4().hex[:12].upper()}",
                'is_active': True,
            }
        )

    if faculty and getattr(user_prof, 'faculty_id', None) != faculty.id:
        user_prof.faculty = faculty
        user_prof.save(update_fields=['faculty'])

    return faculty

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
        return bool(obj.issued_by_id == user_faculty.id or obj.faculty_id == user_faculty.id)


class SmsOutboxPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        if request.method == 'DELETE':
            return role == 'ADMIN'
        return role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']


class IsAdviserOrAdmin(permissions.BasePermission):
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
        if getattr(obj, 'adviser_id', None) == faculty.id:
            return True
        return Schedule.objects.filter(section=obj, faculty=faculty).exists()


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
# CLASSROOM ROSTER & BATCH SCAN
# ============================================================================

class FacultyClassroomRosterAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_attendance_schema()
        faculty = resolve_faculty_for_user(request.user)
        user_role = get_user_role(request.user)
        today_date = timezone.localdate()

        if faculty:
            schedules_qs = Schedule.objects.select_related(
                'section', 'subject', 'faculty'
            ).filter(
                Q(faculty=faculty) | Q(section__adviser=faculty)
            ).distinct().order_by('start_time')
        elif user_role in ['ADMIN', 'PRINCIPAL']:
            schedules_qs = Schedule.objects.select_related(
                'section', 'subject', 'faculty'
            ).all().order_by('start_time')
        else:
            return Response([], status=status.HTTP_200_OK)

        roster_data = []
        for sched in schedules_qs:
            sec = sched.section
            if not sec:
                continue

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
                    'gender': getattr(st, 'sex', getattr(st, 'gender', '')),
                    'attendance_status': existing_logs.get(st.id, 'UNSCANNED'),
                }
                for st in students
            ]

            roster_data.append({
                'schedule_id': sched.id,
                'section_id': sec.id,
                'section_name': sec.name,
                'subject_name': getattr(sched.subject, 'title', getattr(sched.subject, 'name', '')) if sched.subject else '',
                'subject_code': getattr(sched.subject, 'code', '') if sched.subject else '',
                'room': getattr(sched, 'room_number', '') or getattr(sec, 'room_number', '') or '',
                'start_time': str(sched.start_time) if getattr(sched, 'start_time', None) else '',
                'end_time': str(sched.end_time) if getattr(sched, 'end_time', None) else '',
                'total_students': len(student_items),
                'students': student_items,
            })

        return Response(roster_data, status=status.HTTP_200_OK)


class ClassroomBatchScanAPIView(APIView):
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
        user_role = get_user_role(request.user)

        if not faculty and user_role not in ['ADMIN', 'PRINCIPAL']:
            return Response(
                {'error': 'Unauthorized: Your account is not linked to a faculty profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if (
            faculty
            and schedule.faculty_id != faculty.id
            and getattr(schedule.section, 'adviser_id', None) != faculty.id
            and user_role not in ['ADMIN', 'PRINCIPAL']
            and not request.user.is_superuser
        ):
            return Response(
                {'error': f"Unauthorized: You ({faculty.first_name} {faculty.last_name}) are not assigned to teach this class."},
                status=status.HTTP_403_FORBIDDEN
            )

        effective_faculty = faculty or schedule.faculty
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

            if schedule.section and (not enrolled_section or enrolled_section.id != schedule.section_id):
                current_sec_name = enrolled_section.name if enrolled_section else 'Unassigned'
                target_sec_name = schedule.section.name
                return Response(
                    {'error': f"Access Denied: {student.first_name} {student.last_name} belongs to '{current_sec_name}', not '{target_sec_name}'."},
                    status=status.HTTP_400_BAD_REQUEST
                )

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
            if 'faculty' in model_field_names and effective_faculty:
                log_defaults['faculty'] = effective_faculty
            if 'faculty' in model_field_names and effective_faculty:
                log_defaults['faculty'] = effective_faculty

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
                'section': schedule.section.name if schedule.section else '',
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
# AUTHENTICATION & USER PROFILE
# ============================================================================

class DatabaseLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginRateThrottle]

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = str(request.data.get('password', '')).strip()

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request=request, username=username, password=password)
        if user is None:
            return Response({'error': 'Invalid credentials. User is not registered in the database.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'error': 'Account is inactive. Please contact your school administrator.'}, status=status.HTTP_403_FORBIDDEN)

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
        user = request.user
        data = request.data
        faculty = resolve_faculty_for_user(user)

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
# SECTIONS CRUD
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
            return Response({'error': 'Section name and grade_level_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

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
            defaults={'adviser': adviser, 'room_number': room_number, 'capacity': capacity}
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
        return self._update_section(request, pk)

    def patch(self, request, pk):
        return self._update_section(request, pk)

    def _update_section(self, request, pk):
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
# DASHBOARD OVERVIEW
# ============================================================================

class DashboardOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query_start = time_module.perf_counter()
        today = timezone.localdate()

        total_students = Student.objects.filter(is_active=True).count()
        gate_in_student_ids = set(StudentGateLog.objects.filter(scan_time__date=today, direction='IN').values_list('student_id', flat=True).distinct())
        gate_out_student_ids = set(StudentGateLog.objects.filter(scan_time__date=today, direction='OUT').values_list('student_id', flat=True).distinct())

        students_on_campus_count = len(gate_in_student_ids - gate_out_student_ids)
        absent_students = max(0, total_students - len(gate_in_student_ids))
        attendance_rate = round((len(gate_in_student_ids) / total_students * 100), 1) if total_students > 0 else 0

        total_facultys = FacultyProfile.objects.filter(is_active=True).count()
        present_facultys = FacultyGateLog.objects.filter(scan_time__date=today, direction='IN').values_list('faculty_id', flat=True).distinct().count()

        student_scans = StudentGateLog.objects.filter(scan_time__date=today).count()
        faculty_scans = FacultyGateLog.objects.filter(scan_time__date=today).count()
        total_gate_scans = student_scans + faculty_scans

        try:
            sms_sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
            sms_pending = SmsOutbox.objects.filter(status='PENDING').count()
            sms_failed = SmsOutbox.objects.filter(status='FAILED', created_at__date=today).count()
        except Exception:
            sms_sent_today, sms_pending, sms_failed = 0, 0, 0

        total_scanners = IoTKiosk.objects.count()
        ten_mins_ago = timezone.now() - timedelta(minutes=10)
        active_scanners = IoTKiosk.objects.filter(is_active=True, last_ping__gte=ten_mins_ago).count()

        hourly_scans = []
        for hour in range(6, 18):
            hour_str = f"{hour % 12 or 12} {'AM' if hour < 12 else 'PM'}"
            scans_count = StudentGateLog.objects.filter(scan_time__date=today, scan_time__hour=hour).count()
            hourly_scans.append({'hour': hour_str, 'count': scans_count})

        max_hour_count = max([h['count'] for h in hourly_scans] or [1])
        for h in hourly_scans:
            h['height'] = round((h['count'] / max_hour_count * 100)) if max_hour_count > 0 and h['count'] > 0 else 0
            h['is_peak'] = h['count'] == max_hour_count and h['count'] > 0

        grade_levels_data = []
        for g in GradeLevel.objects.all().order_by('level_order'):
            grade_student_ids = Enrollment.objects.filter(section__grade_level=g, status='ENROLLED').values_list('student_id', flat=True).distinct()
            total_in_grade = len(grade_student_ids)
            present_in_grade = StudentGateLog.objects.filter(scan_time__date=today, direction='IN', student_id__in=grade_student_ids).values_list('student_id', flat=True).distinct().count()
            pct = round((present_in_grade / total_in_grade * 100)) if total_in_grade > 0 else 0
            grade_levels_data.append({'grade': g.name, 'present': present_in_grade, 'total': total_in_grade, 'percentage': pct})

        recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:6]
        recent_scans_data = []
        for log in recent_logs:
            enrollment = Enrollment.objects.filter(student=log.student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = f"{enrollment.section.grade_level.code} - {enrollment.section.name}" if enrollment else ""
            recent_scans_data.append({
                'id': log.id,
                'person_name': f"{log.student.first_name} {log.student.last_name}",
                'role_label': 'Student',
                'grade_section': section_label,
                'direction': log.direction,
                'scan_time': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'scan_method': log.scan_method,
            })

        measured_latency_ms = max(1, round((time_module.perf_counter() - query_start) * 1000))

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
            'analytics': {'average_latency_ms': measured_latency_ms},
            'database': {'status': 'CONNECTED', 'database_name': settings.DATABASES['default']['NAME']},
        })


# ============================================================================
# GATE SCANNERS & GATE LOGS
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
                return Response({'error': 'Faculty badge detected. Only student cards are accepted here.'}, status=status.HTTP_403_FORBIDDEN)

            recent_log = FacultyGateLog.objects.filter(faculty=faculty, scan_time__date=now.date()).order_by('-scan_time').first()
            direction = requested_direction if requested_direction in ['IN', 'OUT'] else ('OUT' if (recent_log and recent_log.direction == 'IN') else 'IN')

            if recent_log and recent_log.direction == direction and (now - recent_log.scan_time) < timedelta(seconds=debounce_seconds):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STAFF',
                    'name': f"{faculty.first_name} {faculty.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

            new_log = FacultyGateLog.objects.create(
                faculty=faculty, kiosk=kiosk, scan_time=now, direction=direction, scan_method=scan_method, raw_identifier=raw_id
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
            recent_log = StudentGateLog.objects.filter(student=student, scan_time__date=now.date()).order_by('-scan_time').first()
            direction = requested_direction if requested_direction in ['IN', 'OUT'] else ('OUT' if (recent_log and recent_log.direction == 'IN') else 'IN')

            if recent_log and recent_log.direction == direction and (now - recent_log.scan_time) < timedelta(seconds=debounce_seconds):
                return Response({
                    'notice': 'Tap ignored (debounce active)',
                    'person_type': 'STUDENT',
                    'name': f"{student.first_name} {student.last_name}".strip(),
                    'direction': recent_log.direction,
                    'scan_time': recent_log.scan_time.strftime('%I:%M:%S %p')
                }, status=status.HTTP_200_OK)

            new_log = StudentGateLog.objects.create(
                student=student, kiosk=kiosk, scan_time=now, direction=direction, scan_method=scan_method, raw_identifier=raw_id
            )

            if direction == 'IN':
                student_enrollment = student.enrollments.filter(academic_year__is_active=True).first()
                if student_enrollment:
                    DailyAttendanceSummary.objects.update_or_create(
                        student=student,
                        attendance_date=now.date(),
                        defaults={'section': student_enrollment.section, 'status': 'PRESENT', 'remarks': 'GATE_TAP_IN'}
                    )

            parent_phone = getattr(student, 'parent_contact', '') or ''
            if parent_phone:
                action_text = "entered campus" if direction == "IN" else "left campus"
                terminal_label = kiosk.terminal_name or kiosk.kiosk_code
                SmsOutbox.objects.create(
                    recipient_name=getattr(student, 'guardian_name', '') or f"{student.first_name} {student.last_name}'s Guardian",
                    recipient_number=str(parent_phone).strip(),
                    message_body=f"Notice: Your child {student.first_name} {student.last_name} has {action_text} at {now.strftime('%I:%M %p')} via {terminal_label}.",
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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else '',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        if person_type in ('ALL', 'STAFF'):
            faculty_qs = FacultyGateLog.objects.select_related('faculty', 'kiosk').order_by('-scan_time')
            if user_role == 'FACULTY' and not request.user.is_superuser:
                faculty_qs = faculty_qs.filter(faculty=user_faculty) if user_faculty else faculty_qs.none()
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
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else '',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        combined_logs.sort(key=lambda x: x['raw_time'], reverse=True)
        return Response(combined_logs[:150], status=status.HTTP_200_OK)


# ============================================================================
# TELEMETRY & GEOFENCE
# ============================================================================

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * (math.sin(d_lambda / 2.0) ** 2)
    return R * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)))


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

        if not faculty.bound_device_id:
            device_in_use = FacultyProfile.objects.filter(bound_device_id=incoming_device_id).exclude(id=faculty.id).first()
            if device_in_use:
                return Response({'error': 'This phone is already registered to another faculty.'}, status=status.HTTP_403_FORBIDDEN)
            faculty.bound_device_id = incoming_device_id
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=['bound_device_id', 'device_bound_at'])
        elif faculty.bound_device_id != incoming_device_id:
            return Response({'error': 'Unauthorized device.', 'code': 'DEVICE_MISMATCH'}, status=status.HTTP_403_FORBIDDEN)

        if data.get('is_mock_location', False):
            return Response({'security_alert': 'Fake GPS detected.', 'is_inside_geofence': False}, status=status.HTTP_403_FORBIDDEN)

        server_now = timezone.now()
        client_lat, client_lng = data['latitude'], data['longitude']
        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude is not None else None
        campus_lng = float(school.longitude) if school and school.longitude is not None else None
        allowed_radius = float(school.geofence_radius_meters) if school and school.geofence_radius_meters else 150.0

        if campus_lat is not None and campus_lng is not None:
            distance_to_center = haversine_distance_meters(client_lat, client_lng, campus_lat, campus_lng)
            is_inside_perimeter = distance_to_center <= allowed_radius
        else:
            distance_to_center = 0.0
            is_inside_perimeter = True

        latest_gate_log = FacultyGateLog.objects.filter(faculty=faculty, scan_time__date=server_now.date()).order_by('-scan_time').first()
        physically_tapped_out = bool(latest_gate_log and latest_gate_log.direction == 'OUT')

        FacultyHeartbeat.objects.create(
            faculty=faculty,
            latitude=client_lat,
            longitude=client_lng,
            battery_level=data.get('battery_level', 100),
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


class GeofenceAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        lat = float(school.latitude) if school and school.latitude is not None else None
        lng = float(school.longitude) if school and school.longitude is not None else None
        radius = int(school.geofence_radius_meters) if school and school.geofence_radius_meters else 150
        return Response({
            'name': school.school_name if school and school.school_name else "",
            'latitude': lat,
            'longitude': lng,
            'radius_meters': radius,
            'is_configured': bool(lat is not None and lng is not None),
        }, status=status.HTTP_200_OK)


class SchoolSettingsAPIView(APIView):
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
        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=partial, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


SchoolProfileView = SchoolSettingsAPIView


# ============================================================================
# OFFICIAL DEPED REPORTS (SF1, SF2, SF4) & CSC FORM 48 DTR
# ============================================================================

def resolve_academic_year_for_date(target_date):
    if not target_date:
        return None, ""
    ay = AcademicYear.objects.filter(start_date__lte=target_date, end_date__gte=target_date).first()
    if ay:
        return ay, str(getattr(ay, 'code', '')).strip()
    y_start = target_date.year if target_date.month >= 6 else target_date.year - 1
    code_str = f"{y_start}-{y_start + 1}"
    ay = AcademicYear.objects.filter(code__icontains=code_str).first() or AcademicYear.objects.filter(code__icontains=str(y_start)).first()
    return ay, (getattr(ay, 'code', '') or code_str).strip()


def calculate_sf1_age_as_of_june(birthdate, school_year_code):
    if not birthdate:
        return ""
    try:
        base_year = timezone.now().year
        if school_year_code and '-' in str(school_year_code):
            first_part = str(school_year_code).split('-')[0].strip()
            if first_part.isdigit():
                base_year = int(first_part)
        june_1 = date(base_year, 6, 1)
        first_friday = june_1 + timedelta(days=(4 - june_1.weekday()) % 7)
        if isinstance(birthdate, str):
            for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y'):
                try:
                    birthdate = datetime.strptime(birthdate, fmt).date()
                    break
                except ValueError:
                    pass
        if not isinstance(birthdate, (date, datetime)):
            return ""
        age = first_friday.year - birthdate.year - ((first_friday.month, first_friday.day) < (birthdate.month, birthdate.day))
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

        acad_year_obj = getattr(section, 'academic_year', None) or AcademicYear.objects.filter(is_active=True).first()
        acad_year_code = str(getattr(acad_year_obj, 'code', '') or '').strip()

        school = SchoolProfile.objects.first()
        school_id = str(getattr(school, 'school_id', '') or '').strip()
        school_name = str(getattr(school, 'school_name', '') or '').strip()
        region = str(getattr(school, 'region', '') or '').strip()
        division = str(getattr(school, 'division', '') or '').strip()
        district = str(getattr(school, 'district', '') or '').strip()
        school_head = str(getattr(school, 'principal_name', '') or '').strip()

        left_logo = resolve_logo_field(getattr(school, 'left_logo', None), request) if school else None
        right_logo = resolve_logo_field(getattr(school, 'right_logo', None), request) if school else None
        school_logo = resolve_logo_field(getattr(school, 'school_logo', None), request) if school else None

        adviser_name = f"{section.adviser.first_name} {section.adviser.last_name}".strip() if section.adviser else ""
        grade_level_name = section.grade_level.name if section.grade_level else ""

        enrollments_qs = Enrollment.objects.filter(
            section=section, status__in=['ENROLLED', 'ACTIVE']
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        males_list, females_list, combined_list = [], [], []
        for e in enrollments_qs:
            s = e.student
            if not s:
                continue
            raw_sex = str(getattr(s, 'sex', '') or '').strip().upper()
            is_male = raw_sex.startswith('M')
            mid = f" {s.middle_name}" if getattr(s, 'middle_name', '') else ""
            suf = f" {s.suffix}" if getattr(s, 'suffix', '') else ""
            full_name = f"{s.last_name}, {s.first_name}{mid}{suf}".strip()
            b_date_str = s.birthdate.strftime('%m/%d/%Y') if isinstance(s.birthdate, (date, datetime)) else str(s.birthdate or '')

            learner_item = {
                'id': s.id,
                'lrn': str(s.lrn or '').strip(),
                'name': full_name,
                'sex': 'M' if is_male else 'F',
                'birthdate': b_date_str,
                'age': calculate_sf1_age_as_of_june(s.birthdate, acad_year_code),
                'birth_place': str(getattr(s, 'province', '') or '').strip(),
                'mother_tongue': str(getattr(s, 'mother_tongue', '') or '').strip(),
                'ethnic_group': str(getattr(s, 'ethnic_group', '') or '').strip(),
                'religion': str(getattr(s, 'religion', '') or '').strip(),
                'house_street': str(getattr(s, 'house_street_sitio', '') or '').strip(),
                'barangay': str(getattr(s, 'barangay', '') or '').strip(),
                'municipality_city': str(getattr(s, 'municipality_city', '') or '').strip(),
                'province': str(getattr(s, 'province', '') or '').strip(),
                'father_name': str(getattr(s, 'father_name', '') or '').strip(),
                'mother_maiden_name': str(getattr(s, 'mother_maiden_name', '') or '').strip(),
                'guardian_name': str(getattr(s, 'guardian_name', '') or '').strip(),
                'guardian_relationship': str(getattr(s, 'guardian_relationship', '') or '').strip(),
                'parent_contact': str(getattr(s, 'parent_contact', '') or '').strip(),
                'remarks': str(getattr(e, 'remarks', '') or '').strip(),
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

        today_date = timezone.localdate()
        year_param = request.GET.get('year', '').strip()
        month_param = request.GET.get('month', '').strip()

        month_names = list(calendar.month_name)
        if month_param.isdigit():
            m_val = int(month_param)
            month_name = month_names[m_val] if 1 <= m_val <= 12 else month_names[today_date.month]
        elif month_param.capitalize() in month_names and month_param:
            month_name = month_param.capitalize()
        else:
            month_name = month_names[today_date.month]

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
                'school_name': school.school_name if school else "",
                'school_id': school.school_id if school else "",
                'section_name': section.name,
                'month': month_name,
                'year': year,
                'adviser_name': adviser_name,
                'males': [],
                'females': [],
                'school_days': [],
            }, status=status.HTTP_200_OK)


SF2ReportAPIView = DepEdSF2DataAPIView


class DepEdSF4DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today_date = timezone.localdate()
        raw_month = str(request.GET.get('month', '')).strip()
        month_names = list(calendar.month_name)

        if raw_month.isdigit():
            m_int = int(raw_month)
            month = month_names[m_int] if 1 <= m_int <= 12 else month_names[today_date.month]
        elif raw_month.capitalize() in month_names and raw_month:
            month = raw_month.capitalize()
        else:
            month = month_names[today_date.month]

        year = str(request.GET.get('year', str(today_date.year))).strip()
        school_year = (request.GET.get('school_year') or request.GET.get('academic_year') or '').strip()

        if not school_year:
            active_ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
            school_year = str(getattr(active_ay, 'code', '') or f"{today_date.year}-{today_date.year + 1}")

        try:
            year_val = int(year) if year.isdigit() else today_date.year
            data = generate_sf4_data(month_name=month, year=year_val, school_year=school_year)
            if not isinstance(data, dict):
                data = {}

            school = SchoolProfile.objects.first()
            if school:
                data['school_name'] = school.school_name or data.get('school_name', '')
                data['school_id'] = school.school_id or data.get('school_id', '')
                data['region'] = school.region or data.get('region', '')
                data['division'] = school.division or data.get('division', '')
                data['district'] = school.district or data.get('district', '')
                data['school_head'] = school.principal_name or data.get('school_head', '')
                data['principal_name'] = school.principal_name or data.get('principal_name', '')
                data['left_logo'] = resolve_logo_field(getattr(school, 'left_logo', None), request)
                data['right_logo'] = resolve_logo_field(getattr(school, 'right_logo', None) or getattr(school, 'school_logo', None), request)

            data.setdefault('month', month)
            data.setdefault('year', year_val)
            data.setdefault('school_year', school_year)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error("SF4 error: %s", str(e), exc_info=True)
            return Response({'error': 'Cannot compile SF4 report.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


SF4ReportAPIView = DepEdSF4DataAPIView
SF4ReportView = DepEdSF4DataAPIView


class DTRListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, faculty_id=None, *args, **kwargs):
        user_role = get_user_role(request.user) or 'FACULTY'
        user_faculty = resolve_faculty_for_user(request.user)

        target_id = faculty_id or request.query_params.get('faculty_id') or getattr(user_faculty, 'id', None)

        # Regular teachers always view their own DTR record
        if user_role == 'FACULTY' and not request.user.is_superuser and user_faculty:
            target_id = user_faculty.id

        faculty = FacultyProfile.objects.filter(id=target_id).first() if target_id else None
        if not faculty:
            faculty = user_faculty or FacultyProfile.objects.filter(is_active=True).first()
        if not faculty:
            return Response({'error': 'Faculty record not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.localdate()
        try:
            month = int(request.query_params.get('month', now.month))
            if not (1 <= month <= 12):
                month = now.month
        except (ValueError, TypeError):
            month = now.month

        try:
            year = int(request.query_params.get('year', now.year))
        except (ValueError, TypeError):
            year = now.year

        dtr_record, _ = FacultyMonthlyDTR.objects.get_or_create(
            faculty=faculty,
            month=month,
            year=year
        )

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
            logs_by_day.setdefault(day_num, []).append(l)

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
                            if local_time.hour > 8 or (local_time.hour == 8 and local_time.minute > 0):
                                day_undertime_min += (local_time.hour - 8) * 60 + local_time.minute
                        elif not pm_in:
                            pm_in = time_str
                            if local_time.hour > 13 or (local_time.hour == 13 and local_time.minute > 0):
                                day_undertime_min += (local_time.hour - 13) * 60 + local_time.minute
                    elif l.direction == 'OUT':
                        if local_time.hour < 13 and not am_out:
                            am_out = time_str
                            if local_time.hour < 12:
                                day_undertime_min += (12 - local_time.hour) * 60 - local_time.minute
                        else:
                            pm_out = time_str
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

        return Response({
            'faculty_id': faculty.id,
            'faculty_name': f"{faculty.last_name}, {faculty.first_name}".strip(', '),
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
            'total_undertime_hours': total_undertime_minutes // 60,
            'total_undertime_minutes': total_undertime_minutes % 60,
        }, status=status.HTTP_200_OK)

    def post(self, request, faculty_id=None, *args, **kwargs):
        action_name = request.data.get('action')
        user_role = get_user_role(request.user) or 'FACULTY'
        user_faculty = resolve_faculty_for_user(request.user)

        target_id = faculty_id or request.data.get('faculty_id') or getattr(user_faculty, 'id', None)
        if user_role == 'FACULTY' and not request.user.is_superuser and user_faculty:
            target_id = user_faculty.id

        faculty = FacultyProfile.objects.filter(id=target_id).first() if target_id else user_faculty
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

        if 'regular_days_hours' in request.data:
            dtr_record.regular_hours = str(request.data['regular_days_hours']).strip()
        if 'saturdays_hours' in request.data:
            dtr_record.saturday_hours = str(request.data['saturdays_hours']).strip()
        dtr_record.save()

        if action_name == 'SUBMIT_DTR':
            dtr_record.is_submitted = True
            dtr_record.submitted_at = timezone.now()
            dtr_record.save()
            return Response({'success': True, 'message': 'DTR submitted successfully.'})

        elif action_name == 'APPROVE_DEPT_HEAD':
            if not (request.user.is_superuser or user_role in ['DEPT_HEAD', 'ADMIN', 'PRINCIPAL']):
                return Response({'error': 'Unauthorized to approve DTR.'}, status=status.HTTP_403_FORBIDDEN)
            dtr_record.is_dept_head_approved = True
            dtr_record.dept_head_approved_at = timezone.now()
            dtr_record.approved_by = request.user
            dtr_record.save()
            return Response({'success': True, 'message': 'DTR endorsed by Department Head.'})

        return Response({'error': f"Unknown action: '{action_name}'"}, status=status.HTTP_400_BAD_REQUEST)


class ReportAuditLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_report_audit_schema()
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, user_id, username, report_type, section_id, month, year, exported_at
                FROM attendsure_report_audit_logs
                ORDER BY exported_at DESC
                LIMIT 100;
            """)
            rows = cursor.fetchall()
        data = [
            {
                'id': r[0], 'user_id': r[1], 'username': r[2], 'report_type': r[3],
                'section_id': r[4], 'month': r[5], 'year': r[6],
                'exported_at': r[7].isoformat() if hasattr(r[7], 'isoformat') else str(r[7]),
            }
            for r in rows
        ]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        report_type = str(request.data.get('report_type') or request.data.get('report_name') or 'REPORT').strip().upper()[:30]
        row = record_report_audit_in_db(
            user=request.user,
            report_type=report_type,
            section_id=request.data.get('section_id'),
            month=request.data.get('month'),
            year=request.data.get('year'),
        )
        return Response({
            'success': True,
            'id': row[0],
            'report_type': report_type,
            'exported_at': row[1].isoformat() if hasattr(row[1], 'isoformat') else str(row[1]),
        }, status=status.HTTP_201_CREATED)



def render_centralized_dtr_html(data: dict) -> str:
    rows_html = ""
    for r in data.get('rows', []):
        is_violating = r.get('is_loafing') and not r.get('loafing_excused')
        bg = "#fee2e2" if is_violating else ("#fafafa" if r.get('is_weekend') else "#ffffff")
        color = "#dc2626" if is_violating else "#000000"
        rows_html += f"""
        <tr style="height:14px;background-color:{bg};color:{color};">
          <td style="border:1px solid #000;text-align:center;font-weight:700;">{r.get('day', '')}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(r.get('am_arrival', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(r.get('am_departure', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(r.get('pm_arrival', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(r.get('pm_departure', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(r.get('undertime_hours', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(r.get('undertime_minutes', '')))}</td>
        </tr>"""

    watermark_html = ""
    if not data.get('dept_head_approved'):
        watermark_html = """
        <div style="position:absolute;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-32deg);pointer-events:none;z-index:10;text-align:center;">
          <div style="font-size:40pt;font-weight:900;font-family:'Arial Black',sans-serif;color:rgba(239,68,68,0.20);border:4px dashed rgba(239,68,68,0.28);padding:2px 18px;border-radius:8px;letter-spacing:6px;">DRAFT</div>
          <div style="font-size:7pt;font-weight:800;color:rgba(239,68,68,0.32);margin-top:4px;">NOT APPROVED BY DEPT HEAD</div>
        </div>"""

    single_copy = f"""
    <div style="position:relative;width:48%;border:1px solid #000;padding:10px 12px;box-sizing:border-box;font-family:'Times New Roman',serif;color:#000;">
      {watermark_html}
      <div style="text-align:center;font-size:7.5pt;font-style:italic;">Civil Service Form No. 48</div>
      <div style="text-align:center;font-size:11.5pt;font-weight:900;letter-spacing:0.6px;margin:2px 0 6px;">DAILY TIME RECORD</div>
      <div style="border-bottom:1.2px solid #000;text-align:center;padding-bottom:1px;min-height:16px;">
        <span style="font-size:9.2pt;font-weight:800;text-transform:uppercase;">{html_escape(str(data.get('faculty_name', '')))}</span>
      </div>
      <div style="text-align:center;font-size:6.5pt;font-style:italic;margin-bottom:6px;">(Name / ID: {html_escape(str(data.get('employee_id', '')))})</div>
      <div style="font-size:6.8pt;border-bottom:0.8px solid #000;padding-bottom:2px;margin-bottom:4px;">
        For the month of: <u><strong>{html_escape(str(data.get('month', '')))} {html_escape(str(data.get('year', '')))}</strong></u>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:6.2pt;margin-bottom:6px;">
        <div>Regular Days: <u>{html_escape(str(data.get('regular_days_hours') or '8:00-12:00 / 1:00-5:00'))}</u></div>
        <div>Saturdays: <u>{html_escape(str(data.get('saturdays_hours') or 'As Required'))}</u></div>
      </div>
      <table style="width:100%;border-collapse:collapse;border:1.2px solid #000;font-size:5.6pt;">
        <thead>
          <tr>
            <th rowspan="2" style="border:1px solid #000;width:10%;">Days</th>
            <th colspan="2" style="border:1px solid #000;">A. M.</th>
            <th colspan="2" style="border:1px solid #000;">P. M.</th>
            <th colspan="2" style="border:1px solid #000;">UNDERTIME</th>
          </tr>
          <tr style="font-size:5pt;">
            <th style="border:1px solid #000;">ARRIVAL</th>
            <th style="border:1px solid #000;">DEPARTURE</th>
            <th style="border:1px solid #000;">ARRIVAL</th>
            <th style="border:1px solid #000;">DEPARTURE</th>
            <th style="border:1px solid #000;">Hours</th>
            <th style="border:1px solid #000;">Minutes</th>
          </tr>
        </thead>
        <tbody>
          {rows_html}
          <tr style="border-top:1.2px solid #000;font-weight:800;height:16px;">
            <td style="border:1px solid #000;text-align:center;">TOTAL</td>
            <td colspan="4" style="border:1px solid #000;text-align:center;">Days Present: <strong>{data.get('days_present', 0)}</strong></td>
            <td style="border:1px solid #000;text-align:center;">{data.get('total_undertime_hours', 0)}</td>
            <td style="border:1px solid #000;text-align:center;">{data.get('total_undertime_minutes', 0)}</td>
          </tr>
        </tbody>
      </table>
      <div style="font-size:5.8pt;text-align:justify;line-height:1.25;margin-top:6px;">
        I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
      </div>
      <div style="margin-top:16px;text-align:center;">
        <div style="border-bottom:1px solid #000;width:82%;margin:0 auto;"></div>
        <div style="font-size:5.6pt;font-style:italic;margin-top:1px;">(Signature of Faculty / Employee)</div>
      </div>
      <div style="margin-top:10px;text-align:center;">
        <div style="border-bottom:1px solid #000;width:82%;margin:0 auto;min-height:14px;font-weight:bold;font-size:7.5pt;text-transform:uppercase;">
          {html_escape(str(data.get('school_head', '')))}
        </div>
        <div style="font-size:6.4pt;font-weight:700;margin-top:1px;">
          {html_escape(str(data.get('school_head_title') or 'In-Charge / School Head'))}
        </div>
      </div>
    </div>"""

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CSC Form 48 - {html_escape(str(data.get('faculty_name', '')))}</title>
  <style>
    @page {{ size: 8.5in 13in portrait; margin: 0.25in; }}
    body {{ margin: 0; padding: 0; background: #fff; }}
    .page-sheet {{ display: flex; justify-content: space-between; width: 8.0in; margin: 0 auto; }}
  </style>
</head>
<body>
  <div class="page-sheet">
    {single_copy}
    <div style="border-left:1px dashed #94a3b8;margin:0 4px;"></div>
    {single_copy}
  </div>
</body>
</html>"""


def render_centralized_sf1_html(data: dict) -> str:
    learners = data.get('learners') or data.get('students') or []
    rows_html = ""
    for idx, st in enumerate(learners, start=1):
        rows_html += f"""
        <tr style="height:17px;">
          <td style="border:1px solid #000;text-align:center;">{idx}</td>
          <td style="border:1px solid #000;text-align:center;font-family:monospace;font-weight:700;">{html_escape(str(st.get('lrn', '')))}</td>
          <td style="border:1px solid #000;padding:1px 3px;font-weight:700;">{html_escape(str(st.get('name', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('sex', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('birthdate', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('age', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('birth_place', '') or st.get('province', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('mother_tongue', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('ethnic_group', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('religion', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('house_street', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('barangay', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('municipality_city', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('province', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('father_name', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('mother_maiden_name', '')))}</td>
          <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(st.get('guardian_name', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('guardian_relationship', '')))}</td>
          <td style="border:1px solid #000;text-align:center;font-family:monospace;">{html_escape(str(st.get('parent_contact', '')))}</td>
          <td style="border:1px solid #000;text-align:center;">{html_escape(str(st.get('remarks', '')))}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DepEd SF1 - {html_escape(str(data.get('section_name', '')))}</title>
  <style>
    @page {{ size: 13in 8.5in landscape; margin: 0.25in; }}
    body {{ font-family: Arial, sans-serif; font-size: 5.2pt; color: #000; margin: 0; background: #fff; }}
    table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:8px;">
    <div style="font-family:'Old English Text MT',serif;font-size:12pt;font-weight:bold;">Republic of the Philippines</div>
    <div style="font-family:'Old English Text MT',serif;font-size:18pt;font-weight:bold;">Department of Education</div>
    <div style="font-family:Tahoma,sans-serif;font-size:10.5pt;font-weight:900;text-transform:uppercase;margin-top:4px;">School Form 1 (SF 1) School Register</div>
    <div style="font-size:7.5pt;margin-top:4px;">
      <strong>School ID:</strong> {html_escape(str(data.get('school_id', '')))} &bull;
      <strong>School Name:</strong> {html_escape(str(data.get('school_name', '')))} &bull;
      <strong>SY:</strong> {html_escape(str(data.get('academic_year', '')))} &bull;
      <strong>Grade &amp; Section:</strong> {html_escape(str(data.get('grade_level', '')))} - {html_escape(str(data.get('section_name', '')))}
    </div>
  </div>
  <table style="border:1.5px solid #000;">
    <thead>
      <tr style="font-weight:bold;text-align:center;">
        <th style="border:1px solid #000;width:2%;">#</th>
        <th style="border:1px solid #000;width:7%;">LRN</th>
        <th style="border:1px solid #000;width:13%;">LEARNER'S NAME</th>
        <th style="border:1px solid #000;width:2.5%;">Sex</th>
        <th style="border:1px solid #000;width:5%;">BIRTH DATE</th>
        <th style="border:1px solid #000;width:3%;">AGE</th>
        <th style="border:1px solid #000;width:5%;">BIRTH PLACE</th>
        <th style="border:1px solid #000;width:4.5%;">MOTHER TONGUE</th>
        <th style="border:1px solid #000;width:4%;">IP</th>
        <th style="border:1px solid #000;width:4%;">RELIGION</th>
        <th style="border:1px solid #000;width:5%;">Street</th>
        <th style="border:1px solid #000;width:4.5%;">Barangay</th>
        <th style="border:1px solid #000;width:4.5%;">City/Mun</th>
        <th style="border:1px solid #000;width:4%;">Province</th>
        <th style="border:1px solid #000;width:6.5%;">Father's Name</th>
        <th style="border:1px solid #000;width:6.5%;">Mother's Maiden</th>
        <th style="border:1px solid #000;width:4.5%;">Guardian</th>
        <th style="border:1px solid #000;width:3.5%;">Relation</th>
        <th style="border:1px solid #000;width:5.5%;">Contact</th>
        <th style="border:1px solid #000;width:5.5%;">REMARKS</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
      <tr style="background:#e2e8f0;font-weight:900;">
        <td colspan="3" style="border:1px solid #000;padding-left:6px;">TOTAL ENROLLED</td>
        <td style="border:1px solid #000;text-align:center;">{data.get('total_combined', len(learners))}</td>
        <td colspan="16" style="border:1px solid #000;padding-left:6px;">Male: {data.get('total_male', 0)} &bull; Female: {data.get('total_female', 0)}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>"""


def render_centralized_sf2_html(data: dict) -> str:
    males = data.get('males') or []
    females = data.get('females') or []
    school_days = data.get('school_days') or []

    day_cols_th = ""
    for i in range(25):
        if i < len(school_days):
            d = school_days[i]
            day_cols_th += f"<th style='border:1px solid #000;width:2.4%;'><div>{d.get('dateNumber')}</div><div>{d.get('dayOfWeek')}</div></th>"
        else:
            day_cols_th += "<th style='border:1px solid #000;width:2.4%;'></th>"

    def build_rows(learners):
        out = ""
        for idx, l in enumerate(learners, start=1):
            att_map = l.get('attendance') or {}
            cells = ""
            for i in range(25):
                if i < len(school_days):
                    d_num = school_days[i].get('dateNumber')
                    st = str(att_map.get(d_num, '')).lower().strip()
                    mark = "X" if st in ['absent', 'x', '1'] else ("L" if st in ['tardy', 'late', '2'] else "")
                    cells += f"<td style='border:1px solid #000;text-align:center;'>{mark}</td>"
                else:
                    cells += "<td style='border:1px solid #000;'></td>"
            out += f"""
            <tr style="height:15px;">
              <td style="border:1px solid #000;text-align:center;">{idx}</td>
              <td style="border:1px solid #000;padding:1px 3px;font-weight:700;">{html_escape(str(l.get('name', '')))}</td>
              {cells}
              <td style="border:1px solid #000;text-align:center;font-weight:700;">{l.get('total_absent') or ''}</td>
              <td style="border:1px solid #000;text-align:center;font-weight:700;">{l.get('total_tardy') or ''}</td>
              <td style="border:1px solid #000;padding:1px 2px;">{html_escape(str(l.get('remarks', '')))}</td>
            </tr>"""
        return out

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DepEd SF2 - {html_escape(str(data.get('section_name', '')))}</title>
  <style>
    @page {{ size: 13in 8.5in landscape; margin: 0.25in; }}
    body {{ font-family: Arial, sans-serif; font-size: 5pt; color: #000; margin: 0; background: #fff; }}
    table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:8px;">
    <div style="font-family:'Old English Text MT',serif;font-size:12pt;font-weight:bold;">Republic of the Philippines</div>
    <div style="font-family:'Old English Text MT',serif;font-size:18pt;font-weight:bold;">Department of Education</div>
    <div style="font-family:Tahoma,sans-serif;font-size:10.5pt;font-weight:900;text-transform:uppercase;margin-top:4px;">School Form 2 (SF 2) Daily Attendance Report of Learners</div>
    <div style="font-size:7.5pt;margin-top:4px;">
      <strong>School ID:</strong> {html_escape(str(data.get('school_id', '')))} &bull;
      <strong>School Name:</strong> {html_escape(str(data.get('school_name', '')))} &bull;
      <strong>Month:</strong> {html_escape(str(data.get('month', '')))} {html_escape(str(data.get('year', '')))} &bull;
      <strong>Grade &amp; Section:</strong> {html_escape(str(data.get('grade_level', '')))} - {html_escape(str(data.get('section_name', '')))}
    </div>
  </div>
  <table style="border:1.5px solid #000;">
    <thead>
      <tr>
        <th rowspan="2" style="width:2%;border:1px solid #000;">#</th>
        <th rowspan="2" style="width:16%;border:1px solid #000;">LEARNER'S NAME</th>
        <th colspan="25" style="border:1px solid #000;">(Dates of Month)</th>
        <th colspan="2" style="width:6%;border:1px solid #000;">Total</th>
        <th rowspan="2" style="width:16%;border:1px solid #000;">REMARKS</th>
      </tr>
      <tr>
        {day_cols_th}
        <th style="border:1px solid #000;">ABSENT</th>
        <th style="border:1px solid #000;">TARDY</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#f8fafc;font-weight:800;"><td colspan="30" style="border:1px solid #000;padding-left:6px;">MALE ({len(males)})</td></tr>
      {build_rows(males)}
      <tr style="background:#f8fafc;font-weight:800;"><td colspan="30" style="border:1px solid #000;padding-left:6px;">FEMALE ({len(females)})</td></tr>
      {build_rows(females)}
    </tbody>
  </table>
</body>
</html>"""


def render_centralized_sf4_html(data: dict) -> str:
    groups = data.get('grade_groups') or []
    rows_html = ""

    def render_triplet(t):
        if not t:
            return "<td style='border:1px solid #000;text-align:center;'>0</td><td style='border:1px solid #000;text-align:center;'>0</td><td style='border:1px solid #000;text-align:center;font-weight:bold;'>0</td>"
        return f"<td style='border:1px solid #000;text-align:center;'>{t.get('m', 0)}</td><td style='border:1px solid #000;text-align:center;'>{t.get('f', 0)}</td><td style='border:1px solid #000;text-align:center;font-weight:bold;'>{t.get('total', 0)}</td>"

    for g in groups:
        for sec in g.get('sections', []):
            rows_html += f"""
            <tr style="height:16px;">
              <td style="border:1px solid #000;padding:1px 3px;">{html_escape(str(sec.get('adviser_name', '')))}</td>
              <td style="border:1px solid #000;text-align:center;font-weight:bold;">{html_escape(str(sec.get('grade_level', '')))}</td>
              <td style="border:1px solid #000;padding:1px 3px;">{html_escape(str(sec.get('section_name', '')))}</td>
              {render_triplet(sec.get('registered_end'))}
              {render_triplet(sec.get('daily_average'))}
              {render_triplet(sec.get('attendance_percentage'))}
              {render_triplet(sec.get('dropped_out_prev'))}
              {render_triplet(sec.get('dropped_out_month'))}
              {render_triplet(sec.get('dropped_out_cumulative'))}
              {render_triplet(sec.get('transferred_out_prev'))}
              {render_triplet(sec.get('transferred_out_month'))}
              {render_triplet(sec.get('transferred_out_cumulative'))}
              {render_triplet(sec.get('transferred_in_prev'))}
              {render_triplet(sec.get('transferred_in_month'))}
              {render_triplet(sec.get('transferred_in_cumulative'))}
            </tr>"""

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DepEd SF4 - {html_escape(str(data.get('month', '')))} {html_escape(str(data.get('year', '')))}</title>
  <style>
    @page {{ size: 13in 8.5in landscape; margin: 0.25in; }}
    body {{ font-family: Arial, sans-serif; font-size: 5.4pt; color: #000; margin: 0; background: #fff; }}
    table {{ width: 100%; border-collapse: collapse; table-layout: fixed; }}
  </style>
</head>
<body>
  <div style="text-align:center;margin-bottom:8px;">
    <div style="font-family:'Old English Text MT',serif;font-size:12pt;font-weight:bold;">Republic of the Philippines</div>
    <div style="font-family:'Old English Text MT',serif;font-size:18pt;font-weight:bold;">Department of Education</div>
    <div style="font-family:Tahoma,sans-serif;font-size:10.5pt;font-weight:900;text-transform:uppercase;margin-top:4px;">School Form 4 (SF 4) Monthly Learner's Movement and Attendance</div>
  </div>
  <table style="border:1.5px solid #000;">
    <thead>
      <tr style="font-weight:bold;text-align:center;">
        <th rowspan="3" style="border:1px solid #000;width:9%;">NAME OF ADVISER</th>
        <th rowspan="3" style="border:1px solid #000;width:6%;">GRADE</th>
        <th rowspan="3" style="border:1px solid #000;width:7%;">SECTION</th>
        <th colspan="3" rowspan="2" style="border:1px solid #000;">REGISTERED</th>
        <th colspan="6" style="border:1px solid #000;">ATTENDANCE</th>
        <th colspan="9" style="border:1px solid #000;">DROPPED OUT</th>
        <th colspan="9" style="border:1px solid #000;">TRANSFERRED OUT</th>
        <th colspan="9" style="border:1px solid #000;">TRANSFERRED IN</th>
      </tr>
      <tr style="font-size:4.5pt;text-align:center;">
        <th colspan="3" style="border:1px solid #000;">Daily Avg</th><th colspan="3" style="border:1px solid #000;">% Month</th>
        <th colspan="3" style="border:1px solid #000;">(A) Prev</th><th colspan="3" style="border:1px solid #000;">(B) Month</th><th colspan="3" style="border:1px solid #000;">(A+B) Total</th>
        <th colspan="3" style="border:1px solid #000;">(A) Prev</th><th colspan="3" style="border:1px solid #000;">(B) Month</th><th colspan="3" style="border:1px solid #000;">(A+B) Total</th>
        <th colspan="3" style="border:1px solid #000;">(A) Prev</th><th colspan="3" style="border:1px solid #000;">(B) Month</th><th colspan="3" style="border:1px solid #000;">(A+B) Total</th>
      </tr>
      <tr style="font-size:4.5pt;text-align:center;">
        {"".join(["<th style='border:1px solid #000;'>M</th><th style='border:1px solid #000;'>F</th><th style='border:1px solid #000;font-weight:bold;'>T</th>" for _ in range(12)])}
      </tr>
    </thead>
    <tbody>
      {rows_html or "<tr><td colspan='39' style='border:1px solid #000;text-align:center;padding:18px;'>No records found.</td></tr>"}
    </tbody>
  </table>
</body>
</html>"""


class UnifiedReportExportAPIView(APIView):
    """
    Centralized report generator for DTR (Form 48), SF1, SF2, and SF4.
    Returns both the raw database data and the print-ready HTML.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        report_type = str(request.query_params.get('report_type', 'DTR')).strip().upper()
        section_id = request.query_params.get('section_id')
        faculty_id = request.query_params.get('faculty_id')
        month = request.query_params.get('month')
        year = request.query_params.get('year')

        if report_type == 'DTR':
            res = DTRListAPIView().get(request, faculty_id=faculty_id)
            if res.status_code != 200:
                return res
            data = dict(res.data)
            if request.query_params.get('regular_days_hours'):
                data['regular_days_hours'] = request.query_params.get('regular_days_hours')
            if request.query_params.get('saturdays_hours'):
                data['saturdays_hours'] = request.query_params.get('saturdays_hours')
            html_content = render_centralized_dtr_html(data)
            title = f"CSC_Form48_{data.get('employee_id', '')}_{data.get('month', '')}_{data.get('year', '')}"

        elif report_type == 'SF1':
            if not section_id:
                return Response({'error': 'section_id is required for SF1.'}, status=status.HTTP_400_BAD_REQUEST)
            res = DepEdSF1DataAPIView().get(request, section_id=int(section_id))
            if res.status_code != 200:
                return res
            data = res.data
            html_content = render_centralized_sf1_html(data)
            title = f"DepEd_SF1_{data.get('section_name', '')}_{data.get('academic_year', '')}"

        elif report_type == 'SF2':
            if not section_id:
                return Response({'error': 'section_id is required for SF2.'}, status=status.HTTP_400_BAD_REQUEST)
            res = DepEdSF2DataAPIView().get(request, section_id=int(section_id))
            if res.status_code != 200:
                return res
            data = res.data
            html_content = render_centralized_sf2_html(data)
            title = f"DepEd_SF2_{data.get('section_name', '')}_{data.get('month', '')}_{data.get('year', '')}"

        elif report_type == 'SF4':
            res = DepEdSF4DataAPIView().get(request)
            if res.status_code != 200:
                return res
            data = res.data
            html_content = render_centralized_sf4_html(data)
            title = f"DepEd_SF4_{data.get('month', '')}_{data.get('year', '')}"

        else:
            return Response({'error': f"Unsupported report_type '{report_type}'."}, status=status.HTTP_400_BAD_REQUEST)

        record_report_audit_in_db(request.user, report_type, section_id, month, year)
        return Response({
            'report_type': report_type,
            'title': title,
            'html': html_content,
            'data': data,
        }, status=status.HTTP_200_OK)


class UnifiedReportPrintAPIView(APIView):
    """
    Returns a direct printable HTML document for mobile & web browsers.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        res = UnifiedReportExportAPIView().get(request)
        if res.status_code != 200:
            return res
        html_doc = res.data.get('html', '')
        injected = html_doc.replace(
            '</body>',
            '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},350);});</script></body>'
        )
        return HttpResponse(injected, content_type='text/html; charset=utf-8')



# ============================================================================
# SCHEDULES & CORE VIEWSETS
# ============================================================================

DAY_MAP = {
    'MON-FRI': {1, 2, 3, 4, 5}, 'MWF': {1, 3, 5}, 'TTH': {2, 4}, 'SAT': {6},
    'MON': {1}, 'MONDAY': {1}, 'TUE': {2}, 'TUESDAY': {2}, 'WED': {3}, 'WEDNESDAY': {3},
    'THU': {4}, 'THURSDAY': {4}, 'FRI': {5}, 'FRIDAY': {5}, 'SATURDAY': {6},
}


def get_day_set(raw_days):
    if not raw_days:
        return {1, 2, 3, 4, 5}
    if isinstance(raw_days, int):
        return {raw_days}
    cleaned = str(raw_days).strip().upper()
    if cleaned in DAY_MAP:
        return DAY_MAP[cleaned]
    output = set()
    for t in cleaned.replace(',', ' ').split():
        if t in DAY_MAP:
            output.update(DAY_MAP[t])
        elif t.isdigit():
            output.add(int(t))
    return output if output else {1, 2, 3, 4, 5}


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
        if user.is_superuser or get_user_role(user) in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']:
            return qs
        faculty = resolve_faculty_for_user(user)
        return qs.filter(models.Q(faculty=faculty) | models.Q(section__adviser=faculty)).distinct() if faculty else qs.none()


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


class GatePassViewSet(viewsets.ModelViewSet):
    serializer_class = GatePassSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [GatePassPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['reason', 'pass_number']

    def get_queryset(self):
        qs = GatePass.objects.select_related('faculty', 'student', 'issued_by').order_by('-valid_from')
        user = self.request.user
        if not user or not user.is_authenticated:
            return qs.none()
        if user.is_superuser or get_user_role(user) in ['ADMIN', 'PRINCIPAL', 'GUARD']:
            return qs
        faculty = resolve_faculty_for_user(user)
        return qs.filter(models.Q(issued_by=faculty) | models.Q(faculty=faculty)).distinct() if faculty else qs.none()


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
        return Response([{"id": r[0], "name": r[1], "building": r[2], "capacity": r[3], "room_type": r[4]} for r in rows])


class GradeLevelViewSet(viewsets.ViewSet):
    permission_classes = [IsAcademicManagerPermission]

    def list(self, request):
        levels = GradeLevel.objects.all().order_by('level_order', 'id')
        return Response([
            {'id': gl.id, 'name': gl.name, 'code': gl.code, 'level_number': gl.level_order, 'level_order': gl.level_order, 'stage': gl.stage}
            for gl in levels
        ])


# ============================================================================
# SMS OUTBOX & HARDWARE MODEM
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

    @action(detail=False, methods=['delete', 'post'], url_path='delete-delivered')
    def delete_delivered(self, request):
        deleted_count, _ = SmsOutbox.objects.filter(status='SENT').delete()
        return Response({'success': True, 'deleted_count': deleted_count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='broadcast')
    def broadcast(self, request):
        message_body = str(request.data.get('message_body') or request.data.get('message') or '').strip()
        if not message_body:
            return Response({'error': 'Message body is required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True, 'count': 0}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='metrics')
    def get_metrics(self, request):
        today = timezone.localdate()
        return Response({
            'total_today': SmsOutbox.objects.filter(created_at__date=today).count(),
            'pending': SmsOutbox.objects.filter(status='PENDING').count(),
            'sent_today': SmsOutbox.objects.filter(status='SENT', created_at__date=today).count(),
            'failed': SmsOutbox.objects.filter(status='FAILED').count(),
            'modem_port': getattr(settings, 'GSM_MODEM_PORT', 'COM3'),
            'modem_baudrate': getattr(settings, 'GSM_MODEM_BAUDRATE', 9600),
        })

    @action(detail=True, methods=['post'], url_path='retry')
    def retry_single(self, request, pk=None):
        sms = self.get_object()
        sms.status = 'PENDING'
        sms.error_message = None
        sms.retry_count += 1
        sms.save(update_fields=['status', 'error_message', 'retry_count'])
        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='retry-all-failed')
    def retry_all_failed(self, request):
        updated_count = SmsOutbox.objects.filter(status='FAILED').update(status='PENDING', error_message=None)
        return Response({'success': True, 'count': updated_count})


class BulkSmsStatusAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        updates = request.data.get('updates', [])
        now = timezone.now()
        sent_ids = [i['id'] for i in updates if str(i.get('status', '')).upper() == 'SENT']
        if sent_ids:
            SmsOutbox.objects.filter(id__in=sent_ids).update(status='SENT', sent_at=now, error_message=None)
        return Response({'success': True, 'count': len(updates)})


class PendingSmsDispatchAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        pending = SmsOutbox.objects.filter(status='PENDING').order_by('created_at')[:25]
        return Response([{'id': s.id, 'recipient_number': s.recipient_number, 'message_body': s.message_body} for s in pending])


class MarkSmsStatusAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        try:
            sms = SmsOutbox.objects.get(pk=pk)
            if str(request.data.get('status', 'SENT')).upper() == 'SENT':
                sms.status = 'SENT'
                sms.sent_at = timezone.now()
                sms.error_message = None
            else:
                sms.status = 'FAILED'
                sms.error_message = request.data.get('error', 'Modem transmission error')
                sms.retry_count += 1
            sms.save(update_fields=['status', 'sent_at', 'error_message', 'retry_count'])
            return Response({'success': True})
        except SmsOutbox.DoesNotExist:
            return Response({'error': 'SMS record not found.'}, status=status.HTTP_404_NOT_FOUND)


# ============================================================================
# CALENDAR EXCEPTIONS (POSTGRESQL)
# ============================================================================

class CalendarExceptionAPIView(APIView):
    permission_classes = [IsAuthenticatedOrReadOnly]

    def _is_admin(self, user):
        return bool(user and user.is_authenticated and (user.is_superuser or get_user_role(user) in ['ADMIN', 'PRINCIPAL']))

    def get(self, request, pk=None):
        ensure_calendar_schema()
        with connection.cursor() as cursor:
            cursor.execute("SELECT weekend_rest_enabled FROM attendsure_calendar_settings WHERE id = 1;")
            setting_row = cursor.fetchone()
            weekend_rest_enabled = bool(setting_row[0]) if setting_row is not None else True

            cursor.execute("""
                SELECT id, exception_date, exception_type, reason, affects_all_grades, created_at
                FROM attendsure_calendar_exceptions
                ORDER BY exception_date DESC, id DESC;
            """)
            rows = cursor.fetchall()

        results = [
            {
                "id": row[0],
                "date": row[1].strftime('%Y-%m-%d') if hasattr(row[1], 'strftime') else str(row[1]),
                "type": row[2],
                "reason": row[3],
                "affects_all_grades": bool(row[4]),
                "created_at": row[5].isoformat() if hasattr(row[5], 'isoformat') else str(row[5]),
            }
            for row in rows
        ]
        return Response({"weekend_rest_enabled": weekend_rest_enabled, "results": results}, status=status.HTTP_200_OK)

    def post(self, request, pk=None):
        if not self._is_admin(request.user):
            return Response({"error": "Only school administrators can add calendar overrides."}, status=status.HTTP_403_FORBIDDEN)
        ensure_calendar_schema()
        if 'weekend_rest_enabled' in request.data and 'date' not in request.data:
            return self.patch(request, pk=pk)

        date_val = str(request.data.get('date', '')).strip()
        type_val = str(request.data.get('type', 'SUSPENSION')).strip().upper()
        reason_val = str(request.data.get('reason', '')).strip()
        affects_all = bool(request.data.get('affects_all_grades', True))

        if not date_val or not reason_val:
            return Response({"error": "Both effective date and reason are required."}, status=status.HTTP_400_BAD_REQUEST)

        parsed_date = datetime.strptime(date_val, '%Y-%m-%d').date()
        with connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO attendsure_calendar_exceptions
                    (exception_date, exception_type, reason, affects_all_grades, created_by_id, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                RETURNING id, exception_date, exception_type, reason, affects_all_grades, created_at;
            """, [parsed_date, type_val, reason_val, affects_all, request.user.id])
            row = cursor.fetchone()

        return Response({
            "id": row[0],
            "date": row[1].strftime('%Y-%m-%d') if hasattr(row[1], 'strftime') else str(row[1]),
            "type": row[2],
            "reason": row[3],
            "affects_all_grades": bool(row[4]),
            "created_at": row[5].isoformat() if hasattr(row[5], 'isoformat') else str(row[5]),
        }, status=status.HTTP_201_CREATED)

    def patch(self, request, pk=None):
        if not self._is_admin(request.user):
            return Response({"error": "Only school administrators can update calendar settings."}, status=status.HTTP_403_FORBIDDEN)
        ensure_calendar_schema()
        weekend_val = bool(request.data.get('weekend_rest_enabled', True))
        with connection.cursor() as cursor:
            cursor.execute("UPDATE attendsure_calendar_settings SET weekend_rest_enabled = %s, updated_at = NOW() WHERE id = 1 RETURNING weekend_rest_enabled;", [weekend_val])
            row = cursor.fetchone()
        return Response({"weekend_rest_enabled": bool(row[0]) if row is not None else weekend_val}, status=status.HTTP_200_OK)

    def put(self, request, pk=None):
        return self.patch(request, pk=pk)

    def delete(self, request, pk=None):
        if not self._is_admin(request.user):
            return Response({"error": "Only school administrators can delete calendar overrides."}, status=status.HTTP_403_FORBIDDEN)
        ensure_calendar_schema()
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM attendsure_calendar_exceptions WHERE id = %s RETURNING id;", [pk])
            deleted_row = cursor.fetchone()
        if not deleted_row:
            return Response({"error": "Calendar override record not found in database."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"detail": "Calendar override deleted from database.", "id": deleted_row[0]}, status=status.HTTP_200_OK)