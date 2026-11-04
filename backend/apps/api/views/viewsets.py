"""
AttendSure V3 - Complete Role-Based Core API ViewSets
File: backend/apps/api/views/viewsets.py
"""

import secrets
from datetime import datetime
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db.models import Q, Prefetch
from django.core.cache import cache
from django.http import Http404
from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.academics.models import (
    Room,
    GradeLevel,
    AcademicYear,
    Subject,
    Section,
    Schedule,
    Student,
    FacultyProfile,
    IoTKiosk,
    GatePass,
    SmsOutbox,
    Enrollment,
)
from apps.api.serializers import (
    RoomSerializer,
    GradeLevelSerializer,
    AcademicYearSerializer,
    SubjectSerializer,
    SectionSerializer,
    ScheduleSerializer,
    EnrollmentSerializer,
    StudentSerializer,
    FacultyProfileSerializer,
    FacultyDropdownSerializer,
    IoTKioskSerializer,
    GatePassSerializer,
    UserManagementSerializer,
    SmsOutboxSerializer,
)
from apps.common.utils import (
    get_user_role,
    is_regular_teacher,
    is_leadership_role,
    format_full_student_name,
)
from .common import (
    resolve_faculty_for_user,
    get_teacher_student_ids,
    get_teacher_section_ids,
)

User = get_user_model()


# ==============================================================================
# PAGINATION CONFIGURATION
# ==============================================================================

class AttendSurePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def get_page_size(self, request):
        val = request.query_params.get(self.page_size_query_param)
        if val and str(val).upper() in ('ALL', 'MAX', '1000'):
            return 1000
        return super().get_page_size(request)


# ==============================================================================
# SECURITY RULES & PERMISSIONS
# ==============================================================================

def check_admin_permission(user):
    if not user or not user.is_authenticated:
        raise PermissionDenied("You must log in first.")
    if user.is_superuser:
        return True
    role = get_user_role(user)
    if role not in ('ADMIN', 'SUPERADMIN'):
        raise PermissionDenied("Only System Administrators can perform this action.")
    return True


def check_academic_admin_permission(user):
    if not user or not user.is_authenticated:
        raise PermissionDenied("You must log in first.")
    if user.is_superuser:
        return True
    role = get_user_role(user)
    if role not in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD'):
        raise PermissionDenied("Only school managers can change this record.")
    return True


def check_student_manager_permission(user):
    if not user or not user.is_authenticated:
        raise PermissionDenied("You must log in first.")
    if user.is_superuser:
        return True
    role = get_user_role(user)
    if role not in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR'):
        raise PermissionDenied("Only authorized staff can manage students.")
    return True


# ==============================================================================
# 1. ACADEMIC & PHYSICAL STRUCTURE VIEWSETS
# ==============================================================================

class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.filter(is_active=True).order_by('name')
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'building']

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


class GradeLevelViewSet(viewsets.ModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    serializer_class = GradeLevelSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all().order_by('-start_date')
    serializer_class = AcademicYearSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

    def perform_create(self, serializer):
        check_admin_permission(self.request.user)
        instance = serializer.save()
        if instance.is_active:
            AcademicYear.objects.exclude(id=instance.id).update(is_active=False)

    def perform_update(self, serializer):
        check_admin_permission(self.request.user)
        instance = serializer.save()
        if instance.is_active:
            AcademicYear.objects.exclude(id=instance.id).update(is_active=False)

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        if instance.is_active:
            raise ValidationError("You cannot delete the active Academic Year.")
        instance.delete()


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'title']

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


class SectionViewSet(viewsets.ModelViewSet):
    serializer_class = SectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code', 'room_number', 'adviser__first_name', 'adviser__last_name']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = Section.objects.select_related(
            'grade_level', 'academic_year', 'adviser', 'room'
        ).order_by('grade_level__level_order', 'name')

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                return qs.filter(Q(adviser=faculty) | Q(schedules__faculty=faculty)).distinct()
            return Section.objects.none()
        return qs

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        ay = serializer.validated_data.get('academic_year') or AcademicYear.objects.filter(is_active=True).first()
        serializer.save(academic_year=ay)

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        qs = self.get_queryset().values(
            'id', 'name', 'grade_level__name', 'adviser__first_name', 'adviser__last_name'
        )
        data = [
            {
                'id': s['id'],
                'name': s['name'],
                'grade_level': s['grade_level__name'] or '',
                'adviser_name': f"{s['adviser__first_name'] or ''} {s['adviser__last_name'] or ''}".strip(),
            }
            for s in qs
        ]
        return Response(data, status=status.HTTP_200_OK)


