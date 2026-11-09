"""
AttendSure V3 - Complete Core API ViewSets (No Mock Data, Full CRUD)
File: backend/apps/api/views/viewsets.py
"""

import re
import secrets
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, Prefetch, Count
from django.core.cache import cache
from django.http import Http404
from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.throttling import UserRateThrottle

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
    is_regular_faculty,
    is_leadership_role,
)
from .common import (
    resolve_faculty_for_user,
    get_faculty_student_ids,
    get_faculty_section_ids,
)

User = get_user_model()


def sanitize_ph_phone(number_str: str) -> str:
    """Standardizes numbers to 11-digit Philippine mobile format (09XXXXXXXXX)."""
    if not number_str:
        return ''
    cleaned = re.sub(r'[^\d+]', '', str(number_str)).strip()
    if cleaned.startswith('+63'):
        cleaned = '0' + cleaned[3:]
    elif cleaned.startswith('63') and len(cleaned) == 12:
        cleaned = '0' + cleaned[2:]
    return cleaned


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
# SECURITY ROLE CHECKERS
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
    queryset = Room.objects.all().order_by('name')
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

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        rooms = self.get_queryset().values('id', 'name', 'building')
        return Response(list(rooms), status=status.HTTP_200_OK)


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

        if is_regular_faculty(role) and not user.is_superuser:
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
# 2. SCHEDULE VIEWSET
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
        if is_regular_faculty(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                sec_ids = get_faculty_section_ids(faculty)
                qs = qs.filter(Q(faculty=faculty) | Q(section_id__in=sec_ids))
            else:
                return Schedule.objects.none()
        return qs

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        qs = self.get_queryset()
        return Response({
            'total_periods': qs.count(),
            'scheduled_sections': qs.values('section').distinct().count(),
            'assigned_faculty': qs.exclude(faculty__isnull=True).values('faculty').distinct().count(),
            'occupied_rooms': qs.exclude(Q(room__isnull=True) & Q(room_number='')).values('room', 'room_number').distinct().count(),
        }, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


# ==============================================================================
# 3. STUDENT & ENROLLMENT VIEWSETS
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

        if is_regular_faculty(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            student_ids = get_faculty_student_ids(faculty)
            qs = qs.filter(id__in=student_ids)

        section_id = self.request.query_params.get('section_id') or self.request.query_params.get('section')
        if section_id:
            qs = qs.filter(enrollments__section_id=section_id, enrollments__status='ENROLLED')

        return qs.distinct()

    def perform_create(self, serializer):
        check_student_manager_permission(self.request.user)
        save_kwargs = {'is_active': True}
        if hasattr(Student, 'created_by'):
            save_kwargs['created_by'] = self.request.user
        if hasattr(Student, 'updated_by'):
            save_kwargs['updated_by'] = self.request.user
        serializer.save(**save_kwargs)

    def perform_update(self, serializer):
        check_student_manager_permission(self.request.user)
        save_kwargs = {}
        if hasattr(Student, 'updated_by'):
            save_kwargs['updated_by'] = self.request.user
        serializer.save(**save_kwargs)

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

        if is_regular_faculty(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                sec_ids = get_faculty_section_ids(faculty)
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


# ==============================================================================
# 4. FACULTY PROFILE VIEWSET
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
            'message': f"Device binding for {faculty.full_name} has been reset."
        }, status=status.HTTP_200_OK)


# ==============================================================================
# 5. HARDWARE KIOSKS, GATE PASSES, & SMS OUTBOX
# ==============================================================================

class IoTKioskViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('terminal_name')
    serializer_class = IoTKioskSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    search_fields = ['kiosk_code', 'terminal_name', 'location']

    def get_object(self):
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
    """
    Handles Gate Pass operations safely without 400 validation failures.
    Auto-populates issued_by, valid_from, and pass_number if omitted.
    """
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['pass_number', 'student__last_name', 'student__lrn', 'faculty__last_name', 'reason']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = GatePass.objects.select_related('student', 'faculty', 'issued_by').order_by('-valid_from')

        if is_regular_faculty(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            student_ids = get_faculty_student_ids(faculty)
            qs = qs.filter(Q(issued_by=faculty) | Q(student_id__in=student_ids))

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status=status_param.upper())

        return qs

    def perform_create(self, serializer):
        user = self.request.user
        role = get_user_role(user)
        if not (user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'FACULTY', 'DEPT_HEAD', 'FACULTY_ADMIN')):
            raise PermissionDenied("Only authorized staff or faculty can issue gate passes.")

        faculty = resolve_faculty_for_user(user)
        pass_num = f"GP-{timezone.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
        
        now = timezone.now()
        valid_from = serializer.validated_data.get('valid_from') or now
        valid_to = serializer.validated_data.get('valid_to') or (valid_from + timedelta(hours=8))

        serializer.save(
            pass_number=pass_num,
            issued_by=faculty,
            faculty=serializer.validated_data.get('faculty') or faculty,
            valid_from=valid_from,
            valid_to=valid_to,
            status='ACTIVE'
        )

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        check_academic_admin_permission(self.request.user)
        instance.delete()


class SmsOutboxViewSet(viewsets.ModelViewSet):
    """
    Full SMS Outbox CRUD and Hardware Actions.
    Guarantees that clear-pending, delete-delivered, retry, and metrics never 404.
    """
    queryset = SmsOutbox.objects.all().order_by('-created_at')
    serializer_class = SmsOutboxSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    throttle_classes = [UserRateThrottle]

    def get_queryset(self):
        queryset = SmsOutbox.objects.all().order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() in ('PENDING', 'SENT', 'FAILED'):
            queryset = queryset.filter(status=status_param.upper())

        category_param = self.request.query_params.get('category')
        if category_param and category_param != 'ALL':
            queryset = queryset.filter(
                Q(category=category_param) | Q(trigger_event=category_param)
            )

        search_query = self.request.query_params.get('search')
        if search_query:
            search_query = search_query.strip()
            queryset = queryset.filter(
                Q(recipient_name__icontains=search_query) |
                Q(recipient_number__icontains=search_query) |
                Q(message_body__icontains=search_query)
            )

        return queryset

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        raw_number = data.get('recipient_number', '')
        clean_number = sanitize_ph_phone(raw_number)

        if not clean_number or len(clean_number) < 11:
            return Response(
                {"recipient_number": ["Enter a valid Philippine mobile number (09XXXXXXXXX)."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        data['recipient_number'] = clean_number
        data['status'] = 'PENDING'
        data['message_body'] = data.get('message_body') or data.get('message', '')

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        cache.delete("sms_outbox_metrics_summary")

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        cache.delete("sms_outbox_metrics_summary")
        return response

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        cache.delete("sms_outbox_metrics_summary")
        return response

    @action(detail=False, methods=['get'], url_path='metrics')
    def metrics(self, request):
        cache_key = "sms_outbox_metrics_summary"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return Response(cached_result, status=status.HTTP_200_OK)

        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        data = SmsOutbox.objects.aggregate(
            sent_today=Count('id', filter=Q(status='SENT', sent_at__gte=today_start)),
            total_today=Count('id', filter=Q(created_at__gte=today_start)),
            pending=Count('id', filter=Q(status='PENDING')),
            failed=Count('id', filter=Q(status='FAILED'))
        )

        metrics_payload = {
            "total_today": data['total_today'] or 0,
            "sent_today": data['sent_today'] or 0,
            "pending": data['pending'] or 0,
            "failed": data['failed'] or 0,
            "modem_port": getattr(settings, 'GSM_MODEM_PORT', 'COM3'),
            "modem_baudrate": getattr(settings, 'GSM_MODEM_BAUDRATE', 115200),
        }

        cache.set(cache_key, metrics_payload, timeout=4)
        return Response(metrics_payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete', 'post'], url_path='clear-pending')
    def clear_pending(self, request):
        deleted_count, _ = SmsOutbox.objects.filter(status='PENDING').delete()
        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Successfully cleared {deleted_count} pending messages.",
                "deleted_count": deleted_count
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['delete', 'post'], url_path='delete-delivered')
    def delete_delivered(self, request):
        deleted_count, _ = SmsOutbox.objects.filter(status='SENT').delete()
        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Deleted {deleted_count} delivered message records.",
                "deleted_count": deleted_count
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], url_path='retry')
    def retry_single(self, request, pk=None):
        sms_obj = self.get_object()
        sms_obj.status = 'PENDING'
        sms_obj.error_message = None
        sms_obj.retry_count = 0
        sms_obj.save(update_fields=['status', 'error_message', 'retry_count'])
        cache.delete("sms_outbox_metrics_summary")
        return Response({"success": True, "message": f"Message #{sms_obj.id} re-queued."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='retry-all-failed')
    def retry_all_failed(self, request):
        updated_count = SmsOutbox.objects.filter(status='FAILED').update(
            status='PENDING',
            error_message=None,
            retry_count=0
        )
        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Successfully re-queued {updated_count} failed messages.",
                "updated_count": updated_count
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'], url_path='broadcast')
    def broadcast_announcement(self, request):
        data = request.data
        audience = data.get('audience') or data.get('recipient_group', 'ALL_PARENTS')
        message_body = (data.get('message_body') or data.get('message', '')).strip()
        priority = data.get('priority', 'HIGH')

        if not message_body:
            return Response({"error": "Message body cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        recipients = []

        if audience == 'ALL_PARENTS':
            for s in Student.objects.filter(is_active=True):
                phone = getattr(s, 'parent_contact', None) or getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone)
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {s.full_name}"
                    recipients.append((name, clean))

        elif audience == 'ALL_FACULTY':
            for f in FacultyProfile.objects.filter(is_active=True):
                phone = getattr(f, 'contact_number', None) or getattr(f, 'phone_number', None)
                clean = sanitize_ph_phone(phone)
                if clean:
                    recipients.append((f.full_name, clean))

        elif audience == 'BOTH_PARENTS_AND_FACULTY':
            for s in Student.objects.filter(is_active=True):
                phone = getattr(s, 'parent_contact', None) or getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone)
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {s.full_name}"
                    recipients.append((name, clean))
            for f in FacultyProfile.objects.filter(is_active=True):
                phone = getattr(f, 'contact_number', None) or getattr(f, 'phone_number', None)
                clean = sanitize_ph_phone(phone)
                if clean:
                    recipients.append((f.full_name, clean))

        elif audience == 'BY_SECTION':
            section_id = data.get('section_id')
            for s in Student.objects.filter(is_active=True, enrollments__section_id=section_id, enrollments__status='ENROLLED'):
                phone = getattr(s, 'parent_contact', None) or getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone)
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {s.full_name}"
                    recipients.append((name, clean))

        unique_recipients = {}
        for name, phone in recipients:
            if phone not in unique_recipients:
                unique_recipients[phone] = name

        if not unique_recipients:
            return Response(
                {"error": "No valid phone numbers found for the selected audience."},
                status=status.HTTP_400_BAD_REQUEST
            )

        new_sms_objects = [
            SmsOutbox(
                recipient_name=name,
                recipient_number=phone,
                message_body=message_body,
                trigger_event='ANNOUNCEMENT',
                category='ANNOUNCEMENT',
                priority=priority,
                status='PENDING'
            )
            for phone, name in unique_recipients.items()
        ]

        with transaction.atomic():
            SmsOutbox.objects.bulk_create(new_sms_objects, batch_size=500)

        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Successfully queued {len(new_sms_objects)} announcement messages.",
                "count": len(new_sms_objects)
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# 6. USER MANAGEMENT VIEWSET
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