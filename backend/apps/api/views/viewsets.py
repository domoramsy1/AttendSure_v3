"""
AttendSure V3 - Complete Role-Based Core API ViewSets
File: backend/apps/api/views/viewsets.py
"""

from datetime import datetime
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import Http404
from rest_framework import viewsets, filters, permissions, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.academics.models import (
    Room,
    GradeLevel,
    Subject,
    Section,
    Schedule,
    Student,
    FacultyProfile,
    IoTKiosk,
    GatePass,
    SmsOutbox,
    AcademicYear,
    Enrollment,
)
from apps.api.serializers import (
    StudentSerializer,
    FacultyProfileSerializer,
    FacultyDropdownSerializer,
    IoTKioskSerializer,
    GatePassSerializer,
    ScheduleSerializer,
    SubjectSerializer,
    UserManagementSerializer,
    SmsOutboxSerializer,
)
from apps.common.utils import (
    get_user_role,
    is_regular_teacher,
    format_full_student_name,
)
from .common import (
    resolve_faculty_for_user,
    get_teacher_student_ids,
    get_teacher_section_ids,
)

User = get_user_model()


# ==============================================================================
# PAGINATION CONFIGURATION (SUPPORTS UP TO 1000 ITEMS)
# ==============================================================================

class AttendSurePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def get_page_size(self, request):
        if self.page_size_query_param:
            val = request.query_params.get(self.page_size_query_param)
            if val and str(val).upper() in ('ALL', 'MAX', '1000'):
                return 1000
        return super().get_page_size(request)


# ==============================================================================
# USER ROLE CHECKS (SECURITY RULES)
# ==============================================================================

def check_admin_permission(user):
    if not user or not user.is_authenticated:
        raise PermissionDenied("You must log in first.")
    if user.is_superuser:
        return True
    role = get_user_role(user)
    if role not in ('ADMIN', 'SUPERADMIN'):
        raise PermissionDenied("Only System Administrators can do this action.")
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
# 1. ROOM VIEWSET
# ==============================================================================

class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ['id', 'name', 'building', 'capacity', 'room_type', 'is_active']


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


# ==============================================================================
# 2. GRADE LEVEL VIEWSET
# ==============================================================================

class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = '__all__'


class GradeLevelViewSet(viewsets.ModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    serializer_class = GradeLevelSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

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
# 3. SUBJECT VIEWSET
# ==============================================================================

class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = '__all__'


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

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
# 4. SECTION VIEWSET
# ==============================================================================

class SectionSerializer(serializers.ModelSerializer):
    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.all(), required=False
    )
    grade_level = serializers.PrimaryKeyRelatedField(
        queryset=GradeLevel.objects.all(), required=False
    )
    grade_level_id = serializers.IntegerField(write_only=True, required=False)
    grade_level_name = serializers.CharField(source='grade_level.name', read_only=True)
    grade_level_code = serializers.CharField(source='grade_level.code', read_only=True)

    adviser = serializers.PrimaryKeyRelatedField(
        queryset=FacultyProfile.objects.all(), required=False, allow_null=True
    )
    adviser_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    adviser_name = serializers.CharField(source='adviser.full_name', read_only=True)

    room = serializers.PrimaryKeyRelatedField(
        queryset=Room.objects.all(), required=False, allow_null=True
    )
    room_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    room_name = serializers.CharField(source='room.name', read_only=True)

    class Meta:
        model = Section
        fields = [
            'id', 'name', 'code', 'grade_level', 'grade_level_id', 'grade_level_name',
            'grade_level_code', 'adviser', 'adviser_id', 'adviser_name',
            'room', 'room_id', 'room_name', 'room_number', 'capacity', 'academic_year',
        ]
        extra_kwargs = {
            'academic_year': {'required': False, 'allow_null': True},
            'capacity': {'required': False},
            'room_number': {'required': False, 'allow_blank': True},
            'code': {'required': False, 'allow_blank': True},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'grade_level_id' in data and 'grade_level' not in data:
            data['grade_level'] = data['grade_level_id']
        if 'adviser_id' in data and 'adviser' not in data:
            data['adviser'] = data['adviser_id']
        if 'room_id' in data and 'room' not in data:
            data['room'] = data['room_id']
        if not data.get('academic_year'):
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
            if ay:
                data['academic_year'] = ay.id
        return super().to_internal_value(data)

    def create(self, validated_data):
        if not validated_data.get('academic_year'):
            validated_data['academic_year'] = (
                AcademicYear.objects.filter(is_active=True).first()
                or AcademicYear.objects.first()
            )
        return super().create(validated_data)


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
            'grade_level', 'adviser', 'academic_year', 'room'
        ).order_by('grade_level__level_order', 'name')

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                return qs.filter(Q(adviser=faculty) | Q(schedules__faculty=faculty)).distinct()
            return Section.objects.none()
        return qs

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        ay = serializer.validated_data.get('academic_year')
        if not ay:
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        serializer.save(academic_year=ay)

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