# ==============================================================================
# 2. SCHEDULE VIEWSET (CORRECT SCHEDULE METRICS & CONFLICT VALIDATION)
# ==============================================================================

class ScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['section__name', 'subject__code', 'subject__title', 'faculty__first_name', 'faculty__last_name']

    def get_queryset(self):
        qs = Schedule.objects.select_related(
            'section', 'subject', 'faculty', 'room'
        ).prefetch_related('days').order_by('start_time')

        user = self.request.user
        role = get_user_role(user)
        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                sec_ids = get_teacher_section_ids(faculty)
                qs = qs.filter(Q(faculty=faculty) | Q(section_id__in=sec_ids))
            else:
                return Schedule.objects.none()
        return qs

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        """Returns accurate schedule, room, and timetable slot metrics."""
        qs = self.get_queryset()
        return Response({
            'total_periods': qs.count(),
            'scheduled_sections': qs.values('section').distinct().count(),
            'assigned_teachers': qs.exclude(faculty__isnull=True).values('faculty').distinct().count(),
            'occupied_rooms': qs.exclude(Q(room__isnull=True) & Q(room_number='')).values('room', 'room_number').distinct().count(),
        }, status=status.HTTP_200_OK)

    def _validate_conflicts(self, validated_data, instance=None):
        """Validates timetable overlaps safely, using existing instance values on partial updates."""
        start = validated_data.get('start_time') or (instance.start_time if instance else None)
        end = validated_data.get('end_time') or (instance.end_time if instance else None)

        if not start or not end:
            return

        if start >= end:
            raise ValidationError({'time': 'Start time must be earlier than end time.'})

        faculty = validated_data.get('faculty') if 'faculty' in validated_data else (instance.faculty if instance else None)
        section = validated_data.get('section') if 'section' in validated_data else (instance.section if instance else None)
        room = validated_data.get('room') if 'room' in validated_data else (getattr(instance, 'room', None) if instance else None)
        room_num = validated_data.get('room_number') if 'room_number' in validated_data else (getattr(instance, 'room_number', '') if instance else '')

        clashes = []
        qs = Schedule.objects.select_related('faculty', 'section', 'subject')
        if instance:
            qs = qs.exclude(id=instance.id)

        time_overlaps = qs.filter(start_time__lt=end, end_time__gt=start)

        if faculty:
            fac_clash = time_overlaps.filter(faculty=faculty).first()
            if fac_clash:
                clashes.append(f"Teacher Conflict: {faculty.full_name} is already teaching Section {fac_clash.section.name}.")

        if section:
            sec_clash = time_overlaps.filter(section=section).first()
            if sec_clash:
                clashes.append(f"Section Conflict: Section {section.name} already has a subject at this time.")

        if room:
            room_clash = time_overlaps.filter(room=room).first()
            if room_clash:
                clashes.append(f"Room Conflict: {room.name} is already in use by Section {room_clash.section.name}.")
        elif room_num:
            room_clash = time_overlaps.filter(room_number__iexact=str(room_num).strip()).first()
            if room_clash:
                clashes.append(f"Room Conflict: {room_num} is already in use by Section {room_clash.section.name}.")

        if clashes:
            raise ValidationError({'conflict': clashes})

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        self._validate_conflicts(serializer.validated_data)
        serializer.save()

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        self._validate_conflicts(serializer.validated_data, instance=serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


# ==============================================================================
# 3. STUDENT VIEWSET (FAST QUERY OPTIMIZATION)
# ==============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name', 'rfid_uid', 'qr_token', 'parent_contact']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        active_enrollments_query = Prefetch(
            'enrollments',
            queryset=Enrollment.objects.filter(status='ENROLLED').select_related(
                'section', 'section__grade_level', 'academic_year'
            )
        )

        qs = Student.objects.filter(is_active=True).prefetch_related(
            active_enrollments_query
        ).order_by('last_name', 'first_name')

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            student_ids = get_teacher_student_ids(faculty)
            qs = qs.filter(id__in=student_ids)

        section_id = self.request.query_params.get('section_id') or self.request.query_params.get('section')
        if section_id:
            qs = qs.filter(enrollments__section_id=section_id, enrollments__status='ENROLLED')

        return qs.distinct()

    def perform_create(self, serializer):
        check_student_manager_permission(self.request.user)
        serializer.save(created_by=self.request.user, updated_by=self.request.user, is_active=True)

    def perform_update(self, serializer):
        check_student_manager_permission(self.request.user)
        serializer.save(updated_by=self.request.user)

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'active': qs.filter(is_active=True).count(),
            'paired': qs.exclude(Q(rfid_uid__isnull=True) | Q(rfid_uid='')).count(),
            'total_sections': Section.objects.count(),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        qs = self.get_queryset().values(
            'id', 'lrn', 'first_name', 'middle_name', 'last_name', 'suffix'
        )[:300]
        data = [
            {
                'id': s['id'],
                'lrn': s['lrn'],
                'full_name': " ".join(
                    filter(None, [s['first_name'], s['middle_name'], s['last_name'], s['suffix']])
                ).strip(),
            }
            for s in qs
        ]
        return Response(data, status=status.HTTP_200_OK)


