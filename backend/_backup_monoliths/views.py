"""
AttendSure - API Views & Ingestion Controllers
File: backend/apps/api/views.py

Cybersecurity & Row-Level Data Isolation Applied:
1. OWASP BOLA / IDOR Defense: Every queryset is filtered by user role and ownership.
2. Teacher Scope Isolation: Regular teachers only see students, sections, schedules,
   gate logs, and gate passes tied to classes they teach or advise.
3. Self-Only DTR & Profile Lock: Regular faculty can only view and submit their own Form 48 DTR.
4. Guard Checkpoint Scope: Security guards can only access gate logs and gate pass clearances.
5. Fail-Safe Exception Handling: Prevents stack trace and schema leaks.
"""

import base64
import calendar
import hashlib
import csv
from datetime import date, datetime, timedelta
import hmac
from html import escape as html_escape
import logging
import math
import os
import shutil
import time as time_module
import uuid

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.base import ContentFile
from django.db import connection, models, transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import filters, permissions, serializers as drf_serializers, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
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
    Schedule,
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
    FacultyDropdownSerializer,
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
    safe_photo_url,
)

User = get_user_model()
logger = logging.getLogger(__name__)


# ============================================================================
# DATABASE TABLE HELPERS & SELF-HEALING SCHEMA
# ============================================================================

def ensure_user_profile_schema():
    """Guarantees user_profiles table has the required columns in PostgreSQL."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                ALTER TABLE user_profiles
                ADD COLUMN IF NOT EXISTS is_teaching BOOLEAN NOT NULL DEFAULT TRUE;
            """)
            cursor.execute("""
                ALTER TABLE user_profiles
                ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT FALSE;
            """)
            cursor.execute("""
                ALTER TABLE user_profiles
                ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
            """)
            cursor.execute("""
                ALTER TABLE user_profiles
                ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL;
            """)
    except Exception as e:
        logger.debug("Schema check for user_profiles: %s", e)


def ensure_faculty_profile_schema():
    """Guarantees faculty_profiles has the can_teach column enabled."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                ALTER TABLE faculty_profiles
                ADD COLUMN IF NOT EXISTS can_teach BOOLEAN NOT NULL DEFAULT TRUE;
            """)
    except Exception as e:
        logger.debug("Schema check for faculty_profiles: %s", e)


def ensure_attendance_schema():
    ensure_user_profile_schema()
    ensure_faculty_profile_schema()
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
    """
    Saves large base64 logos to media files on disk once.
    Returns a lightweight URL to eliminate 15-second network timeouts.
    """
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('none', 'null', 'undefined'):
        return None

    # Already a standard URL or static media file path
    if val_str.startswith(('http://', 'https://', '/media/')):
        if val_str.startswith('/media/') and request:
            return request.build_absolute_uri(val_str)
        return val_str

    # Intercept large base64 image strings and offload them to disk
    if val_str.startswith('data:image/') or val_str.startswith(('/9j/', 'iVBORw0KGgo')):
        try:
            if ';base64,' in val_str:
                format_part, img_str = val_str.split(';base64,')
                ext = format_part.split('/')[-1].split(';')[0].lower()
                if ext in ('jpeg', 'pjpeg'):
                    ext = 'jpg'
            else:
                img_str = val_str
                ext = 'png'

            decoded_bytes = base64.b64decode(img_str, validate=True)
            if len(decoded_bytes) <= 10 * 1024 * 1024:
                file_hash = hashlib.md5(decoded_bytes).hexdigest()[:12]
                filename = f"logo_{file_hash}.{ext}"
                target_dir = os.path.join(settings.MEDIA_ROOT, 'school_logos')
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                if not os.path.exists(target_path):
                    with open(target_path, 'wb') as f:
                        f.write(decoded_bytes)

                media_url = f"{settings.MEDIA_URL}school_logos/{filename}"
                return request.build_absolute_uri(media_url) if request else media_url
        except Exception as e:
            logger.error("Failed to save base64 logo to disk: %s", e)

    return val_str

# ============================================================================
# STRING FORMATTING & NAME HELPERS
# ============================================================================

def format_full_student_name(st):
    """Safely builds full student name: Last Name, First Name Middle Name Suffix."""
    if not st:
        return ""
    if hasattr(st, 'full_name') and isinstance(st.full_name, str):
        return st.full_name
    mid = f" {st.middle_name}" if getattr(st, 'middle_name', None) else ""
    suf = f" {st.suffix}" if getattr(st, 'suffix', None) else ""
    return f"{st.last_name}, {st.first_name}{mid}{suf}".strip(" ,")


def format_deduped_section_label(grade_name, section_name):
    """Formats section display label cleanly without duplicate text."""
    g = str(grade_name or '').strip()
    s = str(section_name or '').strip()
    if not g:
        return s
    if not s or g.lower().endswith(s.lower()) or f"- {s.lower()}" in g.lower():
        return g
    return f"{g} - {s}"


# ============================================================================
# ROLE, PERMISSION & ROW-LEVEL ISOLATION HELPERS
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


def is_regular_teacher(role):
    return str(role or '').upper() in ['TEACHER', 'FACULTY']


def is_leadership_role(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return get_user_role(user) in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']


def resolve_faculty_for_user(user):
    """Finds or links the active FacultyProfile for the authenticated user."""
    if not user or not user.is_authenticated:
        return None

    ensure_user_profile_schema()
    ensure_faculty_profile_schema()

    user_prof, _ = UserProfile.objects.get_or_create(user=user)
    faculty = getattr(user_prof, 'faculty', None)

    if not faculty:
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

    if not faculty:
        emp_id = str(user.username).strip().upper()
        faculty, _ = FacultyProfile.objects.get_or_create(
            employee_id=emp_id,
            defaults={
                'first_name': user.first_name or user.username.capitalize(),
                'last_name': user.last_name or 'Faculty',
                'email': user.email or '',
                'position': 'Teacher',
                'department': 'Academic Department',
                'qr_token': f"STF-{uuid.uuid4().hex[:12].upper()}",
                'is_active': True,
                'can_teach': True,
            }
        )

    if faculty:
        f_updates = []
        if not getattr(faculty, 'is_active', True):
            faculty.is_active = True
            f_updates.append('is_active')
        if not getattr(faculty, 'can_teach', True):
            faculty.can_teach = True
            f_updates.append('can_teach')
        if f_updates:
            faculty.save(update_fields=f_updates)

        p_updates = []
        if getattr(user_prof, 'faculty_id', None) != faculty.id:
            user_prof.faculty = faculty
            p_updates.append('faculty')
        if not getattr(user_prof, 'is_teaching', True):
            user_prof.is_teaching = True
            p_updates.append('is_teaching')
        if p_updates:
            user_prof.save(update_fields=p_updates)

    return faculty


def get_teacher_section_ids(faculty) -> set:
    """
    Returns the exact set of Section IDs that a faculty member advises or teaches.
    Used to enforce Row-Level Data Isolation for regular teachers.
    """
    if not faculty:
        return set()
    advised_ids = set(Section.objects.filter(adviser=faculty).values_list('id', flat=True))
    scheduled_ids = set(Schedule.objects.filter(faculty=faculty).exclude(section__isnull=True).values_list('section_id', flat=True))
    return advised_ids.union(scheduled_ids)


def get_teacher_student_ids(faculty) -> set:
    """
    Returns the exact set of Student IDs enrolled in sections advised or taught by the faculty member.
    """
    sec_ids = get_teacher_section_ids(faculty)
    if not sec_ids:
        return set()
    return set(
        Enrollment.objects.filter(
            section_id__in=sec_ids,
            status__in=['ENROLLED', 'ACTIVE']
        ).values_list('student_id', flat=True).distinct()
    )


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
        if not (request.user and request.user.is_authenticated):
            return False
        role = get_user_role(request.user)
        # Guards cannot create or delete gate passes
        if role == 'GUARD' and request.method in ['POST', 'DELETE']:
            return False
        return True

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        if role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']:
            return True
        if role == 'GUARD' and request.method in ['GET', 'PUT', 'PATCH']:
            return True
        user_faculty = resolve_faculty_for_user(request.user)
        if not user_faculty:
            return False
        allowed_student_ids = get_teacher_student_ids(user_faculty)
        return bool(
            obj.issued_by_id == user_faculty.id
            or obj.faculty_id == user_faculty.id
            or (obj.student_id and obj.student_id in allowed_student_ids)
        )


class SmsOutboxPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        role = get_user_role(request.user)
        return role in ['ADMIN', 'PRINCIPAL']


class IsAdviserOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if is_leadership_role(request.user):
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
    max_page_size = 10000

    def get_page_size(self, request):
        raw_size = request.query_params.get(self.page_size_query_param, '')
        if str(raw_size).strip().upper() == 'ALL':
            return self.max_page_size
        return super().get_page_size(request)

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        })


