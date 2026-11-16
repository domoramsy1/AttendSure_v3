"""
AttendSure V3 - Academic, People & Notification CRUD ViewSets
File: backend/apps/api/views/viewsets.py
"""

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.academics.models import (
    AppNotification,
    AuditLog,
    FacultyProfile,
    GradeLevel,
    Room,
    Schedule,
    Section,
    Student,
    Subject,
)
from apps.api.serializers import (
    AppNotificationSerializer,
    FacultyDropdownSerializer,
    FacultyProfileSerializer,
    GradeLevelSerializer,
    RoomSerializer,
    ScheduleSerializer,
    SectionSerializer,
    StudentSerializer,
    SubjectSerializer,
    UserManagementSerializer,
)
from .common import (
    IsAcademicManagerPermission,
    IsSystemAdminRole,
    format_full_student_name,
    get_client_ip,
    get_faculty_section_ids,
    get_faculty_student_ids,
    get_user_role,
    is_leadership_role,
    resolve_faculty_for_user,
)

User = get_user_model()


class SafeFlexiblePagination(PageNumberPagination):
    """Supports ?page_size=25 or ?page_size=ALL safely capped at 1000 rows."""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def get_page_size(self, request):
        raw_size = str(request.query_params.get(self.page_size_query_param, '')).strip().upper()
        if raw_size == 'ALL':
            return self.max_page_size
        return super().get_page_size(request)


class BaseManagedViewSet(viewsets.ModelViewSet):
    """Shared security, pagination, and audit logging for academic CRUD endpoints."""
    permission_classes = [permissions.IsAuthenticated, IsAcademicManagerPermission]
    pagination_class = SafeFlexiblePagination

    def _record_audit(self, instance, action_name: str):
        try:
            AuditLog.objects.create(
                table_name=instance._meta.db_table,
                record_id=instance.pk or 0,
                action=action_name,
                performed_by=self.request.user if self.request.user.is_authenticated else None,
                client_ip=get_client_ip(self.request),
                user_agent=str(self.request.META.get('HTTP_USER_AGENT', ''))[:255],
            )
        except Exception:
            pass

    def perform_create(self, serializer):
        instance = serializer.save()
        self._record_audit(instance, 'CREATE')

    def perform_update(self, serializer):
        instance = serializer.save()
        self._record_audit(instance, 'UPDATE')

    def perform_destroy(self, instance):
        self._record_audit(instance, 'DELETE')
        instance.delete()


class RoomViewSet(BaseManagedViewSet):
    queryset = Room.objects.all().order_by('name')
    serializer_class = RoomSerializer


