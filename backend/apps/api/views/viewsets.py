from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.academics.models import (
    Student, FacultyProfile, IoTKiosk, GatePass, Schedule, Subject, UserProfile, GradeLevel, SmsOutbox
)
from apps.api.serializers import (
    StudentSerializer, FacultyProfileSerializer, IoTKioskSerializer, GatePassSerializer,
    ScheduleSerializer, SubjectSerializer, UserManagementSerializer, SmsOutboxSerializer
)
from .common import (
    get_user_role, is_regular_teacher, resolve_faculty_for_user,
    get_teacher_student_ids, get_teacher_section_ids, IsSystemAdminRole, IsAcademicManagerPermission
)

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [IsAcademicManagerPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name', 'rfid_uid', 'qr_token']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = Student.objects.filter(is_active=True).prefetch_related('enrollments__section').order_by('last_name', 'first_name')
        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            qs = qs.filter(id__in=get_teacher_student_ids(faculty))
        return qs

class FacultyViewSet(viewsets.ModelViewSet):
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'rfid_uid']

    def get_queryset(self):
        return FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name')

class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsSystemAdminRole]

class GatePassViewSet(viewsets.ModelViewSet):
    queryset = GatePass.objects.select_related('faculty', 'student').order_by('-valid_from')
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]

class ScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleSerializer
    permission_classes = [IsAcademicManagerPermission]

    def get_queryset(self):
        qs = Schedule.objects.select_related('section', 'subject', 'faculty').order_by('start_time')
        user = self.request.user
        if is_regular_teacher(get_user_role(user)) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            qs = qs.filter(section_id__in=get_teacher_section_ids(faculty))
        return qs

class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [IsAcademicManagerPermission]

class RoomViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    def list(self, request):
        return Response([{'id': i, 'room_number': f"Room {i}"} for i in range(101, 110)], status=status.HTTP_200_OK)

class GradeLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    permission_classes = [permissions.IsAuthenticated]

class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = UserProfile.objects.select_related('user', 'faculty').all()
    serializer_class = UserManagementSerializer
    permission_classes = [IsSystemAdminRole]

class SmsOutboxViewSet(viewsets.ModelViewSet):
    queryset = SmsOutbox.objects.all().order_by('-created_at')
    serializer_class = SmsOutboxSerializer
    permission_classes = [IsSystemAdminRole]

    @action(detail=False, methods=['delete', 'post'])
    def delete_delivered(self, request):
        SmsOutbox.objects.filter(status='SENT').delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete', 'post'])
    def clear_pending(self, request):
        SmsOutbox.objects.filter(status='PENDING').delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def retry_all_failed(self, request):
        SmsOutbox.objects.filter(status='FAILED').update(status='PENDING', retry_count=0)
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def get_metrics(self, request):
        return Response({
            'total': SmsOutbox.objects.count(),
            'pending': SmsOutbox.objects.filter(status='PENDING').count(),
            'sent': SmsOutbox.objects.filter(status='SENT').count(),
            'failed': SmsOutbox.objects.filter(status='FAILED').count(),
        }, status=status.HTTP_200_OK)