# ==============================================================================
# 4. FACULTY PROFILE VIEWSET (SELF-EDITING & DEVICE RESET)
# ==============================================================================

class FacultyProfileViewSet(viewsets.ModelViewSet):
    queryset = FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name')
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'department', 'position', 'rfid_uid']

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save(is_active=True)

    def perform_update(self, serializer):
        user = self.request.user
        instance = serializer.instance
        is_admin = getattr(user, 'is_superuser', False) or is_leadership_role(user)
        is_owner = (
            (hasattr(instance, 'account') and instance.account.user_id == user.id)
            or instance.employee_id.lower() == user.username.lower()
            or (user.email and instance.email.lower() == user.email.lower())
        )

        if not is_admin and not is_owner:
            raise PermissionDenied("You can only edit your own faculty profile.")

        if not is_admin:
            serializer.validated_data.pop('employee_id', None)
            serializer.validated_data.pop('department', None)
            serializer.validated_data.pop('position', None)
            serializer.validated_data.pop('can_teach', None)
            serializer.validated_data.pop('is_active', None)

        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        include_all = str(request.query_params.get('include_all', '')).lower() in ('true', '1')
        qs = self.get_queryset()
        if not include_all:
            qs = qs.filter(can_teach=True)
        serializer = FacultyDropdownSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reset-device')
    def reset_device(self, request, pk=None):
        faculty = self.get_object()
        user = request.user
        is_admin = getattr(user, 'is_superuser', False) or is_leadership_role(user)
        is_owner = (
            user.is_authenticated and (
                (hasattr(faculty, 'account') and faculty.account.user_id == user.id)
                or faculty.employee_id.lower() == user.username.lower()
            )
        )

        if not is_admin and not is_owner:
            raise PermissionDenied("You do not have permission to reset this device binding.")

        for field_name in ['device_uuid', 'device_id', 'bound_device_uuid', 'hardware_uuid', 'bound_device_id']:
            if hasattr(faculty, field_name):
                setattr(faculty, field_name, None)

        faculty.save()
        return Response({
            'success': True,
            'message': f"Device binding for {faculty.full_name} has been reset successfully."
        }, status=status.HTTP_200_OK)


FacultyViewSet = FacultyProfileViewSet


# ==============================================================================
# 5. HARDWARE KIOSKS, GATE PASSES, & SMS (WITH COMPLETE METRIC ALIASES)
# ==============================================================================

class IoTKioskViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('terminal_name')
    serializer_class = IoTKioskSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    search_fields = ['kiosk_code', 'terminal_name', 'location']

    def get_object(self):
        """Supports fetching kiosks either by numerical ID or by unique kiosk_code."""
        lookup_val = self.kwargs.get(self.lookup_url_kwarg or self.lookup_field or 'pk')
        qs = self.filter_queryset(self.get_queryset())
        obj = None
        if str(lookup_val).isdigit():
            obj = qs.filter(id=int(lookup_val)).first()
        if not obj:
            obj = qs.filter(kiosk_code=lookup_val).first()
        if not obj:
            raise Http404(f"Kiosk '{lookup_val}' not found.")
        self.check_object_permissions(self.request, obj)
        return obj

    def perform_create(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save(is_active=True)

    def perform_update(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


class GatePassViewSet(viewsets.ModelViewSet):
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['pass_number', 'student__last_name', 'student__lrn', 'faculty__last_name', 'reason']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = GatePass.objects.select_related('student', 'faculty', 'issued_by').order_by('-valid_from')

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            student_ids = get_teacher_student_ids(faculty)
            qs = qs.filter(Q(issued_by=faculty) | Q(student_id__in=student_ids))

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status=status_param.upper())

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        role = get_user_role(user)
        if not (user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'FACULTY', 'DEPT_HEAD')):
            raise PermissionDenied("Only authorized staff or faculty can issue gate passes.")

        faculty = resolve_faculty_for_user(user)
        pass_num = serializer.validated_data.get('pass_number') or f"GP-{timezone.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
        serializer.save(
            pass_number=pass_num,
            issued_by=serializer.validated_data.get('issued_by') or faculty
        )

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        check_academic_admin_permission(self.request.user)
        instance.delete()