class GradeLevelViewSet(BaseManagedViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    serializer_class = GradeLevelSerializer


class SubjectViewSet(BaseManagedViewSet):
    queryset = Subject.objects.select_related('grade_level').all().order_by('code')
    serializer_class = SubjectSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        grade_id = self.request.query_params.get('grade_level')
        if grade_id and str(grade_id).isdigit():
            qs = qs.filter(grade_level_id=int(grade_id))
        return qs


class SectionViewSet(BaseManagedViewSet):
    queryset = Section.objects.select_related(
        'grade_level', 'academic_year', 'adviser', 'room'
    ).all().order_by('grade_level__level_order', 'name')
    serializer_class = SectionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if faculty:
                qs = qs.filter(id__in=get_faculty_section_ids(faculty))
            else:
                qs = qs.none()
        return qs


class ScheduleViewSet(BaseManagedViewSet):
    queryset = Schedule.objects.select_related(
        'section', 'section__grade_level', 'subject', 'faculty', 'room'
    ).prefetch_related('days').all().order_by('start_time')
    serializer_class = ScheduleSerializer

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        section_id = self.request.query_params.get('section_id') or self.request.query_params.get('section')
        if section_id and str(section_id).isdigit():
            qs = qs.filter(section_id=int(section_id))

        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if faculty:
                qs = qs.filter(Q(faculty=faculty) | Q(section_id__in=get_faculty_section_ids(faculty))).distinct()
            else:
                qs = qs.none()
        return qs


class StudentViewSet(BaseManagedViewSet):
    queryset = Student.objects.prefetch_related('enrollments__section', 'enrollments__academic_year').all().order_by('last_name', 'first_name')
    serializer_class = StudentSerializer

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = super().get_queryset()

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(lrn__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search)
            )

        section_id = self.request.query_params.get('section_id') or self.request.query_params.get('section')
        if section_id and str(section_id).isdigit():
            qs = qs.filter(enrollments__section_id=int(section_id), enrollments__status='ENROLLED')

        if role == 'PARENT':
            return qs.filter(parent_user=user, is_active=True)

        if not (user.is_superuser or is_leadership_role(user)):
            faculty = resolve_faculty_for_user(user)
            if faculty:
                qs = qs.filter(id__in=get_faculty_student_ids(faculty))
            else:
                qs = qs.none()

        return qs.distinct()

    @action(detail=False, methods=['get'], url_path='metrics')
    def metrics(self, request):
        qs = self.get_queryset().filter(is_active=True)
        counts = qs.aggregate(
            total=Count('id', distinct=True),
            male=Count('id', filter=Q(sex='Male'), distinct=True),
            female=Count('id', filter=Q(sex='Female'), distinct=True),
            enrolled=Count('id', filter=Q(enrollments__status='ENROLLED'), distinct=True),
        )
        total_count = counts['total'] or 0
        enrolled_count = counts['enrolled'] or 0
        return Response({
            'total_students': total_count,
            'total': total_count,
            'male': counts['male'] or 0,
            'female': counts['female'] or 0,
            'enrolled': enrolled_count,
            'unassigned': max(0, total_count - enrolled_count),
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='dropdown')
    def dropdown(self, request):
        qs = self.get_queryset().filter(is_active=True)[:500]
        items = [
            {
                'id': st.id,
                'lrn': st.lrn,
                'first_name': st.first_name,
                'last_name': st.last_name,
                'full_name': format_full_student_name(st),
                'sex': st.sex,
            }
            for st in qs
        ]
        return Response(items, status=status.HTTP_200_OK)


class FacultyProfileViewSet(BaseManagedViewSet):
    queryset = FacultyProfile.objects.select_related('account').all().order_by('last_name', 'first_name')
    serializer_class = FacultyProfileSerializer

    @action(detail=False, methods=['get'], url_path='dropdown')
    def dropdown(self, request):
        include_all = str(request.query_params.get('include_all', '')).lower() in ('1', 'true', 'yes')
        qs = self.get_queryset()
        if not include_all:
            qs = qs.filter(is_active=True)
        serializer = FacultyDropdownSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserManagementViewSet(BaseManagedViewSet):
    queryset = User.objects.select_related('profile', 'profile__faculty').all().order_by('username')
    serializer_class = UserManagementSerializer
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminRole]


class AppNotificationViewSet(viewsets.ModelViewSet):
    """Allows parents and faculty to read and manage their mobile app notifications."""
    serializer_class = AppNotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            AppNotification.objects.select_related('recipient', 'student')
            .filter(recipient=self.request.user)
            .order_by('-created_at')
        )

    def perform_create(self, serializer):
        user = self.request.user
        recipient = serializer.validated_data.get('recipient')
        student = serializer.validated_data.get('student')

        if recipient is None:
            if student and getattr(student, 'parent_user', None):
                recipient = student.parent_user
            else:
                recipient = user
        elif recipient != user and not (user.is_superuser or is_leadership_role(user)):
            if not (student and getattr(student, 'parent_user_id', None) == recipient.id):
                raise permissions.PermissionDenied('You can only send notifications to your own account or linked parents.')

        serializer.save(recipient=recipient)