# ==============================================================================
# 5. SCHEDULE VIEWSET (WITH REAL-TIME METRICS)
# ==============================================================================

class ScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

    def get_queryset(self):
        qs = Schedule.objects.select_related(
            'section', 'subject', 'faculty', 'room'
        ).order_by('start_time')
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
        qs = self.get_queryset()
        total_periods = qs.count()
        scheduled_sections = qs.values('section').distinct().count()
        assigned_teachers = qs.exclude(faculty__isnull=True).values('faculty').distinct().count()
        occupied_rooms = qs.exclude(Q(room__isnull=True) & Q(room_number='')).values('room', 'room_number').distinct().count()
        return Response({
            'total_periods': total_periods,
            'scheduled_sections': scheduled_sections,
            'assigned_teachers': assigned_teachers,
            'occupied_rooms': occupied_rooms,
        }, status=status.HTTP_200_OK)

    def _validate_conflicts(self, validated_data, instance_id=None):
        start = validated_data.get('start_time')
        end = validated_data.get('end_time')
        if start and end and start >= end:
            raise ValidationError({'time': 'Start time must be earlier than end time.'})

        faculty = validated_data.get('faculty')
        section = validated_data.get('section')
        room = validated_data.get('room')
        room_num = validated_data.get('room_number', '')

        clashes = []
        qs = Schedule.objects.select_related('faculty', 'section', 'subject')
        if instance_id:
            qs = qs.exclude(id=instance_id)

        time_overlaps = qs.filter(start_time__lt=end, end_time__gt=start)

        if faculty:
            fac_clash = time_overlaps.filter(faculty=faculty).first()
            if fac_clash:
                clashes.append(
                    f"Teacher Conflict: {faculty.full_name} already teaches "
                    f"Section {fac_clash.section.name} for {fac_clash.subject.code}."
                )

        if section:
            sec_clash = time_overlaps.filter(section=section).first()
            if sec_clash:
                clashes.append(
                    f"Section Conflict: Section {section.name} already has "
                    f"{sec_clash.subject.code} scheduled at this time."
                )

        if room:
            room_clash = time_overlaps.filter(room=room).first()
            if room_clash:
                clashes.append(f"Room Conflict: {room.name} is already booked by Section {room_clash.section.name}.")
        elif room_num:
            room_clash = time_overlaps.filter(room_number__iexact=room_num.strip()).first()
            if room_clash:
                clashes.append(f"Room Conflict: {room_num} is already booked by Section {room_clash.section.name}.")

        if clashes:
            raise ValidationError({'conflict': clashes})

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        self._validate_conflicts(serializer.validated_data)
        serializer.save()

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        self._validate_conflicts(serializer.validated_data, instance_id=serializer.instance.id)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


