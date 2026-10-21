from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import Schedule, Student, SubjectAttendanceLog
from .common import resolve_faculty_for_user, is_leadership_role, format_full_student_name, safe_photo_url
from apps.api.serializers import ClassroomBatchScanSerializer

class FacultyClassroomRosterAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        faculty = resolve_faculty_for_user(request.user)
        today = timezone.localdate()

        if is_leadership_role(request.user):
            schedules = Schedule.objects.select_related('section', 'subject', 'faculty').all().order_by('start_time')
        elif faculty:
            schedules = Schedule.objects.select_related('section', 'subject', 'faculty').filter(Q(faculty=faculty) | Q(section__adviser=faculty)).distinct().order_by('start_time')
        else:
            return Response([], status=status.HTTP_200_OK)

        roster = []
        for sched in schedules:
            sec = sched.section
            if not sec: continue
            students = Student.objects.filter(enrollments__section=sec, is_active=True).distinct().order_by('last_name', 'first_name')
            items = [{
                'id': s.id, 'lrn': s.lrn, 'full_name': format_full_student_name(s), 'sex': s.sex,
                'photo_url': safe_photo_url(s.photo, request), 'attendance_status': 'UNSCANNED'
            } for s in students]

            roster.append({
                'schedule_id': sched.id, 'section_id': sec.id, 'section_name': sec.name,
                'subject_name': sched.subject.title if sched.subject else '', 'students': items
            })
        return Response(roster, status=status.HTTP_200_OK)

class ClassroomBatchScanAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        sched_id = serializer.validated_data['schedule_id']
        sched = Schedule.objects.filter(id=sched_id).first()
        if not sched:
            return Response({'error': 'Schedule not found.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        for item in serializer.validated_data['scans']:
            st = Student.objects.filter(Q(qr_token=item['qr_token']) | Q(rfid_uid=item['qr_token']) | Q(lrn=item['qr_token'])).first()
            if st:
                SubjectAttendanceLog.objects.update_or_create(student=st, schedule=sched, attendance_date=today, defaults={'status': item.get('status', 'PRESENT')})
        return Response({'success': True, 'message': 'Classroom attendance logged.'}, status=status.HTTP_201_CREATED)

class MyAssignedClassesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return Response([], status=status.HTTP_200_OK)

        scheds = Schedule.objects.filter(Q(faculty=faculty) | Q(section__adviser=faculty)).select_related('section', 'subject').distinct().order_by('start_time')
        classes = [{
            'schedule_id': s.id, 'section_id': s.section_id, 'section_name': s.section.name if s.section else '',
            'subject_code': s.subject.code if s.subject else '', 'start_time': str(s.start_time), 'end_time': str(s.end_time)
        } for s in scheds]
        return Response(classes, status=status.HTTP_200_OK)