class SmsOutboxViewSet(viewsets.ModelViewSet):
    queryset = SmsOutbox.objects.all().order_by('-created_at')
    serializer_class = SmsOutboxSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        """Returns all status counts and UI card aliases for the SMS dashboard."""
        today = timezone.localdate()
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        sent_count = SmsOutbox.objects.filter(
            status='SENT',
            created_at__gte=today_start,
            created_at__lte=today_end
        ).count()
        
        pending_count = SmsOutbox.objects.filter(status='PENDING').count()
        
        failed_count = SmsOutbox.objects.filter(
            status='FAILED',
            created_at__gte=today_start,
            created_at__lte=today_end
        ).count()

        return Response({
            # Sent counts
            'sent_today': sent_count,
            'sent': sent_count,
            'sent_count': sent_count,
            'delivered': sent_count,

            # Pending / Queue counts (populates Card and "In Queue ()" Tab)
            'pending_total': pending_count,
            'pending_queue': pending_count,
            'pending': pending_count,
            'pending_count': pending_count,
            'in_queue': pending_count,
            'queue': pending_count,
            'queue_count': pending_count,

            # Failed counts (populates Card and "Failed ()" Tab)
            'failed_today': failed_count,
            'failed_dispatches': failed_count,
            'failed': failed_count,
            'failed_count': failed_count,
            'failed_total': failed_count,

            # Total
            'total': SmsOutbox.objects.count(),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='broadcast')
    def broadcast(self, request):
        """Enqueues broadcast messages using exact SmsOutbox column definitions."""
        check_academic_admin_permission(request.user)

        message = str(request.data.get('message') or request.data.get('message_body') or '').strip()
        if not message:
            raise ValidationError({'message': 'Broadcast message cannot be empty.'})

        target = str(request.data.get('target', 'ALL')).upper()
        section_id = request.data.get('section_id')
        phone_numbers = set()

        if target in ('ALL', 'STUDENTS', 'PARENTS', 'SECTION'):
            student_qs = Student.objects.filter(is_active=True).exclude(
                Q(parent_contact__isnull=True) | Q(parent_contact='')
            )
            if section_id:
                student_qs = student_qs.filter(enrollments__section_id=section_id, enrollments__status='ENROLLED')

            for contact in student_qs.values_list('parent_contact', flat=True):
                cleaned = str(contact).strip().replace('-', '').replace(' ', '')
                if cleaned:
                    phone_numbers.add(cleaned)

        if target in ('ALL', 'FACULTY', 'STAFF'):
            faculty_contacts = FacultyProfile.objects.filter(is_active=True).exclude(
                Q(contact_number__isnull=True) | Q(contact_number='')
            ).values_list('contact_number', flat=True)

            for contact in faculty_contacts:
                cleaned = str(contact).strip().replace('-', '').replace(' ', '')
                if cleaned:
                    phone_numbers.add(cleaned)

        new_records = [
            SmsOutbox(
                recipient_number=phone,
                message_body=message,
                trigger_event='EMERGENCY',
                category='EMERGENCY',
                priority='LOW',
                status='PENDING',
            )
            for phone in phone_numbers
        ]

        if new_records:
            SmsOutbox.objects.bulk_create(new_records, batch_size=500)

        return Response({
            'success': True,
            'queued_count': len(new_records),
            'message': f"Broadcast queued successfully for {len(new_records)} recipient(s)."
        }, status=status.HTTP_201_CREATED)


# ==============================================================================
# 6. USER MANAGEMENT VIEWSET (SELF-MANAGEMENT & ANTI-PRIVILEGE ESCALATION)
# ==============================================================================

class UserManagementViewSet(viewsets.ModelViewSet):
    serializer_class = UserManagementSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email']

    def get_queryset(self):
        user = self.request.user
        qs = User.objects.select_related('profile', 'profile__faculty').order_by('username')
        if getattr(user, 'is_superuser', False) or get_user_role(user) in ('ADMIN', 'SUPERADMIN'):
            return qs
        return qs.filter(id=user.id)

    def perform_create(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        target_user = serializer.instance
        is_admin = getattr(user, 'is_superuser', False) or get_user_role(user) in ('ADMIN', 'SUPERADMIN')

        if not is_admin and target_user.id != user.id:
            raise PermissionDenied("You can only update your own account.")

        if not is_admin:
            serializer.validated_data.pop('role', None)
            serializer.validated_data.pop('is_staff', None)
            serializer.validated_data.pop('is_superuser', None)
            serializer.validated_data.pop('is_active', None)
            serializer.validated_data.pop('is_teaching', None)

        serializer.save()
        cache.delete(f"user_me_data_{target_user.id}")

    def perform_destroy(self, instance):
        user = self.request.user
        is_admin = getattr(user, 'is_superuser', False) or get_user_role(user) in ('ADMIN', 'SUPERADMIN')

        if not is_admin and instance.id != user.id:
            raise PermissionDenied("You can only delete your own profile.")

        if instance.is_superuser and User.objects.filter(is_superuser=True, is_active=True).count() <= 1:
            raise ValidationError("You cannot delete the only active system administrator account.")

        cache.delete(f"user_me_data_{instance.id}")
        instance.delete()

    @action(detail=False, methods=['get', 'put', 'patch', 'delete'], url_path='me')
    def me(self, request):
        user = request.user
        if request.method == 'GET':
            cache_key = f"user_me_data_{user.id}"
            cached_profile = cache.get(cache_key)
            if cached_profile:
                return Response(cached_profile, status=status.HTTP_200_OK)

            data = self.get_serializer(user).data
            cache.set(cache_key, data, timeout=10)
            return Response(data, status=status.HTTP_200_OK)

        cache.delete(f"user_me_data_{user.id}")

        if request.method in ['PUT', 'PATCH']:
            serializer = self.get_serializer(user, data=request.data, partial=(request.method == 'PATCH'))
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)

        if request.method == 'DELETE':
            self.perform_destroy(user)
            return Response({'success': True, 'message': 'Account deleted successfully.'}, status=status.HTTP_200_OK)


# ==============================================================================
# 7. ENROLLMENT VIEWSET (FULL CRUD)
# ==============================================================================

class EnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = EnrollmentSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['student__first_name', 'student__last_name', 'student__lrn', 'section__name']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = Enrollment.objects.select_related(
            'student', 'section', 'section__grade_level', 'academic_year'
        ).filter(student__is_active=True).order_by('section__name', 'student__last_name')

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                sec_ids = get_teacher_section_ids(faculty)
                return qs.filter(section_id__in=sec_ids)
            return Enrollment.objects.none()
        return qs

    def perform_create(self, serializer):
        check_student_manager_permission(self.request.user)
        ay = serializer.validated_data.get('academic_year') or AcademicYear.objects.filter(is_active=True).first()
        serializer.save(academic_year=ay)

    def perform_update(self, serializer):
        check_student_manager_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()