# ==============================================================================
# 6. STUDENT VIEWSET (WITH REAL DATABASE 1000 METRICS & PAGINATION)
# ==============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name', 'rfid_uid', 'qr_token']

    def get_queryset(self):
        user = self.request.user
        if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
            return Student.objects.all().prefetch_related('enrollments__section').order_by('last_name', 'first_name')

        role = get_user_role(user)
        if role in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR']:
            return Student.objects.all().prefetch_related('enrollments__section').order_by('last_name', 'first_name')

        faculty = resolve_faculty_for_user(user)
        if faculty:
            student_ids = get_teacher_student_ids(faculty)
            return Student.objects.filter(id__in=student_ids).prefetch_related('enrollments__section').order_by('last_name', 'first_name')

        return Student.objects.none()

    @action(detail=False, methods=['get'])
    def metrics(self, request):
        """Returns direct SQL counts for all registered students."""
        qs = self.get_queryset()
        total = qs.count()
        active = qs.filter(is_active=True).count()
        paired = qs.exclude(Q(rfid_uid__isnull=True) | Q(rfid_uid='')).count()
        sections_count = Section.objects.count()
        return Response({
            'total': total,
            'active': active,
            'paired': paired,
            'total_sections': sections_count,
        }, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        check_student_manager_permission(self.request.user)
        serializer.save(is_active=True)

    def perform_update(self, serializer):
        check_student_manager_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        qs = self.filter_queryset(self.get_queryset())
        data = [
            {
                'id': s.id,
                'lrn': s.lrn,
                'full_name': format_full_student_name(s),
                'name': format_full_student_name(s),
                'rfid_uid': s.rfid_uid or '',
                'qr_token': s.qr_token or '',
            }
            for s in qs[:200]
        ]
        return Response(data, status=status.HTTP_200_OK)


# ==============================================================================
# 7. FACULTY PROFILE VIEWSET
# ==============================================================================

class FacultyProfileViewSet(viewsets.ModelViewSet):
    queryset = FacultyProfile.objects.all().order_by('last_name', 'first_name')
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'department', 'position', 'rfid_uid']

    def perform_create(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save(is_active=True)

    def perform_update(self, serializer):
        check_academic_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        qs = self.filter_queryset(self.get_queryset())
        serializer = FacultyDropdownSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


# ==============================================================================
# 8. IOT KIOSK, GATE PASS, SMS, USERS, ACADEMIC YEARS, ENROLLMENTS
# ==============================================================================

class IoTKioskViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

    def perform_create(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


class GatePassViewSet(viewsets.ModelViewSet):
    queryset = GatePass.objects.select_related('faculty', 'student', 'issued_by').order_by('-valid_from')
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination

    def perform_create(self, serializer):
        user = self.request.user
        role = get_user_role(user)
        if not (user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'FACULTY', 'DEPT_HEAD')):
            raise PermissionDenied("Only authorized staff or faculty can issue gate passes.")

        faculty = resolve_faculty_for_user(user)
        if not serializer.validated_data.get('issued_by'):
            if not faculty:
                raise ValidationError({"issued_by": "Your user account is not linked to any faculty record."})
            serializer.save(issued_by=faculty)
        else:
            serializer.save()

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
        today = timezone.localdate()
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        sent_today = SmsOutbox.objects.filter(status='SENT', created_at__gte=today_start, created_at__lte=today_end).count()
        pending_total = SmsOutbox.objects.filter(status='PENDING').count()
        failed_today = SmsOutbox.objects.filter(status='FAILED', created_at__gte=today_start, created_at__lte=today_end).count()

        return Response({
            'sent_today': sent_today,
            'pending_total': pending_total,
            'failed_today': failed_today,
            'total_queued': pending_total,
        }, status=status.HTTP_200_OK)


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().select_related('profile', 'profile__faculty').order_by('username')
    serializer_class = UserManagementSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AttendSurePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'first_name', 'last_name', 'email']

    def perform_create(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        check_admin_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = '__all__'


class AcademicYearViewSet(viewsets.ModelViewSet):
    queryset = AcademicYear.objects.all().order_by('-start_date')
    serializer_class = AcademicYearSerializer
    permission_classes = [permissions.IsAuthenticated]

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


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    lrn = serializers.CharField(source='student.lrn', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    grade_level = serializers.CharField(source='section.grade_level.name', read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            'id', 'student', 'student_name', 'lrn', 'section', 'section_name',
            'grade_level', 'academic_year', 'enrollment_date', 'status'
        ]
        extra_kwargs = {
            'academic_year': {'required': False, 'allow_null': True},
            'status': {'required': False},
        }

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if not data.get('academic_year'):
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
            if ay:
                data['academic_year'] = ay.id
        return super().to_internal_value(data)


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
        ay = serializer.validated_data.get('academic_year')
        if not ay:
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        serializer.save(academic_year=ay)

    def perform_update(self, serializer):
        check_student_manager_permission(self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        check_admin_permission(self.request.user)
        instance.delete()