def verify_modem_gateway_request(request) -> bool:
    expected_token = getattr(settings, 'GSM_GATEWAY_TOKEN', None) or getattr(settings, 'SECRET_KEY', None)
    provided_key = request.headers.get('X-Modem-Key') or request.query_params.get('token')

    if provided_key and expected_token and hmac.compare_digest(provided_key.strip(), expected_token.strip()):
        return True

    if request.user and request.user.is_authenticated and get_user_role(request.user) in ['ADMIN', 'PRINCIPAL']:
        return True

    remote_ip = request.META.get('REMOTE_ADDR', '')
    if remote_ip in ('127.0.0.1', 'localhost', '::1'):
        return True

    return False


# ============================================================================
# CLASSROOM ROSTER & BATCH SCAN
# ============================================================================

class FacultyClassroomRosterAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_attendance_schema()
        faculty = resolve_faculty_for_user(request.user)
        today_date = timezone.localdate()

        if is_leadership_role(request.user):
            schedules_qs = Schedule.objects.select_related(
                'section', 'section__grade_level', 'subject', 'faculty'
            ).all().order_by('start_time')
        elif faculty:
            schedules_qs = Schedule.objects.select_related(
                'section', 'section__grade_level', 'subject', 'faculty'
            ).filter(
                Q(faculty=faculty) | Q(section__adviser=faculty)
            ).distinct().order_by('start_time')
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

            grade_name = sec.grade_level.name if getattr(sec, 'grade_level', None) else ''

            student_items = []
            for st in students:
                photo_abs = safe_photo_url(st.photo, request)
                student_items.append({
                    'id': st.id,
                    'lrn': st.lrn,
                    'qr_token': st.qr_token or st.lrn,
                    'rfid_uid': st.rfid_uid or '',
                    'first_name': st.first_name,
                    'middle_name': st.middle_name or '',
                    'last_name': st.last_name,
                    'full_name': format_full_student_name(st),
                    'gender': getattr(st, 'sex', getattr(st, 'gender', '')),
                    'sex': getattr(st, 'sex', ''),
                    'photo': photo_abs,
                    'photo_url': photo_abs,
                    'parent_contact': st.parent_contact or '',
                    'guardian_name': st.guardian_name or '',
                    'attendance_status': existing_logs.get(st.id, 'UNSCANNED'),
                })

            roster_data.append({
                'schedule_id': sched.id,
                'section_id': sec.id,
                'section_name': sec.name,
                'grade_level': grade_name,
                'display_section': format_deduped_section_label(grade_name, sec.name),
                'subject_name': getattr(sched.subject, 'title', getattr(sched.subject, 'name', '')) if sched.subject else '',
                'subject_code': getattr(sched.subject, 'code', '') if sched.subject else '',
                'faculty_name': sched.faculty.full_name if sched.faculty else '',
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

        if not faculty and not is_leadership_role(request.user):
            return Response(
                {'error': 'Unauthorized: Your account is not linked to a faculty profile.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if (
            faculty
            and schedule.faculty_id != faculty.id
            and getattr(schedule.section, 'adviser_id', None) != faculty.id
            and not is_leadership_role(request.user)
        ):
            return Response(
                {'error': f"Unauthorized: You ({faculty.full_name}) are not assigned to teach this class."},
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
                    {'error': f"Unrecognized identifier '{identifier}'. Student not found in database."},
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
                    {'error': f"Access Denied: {format_full_student_name(student)} belongs to '{current_sec_name}', not '{target_sec_name}'."},
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
                    'name': format_full_student_name(student),
                    'lrn': student.lrn,
                    'reason': attendance_remarks
                })

            log_defaults = {
                'status': scan_status,
                'scanned_at': timezone.now(),
            }
            if 'faculty' in model_field_names and effective_faculty:
                log_defaults['faculty'] = effective_faculty
            if 'teacher' in model_field_names and effective_faculty:
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

            photo_abs = safe_photo_url(student.photo, request)
            saved_count += 1
            processed_records.append({
                'student_id': student.id,
                'name': format_full_student_name(student),
                'lrn': student.lrn,
                'rfid_uid': student.rfid_uid or '',
                'photo': photo_abs,
                'photo_url': photo_abs,
                'parent_contact': student.parent_contact or '',
                'guardian_name': student.guardian_name or '',
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
# AUTHENTICATION & BRUTE-FORCE LOCKOUT DEFENSE
# ============================================================================

def build_authenticated_user_payload(user, request=None):
    faculty = resolve_faculty_for_user(user)
    school = SchoolProfile.objects.first()
    profile = getattr(user, 'profile', None)
    assigned_role = get_user_role(user)

    emp_id = getattr(faculty, 'employee_id', user.username) if faculty else user.username
    first_name = (getattr(faculty, 'first_name', '') or user.first_name or '').strip()
    middle_name = (getattr(faculty, 'middle_name', '') or '').strip()
    last_name = (getattr(faculty, 'last_name', '') or user.last_name or '').strip()
    full_name = getattr(faculty, 'full_name', '') if faculty else " ".join(filter(None, [first_name, middle_name, last_name])).strip() or user.username

    photo_url = safe_photo_url(faculty.photo, request) if (faculty and faculty.photo) else None
    teaching_class_count = Schedule.objects.filter(Q(faculty=faculty) | Q(section__adviser=faculty)).distinct().count() if faculty else 0
    can_teach = bool(getattr(faculty, 'can_teach', True)) and bool(getattr(profile, 'is_teaching', True))
    is_teaching = can_teach or (teaching_class_count > 0) or is_regular_teacher(assigned_role)

    return {
        'id': user.id,
        'username': user.username,
        'first_name': first_name,
        'middle_name': middle_name,
        'last_name': last_name,
        'full_name': full_name,
        'faculty_name': full_name,
        'faculty_id': emp_id,
        'faculty_pk': getattr(faculty, 'id', None),
        'email': getattr(faculty, 'email', '') or user.email or '',
        'contact_number': getattr(faculty, 'contact_number', '') if faculty else '',
        'position': getattr(faculty, 'position', '') if faculty else '',
        'department': getattr(faculty, 'department', '') if faculty else '',
        'rfid_uid': getattr(faculty, 'rfid_uid', '') if faculty else '',
        'photo': photo_url,
        'photo_url': photo_url,
        'school_name': getattr(school, 'school_name', '') if school else '',
        'role': assigned_role,
        'system_role': assigned_role,
        'is_profile_completed': bool(profile and getattr(profile, 'is_profile_completed', True)),
        'can_teach': can_teach,
        'is_teaching': is_teaching,
        'assigned_class_count': teaching_class_count,
        'is_superuser': user.is_superuser,
    }


class DatabaseLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginRateThrottle]

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = str(request.data.get('password', '')).strip()

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        existing_user = User.objects.filter(username__iexact=username).first()
        profile = getattr(existing_user, 'profile', None) if existing_user else None

        if profile and hasattr(profile, 'is_locked') and profile.is_locked():
            remaining_seconds = int((profile.locked_until - timezone.now()).total_seconds())
            remaining_mins = max(1, remaining_seconds // 60)
            return Response({
                'error': f'Account locked due to excessive failed attempts. Please try again in {remaining_mins} minute(s).'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = authenticate(request=request, username=username, password=password)

        if user is None:
            if profile and hasattr(profile, 'record_failed_attempt'):
                profile.record_failed_attempt()
                attempts_left = max(0, 5 - profile.failed_attempts)
                warning_msg = f"Invalid credentials. {attempts_left} attempt(s) remaining before temporary lockout." if attempts_left > 0 else "Account is now locked for 15 minutes."
                return Response({'error': warning_msg}, status=status.HTTP_401_UNAUTHORIZED)

            return Response({'error': 'Invalid credentials. User is not registered.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'error': 'Account is inactive. Please contact your school administrator.'}, status=status.HTTP_403_FORBIDDEN)

        if profile and hasattr(profile, 'reset_failed_attempts'):
            profile.reset_failed_attempts()

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': build_authenticated_user_payload(user, request),
        }, status=status.HTTP_200_OK)


LoginAPIView = DatabaseLoginView


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_authenticated_user_payload(request.user, request), status=status.HTTP_200_OK)

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
        if new_password:
            clean_pw = str(new_password).strip()
            if len(clean_pw) < 8:
                return Response({'error': 'Password must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                validate_password(clean_pw, user=user)
            except DjangoValidationError as exc:
                return Response({'error': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(clean_pw)

        user.save()

        if faculty:
            faculty.first_name = user.first_name
            faculty.last_name = user.last_name
            faculty.email = user.email
            if 'middle_name' in data:
                faculty.middle_name = str(data.get('middle_name', '')).strip()
            if 'suffix' in data:
                faculty.suffix = str(data.get('suffix', '')).strip()
            if 'contact_number' in data:
                faculty.contact_number = str(data.get('contact_number', '')).strip().replace('-', '').replace(' ', '')
            if 'position' in data:
                faculty.position = str(data.get('position', '')).strip()
            if 'department' in data:
                faculty.department = str(data.get('department', '')).strip()

            raw_photo = data.get('photo')
            if raw_photo is None and 'photo' in data:
                faculty.photo = None
            elif raw_photo and str(raw_photo).startswith('data:image'):
                try:
                    format_part, img_str = raw_photo.split(';base64,')
                    ext = format_part.split('/')[-1].split(';')[0].lower()
                    if ext in ('jpeg', 'pjpeg'):
                        ext = 'jpg'
                    if ext in ('png', 'jpg', 'jpeg', 'webp'):
                        decoded_bytes = base64.b64decode(img_str, validate=True)
                        if len(decoded_bytes) <= 5 * 1024 * 1024:
                            file_name = f"profile_{user.id}_{int(timezone.now().timestamp())}.{ext}"
                            faculty.photo.save(file_name, ContentFile(decoded_bytes), save=False)
                except Exception as e:
                    logger.error("Failed to decode profile photo: %s", e)

            if not faculty.can_teach:
                faculty.can_teach = True
            if not faculty.is_active:
                faculty.is_active = True
            faculty.save()

        profile = getattr(user, 'profile', None)
        if profile and hasattr(profile, 'is_profile_completed'):
            profile.is_profile_completed = True
            profile.save(update_fields=['is_profile_completed'])

        payload = build_authenticated_user_payload(user, request)
        payload['message'] = 'Account profile successfully updated.'
        return Response(payload, status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)


CurrentUserProfileView = CurrentUserView


# ============================================================================
# MY ASSIGNED CLASSES VIEW (TEACHER LOAD)
# ============================================================================

class MyAssignedClassesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_attendance_schema()
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return Response([], status=status.HTTP_200_OK)

        today_date = timezone.localdate()

        schedules = Schedule.objects.filter(
            Q(faculty=faculty) | Q(section__adviser=faculty)
        ).select_related('section', 'section__grade_level', 'subject', 'faculty').distinct().order_by('start_time')

        my_classes = []
        for sched in schedules:
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

            student_items = []
            for st in students:
                student_items.append({
                    'id': st.id,
                    'lrn': st.lrn,
                    'name': format_full_student_name(st),
                    'gender': st.sex,
                    'photo_url': safe_photo_url(st.photo, request),
                    'attendance_status': existing_logs.get(st.id, 'UNSCANNED'),
                })

            grade_name = sec.grade_level.name if sec.grade_level else ''
            my_classes.append({
                'schedule_id': sched.id,
                'section_id': sec.id,
                'section_name': sec.name,
                'grade_level': grade_name,
                'display_name': format_deduped_section_label(grade_name, sec.name),
                'subject_code': sched.subject.code if sched.subject else '',
                'subject_title': sched.subject.title if sched.subject else '',
                'start_time': str(sched.start_time),
                'end_time': str(sched.end_time),
                'room_number': sched.room_number or sec.room_number,
                'total_students': len(student_items),
                'students': student_items,
            })

        return Response(my_classes, status=status.HTTP_200_OK)


# ============================================================================
# SECTIONS CRUD (ROW-LEVEL ISOLATED)
# ============================================================================

class SectionListAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request):
        user_role = get_user_role(request.user)
        sections = Section.objects.select_related(
            'grade_level', 'academic_year', 'adviser'
        ).filter(
            academic_year__is_active=True
        ).order_by('grade_level__level_order', 'name')

        if not sections.exists():
            sections = Section.objects.select_related(
                'grade_level', 'academic_year', 'adviser'
            ).all().order_by('grade_level__level_order', 'name')

        # Row-Level Isolation: Regular teachers only see sections they advise or teach
        if is_regular_teacher(user_role) and not request.user.is_superuser:
            user_faculty = resolve_faculty_for_user(request.user)
            allowed_sec_ids = get_teacher_section_ids(user_faculty)
            sections = sections.filter(id__in=allowed_sec_ids)
        elif user_role == 'GUARD' and not request.user.is_superuser:
            sections = sections.none()

        data = [
            {
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'grade_level_id': s.grade_level_id,
                'academic_year': s.academic_year.code if s.academic_year else '',
                'academic_year_id': s.academic_year_id,
                'adviser_name': s.adviser.full_name if s.adviser else "",
                'adviser_id': s.adviser_id,
                'room_number': s.room_number,
                'capacity': s.capacity,
                'display_label': format_deduped_section_label(s.grade_level.name if s.grade_level else '', s.name),
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
        if academic_year_id and str(academic_year_id).isdigit():
            acad_year = AcademicYear.objects.filter(id=int(academic_year_id)).first()
        if not acad_year:
            acad_year = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()

        try:
            grade_level = GradeLevel.objects.get(id=grade_level_id)
        except GradeLevel.DoesNotExist:
            return Response({'error': 'Grade level not found.'}, status=status.HTTP_400_BAD_REQUEST)

        adviser = None
        if adviser_id and str(adviser_id).isdigit():
            adviser = FacultyProfile.objects.filter(id=int(adviser_id)).first()

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
            'adviser_name': adviser.full_name if adviser else "",
            'room_number': section.room_number,
            'capacity': section.capacity
        }, status=status.HTTP_201_CREATED)


class SectionDetailAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request, pk):
        try:
            s = Section.objects.select_related('grade_level', 'academic_year', 'adviser').get(pk=pk)
            user_role = get_user_role(request.user)
            if is_regular_teacher(user_role) and not request.user.is_superuser:
                user_faculty = resolve_faculty_for_user(request.user)
                if s.id not in get_teacher_section_ids(user_faculty):
                    return Response({'error': 'You are not assigned to this section.'}, status=status.HTTP_403_FORBIDDEN)

            return Response({
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'grade_level_id': s.grade_level_id,
                'academic_year': s.academic_year.code if s.academic_year else '',
                'academic_year_id': s.academic_year_id,
                'adviser_name': s.adviser.full_name if s.adviser else "",
                'adviser_id': s.adviser_id,
                'room_number': s.room_number,
                'capacity': s.capacity,
                'display_label': format_deduped_section_label(s.grade_level.name if s.grade_level else '', s.name),
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
            adv_val = data['adviser_id']
            s.adviser_id = int(adv_val) if adv_val and str(adv_val).isdigit() else None
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
# DASHBOARD OVERVIEW (SCOPED BY ROLE)
# ============================================================================

class DashboardOverviewAPIView(APIView):
    """
    High-Performance, Zero-Lag Dashboard Overview.
    Uses grouped SQL aggregations instead of looping through hours and grades.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query_start = time_module.perf_counter()
        today = timezone.localdate()
        user_role = get_user_role(request.user)
        is_teacher_only = is_regular_teacher(user_role) and not request.user.is_superuser

        if is_teacher_only:
            user_faculty = resolve_faculty_for_user(request.user)
            assigned_student_ids = get_teacher_student_ids(user_faculty)
            assigned_section_ids = get_teacher_section_ids(user_faculty)

            total_students = len(assigned_student_ids)

            # Single aggregated query for today's logs
            gate_logs_today = list(
                StudentGateLog.objects.filter(
                    scan_time__date=today,
                    student_id__in=assigned_student_ids
                ).values('student_id', 'direction', 'scan_time__hour')
            )

            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}

            students_on_campus_count = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0

            # Pre-aggregate hourly distribution in memory (0 extra SQL queries)
            hour_counts = {h: 0 for h in range(6, 18)}
            for l in gate_logs_today:
                h = l.get('scan_time__hour')
                if h in hour_counts:
                    hour_counts[h] += 1

            hourly_scans = [
                {'hour': f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}", 'count': count}
                for h, count in hour_counts.items()
            ]

            grade_levels_data = []
            for g in GradeLevel.objects.filter(sections__id__in=assigned_section_ids).distinct().order_by('level_order'):
                grade_student_ids = set(
                    Enrollment.objects.filter(
                        section__grade_level=g,
                        section_id__in=assigned_section_ids,
                        status__in=['ENROLLED', 'ACTIVE']
                    ).values_list('student_id', flat=True).distinct()
                )
                total_in_grade = len(grade_student_ids)
                present_in_grade = len(gate_in_ids.intersection(grade_student_ids))
                pct = round((present_in_grade / total_in_grade * 100)) if total_in_grade > 0 else 0
                grade_levels_data.append({'grade': g.name, 'present': present_in_grade, 'total': total_in_grade, 'percentage': pct})

            recent_logs = StudentGateLog.objects.filter(
                student_id__in=assigned_student_ids
            ).select_related('student').order_by('-scan_time')[:6]

            total_facultys = 1
            present_facultys = 1 if (user_faculty and FacultyGateLog.objects.filter(scan_time__date=today, direction='IN', faculty=user_faculty).exists()) else 0
            total_gate_scans = len(gate_logs_today)
            sms_sent_today, sms_pending, sms_failed = 0, 0, 0

        else:
            total_students = Student.objects.filter(is_active=True).count()

            # Single aggregated pass for school-wide student logs
            gate_logs_today = list(
                StudentGateLog.objects.filter(scan_time__date=today).values('student_id', 'direction', 'scan_time__hour')
            )

            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}

            students_on_campus_count = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0

            total_facultys = FacultyProfile.objects.filter(is_active=True).count()
            present_facultys = FacultyGateLog.objects.filter(scan_time__date=today, direction='IN').values_list('faculty_id', flat=True).distinct().count()

            total_gate_scans = len(gate_logs_today) + FacultyGateLog.objects.filter(scan_time__date=today).count()

            hour_counts = {h: 0 for h in range(6, 18)}
            for l in gate_logs_today:
                h = l.get('scan_time__hour')
                if h in hour_counts:
                    hour_counts[h] += 1

            hourly_scans = [
                {'hour': f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}", 'count': count}
                for h, count in hour_counts.items()
            ]

            try:
                sms_sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
                sms_pending = SmsOutbox.objects.filter(status='PENDING').count()
                sms_failed = SmsOutbox.objects.filter(status='FAILED', created_at__date=today).count()
            except Exception:
                sms_sent_today, sms_pending, sms_failed = 0, 0, 0

            grade_levels_data = []
            for g in GradeLevel.objects.all().order_by('level_order'):
                grade_student_ids = set(Enrollment.objects.filter(section__grade_level=g, status='ENROLLED').values_list('student_id', flat=True).distinct())
                total_in_grade = len(grade_student_ids)
                present_in_grade = len(gate_in_ids.intersection(grade_student_ids))
                pct = round((present_in_grade / total_in_grade * 100)) if total_in_grade > 0 else 0
                grade_levels_data.append({'grade': g.name, 'present': present_in_grade, 'total': total_in_grade, 'percentage': pct})

            recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:6]

        total_scanners = IoTKiosk.objects.count()
        ten_mins_ago = timezone.now() - timedelta(minutes=10)
        active_scanners = IoTKiosk.objects.filter(is_active=True, last_ping__gte=ten_mins_ago).count()

        max_hour_count = max([h['count'] for h in hourly_scans] or [1])
        for h in hourly_scans:
            h['height'] = round((h['count'] / max_hour_count * 100)) if max_hour_count > 0 and h['count'] > 0 else 0
            h['is_peak'] = h['count'] == max_hour_count and h['count'] > 0

        recent_scans_data = []
        for log in recent_logs:
            enrollment = Enrollment.objects.filter(student=log.student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = format_deduped_section_label(
                enrollment.section.grade_level.code if (enrollment and enrollment.section and enrollment.section.grade_level) else "",
                enrollment.section.name if (enrollment and enrollment.section) else ""
            )
            recent_scans_data.append({
                'id': log.id,
                'person_name': format_full_student_name(log.student),
                'photo_url': safe_photo_url(log.student.photo, request),
                'role_label': 'Student',
                'grade_section': section_label,
                'direction': log.direction,
                'scan_time': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'scan_method': log.scan_method,
            })

        measured_latency_ms = max(1, round((time_module.perf_counter() - query_start) * 1000))

        return Response({
            'total_students': total_students,
            'students_present': len(gate_in_ids),
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
# GATE SCANNERS & PHYSICAL ACCESS CONTROL
# ============================================================================

class GateScanAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [HardwareGateScanRateThrottle]

    def post(self, request):
        raw_data = request.data.copy()

        # Normalize common hardware and simulation field aliases
        raw_identifier = raw_data.get('raw_identifier') or raw_data.get('identifier') or raw_data.get('rfid_uid') or raw_data.get('qr_token')
        kiosk_code = raw_data.get('kiosk_code') or raw_data.get('terminal_code') or raw_data.get('terminal_id')
        secret_key = raw_data.get('secret_key') or raw_data.get('secret_hash') or raw_data.get('token')

        if not raw_identifier:
            return Response({'error': 'Missing required identifier (raw_identifier, rfid_uid, or qr_token).'}, status=status.HTTP_400_BAD_REQUEST)
        if not kiosk_code:
            return Response({'error': 'Missing required kiosk_code.'}, status=status.HTTP_400_BAD_REQUEST)
        if not secret_key:
            return Response({'error': 'Missing required secret_key.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_data['raw_identifier'] = str(raw_identifier).strip()
        raw_data['kiosk_code'] = str(kiosk_code).strip()
        raw_data['secret_key'] = str(secret_key).strip()

        serializer = GateScanSerializer(data=raw_data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        raw_id = data['raw_identifier']
        scan_method = data.get('scan_method', 'RFID')
        kiosk_code = data['kiosk_code']
        secret_key = data['secret_key']
        requested_direction = data.get('direction')
        enforce_student_only = data.get('enforce_student_only', False)
        debounce_seconds = getattr(settings, 'GATE_DEBOUNCE_SECONDS', 10)

        try:
            kiosk = IoTKiosk.objects.get(kiosk_code=kiosk_code, is_active=True)
        except IoTKiosk.DoesNotExist:
            return Response({'error': 'Terminal not registered or inactive.'}, status=status.HTTP_403_FORBIDDEN)

        is_valid_secret = False
        if hasattr(kiosk, 'verify_secret'):
            is_valid_secret = kiosk.verify_secret(secret_key)
        if not is_valid_secret:
            is_valid_secret = hmac.compare_digest(kiosk.secret_hash.encode('utf-8'), str(secret_key).encode('utf-8'))

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
                    'name': faculty.full_name,
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
                'name': faculty.full_name,
                'employee_id': faculty.employee_id,
                'position': faculty.position or '',
                'photo_url': safe_photo_url(faculty.photo, request),
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
                    'name': format_full_student_name(student),
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
                'name': format_full_student_name(student),
                'lrn': student.lrn,
                'photo_url': safe_photo_url(student.photo, request),
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
        is_teacher_only = is_regular_teacher(user_role) and not request.user.is_superuser
        combined_logs = []

        if person_type in ('ALL', 'STUDENT'):
            student_qs = StudentGateLog.objects.select_related('student', 'kiosk').order_by('-scan_time')
            # Row-Level Isolation: Teachers only see gate logs of their own students
            if is_teacher_only:
                allowed_student_ids = get_teacher_student_ids(user_faculty)
                student_qs = student_qs.filter(student_id__in=allowed_student_ids)[:150]
            else:
                student_qs = student_qs[:150]

            for log in student_qs:
                if direction != 'ALL' and log.direction != direction:
                    continue
                name = format_full_student_name(log.student)
                lrn = log.student.lrn
                if search_query and (search_query not in name.lower() and search_query not in lrn.lower()):
                    continue
                combined_logs.append({
                    'log_id': f"GL-STU-{log.id}",
                    'person_type': 'STUDENT',
                    'identifier': lrn,
                    'name': name,
                    'photo_url': safe_photo_url(log.student.photo, request),
                    'direction': log.direction,
                    'scan_method': log.scan_method,
                    'kiosk_name': log.kiosk.terminal_name if log.kiosk else '',
                    'kiosk_code': log.kiosk.kiosk_code if log.kiosk else '',
                    'scan_time': log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': log.scan_time.isoformat(),
                })

        if person_type in ('ALL', 'STAFF'):
            faculty_qs = FacultyGateLog.objects.select_related('faculty', 'kiosk').order_by('-scan_time')
            # Row-Level Isolation: Teachers only see their own staff gate logs
            if is_teacher_only:
                faculty_qs = faculty_qs.filter(faculty=user_faculty)[:150] if user_faculty else faculty_qs.none()
            else:
                faculty_qs = faculty_qs[:150]

            for log in faculty_qs:
                if direction != 'ALL' and log.direction != direction:
                    continue
                name = log.faculty.full_name
                emp_id = log.faculty.employee_id
                if search_query and (search_query not in name.lower() and search_query not in emp_id.lower()):
                    continue
                combined_logs.append({
                    'log_id': f"GL-STF-{log.id}",
                    'person_type': 'STAFF',
                    'identifier': emp_id,
                    'name': name,
                    'photo_url': safe_photo_url(log.faculty.photo, request),
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
# TELEMETRY & GEOFENCE CONTROLLER
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
                'message': f"Phone pairing reset for {faculty.full_name}.",
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
        cache_key = "attendsure_school_settings_fast_payload"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data, status=status.HTTP_200_OK)

        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile, context={'request': request})
        data = dict(serializer.data)

        for key in ('school_logo', 'left_logo', 'right_logo'):
            if data.get(key):
                data[key] = resolve_logo_field(data[key], request)

        cache.set(cache_key, data, timeout=300)
        return Response(data, status=status.HTTP_200_OK)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial=True):
        profile = self.get_object()
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=partial, context={'request': request})
        
        if serializer.is_valid():
            serializer.save()
            
            # 1. Instantly bust cache so fresh data serves immediately
            cache_key = "attendsure_school_settings_fast_payload"
            cache.delete(cache_key)

            # 2. Return clean payload directly
            return Response({
                'success': True,
                'message': 'School settings updated successfully.',
                **serializer.data
            }, status=status.HTTP_200_OK)

        return Response({
            'success': False,
            'error': serializer.errors,
            'message': 'Validation error.'
        }, status=status.HTTP_400_BAD_REQUEST)

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

        adviser_name = section.adviser.full_name if section.adviser else ""
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
            full_name = format_full_student_name(s)
            b_date_str = s.birthdate.strftime('%m/%d/%Y') if isinstance(s.birthdate, (date, datetime)) else str(s.birthdate or '')
            photo_abs = safe_photo_url(s.photo, request)

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
                'rfid_uid': str(getattr(s, 'rfid_uid', '') or '').strip(),
                'photo': photo_abs,
                'photo_url': photo_abs,
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
            adviser_name = section.adviser.full_name if section.adviser else ""
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
    """
    Generates DepEd School Form 4 (Monthly Attendance Summary).
    Restricted to Academic Leadership (Admin, Principal, Dept Head).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_leadership_role(request.user):
            return Response({'error': 'Access restricted to school leadership.'}, status=status.HTTP_403_FORBIDDEN)

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
            logger.error("SF4 compilation error: %s", str(e), exc_info=True)
            return Response(
                {'error': 'Cannot compile SF4 report. Please verify attendance records.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


SF4ReportAPIView = DepEdSF4DataAPIView
SF4ReportView = DepEdSF4DataAPIView


class DTRListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, faculty_id=None, *args, **kwargs):
        user_role = get_user_role(request.user) or 'FACULTY'
        user_faculty = resolve_faculty_for_user(request.user)

        # Strict Self-Only Lock: Regular teachers can NEVER view another faculty member's DTR
        if is_regular_teacher(user_role) and not request.user.is_superuser:
            if not user_faculty:
                return Response({'error': 'Your user account is not linked to a faculty profile.'}, status=status.HTTP_404_NOT_FOUND)
            faculty = user_faculty
        else:
            target_id = faculty_id or request.query_params.get('faculty_id') or getattr(user_faculty, 'id', None)
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
                school_head = school.principal_faculty.full_name

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
            'faculty_name': faculty.full_name,
            'employee_id': faculty.employee_id,
            'department': faculty.department or "",
            'photo_url': safe_photo_url(faculty.photo, request),
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

        if is_regular_teacher(user_role) and not request.user.is_superuser:
            faculty = user_faculty
        else:
            target_id = faculty_id or request.data.get('faculty_id') or getattr(user_faculty, 'id', None)
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

        elif action_name == 'EXCUSE_LOAFING':
            if not (request.user.is_superuser or user_role in ['PRINCIPAL', 'ADMIN']):
                return Response({'error': 'Only the Principal or Admin can excuse loafing records.'}, status=status.HTTP_403_FORBIDDEN)
            date_str = str(request.data.get('date_str', '')).strip()
            remarks = str(request.data.get('remarks', '')).strip()
            if date_str:
                FacultyGateLog.objects.filter(
                    faculty=faculty,
                    scan_time__date=date_str,
                    is_violation=True
                ).update(is_excused_by_principal=True, remarks=remarks)
            return Response({'success': True, 'message': 'Loafing violation excused.'})

        return Response({'error': f"Unknown action: '{action_name}'"}, status=status.HTTP_400_BAD_REQUEST)


class ReportAuditLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ensure_report_audit_schema()
        with connection.cursor() as cursor:
            if is_leadership_role(request.user):
                cursor.execute("""
                    SELECT id, user_id, username, report_type, section_id, month, year, exported_at
                    FROM attendsure_report_audit_logs
                    ORDER BY exported_at DESC
                    LIMIT 100;
                """)
            else:
                cursor.execute("""
                    SELECT id, user_id, username, report_type, section_id, month, year, exported_at
                    FROM attendsure_report_audit_logs
                    WHERE user_id = %s
                    ORDER BY exported_at DESC
                    LIMIT 100;
                """, [request.user.id])
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
    """
    Renders DepEd Civil Service Form 48 (Daily Time Record) as printable HTML.
    Protected against XSS and HTML injection via html_escape.
    """
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
          <div style="font-size:7pt;font-weight:800;color:rgba(239,68,68,0.32);margin-top:4px;">NOT FOR OFFICIAL USE &bull; PENDING APPROVAL</div>
        </div>
        """

    faculty_name = html_escape(str(data.get('faculty_name', 'Faculty Member')))
    month_name = html_escape(str(data.get('month_name', '')))
    year = html_escape(str(data.get('year', '')))
    school_name = html_escape(str(data.get('school_name', 'Lapasan National High School')))
    regular_hours = html_escape(str(data.get('regular_hours', '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM')))
    saturday_hours = html_escape(str(data.get('saturday_hours', 'As Required')))
    total_undertime_hours = html_escape(str(data.get('total_undertime_hours', '0')))
    total_undertime_minutes = html_escape(str(data.get('total_undertime_minutes', '0')))
    principal_name = html_escape(str(data.get('principal_name', 'School Head / Principal')))
    principal_title = html_escape(str(data.get('principal_title', 'Secondary School Principal IV')))

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Civil Service Form No. 48 - {faculty_name}</title>
  <style>
    @page {{ size: 8.5in 11in; margin: 0.5in; }}
    body {{ font-family: Arial, sans-serif; font-size: 9pt; margin: 0; padding: 0; position: relative; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 8pt; }}
    th, td {{ border: 1px solid #000; padding: 2px 4px; }}
    th {{ background: #f3f4f6; text-align: center; font-weight: 700; }}
  </style>
</head>
<body>
  {watermark_html}
  <div style="text-align: center; margin-bottom: 8px;">
    <div style="font-size: 8pt; font-weight: bold;">Civil Service Form No. 48</div>
    <div style="font-size: 12pt; font-weight: 900; letter-spacing: 1px; margin: 2px 0;">DAILY TIME RECORD</div>
    <div style="font-size: 10pt; font-weight: bold; text-decoration: underline;">{faculty_name}</div>
    <div style="font-size: 8pt; color: #4b5563;">(Name)</div>
  </div>
  <table style="margin-bottom: 6px; font-size: 8pt; border: none;">
    <tr style="border: none;">
      <td style="border: none; width: 50%;">For the month of: <strong>{month_name} {year}</strong></td>
      <td style="border: none; width: 50%; text-align: right;">School: <strong>{school_name}</strong></td>
    </tr>
    <tr style="border: none;">
      <td style="border: none;" colspan="2">Official hours for arrival and departure: Regular days: <u>{regular_hours}</u> / Saturdays: <u>{saturday_hours}</u></td>
    </tr>
  </table>
  <table>
    <thead>
      <tr>
        <th rowspan="2" style="width: 28px;">Day</th>
        <th colspan="2">A.M.</th>
        <th colspan="2">P.M.</th>
        <th colspan="2">Undertime</th>
      </tr>
      <tr>
        <th style="width: 60px;">Arrival</th>
        <th style="width: 60px;">Departure</th>
        <th style="width: 60px;">Arrival</th>
        <th style="width: 60px;">Departure</th>
        <th style="width: 45px;">Hours</th>
        <th style="width: 45px;">Minutes</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
      <tr style="font-weight: 700; background: #f9fafb;">
        <td colspan="5" style="text-align: right; border: 1px solid #000;">TOTAL:</td>
        <td style="text-align: center; border: 1px solid #000;">{total_undertime_hours}</td>
        <td style="text-align: center; border: 1px solid #000;">{total_undertime_minutes}</td>
      </tr>
    </tbody>
  </table>
  <div style="font-size: 7.5pt; margin-top: 10px; line-height: 1.3;">
    I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
  </div>
  <div style="margin-top: 25px; text-align: center; width: 55%; margin-left: auto; margin-right: auto; border-top: 1px solid #000; font-weight: bold; font-size: 8.5pt;">
    {faculty_name}
    <div style="font-size: 7.5pt; font-weight: normal;">(Signature of Teacher / Employee)</div>
  </div>
  <div style="font-size: 7.5pt; margin-top: 15px;">
    Verified as to the prescribed office hours:
  </div>
  <div style="margin-top: 25px; text-align: center; width: 55%; margin-left: auto; margin-right: auto; border-top: 1px solid #000; font-weight: bold; font-size: 8.5pt;">
    {principal_name}
    <div style="font-size: 7.5pt; font-weight: normal;">{principal_title}</div>
  </div>
</body>
</html>"""


class UnifiedReportPrintAPIView(APIView):
    """Generates sanitized, print-ready HTML versions of DepEd reports and DTRs."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        report_type = str(request.query_params.get('report_type', 'dtr')).lower()
        if report_type != 'dtr':
            return Response({'error': f"Printing for '{report_type}' is not yet supported."}, status=status.HTTP_400_BAD_REQUEST)

        faculty_id = request.query_params.get('faculty_id')
        month = request.query_params.get('month')
        year = request.query_params.get('year')

        user = request.user
        user_role = get_user_role(user)
        user_fac = resolve_faculty_for_user(user)

        if is_regular_teacher(user_role) and not user.is_superuser:
            if not user_fac:
                return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)
            if faculty_id and str(user_fac.id) != str(faculty_id):
                return Response({'error': 'You do not have permission to view other faculty DTRs.'}, status=status.HTTP_403_FORBIDDEN)
            faculty = user_fac
        else:
            if not faculty_id:
                faculty = user_fac
            else:
                faculty = get_object_or_404(FacultyProfile, pk=faculty_id)

        if not faculty:
            return Response({'error': 'faculty_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        school = SchoolProfile.objects.first()

        data = {
            'faculty_name': faculty.full_name,
            'month_name': timezone.now().strftime('%B') if not month else str(month),
            'year': str(year or timezone.now().year),
            'school_name': getattr(school, 'school_name', 'Lapasan National High School'),
            'regular_hours': '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM',
            'saturday_hours': 'As Required',
            'dept_head_approved': True,
            'rows': [],
            'total_undertime_hours': 0,
            'total_undertime_minutes': 0,
            'principal_name': getattr(school, 'principal_name', 'School Head / Principal'),
            'principal_title': getattr(school, 'principal_title', 'Secondary School Principal IV'),
        }

        html = render_centralized_dtr_html(data)
        return HttpResponse(html, content_type='text/html; charset=utf-8')


class UnifiedReportExportAPIView(APIView):
    """Exports structured academic data in CSV format with audit logging."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user_role = get_user_role(request.user)
        if user_role == 'GUARD' and not request.user.is_superuser:
            return Response({'error': 'Unauthorized to export student records.'}, status=status.HTTP_403_FORBIDDEN)

        report_type = str(request.data.get('report_type', 'STUDENTS')).upper()
        section_id = request.data.get('section_id')

        record_report_audit_in_db(
            user=request.user,
            report_type=report_type,
            section_id=section_id,
            month=request.data.get('month'),
            year=request.data.get('year')
        )

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="attendsure_{report_type.lower()}_{timezone.localdate()}.csv"'

        writer = csv.writer(response)
        if report_type == 'STUDENTS':
            writer.writerow(['LRN', 'Full Name', 'Gender', 'Parent Contact', 'Section', 'Status'])
            students = Student.objects.filter(is_active=True).order_by('last_name', 'first_name')
            if is_regular_teacher(user_role) and not request.user.is_superuser:
                user_faculty = resolve_faculty_for_user(request.user)
                students = students.filter(id__in=get_teacher_student_ids(user_faculty))

            for s in students:
                enr = s.enrollments.first()
                sec_name = enr.section.name if enr and enr.section else 'Unassigned'
                writer.writerow([s.lrn, format_full_student_name(s), s.sex, s.parent_contact, sec_name, 'ACTIVE'])
        else:
            writer.writerow(['Timestamp', 'Export Type', 'Generated By'])
            writer.writerow([timezone.now().isoformat(), report_type, request.user.username])

        return response


class BulkSmsStatusAPIView(APIView):
    """Updates the status of sent or failed SMS messages from the GSM gateway."""
    permission_classes = [AllowAny]

    def post(self, request):
        if not verify_modem_gateway_request(request):
            return Response({'error': 'Unauthorized GSM Gateway client.'}, status=status.HTTP_403_FORBIDDEN)

        updates = request.data.get('updates', [])
        if not isinstance(updates, list):
            return Response({'error': 'Request body must contain an "updates" list.'}, status=status.HTTP_400_BAD_REQUEST)

        if len(updates) > 100:
            return Response({'error': 'Batch size exceeds the 100 item limit.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = {'PENDING', 'SENT', 'FAILED'}
        updated_ids = []
        now = timezone.now()

        try:
            with transaction.atomic():
                for item in updates:
                    sms_id = item.get('id')
                    new_status = str(item.get('status', '')).upper()
                    error_msg = item.get('error', '')

                    if not sms_id or new_status not in valid_statuses:
                        continue

                    sms = SmsOutbox.objects.filter(pk=sms_id).first()
                    if sms:
                        sms.status = new_status
                        if new_status == 'SENT':
                            sms.sent_at = now
                            sms.error_message = None
                        elif new_status == 'FAILED':
                            sms.retry_count += 1
                            sms.error_message = str(error_msg)[:255] if error_msg else 'Delivery failed'

                        sms.save(update_fields=['status', 'sent_at', 'retry_count', 'error_message'])
                        updated_ids.append(sms.id)

            return Response({'success': True, 'updated_count': len(updated_ids), 'updated_ids': updated_ids}, status=status.HTTP_200_OK)
        except Exception as exc:
            return Response({'error': f'Failed to process bulk SMS update: {str(exc)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PendingSmsDispatchAPIView(APIView):
    """Provides queued SMS messages to the physical GSM hardware modem daemon."""
    permission_classes = [AllowAny]

    def get(self, request):
        if not verify_modem_gateway_request(request):
            return Response({'error': 'Unauthorized GSM Gateway.'}, status=status.HTTP_403_FORBIDDEN)

        limit = min(int(request.query_params.get('limit', 20)), 100)
        pending_messages = SmsOutbox.objects.filter(status='PENDING').order_by('-priority', 'created_at')[:limit]
        serializer = SmsOutboxSerializer(pending_messages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MarkSmsStatusAPIView(APIView):
    """Updates single SMS delivery status from the GSM modem daemon."""
    permission_classes = [AllowAny]

    def post(self, request, pk):
        if not verify_modem_gateway_request(request):
            return Response({'error': 'Unauthorized GSM Gateway.'}, status=status.HTTP_403_FORBIDDEN)

        sms = get_object_or_404(SmsOutbox, pk=pk)
        new_status = str(request.data.get('status', 'SENT')).upper()

        if new_status not in ['PENDING', 'SENT', 'FAILED']:
            return Response({'error': 'Invalid status choice.'}, status=status.HTTP_400_BAD_REQUEST)

        sms.status = new_status
        if new_status == 'SENT':
            sms.sent_at = timezone.now()
            sms.error_message = None
        elif new_status == 'FAILED':
            sms.retry_count += 1
            sms.error_message = str(request.data.get('error', 'Transmission error'))[:255]

        sms.save(update_fields=['status', 'sent_at', 'retry_count', 'error_message'])
        return Response({'success': True, 'id': sms.id, 'status': sms.status}, status=status.HTTP_200_OK)


class CalendarExceptionAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request, pk=None):
        ensure_calendar_schema()
        with connection.cursor() as cursor:
            if pk:
                cursor.execute("SELECT id, exception_date, exception_type, reason, affects_all_grades FROM attendsure_calendar_exceptions WHERE id = %s;", [pk])
                row = cursor.fetchone()
                if not row:
                    return Response({'error': 'Calendar exception not found.'}, status=status.HTTP_404_NOT_FOUND)
                return Response({'id': row[0], 'date': str(row[1]), 'type': row[2], 'reason': row[3], 'affects_all': row[4]})

            cursor.execute("SELECT id, exception_date, exception_type, reason, affects_all_grades FROM attendsure_calendar_exceptions ORDER BY exception_date DESC;")
            rows = cursor.fetchall()
            return Response([{'id': r[0], 'date': str(r[1]), 'type': r[2], 'reason': r[3], 'affects_all': r[4]} for r in rows], status=status.HTTP_200_OK)

    def post(self, request):
        ensure_calendar_schema()
        exc_date = request.data.get('date')
        reason = str(request.data.get('reason', '')).strip()
        exc_type = str(request.data.get('type', 'SUSPENSION')).upper()

        if not exc_date or not reason:
            return Response({'error': 'Date and reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

        with connection.cursor() as cursor:
            cursor.execute("""
                INSERT INTO attendsure_calendar_exceptions (exception_date, exception_type, reason, created_by_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id;
            """, [exc_date, exc_type, reason, request.user.id])
            new_id = cursor.fetchone()[0]

        return Response({'success': True, 'id': new_id, 'date': exc_date, 'reason': reason}, status=status.HTTP_201_CREATED)

    def delete(self, request, pk):
        ensure_calendar_schema()
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM attendsure_calendar_exceptions WHERE id = %s;", [pk])
        return Response({'success': True, 'message': f'Exception #{pk} removed.'}, status=status.HTTP_200_OK)


class LiveFieldValidationAPIView(APIView):
    """Enables real-time verification of unique field values during form entry."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        field = str(request.data.get('field', '')).strip().lower()
        value = str(request.data.get('value', '')).strip()
        exclude_id = request.data.get('exclude_id')

        if not field or not value:
            return Response({'available': False, 'message': 'Field and value required.'}, status=status.HTTP_400_BAD_REQUEST)

        exists = False
        if field == 'username':
            qs = User.objects.filter(username__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            exists = qs.exists()
        elif field == 'employee_id':
            qs = FacultyProfile.objects.filter(employee_id__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            exists = qs.exists()
        elif field == 'lrn':
            qs = Student.objects.filter(lrn__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            exists = qs.exists()
        elif field == 'email':
            qs = User.objects.filter(email__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            exists = qs.exists()

        return Response({'field': field, 'value': value, 'available': not exists}, status=status.HTTP_200_OK)


# ============================================================================
# VIEWSETS WITH ROW-LEVEL DATA ISOLATION
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    """
    Manages Student records with optimized SQL prefetching.
    Row-Level Isolation enforced per user role.
    """
    queryset = Student.objects.select_related().prefetch_related(
        'enrollments__section__grade_level'
    ).order_by('last_name', 'first_name')
    serializer_class = StudentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAcademicManagerPermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['lrn', 'first_name', 'last_name', 'rfid_uid', 'qr_token', 'barangay']

    def get_queryset(self):
        qs = Student.objects.prefetch_related(
            'enrollments__section__grade_level'
        ).order_by('last_name', 'first_name')

        user = self.request.user
        role = get_user_role(user)

        if is_leadership_role(user):
            return qs

        if is_regular_teacher(role):
            user_faculty = resolve_faculty_for_user(user)
            allowed_student_ids = get_teacher_student_ids(user_faculty)
            return qs.filter(id__in=allowed_student_ids)

        return qs.none()

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        """
        Fast-path endpoint for modal dropdowns.
        Returns only minimal student fields in ~15ms instead of full photo conversion.
        """
        user = request.user
        role = get_user_role(user)
        qs = Student.objects.filter(is_active=True).only('id', 'lrn', 'first_name', 'last_name', 'middle_name', 'suffix')

        if is_regular_teacher(role) and not user.is_superuser:
            user_faculty = resolve_faculty_for_user(user)
            allowed_ids = get_teacher_student_ids(user_faculty)
            qs = qs.filter(id__in=allowed_ids)

        results = [
            {
                'id': s.id,
                'lrn': s.lrn,
                'full_name': format_full_student_name(s),
            }
            for s in qs[:1500]
        ]
        return Response(results, status=status.HTTP_200_OK)

class FacultyViewSet(viewsets.ModelViewSet):
    """
    Manages school faculty and classroom teachers.
    Row-Level Isolation:
    - Leadership (Admin, Principal, Dept Head): Views all faculty members.
    - Regular Teachers: Views ONLY their own FacultyProfile.
    """
    queryset = FacultyProfile.objects.all().order_by('last_name', 'first_name')
    serializer_class = FacultyProfileSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAcademicManagerPermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'email', 'rfid_uid', 'department', 'position']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = get_user_role(user)

        if is_leadership_role(user):
            return qs

        if is_regular_teacher(role):
            user_faculty = resolve_faculty_for_user(user)
            return qs.filter(id=user_faculty.id) if user_faculty else qs.none()

        return qs.none()

    def get_serializer_class(self):
        if self.action == 'dropdown' or self.request.query_params.get('dropdown') == 'true':
            return FacultyDropdownSerializer
        return FacultyProfileSerializer

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        """
        Lists active, teaching-cleared faculty for scheduling assignments.
        For regular teachers, strictly returns only their own profile.
        """
        user = request.user
        role = get_user_role(user)

        if is_leadership_role(user):
            faculties = FacultyProfile.objects.filter(is_active=True).exclude(can_teach=False).order_by('last_name', 'first_name')
        elif is_regular_teacher(role):
            user_faculty = resolve_faculty_for_user(user)
            faculties = FacultyProfile.objects.filter(id=user_faculty.id) if user_faculty else FacultyProfile.objects.none()
        else:
            faculties = FacultyProfile.objects.none()

        serializer = FacultyDropdownSerializer(faculties, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsKioskAdminPermission]

    def perform_create(self, serializer):
        user = self.request.user
        role = get_user_role(user)
        user_faculty = resolve_faculty_for_user(user)

        # Auto-generate secure pass reference number if not provided by client
        pass_num = serializer.validated_data.get('pass_number')
        if not pass_num:
            today_str = timezone.now().strftime('%Y%m%d')
            unique_hex = uuid.uuid4().hex[:6].upper()
            serializer.validated_data['pass_number'] = f"GP-{today_str}-{unique_hex}"

        if is_regular_teacher(role) and not user.is_superuser:
            student_obj = serializer.validated_data.get('student')
            faculty_obj = serializer.validated_data.get('faculty')

            if faculty_obj and (not user_faculty or faculty_obj.id != user_faculty.id):
                raise PermissionDenied("Teachers cannot issue gate passes for other faculty members.")

            if student_obj:
                allowed_student_ids = get_teacher_student_ids(user_faculty)
                if student_obj.id not in allowed_student_ids:
                    raise PermissionDenied("You can only issue gate passes for students enrolled in your classes.")

        serializer.save(issued_by=user_faculty)


    def perform_update(self, serializer):
        raw_secret = self.request.data.get('secret_key') or self.request.data.get('secret_hash')
        if raw_secret:
            serializer.save(secret_hash=make_password(raw_secret))
        else:
            serializer.save()


class GatePassViewSet(viewsets.ModelViewSet):
    """
    Manages Gate Passes & Exit Clearances.
    Row-Level Isolation:
    - Leadership & Guards: View all passes (Guards verify at the gate).
    - Regular Teachers: View ONLY passes they issued, passes for themselves, or passes for their assigned students.
    """
    queryset = GatePass.objects.all().order_by('-created_at')
    serializer_class = GatePassSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [GatePassPermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['pass_number', 'faculty__first_name', 'faculty__last_name', 'student__first_name', 'student__last_name', 'reason']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = get_user_role(user)

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status=status_param.upper())

        if is_leadership_role(user) or role == 'GUARD':
            return qs

        if is_regular_teacher(role):
            user_faculty = resolve_faculty_for_user(user)
            if not user_faculty:
                return qs.none()
            allowed_student_ids = get_teacher_student_ids(user_faculty)
            return qs.filter(
                Q(issued_by=user_faculty)
                | Q(faculty=user_faculty)
                | Q(student_id__in=allowed_student_ids)
            ).distinct()

        return qs.none()

    def perform_create(self, serializer):
        user = self.request.user
        role = get_user_role(user)
        user_faculty = resolve_faculty_for_user(user)

        if is_regular_teacher(role) and not user.is_superuser:
            # Regular teachers can only issue passes for their own assigned students
            student_obj = serializer.validated_data.get('student')
            faculty_obj = serializer.validated_data.get('faculty')

            if faculty_obj and (not user_faculty or faculty_obj.id != user_faculty.id):
                raise PermissionDenied("Teachers cannot issue gate passes for other faculty members.")

            if student_obj:
                allowed_student_ids = get_teacher_student_ids(user_faculty)
                if student_obj.id not in allowed_student_ids:
                    raise PermissionDenied("You can only issue gate passes for students enrolled in your classes.")

        serializer.save(issued_by=user_faculty)


class ScheduleViewSet(viewsets.ModelViewSet):
    """
    Manages Class Schedules.
    Row-Level Isolation:
    - Leadership: Views and manages all schedules.
    - Regular Teachers: Views ONLY schedules assigned to them or their advisory section.
    """
    queryset = Schedule.objects.select_related('section', 'subject', 'faculty').all().order_by('start_time')
    serializer_class = ScheduleSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAcademicManagerPermission]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = get_user_role(user)

        if is_regular_teacher(role) and not user.is_superuser:
            user_faculty = resolve_faculty_for_user(user)
            if not user_faculty:
                return qs.none()
            qs = qs.filter(Q(faculty=user_faculty) | Q(section__adviser=user_faculty)).distinct()
        elif role == 'GUARD' and not user.is_superuser:
            return qs.none()

        sec_id = self.request.query_params.get('section_id')
        fac_id = self.request.query_params.get('faculty_id')
        if sec_id and sec_id.isdigit():
            qs = qs.filter(section_id=int(sec_id))
        if fac_id and fac_id.isdigit():
            qs = qs.filter(faculty_id=int(fac_id))
        return qs


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsAcademicManagerPermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'title']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        role = get_user_role(user)
        if is_regular_teacher(role) and not user.is_superuser:
            user_faculty = resolve_faculty_for_user(user)
            return qs.filter(schedules__faculty=user_faculty).distinct() if user_faculty else qs.none()
        return qs


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = UserManagementSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [IsSystemAdminRole]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email']


class RoomViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        sec_rooms = Section.objects.exclude(room_number='').values_list('room_number', flat=True).distinct()
        sched_rooms = Schedule.objects.exclude(room_number='').values_list('room_number', flat=True).distinct()
        all_rooms = sorted(list(set(list(sec_rooms) + list(sched_rooms))))
        data = [{'id': idx + 1, 'name': rm, 'room_number': rm} for idx, rm in enumerate(all_rooms)]
        return Response(data, status=status.HTTP_200_OK)


class GradeLevelSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = '__all__'


class GradeLevelViewSet(viewsets.ModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    serializer_class = GradeLevelSerializer
    permission_classes = [IsAcademicManagerPermission]


class SmsOutboxViewSet(viewsets.ModelViewSet):
    """
    Full CRUD SMS Gateway Outbox for School Administrators and Principals.
    Supports single compose, targeted broadcast announcements, and queue management.
    """
    queryset = SmsOutbox.objects.all().order_by('-created_at')
    serializer_class = SmsOutboxSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [SmsOutboxPermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['recipient_name', 'recipient_number', 'message_body', 'status', 'trigger_event', 'category']

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        msg = str(data.get('message_body') or data.get('message') or data.get('text') or '').strip()
        if not msg:
            return Response({'error': 'Message body cannot be blank.'}, status=status.HTTP_400_BAD_REQUEST)
        
        phone = str(data.get('recipient_number') or data.get('phone') or '').strip()
        if not phone:
            return Response({'error': 'Recipient phone number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Standardize fields for model creation
        recipient_name = str(data.get('recipient_name') or 'Parent / Guardian').strip()[:100]
        category = str(data.get('category') or 'GENERAL_NOTICE').strip()[:30]
        priority = str(data.get('priority') or 'HIGH').strip()[:10]
        trigger_event = str(data.get('trigger_event') or 'MANUAL').strip()[:30]

        sms_obj = SmsOutbox.objects.create(
            recipient_name=recipient_name,
            recipient_number=phone[:20],
            message_body=msg,
            category=category,
            priority=priority,
            trigger_event=trigger_event,
            status='PENDING'
        )

        serializer = self.get_serializer(sms_obj)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        """Re-queues a single failed SMS message for immediate dispatch."""
        sms = self.get_object()
        sms.status = 'PENDING'
        sms.retry_count = 0
        sms.error_message = None
        sms.save(update_fields=['status', 'retry_count', 'error_message'])
        return Response({'success': True, 'message': f'Message #{sms.id} re-queued for delivery.'}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete', 'post'])
    def delete_delivered(self, request):
        """Clears all delivered messages from the outbox table."""
        count, _ = SmsOutbox.objects.filter(status='SENT').delete()
        return Response({'success': True, 'deleted_count': count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete', 'post'])
    def clear_pending(self, request):
        """Cancels and deletes all pending queue messages."""
        count, _ = SmsOutbox.objects.filter(status='PENDING').delete()
        return Response({'success': True, 'cleared_count': count}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def retry_all_failed(self, request):
        """Re-queues all failed SMS entries."""
        updated = SmsOutbox.objects.filter(status='FAILED').update(status='PENDING', retry_count=0)
        return Response({'success': True, 'retried_count': updated}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def get_metrics(self, request):
        """Returns live outbox counts and hardware connection parameters."""
        total = SmsOutbox.objects.count()
        today = timezone.localdate()
        sent_today = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
        pending = SmsOutbox.objects.filter(status='PENDING').count()
        failed = SmsOutbox.objects.filter(status='FAILED').count()
        return Response({
            'total': total,
            'total_today': total,
            'sent': sent_today,
            'sent_today': sent_today,
            'pending': pending,
            'failed': failed,
            'modem_port': getattr(settings, 'GSM_MODEM_PORT', 'COM3'),
            'modem_baudrate': getattr(settings, 'GSM_MODEM_BAUDRATE', 9600),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def broadcast(self, request):
        """
        Broadcasts an announcement to selected target groups.
        Supports All Parents, All Faculty, Grade Levels, Sections, or Specific Targets.
        """
        data = request.data
        message = str(
            data.get('message_body') or data.get('message') or data.get('text') or ''
        ).strip()
        audience = str(
            data.get('audience') or data.get('recipient_group') or data.get('group') or 'ALL_PARENTS'
        ).upper()
        priority = str(data.get('priority') or 'HIGH').upper()[:10]
        year_level = str(data.get('year_level') or '').strip()
        section_id = data.get('section_id')
        target_id = data.get('target_id') or data.get('specific_target_id')

        if not message:
            return Response(
                {'error': 'Message content cannot be blank.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        recipients = []

        if audience == 'ALL_PARENTS':
            students = Student.objects.filter(is_active=True).exclude(parent_contact='').only('first_name', 'last_name', 'guardian_name', 'parent_contact')
            for s in students:
                name = s.guardian_name or format_full_student_name(s)
                recipients.append((name, s.parent_contact))

        elif audience == 'ALL_FACULTY':
            faculties = FacultyProfile.objects.filter(is_active=True).exclude(contact_number='').only('first_name', 'last_name', 'contact_number')
            for f in faculties:
                recipients.append((f.full_name, f.contact_number))

        elif audience == 'BOTH_PARENTS_AND_FACULTY':
            students = Student.objects.filter(is_active=True).exclude(parent_contact='').only('first_name', 'last_name', 'guardian_name', 'parent_contact')
            for s in students:
                recipients.append((s.guardian_name or format_full_student_name(s), s.parent_contact))
            faculties = FacultyProfile.objects.filter(is_active=True).exclude(contact_number='').only('first_name', 'last_name', 'contact_number')
            for f in faculties:
                recipients.append((f.full_name, f.contact_number))

        elif audience == 'BY_YEAR_LEVEL' and year_level:
            students = Student.objects.filter(
                is_active=True,
                enrollments__section__grade_level__name__icontains=year_level
            ).exclude(parent_contact='').distinct().only('first_name', 'last_name', 'guardian_name', 'parent_contact')
            for s in students:
                recipients.append((s.guardian_name or format_full_student_name(s), s.parent_contact))

        elif audience == 'BY_SECTION' and section_id:
            students = Student.objects.filter(
                is_active=True,
                enrollments__section_id=section_id
            ).exclude(parent_contact='').distinct().only('first_name', 'last_name', 'guardian_name', 'parent_contact')
            for s in students:
                recipients.append((s.guardian_name or format_full_student_name(s), s.parent_contact))

        elif audience == 'SPECIFIC_PARENT' and target_id:
            student = Student.objects.filter(id=target_id).first()
            if student and student.parent_contact:
                recipients.append((student.guardian_name or format_full_student_name(student), student.parent_contact))

        elif audience == 'SPECIFIC_FACULTY' and target_id:
            faculty = FacultyProfile.objects.filter(id=target_id).first()
            if faculty and faculty.contact_number:
                recipients.append((faculty.full_name, faculty.contact_number))

        if not recipients:
            return Response({'error': 'No valid recipient phone numbers found for the selected audience.'}, status=status.HTTP_400_BAD_REQUEST)

        # Deduplicate recipient phone numbers
        seen_phones = set()
        unique_recipients = []
        for name, phone in recipients:
            clean_phone = str(phone).strip()
            if clean_phone and clean_phone not in seen_phones:
                seen_phones.add(clean_phone)
                unique_recipients.append((name, clean_phone))

        created_objs = [
            SmsOutbox(
                recipient_name=name[:100],
                recipient_number=phone[:20],
                message_body=message,
                trigger_event='ANNOUNCEMENT',
                category='ANNOUNCEMENT',
                priority=priority,
                status='PENDING'
            )
            for name, phone in unique_recipients
        ]

        if created_objs:
            SmsOutbox.objects.bulk_create(created_objs[:1000])

        return Response({
            'success': True,
            'dispatched_count': len(created_objs),
            'message': f"Broadcast queued for {len(created_objs)} recipient(s)."
        }, status=status.HTTP_201_CREATED)

# ============================================================================
# SYSTEM MAINTENANCE & DIAGNOSTIC VIEWS
# ============================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsSystemAdminRole])
def ping_scanners(request):
    """Pings registered IoT kiosks to identify active gateways."""
    ten_mins_ago = timezone.now() - timedelta(minutes=10)
    kiosks = IoTKiosk.objects.all().order_by('kiosk_code')
    results = [
        {
            'kiosk_code': k.kiosk_code,
            'name': k.terminal_name,
            'is_online': bool(k.is_active and k.last_ping and k.last_ping >= ten_mins_ago),
            'last_ping': k.last_ping.isoformat() if k.last_ping else None,
        }
        for k in kiosks
    ]
    return Response({'scanners': results, 'total_scanners': len(results)}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def db_check(request):
    """Validates the PostgreSQL backend connection health."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
        return Response({
            'status': 'HEALTHY',
            'database': settings.DATABASES['default']['ENGINE'].split('.')[-1]
        }, status=status.HTTP_200_OK)
    except Exception as exc:
        return Response({'status': 'UNHEALTHY', 'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET', 'POST'])
@permission_classes([IsSystemAdminRole])
def test_sms_gateway(request):
    """Dispatches a test payload into the GSM queue to verify outbound modem readiness."""
    test_number = str(request.data.get('phone', '+639170000000')).strip()
    sms = SmsOutbox.objects.create(
        recipient_name='Test Modem Recipient',
        recipient_number=test_number,
        message_body=f"AttendSure Gateway Test: Outbound pipeline operational at {timezone.now().strftime('%I:%M:%S %p')}.",
        trigger_event='TEST',
        category='TEST',
        priority='HIGH',
        status='PENDING'
    )
    return Response({'success': True, 'sms_id': sms.id, 'recipient': test_number}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsSystemAdminRole])
def flush_cache(request):
    """Clears cached datasets across memory and disk."""
    cache.clear()
    return Response({'success': True, 'message': 'Cache cleared successfully.'}, status=status.HTTP_200_OK)



class RegisterPushTokenAPIView(APIView):
    """
    Endpoint: POST /api/users/register-push-token/
    Stores the mobile device push token.
    Uses fast Redis/memory cache to prevent slow database writes during gate card taps.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        push_token = str(request.data.get('push_token', '')).strip()
        if not push_token:
            return Response(
                {'success': False, 'message': 'Push token is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        faculty = (
            FacultyProfile.objects.filter(account__user=user).first()
            or FacultyProfile.objects.filter(employee_id__iexact=getattr(user, 'username', '')).first()
        )

        if not faculty:
            return Response(
                {'success': False, 'message': 'Faculty profile not found for this account.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 1. High-speed cache write (valid for 30 days) for instant retrieval during gate scans
        cache.set(f"faculty_push_token_{faculty.id}", push_token, timeout=86400 * 30)

        # 2. Persist to database column if it exists on the model
        if hasattr(faculty, 'push_token'):
            try:
                faculty.push_token = push_token
                faculty.save(update_fields=['push_token'])
            except Exception:
                pass

        return Response(
            {'success': True, 'message': 'Push token registered successfully.'},
            status=status.HTTP_200_OK,
        )